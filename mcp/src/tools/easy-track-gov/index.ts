/**
 * Easy Track governance tools — list motions, get motion details, object to motions.
 */
import { z } from 'zod';
import { formatEther } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { getContracts } from '../../contracts.js';
import { resolveChainId, getClient, getWalletAddress, extractErrorMessage } from '../../utils/helpers.js';
import { success, error } from '../../utils/format.js';

const EASY_TRACK_MAINNET = '0xF0211b7660680B49De1A7E9f25C65660F0a13Fea' as const;
const EASY_TRACK_HOODI = '0x1763b9ED3586B08AE796c7787811a2E1bc16163a' as const;

function getEasyTrackAddress(chainId: number): `0x${string}` {
  if (chainId === 1) return EASY_TRACK_MAINNET;
  if (chainId === 560048) return EASY_TRACK_HOODI;
  return EASY_TRACK_MAINNET; // fallback
}

const motionAbi = [{
  name: 'getMotions',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{
    type: 'tuple[]',
    components: [
      { name: 'id', type: 'uint256' },
      { name: 'evmScriptFactory', type: 'address' },
      { name: 'creator', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'startDate', type: 'uint256' },
      { name: 'snapshotBlock', type: 'uint256' },
      { name: 'objectionsThreshold', type: 'uint256' },
      { name: 'objectionsAmount', type: 'uint256' },
      { name: 'objectionsAmountPct', type: 'uint256' },
    ],
  }],
}, {
  name: 'motionsCountLimit',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'uint256' }],
}, {
  name: 'paused',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'bool' }],
}, {
  name: 'objectToMotion',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: '_motionId', type: 'uint256' }],
  outputs: [],
}, {
  name: 'canObjectToMotion',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: '_motionId', type: 'uint256' }, { name: '_objector', type: 'address' }],
  outputs: [{ type: 'bool' }],
}] as const;

export function register(server: McpServer, provider: Provider): void {
  // ─── List Easy Track Motions ───
  server.tool(
    'lido_get_easy_track_motions',
    'Get all active Easy Track motions (lightweight governance for routine Lido operations). Shows motion ID, creator, start date, objections status, and time remaining.',
    {
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 560048=hoodi)'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const client = getClient(provider, args.chain_id);
        const etAddr = getEasyTrackAddress(chainId);

        const [motions, limit, paused] = await Promise.all([
          client.readContract({ address: etAddr, abi: motionAbi, functionName: 'getMotions' }) as Promise<any[]>,
          client.readContract({ address: etAddr, abi: motionAbi, functionName: 'motionsCountLimit' }) as Promise<bigint>,
          client.readContract({ address: etAddr, abi: motionAbi, functionName: 'paused' }) as Promise<boolean>,
        ]);

        const now = Math.floor(Date.now() / 1000);
        const formattedMotions = motions.map((m: any) => {
          const startTime = Number(m.startDate);
          const duration = Number(m.duration);
          const endTime = startTime + duration;
          const timeLeft = Math.max(0, endTime - now);
          const hoursLeft = Math.floor(timeLeft / 3600);
          const objPct = Number(m.objectionsAmountPct) / 100;

          return {
            id: Number(m.id),
            creator: m.creator,
            factory: m.evmScriptFactory,
            started: new Date(startTime * 1000).toISOString(),
            ends: new Date(endTime * 1000).toISOString(),
            time_remaining: timeLeft > 0 ? `${hoursLeft}h ${Math.floor((timeLeft % 3600) / 60)}m` : 'Ended',
            is_active: timeLeft > 0,
            objections: formatEther(m.objectionsAmount),
            objections_pct: `${objPct.toFixed(2)}%`,
            objections_threshold: `${(Number(m.objectionsThreshold) / 100).toFixed(2)}%`,
          };
        });

        return success({
          easy_track: etAddr,
          paused,
          motions_limit: Number(limit),
          active_motions: formattedMotions.filter((m: any) => m.is_active).length,
          total_motions: formattedMotions.length,
          motions: formattedMotions,
          summary: `Easy Track: ${formattedMotions.length} motion(s). ${formattedMotions.filter((m: any) => m.is_active).length} active. ${paused ? 'PAUSED' : 'Running'}. Max ${Number(limit)} concurrent motions.`,
        });
      } catch (err) {
        return error(`Failed to fetch Easy Track motions: ${extractErrorMessage(err, 'Unknown error')}`);
      }
    }
  );

  // ─── Object to Easy Track Motion ───
  server.tool(
    'lido_object_to_motion',
    'Object to an active Easy Track motion using stETH. If enough objections are raised, the motion is cancelled.',
    {
      motion_id: z.number().describe('The Easy Track motion ID to object to'),
      dry_run: z.boolean().default(false).describe('Simulate without executing'),
      chain_id: z.number().optional().describe('Chain ID'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const client = getClient(provider, args.chain_id);
        const etAddr = getEasyTrackAddress(chainId);

        if (args.dry_run) {
          // Check if user can object
          const walletAddr = getWalletAddress(provider);
          if (walletAddr) {
            const canObject = await client.readContract({
              address: etAddr,
              abi: motionAbi,
              functionName: 'canObjectToMotion',
              args: [BigInt(args.motion_id), walletAddr],
            });
            return success({
              dry_run: true,
              motion_id: args.motion_id,
              can_object: canObject,
              summary: canObject
                ? `You CAN object to motion #${args.motion_id}. Set dry_run=false to submit your objection.`
                : `You CANNOT object to motion #${args.motion_id}. You may have already objected or don't hold stETH.`,
            });
          }
          return success({ dry_run: true, summary: 'Connect wallet to check if you can object.' });
        }

        // Actually object — needs wallet
        if (!provider.walletClient || !provider.account) {
          return error('Wallet not configured. Set PRIVATE_KEY to object to motions.');
        }

        const { request } = await client.simulateContract({
          address: etAddr,
          abi: motionAbi,
          functionName: 'objectToMotion',
          args: [BigInt(args.motion_id)],
          account: provider.account,
        });
        const hash = await provider.walletClient.writeContract(request as any);
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });

        return success({
          motion_id: args.motion_id,
          tx_hash: hash,
          gas_used: receipt.gasUsed.toString(),
          status: receipt.status,
          summary: `Objected to Easy Track motion #${args.motion_id}. Tx: ${hash}`,
        });
      } catch (err) {
        return error(`Failed to object: ${extractErrorMessage(err, 'Unknown error')}`);
      }
    }
  );
}
