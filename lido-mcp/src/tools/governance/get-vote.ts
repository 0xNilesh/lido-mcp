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

const VOTER_STATE_NAMES: Record<number, string> = {
  0: "Absent",
  1: "Yea",
  2: "Nay",
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

export function registerGetVote(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);
  const votingAddress = contracts.voting;

  server.tool(
    "lido_get_vote",
    "Get detailed information about a specific Lido DAO governance vote, including tallies, phase, and the connected wallet's voter state.",
    {
      vote_id: z.number().int().nonnegative().describe("The vote ID to query"),
    },
    async (args: { vote_id: number }) => {
      try {
        const voteId = BigInt(args.vote_id);

        const voteData = (await provider.publicClient.readContract({
          address: votingAddress,
          abi: votingAbi,
          functionName: "getVote",
          args: [voteId],
        })) as VoteData;

        const [
          open,
          executed,
          startDate,
          snapshotBlock,
          supportRequired,
          minAcceptQuorum,
          yea,
          nay,
          votingPower,
          script,
          phase,
        ] = voteData;

        const totalVoted = yea + nay;

        // Determine overall status
        let status: string;
        if (executed) {
          status = "executed";
        } else if (open) {
          status = phase === 1 ? "objection_phase" : "open";
        } else {
          status = "closed";
        }

        const result: Record<string, unknown> = {
          vote_id: args.vote_id,
          status,
          is_open: open,
          is_executed: executed,
          start_date: formatDate(startDate),
          snapshot_block: snapshotBlock.toString(),
          phase: PHASE_NAMES[phase] ?? `Unknown (${phase})`,
          tallies: {
            yea: formatEther(yea) + " LDO",
            nay: formatEther(nay) + " LDO",
            total_voted: formatEther(totalVoted) + " LDO",
            voting_power: formatEther(votingPower) + " LDO",
          },
          thresholds: {
            support_required: formatPct(supportRequired),
            min_accept_quorum: formatPct(minAcceptQuorum),
            current_support:
              totalVoted > 0n
                ? formatPct((yea * 1_000_000_000_000_000_000n) / totalVoted)
                : "N/A (no votes)",
            current_quorum:
              votingPower > 0n
                ? formatPct(
                    (totalVoted * 1_000_000_000_000_000_000n) / votingPower,
                  )
                : "N/A",
          },
          script_length: script.length,
          has_script: script !== "0x" && script.length > 2,
        };

        // Check current wallet's state if configured (best-effort)
        if (provider.account) {
          try {
            const [voterState, userCanVote] = await Promise.all([
              provider.publicClient.readContract({
                address: votingAddress,
                abi: votingAbi,
                functionName: "getVoterState",
                args: [voteId, provider.account.address],
              }) as Promise<number>,
              provider.publicClient.readContract({
                address: votingAddress,
                abi: votingAbi,
                functionName: "canVote",
                args: [voteId, provider.account.address],
              }) as Promise<boolean>,
            ]);

            result.your_wallet = {
              address: provider.account.address,
              voter_state:
                VOTER_STATE_NAMES[voterState] ?? `Unknown (${voterState})`,
              can_vote: userCanVote,
            };
          } catch {
            // Wallet state lookup is best-effort
          }
        }

        result.summary = `Vote #${args.vote_id}: ${status}. Yea: ${formatEther(yea)} LDO, Nay: ${formatEther(nay)} LDO. Phase: ${PHASE_NAMES[phase] ?? "Unknown"}.`;

        return success(result);
      } catch (err) {
        return error(
          `Vote query failed: ${extractErrorMessage(err, "Unknown error")}. Verify the vote_id exists and the RPC connection is working.`,
        );
      }
    },
  );
}
