import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
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
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_stake_and_wrap",
    "Stake ETH and wrap into wstETH in a single transaction by sending ETH to the wstETH contract. Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      amount: z.string().describe('Amount of ETH to stake and wrap (e.g. "1.5")'),
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

        // Fetch ETH balance and expected wstETH amount in parallel
        const [ethBalance, expectedWsteth] = await Promise.all([
          client.getBalance({ address: walletAddress }),
          client.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getWstETHByStETH",
            args: [amountWei],
          }) as Promise<bigint>,
        ]);

        if (ethBalance < amountWei) {
          return error(
            `Insufficient ETH balance. Have ${formatTokenAmount(ethBalance, "ETH")}, need ${args.amount} ETH. Reduce the amount or top up the wallet.`,
          );
        }

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const gasEstimate = await client.estimateGas({
            to: contracts.wsteth,
            value: amountWei,
            data: "0x" as `0x${string}`,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            amount_eth: args.amount,
            expected_wsteth: formatEther(expectedWsteth),
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            eth_balance: formatEther(ethBalance),
            summary: `Simulation successful. Staking and wrapping ${args.amount} ETH would yield approximately ${formatEther(expectedWsteth)} wstETH. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const txHash = await walletClient.sendTransaction({
            to: contracts.wsteth,
            value: amountWei,
            data: "0x" as `0x${string}`,
          } as any);

          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
          });

          return success({
            dry_run: false,
            status: receipt.status === "success" ? "confirmed" : "reverted",
            tx_hash: txHash,
            amount_eth: args.amount,
            expected_wsteth: formatEther(expectedWsteth),
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully staked and wrapped ${args.amount} ETH into ~${formatEther(expectedWsteth)} wstETH. Tx: ${txHash}`
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
          `Stake and wrap failed: ${extractErrorMessage(err, "Unknown error")}. Check balance and RPC connection.`,
        );
      }
    },
  );
}
