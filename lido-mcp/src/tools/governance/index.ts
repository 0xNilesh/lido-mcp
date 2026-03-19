import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";
import { registerCastVote } from "./cast-vote.js";
import { registerGetVote } from "./get-vote.js";
import { registerListVotes } from "./list-votes.js";

export function register(server: McpServer, provider: Provider): void {
  registerCastVote(server, provider);
  registerGetVote(server, provider);
  registerListVotes(server, provider);
}
