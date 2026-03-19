import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { lidoAbi } from "../../abis/lido.js";
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
    "lido_increase_allowance",
    "Increase the stETH allowance for a spender by a given amount (safer than approve for incremental increases)",
    {
      spender: z.string().describe("Spender address"),
      amount: z.string().describe('Amount to increase allowance by (e.g. "1.5")'),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { spender: string; amount: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const spender = args.spender as `0x${string}`;
        const amountWei = parseEther(args.amount);

        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "increaseAllowance",
            args: [spender, amountWei],
            account,
          });

          const gasEstimate = await client.estimateGas({
            to: contracts.lido,
            data: (request as any).data,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            spender: args.spender,
            increase_amount: args.amount,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Increasing stETH allowance for ${args.spender} by ${args.amount}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "increaseAllowance",
            args: [spender, amountWei],
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
            spender: args.spender,
            increase_amount: args.amount,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully increased stETH allowance for ${args.spender} by ${args.amount}. Tx: ${txHash}`
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
          `Increase allowance failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );
}
