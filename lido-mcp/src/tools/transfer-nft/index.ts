import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import {
  resolveChainId,
  getClient,
  requireWallet,
  WalletRequiredError,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_transfer_withdrawal_nft",
    "Transfer a withdrawal request NFT to another address (ERC-721 transferFrom). Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      to: z.string().describe("Recipient address"),
      request_id: z.string().describe("The withdrawal request (NFT) ID to transfer"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { to: string; request_id: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const from = account.address;
        const to = args.to as `0x${string}`;
        const requestId = BigInt(args.request_id);

        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "transferFrom",
            args: [from, to, requestId],
            account,
          });

          const gasEstimate = await client.estimateGas({
            to: contracts.withdrawalQueue,
            data: (request as any).data,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            from,
            to: args.to,
            request_id: args.request_id,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Transferring withdrawal NFT #${args.request_id} from ${from} to ${args.to}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "transferFrom",
            args: [from, to, requestId],
            account,
          });

          const txHash = await walletClient.writeContract(request as any);
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          return success({
            dry_run: false,
            status: receipt.status === "success" ? "confirmed" : "reverted",
            tx_hash: txHash,
            from,
            to: args.to,
            request_id: args.request_id,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully transferred withdrawal NFT #${args.request_id} to ${args.to}. Tx: ${txHash}`
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
          `NFT transfer failed: ${extractErrorMessage(err, "Unknown error")}. Check ownership and RPC connection.`,
        );
      }
    },
  );
}
