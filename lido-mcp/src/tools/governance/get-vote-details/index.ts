/**
 * Decodes an Aragon vote's EVM script into human-readable actions.
 * The script contains encoded calls to other contracts — we parse the
 * target addresses and function selectors to describe what the proposal does.
 */
import { z } from 'zod';
import { formatEther, parseAbiItem } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../../provider.js';
import { getContracts } from '../../../contracts.js';
import { resolveChainId, getClient } from '../../../utils/helpers.js';
import { success, error } from '../../../utils/format.js';
import { votingAbi } from '../../../abis/voting.js';

// Known function selectors → human-readable descriptions
const KNOWN_SELECTORS: Record<string, string> = {
  // Lido
  '0x8d6e9a5b': 'Update staking module',
  '0x6e553f65': 'Deposit',
  '0xa1903eab': 'Submit (stake ETH)',
  '0x75b25bhd': 'Set fee',
  '0x9b3ad19e': 'Set oracle',
  // Staking Router
  '0xc76eed2c': 'Add staking module',
  '0x5d2e7a06': 'Update staking module',
  '0xd0e7bba6': 'Set staking module status',
  // Node Operators Registry
  '0x9de3e554': 'Add node operator',
  '0x8da5cb5b': 'Set node operator name',
  '0x1e4e7230': 'Set node operator staking limit',
  '0xd3eca183': 'Set node operator reward address',
  // ACL / Permissions
  '0x0a8ed3db': 'Create permission',
  '0x83202bcf': 'Grant permission',
  '0x7e7db6e1': 'Revoke permission',
  // Agent / Finance
  '0xb61d27f6': 'Execute (agent forward)',
  '0xd6eb5910': 'New payment',
  '0x1b25b65f': 'Transfer tokens',
  // EasyTrack
  '0x4eda4e86': 'Add EasyTrack motion',
  '0x7e8af010': 'Remove EasyTrack motion',
  // Aragon
  '0xd948d468': 'Forward (Aragon)',
  '0x4c4fce22': 'New vote (nested)',
  // Token Manager
  '0x16d2e4ab': 'Assign LDO tokens',
};

// Known contract addresses → names
const KNOWN_CONTRACTS: Record<string, string> = {
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido',
  '0x55032650b14df07b85bf18a3a3ec8e0af2e028d5': 'Node Operators Registry (Curated)',
  '0xfddf38947afb03c621c71b06c9c70bce73f12999': 'Staking Router',
  '0x889edc2edab5f40e902b864ad4d7ade8e412f9b1': 'Withdrawal Queue',
  '0x3e40d73eb977dc6a537af587d48316fee66e9c8c': 'Aragon Agent',
  '0xb8ffc3cd6e7cf5a098a1c92f48009765b24088dc': 'Lido DAO',
  '0x2e59a20f205bb85a89c53f1936454680651e618e': 'Aragon Voting',
  '0xe76c52750019b80b43e36df30bf4060eb73f573a': 'Burner',
  '0xc1d0b3de6792bf6b4b37eccdcc24e45978cfd2eb': 'Lido Locator',
  '0x5a98fcbea516cf06857215779fd812ca3bef1b32': 'LDO Token',
};

function decodeScript(scriptHex: string): Array<{ target: string; targetName: string; selector: string; action: string; dataLength: number }> {
  const actions: Array<{ target: string; targetName: string; selector: string; action: string; dataLength: number }> = [];

  // Aragon EVM script format: 0x00000001 prefix, then [target(20 bytes)][calldata_length(4 bytes)][calldata(variable)]
  const hex = scriptHex.startsWith('0x') ? scriptHex.substring(2) : scriptHex;

  // Skip the 4-byte spec ID (00000001)
  let offset = 8;

  while (offset < hex.length) {
    if (offset + 48 > hex.length) break; // Need at least target(40) + length(8)

    const target = '0x' + hex.substring(offset, offset + 40);
    offset += 40;

    const dataLength = parseInt(hex.substring(offset, offset + 8), 16);
    offset += 8;

    if (offset + dataLength * 2 > hex.length) break;

    const calldata = hex.substring(offset, offset + dataLength * 2);
    offset += dataLength * 2;

    const selector = '0x' + calldata.substring(0, 8);
    const targetName = KNOWN_CONTRACTS[target.toLowerCase()] || `Contract ${target.substring(0, 10)}...`;
    const action = KNOWN_SELECTORS[selector] || `Call ${selector}`;

    actions.push({ target, targetName, selector, action, dataLength });
  }

  return actions;
}

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    'lido_get_vote_details',
    'Get detailed information about a specific Lido governance vote including a decoded description of what the proposal does (parsed from on-chain script). Shows vote tallies, quorum status, timeline, and decoded actions.',
    {
      vote_id: z.number().describe('The vote/proposal ID'),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 560048=hoodi). Defaults to server chain.'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);

        // Fetch full vote data including script
        const vote = await client.readContract({
          address: contracts.voting,
          abi: [{
            name: 'getVote',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: '_voteId', type: 'uint256' }],
            outputs: [
              { name: 'open', type: 'bool' },
              { name: 'executed', type: 'bool' },
              { name: 'startDate', type: 'uint64' },
              { name: 'snapshotBlock', type: 'uint64' },
              { name: 'supportRequired', type: 'uint64' },
              { name: 'minAcceptQuorum', type: 'uint64' },
              { name: 'yea', type: 'uint256' },
              { name: 'nay', type: 'uint256' },
              { name: 'votingPower', type: 'uint256' },
              { name: 'script', type: 'bytes' },
              { name: 'phase', type: 'uint8' },
            ],
          }],
          functionName: 'getVote',
          args: [BigInt(args.vote_id)],
        }) as unknown as any[];

        const [open, executed, startDate, snapshotBlock, supportRequired, minAcceptQuorum, yea, nay, votingPower, script, phase] = vote;

        // Fetch metadata from StartVote event (contains human-readable description)
        let metadata = '';
        let title = '';
        let description = '';
        let ipfsHash = '';
        try {
          const logs = await client.getLogs({
            address: contracts.voting,
            event: parseAbiItem('event StartVote(uint256 indexed voteId, address indexed creator, string metadata)'),
            args: { voteId: BigInt(args.vote_id) },
            fromBlock: snapshotBlock as bigint,
            toBlock: (snapshotBlock as bigint) + 1000n,
          });
          if (logs.length > 0 && logs[0]!.args.metadata) {
            metadata = logs[0]!.args.metadata;
            // Extract IPFS hash if present (format: ...lidovoteipfs://bafkrei...)
            const ipfsMatch = metadata.match(/lidovoteipfs:\/\/(\S+)/);
            if (ipfsMatch) ipfsHash = ipfsMatch[1]!;
            // Clean metadata — remove IPFS hash from display text
            const cleanMeta = metadata.replace(/lidovoteipfs:\/\/\S+/, '').trim();

            // Fetch human-readable description from IPFS
            if (ipfsMatch) {
              try {
                const ipfsGateways = ['https://ipfs.io/ipfs/', 'https://w3s.link/ipfs/', 'https://dweb.link/ipfs/'];
                for (const gw of ipfsGateways) {
                  try {
                    const resp = await fetch(gw + ipfsMatch[1], { signal: AbortSignal.timeout(5000) });
                    if (resp.ok) {
                      const ipfsText = await resp.text();
                      if (ipfsText && ipfsText.length > 5) {
                        title = ipfsText.length > 200 ? ipfsText.substring(0, 200) + '...' : ipfsText;
                        break;
                      }
                    }
                  } catch { /* try next gateway */ }
                }
              } catch { /* IPFS fetch failed, use on-chain metadata */ }
            }

            // Fallback to on-chain metadata if IPFS failed
            if (!title) {
              const firstLine = cleanMeta.split('\n')[0]?.trim() || '';
              title = firstLine.length > 200 ? firstLine.substring(0, 200) + '...' : firstLine;
            }
            description = cleanMeta;
          }
        } catch {
          // Event fetch failed — continue without metadata
        }

        // Decode the script
        const scriptHex = script as string;
        const decodedActions = decodeScript(scriptHex);

        // Build human-readable description
        const actionDescriptions = decodedActions.map((a, i) =>
          `${i + 1}. ${a.action} on ${a.targetName}`
        );

        const yeaNum = parseFloat(formatEther(yea as bigint));
        const nayNum = parseFloat(formatEther(nay as bigint));
        const totalVoted = yeaNum + nayNum;
        const vpNum = parseFloat(formatEther(votingPower as bigint));
        const supportPct = totalVoted > 0 ? ((yeaNum / totalVoted) * 100).toFixed(2) : '0';
        const quorumPct = vpNum > 0 ? ((totalVoted / vpNum) * 100).toFixed(2) : '0';

        const startDateStr = new Date(Number(startDate) * 1000).toISOString();
        const endDate = new Date((Number(startDate) + 3 * 24 * 3600) * 1000).toISOString();
        const objectionEnd = new Date((Number(startDate) + 5 * 24 * 3600) * 1000).toISOString();

        const status = open ? 'open' : executed ? 'executed' : 'closed';
        const phaseNames = ['Main Vote', 'Objection Phase', 'Closed'];

        const result = {
          vote_id: args.vote_id,
          title: title || `Vote #${args.vote_id}`,
          description: description || 'No description available on-chain.',
          status,
          phase: phaseNames[phase as number] || 'Unknown',
          is_open: open,
          is_executed: executed,
          ipfs: ipfsHash || undefined,

          // Timeline
          timeline: {
            start: startDateStr,
            main_vote_ends: endDate,
            objection_ends: objectionEnd,
            snapshot_block: snapshotBlock?.toString(),
          },

          // Tallies
          tallies: {
            yea: `${yeaNum.toFixed(2)} LDO`,
            nay: `${nayNum.toFixed(2)} LDO`,
            total_voted: `${totalVoted.toFixed(2)} LDO`,
            voting_power: `${vpNum.toFixed(2)} LDO`,
            support: `${supportPct}%`,
            quorum: `${quorumPct}%`,
            support_required: `${(Number(supportRequired) / 1e16).toFixed(0)}%`,
            quorum_required: `${(Number(minAcceptQuorum) / 1e16).toFixed(0)}%`,
            passed: parseFloat(supportPct) >= Number(supportRequired) / 1e16 && parseFloat(quorumPct) >= Number(minAcceptQuorum) / 1e16,
          },

          // Decoded proposal actions
          actions: {
            count: decodedActions.length,
            description: actionDescriptions,
            raw_targets: decodedActions.map(a => ({ contract: a.targetName, address: a.target, function: a.action })),
          },

          // Links
          links: {
            dao_ui: `https://dao.lido.fi/vote/${args.vote_id}`,
            forum: `https://research.lido.fi`,
          },

          summary: `Vote #${args.vote_id}: ${status.toUpperCase()}. ` +
            (title ? `"${title.substring(0, 150)}" ` : '') +
            `${supportPct}% FOR (${yeaNum.toFixed(0)} LDO) / ${(100 - parseFloat(supportPct)).toFixed(2)}% AGAINST (${nayNum.toFixed(0)} LDO). ` +
            `Quorum: ${quorumPct}% (required: ${(Number(minAcceptQuorum) / 1e16).toFixed(0)}%). ` +
            `Phase: ${phaseNames[phase as number] || 'Unknown'}. ` +
            `This proposal contains ${decodedActions.length} action(s). ` +
            `View full details at dao.lido.fi/vote/${args.vote_id}`,
        };

        return success(result);
      } catch (err: unknown) {
        return error(`Failed to get vote details: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
