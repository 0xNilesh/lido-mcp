import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";
import { registerRequestWithdrawal } from "./request.js";
import { registerClaimWithdrawal } from "./claim.js";

export function register(server: McpServer, provider: Provider): void {
  registerRequestWithdrawal(server, provider);
  registerClaimWithdrawal(server, provider);
}
