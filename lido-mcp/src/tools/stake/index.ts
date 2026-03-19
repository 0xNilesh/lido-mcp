import { z } from "zod";
import { formatEther, parseEther, decodeEventLog } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { lidoAbi } from "../../abis/lido.js";
import { getContracts } from "../../contracts.js";
import {
  resolveChainId,
  getClient,
  requireWallet,
  WalletRequiredError,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_stake",
    "Stake ETH to receive stETH via Lido",
    {
      amount: z.string().describe('Amount of ETH to stake (e.g. "1.5")'),
      referral_address: z
        .string()
        .optional()
        .describe("Optional referral address"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { amount: string; referral_address?: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);

        const walletAddress = account.address;
        const amountWei = parseEther(args.amount);
        if (amountWei <= 0n) {
          return error("Amount must be greater than zero. Provide a positive number.");
        }

        const referral = (args.referral_address as `0x${string}`) ?? ZERO_ADDRESS;

        // Fetch ETH balance and current stake limit in parallel
        const [ethBalance, stakeLimit] = await Promise.all([
          client.getBalance({ address: walletAddress }),
          client.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "getCurrentStakeLimit",
          }) as Promise<bigint>,
        ]);

        if (ethBalance < amountWei) {
          return error(
            `Insufficient ETH balance. Have ${formatTokenAmount(ethBalance, "ETH")}, need ${args.amount} ETH. Reduce the amount or top up the wallet.`,
          );
        }

        if (stakeLimit < amountWei) {
          return error(
            `Amount exceeds current stake limit. Limit is ${formatTokenAmount(stakeLimit, "ETH")}, requested ${args.amount} ETH. Reduce the amount or wait for the limit to reset.`,
          );
        }

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "submit",
            args: [referral],
            value: amountWei,
            account,
          });

          const gasEstimate = BigInt(
            await client.estimateGas({
              to: contracts.lido,
              value: amountWei,
              data: (request as any).data,
              account,
            }),
          );

          const gasPrice = BigInt(await client.getGasPrice());
          const estimatedFee = gasEstimate * gasPrice;

          return success({
            dry_run: true,
            status: "simulation_success",
            amount_eth: args.amount,
            expected_steth: args.amount,
            referral,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            eth_balance: formatEther(ethBalance),
            stake_limit: formatEther(stakeLimit),
            summary: `Simulation successful. Staking ${args.amount} ETH would yield approximately ${args.amount} stETH. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "submit",
            args: [referral],
            value: amountWei,
            account,
          });

          const txHash = await walletClient.writeContract(request as any);

          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          // Parse Transfer events to find stETH received
          let stethReceived = "0";
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: lidoAbi,
                data: log.data,
                topics: log.topics,
              });
              const eventArgs = decoded.args as Record<string, unknown>;
              if (
                decoded.eventName === "Transfer" &&
                typeof eventArgs.to === "string" &&
                eventArgs.to.toLowerCase() === walletAddress.toLowerCase()
              ) {
                stethReceived = formatEther(eventArgs.value as bigint);
                break;
              }
            } catch {
              // Not a matching event, skip
            }
          }

          return success({
            dry_run: false,
            status: receipt.status === "success" ? "confirmed" : "reverted",
            tx_hash: txHash,
            amount_eth: args.amount,
            steth_received: stethReceived,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully staked ${args.amount} ETH. Received ${stethReceived} stETH. Tx: ${txHash}`
                : `Transaction reverted. Tx: ${txHash}. Check the transaction on a block explorer for details.`,
          });
        } finally {
          writeMutex.release();
        }
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return error(err.message);
        }
        return error(
          `Staking failed: ${extractErrorMessage(err, "Unknown error")}. Check balance and RPC connection.`,
        );
      }
    },
  );
}
