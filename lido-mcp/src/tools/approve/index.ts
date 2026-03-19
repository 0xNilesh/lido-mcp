import { z } from "zod";
import { formatEther, parseEther } from "viem";
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

// ---------------------------------------------------------------------------
// Local ABI
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_approve",
    'Approve stETH, wstETH, or LDO for a spender. Use amount "0" to revoke approval.',
    {
      token: z
        .enum(["stETH", "wstETH", "LDO"])
        .describe("Token to approve"),
      spender: z.string().describe("Spender address to approve"),
      amount: z.string().describe('Amount to approve (e.g. "1.5", use "0" to revoke)'),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { token: "stETH" | "wstETH" | "LDO"; spender: string; amount: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const spender = args.spender as `0x${string}`;
        const amountWei = parseEther(args.amount);

        // Determine contract address based on token
        let contractAddress: `0x${string}`;
        if (args.token === "stETH") {
          contractAddress = contracts.lido;
        } else if (args.token === "wstETH") {
          contractAddress = contracts.wsteth;
        } else {
          contractAddress = contracts.ldo;
        }

        const isRevoke = amountWei === 0n;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contractAddress,
            abi: approveAbi,
            functionName: "approve",
            args: [spender, amountWei],
            account,
          });

          const gasEstimate = await client.estimateGas({
            to: contractAddress,
            data: (request as any).data,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            token: args.token,
            spender: args.spender,
            amount: args.amount,
            is_revoke: isRevoke,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: isRevoke
              ? `Simulation successful. Revoking ${args.token} approval for spender ${args.spender}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`
              : `Simulation successful. Approving ${args.amount} ${args.token} for spender ${args.spender}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contractAddress,
            abi: approveAbi,
            functionName: "approve",
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
            token: args.token,
            spender: args.spender,
            amount: args.amount,
            is_revoke: isRevoke,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? isRevoke
                  ? `Successfully revoked ${args.token} approval for spender ${args.spender}. Tx: ${txHash}`
                  : `Successfully approved ${args.amount} ${args.token} for spender ${args.spender}. Tx: ${txHash}`
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
          `Approval failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );
}
