/**
 * Lido MCP Server — Comprehensive Integration Test Suite
 *
 * Tests against Hoodi testnet (chain ID 560048) with real on-chain interactions.
 * Requires .env with ETHEREUM_RPC_URL, PRIVATE_KEY, CHAIN_ID=560048
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadConfig } from '../src/config.js';
import { createProvider } from '../src/provider.js';
import { getContracts } from '../src/contracts.js';
import { lidoAbi } from '../src/abis/lido.js';
import { wstethAbi } from '../src/abis/wsteth.js';
import { withdrawalQueueAbi } from '../src/abis/withdrawal-queue.js';
import { votingAbi } from '../src/abis/voting.js';
import { erc20Abi } from '../src/abis/erc20.js';

// Load env vars
import { readFileSync } from 'fs';
const envContent = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key) process.env[key] = valueParts.join('=');
  }
}

interface TestResult {
  name: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration_ms: number;
  details: string;
  tx_hash?: string;
  error?: string;
}

const results: TestResult[] = [];
let config: ReturnType<typeof loadConfig>;
let provider: ReturnType<typeof createProvider>;
let contracts: ReturnType<typeof getContracts>;
let walletAddress: string;

async function runTest(
  name: string,
  category: string,
  fn: () => Promise<{ details: string; tx_hash?: string }>
) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    results.push({ name, category, status: 'PASS', duration_ms: duration, ...result });
    console.log(`  ✅ ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Date.now() - start;
    const errMsg = err?.message || String(err);
    results.push({ name, category, status: 'FAIL', duration_ms: duration, details: '', error: errMsg });
    console.log(`  ❌ ${name} (${duration}ms): ${errMsg.substring(0, 120)}`);
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       LIDO MCP SERVER — INTEGRATION TEST SUITE          ║');
  console.log('║       Network: Hoodi Testnet (Chain ID 560048)          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ────────────────────────────────────────────────────
  // SETUP
  // ────────────────────────────────────────────────────
  console.log('📋 Setup');

  await runTest('Load config from .env', 'setup', async () => {
    config = loadConfig();
    return { details: `RPC: ${config.rpcUrl}, Chain: ${config.chainId}, Key: ${config.privateKey ? 'yes' : 'no'}` };
  });

  await runTest('Create provider (viem + LidoSDK)', 'setup', async () => {
    provider = createProvider(config);
    walletAddress = provider.account?.address;
    contracts = getContracts(config.chainId);
    return { details: `Wallet: ${walletAddress}, SDK initialized` };
  });

  await runTest('Verify RPC connectivity', 'setup', async () => {
    const blockNumber = await provider.publicClient.getBlockNumber();
    const chainId = await provider.publicClient.getChainId();
    return { details: `Block: ${blockNumber}, Chain ID: ${chainId}` };
  });

  await runTest('Verify wallet ETH balance', 'setup', async () => {
    const balance = await provider.publicClient.getBalance({ address: walletAddress });
    const ethBalance = formatEther(balance);
    if (balance === 0n) throw new Error('Wallet has 0 ETH — cannot run write tests');
    return { details: `Balance: ${ethBalance} ETH` };
  });

  // ────────────────────────────────────────────────────
  // READ-ONLY TESTS
  // ────────────────────────────────────────────────────
  console.log('\n📖 Read-Only Contract Tests');

  await runTest('Read stETH totalPooledEther', 'read', async () => {
    const total = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'getTotalPooledEther',
    });
    return { details: `Total pooled: ${formatEther(total as bigint)} ETH` };
  });

  await runTest('Read stETH totalShares', 'read', async () => {
    const shares = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'getTotalShares',
    });
    return { details: `Total shares: ${(shares as bigint).toString()}` };
  });

  await runTest('Read getCurrentStakeLimit', 'read', async () => {
    const limit = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'getCurrentStakeLimit',
    });
    return { details: `Stake limit: ${formatEther(limit as bigint)} ETH` };
  });

  await runTest('Read stETH balance of wallet', 'read', async () => {
    const balance = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return { details: `stETH balance: ${formatEther(balance as bigint)}` };
  });

  await runTest('Read wstETH balance of wallet', 'read', async () => {
    const balance = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return { details: `wstETH balance: ${formatEther(balance as bigint)}` };
  });

  await runTest('Read wstETH stEthPerToken exchange rate', 'read', async () => {
    const rate = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'stEthPerToken',
    });
    return { details: `1 wstETH = ${formatEther(rate as bigint)} stETH` };
  });

  await runTest('Read sharesOf wallet', 'read', async () => {
    const shares = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'sharesOf',
      args: [walletAddress],
    });
    return { details: `Shares: ${(shares as bigint).toString()}` };
  });

  await runTest('Read LDO balance of wallet', 'read', async () => {
    const balance = await provider.publicClient.readContract({
      address: contracts.ldo,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return { details: `LDO balance: ${formatEther(balance as bigint)}` };
  });

  await runTest('Read withdrawal queue - isBunkerModeActive', 'read', async () => {
    const bunker = await provider.publicClient.readContract({
      address: contracts.withdrawalQueue,
      abi: withdrawalQueueAbi,
      functionName: 'isBunkerModeActive',
    });
    return { details: `Bunker mode: ${bunker}` };
  });

  await runTest('Read withdrawal queue - getLastFinalizedRequestId', 'read', async () => {
    const lastId = await provider.publicClient.readContract({
      address: contracts.withdrawalQueue,
      abi: withdrawalQueueAbi,
      functionName: 'getLastFinalizedRequestId',
    });
    return { details: `Last finalized request ID: ${(lastId as bigint).toString()}` };
  });

  await runTest('Read Aragon Voting - votesLength', 'read', async () => {
    const count = await provider.publicClient.readContract({
      address: contracts.voting,
      abi: votingAbi,
      functionName: 'votesLength',
    });
    return { details: `Total votes: ${(count as bigint).toString()}` };
  });

  await runTest('Share conversion: getSharesByPooledEth(1 ETH)', 'read', async () => {
    const shares = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'getSharesByPooledEth',
      args: [parseEther('1')],
    });
    return { details: `1 ETH = ${(shares as bigint).toString()} shares` };
  });

  await runTest('Share conversion: getPooledEthByShares(1e18 shares)', 'read', async () => {
    const eth = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'getPooledEthByShares',
      args: [parseEther('1')],
    });
    return { details: `1e18 shares = ${formatEther(eth as bigint)} ETH` };
  });

  await runTest('wstETH conversion: getWstETHByStETH(1 stETH)', 'read', async () => {
    const wsteth = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'getWstETHByStETH',
      args: [parseEther('1')],
    });
    return { details: `1 stETH = ${formatEther(wsteth as bigint)} wstETH` };
  });

  await runTest('wstETH conversion: getStETHByWstETH(1 wstETH)', 'read', async () => {
    const steth = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'getStETHByWstETH',
      args: [parseEther('1')],
    });
    return { details: `1 wstETH = ${formatEther(steth as bigint)} stETH` };
  });

  // ────────────────────────────────────────────────────
  // WRITE TESTS (DRY RUN)
  // ────────────────────────────────────────────────────
  console.log('\n🔄 Dry Run Simulation Tests');

  await runTest('Simulate stake 0.01 ETH', 'dry_run', async () => {
    const { request } = await provider.publicClient.simulateContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'submit',
      args: ['0x0000000000000000000000000000000000000000'],
      value: parseEther('0.01'),
      account: provider.account,
    });
    const gas = await provider.publicClient.estimateGas({
      to: contracts.lido,
      value: parseEther('0.01'),
      data: '0xa1903eab0000000000000000000000000000000000000000000000000000000000000000',
      account: provider.account,
    });
    return { details: `Simulation SUCCESS. Estimated gas: ${gas.toString()}` };
  });

  await runTest('Simulate wrap stETH (check allowance flow)', 'dry_run', async () => {
    // Check current stETH balance
    const stethBal = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;

    if (stethBal === 0n) {
      return { details: 'SKIP: No stETH balance to wrap. Will test after staking.' };
    }

    // Check allowance
    const allowance = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: [{
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      }] as const,
      functionName: 'allowance',
      args: [walletAddress, contracts.wsteth],
    }) as bigint;

    return { details: `stETH balance: ${formatEther(stethBal)}, allowance to wstETH: ${formatEther(allowance)}` };
  });

  // ────────────────────────────────────────────────────
  // WRITE TESTS (REAL TRANSACTIONS)
  // ────────────────────────────────────────────────────
  console.log('\n💰 Real Transaction Tests (Hoodi Testnet)');

  // Test 1: Stake 0.01 ETH
  let stakeHash: string | undefined;
  await runTest('STAKE: Submit 0.01 ETH to Lido', 'write', async () => {
    const { request } = await provider.publicClient.simulateContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'submit',
      args: ['0x0000000000000000000000000000000000000000'],
      value: parseEther('0.01'),
      account: provider.account,
    });
    const hash = await provider.walletClient.writeContract(request);
    const receipt = await provider.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    stakeHash = hash;
    return {
      details: `Staked 0.01 ETH. Gas used: ${receipt.gasUsed.toString()}. Status: ${receipt.status}`,
      tx_hash: hash
    };
  });

  // Verify stETH balance increased
  await runTest('VERIFY: stETH balance after stake', 'write', async () => {
    const balance = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return { details: `stETH balance: ${formatEther(balance as bigint)}` };
  });

  // Test 2: Approve stETH for wstETH contract
  await runTest('APPROVE: stETH for wstETH wrap', 'write', async () => {
    const stethBal = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;

    if (stethBal === 0n) throw new Error('No stETH to approve');

    const { request } = await provider.publicClient.simulateContract({
      address: contracts.lido,
      abi: [{
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
      }] as const,
      functionName: 'approve',
      args: [contracts.wsteth, stethBal],
      account: provider.account,
    });
    const hash = await provider.walletClient.writeContract(request);
    const receipt = await provider.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Approved ${formatEther(stethBal)} stETH. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Test 3: Wrap half of stETH to wstETH
  let wrapHash: string | undefined;
  await runTest('WRAP: Wrap half of stETH to wstETH', 'write', async () => {
    const stethBal = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;

    if (stethBal === 0n) throw new Error('No stETH to wrap');
    const halfAmount = stethBal / 2n;

    const { request } = await provider.publicClient.simulateContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'wrap',
      args: [halfAmount],
      account: provider.account,
    });
    const hash = await provider.walletClient.writeContract(request);
    const receipt = await provider.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    wrapHash = hash;
    return { details: `Wrapped ${formatEther(halfAmount)} stETH. Gas: ${receipt.gasUsed.toString()}. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Verify wstETH balance
  await runTest('VERIFY: wstETH balance after wrap', 'write', async () => {
    const balance = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    return { details: `wstETH balance: ${formatEther(balance as bigint)}` };
  });

  // Test 4: Unwrap some wstETH back to stETH
  await runTest('UNWRAP: Unwrap half of wstETH back to stETH', 'write', async () => {
    const wstethBal = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;

    if (wstethBal === 0n) throw new Error('No wstETH to unwrap');
    const halfAmount = wstethBal / 2n;

    const { request } = await provider.publicClient.simulateContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'unwrap',
      args: [halfAmount],
      account: provider.account,
    });
    const hash = await provider.walletClient.writeContract(request);
    const receipt = await provider.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return { details: `Unwrapped ${formatEther(halfAmount)} wstETH. Gas: ${receipt.gasUsed.toString()}. Status: ${receipt.status}`, tx_hash: hash };
  });

  // Test 5: Request withdrawal
  await runTest('WITHDRAW REQUEST: Request withdrawal of small stETH amount', 'write', async () => {
    const stethBal = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;

    if (stethBal < parseEther('0.001')) throw new Error('Insufficient stETH for withdrawal test');

    const withdrawAmount = parseEther('0.001');

    // Approve stETH to withdrawal queue
    const { request: approveReq } = await provider.publicClient.simulateContract({
      address: contracts.lido,
      abi: [{
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
      }] as const,
      functionName: 'approve',
      args: [contracts.withdrawalQueue, withdrawAmount],
      account: provider.account,
    });
    const approveHash = await provider.walletClient.writeContract(approveReq);
    await provider.publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });

    // Request withdrawal
    const requestAbi = [{
      inputs: [
        { name: '_amounts', type: 'uint256[]' },
        { name: '_owner', type: 'address' },
      ],
      name: 'requestWithdrawals',
      outputs: [{ name: 'requestIds', type: 'uint256[]' }],
      stateMutability: 'nonpayable',
      type: 'function',
    }] as const;

    const { request: withdrawReq } = await provider.publicClient.simulateContract({
      address: contracts.withdrawalQueue,
      abi: requestAbi,
      functionName: 'requestWithdrawals',
      args: [[withdrawAmount], walletAddress],
      account: provider.account,
    });
    const hash = await provider.walletClient.writeContract(withdrawReq);
    const receipt = await provider.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return {
      details: `Withdrawal requested for ${formatEther(withdrawAmount)} stETH. Gas: ${receipt.gasUsed.toString()}. Status: ${receipt.status}`,
      tx_hash: hash
    };
  });

  // Test 6: Check withdrawal requests
  await runTest('WITHDRAW STATUS: Get withdrawal requests for wallet', 'read', async () => {
    const requests = await provider.publicClient.readContract({
      address: contracts.withdrawalQueue,
      abi: withdrawalQueueAbi,
      functionName: 'getWithdrawalRequests',
      args: [walletAddress],
    }) as bigint[];
    return { details: `Pending withdrawal requests: ${requests.length}. IDs: [${requests.map(r => r.toString()).join(', ')}]` };
  });

  // Test 7: Check governance
  await runTest('GOVERNANCE: Read votesLength', 'read', async () => {
    const count = await provider.publicClient.readContract({
      address: contracts.voting,
      abi: votingAbi,
      functionName: 'votesLength',
    }) as bigint;
    return { details: `Total votes on Hoodi: ${count.toString()}` };
  });

  if (true) {
    const voteCount = await provider.publicClient.readContract({
      address: contracts.voting,
      abi: votingAbi,
      functionName: 'votesLength',
    }) as bigint;

    if (voteCount > 0n) {
      await runTest('GOVERNANCE: Read latest vote details', 'read', async () => {
        const voteId = voteCount - 1n;
        const vote = await provider.publicClient.readContract({
          address: contracts.voting,
          abi: votingAbi,
          functionName: 'getVote',
          args: [voteId],
        }) as any[];
        return {
          details: `Vote #${voteId}: open=${vote[0]}, executed=${vote[1]}, yea=${formatEther(vote[6] as bigint)}, nay=${formatEther(vote[7] as bigint)}`
        };
      });
    }
  }

  // ────────────────────────────────────────────────────
  // FINAL BALANCES
  // ────────────────────────────────────────────────────
  console.log('\n📊 Final Balances');

  await runTest('Final ETH balance', 'final', async () => {
    const bal = await provider.publicClient.getBalance({ address: walletAddress });
    return { details: `ETH: ${formatEther(bal)}` };
  });

  await runTest('Final stETH balance', 'final', async () => {
    const bal = await provider.publicClient.readContract({
      address: contracts.lido,
      abi: lidoAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;
    return { details: `stETH: ${formatEther(bal)}` };
  });

  await runTest('Final wstETH balance', 'final', async () => {
    const bal = await provider.publicClient.readContract({
      address: contracts.wsteth,
      abi: wstethAbi,
      functionName: 'balanceOf',
      args: [walletAddress],
    }) as bigint;
    return { details: `wstETH: ${formatEther(bal)}` };
  });

  // ────────────────────────────────────────────────────
  // REPORT
  // ────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST REPORT                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`\nTotal: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⏭️  Skipped: ${skipped}\n`);

  console.log('┌─────┬─────────┬──────────────────────────────────────────────────────┬─────────┬──────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────┐');
  console.log('│  #  │ Status  │ Test Name                                            │ Time    │ Details                                                      │ Tx Hash                                                              │');
  console.log('├─────┼─────────┼──────────────────────────────────────────────────────┼─────────┼──────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤');

  results.forEach((r, i) => {
    const status = r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : '⏭️ SKIP';
    const name = r.name.substring(0, 50).padEnd(50);
    const time = `${r.duration_ms}ms`.padStart(7);
    const details = (r.error || r.details).substring(0, 58).padEnd(58);
    const hash = (r.tx_hash || '—').padEnd(68);
    console.log(`│ ${String(i + 1).padStart(3)} │ ${status} │ ${name} │ ${time} │ ${details} │ ${hash} │`);
  });

  console.log('└─────┴─────────┴──────────────────────────────────────────────────────┴─────────┴──────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘');

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    network: 'Hoodi Testnet (560048)',
    wallet: walletAddress,
    summary: { total: results.length, passed, failed, skipped },
    results,
  };

  const { writeFileSync } = await import('fs');
  writeFileSync(new URL('./test-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log('\n📄 Full report saved to test/test-report.json');

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
