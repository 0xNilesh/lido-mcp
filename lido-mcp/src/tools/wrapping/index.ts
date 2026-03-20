import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerWrap } from './wrap/index.js';
import { register as registerUnwrap } from './unwrap/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerWrap(server, provider);
  registerUnwrap(server, provider);
}
