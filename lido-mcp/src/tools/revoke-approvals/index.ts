import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
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

const approveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_revoke_all_approvals",
    "Revoke all common Lido token approvals (stETH for wstETH contract, stETH for WithdrawalQueue, wstETH for WithdrawalQueue) by setting them to 0",
    {
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);

        const revocations = [
          { token: "stETH", address: contracts.lido, spender: contracts.wsteth, label: "stETH -> wstETH contract" },
          { token: "stETH", address: contracts.lido, spender: contracts.withdrawalQueue, label: "stETH -> WithdrawalQueue" },
          { token: "wstETH", address: contracts.wsteth, spender: contracts.withdrawalQueue, label: "wstETH -> WithdrawalQueue" },
        ];

        if (args.dry_run) {
          const simResults: Array<{ label: string; gas_estimate: string }> = [];
          for (const rev of revocations) {
            try {
              const { request } = await client.simulateContract({
                address: rev.address,
                abi: approveAbi,
                functionName: "approve",
                args: [rev.spender, 0n],
                account,
              });

              const gasEstimate = await client.estimateGas({
                to: rev.address,
                data: (request as any).data,
                account,
              });

              simResults.push({ label: rev.label, gas_estimate: gasEstimate.toString() });
            } catch {
              simResults.push({ label: rev.label, gas_estimate: "simulation_failed" });
            }
          }

          return success({
            dry_run: true,
            status: "simulation_success",
            revocations: simResults,
            summary: `Simulation successful. Will revoke ${revocations.length} approval(s). Set dry_run=false to execute.`,
          });
        }

        await writeMutex.acquire();
        try {
          const txResults: Array<{ label: string; tx_hash?: string; status: string }> = [];

          for (const rev of revocations) {
            try {
              const { request } = await client.simulateContract({
                address: rev.address,
                abi: approveAbi,
                functionName: "approve",
                args: [rev.spender, 0n],
                account,
              });

              const txHash = await walletClient.writeContract(request as any);
              const receipt = await client.waitForTransactionReceipt({
                hash: txHash,
                confirmations: 1,
              });

              txResults.push({
                label: rev.label,
                tx_hash: txHash,
                status: receipt.status === "success" ? "confirmed" : "reverted",
              });
            } catch (e) {
              txResults.push({
                label: rev.label,
                status: `failed: ${extractErrorMessage(e, "Unknown error")}`,
              });
            }
          }

          const allConfirmed = txResults.every((r) => r.status === "confirmed");

          return success({
            dry_run: false,
            status: allConfirmed ? "all_confirmed" : "partial",
            revocations: txResults,
            summary: allConfirmed
              ? `Successfully revoked all ${revocations.length} approval(s).`
              : `Completed with some failures. Check individual results.`,
          });
        } finally {
          writeMutex.release();
        }
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return error(err.message);
        }
        return error(
          `Revoke approvals failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );
}
