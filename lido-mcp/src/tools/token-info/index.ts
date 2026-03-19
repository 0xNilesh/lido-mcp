import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { getContracts } from "../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_token_info",
    "Get detailed token information for stETH and wstETH including name, symbol, decimals, total supply, and exchange rates",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const results = await client.multicall({
          contracts: [
            { address: contracts.lido, abi: lidoAbi, functionName: "name" },
            { address: contracts.lido, abi: lidoAbi, functionName: "symbol" },
            { address: contracts.lido, abi: lidoAbi, functionName: "decimals" },
            { address: contracts.lido, abi: lidoAbi, functionName: "totalSupply" },
            { address: contracts.wsteth, abi: wstethAbi, functionName: "name" },
            { address: contracts.wsteth, abi: wstethAbi, functionName: "totalSupply" },
            { address: contracts.wsteth, abi: wstethAbi, functionName: "stEthPerToken" },
            { address: contracts.wsteth, abi: wstethAbi, functionName: "tokensPerStEth" },
          ],
        });

        const stethName = results[0]?.status === "success" ? results[0].result as string : "unavailable";
        const stethSymbol = results[1]?.status === "success" ? results[1].result as string : "unavailable";
        const stethDecimals = results[2]?.status === "success" ? Number(results[2].result) : 18;
        const stethSupply = results[3]?.status === "success" ? results[3].result as bigint : null;
        const wstethName = results[4]?.status === "success" ? results[4].result as string : "unavailable";
        const wstethSupply = results[5]?.status === "success" ? results[5].result as bigint : null;
        const stethPerWsteth = results[6]?.status === "success" ? results[6].result as bigint : null;
        const wstethPerSteth = results[7]?.status === "success" ? results[7].result as bigint : null;

        return success({
          steth: {
            name: stethName,
            symbol: stethSymbol,
            decimals: stethDecimals,
            address: contracts.lido,
            total_supply: stethSupply !== null ? formatEther(stethSupply) : "unavailable",
          },
          wsteth: {
            name: wstethName,
            symbol: "wstETH",
            decimals: 18,
            address: contracts.wsteth,
            total_supply: wstethSupply !== null ? formatEther(wstethSupply) : "unavailable",
          },
          exchange_rates: {
            steth_per_wsteth: stethPerWsteth !== null ? formatEther(stethPerWsteth) : "unavailable",
            wsteth_per_steth: wstethPerSteth !== null ? formatEther(wstethPerSteth) : "unavailable",
          },
          summary: `stETH (${stethSymbol}): supply ${stethSupply !== null ? formatEther(stethSupply) : "unavailable"}. wstETH: supply ${wstethSupply !== null ? formatEther(wstethSupply) : "unavailable"}. Rate: ${stethPerWsteth !== null ? formatEther(stethPerWsteth) + " stETH/wstETH" : "unavailable"}.`,
        });
      } catch (err) {
        return error(
          `Token info query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
