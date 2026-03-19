import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
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
// Types
// ---------------------------------------------------------------------------

interface WithdrawalStatus {
  amountOfStETH: bigint;
  amountOfShares: bigint;
  owner: string;
  timestamp: bigint;
  isFinalized: boolean;
  isClaimed: boolean;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_withdrawal_status",
    "Get the status of Lido withdrawal requests. Either provide specific request IDs or an address to look up all requests for that address.",
    {
      request_ids: z
        .array(z.string())
        .optional()
        .describe("Specific withdrawal request IDs to query (as strings)"),
      address: z
        .string()
        .optional()
        .describe(
          "Ethereum address to look up withdrawal requests for. Defaults to the configured wallet.",
        ),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { request_ids?: string[]; address?: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const walletAddress = getWalletAddress(provider, args.address);

        let requestIds: bigint[];

        if (args.request_ids && args.request_ids.length > 0) {
          requestIds = args.request_ids.map((id) => BigInt(id));
        } else if (walletAddress) {
          // Fetch all request IDs for the address
          requestIds = (await client.readContract({
            address: contracts.withdrawalQueue,
            abi: withdrawalQueueAbi,
            functionName: "getWithdrawalRequests",
            args: [walletAddress],
          })) as bigint[];

          if (requestIds.length === 0) {
            return success({
              address: walletAddress,
              total_requests: 0,
              requests: [],
              bunker_mode: false,
              summary: `No withdrawal requests found for ${walletAddress}.`,
            });
          }
        } else {
          return error(
            "No request_ids or address provided, and no wallet is configured. Provide at least one parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        // Fetch withdrawal statuses
        const statuses = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "getWithdrawalStatus",
          args: [requestIds],
        })) as WithdrawalStatus[];

        // Check bunker mode
        const isBunkerMode = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "isBunkerModeActive",
        })) as boolean;

        // Get last finalized request ID for context
        const lastFinalizedId = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "getLastFinalizedRequestId",
        })) as bigint;

        // Identify finalized-but-unclaimed request IDs for claimable ether lookup
        const finalizedUnclaimedIds: bigint[] = [];
        for (let i = 0; i < statuses.length; i++) {
          const st = statuses[i];
          const rid = requestIds[i];
          if (st && rid !== undefined && st.isFinalized && !st.isClaimed) {
            finalizedUnclaimedIds.push(rid);
          }
        }

        // Fetch claimable ether for finalized unclaimed requests (best-effort)
        let claimableAmounts: bigint[] = [];
        if (finalizedUnclaimedIds.length > 0) {
          try {
            const lastCheckpointIndex = (await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "getLastCheckpointIndex",
            })) as bigint;

            const hints = (await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "findCheckpointHints",
              args: [finalizedUnclaimedIds, 1n, lastCheckpointIndex],
            })) as bigint[];

            claimableAmounts = (await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "getClaimableEther",
              args: [finalizedUnclaimedIds, hints],
            })) as bigint[];
          } catch {
            // If claimable ether lookup fails, continue without it
          }
        }

        // Build claimable map: requestId -> claimable amount
        const claimableMap = new Map<string, string>();
        for (let i = 0; i < finalizedUnclaimedIds.length; i++) {
          const amt = claimableAmounts[i];
          const fid = finalizedUnclaimedIds[i];
          if (amt !== undefined && fid !== undefined) {
            claimableMap.set(fid.toString(), formatEther(amt));
          }
        }

        // Format results
        const requests = statuses.map((s, i) => {
          const rid = requestIds[i];
          const id = rid !== undefined ? rid.toString() : String(i);
          const result: Record<string, unknown> = {
            id,
            amount_steth: formatTokenAmount(s.amountOfStETH, "stETH"),
            amount_shares: s.amountOfShares.toString(),
            owner: s.owner,
            timestamp: s.timestamp.toString(),
            date: new Date(Number(s.timestamp) * 1000).toISOString(),
            is_finalized: s.isFinalized,
            is_claimed: s.isClaimed,
          };

          if (s.isFinalized && !s.isClaimed) {
            result.status = "ready_to_claim";
            const claimable = claimableMap.get(id);
            if (claimable) {
              result.claimable_eth = claimable + " ETH";
            }
          } else if (s.isClaimed) {
            result.status = "claimed";
          } else {
            result.status = "pending";
          }

          return result;
        });

        // Summary counts
        const pendingCount = requests.filter((r) => r.status === "pending").length;
        const readyCount = requests.filter((r) => r.status === "ready_to_claim").length;
        const claimedCount = requests.filter((r) => r.status === "claimed").length;
        const totalClaimableEth = claimableAmounts.reduce((sum, a) => sum + a, 0n);

        return success({
          address: walletAddress ?? "N/A",
          total_requests: requests.length,
          counts: {
            pending: pendingCount,
            ready_to_claim: readyCount,
            claimed: claimedCount,
          },
          total_claimable_eth:
            totalClaimableEth > 0n ? formatTokenAmount(totalClaimableEth, "ETH") : "0 ETH",
          last_finalized_request_id: lastFinalizedId.toString(),
          bunker_mode_active: isBunkerMode,
          requests,
          ...(isBunkerMode
            ? {
                bunker_mode_warning:
                  "Bunker mode is active. Withdrawal processing may be delayed due to a significant slashing event or protocol issue.",
              }
            : {}),
          summary: `${requests.length} withdrawal request(s) for ${walletAddress ?? "N/A"}. Pending: ${pendingCount}, Ready to claim: ${readyCount}, Claimed: ${claimedCount}. Total claimable: ${totalClaimableEth > 0n ? formatTokenAmount(totalClaimableEth, "ETH") : "0 ETH"}.`,
        });
      } catch (err) {
        return error(
          `Withdrawal status query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address/request IDs and RPC connection.`,
        );
      }
    },
  );
}
