import { z } from "zod";
import { success, error } from "../../../utils/format.js";
import { lidoAbi } from "../../../abis/lido.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_is_staking_paused",
    "Check whether staking is currently paused on the Lido protocol",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const isPaused = (await client.readContract({
          address: contracts.lido,
          abi: lidoAbi,
          functionName: "isStakingPaused",
        })) as boolean;

        return success({
          is_paused: isPaused,
          summary: isPaused
            ? "Staking is currently PAUSED on Lido. New deposits are not accepted."
            : "Staking is ACTIVE on Lido. New deposits are accepted.",
        });
      } catch (err) {
        return error(
          `Staking paused query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
