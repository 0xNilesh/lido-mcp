/**
 * Executes write operations via: MCP server (prepare tx) → Browser wallet (sign & send).
 *
 * Flow:
 * 1. Frontend calls MCP's `lido_prepare_transaction` tool via proxy
 * 2. MCP returns raw tx params (to, data, value)
 * 3. Frontend sends the tx via the connected wallet (MetaMask etc.)
 * 4. All contract logic stays in the MCP server — frontend only signs
 */
import { useCallback } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { type Hex } from 'viem';
import { apiUrl } from '../api';

// Map tool names to prepare action names
const TOOL_TO_ACTION: Record<string, string> = {
  lido_stake: 'stake',
  lido_stake_and_wrap: 'stake_and_wrap',
  lido_wrap: 'wrap',
  lido_unwrap: 'unwrap',
  lido_approve: 'approve',
  lido_revoke_all_approvals: 'revoke_approval',
  lido_increase_allowance: 'increase_allowance',
  lido_transfer: 'transfer',
  lido_transfer_ldo: 'transfer_ldo',
  lido_request_withdrawal: 'request_withdrawal',
  lido_claim_withdrawal: 'claim_withdrawal',
  lido_claim_single_withdrawal: 'claim_withdrawal',
  lido_cast_vote: 'cast_vote',
  // Tools that can't be prepared (no direct contract call)
  lido_delegate: 'delegate',
  lido_undelegate: 'undelegate',
  lido_transfer_withdrawal_nft: 'transfer_nft',
  lido_approve_nft: 'approve_nft',
  lido_claim_withdrawals_to: 'claim_to',
};

const WRITE_TOOLS = new Set(Object.keys(TOOL_TO_ACTION));

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

    const account = walletClient.account;
    if (!account) throw new Error('No account in wallet');

    const action = TOOL_TO_ACTION[toolName];
    if (!action) throw new Error(`Unknown write tool: ${toolName}`);

    const isDryRun = args.dry_run !== false && args.dry_run !== 'false';

    // If dry_run, use MCP's prepare tool to show what would happen (no execution)
    if (isDryRun) {
      const prepRes = await fetch(apiUrl('/api/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'lido_prepare_transaction',
          args: { action, sender: account.address, ...args },
        }),
      });
      const prepData = await prepRes.json();
      const text = prepData.content?.[0]?.text;
      if (text) {
        const prepared = JSON.parse(text);
        return {
          success: true,
          result: {
            dry_run: true,
            ...prepared,
            summary: `[DRY RUN] ${prepared.summary || prepared.transaction?.description || 'Transaction prepared'}`,
          },
        };
      }
      return { success: true, result: { dry_run: true, ...prepData } };
    }

    // For real execution: ask MCP to prepare the tx, then sign via wallet
    const prepareRes = await fetch(apiUrl('/api/call'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'lido_prepare_transaction',
        args: {
          action,
          sender: account.address,
          ...args,
          // Map tool-specific param names to prepare params
          ...(args.request_id ? { request_id: args.request_id } : {}),
          ...(args.request_ids?.[0] ? { request_id: args.request_ids[0] } : {}),
        },
      }),
    });

    const prepareData = await prepareRes.json();
    const prepText = prepareData.content?.[0]?.text;
    if (!prepText) throw new Error('MCP prepare returned empty response');

    const prepared = JSON.parse(prepText);
    if (prepared.error) throw new Error(prepared.message || prepared.error);

    // Execute transaction(s) via connected wallet
    const txHashes: string[] = [];

    if (prepared.multi_step && prepared.transactions) {
      // Multi-step (e.g., approve + wrap)
      for (const tx of prepared.transactions) {
        const hash = await walletClient.sendTransaction({
          to: tx.to as Hex,
          data: (tx.data || '0x') as Hex,
          value: tx.value ? BigInt(tx.value) : 0n,
          account,
        });
        txHashes.push(hash);
        // Wait for each step to confirm before next
        await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      }
    } else if (prepared.transaction) {
      // Single transaction
      const tx = prepared.transaction;
      const hash = await walletClient.sendTransaction({
        to: tx.to as Hex,
        data: (tx.data || '0x') as Hex,
        value: tx.value ? BigInt(tx.value) : 0n,
        account,
      });
      txHashes.push(hash);
      await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    }

    return {
      success: true,
      result: {
        action,
        description: prepared.summary || prepared.transaction?.description,
        tx_hashes: txHashes,
        steps: txHashes.length,
      },
      tx_hash: txHashes[txHashes.length - 1],
    };
  }, [publicClient, walletClient]);

  return { execute, isReady: !!walletClient };
}
