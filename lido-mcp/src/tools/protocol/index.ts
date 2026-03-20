import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerInfo } from './info/index.js';
import { register as registerFee } from './fee/index.js';
import { register as registerStakingModules } from './staking-modules/index.js';
import { register as registerNodeOperators } from './node-operators/index.js';
import { register as registerContractAddresses } from './contract-addresses/index.js';
import { register as registerSupportedChains } from './supported-chains/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerInfo(server, provider);
  registerFee(server, provider);
  registerStakingModules(server, provider);
  registerNodeOperators(server, provider);
  registerContractAddresses(server, provider);
  registerSupportedChains(server, provider);
}
