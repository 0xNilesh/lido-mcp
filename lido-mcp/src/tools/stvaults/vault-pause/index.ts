import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { writeMutex } from "../../../utils/mutex.js";
import { getContracts } from "../../../contracts.js";
import {
  resolveChainId,
  getClient,
  requireWallet,
  WalletRequiredError,
  extractErrorMessage,
} from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const vaultHubAbi = [
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "pauseBeaconChainDeposits",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_vault_pause_deposits",
    "Pause beacon chain deposits for a Lido staking vault via VaultHub.",
    {
      vault_address: z.string().describe("The vault contract address"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z
        .number()
        .optional()
        .describe("Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain."),
    },
    async (args: { vault_address: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);

        const vaultAddr = args.vault_address as `0x${string}`;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "pauseBeaconChainDeposits",
            args: [vaultAddr],
            account,
          });

          const gasEstimate = BigInt(
            await client.estimateGas({
              to: contracts.vaultHub,
              data: (request as any).data,
              account,
            }),
          );
          const gasPrice = BigInt(await client.getGasPrice());
          const estimatedFee = gasEstimate * gasPrice;

          return success({
            dry_run: true,
            status: "simulation_success",
            vault_address: vaultAddr,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Pausing beacon chain deposits for vault ${vaultAddr}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "pauseBeaconChainDeposits",
            args: [vaultAddr],
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
            vault_address: vaultAddr,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully paused beacon chain deposits for vault ${vaultAddr}. Tx: ${txHash}`
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
          `Pause deposits failed: ${extractErrorMessage(err, "Unknown error")}. Check permissions and RPC connection.`,
        );
      }
    },
  );
}
