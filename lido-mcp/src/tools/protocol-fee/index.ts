import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_protocol_fee",
    "Get the current Lido protocol fee in basis points and as a percentage",
    {},
    async () => {
      try {
        const feeBps = (await provider.publicClient.readContract({
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
