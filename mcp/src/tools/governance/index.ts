import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { register as registerCastVote } from './cast-vote/index.js';
import { register as registerGetVote } from './get-vote/index.js';
import { register as registerGetVoteDetails } from './get-vote-details/index.js';
import { register as registerListVotes } from './list-votes/index.js';
import { register as registerGovernanceRead } from './governance-read/index.js';
import { register as registerDelegate } from './delegate/index.js';

export function register(server: McpServer, provider: Provider): void {
  registerCastVote(server, provider);
  registerGetVote(server, provider);
  registerGetVoteDetails(server, provider);
  registerListVotes(server, provider);
  registerGovernanceRead(server, provider);
  registerDelegate(server, provider);
}
