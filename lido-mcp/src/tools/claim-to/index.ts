import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  requireWallet,
  WalletRequiredError,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_claim_withdrawals_to",
    "Claim multiple finalized withdrawal requests and send ETH to a specified recipient address",
    {
      request_ids: z.array(z.string()).describe("Array of withdrawal request IDs to claim"),
      hints: z.array(z.string()).describe("Array of checkpoint hints (use findCheckpointHints to get these)"),
      recipient: z.string().describe("Address to receive the claimed ETH"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { request_ids: string[]; hints: string[]; recipient: string; dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);
        const requestIds = args.request_ids.map((id) => BigInt(id));
        const hints = args.hints.map((h) => BigInt(h));
        const recipient = args.recipient as `0x${string}`;

        if (args.dry_run) {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "claimWithdrawalsTo",
            args: [requestIds, hints, recipient],
            account,
          });

          const gasEstimate = await provider.publicClient.estimateGas({
            to: contracts.withdrawalQueue,
            data: request.data,
            account,
          });

          const gasPrice = await provider.publicClient.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            request_ids: args.request_ids,
            recipient: args.recipient,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Claiming ${args.request_ids.length} withdrawal(s) to ${args.recipient}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        await writeMutex.acquire();
        try {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "claimWithdrawalsTo",
            args: [requestIds, hints, recipient],
            account,
          });

          const txHash = await walletClient.writeContract(request);
          const receipt = await provider.publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          return success({
            dry_run: false,
            status: receipt.status === "success" ? "confirmed" : "reverted",
            tx_hash: txHash,
            request_ids: args.request_ids,
            recipient: args.recipient,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully claimed ${args.request_ids.length} withdrawal(s) to ${args.recipient}. Tx: ${txHash}`
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
          `Claim withdrawals failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection and that requests are finalized.`,
        );
      }
    },
  );
}
