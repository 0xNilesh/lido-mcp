import { z } from "zod";
import { formatEther, encodeFunctionData } from "viem";
import { success, error } from "../../../utils/format.js";
import { writeMutex } from "../../../utils/mutex.js";
import { withdrawalQueueAbi } from "../../../abis/withdrawal-queue.js";
import { getContracts } from "../../../contracts.js";
import {
  resolveChainId,
  getClient,
  requireWallet,
  WalletRequiredError,
  formatTokenAmount,
  extractErrorMessage,
} from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// Extended ABI (withdrawal-queue entries not in the shared file)
// ---------------------------------------------------------------------------

const claimWithdrawalsAbi = [
  {
    name: "claimWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_hints", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const fullWithdrawalQueueAbi = [
  ...withdrawalQueueAbi,
  ...claimWithdrawalsAbi,
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_claim_withdrawal",
    "Claim finalized withdrawal requests from Lido. ETH is sent to the owner. Defaults to dry_run=true. Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      request_ids: z
        .array(z.string())
        .describe("Array of withdrawal request IDs to claim (as strings)"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate the claim. If false, execute it."),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { request_ids: string[]; dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const walletAddress = account.address;

        if (args.request_ids.length === 0) {
          return error("No request IDs provided. Supply at least one withdrawal request ID.");
        }

        const requestIds = args.request_ids.map((id) => BigInt(id));

        // Check withdrawal statuses
        const statuses = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: fullWithdrawalQueueAbi,
          functionName: "getWithdrawalStatus",
          args: [requestIds],
        })) as Array<{
          amountOfStETH: bigint;
          amountOfShares: bigint;
          owner: string;
          timestamp: bigint;
          isFinalized: boolean;
          isClaimed: boolean;
        }>;

        // Validate statuses
        const issues: string[] = [];
        for (let i = 0; i < statuses.length; i++) {
          const s = statuses[i];
          const rid = requestIds[i];
          if (!s || rid === undefined) continue;
          if (s.isClaimed) {
            issues.push(`Request ${rid}: already claimed`);
          } else if (!s.isFinalized) {
            issues.push(`Request ${rid}: not yet finalized`);
          } else if (s.owner.toLowerCase() !== walletAddress.toLowerCase()) {
            issues.push(`Request ${rid}: owned by ${s.owner}, not ${walletAddress}`);
          }
        }

        if (issues.length > 0) {
          return error(
            `Cannot claim the following requests:\n${issues.join("\n")}\nFix the issues above and try again.`,
          );
        }

        // Get checkpoint hints
        const lastCheckpointIndex = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: fullWithdrawalQueueAbi,
          functionName: "getLastCheckpointIndex",
        })) as bigint;

        const hints = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: fullWithdrawalQueueAbi,
          functionName: "findCheckpointHints",
          args: [requestIds, 1n, lastCheckpointIndex],
        })) as bigint[];

        // Get claimable ETH amounts
        const claimableAmounts = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: fullWithdrawalQueueAbi,
          functionName: "getClaimableEther",
          args: [requestIds, hints],
        })) as bigint[];

        const totalClaimable = claimableAmounts.reduce((sum, a) => sum + a, 0n);

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const result: Record<string, unknown> = {
            status: "simulated",
            action: "claim_withdrawal",
            request_ids: requestIds.map((id) => id.toString()),
            claimable_amounts: claimableAmounts.map((a) => formatTokenAmount(a, "ETH")),
            total_claimable: formatTokenAmount(totalClaimable, "ETH"),
          };

          try {
            await client.simulateContract({
              account,
              address: contracts.withdrawalQueue,
              abi: fullWithdrawalQueueAbi,
              functionName: "claimWithdrawals",
              args: [requestIds, hints],
            });

            const gasEstimate = await client.estimateGas({
              account: walletAddress,
              to: contracts.withdrawalQueue,
              data: encodeFunctionData({
                abi: fullWithdrawalQueueAbi,
                functionName: "claimWithdrawals",
                args: [requestIds, hints],
              }),
            });
            const feeData = await client.estimateFeesPerGas();
            const maxFeePerGas: bigint = feeData.maxFeePerGas ?? 0n;
            const estimatedCost = gasEstimate * maxFeePerGas;

            result.simulation_success = true;
            result.estimated_gas = gasEstimate.toString();
            result.estimated_cost_eth = formatTokenAmount(estimatedCost, "ETH");
          } catch (simErr) {
            result.simulation_success = false;
            result.simulation_error = extractErrorMessage(simErr, "Simulation failed");
          }

          result.summary = `Claim simulation for ${requestIds.length} request(s). Total claimable: ${formatTokenAmount(totalClaimable, "ETH")}. Set dry_run=false to execute.`;

          return success(result);
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          // Get ETH balance before claim to report delta
          const ethBefore = (await client.getBalance({
            address: walletAddress,
          })) as bigint;

          const { request } = await client.simulateContract({
            account,
            address: contracts.withdrawalQueue,
            abi: fullWithdrawalQueueAbi,
            functionName: "claimWithdrawals",
            args: [requestIds, hints],
          });

          const txHash = await walletClient.writeContract(request as any);
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
          });

          if (receipt.status !== "success") {
            return error(
              `Claim transaction reverted. Hash: ${txHash}. Check the transaction on a block explorer for details.`,
            );
          }

          const ethAfter = (await client.getBalance({
            address: walletAddress,
          })) as bigint;
          const ethReceived = ethAfter - ethBefore;

          return success({
            status: "executed",
            action: "claim_withdrawal",
            transaction_hash: txHash,
            block_number: receipt.blockNumber.toString(),
            gas_used: receipt.gasUsed.toString(),
            request_ids: requestIds.map((id) => id.toString()),
            claimed_amounts: claimableAmounts.map((a) => formatTokenAmount(a, "ETH")),
            total_claimed: formatTokenAmount(totalClaimable, "ETH"),
            net_eth_received: formatEther(ethReceived) + " ETH (after gas)",
            summary: `Successfully claimed ${requestIds.length} withdrawal request(s). Total: ${formatTokenAmount(totalClaimable, "ETH")}. Net received: ${formatEther(ethReceived)} ETH (after gas). Tx: ${txHash}`,
          });
        } finally {
          writeMutex.release();
        }
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return error(err.message);
        }
        return error(
          `Withdrawal claim failed: ${extractErrorMessage(err, "Unknown error")}. Check request IDs and RPC connection.`,
        );
      }
    },
  );
}
