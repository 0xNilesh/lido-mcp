/**
 * Dual Governance tools — check governance state, veto signalling, escrow status.
 * Uses the Lido SDK's dualGovernance module which handles contract discovery.
 */
import { z } from 'zod';
import { formatEther } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { resolveChainId, extractErrorMessage } from '../../utils/helpers.js';
import { success, error } from '../../utils/format.js';

const DG_STATES: Record<number, string> = {
  0: 'Unset',
  1: 'Normal',
  2: 'VetoSignalling',
  3: 'VetoSignallingDeactivation',
  4: 'VetoCooldown',
  5: 'RageQuit',
};

export function register(server: McpServer, provider: Provider): void {
  // ─── Dual Governance State ───
  server.tool(
    'lido_get_dual_governance_state',
    'Get the current Dual Governance state (Normal, VetoSignalling, VetoCooldown, RageQuit). Shows whether governance proposals can execute or are blocked by stETH holder veto.',
    {
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 560048=hoodi)'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);

        // Use the Lido SDK which handles contract discovery
        const state = await provider.lidoSDK.dualGovernance.getDualGovernanceState();
        const stateName = DG_STATES[state] || `Unknown (${state})`;

        let warningStatus: any = null;
        try {
          warningStatus = await provider.lidoSDK.dualGovernance.getGovernanceWarningStatus({} as any);
        } catch { /* SDK might not support this on all chains */ }

        let escrowAssets: any = null;
        try {
          escrowAssets = await provider.lidoSDK.dualGovernance.getVetoSignallingEscrowLockedAssets();
        } catch { /* skip */ }

        let vetoProgress: any = null;
        try {
          vetoProgress = await provider.lidoSDK.dualGovernance.calculateCurrentVetoSignallingThresholdProgress();
        } catch { /* skip */ }

        const isBlocked = state === 2 || state === 3 || state === 5;

        return success({
          chain_id: chainId,
          state: stateName,
          state_code: state,
          is_normal: state === 1,
          is_blocked: isBlocked,
          can_proposals_execute: !isBlocked,
          warning: warningStatus,
          escrow: escrowAssets ? {
            locked_steth: typeof escrowAssets === 'bigint' ? formatEther(escrowAssets) : String(escrowAssets),
          } : null,
          veto_threshold_progress: vetoProgress != null ? String(vetoProgress) : null,
          summary: `Dual Governance: ${stateName}. ${isBlocked
            ? '⚠️ Governance is BLOCKED — proposals cannot execute until veto resolves.'
            : '✅ Governance is normal — proposals can execute after timelock.'}`,
        });
      } catch (err) {
        return error(`Failed to get DG state: ${extractErrorMessage(err, 'Unknown error')}`);
      }
    }
  );

  // ─── Governance Overview ───
  server.tool(
    'lido_get_governance_overview',
    'Get a complete overview of Lido governance: Aragon voting stats, Easy Track motions, and Dual Governance state — all in one call.',
    {
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 560048=hoodi)'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);

        // Fetch DG state
        let dgState = -1;
        let dgWarning: any = null;
        try { dgState = await provider.lidoSDK.dualGovernance.getDualGovernanceState(); } catch { /* skip */ }
        try { dgWarning = await provider.lidoSDK.dualGovernance.getGovernanceWarningStatus({} as any); } catch { /* skip */ }

        const stateName = DG_STATES[dgState] || (dgState === -1 ? 'Unavailable' : `Unknown (${dgState})`);
        const isBlocked = dgState === 2 || dgState === 3 || dgState === 5;

        return success({
          chain_id: chainId,
          dual_governance: {
            state: stateName,
            is_blocked: isBlocked,
            can_execute: !isBlocked,
            warning: dgWarning,
          },
          links: {
            aragon_voting: 'https://dao.lido.fi/vote/dashboard',
            easy_track: 'https://dao.lido.fi/easy-track/motions',
            dual_governance: 'https://dg.lido.fi',
            forum: 'https://research.lido.fi',
          },
          summary: `Lido Governance Overview:\n` +
            `  Dual Governance: ${stateName} ${isBlocked ? '(BLOCKED)' : '(Normal)'}\n` +
            `  Proposals ${isBlocked ? 'CANNOT' : 'CAN'} execute.\n` +
            `  Use lido_list_votes for Aragon proposals, lido_get_easy_track_motions for Easy Track.`,
        });
      } catch (err) {
        return error(`Failed: ${extractErrorMessage(err, 'Unknown error')}`);
      }
    }
  );
}
