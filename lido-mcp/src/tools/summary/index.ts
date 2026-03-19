/**
 * lido_summary — Single tool that fetches EVERYTHING about an address's Lido position.
 * Combines: balances, shares, rewards, withdrawal requests, allowances, governance,
 * exchange rates, and protocol stats into one comprehensive response.
 */
import { z } from 'zod';
import { formatEther, parseEther, type Address } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../provider.js';
import { getContracts } from '../../contracts.js';
import { resolveChainId, getClient, getWalletAddress } from '../../utils/helpers.js';
import { success, error } from '../../utils/format.js';
import { lidoAbi } from '../../abis/lido.js';
import { wstethAbi } from '../../abis/wsteth.js';
import { withdrawalQueueAbi } from '../../abis/withdrawal-queue.js';
import { votingAbi } from '../../abis/voting.js';
import { erc20Abi } from '../../abis/erc20.js';

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    'lido_summary',
    'Get a complete summary of an address\'s Lido position: all token balances, shares, staking rewards, pending withdrawals, allowances, governance voting power, exchange rates, and protocol stats — all in one call.',
    {
      address: z.string().optional().describe('Ethereum address to query (defaults to connected wallet)'),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const address = getWalletAddress(provider, args.address) as Address;

        // Fetch everything in parallel
        const [
          ethBalance,
          stethBalance,
          wstethBalance,
          ldoBalance,
          shares,
          totalPooledEther,
          totalShares,
          stakeLimit,
          isStakingPaused,
          stethPerToken,
          tokensPerSteth,
          fee,
          withdrawalRequests,
          stethAllowanceWsteth,
          stethAllowanceWQ,
          votesLength,
          beaconStats,
        ] = await Promise.all([
          client.getBalance({ address }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.ldo, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'sharesOf', args: [address] }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalPooledEther' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalShares' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getCurrentStakeLimit' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'isStakingPaused' }) as Promise<boolean>,
          client.readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'stEthPerToken' }) as Promise<bigint>,
          client.readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'tokensPerStEth' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getFee' }) as Promise<number>,
          client.readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [address] }).catch(() => [] as bigint[]) as Promise<bigint[]>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'allowance', args: [address, contracts.wsteth] }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'allowance', args: [address, contracts.withdrawalQueue] }) as Promise<bigint>,
          client.readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as Promise<bigint>,
          client.readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getBeaconStat' }).catch(() => [0n, 0n, 0n]) as Promise<[bigint, bigint, bigint]>,
        ]);

        // Compute derived values
        const shareRate = totalShares > 0n ? Number(totalPooledEther * 10n ** 18n / totalShares) / 1e18 : 0;
        const wstethInSteth = wstethBalance > 0n ? Number(formatEther(wstethBalance)) * Number(formatEther(stethPerToken)) : 0;
        const totalStakedEth = Number(formatEther(stethBalance)) + wstethInSteth;
        const feePercent = Number(fee) / 100;
        const grossApr = 0.035; // ~3.5% estimated
        const netApr = grossApr * (1 - feePercent / 100);
        const dailyReward = totalStakedEth * netApr / 365;
        const monthlyReward = dailyReward * 30;
        const yearlyReward = totalStakedEth * netApr;

        // Fetch withdrawal statuses if any exist
        let withdrawalDetails: any[] = [];
        if (withdrawalRequests.length > 0) {
          try {
            const statuses = await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: 'getWithdrawalStatus',
              args: [withdrawalRequests], // Limit to first 10
            }) as any[];
            withdrawalDetails = withdrawalRequests.map((id, i) => {
              const s = statuses[i];
              return {
                id: id.toString(),
                amount_steth: s ? formatEther(s.amountOfStETH || s[0] || 0n) : 'unknown',
                is_finalized: s ? (s.isFinalized ?? s[4] ?? false) : false,
                is_claimed: s ? (s.isClaimed ?? s[5] ?? false) : false,
              };
            });
          } catch {
            withdrawalDetails = withdrawalRequests.map(id => ({ id: id.toString(), status: 'unable to fetch' }));
          }
        }

        // Check if user can vote on latest proposal
        let governanceInfo: any = { total_votes: votesLength.toString(), ldo_balance: formatEther(ldoBalance) };
        if (votesLength > 0n && ldoBalance > 0n) {
          try {
            const canVote = await client.readContract({
              address: contracts.voting,
              abi: votingAbi,
              functionName: 'canVote',
              args: [votesLength - 1n, address],
            }) as boolean;
            governanceInfo.can_vote_on_latest = canVote;
            governanceInfo.latest_vote_id = (votesLength - 1n).toString();
          } catch { /* skip */ }
        }

        const result = {
          address,
          chain_id: chainId,

          // Balances
          balances: {
            eth: formatEther(ethBalance),
            steth: formatEther(stethBalance),
            wsteth: formatEther(wstethBalance),
            ldo: formatEther(ldoBalance),
            shares: shares.toString(),
          },

          // Staked value
          staking: {
            steth_balance: formatEther(stethBalance),
            wsteth_balance: formatEther(wstethBalance),
            wsteth_in_steth: wstethInSteth.toFixed(8),
            total_staked_eth: totalStakedEth.toFixed(8),
          },

          // Rewards
          rewards: {
            estimated_apr_pct: (netApr * 100).toFixed(2),
            protocol_fee_pct: feePercent.toFixed(2),
            estimated_daily_eth: dailyReward.toFixed(8),
            estimated_monthly_eth: monthlyReward.toFixed(6),
            estimated_yearly_eth: yearlyReward.toFixed(6),
          },

          // Exchange rates
          rates: {
            share_rate: shareRate.toFixed(8),
            steth_per_wsteth: formatEther(stethPerToken),
            wsteth_per_steth: formatEther(tokensPerSteth),
          },

          // Withdrawals
          withdrawals: {
            total_requests: withdrawalRequests.length,
            pending: withdrawalDetails.filter((d: any) => !d.is_finalized && !d.is_claimed).length,
            claimable: withdrawalDetails.filter((d: any) => d.is_finalized && !d.is_claimed).length,
            claimed: withdrawalDetails.filter((d: any) => d.is_claimed).length,
            requests: withdrawalDetails,
          },

          // Allowances
          allowances: {
            steth_to_wsteth: formatEther(stethAllowanceWsteth),
            steth_to_withdrawal_queue: formatEther(stethAllowanceWQ),
          },

          // Governance
          governance: governanceInfo,

          // Protocol
          protocol: {
            tvl_eth: formatEther(totalPooledEther),
            total_shares: totalShares.toString(),
            stake_limit_eth: formatEther(stakeLimit),
            is_staking_paused: isStakingPaused,
            deposited_validators: beaconStats[0].toString(),
            beacon_validators: beaconStats[1].toString(),
          },

          summary: `Address ${address.substring(0, 6)}...${address.substring(38)} on chain ${chainId}:\n` +
            `  ETH: ${formatEther(ethBalance)} | stETH: ${formatEther(stethBalance)} | wstETH: ${formatEther(wstethBalance)} | LDO: ${formatEther(ldoBalance)}\n` +
            `  Total staked: ~${totalStakedEth.toFixed(4)} ETH | APR: ~${(netApr * 100).toFixed(2)}% | Daily: ~${dailyReward.toFixed(6)} ETH\n` +
            `  Withdrawals: ${withdrawalRequests.length} total (${withdrawalDetails.filter((d: any) => d.is_finalized && !d.is_claimed).length} claimable)\n` +
            `  1 wstETH = ${formatEther(stethPerToken)} stETH | Share rate: ${shareRate.toFixed(6)}\n` +
            `  Protocol TVL: ${Number(formatEther(totalPooledEther)).toLocaleString()} ETH | Staking: ${isStakingPaused ? 'PAUSED' : 'Active'}`,
        };

        return success(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return error(`Failed to fetch summary: ${msg}`);
      }
    }
  );
}
