import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerGetRewards } from './get-rewards/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerGetRewards(server, provider);
}
