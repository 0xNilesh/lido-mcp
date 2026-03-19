import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { executeOrSimulate } from "../../utils/dry-run.js";
import { votingAbi } from "../../abis/voting.js";
import { getContracts } from "../../contracts.js";
import {
  getChainId,
  requireWallet,
  WalletRequiredError,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(value: bigint): string {
  // Aragon percentages are in units of 10^18 where 10^18 = 100%
  const pct = Number(value) / 1e16;
  return pct.toFixed(2) + "%";
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

export function registerCastVote(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);
  const votingAddress = contracts.voting;

  server.tool(
    "lido_cast_vote",
    "Cast a vote on a Lido DAO governance proposal (Aragon vote). Defaults to dry_run=true for simulation.",
    {
      vote_id: z.number().int().nonnegative().describe("The vote ID to cast a vote on"),
      vote_for: z.boolean().describe("true = vote Yea, false = vote Nay"),
      dry_run: z
        .boolean()
        .default(true)
        .describe("If true, simulate the vote. If false, execute it."),
    },
    async (args: { vote_id: number; vote_for: boolean; dry_run: boolean }) => {
      try {
        const { account } = requireWallet(provider);
        const walletAddress = account.address;
        const voteId = BigInt(args.vote_id);

        // Check if the user can vote
        const canVote = (await provider.publicClient.readContract({
          address: votingAddress,
          abi: votingAbi,
          functionName: "canVote",
          args: [voteId, walletAddress],
        })) as boolean;

        if (!canVote) {
          // Fetch vote details to give a more informative error
          try {
            const voteData = (await provider.publicClient.readContract({
              address: votingAddress,
              abi: votingAbi,
              functionName: "getVote",
              args: [voteId],
            })) as VoteData;

            const isOpen = voteData[0];
            const phase = voteData[10];

            if (!isOpen) {
              return error(
                `Cannot vote on proposal #${args.vote_id}: the vote is closed. No action can be taken.`,
              );
            }
            if (phase === 1) {
              return error(
                `Cannot vote on proposal #${args.vote_id}: the vote is in the objection phase (only Nay votes are allowed, and only if you haven't voted yet).`,
              );
            }
            return error(
              `Cannot vote on proposal #${args.vote_id}: wallet ${walletAddress} does not have voting power. You may not hold LDO tokens at the snapshot block.`,
            );
          } catch {
            return error(
              `Cannot vote on proposal #${args.vote_id}: canVote returned false for ${walletAddress}. The vote may not exist, be closed, or you may lack voting power.`,
            );
          }
        }

        // Execute or simulate the vote
        const result = await executeOrSimulate({
          publicClient: provider.publicClient,
          walletClient: provider.walletClient,
          account,
          address: votingAddress,
          abi: votingAbi,
          functionName: "vote",
          args: [voteId, args.vote_for, false],
          dryRun: args.dry_run,
        });

        if (result.status === "error") {
          return error(result.message);
        }

        // Fetch updated vote tallies (best-effort)
        let tallies: Record<string, unknown> = {};
        try {
          const voteData = (await provider.publicClient.readContract({
            address: votingAddress,
            abi: votingAbi,
            functionName: "getVote",
            args: [voteId],
          })) as VoteData;

          tallies = {
            yea: formatEther(voteData[6]) + " LDO",
            nay: formatEther(voteData[7]) + " LDO",
            voting_power: formatEther(voteData[8]) + " LDO",
            support_required: formatPct(voteData[4]),
            min_accept_quorum: formatPct(voteData[5]),
            current_support:
              voteData[6] + voteData[7] > 0n
                ? formatPct(
                    (voteData[6] * 1_000_000_000_000_000_000n) /
                      (voteData[6] + voteData[7]),
                  )
                : "N/A",
            current_quorum:
              voteData[8] > 0n
                ? formatPct(
                    ((voteData[6] + voteData[7]) * 1_000_000_000_000_000_000n) /
                      voteData[8],
                  )
                : "N/A",
          };
        } catch {
          // Tally fetch is best-effort
        }

        return success({
          action: "cast_vote",
          vote_id: args.vote_id,
          direction: args.vote_for ? "Yea" : "Nay",
          ...result,
          tallies,
          summary: `Vote ${args.vote_for ? "Yea" : "Nay"} on proposal #${args.vote_id} ${result.status === "simulated" ? "simulated successfully" : "executed successfully"}.`,
        });
      } catch (err) {
        if (err instanceof WalletRequiredError) {
          return error(err.message);
        }
        return error(
          `Vote casting failed: ${extractErrorMessage(err, "Unknown error")}. Check wallet configuration and RPC connection.`,
        );
      }
    },
  );
}
