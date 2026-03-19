/**
 * Executes write tool calls via the connected browser wallet (wagmi).
 * Reads still go through the MCP proxy.
 */
import { useCallback } from 'react';
import {
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';

// Contract ABIs (minimal, only write functions we need)
const SUBMIT_ABI = [{ name: 'submit', type: 'function', stateMutability: 'payable', inputs: [{ name: '_referral', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;
const WRAP_ABI = [{ name: 'wrap', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_stETHAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] }] as const;
const UNWRAP_ABI = [{ name: 'unwrap', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_wstETHAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] }] as const;
const APPROVE_ABI = [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_spender', type: 'address' }, { name: '_amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;
const TRANSFER_ABI = [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_to', type: 'address' }, { name: '_amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;
const TRANSFER_SHARES_ABI = [{ name: 'transferShares', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_recipient', type: 'address' }, { name: '_sharesAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] }] as const;
const REQUEST_WITHDRAWALS_ABI = [{ name: 'requestWithdrawals', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_amounts', type: 'uint256[]' }, { name: '_owner', type: 'address' }], outputs: [{ name: 'requestIds', type: 'uint256[]' }] }] as const;
const CLAIM_WITHDRAWAL_ABI = [{ name: 'claimWithdrawal', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_requestId', type: 'uint256' }], outputs: [] }] as const;
const VOTE_ABI = [{ name: 'vote', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_voteId', type: 'uint256' }, { name: '_supports', type: 'bool' }, { name: '_executesIfDecided', type: 'bool' }], outputs: [] }] as const;
const INCREASE_ALLOWANCE_ABI = [{ name: 'increaseAllowance', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_spender', type: 'address' }, { name: '_addedValue', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;

// Hoodi contract addresses (also works for mainnet/holesky via chain-aware lookup)
const CONTRACTS: Record<number, Record<string, Address>> = {
  560048: {
    lido: '0x3508A952176b3c15387C97BE809eaffB1982176a',
    wsteth: '0x7E99eE3C66636DE415D2d7C880938F2f40f94De4',
    withdrawalQueue: '0xfe56573178f1bcdf53F01A6E9977670dcBBD9186',
    voting: '0x49B3512c44891bef83F8967d075121Bd1b07a01B',
    ldo: '0xEf2573966D009CcEA0Fc74451dee2193564198dc',
  },
  1: {
    lido: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    wsteth: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    withdrawalQueue: '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1',
    voting: '0x2e59A20f205bB85a89C53f1936454680651E618e',
    ldo: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  },
  17000: {
    lido: '0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034',
    wsteth: '0x8d09a4502Cc8Cf1547aD300E066060D043f6982D',
    withdrawalQueue: '0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50',
    voting: '0xdA7d2573Df555002503F29aA4003e398d28cc00f',
    ldo: '0x14ae7daeecdf57034f3E9db8564e46Dba8D97344',
  },
};

// Write tools that should execute via browser wallet
const WRITE_TOOLS = new Set([
  'lido_stake', 'lido_stake_and_wrap', 'lido_wrap', 'lido_unwrap',
  'lido_transfer', 'lido_transfer_ldo', 'lido_transfer_withdrawal_nft',
  'lido_approve', 'lido_approve_nft', 'lido_revoke_all_approvals',
  'lido_increase_allowance', 'lido_request_withdrawal',
  'lido_claim_withdrawal', 'lido_claim_single_withdrawal',
  'lido_claim_withdrawals_to', 'lido_cast_vote',
  'lido_delegate', 'lido_undelegate',
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function useContractExecutor() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const execute = useCallback(async (
    toolName: string,
    args: Record<string, any>,
  ): Promise<{ success: boolean; result: any; tx_hash?: string }> => {
    if (!walletClient) throw new Error('Wallet not connected. Connect your wallet first.');
    if (!publicClient) throw new Error('No public client available.');

    const chainId = await walletClient.getChainId();
    const c = CONTRACTS[chainId];
    if (!c) throw new Error(`Unsupported chain ${chainId}. Switch to Hoodi, Mainnet, or Holesky.`);
    const account = walletClient.account;
    if (!account) throw new Error('No account in wallet client');

    const isDryRun = args.dry_run !== false; // default true

    switch (toolName) {
      case 'lido_stake': {
        const value = parseEther(args.amount);
        const referral = (args.referral_address || '0x0000000000000000000000000000000000000000') as Address;
        if (isDryRun) {
          const { result } = await publicClient.simulateContract({ address: c.lido!, abi: SUBMIT_ABI, functionName: 'submit', args: [referral], value, account });
          const gas = await publicClient.estimateGas({ to: c.lido!, value, account });
          return { success: true, result: { dry_run: true, expected_steth: formatEther(result), gas_estimate: gas.toString(), summary: `Would stake ${args.amount} ETH → ~${formatEther(result)} stETH` } };
        }
        const hash = await walletClient.writeContract({ address: c.lido!, abi: SUBMIT_ABI, functionName: 'submit', args: [referral], value, account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { staked: args.amount, gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_stake_and_wrap': {
        const value = parseEther(args.amount);
        if (isDryRun) {
          const gas = await publicClient.estimateGas({ to: c.wsteth!, value, account });
          return { success: true, result: { dry_run: true, gas_estimate: gas.toString(), summary: `Would stake+wrap ${args.amount} ETH → wstETH` } };
        }
        const hash = await walletClient.sendTransaction({ to: c.wsteth!, value, account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { staked_and_wrapped: args.amount, gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_wrap': {
        const amount = parseEther(args.amount);
        if (isDryRun) {
          const { result } = await publicClient.simulateContract({ address: c.wsteth!, abi: WRAP_ABI, functionName: 'wrap', args: [amount], account });
          return { success: true, result: { dry_run: true, expected_wsteth: formatEther(result), summary: `Would wrap ${args.amount} stETH → ~${formatEther(result)} wstETH` } };
        }
        // Check allowance first
        // Approve stETH for wstETH contract
        const approveTx = await walletClient.writeContract({ address: c.lido!, abi: APPROVE_ABI, functionName: 'approve', args: [c.wsteth!, amount], account });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        // Wrap
        const hash = await walletClient.writeContract({ address: c.wsteth!, abi: WRAP_ABI, functionName: 'wrap', args: [amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { wrapped: args.amount, gas_used: receipt.gasUsed.toString(), status: receipt.status, approve_tx: approveTx }, tx_hash: hash };
      }

      case 'lido_unwrap': {
        const amount = parseEther(args.amount);
        if (isDryRun) {
          const { result } = await publicClient.simulateContract({ address: c.wsteth!, abi: UNWRAP_ABI, functionName: 'unwrap', args: [amount], account });
          return { success: true, result: { dry_run: true, expected_steth: formatEther(result), summary: `Would unwrap ${args.amount} wstETH → ~${formatEther(result)} stETH` } };
        }
        const hash = await walletClient.writeContract({ address: c.wsteth!, abi: UNWRAP_ABI, functionName: 'unwrap', args: [amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { unwrapped: args.amount, gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_approve': {
        const token = (args.token || 'stETH').toLowerCase();
        const contractAddr = token === 'wsteth' ? c.wsteth! : token === 'ldo' ? c.ldo! : c.lido!;
        const spender = args.spender as Address;
        const amount = parseEther(args.amount || '0');
        if (isDryRun) {
          await publicClient.simulateContract({ address: contractAddr, abi: APPROVE_ABI, functionName: 'approve', args: [spender, amount], account });
          return { success: true, result: { dry_run: true, summary: `Would approve ${args.amount} ${args.token} for ${spender}` } };
        }
        const hash = await walletClient.writeContract({ address: contractAddr, abi: APPROVE_ABI, functionName: 'approve', args: [spender, amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { approved: args.amount, spender, token: args.token, status: receipt.status }, tx_hash: hash };
      }

      case 'lido_transfer': {
        const token = (args.token || 'stETH').toLowerCase();
        const to = args.to as Address;
        const amount = parseEther(args.amount);
        if (token === 'shares') {
          if (isDryRun) {
            await publicClient.simulateContract({ address: c.lido!, abi: TRANSFER_SHARES_ABI, functionName: 'transferShares', args: [to, amount], account });
            return { success: true, result: { dry_run: true, summary: `Would transfer ${args.amount} shares to ${to}` } };
          }
          const hash = await walletClient.writeContract({ address: c.lido!, abi: TRANSFER_SHARES_ABI, functionName: 'transferShares', args: [to, amount], account });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          return { success: true, result: { transferred: args.amount, token: 'shares', to, status: receipt.status }, tx_hash: hash };
        }
        const contractAddr = token === 'wsteth' ? c.wsteth! : c.lido!;
        if (isDryRun) {
          await publicClient.simulateContract({ address: contractAddr, abi: TRANSFER_ABI, functionName: 'transfer', args: [to, amount], account });
          return { success: true, result: { dry_run: true, summary: `Would transfer ${args.amount} ${args.token} to ${to}` } };
        }
        const hash = await walletClient.writeContract({ address: contractAddr, abi: TRANSFER_ABI, functionName: 'transfer', args: [to, amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { transferred: args.amount, token: args.token, to, status: receipt.status }, tx_hash: hash };
      }

      case 'lido_request_withdrawal': {
        const amount = parseEther(args.amount);
        const owner = account.address;
        if (isDryRun) {
          return { success: true, result: { dry_run: true, summary: `Would request withdrawal of ${args.amount} stETH. Requires approval to WithdrawalQueue first.` } };
        }
        // Approve stETH for withdrawal queue
        const approveTx = await walletClient.writeContract({ address: c.lido!, abi: APPROVE_ABI, functionName: 'approve', args: [c.withdrawalQueue!, amount], account });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        // Request
        const hash = await walletClient.writeContract({ address: c.withdrawalQueue!, abi: REQUEST_WITHDRAWALS_ABI, functionName: 'requestWithdrawals', args: [[amount], owner], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { requested: args.amount, approve_tx: approveTx, gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_claim_single_withdrawal':
      case 'lido_claim_withdrawal': {
        const requestId = BigInt(args.request_id || args.request_ids?.[0] || '0');
        if (isDryRun) {
          return { success: true, result: { dry_run: true, summary: `Would claim withdrawal request #${requestId}` } };
        }
        const hash = await walletClient.writeContract({ address: c.withdrawalQueue!, abi: CLAIM_WITHDRAWAL_ABI, functionName: 'claimWithdrawal', args: [requestId], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { claimed: requestId.toString(), gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_cast_vote': {
        const voteId = BigInt(args.vote_id);
        const supports = args.vote_for === true || args.vote_for === 'true';
        if (isDryRun) {
          await publicClient.simulateContract({ address: c.voting!, abi: VOTE_ABI, functionName: 'vote', args: [voteId, supports, false], account });
          return { success: true, result: { dry_run: true, summary: `Would vote ${supports ? 'FOR' : 'AGAINST'} on proposal #${voteId}` } };
        }
        const hash = await walletClient.writeContract({ address: c.voting!, abi: VOTE_ABI, functionName: 'vote', args: [voteId, supports, false], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { voted: supports ? 'FOR' : 'AGAINST', vote_id: voteId.toString(), gas_used: receipt.gasUsed.toString(), status: receipt.status }, tx_hash: hash };
      }

      case 'lido_increase_allowance': {
        const spender = args.spender as Address;
        const amount = parseEther(args.amount);
        if (isDryRun) {
          await publicClient.simulateContract({ address: c.lido!, abi: INCREASE_ALLOWANCE_ABI, functionName: 'increaseAllowance', args: [spender, amount], account });
          return { success: true, result: { dry_run: true, summary: `Would increase stETH allowance for ${spender} by ${args.amount}` } };
        }
        const hash = await walletClient.writeContract({ address: c.lido!, abi: INCREASE_ALLOWANCE_ABI, functionName: 'increaseAllowance', args: [spender, amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { increased: args.amount, spender, status: receipt.status }, tx_hash: hash };
      }

      case 'lido_revoke_all_approvals': {
        const spender = args.spender as Address;
        if (isDryRun) {
          return { success: true, result: { dry_run: true, summary: `Would revoke stETH + wstETH approvals for ${spender}` } };
        }
        const h1 = await walletClient.writeContract({ address: c.lido!, abi: APPROVE_ABI, functionName: 'approve', args: [spender, 0n], account });
        await publicClient.waitForTransactionReceipt({ hash: h1 });
        const h2 = await walletClient.writeContract({ address: c.wsteth!, abi: APPROVE_ABI, functionName: 'approve', args: [spender, 0n], account });
        await publicClient.waitForTransactionReceipt({ hash: h2 });
        return { success: true, result: { revoked_steth: h1, revoked_wsteth: h2, spender, status: 'success' }, tx_hash: h2 };
      }

      case 'lido_transfer_ldo': {
        const to = args.to as Address;
        const amount = parseEther(args.amount);
        if (isDryRun) {
          await publicClient.simulateContract({ address: c.ldo!, abi: TRANSFER_ABI, functionName: 'transfer', args: [to, amount], account });
          return { success: true, result: { dry_run: true, summary: `Would transfer ${args.amount} LDO to ${to}` } };
        }
        const hash = await walletClient.writeContract({ address: c.ldo!, abi: TRANSFER_ABI, functionName: 'transfer', args: [to, amount], account });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { success: true, result: { transferred: args.amount, to, status: receipt.status }, tx_hash: hash };
      }

      default:
        throw new Error(`Write tool "${toolName}" not yet supported via browser wallet. Use the MCP proxy instead.`);
    }
  }, [publicClient, walletClient]);

  return { execute, isReady: !!walletClient };
}
