import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerStake } from './stake/index.js';
import { register as registerStakeAndWrap } from './stake-and-wrap/index.js';
import { register as registerStakingLimit } from './staking-limit/index.js';
import { register as registerStakingPaused } from './staking-paused/index.js';
import { register as registerBeaconStats } from './beacon-stats/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerStake(server, provider);
  registerStakeAndWrap(server, provider);
  registerStakingLimit(server, provider);
  registerStakingPaused(server, provider);
  registerBeaconStats(server, provider);
}
