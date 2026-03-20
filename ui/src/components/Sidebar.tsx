import { useState } from 'react';
import type { Tool } from '../types';

interface SidebarProps {
  tools: Tool[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectTool: (toolName: string) => void;
}

interface DomainGroup {
  domain: string;
  icon: string;
  read: Tool[];
  write: Tool[];
}

// Map tool names to Lido product domains
function getDomain(name: string): { domain: string; icon: string } {
  // Staking
  if (/^lido_(stake|get_staking_limit|is_staking_paused|get_beacon_stats|get_stake)/.test(name))
    return { domain: 'Staking', icon: '↗' };

  // Wrapping
  if (/^lido_(wrap|unwrap)$/.test(name))
    return { domain: 'Wrapping', icon: '⇄' };

  // Withdrawals
  if (/withdrawal|withdraw|claim|bunker|nft_owner|approve_nft|transfer.*nft/.test(name))
    return { domain: 'Withdrawals', icon: '↩' };

  // Governance (Aragon)
  if (/vote|voter|cast_vote|delegate|undelegate/.test(name) && !name.includes('easy') && !name.includes('dual'))
    return { domain: 'Governance', icon: '🏛' };

  // Easy Track
  if (/easy_track|motion/.test(name))
    return { domain: 'Easy Track', icon: '⚡' };

  // Dual Governance
  if (/dual_governance|governance_overview|governance_state/.test(name))
    return { domain: 'Dual Governance', icon: '🛡' };

  // Tokens & Balances
  if (/transfer|approve|revoke|increase_allowance|allowance|balance|token_info|convert|exchange_rate|share_rate/.test(name) && !name.includes('nft'))
    return { domain: 'Tokens', icon: '🪙' };

  // Rewards
  if (/reward/.test(name))
    return { domain: 'Rewards', icon: '💎' };

  // Position & Portfolio
  if (/position|l2_balance|summary/.test(name))
    return { domain: 'Position', icon: '📊' };

  // Protocol Infrastructure
  if (/protocol|staking_module|node_operator|contract_address|supported_chain|fee_distribution/.test(name))
    return { domain: 'Protocol', icon: '⬢' };

  // System
  if (/status|prepare/.test(name))
    return { domain: 'System', icon: '⚙' };

  return { domain: 'Other', icon: '•' };
}

function isWriteTool(name: string): boolean {
  if (name.startsWith('lido_get_') || name.startsWith('lido_is_') || name.startsWith('lido_list_')) return false;
  if (name === 'lido_status' || name === 'lido_convert' || name === 'lido_summary') return false;
  const writeOps = ['stake', 'wrap', 'unwrap', 'transfer', 'approve', 'request', 'claim', 'delegate', 'revoke', 'increase', 'cast_vote', 'prepare', 'object'];
  return writeOps.some(op => name.includes(op));
}

function groupByDomain(tools: Tool[]): DomainGroup[] {
  const map = new Map<string, DomainGroup>();

  // Define domain order
  const order = ['Staking', 'Wrapping', 'Withdrawals', 'Tokens', 'Rewards', 'Position', 'Governance', 'Easy Track', 'Dual Governance', 'Protocol', 'System', 'Other'];

  for (const tool of tools) {
    const { domain, icon } = getDomain(tool.name);
    if (!map.has(domain)) {
      map.set(domain, { domain, icon, read: [], write: [] });
    }
    const group = map.get(domain)!;
    if (isWriteTool(tool.name)) {
      group.write.push(tool);
    } else {
      group.read.push(tool);
    }
  }

  // Sort by defined order
  return order
    .filter(d => map.has(d))
    .map(d => map.get(d)!)
    .concat([...map.values()].filter(g => !order.includes(g.domain)));
}

function getFirstLine(desc: string | undefined): string {
  if (!desc) return '';
  const first = desc.split('\n')[0]!.split('.')[0]!;
  return first.length > 55 ? first.slice(0, 52) + '...' : first;
}

export default function Sidebar({ tools, isOpen, onToggle, onSelectTool }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupByDomain(tools);

  const toggleDomain = (domain: string) => {
    setCollapsed(prev => ({ ...prev, [domain]: !prev[domain] }));
  };

  const totalWrite = tools.filter(t => isWriteTool(t.name)).length;
  const totalRead = tools.length - totalWrite;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">TOOLS</span>
          <span className="sidebar-count">{tools.length}</span>
          <span className="sidebar-meta">{totalRead}R · {totalWrite}W</span>
          <button className="sidebar-close-btn" onClick={onToggle}>
            <span>&#x2715;</span>
          </button>
        </div>

        <div className="sidebar-content">
          {tools.length === 0 && (
            <div className="sidebar-loading">
              <span className="spinner" />
              <span>Loading tools...</span>
            </div>
          )}

          {groups.map(group => {
            const isCollapsed = collapsed[group.domain];
            const total = group.read.length + group.write.length;
            return (
              <div key={group.domain} className="tool-group">
                <button
                  className="tool-group-header"
                  onClick={() => toggleDomain(group.domain)}
                >
                  <span className="tool-group-icon">{group.icon}</span>
                  <span className="tool-group-label">{group.domain}</span>
                  <span className="tool-group-count">{total}</span>
                  <span className={`tool-group-chevron ${isCollapsed ? 'collapsed' : ''}`}>
                    &#9662;
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="tool-group-items">
                    {/* Write tools first */}
                    {group.write.length > 0 && (
                      <div className="tool-subgroup">
                        <div className="tool-subgroup-label">
                          <span className="tool-group-dot dot-write" />
                          Write ({group.write.length})
                        </div>
                        {group.write.map(tool => (
                          <button key={tool.name} className="tool-item" onClick={() => onSelectTool(tool.name)} title={tool.description}>
                            <span className="tool-name">{tool.name}</span>
                            <span className="tool-desc">{getFirstLine(tool.description)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Then read tools */}
                    {group.read.length > 0 && (
                      <div className="tool-subgroup">
                        <div className="tool-subgroup-label">
                          <span className="tool-group-dot dot-read" />
                          Read ({group.read.length})
                        </div>
                        {group.read.map(tool => (
                          <button key={tool.name} className="tool-item" onClick={() => onSelectTool(tool.name)} title={tool.description}>
                            <span className="tool-name">{tool.name}</span>
                            <span className="tool-desc">{getFirstLine(tool.description)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
