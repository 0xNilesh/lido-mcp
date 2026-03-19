import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { erc20Abi } from "../../abis/erc20.js";
import { getContracts } from "../../contracts.js";
import {
  resolveChainId,
  getClient,
  getWalletAddress,
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
    "lido_get_balance",
    "Get ETH, stETH, wstETH, and LDO balances plus stETH shares for an address",
    {
      address: z
        .string()
        .optional()
        .describe(
          "Ethereum address to query (defaults to connected wallet address)",
        ),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { address?: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);

        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const client = getClient(provider, args.chain_id);

        // Batch all reads using multicall + getBalance
        const [ethBalance, multicallResults] = await Promise.all([
          client.getBalance({
            address: walletAddress,
          }) as Promise<bigint>,
          client.multicall({
            contracts: [
              {
                address: contracts.lido,
                abi: lidoAbi,
                functionName: "balanceOf",
                args: [walletAddress],
              },
              {
                address: contracts.wsteth,
                abi: wstethAbi,
                functionName: "balanceOf",
                args: [walletAddress],
              },
              {
                address: contracts.ldo,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [walletAddress],
              },
              {
                address: contracts.lido,
                abi: lidoAbi,
                functionName: "sharesOf",
                args: [walletAddress],
              },
            ],
          }) as Promise<
            Array<{ status: "success" | "failure"; result?: bigint; error?: unknown }>
          >,
        ]);

        const stethBalance =
          multicallResults[0]?.status === "success" ? (multicallResults[0].result as bigint) : 0n;
        const wstethBalance =
          multicallResults[1]?.status === "success" ? (multicallResults[1].result as bigint) : 0n;
        const ldoBalance =
          multicallResults[2]?.status === "success" ? (multicallResults[2].result as bigint) : 0n;
        const shares =
          multicallResults[3]?.status === "success" ? (multicallResults[3].result as bigint) : 0n;

        // Get stETH value of wstETH holdings
        let wstethInSteth = 0n;
        if (wstethBalance > 0n) {
          try {
            wstethInSteth = (await client.readContract({
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "getStETHByWstETH",
              args: [wstethBalance],
            })) as bigint;
          } catch {
            // Non-critical -- wstethInSteth stays 0
          }
        }

        const totalStethValue = stethBalance + wstethInSteth;

        return success({
          address: walletAddress,
          chain_id: chainId,
          balances: {
            eth: formatEther(ethBalance),
            steth: formatEther(stethBalance),
            wsteth: formatEther(wstethBalance),
            ldo: formatEther(ldoBalance),
          },
          steth_shares: formatEther(shares),
          wsteth_as_steth: formatEther(wstethInSteth),
          total_steth_value: formatEther(totalStethValue),
          summary: `Address ${walletAddress} on chain ${chainId}: ${formatTokenAmount(ethBalance, "ETH")}, ${formatTokenAmount(stethBalance, "stETH")}, ${formatTokenAmount(wstethBalance, "wstETH")} (worth ~${formatEther(wstethInSteth)} stETH), ${formatTokenAmount(ldoBalance, "LDO")}. Total stETH exposure: ${formatEther(totalStethValue)} stETH. Shares: ${formatEther(shares)}.`,
        });
      } catch (err) {
        return error(
          `Balance query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );
}
