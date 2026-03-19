import { z } from "zod";
import { success, error } from "../../utils/format.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_nft_owner",
    "Get the owner of a withdrawal request NFT by its request ID",
    {
      request_id: z.string().describe("The withdrawal request (NFT) ID to look up"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { request_id: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const requestId = BigInt(args.request_id);

        const owner = (await client.readContract({
          address: contracts.withdrawalQueue,
          abi: withdrawalQueueAbi,
          functionName: "ownerOf",
          args: [requestId],
        })) as string;

        return success({
          request_id: args.request_id,
          owner,
          summary: `Withdrawal NFT #${args.request_id} is owned by ${owner}.`,
        });
      } catch (err) {
        return error(
          `NFT owner query failed: ${extractErrorMessage(err, "Unknown error")}. The request ID may not exist or the RPC connection may be down.`,
        );
      }
    },
  );
}
