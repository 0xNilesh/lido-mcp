import { z } from "zod";
import { success, error } from "../../utils/format.js";
import { votingAbi } from "../../abis/voting.js";
import { getContracts } from "../../contracts.js";
import {
  resolveChainId,
  getClient,
  getWalletAddress,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_delegate",
    "Get the current governance delegate for an address",
    {
      address: z
        .string()
        .optional()
        .describe("Address to check delegate for (defaults to connected wallet)"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { address?: string; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const delegate = (await client.readContract({
          address: contracts.voting,
          abi: votingAbi,
          functionName: "getDelegate",
          args: [walletAddress],
        })) as string;

        const zeroAddr = "0x0000000000000000000000000000000000000000";
        const hasDelegate = delegate !== zeroAddr;

        return success({
          address: walletAddress,
          delegate: hasDelegate ? delegate : null,
          has_delegate: hasDelegate,
          summary: hasDelegate
            ? `${walletAddress} has delegated voting power to ${delegate}.`
            : `${walletAddress} has no governance delegate assigned.`,
        });
      } catch (err) {
        return error(
          `Delegate query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_can_vote",
    "Check whether an address can vote on a specific governance proposal",
    {
      vote_id: z.number().describe("The vote ID to check"),
      address: z
        .string()
        .optional()
        .describe("Address to check (defaults to connected wallet)"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { vote_id: number; address?: string; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const canVote = (await client.readContract({
          address: contracts.voting,
          abi: votingAbi,
          functionName: "canVote",
          args: [BigInt(args.vote_id), walletAddress],
        })) as boolean;

        return success({
          vote_id: args.vote_id,
          address: walletAddress,
          can_vote: canVote,
          summary: `${walletAddress} ${canVote ? "can" : "cannot"} vote on vote #${args.vote_id}.`,
        });
      } catch (err) {
        return error(
          `canVote query failed: ${extractErrorMessage(err, "Unknown error")}. Check the vote ID and RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_voter_state",
    "Get the voting state of an address for a specific governance proposal (absent, yea, or nay)",
    {
      vote_id: z.number().describe("The vote ID to check"),
      address: z
        .string()
        .optional()
        .describe("Address to check (defaults to connected wallet)"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { vote_id: number; address?: string; chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const state = (await client.readContract({
          address: contracts.voting,
          abi: votingAbi,
          functionName: "getVoterState",
          args: [BigInt(args.vote_id), walletAddress],
        })) as number;

        const stateLabels: Record<number, string> = { 0: "absent", 1: "yea", 2: "nay" };
        const stateLabel = stateLabels[state] ?? `unknown(${state})`;

        return success({
          vote_id: args.vote_id,
          address: walletAddress,
          state: stateLabel,
          state_raw: state,
          summary: `${walletAddress} voter state on vote #${args.vote_id}: ${stateLabel}.`,
        });
      } catch (err) {
        return error(
          `Voter state query failed: ${extractErrorMessage(err, "Unknown error")}. Check the vote ID and RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_vote_count",
    "Get the total number of governance votes (proposals) created",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const contracts = getContracts(resolveChainId(provider, args.chain_id));
        const client = getClient(provider, args.chain_id);
        const count = (await client.readContract({
          address: contracts.voting,
          abi: votingAbi,
          functionName: "votesLength",
        })) as bigint;

        return success({
          vote_count: Number(count),
          summary: `Total governance votes: ${Number(count)}.`,
        });
      } catch (err) {
        return error(
          `Vote count query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
