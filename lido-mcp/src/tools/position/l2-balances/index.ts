import { z } from "zod";
import { createPublicClient, http, formatEther } from "viem";
import { arbitrum, optimism, base, polygon, zkSync, mantle, linea, scroll, mode, bsc } from "viem/chains";
import { success, error } from "../../../utils/format.js";
import { erc20Abi } from "../../../abis/erc20.js";
import { L2_WSTETH } from "../../../contracts.js";
import {
  getWalletAddress,
  formatTokenAmount,
  extractErrorMessage,
} from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// Chain definitions lookup
// ---------------------------------------------------------------------------

const CHAIN_DEFS: Record<string, { chain: Parameters<typeof createPublicClient>[0]["chain"] }> = {
  arbitrum: { chain: arbitrum },
  optimism: { chain: optimism },
  base: { chain: base },
  polygon: { chain: polygon },
  zksync: { chain: zkSync },
  mantle: { chain: mantle },
  linea: { chain: linea },
  scroll: { chain: scroll },
  mode: { chain: mode },
  bsc: { chain: bsc },
};

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_l2_balances",
    "Get wstETH balances across all supported L2 chains (Arbitrum, Optimism, Base, Polygon, zkSync, Mantle, Linea, Scroll, Mode, BSC)",
    {
      address: z
        .string()
        .optional()
        .describe(
          "Ethereum address to query (defaults to connected wallet address)",
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

        const chainNames = Object.keys(L2_WSTETH);

        const results = await Promise.allSettled(
          chainNames.map(async (name) => {
            const l2Info = L2_WSTETH[name];
            const chainDef = CHAIN_DEFS[name];
            if (!l2Info || !chainDef) {
              throw new Error(`No chain definition for ${name}`);
            }

            const client = createPublicClient({
              chain: chainDef.chain,
              transport: http(),
            });

            const balance = (await client.readContract({
              address: l2Info.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [walletAddress],
            })) as bigint;

            return { name, chainId: l2Info.chainId, balance };
          }),
        );

        const balances: Record<string, unknown> = {};
        const summaryParts: string[] = [];

        for (let i = 0; i < chainNames.length; i++) {
          const chainName = chainNames[i]!;
          const result = results[i]!;
          if (result.status === "fulfilled") {
            const { chainId, balance } = result.value;
            balances[chainName] = {
              chain_id: chainId,
              wsteth: formatEther(balance),
            };
            if (balance > 0n) {
              summaryParts.push(`${chainName}: ${formatTokenAmount(balance, "wstETH")}`);
            }
          }
          // Skip failed chains silently
        }

        return success({
          address: walletAddress,
          l2_balances: balances,
          summary:
            summaryParts.length > 0
              ? `wstETH balances for ${walletAddress}: ${summaryParts.join(", ")}`
              : `No wstETH found on any L2 for ${walletAddress}`,
        });
      } catch (err) {
        return error(
          `L2 balance query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connections.`,
        );
      }
    },
  );
}
