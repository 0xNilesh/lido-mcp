import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerStatus } from './status/index.js';
import { register as registerPrepare } from './prepare/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerStatus(server, provider);
  registerPrepare(server, provider);
}
