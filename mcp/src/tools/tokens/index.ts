import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerTransfer } from './transfer/index.js';
import { register as registerTransferLdo } from './transfer-ldo/index.js';
import { register as registerApprove } from './approve/index.js';
import { register as registerRevokeApprovals } from './revoke-approvals/index.js';
import { register as registerIncreaseAllowance } from './increase-allowance/index.js';
import { register as registerBalance } from './balance/index.js';
import { register as registerAllowance } from './allowance/index.js';
import { register as registerTokenInfo } from './token-info/index.js';
import { register as registerConvert } from './convert/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerTransfer(server, provider);
  registerTransferLdo(server, provider);
  registerApprove(server, provider);
  registerRevokeApprovals(server, provider);
  registerIncreaseAllowance(server, provider);
  registerBalance(server, provider);
  registerAllowance(server, provider);
  registerTokenInfo(server, provider);
  registerConvert(server, provider);
}
