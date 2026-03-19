import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_claimable_ether",
    "Get the amount of claimable ETH for specific finalized withdrawal request IDs (auto-resolves checkpoint hints)",
    {
      request_ids: z
        .array(z.string())
        .describe("Array of finalized withdrawal request IDs to check"),
    },
    async (args: { request_ids: string[] }) => {
      try {
        const requestIds = args.request_ids.map((id) => BigInt(id));

        const lastCheckpointIndex = (await provider.publicClient.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "getLastCheckpointIndex",
        })) as bigint;

        const hints = (await provider.publicClient.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "findCheckpointHints",
          args: [requestIds, 1n, lastCheckpointIndex],
        })) as bigint[];

        const claimableAmounts = (await provider.publicClient.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "getClaimableEther",
          args: [requestIds, hints],
        })) as bigint[];

        let totalClaimable = 0n;
        const breakdown = requestIds.map((id, i) => {
          const amt = claimableAmounts[i]!;
          totalClaimable += amt;
          return {
            request_id: id.toString(),
            claimable_eth: formatEther(amt),
            hint: hints[i]!.toString(),
          };
        });

        return success({
          request_ids: args.request_ids,
          breakdown,
          total_claimable_eth: formatEther(totalClaimable),
          hints: hints.map((h) => h.toString()),
          summary: `Total claimable: ${formatEther(totalClaimable)} ETH across ${args.request_ids.length} request(s).`,
        });
      } catch (err) {
        return error(
          `Claimable ether query failed: ${extractErrorMessage(err, "Unknown error")}. Check that request IDs are finalized and RPC connection is working.`,
        );
      }
    },
  );
}
