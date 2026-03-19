import { success, error } from "../../utils/format.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_bunker_mode",
    "Check if bunker mode is active and get the timestamp since when it has been active",
    {},
    async () => {
      try {
        const results = await provider.publicClient.multicall({
          contracts: [
            {
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "isBunkerModeActive",
            },
            {
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "bunkerModeSinceTimestamp",
            },
          ],
        });

        const isActive = results[0]?.status === "success" ? results[0].result as boolean : null;
        const sinceTimestamp = results[1]?.status === "success" ? (results[1].result as bigint).toString() : null;

        let sinceDate: string | null = null;
        if (sinceTimestamp !== null && sinceTimestamp !== "0" && isActive) {
          sinceDate = new Date(Number(sinceTimestamp) * 1000).toISOString();
        }

        return success({
          bunker_mode_active: isActive,
          since_timestamp: sinceTimestamp,
          since_date: sinceDate,
          summary: isActive
            ? `Bunker mode is ACTIVE since ${sinceDate ?? "unknown"}. Withdrawals may be delayed.`
            : "Bunker mode is NOT active. Withdrawals are processing normally.",
        });
      } catch (err) {
        return error(
          `Bunker mode query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
