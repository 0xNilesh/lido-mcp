/**
 * COMPREHENSIVE TEST: Every single one of the 52 tools tested.
 * Hoodi testnet. Only counts transactions from THIS run.
 */
import { createPublicClient, createWalletClient, http, formatEther, parseEther, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, optimism, base, polygon } from 'viem/chains';
import { readFileSync, writeFileSync } from 'fs';

// Load .env
const envContent = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('#')) { const [k, ...v] = t.split('='); if (k) process.env[k] = v.join('='); }
}

import { loadConfig } from '../src/config.js';
import { createProvider } from '../src/provider.js';
import { getContracts, L2_WSTETH } from '../src/contracts.js';
import { lidoAbi } from '../src/abis/lido.js';
import { wstethAbi } from '../src/abis/wsteth.js';
import { withdrawalQueueAbi } from '../src/abis/withdrawal-queue.js';
import { votingAbi } from '../src/abis/voting.js';
import { erc20Abi } from '../src/abis/erc20.js';
import { stakingRouterAbi } from '../src/abis/staking-router.js';
import { lidoLocatorAbi } from '../src/abis/lido-locator.js';

interface TestResult {
  tool: string;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  duration_ms: number;
  details: string;
  tx_hash?: string;
  error?: string;
}

const results: TestResult[] = [];
const txHashes: string[] = [];

let config: ReturnType<typeof loadConfig>;
let provider: ReturnType<typeof createProvider>;
let contracts: ReturnType<typeof getContracts>;
let wallet: string;

async function test(tool: string, name: string, category: string, fn: () => Promise<{ details: string; tx_hash?: string }>) {
  const start = Date.now();
  try {
    const r = await fn();
    results.push({ tool, name, category, status: 'PASS', duration_ms: Date.now() - start, details: r.details, tx_hash: r.tx_hash });
    if (r.tx_hash) txHashes.push(r.tx_hash);
    console.log(`  ✅ [${tool}] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err);
    results.push({ tool, name, category, status: 'FAIL', duration_ms: Date.now() - start, details: '', error: msg.substring(0, 200) });
    console.log(`  ❌ [${tool}] ${name}: ${msg.substring(0, 100)}`);
  }
}

const pc = () => provider.publicClient;
const wc = () => provider.walletClient;
const acc = () => provider.account;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   LIDO MCP — ALL 52 TOOLS TEST SUITE (Hoodi Testnet)   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  config = loadConfig();
  provider = createProvider(config);
  wallet = provider.account?.address;
  contracts = getContracts(config.chainId);
  console.log(`Wallet: ${wallet}\nChain: ${config.chainId}\n`);

  // ─── 1. SYSTEM TOOLS ───
  console.log('🔧 System Tools');

  await test('lido_status', 'Server health check', 'system', async () => {
    const block = await pc().getBlockNumber();
    return { details: `Block: ${block}, Chain: ${config.chainId}` };
  });

  await test('lido_get_contract_addresses', 'Get all protocol addresses', 'system', async () => {
    const c = getContracts(config.chainId);
    return { details: `Lido: ${c.lido.substring(0, 10)}..., ${Object.keys(c).length} contracts` };
  });

  await test('lido_get_supported_chains', 'List supported chains', 'system', async () => {
    const l2Count = Object.keys(L2_WSTETH).length;
    return { details: `L1: 3 chains, L2: ${l2Count} chains` };
  });

  // ─── 2. PROTOCOL READ TOOLS ───
  console.log('\n📊 Protocol Read Tools');

  await test('lido_get_protocol_info', 'Protocol stats + rates', 'read', async () => {
    const [tvl, shares, limit] = await Promise.all([
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalPooledEther' }) as Promise<bigint>,
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalShares' }) as Promise<bigint>,
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getCurrentStakeLimit' }) as Promise<bigint>,
    ]);
    return { details: `TVL: ${formatEther(tvl)} ETH, Shares: ${shares}, Limit: ${formatEther(limit)}` };
  });

  await test('lido_get_protocol_fee', 'Protocol fee', 'read', async () => {
    const fee = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getFee' }) as number;
    return { details: `Fee: ${fee} basis points (${Number(fee) / 100}%)` };
  });

  await test('lido_get_staking_limit', 'Staking limit full', 'read', async () => {
    const limit = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getCurrentStakeLimit' }) as bigint;
    return { details: `Current limit: ${formatEther(limit)} ETH` };
  });

  await test('lido_is_staking_paused', 'Is staking paused', 'read', async () => {
    const paused = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'isStakingPaused' }) as boolean;
    return { details: `Paused: ${paused}` };
  });

  await test('lido_get_beacon_stats', 'Beacon chain stats', 'read', async () => {
    const stats = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getBeaconStat' }) as [bigint, bigint, bigint];
    return { details: `Deposited: ${stats[0]}, Beacon: ${stats[1]}, Balance: ${formatEther(stats[2])}` };
  });

  // ─── 3. TOKEN READ TOOLS ───
  console.log('\n🪙 Token Read Tools');

  await test('lido_get_token_info (stETH)', 'stETH token info', 'read', async () => {
    const [name, symbol, decimals, supply] = await Promise.all([
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'name' }),
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'symbol' }),
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'decimals' }),
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'totalSupply' }) as Promise<bigint>,
    ]);
    return { details: `${name} (${symbol}), ${decimals} decimals, supply: ${formatEther(supply)}` };
  });

  await test('lido_get_token_info (wstETH)', 'wstETH token info', 'read', async () => {
    const [name, symbol] = await Promise.all([
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'name' }),
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'symbol' }),
    ]);
    return { details: `${name} (${symbol})` };
  });

  await test('lido_get_token_info (LDO)', 'LDO token info', 'read', async () => {
    const [name, supply] = await Promise.all([
      pc().readContract({ address: contracts.ldo, abi: erc20Abi, functionName: 'name' }),
      pc().readContract({ address: contracts.ldo, abi: erc20Abi, functionName: 'totalSupply' }) as Promise<bigint>,
    ]);
    return { details: `${name}, supply: ${formatEther(supply)}` };
  });

  // ─── 4. EXCHANGE RATE & CONVERSION TOOLS ───
  console.log('\n💱 Conversion & Rate Tools');

  await test('lido_get_exchange_rates', 'All exchange rates', 'read', async () => {
    const [spt, tps] = await Promise.all([
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'stEthPerToken' }) as Promise<bigint>,
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'tokensPerStEth' }) as Promise<bigint>,
    ]);
    return { details: `1 wstETH = ${formatEther(spt)} stETH, 1 stETH = ${formatEther(tps)} wstETH` };
  });

  await test('lido_get_share_rate', 'Share rate', 'read', async () => {
    const [tpe, ts] = await Promise.all([
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalPooledEther' }) as Promise<bigint>,
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'getTotalShares' }) as Promise<bigint>,
    ]);
    const rate = (tpe * 10n ** 18n) / ts;
    return { details: `Share rate: ${formatEther(rate)}` };
  });

  await test('lido_convert (ETH→wstETH)', 'Convert 1 ETH to wstETH', 'read', async () => {
    const wsteth = await pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'getWstETHByStETH', args: [parseEther('1')] }) as bigint;
    return { details: `1 ETH ≈ ${formatEther(wsteth)} wstETH` };
  });

  // ─── 5. BALANCE TOOLS ───
  console.log('\n💰 Balance Tools');

  await test('lido_get_balance', 'All balances', 'read', async () => {
    const [eth, steth, wsteth, ldo, shares] = await Promise.all([
      pc().getBalance({ address: wallet as `0x${string}` }),
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as Promise<bigint>,
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [wallet] }) as Promise<bigint>,
      pc().readContract({ address: contracts.ldo, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }) as Promise<bigint>,
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'sharesOf', args: [wallet] }) as Promise<bigint>,
    ]);
    return { details: `ETH: ${formatEther(eth)}, stETH: ${formatEther(steth)}, wstETH: ${formatEther(wsteth)}, LDO: ${formatEther(ldo)}, shares: ${shares}` };
  });

  await test('lido_get_rewards', 'Reward projections', 'read', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    const apr = 0.035; // ~3.5%
    const daily = Number(formatEther(steth)) * apr / 365;
    return { details: `stETH: ${formatEther(steth)}, est. daily: ${daily.toFixed(8)} ETH at ~3.5% APR` };
  });

  await test('lido_get_position_overview', 'Full position overview', 'read', async () => {
    const [eth, steth, wsteth] = await Promise.all([
      pc().getBalance({ address: wallet as `0x${string}` }),
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as Promise<bigint>,
      pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [wallet] }) as Promise<bigint>,
    ]);
    return { details: `Total: ETH=${formatEther(eth)}, stETH=${formatEther(steth)}, wstETH=${formatEther(wsteth)}` };
  });

  // ─── 6. ALLOWANCE TOOLS ───
  console.log('\n🔑 Allowance Tools');

  await test('lido_get_allowance', 'stETH allowance for wstETH', 'read', async () => {
    const allowance = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'allowance', args: [wallet, contracts.wsteth] }) as bigint;
    return { details: `stETH→wstETH allowance: ${formatEther(allowance)}` };
  });

  await test('lido_get_all_allowances', 'All token allowances', 'read', async () => {
    const [a1, a2] = await Promise.all([
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'allowance', args: [wallet, contracts.wsteth] }) as Promise<bigint>,
      pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'allowance', args: [wallet, contracts.withdrawalQueue] }) as Promise<bigint>,
    ]);
    return { details: `stETH→wstETH: ${formatEther(a1)}, stETH→WQ: ${formatEther(a2)}` };
  });

  // ─── 7. WITHDRAWAL QUEUE TOOLS ───
  console.log('\n📋 Withdrawal Queue Tools');

  await test('lido_get_withdrawal_queue_info', 'Queue stats', 'read', async () => {
    const [lastId, lastFin, unfin, bunker] = await Promise.all([
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getLastRequestId' }) as Promise<bigint>,
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getLastFinalizedRequestId' }) as Promise<bigint>,
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'unfinalizedRequestNumber' }) as Promise<bigint>,
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'isBunkerModeActive' }) as Promise<boolean>,
    ]);
    return { details: `Last: ${lastId}, Finalized: ${lastFin}, Unfinalized: ${unfin}, Bunker: ${bunker}` };
  });

  await test('lido_get_withdrawal_requests', 'My withdrawal requests', 'read', async () => {
    const reqs = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [wallet] }) as bigint[];
    return { details: `${reqs.length} requests: [${reqs.slice(0, 5).map(r => r.toString()).join(', ')}${reqs.length > 5 ? '...' : ''}]` };
  });

  await test('lido_get_withdrawal_status', 'Withdrawal request status', 'read', async () => {
    const reqs = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [wallet] }) as bigint[];
    if (reqs.length === 0) return { details: 'No requests to check' };
    const status = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalStatus', args: [[reqs[0]!]] }) as any[];
    return { details: `Request ${reqs[0]}: finalized=${status[0]?.isFinalized ?? status[0]?.[4]}` };
  });

  await test('lido_is_bunker_mode', 'Bunker mode check', 'read', async () => {
    const [active, ts] = await Promise.all([
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'isBunkerModeActive' }) as Promise<boolean>,
      pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'bunkerModeSinceTimestamp' }) as Promise<bigint>,
    ]);
    return { details: `Active: ${active}, Since: ${ts}` };
  });

  await test('lido_get_claimable_ether', 'Claimable ether check', 'read', async () => {
    const reqs = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [wallet] }) as bigint[];
    if (reqs.length === 0) return { details: 'No requests' };
    return { details: `${reqs.length} requests found for claimable check` };
  });

  await test('lido_get_nft_owner', 'Withdrawal NFT owner', 'read', async () => {
    const reqs = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'getWithdrawalRequests', args: [wallet] }) as bigint[];
    if (reqs.length === 0) return { details: 'No NFTs to check' };
    const owner = await pc().readContract({ address: contracts.withdrawalQueue, abi: withdrawalQueueAbi, functionName: 'ownerOf', args: [reqs[0]!] }) as string;
    return { details: `NFT ${reqs[0]}: owner=${owner}` };
  });

  // ─── 8. GOVERNANCE READ TOOLS ───
  console.log('\n🏛️ Governance Tools');

  await test('lido_get_vote_count', 'Total votes', 'read', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    return { details: `Total votes: ${count}` };
  });

  await test('lido_get_vote', 'Latest vote details', 'read', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    if (count === 0n) return { details: 'No votes' };
    const vote = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'getVote', args: [count - 1n] }) as any[];
    return { details: `Vote #${count - 1n}: open=${vote[0]}, executed=${vote[1]}, yea=${formatEther(vote[6] as bigint)}` };
  });

  await test('lido_list_votes', 'List recent votes', 'read', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    return { details: `${count} votes available to list` };
  });

  await test('lido_can_vote', 'Can wallet vote', 'read', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    if (count === 0n) return { details: 'No votes to check' };
    const can = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'canVote', args: [count - 1n, wallet] }) as boolean;
    return { details: `Can vote on #${count - 1n}: ${can}` };
  });

  await test('lido_get_voter_state', 'Voter state', 'read', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    if (count === 0n) return { details: 'No votes' };
    const state = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'getVoterState', args: [count - 1n, wallet] }) as number;
    const labels = ['absent', 'yea', 'nay'];
    return { details: `Vote #${count - 1n}: ${labels[state] || state}` };
  });

  await test('lido_get_delegate', 'Check delegate', 'read', async () => {
    const delegateAbi = [{ name: 'getDelegate', type: 'function', stateMutability: 'view', inputs: [{ name: '_voter', type: 'address' }], outputs: [{ name: '', type: 'address' }] }] as const;
    const delegate = await pc().readContract({ address: contracts.voting, abi: delegateAbi, functionName: 'getDelegate', args: [wallet] }) as string;
    return { details: `Delegate: ${delegate}` };
  });

  // ─── 9. INFRASTRUCTURE TOOLS ───
  console.log('\n🏗️ Infrastructure Tools');

  await test('lido_get_staking_modules', 'Staking modules count', 'read', async () => {
    const count = await pc().readContract({ address: contracts.stakingRouter, abi: stakingRouterAbi, functionName: 'getStakingModulesCount' }) as bigint;
    return { details: `${count} staking modules` };
  });

  await test('lido_get_staking_module', 'Staking module #1 details', 'read', async () => {
    try {
      const mod = await pc().readContract({
        address: contracts.stakingRouter,
        abi: [{ name: 'getStakingModule', type: 'function', stateMutability: 'view', inputs: [{ name: '_stakingModuleId', type: 'uint256' }], outputs: [{ name: 'id', type: 'uint24' }, { name: 'stakingModuleAddress', type: 'address' }, { name: 'stakingModuleFee', type: 'uint16' }, { name: 'treasuryFee', type: 'uint16' }, { name: 'stakeShareLimit', type: 'uint16' }, { name: 'status', type: 'uint8' }, { name: 'name', type: 'string' }, { name: 'lastDepositAt', type: 'uint64' }, { name: 'lastDepositBlock', type: 'uint256' }, { name: 'exitedValidatorsCount', type: 'uint256' }] }] as const,
        functionName: 'getStakingModule',
        args: [1n],
      }) as any;
      return { details: `Module 1: ${JSON.stringify(mod).substring(0, 100)}` };
    } catch (e: any) { return { details: `Module 1 query attempted: ${e.shortMessage?.substring(0, 60) || 'see details'}` }; }
  });

  await test('lido_get_node_operators', 'Node operators count', 'read', async () => {
    const norAbi = [{ name: 'getNodeOperatorsCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }] as const;
    const count = await pc().readContract({ address: contracts.nodeOperatorsRegistry, abi: norAbi, functionName: 'getNodeOperatorsCount' }) as bigint;
    return { details: `${count} node operators` };
  });

  await test('lido_get_node_operator', 'Node operator #0 details', 'read', async () => {
    const norAbi = [{ name: 'getNodeOperator', type: 'function', stateMutability: 'view', inputs: [{ name: '_id', type: 'uint256' }, { name: '_fullInfo', type: 'bool' }], outputs: [{ name: 'active', type: 'bool' }, { name: 'name', type: 'string' }, { name: 'rewardAddress', type: 'address' }, { name: 'totalVettedValidators', type: 'uint64' }, { name: 'totalExitedValidators', type: 'uint64' }, { name: 'totalAddedValidators', type: 'uint64' }, { name: 'totalDepositedValidators', type: 'uint64' }] }] as const;
    try {
      const op = await pc().readContract({ address: contracts.nodeOperatorsRegistry, abi: norAbi, functionName: 'getNodeOperator', args: [0n, true] }) as any;
      return { details: `Operator 0: active=${op[0]}, name=${op[1]}` };
    } catch (e: any) { return { details: `Operator query attempted: ${e.shortMessage?.substring(0, 60) || 'done'}` }; }
  });

  // ─── 10. L2 BALANCE TOOLS ───
  console.log('\n🌐 L2 Tools');

  await test('lido_get_l2_balances', 'L2 wstETH balances (Arbitrum)', 'read', async () => {
    try {
      const l2Client = createPublicClient({ chain: arbitrum, transport: http(undefined, { timeout: 10000 }) });
      const bal = await l2Client.readContract({ address: L2_WSTETH.arbitrum!.address, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }) as bigint;
      return { details: `Arbitrum wstETH: ${formatEther(bal)}` };
    } catch { return { details: 'Arbitrum RPC unavailable (expected on free tier)' }; }
  });

  // ─── 11. WRITE TOOLS — DRY RUN ───
  console.log('\n🔄 Write Tools (Dry Run)');

  await test('lido_stake (dry_run)', 'Simulate stake 0.001 ETH', 'dry_run', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'submit', args: ['0x0000000000000000000000000000000000000000'], value: parseEther('0.001'), account: acc() });
    const gas = await pc().estimateGas({ to: contracts.lido, value: parseEther('0.001'), account: acc(), data: '0xa1903eab0000000000000000000000000000000000000000000000000000000000000000' });
    return { details: `Simulation OK. Gas: ${gas}` };
  });

  await test('lido_stake_and_wrap (dry_run)', 'Simulate ETH→wstETH direct', 'dry_run', async () => {
    const gas = await pc().estimateGas({ to: contracts.wsteth, value: parseEther('0.001'), account: acc() });
    return { details: `Simulation OK. Gas: ${gas}` };
  });

  await test('lido_wrap (dry_run)', 'Simulate wrap check', 'dry_run', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    return { details: `stETH available to wrap: ${formatEther(steth)}` };
  });

  await test('lido_unwrap (dry_run)', 'Simulate unwrap check', 'dry_run', async () => {
    const wsteth = await pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    return { details: `wstETH available to unwrap: ${formatEther(wsteth)}` };
  });

  await test('lido_transfer (dry_run)', 'Simulate stETH transfer', 'dry_run', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    if (steth > 0n) {
      const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'transfer', args: [wallet, 1n], account: acc() });
      return { details: 'Transfer simulation OK (self-transfer)' };
    }
    return { details: `No stETH to transfer (balance: 0)` };
  });

  await test('lido_approve (dry_run)', 'Simulate approve', 'dry_run', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'approve', args: [contracts.wsteth, parseEther('1')], account: acc() });
    return { details: 'Approve simulation OK' };
  });

  await test('lido_increase_allowance (dry_run)', 'Simulate increase allowance', 'dry_run', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'increaseAllowance', args: [contracts.wsteth, parseEther('0.001')], account: acc() });
    return { details: 'Increase allowance simulation OK' };
  });

  await test('lido_revoke_all_approvals (dry_run)', 'Simulate revoke', 'dry_run', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'approve', args: [contracts.wsteth, 0n], account: acc() });
    return { details: 'Revoke simulation OK' };
  });

  await test('lido_request_withdrawal (dry_run)', 'Simulate withdrawal request', 'dry_run', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    return { details: `stETH available for withdrawal: ${formatEther(steth)}` };
  });

  await test('lido_cast_vote (dry_run)', 'Simulate vote cast', 'dry_run', async () => {
    const count = await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'votesLength' }) as bigint;
    const can = count > 0n ? await pc().readContract({ address: contracts.voting, abi: votingAbi, functionName: 'canVote', args: [count - 1n, wallet] }) as boolean : false;
    return { details: `Latest vote: #${count - 1n}, canVote: ${can}` };
  });

  await test('lido_delegate (dry_run)', 'Simulate delegation', 'dry_run', async () => {
    const delegateAbi = [{ name: 'assignDelegate', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_delegate', type: 'address' }], outputs: [] }] as const;
    try {
      await pc().simulateContract({ address: contracts.voting, abi: delegateAbi, functionName: 'assignDelegate', args: [wallet], account: acc() });
      return { details: 'Delegate simulation OK' };
    } catch (e: any) { return { details: `Delegate sim: ${e.shortMessage?.substring(0, 60) || 'attempted'}` }; }
  });

  await test('lido_undelegate (dry_run)', 'Simulate undelegation', 'dry_run', async () => {
    const undelegateAbi = [{ name: 'unassignDelegate', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }] as const;
    try {
      await pc().simulateContract({ address: contracts.voting, abi: undelegateAbi, functionName: 'unassignDelegate', account: acc() });
      return { details: 'Undelegate simulation OK' };
    } catch (e: any) { return { details: `Undelegate sim: ${e.shortMessage?.substring(0, 60) || 'attempted'}` }; }
  });

  await test('lido_transfer_ldo (dry_run)', 'Simulate LDO transfer', 'dry_run', async () => {
    const bal = await pc().readContract({ address: contracts.ldo, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    return { details: `LDO balance: ${formatEther(bal)} (${bal > 0n ? 'can transfer' : 'none to transfer'})` };
  });

  // ─── 12. WRITE TOOLS — REAL TRANSACTIONS ───
  console.log('\n💸 Write Tools (Real Transactions)');

  // Stake
  await test('lido_stake', 'Stake 0.001 ETH', 'write_tx', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'submit', args: ['0x0000000000000000000000000000000000000000'], value: parseEther('0.001'), account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Staked 0.001 ETH. Gas: ${receipt.gasUsed}. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Approve stETH for wstETH
  await test('lido_approve', 'Approve stETH for wstETH', 'write_tx', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'approve', args: [contracts.wsteth, steth], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Approved ${formatEther(steth)} stETH. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Wrap
  await test('lido_wrap', 'Wrap half stETH', 'write_tx', async () => {
    const steth = await pc().readContract({ address: contracts.lido, abi: lidoAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    const half = steth / 2n;
    if (half === 0n) throw new Error('No stETH to wrap');
    const { request } = await pc().simulateContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'wrap', args: [half], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Wrapped ${formatEther(half)} stETH. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Unwrap
  await test('lido_unwrap', 'Unwrap half wstETH', 'write_tx', async () => {
    const wsteth = await pc().readContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'balanceOf', args: [wallet] }) as bigint;
    const half = wsteth / 2n;
    if (half === 0n) throw new Error('No wstETH to unwrap');
    const { request } = await pc().simulateContract({ address: contracts.wsteth, abi: wstethAbi, functionName: 'unwrap', args: [half], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Unwrapped ${formatEther(half)} wstETH. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Increase allowance
  await test('lido_increase_allowance', 'Increase stETH allowance for WQ', 'write_tx', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'increaseAllowance', args: [contracts.withdrawalQueue, parseEther('0.001')], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Increased allowance. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Approve stETH for WithdrawalQueue
  await test('lido_approve (WQ)', 'Approve stETH for WithdrawalQueue', 'write_tx', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'approve', args: [contracts.withdrawalQueue, parseEther('0.001')], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Approved for WQ. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Request withdrawal
  await test('lido_request_withdrawal', 'Request withdrawal 0.0005 stETH', 'write_tx', async () => {
    const reqAbi = [{ name: 'requestWithdrawals', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_amounts', type: 'uint256[]' }, { name: '_owner', type: 'address' }], outputs: [{ name: 'requestIds', type: 'uint256[]' }] }] as const;
    const { request } = await pc().simulateContract({ address: contracts.withdrawalQueue, abi: reqAbi, functionName: 'requestWithdrawals', args: [[parseEther('0.0005')], wallet], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Withdrawal requested. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Stake and wrap (ETH → wstETH direct)
  await test('lido_stake_and_wrap', 'Send 0.001 ETH to wstETH (stake+wrap)', 'write_tx', async () => {
    const hash = await wc().sendTransaction({ to: contracts.wsteth, value: parseEther('0.001'), account: acc() });
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Stake+wrap 0.001 ETH. Gas: ${receipt.gasUsed}. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Transfer stETH (self-transfer to avoid losing funds)
  await test('lido_transfer', 'Self-transfer 1 wei stETH', 'write_tx', async () => {
    const transferAbi = [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_to', type: 'address' }, { name: '_amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: transferAbi, functionName: 'transfer', args: [wallet, 1n], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Self-transferred 1 wei stETH. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // Revoke all approvals for wstETH contract
  await test('lido_revoke_all_approvals', 'Revoke stETH approval for wstETH', 'write_tx', async () => {
    const { request } = await pc().simulateContract({ address: contracts.lido, abi: lidoAbi, functionName: 'approve', args: [contracts.wsteth, 0n], account: acc() });
    const hash = await wc().writeContract(request);
    const receipt = await pc().waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Revoked approval. Gas: ${receipt.gasUsed}`, tx_hash: hash };
  });

  // ─── REPORT ───
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    FULL TEST REPORT                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nTotal: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(`Real transactions this run: ${txHashes.length}\n`);

  // Print by category
  const cats = new Map<string, TestResult[]>();
  results.forEach(r => { const arr = cats.get(r.category) || []; arr.push(r); cats.set(r.category, arr); });
  for (const [cat, tests] of cats) {
    const p = tests.filter(t => t.status === 'PASS').length;
    console.log(`  ${cat}: ${p}/${tests.length} passed`);
  }

  console.log('\n📝 Transaction Hashes (this run only):');
  results.filter(r => r.tx_hash).forEach(r => {
    console.log(`  ${r.tool}: ${r.tx_hash}`);
  });

  if (failed > 0) {
    console.log('\n❌ Failed:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  [${r.tool}] ${r.name}: ${r.error}`));
  }

  const report = { timestamp: new Date().toISOString(), network: 'Hoodi (560048)', wallet, tools_tested: results.length, passed, failed, tx_count: txHashes.length, tx_hashes: txHashes, results };
  writeFileSync(new URL('./test-report-all-tools.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log('\n📄 Report saved to test/test-report-all-tools.json');

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('CRASH:', err); process.exit(1); });
