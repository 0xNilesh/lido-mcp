import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../utils/format.js";
import { writeMutex } from "../../utils/mutex.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  requireWallet,
  WalletRequiredError,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Local ABI for ERC-20 transfer
// ---------------------------------------------------------------------------

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_transfer_ldo",
    "Transfer LDO tokens to another address",
    {
      to: z.string().describe("Recipient address"),
      amount: z.string().describe('Amount of LDO to transfer (e.g. "100")'),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate without executing (default: true)"),
    },
    async (args: { to: string; amount: string; dry_run: boolean }) => {
      try {
        const { account, walletClient } = requireWallet(provider);
        const walletAddress = account.address;
        const recipient = args.to as `0x${string}`;

        const amountWei = parseEther(args.amount);
        if (amountWei <= 0n) {
          return error("Amount must be greater than zero. Provide a positive number.");
        }

        // Check LDO balance
        const ldoBalance = (await provider.publicClient.readContract({
          address: contracts.ldo,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [walletAddress],
        })) as bigint;

        if (ldoBalance < amountWei) {
          return error(
            `Insufficient LDO balance. Have ${formatTokenAmount(ldoBalance, "LDO")}, need ${args.amount} LDO.`,
          );
        }

        // ---- Dry run (simulation) ----
        if (args.dry_run) {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.ldo,
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, amountWei],
            account,
          });

          const gasEstimate = await provider.publicClient.estimateGas({
            to: contracts.ldo,
            data: request.data,
            account,
          });

          const gasPrice = await provider.publicClient.getGasPrice();
          const estimatedFee = BigInt(gasEstimate) * BigInt(gasPrice);

          return success({
            dry_run: true,
            status: "simulation_success",
            amount_ldo: args.amount,
            to: args.to,
            ldo_balance: formatEther(ldoBalance),
            gas_estimate: gasEstimate.toString(),
            estimated_fee_eth: formatEther(estimatedFee),
            summary: `Simulation successful. Transferring ${args.amount} LDO to ${args.to}. Estimated gas: ${gasEstimate.toString()} (fee: ${formatEther(estimatedFee)} ETH). Set dry_run=false to execute.`,
          });
        }

        // ---- Live execution ----
        await writeMutex.acquire();
        try {
          const { request } = await provider.publicClient.simulateContract({
            address: contracts.ldo,
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, amountWei],
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
            amount_ldo: args.amount,
            to: args.to,
            gas_used: receipt.gasUsed.toString(),
            block_number: receipt.blockNumber.toString(),
            summary:
              receipt.status === "success"
                ? `Successfully transferred ${args.amount} LDO to ${args.to}. Tx: ${txHash}`
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
          `LDO transfer failed: ${extractErrorMessage(err, "Unknown error")}. Check balance and RPC connection.`,
        );
      }
    },
  );
}
