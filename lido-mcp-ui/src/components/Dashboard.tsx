import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../api';
import { useContractExecutor, isWriteTool } from '../hooks/useContractExecutor';
import type { Tool } from '../types';

interface DashboardProps {
  tools: Tool[];
  walletAddress?: string;
  chainId?: number;
  chainName?: string;
}

interface SummaryData {
  address: string;
  balances: { eth: string; steth: string; wsteth: string; ldo: string; shares: string };
  staking: { total_staked_eth: string; wsteth_in_steth: string };
  rewards: { estimated_apr_pct: string; estimated_daily_eth: string; estimated_monthly_eth: string; estimated_yearly_eth: string; protocol_fee_pct: string };
  rates: { share_rate: string; steth_per_wsteth: string; wsteth_per_steth: string };
  withdrawals: { total_requests: number; pending: number; claimable: number; claimed: number; requests: any[] };
  allowances: { steth_to_wsteth: string; steth_to_withdrawal_queue: string };
  governance: { total_votes: string; ldo_balance: string };
  protocol: { tvl_eth: string; total_shares: string; stake_limit_eth: string; is_staking_paused: boolean; deposited_validators: string; beacon_validators: string };
  summary: string;
}

interface ActionResult {
  type: 'loading' | 'data' | 'error';
  title: string;
  data?: any;
  error?: string;
  tool?: string;
}

interface ParamField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
}

interface InlineParams {
  chipIndex: number; // which chip opened it
  tool: Tool;
  fields: ParamField[];
  values: Record<string, string>;
}

const CHIPS = [
  { label: 'Stake ETH', icon: '↗', tool: 'lido_stake', write: true },
  { label: 'Wrap', icon: '⇄', tool: 'lido_wrap', write: true },
  { label: 'Unwrap', icon: '⇄', tool: 'lido_unwrap', write: true },
  { label: 'Withdraw', icon: '↩', tool: 'lido_request_withdrawal', write: true },
  { label: 'Rewards', icon: '◈', tool: 'lido_get_rewards', write: false },
  { label: 'Governance', icon: '⬡', tool: 'lido_list_votes', write: false },
  { label: 'L2 Balances', icon: '◎', tool: 'lido_get_l2_balances', write: false },
  { label: 'Protocol', icon: '⬢', tool: 'lido_get_protocol_info', write: false },
];

function extractParams(tool: Tool): ParamField[] {
  const schema = tool.inputSchema;
  if (!schema?.properties) return [];
  const required = schema.required || [];
  return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
    name, type: prop.type || 'string', description: prop.description || '',
    required: required.includes(name), default: prop.default, enum: prop.enum,
  }));
}

/**
 * Extract values from a natural language query to auto-fill tool parameters.
 * "stake 0.5 ETH" → { amount: "0.5" }
 * "wrap 10 stETH" → { amount: "10" }
 * "transfer 1.5 to 0xabc..." → { amount: "1.5", to: "0xabc..." }
 * "vote 42 yes" → { vote_id: "42", vote_for: "true" }
 */
function extractValuesFromQuery(query: string, fields: ParamField[]): Record<string, string> {
  const values: Record<string, string> = {};
  const q = query.toLowerCase();

  // Extract numbers (potential amounts, IDs)
  const numbers = query.match(/\d+\.?\d*/g) || [];

  // Extract Ethereum addresses
  const addresses = query.match(/0x[a-fA-F0-9]{40}/g) || [];

  // Extract boolean intent
  const isYes = /\b(yes|true|for|approve)\b/i.test(q);
  const isNo = /\b(no|false|against|reject)\b/i.test(q);

  for (const field of fields) {
    const name = field.name.toLowerCase();

    // Amount fields — fill with first number found
    if ((name === 'amount' || name.includes('amount')) && numbers.length > 0) {
      values[field.name] = numbers[0]!;
      continue;
    }

    // Vote ID
    if ((name === 'vote_id' || name === 'voteid') && numbers.length > 0) {
      values[field.name] = numbers[0]!;
      continue;
    }

    // Request ID
    if ((name === 'request_id' || name.includes('request')) && numbers.length > 0) {
      values[field.name] = numbers[0]!;
      continue;
    }

    // Vote direction
    if (name === 'vote_for' && (isYes || isNo)) {
      values[field.name] = isYes ? 'true' : 'false';
      continue;
    }

    // Address / to / spender fields
    if ((name === 'to' || name === 'spender' || name === 'address' || name === 'recipient') && addresses.length > 0) {
      values[field.name] = addresses[0]!;
      continue;
    }

    // Token type from context
    if (name === 'token') {
      if (/wsteth/i.test(q)) values[field.name] = 'wstETH';
      else if (/steth/i.test(q)) values[field.name] = 'stETH';
      else if (/ldo/i.test(q)) values[field.name] = 'LDO';
      continue;
    }

    // Count / number fields
    if ((name === 'count' || name === 'module_id' || name === 'operator_id') && numbers.length > 0) {
      values[field.name] = numbers[0]!;
      continue;
    }
  }

  return values;
}

function renderResultData(data: any, onCallTool?: (name: string, args: Record<string, any>) => void): React.ReactElement {
  if (!data) return <span className="dash-result-empty">No data</span>;

  const summary = data.summary;

  // ─── Transaction Results (from write tools via wallet) ───
  if (data.tx_hashes && Array.isArray(data.tx_hashes)) {
    return (
      <div>
        <div className="dash-result-summary">
          {data.description || data.action || 'Transaction completed'}
        </div>
        <div className="dash-result-tx-list">
          {data.tx_hashes.map((hash: string, i: number) => (
            <div className="dash-result-tx" key={i}>
              <span className="dash-result-tx-label">Tx {data.tx_hashes.length > 1 ? `#${i + 1}` : 'Hash'}</span>
              <a className="dash-result-tx-hash" href={`https://hoodi.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer">
                {hash}
              </a>
            </div>
          ))}
        </div>
        {data.steps && <div className="dash-result-summary" style={{ marginTop: 8, fontSize: 11, color: '#484f58' }}>{data.steps} transaction{data.steps > 1 ? 's' : ''} completed</div>}
      </div>
    );
  }

  // Single tx_hash
  if (data.tx_hash && typeof data.tx_hash === 'string') {
    return (
      <div>
        {summary && <div className="dash-result-summary">{summary}</div>}
        <div className="dash-result-tx-list">
          <div className="dash-result-tx">
            <span className="dash-result-tx-label">Tx Hash</span>
            <a className="dash-result-tx-hash" href={`https://hoodi.etherscan.io/tx/${data.tx_hash}`} target="_blank" rel="noopener noreferrer">
              {data.tx_hash}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── L2 Balances ───
  if (data.l2_balances || data.balances) {
    const balances = data.l2_balances || data.balances;
    if (typeof balances === 'object' && !Array.isArray(balances)) {
      const chains = Object.entries(balances).filter(([, v]: [string, any]) => typeof v === 'object');
      if (chains.length > 0 && chains.some(([, v]: [string, any]) => v.wsteth !== undefined || v.wstETH !== undefined)) {
        return (
          <div>
            {summary && <div className="dash-result-summary">{summary}</div>}
            <div className="dash-result-list">
              {chains.map(([chain, v]: [string, any]) => {
                const bal = v.wsteth ?? v.wstETH ?? v.balance ?? '0';
                const balNum = parseFloat(bal);
                return (
                  <div className="dash-result-list-item" key={chain}>
                    <span className="dash-result-list-id" style={{ minWidth: 90, textTransform: 'capitalize' }}>{chain}</span>
                    <span className="dash-result-list-main">{balNum > 0 ? parseFloat(bal).toFixed(6) : '0'} wstETH</span>
                    <span className={`dash-w-status ${balNum > 0 ? 'claimable' : 'claimed'}`}>
                      {balNum > 0 ? 'Has Balance' : 'Empty'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    }
  }

  // ─── Votes ───
  if (data.votes && Array.isArray(data.votes)) {
    return (
      <div>
        {summary && <div className="dash-result-summary">{summary}</div>}
        <div className="dash-vote-list">
          {data.votes.map((v: any, i: number) => {
            const status = v.status || (v.open ? 'open' : v.executed ? 'executed' : 'closed');
            const support = v.current_support || (v.yea_pct ? `${v.yea_pct}%` : '');
            const quorum = v.current_quorum || '';
            return (
              <div className="dash-vote-card" key={i}>
                <div className="dash-vote-header">
                  <span className="dash-vote-id">
                    <a href={`https://dao.lido.fi/vote/${v.vote_id ?? v.id ?? i}`} target="_blank" rel="noopener noreferrer" className="dash-vote-link">
                      #{v.vote_id ?? v.id ?? i} ↗
                    </a>
                  </span>
                  <span className={`dash-vote-status ${status}`}>
                    {status === 'open' ? '🟢 Open' : status === 'executed' ? '✅ Executed' : '⏸ Closed'}
                  </span>
                </div>
                {v.start_date && <div className="dash-vote-date">{v.start_date}</div>}
                {(v.yea || v.current_support) && (
                  <div className="dash-vote-bar-wrap">
                    <div className="dash-vote-bar">
                      <div className="dash-vote-bar-yea" style={{ width: support || '0%' }} />
                    </div>
                    <div className="dash-vote-bar-labels">
                      <span className="dash-vote-yea">FOR {support}</span>
                      {quorum && <span className="dash-vote-quorum">Quorum: {quorum}</span>}
                    </div>
                  </div>
                )}
                {v.yea && (
                  <div className="dash-vote-tally">
                    <span>Yea: {v.yea}</span>
                    <span>Nay: {v.nay || '0'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Withdrawal requests ───
  if (data.requests && Array.isArray(data.requests)) {
    return (
      <div>
        {summary && <div className="dash-result-summary">{summary}</div>}
        <div className="dash-result-list">
          {data.requests.map((r: any, i: number) => (
            <div className="dash-result-list-item" key={i}>
              <span className="dash-result-list-id">#{r.id}</span>
              <span className="dash-result-list-main">{r.amount_steth || r.amount} stETH</span>
              <span className={`dash-w-status ${r.is_finalized && !r.is_claimed ? 'claimable' : r.is_claimed ? 'claimed' : 'pending'}`}>
                {r.is_claimed ? 'Claimed' : r.is_finalized ? 'Claimable' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Single Vote Detail (from lido_get_vote or lido_get_vote_details) ───
  if (data.vote_id !== undefined && (data.tallies || data.actions)) {
    const t = data.tallies || {};
    const actions = data.actions;
    const timeline = data.timeline;
    const links = data.links;
    return (
      <div>
        <div className="dash-vote-card" style={{ marginTop: 6 }}>
          <div className="dash-vote-header">
            <span className="dash-vote-id">
              <a href={links?.dao_ui || `https://dao.lido.fi/vote/${data.vote_id}`} target="_blank" rel="noopener noreferrer" className="dash-vote-link">
                Vote #{data.vote_id} ↗
              </a>
            </span>
            <span className={`dash-vote-status ${data.is_open ? 'open' : data.is_executed ? 'executed' : 'closed'}`}>
              {data.is_open ? '🟢 Open' : data.is_executed ? '✅ Executed' : '⏸ Closed'}
            </span>
          </div>

          {data.title && data.title !== `Vote #${data.vote_id}` && (
            <div className="dash-vote-title">{data.title}</div>
          )}

          {data.description && data.description !== 'No description available on-chain.' && (
            <div className="dash-vote-description">{data.description.substring(0, 500)}{data.description.length > 500 ? '...' : ''}</div>
          )}

          {(data.phase || timeline?.start) && (
            <div className="dash-vote-date">
              {data.phase && <span>Phase: {data.phase}</span>}
              {timeline?.start && <span> · Started: {timeline.start}</span>}
            </div>
          )}

          {(t.support || t.current_support) && (
            <div className="dash-vote-bar-wrap">
              <div className="dash-vote-bar">
                <div className="dash-vote-bar-yea" style={{ width: t.support || t.current_support || '0%' }} />
              </div>
              <div className="dash-vote-bar-labels">
                <span className="dash-vote-yea">FOR {t.support || t.current_support}</span>
                <span className="dash-vote-quorum">Quorum: {t.quorum || t.current_quorum} (req: {t.quorum_required || '5%'})</span>
              </div>
            </div>
          )}

          <div className="dash-vote-tally">
            <span>Yea: {t.yea || '0'}</span>
            <span>Nay: {t.nay || '0'}</span>
            {t.passed !== undefined && <span>{t.passed ? '✅ Passed' : '❌ Not passed'}</span>}
          </div>

          {/* Decoded actions — what this proposal does */}
          {actions && actions.count > 0 && (
            <div className="dash-vote-actions">
              <div className="dash-vote-actions-title">Proposal Actions ({actions.count})</div>
              {actions.description?.map((desc: string, i: number) => (
                <div className="dash-vote-action-item" key={i}>{desc}</div>
              ))}
            </div>
          )}

          {/* Vote buttons for open proposals */}
          {data.is_open && onCallTool && (
            <div className="dash-vote-buttons">
              <button className="dash-vote-btn for" onClick={() => onCallTool('lido_cast_vote', { vote_id: data.vote_id, vote_for: true, dry_run: false })}>
                👍 Vote FOR
              </button>
              <button className="dash-vote-btn against" onClick={() => onCallTool('lido_cast_vote', { vote_id: data.vote_id, vote_for: false, dry_run: false })}>
                👎 Vote AGAINST
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Contract Addresses ───
  if (data.contracts && typeof data.contracts === 'object' && data.contracts.lido) {
    return (
      <div>
        {summary && <div className="dash-result-summary">{summary}</div>}
        <div className="dash-result-list">
          {Object.entries(data.contracts as Record<string, string>).map(([name, addr]) => (
            <div className="dash-result-list-item" key={name}>
              <span className="dash-result-list-id" style={{ minWidth: 130, textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
              <span className="dash-result-tx-hash" style={{ fontSize: 11 }}>{String(addr)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Generic: extract all meaningful fields into metric cards ───
  const metrics: { label: string; value: string }[] = [];
  const skip = new Set(['summary', 'error', 'address', 'chain_id', 'chain', 'dry_run', 'multi_step', 'success', 'contracts']);

  // Flatten one level: collect primitives from top-level and one-level-deep objects
  function collect(obj: Record<string, any>, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      if (skip.has(k)) continue;
      if (typeof v === 'boolean') {
        metrics.push({ label: (prefix ? prefix + ' ' : '') + k.replace(/_/g, ' '), value: v ? '✓ Yes' : '✗ No' });
      } else if (typeof v === 'string' || typeof v === 'number') {
        const label = (prefix ? prefix + ' ' : '') + k.replace(/_/g, ' ');
        const val = typeof v === 'number' ? (v > 1e15 ? (v / 1e18).toFixed(6) : String(v)) : String(v);
        metrics.push({ label, value: val });
      } else if (v && typeof v === 'object' && !Array.isArray(v) && !prefix) {
        // Go one level deep only
        collect(v as Record<string, any>, k.replace(/_/g, ' '));
      }
    }
  }
  collect(data, '');

  // Special handling for transaction prepare results
  if (data.transaction && typeof data.transaction === 'object') {
    const tx = data.transaction as Record<string, any>;
    if (tx.description) metrics.unshift({ label: 'action', value: tx.description });
  }

  if (metrics.length === 0 && !summary) {
    return <pre className="dash-result-json">{JSON.stringify(data, null, 2)}</pre>;
  }

  return (
    <div>
      {summary && <div className="dash-result-summary">{summary}</div>}
      {metrics.length > 0 && (
        <div className="dash-result-metrics">
          {metrics.slice(0, 16).map((m, i) => (
            <div className="dash-result-metric" key={i}>
              <span className="dash-metric-value">{m.value.length > 30 ? m.value.substring(0, 28) + '...' : m.value}</span>
              <span className="dash-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ tools, walletAddress, chainId }: DashboardProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [inlineParams, setInlineParams] = useState<InlineParams | null>(null);
  const [showAllWithdrawals, setShowAllWithdrawals] = useState(false);
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'claimable' | 'pending' | 'claimed'>('all');
  const resultRef = useRef<HTMLDivElement>(null);
  const { execute: executeViaWallet, isReady: walletReady } = useContractExecutor();

  useEffect(() => { if (walletAddress) { setSummary(null); fetchSummary(); } }, [walletAddress, chainId]);
  useEffect(() => {
    if (actionResult && resultRef.current) resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [actionResult]);

  const fetchSummary = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/call'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'lido_summary', args: { address: walletAddress, chain_id: chainId } }),
      });
      const data = await res.json();
      if (data.content?.[0]?.text) setSummary(JSON.parse(data.content[0].text));
    } catch (err) { console.error('Summary fetch failed:', err); }
    finally { setLoading(false); }
  }, [walletAddress, chainId]);

  const callTool = useCallback(async (toolName: string, args: Record<string, any> = {}) => {
    setInlineParams(null);

    // Auto-inject chain_id and address silently (never show in param forms)
    if (chainId) args.chain_id = chainId;
    if (walletAddress && !args.address) {
      const tool = tools.find(t => t.name === toolName);
      if (tool?.inputSchema?.properties && 'address' in tool.inputSchema.properties) args.address = walletAddress;
    }

    if (isWriteTool(toolName)) {
      if (!walletReady) {
        setActionResult({ type: 'error', title: toolName, error: 'Wallet not connected. Connect your wallet to execute write operations.', tool: toolName });
        return;
      }
      setActionResult({ type: 'loading', title: 'Preparing transaction...', tool: toolName });
      try {
        // This calls lido_prepare_transaction via MCP, then sends via wallet
        setActionResult({ type: 'loading', title: 'Confirm in your wallet...', tool: toolName });
        const result = await executeViaWallet(toolName, args);
        setActionResult({ type: 'data', title: `${toolName} ✓`, data: result.result, tool: toolName });
        // Refresh summary after successful write
        fetchSummary();
      } catch (walletErr: any) {
        const msg = walletErr.message || String(walletErr);
        if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel') || msg.includes('User refused')) {
          setActionResult({ type: 'error', title: toolName, error: 'Transaction rejected by wallet.', tool: toolName });
        } else {
          setActionResult({ type: 'error', title: toolName, error: msg.substring(0, 200), tool: toolName });
        }
      }
    } else {
      setActionResult({ type: 'loading', title: toolName, tool: toolName });
      try {
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: toolName, args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: toolName, data: text ? JSON.parse(text) : data, tool: toolName });
      } catch (err: any) {
        setActionResult({ type: 'error', title: toolName, error: err.message, tool: toolName });
      }
    }
  }, [tools, walletAddress, walletReady, executeViaWallet]);


  const openInlineParams = useCallback((chipIndex: number, toolName: string, query?: string) => {
    // Close if same chip clicked again
    if (inlineParams?.chipIndex === chipIndex) { setInlineParams(null); return; }

    const tool = tools.find(t => t.name === toolName);
    if (!tool) return;
    const allFields = extractParams(tool);
    // Hide chain_id and address from UI — they're injected automatically
    const fields = allFields.filter(f => f.name !== 'chain_id' && f.name !== 'address');
    if (fields.length === 0) { callTool(toolName); return; }

    // Start with defaults — but override dry_run to false for UI
    const values: Record<string, string> = {};
    for (const f of fields) {
      if (f.name === 'dry_run') values[f.name] = 'false';
      else if (f.default !== undefined) values[f.name] = String(f.default);
      else values[f.name] = '';
    }

    // Auto-fill from query if provided
    if (query) {
      const extracted = extractValuesFromQuery(query, fields);
      for (const [k, v] of Object.entries(extracted)) {
        values[k] = v;
      }
    }

    // Always show the form — let user review and click Execute
    setInlineParams({ chipIndex, tool, fields, values });
  }, [tools, walletAddress, callTool, inlineParams]);

  const submitInlineParams = useCallback(() => {
    if (!inlineParams) return;
    const args: Record<string, any> = {};
    for (const f of inlineParams.fields) {
      const val = inlineParams.values[f.name]?.trim();
      if (!val && f.required) return;
      if (!val) continue;
      if (f.type === 'boolean') args[f.name] = val === 'true' || val === 'yes';
      else if (f.type === 'number' || f.type === 'integer') args[f.name] = Number(val);
      else args[f.name] = val;
    }
    callTool(inlineParams.tool.name, args);
  }, [inlineParams, callTool]);

  // Client-side keyword search as fallback
  const localSearch = useCallback((query: string): Tool | null => {
    const q = query.toLowerCase();
    const scored = tools.map(t => {
      const haystack = `${t.name.replace(/_/g, ' ')} ${t.description || ''}`.toLowerCase();
      let score = 0;
      for (const word of q.split(/\s+/)) {
        if (word.length > 2 && haystack.includes(word)) score += 2;
      }
      // Boost exact name substring matches
      if (t.name.toLowerCase().includes(q.replace(/\s+/g, '_'))) score += 5;
      return { tool: t, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
    return scored[0]?.tool || null;
  }, [tools]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.trim();
    setSearchQuery('');

    // ─── Intent detection: direct tool calls for common patterns ───
    const q = query.toLowerCase();

    // "proposal 198" / "vote 198" / "vote #198" / "show proposal 198" → get vote details
    const voteMatch = q.match(/(?:proposal|vote|governance)\s*#?\s*(\d+)/);
    if (voteMatch) {
      const voteId = parseInt(voteMatch[1]!);
      setActionResult({ type: 'loading', title: `Vote #${voteId}` });
      try {
        const args: Record<string, any> = { vote_id: voteId };
        if (chainId) args.chain_id = chainId;
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'lido_get_vote_details', args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: `Vote #${voteId}`, data: text ? JSON.parse(text) : data, tool: 'lido_get_vote_details' });
      } catch (err: any) {
        setActionResult({ type: 'error', title: query, error: err.message });
      }
      return;
    }

    // "easy track" / "motions" → Easy Track motions
    if (/easy\s*track|motions/i.test(q)) {
      setActionResult({ type: 'loading', title: 'Easy Track Motions' });
      try {
        const args: Record<string, any> = {};
        if (chainId) args.chain_id = chainId;
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'lido_get_easy_track_motions', args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: 'Easy Track Motions', data: text ? JSON.parse(text) : data, tool: 'lido_get_easy_track_motions' });
      } catch (err: any) { setActionResult({ type: 'error', title: query, error: err.message }); }
      return;
    }

    // "dual governance" / "governance state" / "is governance blocked" → DG state
    if (/dual\s*governance|governance\s*state|governance\s*blocked/i.test(q)) {
      setActionResult({ type: 'loading', title: 'Dual Governance' });
      try {
        const args: Record<string, any> = {};
        if (chainId) args.chain_id = chainId;
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'lido_get_dual_governance_state', args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: 'Dual Governance', data: text ? JSON.parse(text) : data, tool: 'lido_get_dual_governance_state' });
      } catch (err: any) { setActionResult({ type: 'error', title: query, error: err.message }); }
      return;
    }

    // "proposals" / "all proposals" / "governance proposals" / "open votes" → list votes
    if (/(?:all |open |recent |live )?(?:proposals|votes|governance)$/i.test(q) || q === 'proposals' || q === 'governance') {
      setActionResult({ type: 'loading', title: 'Governance Proposals' });
      try {
        const args: Record<string, any> = { count: 10 };
        if (chainId) args.chain_id = chainId;
        if (/open|live|active/i.test(q)) args.status = 'open';
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'lido_list_votes', args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: 'Governance Proposals', data: text ? JSON.parse(text) : data, tool: 'lido_list_votes' });
      } catch (err: any) {
        setActionResult({ type: 'error', title: query, error: err.message });
      }
      return;
    }

    // ─── Generic search ───
    setActionResult({ type: 'loading', title: query });

    // Try to find matching tool — API search first, then local fallback
    let matchedTool: Tool | null = null;

    try {
      const searchRes = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query)}`));
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.best && searchData.best.score > 0.2) {
          matchedTool = tools.find(t => t.name === searchData.best.name) || null;
        }
      }
    } catch {
      // API search failed — fall through to local
    }

    // Local keyword fallback
    if (!matchedTool) {
      matchedTool = localSearch(query);
    }

    if (matchedTool) {
      const fields = extractParams(matchedTool);
      const nonDefaultFields = fields.filter(f => f.required && f.name !== 'address');
      if (nonDefaultFields.length > 0) {
        setActionResult(null);
        openInlineParams(-1, matchedTool.name, query);
        return;
      }
      // No required params — call directly
      try {
        const args: Record<string, any> = {};
        if (walletAddress) args.address = walletAddress;
        if (chainId) args.chain_id = chainId;
        const res = await fetch(apiUrl('/api/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: matchedTool.name, args }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text;
        setActionResult({ type: 'data', title: query, data: text ? JSON.parse(text) : data, tool: matchedTool.name });
      } catch (err: any) {
        setActionResult({ type: 'error', title: query, error: err.message });
      }
      return;
    }

    setActionResult({ type: 'error', title: query, error: `No matching tool found for "${query}". Try: "balance", "rewards", "protocol info", "stake", "wrap", etc.` });
  }, [searchQuery, walletAddress, tools, openInlineParams]);

  const fmt = (val: string, decimals = 4) => {
    const n = parseFloat(val); if (isNaN(n)) return val;
    if (n === 0) return '0'; if (n < 0.0001 && n > 0) return n.toExponential(2);
    return n.toFixed(decimals);
  };
  const fmtBig = (val: string) => {
    const n = parseFloat(val);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed(2);
  };

  if (!walletAddress) {
    return (
      <div className="dash">
        <div className="dash-empty">
          <div className="dash-empty-icon">◈</div>
          <div className="dash-empty-title">Connect or Impersonate</div>
          <div className="dash-empty-sub">Connect your wallet or paste an address in the bar above to explore any Lido position.</div>
        </div>
      </div>
    );
  }

  const allWithdrawals = [...(summary?.withdrawals.requests || [])].sort((a: any, b: any) => Number(b.id) - Number(a.id));
  const filteredWithdrawals = allWithdrawals.filter((r: any) => {
    if (withdrawalFilter === 'all') return true;
    if (withdrawalFilter === 'claimable') return r.is_finalized && !r.is_claimed;
    if (withdrawalFilter === 'pending') return !r.is_finalized && !r.is_claimed;
    if (withdrawalFilter === 'claimed') return r.is_claimed;
    return true;
  });
  const visibleWithdrawals = showAllWithdrawals
    ? filteredWithdrawals
    : filteredWithdrawals.slice(0, 5);

  return (
    <div className="dash">

      {/* Search */}
      <div className="dash-search">
        <span className="dash-search-icon">⌕</span>
        <input className="dash-search-input" type="text"
          placeholder='Ask anything — "my rewards", "stake 1 ETH", "protocol TVL"'
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <span className="dash-search-badge">✦ AI</span>
      </div>

      {/* Result — below search */}
      {actionResult && (
        <div className="dash-result" ref={resultRef}>
          {actionResult.type === 'loading' ? (
            <div className="dash-result-loading"><div className="dash-spinner" /><span>{actionResult.title || 'Processing...'}</span></div>
          ) : actionResult.type === 'error' ? (
            <><div className="dash-result-header error">✕ Error</div><div className="dash-result-body">{actionResult.error}</div></>
          ) : (
            <>
              <div className="dash-result-header"><span className="dash-sparkle">✦</span>{actionResult.title}</div>
              {renderResultData(actionResult.data, callTool)}
              {actionResult.tool && <div className="dash-result-source">via <code>{actionResult.tool}</code></div>}
            </>
          )}
          <button className="dash-result-close" onClick={() => setActionResult(null)}>✕</button>
        </div>
      )}

      {/* Inline params from search (-1 index) */}
      {inlineParams && inlineParams.chipIndex === -1 && (
        <div className="dash-inline-params">
          <div className="dash-inline-header">
            <span>{inlineParams.tool.name}</span>
            <button className="dash-inline-close" onClick={() => setInlineParams(null)}>✕</button>
          </div>
          <div className="dash-inline-fields">
            {inlineParams.fields.map(f => (
              <div className="dash-inline-field" key={f.name}>
                <label className="dash-field-label">{f.name}{f.required && <span className="dash-field-req">*</span>}</label>
                {f.type === 'boolean' ? (
                  <select className="dash-field-input" value={inlineParams.values[f.name] || ''}
                    onChange={e => setInlineParams({ ...inlineParams, values: { ...inlineParams.values, [f.name]: e.target.value } })}>
                    <option value="true">true</option><option value="false">false</option>
                  </select>
                ) : (
                  <input className="dash-field-input" type="text"
                    placeholder={f.default !== undefined ? `Default: ${f.default}` : f.description}
                    value={inlineParams.values[f.name] || ''}
                    onChange={e => setInlineParams({ ...inlineParams, values: { ...inlineParams.values, [f.name]: e.target.value } })}
                    onKeyDown={e => e.key === 'Enter' && submitInlineParams()} />
                )}
              </div>
            ))}
          </div>
          <button className="dash-inline-submit" onClick={submitInlineParams}>Execute →</button>
        </div>
      )}

      {/* Chips + inline dropdowns */}
      <div className="dash-chips-area">
        <div className="dash-chips">
          {CHIPS.map((chip, i) => (
            <button key={chip.tool}
              className={`dash-chip ${chip.write ? 'dash-chip-write' : ''} ${inlineParams?.chipIndex === i ? 'dash-chip-active' : ''}`}
              onClick={() => openInlineParams(i, chip.tool)}>
              <span className="dash-chip-icon">{chip.icon}</span>{chip.label}
              {inlineParams?.chipIndex === i && <span className="dash-chip-arrow">▾</span>}
            </button>
          ))}
        </div>

        {/* Inline dropdown below chips */}
        {inlineParams && inlineParams.chipIndex >= 0 && (
          <div className="dash-inline-params">
            <div className="dash-inline-header">
              <span>{inlineParams.tool.name}</span>
              <button className="dash-inline-close" onClick={() => setInlineParams(null)}>✕</button>
            </div>
            <div className="dash-inline-desc">{inlineParams.tool.description}</div>
            <div className="dash-inline-fields">
              {inlineParams.fields.map((f, fi) => (
                <div className="dash-inline-field" key={f.name}>
                  <label className="dash-field-label">
                    {f.name}
                    {f.required ? <span className="dash-field-req">*</span> : <span className="dash-field-opt">optional</span>}
                  </label>
                  {f.enum ? (
                    <select className="dash-field-input" value={inlineParams.values[f.name] || ''}
                      onChange={e => setInlineParams({ ...inlineParams, values: { ...inlineParams.values, [f.name]: e.target.value } })}>
                      <option value="">— select —</option>
                      {f.enum.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : f.type === 'boolean' ? (
                    <select className="dash-field-input" value={inlineParams.values[f.name] || ''}
                      onChange={e => setInlineParams({ ...inlineParams, values: { ...inlineParams.values, [f.name]: e.target.value } })}>
                      <option value="true">true</option><option value="false">false</option>
                    </select>
                  ) : (
                    <input className="dash-field-input" type="text"
                      placeholder={f.default !== undefined ? `Default: ${f.default}` : f.description}
                      value={inlineParams.values[f.name] || ''}
                      onChange={e => setInlineParams({ ...inlineParams, values: { ...inlineParams.values, [f.name]: e.target.value } })}
                      onKeyDown={e => e.key === 'Enter' && submitInlineParams()}
                      autoFocus={fi === 0} />
                  )}
                </div>
              ))}
            </div>
            <button className="dash-inline-submit" onClick={submitInlineParams}>Execute →</button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && !summary && (
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading your position...</span></div>
      )}

      {summary && (
        <>
          {/* Protocol ticker */}
          <div className="dash-ticker">
            {[
              { label: 'TVL', value: `${fmtBig(summary.protocol.tvl_eth)} ETH` },
              { label: 'APR', value: `${summary.rewards.estimated_apr_pct}%`, accent: true },
              { label: 'wstETH Rate', value: `${fmt(summary.rates.steth_per_wsteth)} stETH` },
              { label: 'Validators', value: parseInt(summary.protocol.deposited_validators).toLocaleString() },
              { label: 'Staking', value: summary.protocol.is_staking_paused ? '⏸ Paused' : '● Active', accent: !summary.protocol.is_staking_paused },
            ].map(t => (
              <div className="dash-ticker-item" key={t.label}>
                <span className="dash-ticker-label">{t.label}</span>
                <span className={`dash-ticker-value ${t.accent ? 'accent' : ''}`}>{t.value}</span>
              </div>
            ))}
          </div>

          {/* Token cards */}
          <div className="dash-section-label">Balances</div>
          <div className="dash-tokens">
            {[
              { key: 'eth', label: 'ETH', color: '#627eea', val: summary.balances.eth, sub: 'Ethereum' },
              { key: 'steth', label: 'stETH', color: '#00e5a0', val: summary.balances.steth, sub: 'Staked ETH' },
              { key: 'wsteth', label: 'wstETH', color: '#39bae6', val: summary.balances.wsteth, sub: `≈ ${fmt(summary.staking.wsteth_in_steth)} stETH` },
              { key: 'ldo', label: 'LDO', color: '#f5a623', val: summary.balances.ldo, sub: 'Lido DAO' },
            ].map(t => (
              <div className="dash-token" key={t.key}>
                <div className="dash-token-dot" style={{ background: t.color, boxShadow: `0 0 10px ${t.color}44` }} />
                <div className="dash-token-label">{t.label}</div>
                <div className="dash-token-val">{fmt(t.val)}</div>
                <div className="dash-token-sub">{t.sub}</div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="dash-stats">
            <div className="dash-stat-card">
              <div className="dash-stat-top"><span className="dash-stat-label">Total Staked</span><span className="dash-pill dash-pill-green">Earning</span></div>
              <div className="dash-stat-value">{fmt(summary.staking.total_staked_eth)} <span className="dash-stat-unit">ETH</span></div>
              <div className="dash-stat-detail">stETH + wstETH · <span className="dash-hl">+{summary.rewards.estimated_apr_pct}% APR</span></div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-top"><span className="dash-stat-label">Projected Rewards</span><span className="dash-pill dash-pill-blue">Yearly</span></div>
              <div className="dash-stat-value">{fmt(summary.rewards.estimated_yearly_eth, 6)} <span className="dash-stat-unit">ETH/yr</span></div>
              <div className="dash-stat-detail">~{fmt(summary.rewards.estimated_daily_eth, 8)} ETH/day · Fee: {summary.rewards.protocol_fee_pct}%</div>
            </div>
          </div>

          {/* Withdrawals */}
          {summary.withdrawals.total_requests > 0 && (
            <div className="dash-withdrawals">
              <div className="dash-stat-top">
                <span className="dash-stat-label">Withdrawals ({summary.withdrawals.total_requests})</span>
              </div>

              {/* Filter chips */}
              <div className="dash-w-filters">
                {([
                  { key: 'all' as const, label: 'All', count: allWithdrawals.length },
                  { key: 'claimable' as const, label: 'Claimable', count: summary.withdrawals.claimable },
                  { key: 'pending' as const, label: 'Pending', count: summary.withdrawals.pending },
                ]).map(f => (
                  <button
                    key={f.key}
                    className={`dash-w-filter ${withdrawalFilter === f.key ? 'active' : ''} ${f.key === 'claimable' ? 'green' : f.key === 'pending' ? 'amber' : ''}`}
                    onClick={() => { setWithdrawalFilter(f.key); setShowAllWithdrawals(false); }}
                  >
                    {f.label} <span className="dash-w-filter-count">{f.count}</span>
                  </button>
                ))}
              </div>

              {/* Scrollable list */}
              <div className={`dash-w-list ${showAllWithdrawals ? 'expanded' : ''}`}>
                {visibleWithdrawals.length === 0 && (
                  <div className="dash-w-empty">No {withdrawalFilter} withdrawals</div>
                )}
                {visibleWithdrawals.map((req: any) => (
                  <div className="dash-w-row" key={req.id}>
                    <span className="dash-w-id">#{req.id}</span>
                    <span className="dash-w-amount">{parseFloat(req.amount_steth) < 0.0001 ? parseFloat(req.amount_steth).toExponential(2) : parseFloat(req.amount_steth).toFixed(4)} stETH</span>
                    <span className={`dash-w-status ${req.is_finalized && !req.is_claimed ? 'claimable' : req.is_claimed ? 'claimed' : 'pending'}`}>
                      {req.is_claimed ? 'Claimed' : req.is_finalized ? 'Claimable' : 'Pending'}
                    </span>
                    {req.is_finalized && !req.is_claimed && (
                      <button className="dash-claim-btn" onClick={() => callTool('lido_claim_single_withdrawal', { request_id: req.id, dry_run: false })}>Claim</button>
                    )}
                  </div>
                ))}
              </div>

              {filteredWithdrawals.length > 5 && (
                <div className="dash-w-more" onClick={() => setShowAllWithdrawals(!showAllWithdrawals)}>
                  {showAllWithdrawals ? 'Show less ↑' : `Show ${filteredWithdrawals.length - 5} more ↓`}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
