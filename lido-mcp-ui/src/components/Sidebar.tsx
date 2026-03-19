import { useState } from 'react';
import type { Tool } from '../types';

interface SidebarProps {
  tools: Tool[];
  isOpen: boolean;
  onToggle: () => void;
  onSelectTool: (toolName: string) => void;
}

type Category = 'read' | 'write' | 'other';

interface ToolGroup {
  category: Category;
  label: string;
  tools: Tool[];
}

function categorizeTool(name: string): Category {
  const writeOps = ['stake', 'wrap', 'unwrap', 'transfer', 'approve', 'request', 'claim', 'delegate', 'revoke', 'increase', 'vote'];
  for (const op of writeOps) {
    if (name.includes(op)) return 'write';
  }
  if (name.includes('get') || name.includes('status') || name.includes('check') || name.includes('balance') || name.includes('info')) {
    return 'read';
  }
  return 'other';
}

function groupTools(tools: Tool[]): ToolGroup[] {
  const groups: Record<Category, Tool[]> = { read: [], write: [], other: [] };
  for (const tool of tools) {
    const cat = categorizeTool(tool.name);
    groups[cat].push(tool);
  }

  const result: ToolGroup[] = [];
  if (groups.read.length) result.push({ category: 'read', label: 'Read Operations', tools: groups.read });
  if (groups.write.length) result.push({ category: 'write', label: 'Write Operations', tools: groups.write });
  if (groups.other.length) result.push({ category: 'other', label: 'Other', tools: groups.other });
  return result;
}

function getFirstLine(desc: string | undefined): string {
  if (!desc) return '';
  const first = desc.split('\n')[0].split('.')[0];
  return first.length > 60 ? first.slice(0, 57) + '...' : first;
}

export default function Sidebar({ tools, isOpen, onToggle, onSelectTool }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupTools(tools);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">TOOLS</span>
          <span className="sidebar-count">{tools.length}</span>
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

          {groups.map(group => (
            <div key={group.category} className="tool-group">
              <button
                className="tool-group-header"
                onClick={() => toggleCategory(group.category)}
              >
                <span className={`tool-group-dot dot-${group.category}`} />
                <span className="tool-group-label">{group.label}</span>
                <span className={`tool-group-badge badge-${group.category}`}>
                  {group.category === 'read' ? 'R' : group.category === 'write' ? 'W' : '?'}
                </span>
                <span className="tool-group-count">{group.tools.length}</span>
                <span className={`tool-group-chevron ${collapsed[group.category] ? 'collapsed' : ''}`}>
                  &#9662;
                </span>
              </button>

              {!collapsed[group.category] && (
                <div className="tool-group-items">
                  {group.tools.map(tool => (
                    <button
                      key={tool.name}
                      className="tool-item"
                      onClick={() => onSelectTool(tool.name)}
                      title={tool.description}
                    >
                      <span className="tool-name">{tool.name}</span>
                      <span className="tool-desc">{getFirstLine(tool.description)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
