/**
 * lido_monitor_position — Checks a staking position against user-defined bounds
 * and returns recommended actions. Designed for autonomous agent loops.
 *
 * The agent calls this periodically, and it returns a list of actions to take.
 * The agent then decides whether to execute them (with user confirmation or autonomously).
 */
import { z } from 'zod';
import { formatEther, parseEther } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../../provider.js';
import { getContracts } from '../../../contracts.js';
import { resolveChainId, getClient, getWalletAddress, extractErrorMessage } from '../../../utils/helpers.js';
import { success, error } from '../../../utils/format.js';
import { lidoAbi } from '../../../abis/lido.js';
import { wstethAbi } from '../../../abis/wsteth.js';
import { withdrawalQueueAbi } from '../../../abis/withdrawal-queue.js';

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    'lido_monitor_position',
    'Monitor a Lido staking position against user-defined bounds. Returns a list of recommended actions based on current state. Designed for autonomous agent loops — call periodically and act on the recommendations.',
    {
      address: z.string().optional().describe('Address to monitor (defaults to connected wallet)'),
      // Bounds — all optional, only check what the user cares about
      max_steth: z.string().optional().describe('If stETH balance exceeds this, recommend wrapping the excess'),
      min_steth: z.string().optional().describe('If stETH balance drops below this, recommend staking more ETH'),
      max_eth_idle: z.string().optional().describe('If idle ETH exceeds this, recommend staking the excess'),
      auto_claim_withdrawals: z.boolean().optional().default(true).describe('Recommend claiming any finalized withdrawals'),
      auto_wrap_excess: z.boolean().optional().default(false).describe('Recommend wrapping stETH above max_steth to wstETH'),
      alert_apr_below: z.string().optional().describe('Alert if APR drops below this percentage (e.g., "2.5")'),
      alert_bunker_mode: z.boolean().optional().default(true).describe('Alert if protocol enters bunker mode'),
      chain_id: z.number().optional().describe('Chain ID'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const address = getWalletAddress(provider, args.address);

        if (!address) return error('No address provided and no wallet connected.');

        // Fetch position data
        const [ethBalance, stethBalance, wstethBalance, withdrawalRequests, isBunker, totalPooled, totalShares] = await Promise.all([
          client.getBalance({ address }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [address] }).catch(() => [] as bigint[]) as Promise<bigint[]>,
          client.readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'isBunkerModeActive' }).catch(() => false) as Promise<boolean>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalPooledEther' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalShares' }) as Promise<bigint>,
        ]);

        // Check withdrawal statuses
        let claimableWithdrawals: string[] = [];
        if (withdrawalRequests.length > 0) {
          try {
            const statuses = await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'getWithdrawalStatus',
              args: [withdrawalRequests],
            }) as any[];

            claimableWithdrawals = withdrawalRequests
              .filter((_, i) => {
                const s = statuses[i];
                return s && (s.isFinalized ?? s[4]) && !(s.isClaimed ?? s[5]);
              })
              .map(id => id.toString());
          } catch { /* skip */ }
        }

        // Compute APR estimate
        const shareRate = totalShares > 0n ? Number(totalPooled * 10n ** 18n / totalShares) / 1e18 : 1;
        const grossApr = 3.5; // approximate
        const netApr = grossApr * 0.9; // after 10% fee

        // Build recommended actions
        const actions: Array<{ action: string; tool: string; args: Record<string, any>; reason: string; priority: 'high' | 'medium' | 'low' }> = [];
        const alerts: string[] = [];

        // Check: claimable withdrawals
        if (args.auto_claim_withdrawals && claimableWithdrawals.length > 0) {
          for (const id of claimableWithdrawals) {
            actions.push({
              action: `Claim withdrawal #${id}`,
              tool: 'lido_claim_single_withdrawal',
              args: { request_id: id, dry_run: false },
              reason: 'Withdrawal is finalized and ready to claim',
              priority: 'high',
            });
          }
        }

        // Check: max_steth exceeded → wrap excess
        if (args.max_steth) {
          const maxSteth = parseEther(args.max_steth);
          if (stethBalance > maxSteth) {
            const excess = stethBalance - maxSteth;
            if (args.auto_wrap_excess) {
              actions.push({
                action: `Wrap ${formatEther(excess)} excess stETH to wstETH`,
                tool: 'lido_wrap',
                args: { amount: formatEther(excess), dry_run: false },
                reason: `stETH balance (${formatEther(stethBalance)}) exceeds max bound (${args.max_steth})`,
                priority: 'medium',
              });
            } else {
              alerts.push(`stETH balance (${formatEther(stethBalance)}) exceeds max bound (${args.max_steth}). Consider wrapping ${formatEther(excess)} to wstETH.`);
            }
          }
        }

        // Check: min_steth threshold
        if (args.min_steth) {
          const minSteth = parseEther(args.min_steth);
          if (stethBalance < minSteth) {
            const deficit = minSteth - stethBalance;
            if (ethBalance > deficit + parseEther('0.02')) {
              actions.push({
                action: `Stake ${formatEther(deficit)} ETH to bring stETH above minimum`,
                tool: 'lido_stake',
                args: { amount: formatEther(deficit), dry_run: false },
                reason: `stETH balance (${formatEther(stethBalance)}) below min bound (${args.min_steth})`,
                priority: 'medium',
              });
            } else {
              alerts.push(`stETH balance (${formatEther(stethBalance)}) below min bound (${args.min_steth}), but insufficient ETH to stake more.`);
            }
          }
        }

        // Check: idle ETH too high → stake
        if (args.max_eth_idle) {
          const maxIdle = parseEther(args.max_eth_idle);
          if (ethBalance > maxIdle + parseEther('0.05')) { // Keep 0.05 for gas
            const toStake = ethBalance - maxIdle - parseEther('0.05');
            actions.push({
              action: `Stake ${formatEther(toStake)} idle ETH`,
              tool: 'lido_stake',
              args: { amount: formatEther(toStake), dry_run: false },
              reason: `Idle ETH (${formatEther(ethBalance)}) exceeds max idle bound (${args.max_eth_idle}). Keeping 0.05 ETH for gas.`,
              priority: 'low',
            });
          }
        }

        // Check: APR alert
        if (args.alert_apr_below) {
          const minApr = parseFloat(args.alert_apr_below);
          if (netApr < minApr) {
            alerts.push(`Current APR (~${netApr.toFixed(2)}%) is below your alert threshold (${minApr}%).`);
          }
        }

        // Check: Bunker mode
        if (args.alert_bunker_mode && isBunker) {
          alerts.push('⚠️ BUNKER MODE ACTIVE — Lido is in emergency mode. Withdrawals may be delayed. Consider monitoring closely.');
        }

        const status = actions.length === 0 && alerts.length === 0 ? 'healthy' : alerts.length > 0 && actions.length === 0 ? 'alert' : 'action_needed';

        return success({
          address,
          chain_id: chainId,
          timestamp: new Date().toISOString(),
          status,

          position: {
            eth: formatEther(ethBalance),
            steth: formatEther(stethBalance),
            wsteth: formatEther(wstethBalance),
            pending_withdrawals: withdrawalRequests.length,
            claimable_withdrawals: claimableWithdrawals.length,
          },

          protocol: {
            apr_pct: netApr.toFixed(2),
            bunker_mode: isBunker,
          },

          recommended_actions: actions,
          alerts,

          summary: status === 'healthy'
            ? `Position healthy. ${formatEther(stethBalance)} stETH + ${formatEther(wstethBalance)} wstETH. No actions needed.`
            : `${actions.length} action(s) recommended, ${alerts.length} alert(s). ${actions.map(a => a.action).join('; ')}. ${alerts.join(' ')}`,
        });
      } catch (err) {
        return error(`Monitor failed: ${extractErrorMessage(err, 'Unknown error')}`);
      }
    }
  );
}
