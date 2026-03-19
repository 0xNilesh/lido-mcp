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

interface WithdrawalStatus {
  amountOfStETH: bigint;
  amountOfShares: bigint;
  owner: string;
  timestamp: bigint;
  isFinalized: boolean;
  isClaimed: boolean;
}

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_withdrawal_requests",
    "Get all withdrawal request IDs and their statuses for an address",
    {
      address: z
        .string()
        .optional()
        .describe("Address to query (defaults to connected wallet)"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { address?: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        const requestIds = (await client.readContract({
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
            summary: `No withdrawal requests found for ${walletAddress}.`,
          });
        }

        const statuses = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "getWithdrawalStatus",
          args: [requestIds],
        })) as WithdrawalStatus[];

        const requests = requestIds.map((id, i) => {
          const s = statuses[i]!;
          return {
            request_id: id.toString(),
            amount_steth: formatEther(s.amountOfStETH),
            owner: s.owner,
            timestamp: s.timestamp.toString(),
            is_finalized: s.isFinalized,
            is_claimed: s.isClaimed,
          };
        });

        const pending = requests.filter((r) => !r.is_finalized && !r.is_claimed);
        const claimable = requests.filter((r) => r.is_finalized && !r.is_claimed);
        const claimed = requests.filter((r) => r.is_claimed);

        return success({
          address: walletAddress,
          total_requests: requests.length,
          pending_count: pending.length,
          claimable_count: claimable.length,
          claimed_count: claimed.length,
          requests,
          summary: `${walletAddress} has ${requests.length} withdrawal request(s): ${pending.length} pending, ${claimable.length} claimable, ${claimed.length} claimed.`,
        });
      } catch (err) {
        return error(
          `Withdrawal requests query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );
}
