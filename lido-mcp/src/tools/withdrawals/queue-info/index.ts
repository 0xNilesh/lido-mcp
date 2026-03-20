import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { withdrawalQueueAbi } from "../../../abis/withdrawal-queue.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_withdrawal_queue_info",
    "Get withdrawal queue status: last request ID, last finalized ID, unfinalized requests, locked ether, bunker mode, and pause status",
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
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "getLastRequestId" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "getLastFinalizedRequestId" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "getLockedEtherAmount" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "unfinalizedRequestNumber" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "unfinalizedStETH" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "isBunkerModeActive" },
            { address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: "isPaused" },
          ],
        });

        const lastRequestId = results[0]?.status === "success" ? (results[0].result as bigint).toString() : "unavailable";
        const lastFinalizedId = results[1]?.status === "success" ? (results[1].result as bigint).toString() : "unavailable";
        const lockedEther = results[2]?.status === "success" ? results[2].result as bigint : null;
        const unfinalizedCount = results[3]?.status === "success" ? (results[3].result as bigint).toString() : "unavailable";
        const unfinalizedSteth = results[4]?.status === "success" ? results[4].result as bigint : null;
        const isBunkerMode = results[5]?.status === "success" ? results[5].result as boolean : null;
        const isPaused = results[6]?.status === "success" ? results[6].result as boolean : null;

        return success({
          withdrawal_queue: contracts.withdrawalQueue,
          last_request_id: lastRequestId,
          last_finalized_request_id: lastFinalizedId,
          locked_ether: lockedEther !== null ? formatEther(lockedEther) + " ETH" : "unavailable",
          unfinalized_requests: unfinalizedCount,
          unfinalized_steth: unfinalizedSteth !== null ? formatEther(unfinalizedSteth) + " stETH" : "unavailable",
          bunker_mode_active: isBunkerMode,
          is_paused: isPaused,
          summary: `Withdrawal Queue: last request #${lastRequestId}, last finalized #${lastFinalizedId}. Unfinalized: ${unfinalizedCount} requests (${unfinalizedSteth !== null ? formatEther(unfinalizedSteth) + " stETH" : "unavailable"}). Bunker mode: ${isBunkerMode !== null ? (isBunkerMode ? "ACTIVE" : "inactive") : "unknown"}. Paused: ${isPaused !== null ? (isPaused ? "YES" : "no") : "unknown"}.`,
        });
      } catch (err) {
        return error(
          `Withdrawal queue info query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
