/**
 * lido_prepare_transaction — Given a tool name and args, returns the raw
 * transaction parameters (to, data, value) that a browser wallet can sign.
 *
 * This is the bridge between MCP and browser wallets: the MCP server
 * encodes the calldata, the browser wallet signs and sends it.
 */
import { z } from 'zod';
import { encodeFunctionData, parseEther, type Address } from 'viem';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Provider } from '../../../provider.js';
import { getContracts } from '../../../contracts.js';
import { resolveChainId } from '../../../utils/helpers.js';
import { success, error } from '../../../utils/format.js';
import { lidoAbi } from '../../../abis/lido.js';
import { wstethAbi } from '../../../abis/wsteth.js';
import { withdrawalQueueAbi } from '../../../abis/withdrawal-queue.js';
import { votingAbi } from '../../../abis/voting.js';

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    'lido_prepare_transaction',
    'Prepare a raw transaction (to, data, value) for a write operation. Returns calldata that a browser wallet can sign and send. Supports: stake, stake_and_wrap, wrap, unwrap, approve, transfer, request_withdrawal, claim_withdrawal, cast_vote, increase_allowance, revoke_approval.',
    {
      action: z.enum([
        'stake', 'stake_and_wrap', 'wrap', 'unwrap',
        'approve', 'transfer', 'transfer_ldo',
        'request_withdrawal', 'claim_withdrawal',
        'cast_vote', 'increase_allowance', 'revoke_approval',
      ]).describe('The write action to prepare'),
      amount: z.string().optional().describe('Amount in ETH/token units (e.g. "1.5")'),
      to: z.string().optional().describe('Recipient address (for transfers)'),
      spender: z.string().optional().describe('Spender address (for approvals)'),
      token: z.string().optional().describe('Token: stETH, wstETH, LDO (for approve/transfer)'),
      vote_id: z.number().optional().describe('Vote ID (for cast_vote)'),
      vote_for: z.boolean().optional().describe('Vote direction (for cast_vote)'),
      request_id: z.string().optional().describe('Withdrawal request ID (for claim)'),
      referral_address: z.string().optional().describe('Referral address (for stake)'),
      sender: z.string().optional().describe('Sender/owner address (for the transaction from field)'),
      chain_id: z.number().optional().describe('Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const sender = (args.sender || '0x0000000000000000000000000000000000000000') as Address;

        interface TxParams {
          to: string;
          data: string;
          value: string;
          description: string;
        }

        let tx: TxParams;

        switch (args.action) {
          case 'stake': {
            const value = parseEther(args.amount || '0');
            const referral = (args.referral_address || '0x0000000000000000000000000000000000000000') as Address;
            const data = encodeFunctionData({ abi: lidoAbi, functionName: 'submit', args: [referral] });
            tx = { to: contracts.lido, data, value: value.toString(), description: `Stake ${args.amount} ETH for stETH` };
            break;
          }

          case 'stake_and_wrap': {
            const value = parseEther(args.amount || '0');
            tx = { to: contracts.wsteth, data: '0x', value: value.toString(), description: `Stake ${args.amount} ETH and wrap to wstETH` };
            break;
          }

          case 'wrap': {
            const amount = parseEther(args.amount || '0');
            // Need two transactions: approve + wrap
            const approveData = encodeFunctionData({ abi: lidoAbi, functionName: 'approve', args: [contracts.wsteth, amount] });
            const wrapData = encodeFunctionData({ abi: wstethAbi, functionName: 'wrap', args: [amount] });
            return success({
              transactions: [
                { to: contracts.lido, data: approveData, value: '0', description: `Approve ${args.amount} stETH for wstETH contract`, step: 1 },
                { to: contracts.wsteth, data: wrapData, value: '0', description: `Wrap ${args.amount} stETH to wstETH`, step: 2 },
              ],
              multi_step: true,
              summary: `Wrap ${args.amount} stETH → wstETH (2 transactions: approve + wrap)`,
            });
          }

          case 'unwrap': {
            const amount = parseEther(args.amount || '0');
            const data = encodeFunctionData({ abi: wstethAbi, functionName: 'unwrap', args: [amount] });
            tx = { to: contracts.wsteth, data, value: '0', description: `Unwrap ${args.amount} wstETH to stETH` };
            break;
          }

          case 'approve': {
            const amount = parseEther(args.amount || '0');
            const spender = args.spender as Address;
            const token = (args.token || 'stETH').toLowerCase();
            const contractAddr = token === 'wsteth' ? contracts.wsteth : token === 'ldo' ? contracts.ldo : contracts.lido;
            const data = encodeFunctionData({ abi: lidoAbi, functionName: 'approve', args: [spender, amount] });
            tx = { to: contractAddr, data, value: '0', description: `Approve ${args.amount} ${args.token || 'stETH'} for ${spender}` };
            break;
          }

          case 'revoke_approval': {
            const spender = args.spender as Address;
            const token = (args.token || 'stETH').toLowerCase();
            const contractAddr = token === 'wsteth' ? contracts.wsteth : contracts.lido;
            const data = encodeFunctionData({ abi: lidoAbi, functionName: 'approve', args: [spender, 0n] });
            tx = { to: contractAddr, data, value: '0', description: `Revoke ${args.token || 'stETH'} approval for ${spender}` };
            break;
          }

          case 'transfer': {
            const amount = parseEther(args.amount || '0');
            const to = args.to as Address;
            const token = (args.token || 'stETH').toLowerCase();
            if (token === 'shares') {
              const data = encodeFunctionData({ abi: lidoAbi, functionName: 'transferShares', args: [to, amount] });
              tx = { to: contracts.lido, data, value: '0', description: `Transfer ${args.amount} shares to ${to}` };
            } else {
              const contractAddr = token === 'wsteth' ? contracts.wsteth : contracts.lido;
              const data = encodeFunctionData({ abi: lidoAbi, functionName: 'transfer', args: [to, amount] });
              tx = { to: contractAddr, data, value: '0', description: `Transfer ${args.amount} ${args.token || 'stETH'} to ${to}` };
            }
            break;
          }

          case 'transfer_ldo': {
            const amount = parseEther(args.amount || '0');
            const to = args.to as Address;
            const data = encodeFunctionData({ abi: lidoAbi, functionName: 'transfer', args: [to, amount] });
            tx = { to: contracts.ldo, data, value: '0', description: `Transfer ${args.amount} LDO to ${to}` };
            break;
          }

          case 'request_withdrawal': {
            const amount = parseEther(args.amount || '0');
            const approveData = encodeFunctionData({ abi: lidoAbi, functionName: 'approve', args: [contracts.withdrawalQueue, amount] });
            const reqData = encodeFunctionData({
              abi: withdrawalQueueAbi,
              functionName: 'requestWithdrawals',
              args: [[amount], sender],
            });
            return success({
              transactions: [
                { to: contracts.lido, data: approveData, value: '0', description: `Approve ${args.amount} stETH for WithdrawalQueue`, step: 1 },
                { to: contracts.withdrawalQueue, data: reqData, value: '0', description: `Request withdrawal of ${args.amount} stETH`, step: 2 },
              ],
              multi_step: true,
              summary: `Request withdrawal of ${args.amount} stETH (2 transactions: approve + request)`,
            });
          }

          case 'claim_withdrawal': {
            const requestId = BigInt(args.request_id || '0');
            const data = encodeFunctionData({
              abi: withdrawalQueueAbi,
              functionName: 'claimWithdrawal',
              args: [requestId],
            });
            tx = { to: contracts.withdrawalQueue, data, value: '0', description: `Claim withdrawal request #${requestId}` };
            break;
          }

          case 'cast_vote': {
            const voteId = BigInt(args.vote_id || 0);
            const supports = args.vote_for ?? true;
            const data = encodeFunctionData({ abi: votingAbi, functionName: 'vote', args: [voteId, supports, false] });
            tx = { to: contracts.voting, data, value: '0', description: `Vote ${supports ? 'FOR' : 'AGAINST'} on proposal #${voteId}` };
            break;
          }

          case 'increase_allowance': {
            const amount = parseEther(args.amount || '0');
            const spender = args.spender as Address;
            const data = encodeFunctionData({ abi: lidoAbi, functionName: 'increaseAllowance', args: [spender, amount] });
            tx = { to: contracts.lido, data, value: '0', description: `Increase stETH allowance for ${spender} by ${args.amount}` };
            break;
          }

          default:
            return error(`Unknown action: ${args.action}`);
        }

        return success({
          transaction: tx,
          multi_step: false,
          chain_id: chainId,
          summary: tx.description,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return error(`Failed to prepare transaction: ${msg}`);
      }
    }
  );
}
