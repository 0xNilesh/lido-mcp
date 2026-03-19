import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
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
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  // ---- lido_delegate ----
  server.tool(
    "lido_delegate",
    "Assign a delegate for Lido governance voting",
    {
      delegate_address: z.string().describe("Address to delegate voting power to"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { delegate_address: string; dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);
        const delegateAddr = args.delegate_address as `0x${string}`;

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "assignDelegate",
            args: [delegateAddr],
            account,
          });

          const gasEstimate = await provider.publicClient.estimateGas({
            to: contracts.voting,
            data: request.data,
            account,
          });

          const gasPrice = await provider.publicClient.getGasPrice();
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
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "assignDelegate",
            args: [delegateAddr],
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
    "Remove the current delegate for Lido governance voting",
    {
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "unassignDelegate",
            args: [],
            account,
          });

          const gasEstimate = await provider.publicClient.estimateGas({
            to: contracts.voting,
            data: request.data,
            account,
          });

          const gasPrice = await provider.publicClient.getGasPrice();
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
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.voting,
            abi: votingDelegateAbi,
            functionName: "unassignDelegate",
            args: [],
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
