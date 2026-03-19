import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  requireWallet,
  WalletRequiredError,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function registerWrap(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_wrap",
    "Wrap stETH into wstETH",
    {
      amount: z.string().describe('Amount of stETH to wrap (e.g. "1.5")'),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { amount: string; dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);
        const walletAddress = account.address;

        const amountWei = parseEther(args.amount);
        if (amountWei <= 0n) {
          return error("Amount must be greater than zero. Provide a positive number.");
        }

        // Fetch stETH balance and current allowance in parallel
        const [stethBalance, currentAllowance] = await Promise.all([
          provider.publicClient.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "balanceOf",
            args: [walletAddress],
          }) as Promise<bigint>,
          provider.publicClient.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "allowance",
            args: [walletAddress, contracts.wsteth],
          }) as Promise<bigint>,
        ]);

        if (stethBalance < amountWei) {
          return error(
            `Insufficient stETH balance. Have ${formatTokenAmount(stethBalance, "stETH")}, need ${args.amount} stETH. Reduce the amount or acquire more stETH.`,
          );
        }

        const needsApproval = currentAllowance < amountWei;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const expectedWsteth = (await provider.publicClient.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getWstETHByStETH",
            args: [amountWei],
          })) as bigint;

          let simulationOk = true;
          let simulationError: string | undefined;
          if (!needsApproval) {
            try {
              await provider.publicClient.simulateContract({
                address: contracts.wsteth,
                abi: wstethAbi,
                functionName: "wrap",
                args: [amountWei],
                account,
              });
            } catch (err) {
              simulationOk = false;
              simulationError = extractErrorMessage(err, "Simulation failed");
            }
          }

          return success({
            dry_run: true,
            status: "simulation_success",
            amount_steth: args.amount,
            expected_wsteth: formatEther(expectedWsteth),
            steth_balance: formatEther(stethBalance),
            current_allowance: formatEther(currentAllowance),
            needs_approval: needsApproval,
            wrap_simulation: needsApproval
              ? "skipped (approval needed first)"
              : simulationOk
                ? "success"
                : `failed: ${simulationError}`,
            summary: needsApproval
              ? `Wrapping ${args.amount} stETH would yield ~${formatEther(expectedWsteth)} wstETH. Approval is required first (current allowance: ${formatEther(currentAllowance)} stETH). Set dry_run=false to execute.`
              : `Wrapping ${args.amount} stETH would yield ~${formatEther(expectedWsteth)} wstETH. Allowance is sufficient. Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          // Approve if needed
          let approvalTxHash: string | undefined;
          if (needsApproval) {
            const { request: approveRequest } =
              await provider.publicClient.simulateContract({
                address: contracts.lido,
                abi: lidoAbi,
                functionName: "approve",
                args: [contracts.wsteth, amountWei],
                account,
              });

            approvalTxHash = await walletClient.writeContract(approveRequest);
            await provider.publicClient.waitForTransactionReceipt({
              hash: approvalTxHash,
              confirmations: 1,
            });
          }

          // Execute wrap
          const { request: wrapRequest } =
            await provider.publicClient.simulateContract({
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "wrap",
              args: [amountWei],
              account,
            });

          const txHash = await walletClient.writeContract(wrapRequest);
          const receipt = await provider.publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          // Get expected wstETH for display
          const expectedWsteth = (await provider.publicClient.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getWstETHByStETH",
            args: [amountWei],
          })) as bigint;

          return success({
            dry_run: false,
            status: receipt.status === "success" ? "confirmed" : "reverted",
            tx_hash: txHash,
            approval_tx_hash: approvalTxHash ?? null,
            amount_steth: args.amount,
            wsteth_received: formatEther(expectedWsteth),
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully wrapped ${args.amount} stETH into ~${formatEther(expectedWsteth)} wstETH.${approvalTxHash ? ` Approval tx: ${approvalTxHash}.` : ""} Tx: ${txHash}`
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
          `Wrap failed: ${extractErrorMessage(err, "Unknown error")}. Check balance, allowance, and RPC connection.`,
        );
      }
    },
  );
}
