import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";
import { registerWrap } from "./wrap.js";
import { registerUnwrap } from "./unwrap.js";

export function register(server: McpServer, provider: Provider): void {
  registerWrap(server, provider);
  registerUnwrap(server, provider);
}
