import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { votingAbi } from "../../abis/voting.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASE_NAMES: Record<number, string> = {
  0: "Main",
  1: "Objection",
  2: "Closed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(value: bigint): string {
  const pct = Number(value) / 1e16;
  return pct.toFixed(2) + "%";
}

function formatDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString();
}

/** Type alias for the getVote return tuple. */
type VoteData = [
  boolean,   // open
  boolean,   // executed
  bigint,    // startDate
  bigint,    // snapshotBlock
  bigint,    // supportRequired
  bigint,    // minAcceptQuorum
  bigint,    // yea
  bigint,    // nay
  bigint,    // votingPower
  string,    // script
  number,    // phase
];

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerListVotes(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);
  const votingAddress = contracts.voting;

  server.tool(
    "lido_list_votes",
    "List recent Lido DAO governance votes. Can filter by status (open, executed, all).",
    {
      count: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Number of recent votes to fetch (1-20)"),
      status: z
        .enum(["all", "open", "executed"])
        .default("all")
        .describe("Filter votes by status"),
    },
    async (args: { count: number; status: "all" | "open" | "executed" }) => {
      try {
        // Get total number of votes
        const totalVotes = (await provider.publicClient.readContract({
          address: votingAddress,
          abi: votingAbi,
          functionName: "votesLength",
        })) as bigint;

        if (totalVotes === 0n) {
          return success({
            total_votes: 0,
            votes: [],
            summary: "No governance votes found on this chain.",
          });
        }

        const total = Number(totalVotes);

        // Fetch more than requested to account for filtering
        const fetchCount =
          args.status === "all" ? args.count : Math.min(args.count * 3, total);
        const startId = Math.max(0, total - fetchCount);

        // Build multicall requests for batch fetching
        const voteIds: number[] = [];
        for (let i = total - 1; i >= startId; i--) {
          voteIds.push(i);
        }

        const multicallContracts = voteIds.map((id) => ({
          address: votingAddress as `0x${string}`,
          abi: votingAbi,
          functionName: "getVote" as const,
          args: [BigInt(id)],
        }));

        const results = await provider.publicClient.multicall({
          contracts: multicallContracts,
        });

        // Process results
        const votes: Array<Record<string, unknown>> = [];

        for (let i = 0; i < results.length; i++) {
          if (results[i]?.status !== "success") continue;

          const data = results[i]!.result as unknown as VoteData;

          const [
            open,
            executed,
            startDate,
            ,
            supportRequired,
            minAcceptQuorum,
            yea,
            nay,
            votingPower,
            ,
            phase,
          ] = data;

          // Apply status filter
          if (args.status === "open" && !open) continue;
          if (args.status === "executed" && !executed) continue;

          const totalVoted = yea + nay;

          let voteStatus: string;
          if (executed) {
            voteStatus = "executed";
          } else if (open) {
            voteStatus = phase === 1 ? "objection_phase" : "open";
          } else {
            voteStatus = "closed";
          }

          votes.push({
            vote_id: voteIds[i],
            status: voteStatus,
            start_date: formatDate(startDate),
            phase: PHASE_NAMES[phase] ?? `Unknown (${phase})`,
            yea: formatEther(yea) + " LDO",
            nay: formatEther(nay) + " LDO",
            total_voted: formatEther(totalVoted) + " LDO",
            voting_power: formatEther(votingPower) + " LDO",
            support_required: formatPct(supportRequired),
            min_accept_quorum: formatPct(minAcceptQuorum),
            current_support:
              totalVoted > 0n
                ? formatPct((yea * 1_000_000_000_000_000_000n) / totalVoted)
                : "N/A",
            current_quorum:
              votingPower > 0n
                ? formatPct(
                    (totalVoted * 1_000_000_000_000_000_000n) / votingPower,
                  )
                : "N/A",
          });

          // Stop once we have enough after filtering
          if (votes.length >= args.count) break;
        }

        return success({
          total_votes_on_chain: total,
          filter: args.status,
          returned: votes.length,
          votes,
          summary: `Showing ${votes.length} of ${total} total votes (filter: ${args.status}).`,
        });
      } catch (err) {
        return error(
          `Vote listing failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
