import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { writeMutex } from "../../../utils/mutex.js";
import { wstethAbi } from "../../../abis/wsteth.js";
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

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_unwrap",
    "Unwrap wstETH back into stETH. Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      amount: z.string().describe('Amount of wstETH to unwrap (e.g. "1.5")'),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { amount: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const walletAddress = account.address;

        const amountWei = parseEther(args.amount);
        if (amountWei <= 0n) {
          return error("Amount must be greater than zero. Provide a positive number.");
        }

        // Check wstETH balance
        const wstethBalance = (await client.readContract({
          address: contracts.wsteth,
          abi: wstethAbi,
          functionName: "balanceOf",
          args: [walletAddress],
        })) as bigint;

        if (wstethBalance < amountWei) {
          return error(
            `Insufficient wstETH balance. Have ${formatTokenAmount(wstethBalance, "wstETH")}, need ${args.amount} wstETH. Reduce the amount or acquire more wstETH.`,
          );
        }

        // Get expected stETH output
        const expectedSteth = (await client.readContract({
          address: contracts.wsteth,
          abi: wstethAbi,
          functionName: "getStETHByWstETH",
          args: [amountWei],
        })) as bigint;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          await client.simulateContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "unwrap",
            args: [amountWei],
            account,
          });

          return success({
            dry_run: true,
            status: "simulation_success",
            amount_wsteth: args.amount,
            expected_steth: formatEther(expectedSteth),
            wsteth_balance: formatEther(wstethBalance),
            summary: `Unwrapping ${args.amount} wstETH would yield ~${formatEther(expectedSteth)} stETH. Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "unwrap",
            args: [amountWei],
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
            amount_wsteth: args.amount,
            steth_received: formatEther(expectedSteth),
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully unwrapped ${args.amount} wstETH into ~${formatEther(expectedSteth)} stETH. Tx: ${txHash}`
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
          `Unwrap failed: ${extractErrorMessage(err, "Unknown error")}. Check balance and RPC connection.`,
        );
      }
    },
  );
}
