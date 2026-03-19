import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  getWalletAddress,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTokenContract(
  token: "stETH" | "wstETH" | "LDO",
  contracts: ReturnType<typeof getContracts>,
): { address: `0x${string}`; abi: typeof lidoAbi | typeof wstethAbi | typeof erc20Abi } {
  switch (token) {
    case "stETH":
      return { address: contracts.lido, abi: lidoAbi };
    case "wstETH":
      return { address: contracts.wsteth, abi: wstethAbi };
    case "LDO":
      return { address: contracts.ldo, abi: erc20Abi };
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  // ---- lido_get_allowance ----
  server.tool(
    "lido_get_allowance",
    "Get the ERC-20 allowance for a specific Lido token (stETH, wstETH, or LDO) granted to a spender",
    {
      token: z
        .enum(["stETH", "wstETH", "LDO"])
        .describe("Token to check allowance for"),
      spender: z
        .string()
        .describe("Spender address to check allowance for"),
      address: z
        .string()
        .optional()
        .describe(
          "Owner address to query (defaults to connected wallet address)",
        ),
    },
    async (args: { token: "stETH" | "wstETH" | "LDO"; spender: string; address?: string }) => {
      try {
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const { address: tokenAddress, abi } = getTokenContract(args.token, contracts);
        const spender = args.spender as `0x${string}`;

        const allowance = (await provider.publicClient.readContract({
          address: tokenAddress,
          abi,
          functionName: "allowance",
          args: [walletAddress, spender],
        })) as bigint;

        return success({
          owner: walletAddress,
          spender,
          token: args.token,
          allowance: formatEther(allowance),
          allowance_raw: allowance.toString(),
          is_unlimited: allowance >= 2n ** 255n,
          summary: `${args.token} allowance from ${walletAddress} to ${spender}: ${formatTokenAmount(allowance, args.token)}`,
        });
      } catch (err) {
        return error(
          `Allowance query failed: ${extractErrorMessage(err, "Unknown error")}. Check the addresses and RPC connection.`,
        );
      }
    },
  );

  // ---- lido_get_all_allowances ----
  server.tool(
    "lido_get_all_allowances",
    "Get all common Lido token allowances: stETH for wstETH contract and WithdrawalQueue, wstETH for WithdrawalQueue",
    {
      address: z
        .string()
        .optional()
        .describe(
          "Owner address to query (defaults to connected wallet address)",
        ),
    },
    async (args: { address?: string }) => {
      try {
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const results = await provider.publicClient.multicall({
          contracts: [
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "allowance",
              args: [walletAddress, contracts.wsteth],
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "allowance",
              args: [walletAddress, contracts.withdrawalQueue],
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "allowance",
              args: [walletAddress, contracts.withdrawalQueue],
            },
          ],
        }) as Array<{ status: "success" | "failure"; result?: bigint; error?: unknown }>;

        const stethForWsteth =
          results[0]?.status === "success" ? (results[0].result as bigint) : null;
        const stethForWithdrawal =
          results[1]?.status === "success" ? (results[1].result as bigint) : null;
        const wstethForWithdrawal =
          results[2]?.status === "success" ? (results[2].result as bigint) : null;

        return success({
          owner: walletAddress,
          chain_id: chainId,
          allowances: {
            steth_for_wsteth_contract: {
              spender: contracts.wsteth,
              allowance: stethForWsteth !== null ? formatEther(stethForWsteth) : "unavailable",
              is_unlimited: stethForWsteth !== null && stethForWsteth >= 2n ** 255n,
            },
            steth_for_withdrawal_queue: {
              spender: contracts.withdrawalQueue,
              allowance: stethForWithdrawal !== null ? formatEther(stethForWithdrawal) : "unavailable",
              is_unlimited: stethForWithdrawal !== null && stethForWithdrawal >= 2n ** 255n,
            },
            wsteth_for_withdrawal_queue: {
              spender: contracts.withdrawalQueue,
              allowance: wstethForWithdrawal !== null ? formatEther(wstethForWithdrawal) : "unavailable",
              is_unlimited: wstethForWithdrawal !== null && wstethForWithdrawal >= 2n ** 255n,
            },
          },
          summary: `Allowances for ${walletAddress}: stETH->wstETH: ${stethForWsteth !== null ? formatTokenAmount(stethForWsteth, "stETH") : "unavailable"}, stETH->WithdrawalQueue: ${stethForWithdrawal !== null ? formatTokenAmount(stethForWithdrawal, "stETH") : "unavailable"}, wstETH->WithdrawalQueue: ${wstethForWithdrawal !== null ? formatTokenAmount(wstethForWithdrawal, "wstETH") : "unavailable"}`,
        });
      } catch (err) {
        return error(
          `Allowance query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );
}
