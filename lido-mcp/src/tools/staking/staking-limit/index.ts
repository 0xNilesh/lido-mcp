import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { lidoAbi } from "../../../abis/lido.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_staking_limit",
    "Get the current staking limit (max ETH that can be staked right now)",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const stakeLimit = (await client.readContract({
          address: contracts.lido,
          abi: lidoAbi,
          functionName: "getCurrentStakeLimit",
        })) as bigint;

        return success({
          current_stake_limit: formatEther(stakeLimit) + " ETH",
          current_stake_limit_wei: stakeLimit.toString(),
          summary: `Current staking limit: ${formatEther(stakeLimit)} ETH`,
        });
      } catch (err) {
        return error(
          `Staking limit query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
