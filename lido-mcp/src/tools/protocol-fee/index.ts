import { z } from "zod";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { getContracts } from "../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_protocol_fee",
    "Get the current Lido protocol fee in basis points and as a percentage",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const feeBps = (await client.readContract({
          address: contracts.lido,
          abi: lidoAbi,
          functionName: "getFee",
        })) as number;

        const feePercent = (feeBps / 100).toFixed(2);

        return success({
          fee_basis_points: feeBps,
          fee_percent: feePercent + "%",
          summary: `Lido protocol fee: ${feeBps} bps (${feePercent}%)`,
        });
      } catch (err) {
        return error(
          `Protocol fee query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
