import { z } from "zod";
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
    "lido_get_nft_owner",
    "Get the owner of a withdrawal request NFT by its request ID",
    {
      request_id: z.string().describe("The withdrawal request (NFT) ID to look up"),
    },
    async (args: { request_id: string }) => {
      try {
        const requestId = BigInt(args.request_id);

        const owner = (await provider.publicClient.readContract({
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
