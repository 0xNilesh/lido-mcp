import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerOverview } from './overview/index.js';
import { register as registerL2Balances } from './l2-balances/index.js';
import { register as registerSummary } from './summary/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerOverview(server, provider);
  registerL2Balances(server, provider);
  registerSummary(server, provider);
}
