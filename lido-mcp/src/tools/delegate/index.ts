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

// ---------------------------------------------------------------------------
// Local ABI for voting delegation
// ---------------------------------------------------------------------------

const votingDelegateAbi = [
  {
    name: "assignDelegate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_delegate", type: "address" }],
    outputs: [],
  },
  {
    name: "unassignDelegate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  // ---- lido_delegate ----
  server.tool(
    "lido_delegate",
    "Assign a delegate for Lido governance voting. Note: chain_id affects contract address lookup; wallet stays on default chain.",
    {
      delegate_address: z.string().describe("Address to delegate voting power to"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain. Note: affects contract address lookup; wallet client stays on default chain.'),
    },
    async (args: { delegate_address: string; dry_run: boolean; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const { account, walletClient } = requireWallet(provider);
        const delegateAddr = args.delegate_address as `0x${string}`;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "assignDelegate",
            args: [delegateAddr],
            account,
          });

          const gasEstimate = await client.estimateGas({
            to: contracts.voting,
            data: (request as any).data,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            delegate_address: args.delegate_address,
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Delegating voting power to ${args.delegate_address}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "assignDelegate",
            args: [delegateAddr],
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
            delegate_address: args.delegate_address,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully delegated voting power to ${args.delegate_address}. Tx: ${txHash}`
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
          `Delegation failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );

  // ---- lido_undelegate ----
  server.tool(
    "lido_undelegate",
    "Remove the current delegate for Lido governance voting. Note: chain_id affects contract address lookup; wallet stays on default chain.",
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

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await client.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "unassignDelegate",
            args: [],
            account,
          });

          const gasEstimate = await client.estimateGas({
            to: contracts.voting,
            data: (request as any).data,
            account,
          });

          const gasPrice = await client.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Removing current governance delegate. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await client.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "unassignDelegate",
            args: [],
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
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully removed governance delegate. Tx: ${txHash}`
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
          `Undelegation failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );
}
