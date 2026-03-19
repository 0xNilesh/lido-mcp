import { z } from "zod";
import { parseEther, formatEther, encodeFunctionData } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
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

const MAX_SINGLE_WITHDRAWAL = parseEther("1000");

// ---------------------------------------------------------------------------
// Extended ABI (withdrawal-queue entries not in the shared file)
// ---------------------------------------------------------------------------

const requestWithdrawalsAbi = [
  {
    name: "requestWithdrawals",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    outputs: [{ name: "requestIds", type: "uint256[]" }],
  },
  {
    name: "requestWithdrawalsWstETH",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amounts", type: "uint256[]" },
      { name: "_owner", type: "address" },
    ],
    outputs: [{ name: "requestIds", type: "uint256[]" }],
  },
  {
    name: "isPaused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "MAX_STETH_WITHDRAWAL_AMOUNT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MIN_STETH_WITHDRAWAL_AMOUNT",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const fullWithdrawalQueueAbi = [
  ...withdrawalQueueAbi,
  ...requestWithdrawalsAbi,
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a large withdrawal amount into chunks of at most MAX_SINGLE_WITHDRAWAL. */
function splitAmounts(totalAmount: bigint): bigint[] {
  const amounts: bigint[] = [];
  let remaining = totalAmount;

  while (remaining > MAX_SINGLE_WITHDRAWAL) {
    amounts.push(MAX_SINGLE_WITHDRAWAL);
    remaining -= MAX_SINGLE_WITHDRAWAL;
  }

  if (remaining > 0n) {
    amounts.push(remaining);
  }

  return amounts;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerRequestWithdrawal(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_request_withdrawal",
    "Request a withdrawal of stETH or wstETH from Lido. Splits amounts > 1000 ETH into multiple requests. Defaults to dry_run=true for safe simulation. Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      amount: z.string().describe("Amount to withdraw in ETH units (e.g. '1.5')"),
      token: z
        .enum(["stETH", "wstETH"])
        .default("stETH")
        .describe("Token to withdraw: stETH or wstETH"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate only. If false, execute the withdrawal request."),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { amount: string; token: "stETH" | "wstETH"; dry_run: boolean; chain_id?: number }) => {
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

        const isWstETH = args.token === "wstETH";
        const tokenAddress = isWstETH ? contracts.wsteth : contracts.lido;
        const tokenAbi = isWstETH ? wstethAbi : lidoAbi;
        const fnName = isWstETH ? "requestWithdrawalsWstETH" : "requestWithdrawals";

        // Check if withdrawals are paused
        const isPaused = await client.readContract({
          address: contracts.withdrawalQueue,
          abi: fullWithdrawalQueueAbi,
          functionName: "isPaused",
        });

        if (isPaused) {
          return error(
            "Withdrawal queue is currently paused. Withdrawals cannot be processed at this time. Try again later.",
          );
        }

        // Check token balance
        const tokenBalance = (await client.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [walletAddress],
        })) as bigint;

        if (tokenBalance < amountWei) {
          return error(
            `Insufficient ${args.token} balance. Have: ${formatTokenAmount(tokenBalance, args.token)}, need: ${args.amount} ${args.token}. Reduce the amount or acquire more ${args.token}.`,
          );
        }

        // Split amounts for the request
        const amounts = splitAmounts(amountWei);

        // Check current allowance
        const allowance = (await client.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "allowance",
          args: [walletAddress, contracts.withdrawalQueue],
        })) as bigint;

        const needsApproval = allowance < amountWei;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const result: Record<string, unknown> = {
            status: "simulated",
            action: "request_withdrawal",
            token: args.token,
            amount: args.amount + " " + args.token,
            split_into_requests: amounts.length,
            amounts: amounts.map((a) => formatTokenAmount(a, args.token)),
            needs_approval: needsApproval,
            current_allowance: formatTokenAmount(allowance, args.token),
            balance: formatTokenAmount(tokenBalance, args.token),
          };

          // Try to simulate the request (may fail if approval needed)
          try {
            const { result: simResult } = await client.simulateContract({
              account,
              address: contracts.withdrawalQueue,
              abi: fullWithdrawalQueueAbi,
              functionName: fnName,
              args: [amounts, walletAddress],
            });

            result.simulated_request_ids = (simResult as bigint[]).map((id: bigint) =>
              id.toString(),
            );
            result.simulation_success = true;
          } catch (simErr) {
            result.simulation_success = false;
            result.simulation_error = extractErrorMessage(simErr, "Simulation failed");
            if (needsApproval) {
              result.note = `Approval of ${args.amount} ${args.token} to the WithdrawalQueue contract is required before requesting. Set dry_run=false to execute.`;
            }
          }

          // Estimate gas costs (best-effort)
          try {
            const gasEstimate = await client.estimateGas({
              account: walletAddress,
              to: contracts.withdrawalQueue,
              data: encodeFunctionData({
                abi: fullWithdrawalQueueAbi,
                functionName: fnName,
                args: [amounts, walletAddress],
              }),
            });
            const feeData = await client.estimateFeesPerGas();
            const maxFeePerGas: bigint = feeData.maxFeePerGas ?? 0n;
            const estimatedCost = gasEstimate * maxFeePerGas;
            result.estimated_gas = gasEstimate.toString();
            result.estimated_cost_eth = formatTokenAmount(estimatedCost, "ETH");
          } catch {
            // Gas estimation may fail if approval is needed
          }

          result.summary = `Withdrawal request simulation for ${args.amount} ${args.token}. Split into ${amounts.length} request(s). ${needsApproval ? "Approval required." : "Allowance sufficient."} Set dry_run=false to execute.`;

          return success(result);
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const txResults: string[] = [];

          // Step 1: Approve if needed
          if (needsApproval) {
            const { request: approveRequest } = await client.simulateContract({
              account,
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "approve",
              args: [contracts.withdrawalQueue, amountWei],
            });

            const approveTxHash = await walletClient.writeContract(approveRequest as any);
            const approveReceipt = await client.waitForTransactionReceipt({
              hash: approveTxHash,
            });

            if (approveReceipt.status !== "success") {
              return error(
                "Approval transaction reverted. Check gas and try again.",
              );
            }

            txResults.push(`Approval tx: ${approveTxHash}`);
          }

          // Step 2: Request withdrawals
          const { request: withdrawRequest } = await client.simulateContract({
            account,
            address: contracts.withdrawalQueue,
            abi: fullWithdrawalQueueAbi,
            functionName: fnName,
            args: [amounts, walletAddress],
          });

          const withdrawTxHash = await walletClient.writeContract(withdrawRequest as any);
          const withdrawReceipt = await client.waitForTransactionReceipt({
            hash: withdrawTxHash,
          });

          if (withdrawReceipt.status !== "success") {
            return error(
              `Withdrawal request transaction reverted. Hash: ${withdrawTxHash}. Check the transaction on a block explorer for details.`,
            );
          }

          txResults.push(`Withdrawal request tx: ${withdrawTxHash}`);

          return success({
            status: "executed",
            action: "request_withdrawal",
            token: args.token,
            amount: args.amount + " " + args.token,
            split_into_requests: amounts.length,
            transactions: txResults,
            approval_needed: needsApproval,
            block_number: withdrawReceipt.blockNumber.toString(),
            summary: `Withdrawal request created for ${args.amount} ${args.token} (${amounts.length} request(s)). Use lido_get_withdrawal_status to monitor progress.`,
          });
        } finally {
          writeMutex.release();
        }
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return error(err.message);
        }
        return error(
          `Withdrawal request failed: ${extractErrorMessage(err, "Unknown error")}. Check balance, allowance, and RPC connection.`,
        );
      }
    },
  );
}
