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
    "lido_approve_nft",
    "Approve an address to transfer a specific withdrawal NFT (ERC-721 approve)",
    {
      to: z.string().describe("Address to approve for the NFT"),
      request_id: z.string().describe("The withdrawal request (NFT) ID to approve"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { to: string; request_id: string; dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);
        const to = args.to as `0x${string}`;
        const requestId = BigInt(args.request_id);

        if (args.dry_run) {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "approve",
            args: [to, requestId],
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
            approved_address: args.to,
            request_id: args.request_id,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Approving ${args.to} to transfer withdrawal NFT #${args.request_id}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        await writeMutex.acquire();
        try {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "approve",
            args: [to, requestId],
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
            approved_address: args.to,
            request_id: args.request_id,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully approved ${args.to} to transfer withdrawal NFT #${args.request_id}. Tx: ${txHash}`
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
          `NFT approval failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection and ownership.`,
        );
      }
    },
  );
}
