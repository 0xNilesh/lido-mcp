import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerRequest } from './request/index.js';
import { register as registerClaim } from './claim/index.js';
import { register as registerClaimSingle } from './claim-single/index.js';
import { register as registerClaimTo } from './claim-to/index.js';
import { register as registerStatus } from './status/index.js';
import { register as registerRequests } from './requests/index.js';
import { register as registerQueueInfo } from './queue-info/index.js';
import { register as registerClaimableEther } from './claimable-ether/index.js';
import { register as registerBunkerMode } from './bunker-mode/index.js';
import { register as registerNftOwner } from './nft-owner/index.js';
import { register as registerTransferNft } from './transfer-nft/index.js';
import { register as registerApproveNft } from './approve-nft/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerRequest(server, provider);
  registerClaim(server, provider);
  registerClaimSingle(server, provider);
  registerClaimTo(server, provider);
  registerStatus(server, provider);
  registerRequests(server, provider);
  registerQueueInfo(server, provider);
  registerClaimableEther(server, provider);
  registerBunkerMode(server, provider);
  registerNftOwner(server, provider);
  registerTransferNft(server, provider);
  registerApproveNft(server, provider);
}
