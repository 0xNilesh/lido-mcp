import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerListVaults } from './list-vaults/index.js';
import { register as registerGetVault } from './get-vault/index.js';
import { register as registerVaultFund } from './vault-fund/index.js';
import { register as registerVaultWithdraw } from './vault-withdraw/index.js';
import { register as registerVaultPause } from './vault-pause/index.js';
import { register as registerVaultResume } from './vault-resume/index.js';
import { register as registerVaultHubStats } from './vault-hub-stats/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerListVaults(server, provider);
  registerGetVault(server, provider);
  registerVaultFund(server, provider);
  registerVaultWithdraw(server, provider);
  registerVaultPause(server, provider);
  registerVaultResume(server, provider);
  registerVaultHubStats(server, provider);
}
