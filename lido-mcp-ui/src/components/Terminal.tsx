import { useState, useRef, useEffect, useCallback } from 'react';
import type { Tool } from '../types';
import { apiUrl } from '../api';
import { useContractExecutor, isWriteTool } from '../hooks/useContractExecutor';

interface HistoryEntry {
  id: number;
  type: 'command' | 'result' | 'error' | 'system' | 'param-prompt';
  text: string;
  timestamp: number;
}

interface ParamState {
  toolName: string;
  tool: Tool;
  params: Record<string, unknown>;
  remaining: ParamDef[];
  current: ParamDef | null;
}

interface ParamDef {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

interface TerminalProps {
  tools: Tool[];
  pendingCommand: string | null;
  onCommandConsumed: () => void;
  walletAddress?: string;
  chainId?: number;
  chainName?: string;
}

const ASCII_BANNER = `
  _     ___ ____   ___    __  __  ____ ____
 | |   |_ _|  _ \\ / _ \\  |  \\/  |/ ___|  _ \\
 | |    | || | | | | | | | |\\/| | |   | |_) |
 | |___ | || |_| | |_| | | |  | | |___|  __/
 |_____|___|____/ \\___/  |_|  |_|\\____|_|

  A G E N T   C O N S O L E   v2.0.0
`;

function syntaxHighlightJSON(json: string): string {
  return json
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractParams(tool: Tool): ParamDef[] {
  const schema = tool.inputSchema;
  if (!schema?.properties) return [];
  const required = schema.required || [];
  return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
    name,
    type: prop.type || 'string',
    description: prop.description || '',
    required: required.includes(name),
    default: prop.default,
    enum: prop.enum,
  }));
}

function categorizeTool(name: string): string {
  const writeOps = ['stake', 'wrap', 'unwrap', 'transfer', 'approve', 'request', 'claim', 'delegate', 'revoke', 'increase', 'vote', 'undelegate'];
  for (const op of writeOps) {
    if (name.includes(op) && !name.includes('get')) return 'write';
  }
  return 'read';
}

export default function Terminal({ tools, pendingCommand, onCommandConsumed, walletAddress, chainId, chainName }: TerminalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { id: 0, type: 'system', text: ASCII_BANNER, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [paramState, setParamState] = useState<ParamState | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(2);

  // Show/update welcome message with wallet + chain info
  useEffect(() => {
    const walletInfo = walletAddress
      ? `Wallet: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
      : 'Wallet: Not connected (connect via button above)';
    const chainInfo = chainName ? `Network: ${chainName} (${chainId})` : '';
    const welcome = `Connected to Lido MCP Server\n${chainInfo} | ${walletInfo}\n\nType a tool name to get started. Parameters will be prompted.\nType "help" for commands, "tools" for tool list, "clear" to reset.\n`;
    setHistory(prev => {
      // Replace the welcome message (id=1) if it exists, otherwise append
      const hasWelcome = prev.some(e => e.id === 1);
      if (hasWelcome) {
        return prev.map(e => e.id === 1 ? { ...e, text: welcome, timestamp: Date.now() } : e);
      }
      return [...prev, { id: 1, type: 'system' as const, text: welcome, timestamp: Date.now() }];
    });
  }, [walletAddress, chainId, chainName]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [history, scrollToBottom]);

  useEffect(() => {
    if (pendingCommand) {
      setInput(pendingCommand);
      onCommandConsumed();
      inputRef.current?.focus();
    }
  }, [pendingCommand, onCommandConsumed]);

  const addEntry = useCallback((type: HistoryEntry['type'], text: string) => {
    setHistory(prev => [...prev, { id: nextId.current++, type, text, timestamp: Date.now() }]);
  }, []);

  const { execute: executeViaWallet, isReady: walletReady } = useContractExecutor();

  const callTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    // Auto-inject chain_id from connected wallet
    if (chainId && !args.chain_id) {
      args.chain_id = chainId;
    }
    // Auto-inject wallet address for address params if wallet connected and not provided
    if (walletAddress && !args.address) {
      const tool = tools.find(t => t.name === toolName);
      if (tool?.inputSchema?.properties && 'address' in tool.inputSchema.properties) {
        args.address = walletAddress;
      }
    }

    setLoading(true);
    try {
      // Route write tools through connected wallet, reads through MCP proxy
      if (isWriteTool(toolName)) {
        if (!walletReady) {
          addEntry('error', 'Wallet not connected. Connect your wallet to execute write operations.');
          return;
        }
        addEntry('system', `  Executing via connected wallet...`);
        const result = await executeViaWallet(toolName, args as Record<string, any>);
        const output: any = { ...result.result };
        if (result.tx_hash) output.tx_hash = result.tx_hash;
        addEntry('result', JSON.stringify(output, null, 2));
        return;
      }

      // Read tools go through MCP proxy
      const response = await fetch(apiUrl('/api/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, args }),
      });
      const data = await response.json();

      if (!response.ok) {
        addEntry('error', `Error: ${data.error || 'Request failed'}`);
        return;
      }

      if (data.content && Array.isArray(data.content)) {
        for (const item of data.content) {
          if (item.type === 'text') {
            try {
              const parsed = JSON.parse(item.text);
              addEntry('result', JSON.stringify(parsed, null, 2));
            } catch {
              addEntry('result', item.text);
            }
          }
        }
      } else {
        addEntry('result', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      addEntry('error', `Failed: ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setLoading(false);
    }
  }, [tools, walletAddress, walletReady, executeViaWallet, addEntry]);

  const startParamPrompt = useCallback((toolName: string, tool: Tool) => {
    const params = extractParams(tool);

    if (params.length === 0) {
      // No params — execute immediately
      addEntry('command', toolName);
      callTool(toolName, {});
      return;
    }

    addEntry('command', toolName);

    // Start interactive param collection
    const remaining = [...params];
    const current = remaining.shift()!;
    setParamState({ toolName, tool, params: {}, remaining, current });

    const requiredMark = current.required ? ' (required)' : ` (optional, default: ${current.default ?? 'none'})`;
    const enumHint = current.enum ? ` [${current.enum.join(' | ')}]` : '';
    addEntry('param-prompt', `  ${current.name}${requiredMark}${enumHint}\n  ${current.description || `Enter ${current.name}`}`);
  }, [addEntry, callTool]);

  const handleParamInput = useCallback((value: string) => {
    if (!paramState) return;

    const { toolName, tool, params, remaining, current } = paramState;
    const trimmed = value.trim();

    // Collect current param
    const newParams = { ...params };
    if (trimmed === '' || trimmed === '-') {
      // Skip optional param or use default
      if (current!.required) {
        addEntry('error', `  "${current!.name}" is required. Please provide a value.`);
        return;
      }
      // Use default or skip
      if (current!.default !== undefined) {
        newParams[current!.name] = current!.default;
        addEntry('system', `  ${current!.name} = ${JSON.stringify(current!.default)} (default)`);
      } else {
        addEntry('system', `  ${current!.name} = (skipped)`);
      }
    } else {
      // Parse value based on type
      let parsed: unknown = trimmed;
      if (current!.type === 'boolean') {
        parsed = trimmed === 'true' || trimmed === 'yes' || trimmed === '1';
      } else if (current!.type === 'number' || current!.type === 'integer') {
        parsed = Number(trimmed);
        if (isNaN(parsed as number)) {
          addEntry('error', `  "${trimmed}" is not a valid number.`);
          return;
        }
      } else if (current!.type === 'array') {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = trimmed.split(',').map(s => s.trim());
        }
      }
      newParams[current!.name] = parsed;
      addEntry('system', `  ${current!.name} = ${JSON.stringify(parsed)}`);
    }

    // Next param or execute
    if (remaining.length === 0) {
      setParamState(null);
      addEntry('system', `\n  Executing ${toolName}...`);
      callTool(toolName, newParams);
    } else {
      const next = remaining[0]!;
      const rest = remaining.slice(1);
      setParamState({ toolName, tool, params: newParams, remaining: rest, current: next });

      const requiredMark = next.required ? ' (required)' : ` (optional, default: ${next.default ?? 'none'}, press Enter to skip)`;
      const enumHint = next.enum ? ` [${next.enum.join(' | ')}]` : '';
      addEntry('param-prompt', `  ${next.name}${requiredMark}${enumHint}\n  ${next.description || `Enter ${next.name}`}`);
    }
  }, [paramState, addEntry, callTool]);

  const executeCommand = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed && !paramState) return;

    // If we're in param collection mode
    if (paramState) {
      handleParamInput(trimmed);
      return;
    }

    setCmdHistory(prev => [trimmed, ...prev]);
    setCmdHistoryIdx(-1);

    if (trimmed === 'clear') {
      setHistory([]);
      return;
    }

    if (trimmed === 'help') {
      addEntry('command', 'help');
      addEntry('system', `Commands:
  help              Show this message
  clear             Clear terminal
  tools             List all 52 tools by category
  <tool_name>       Execute a tool (params will be prompted interactively)
  <tool> {"k":"v"}  Execute with JSON args directly (skip prompts)
  wallet            Show connected wallet info

Tips:
  • Connect your wallet using the button in the header
  • Switch networks to query different chains
  • For optional params, press Enter to skip
  • Type "true" or "false" for boolean params`);
      return;
    }

    if (trimmed === 'tools') {
      addEntry('command', 'tools');
      const grouped: Record<string, Tool[]> = {};
      for (const t of tools) {
        const cat = categorizeTool(t.name);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(t);
      }
      let output = `52 Tools Available:\n`;
      for (const [cat, items] of Object.entries(grouped).sort()) {
        output += `\n  [${cat.toUpperCase()}] (${items.length})\n`;
        for (const t of items) {
          const desc = t.description?.substring(0, 60) || '';
          output += `    ${t.name.padEnd(35)} ${desc}\n`;
        }
      }
      addEntry('system', output);
      return;
    }

    if (trimmed === 'wallet') {
      addEntry('command', 'wallet');
      if (walletAddress) {
        addEntry('system', `Wallet: ${walletAddress}\nNetwork: ${chainName} (${chainId})`);
      } else {
        addEntry('system', 'No wallet connected. Use the Connect button in the header.');
      }
      return;
    }

    // Check for tool_name {"args"} format (direct JSON args)
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx !== -1) {
      const toolName = trimmed.slice(0, spaceIdx);
      const argsStr = trimmed.slice(spaceIdx + 1).trim();
      const tool = tools.find(t => t.name === toolName);
      if (tool && argsStr.startsWith('{')) {
        try {
          const args = JSON.parse(argsStr);
          addEntry('command', trimmed);
          callTool(toolName, args);
          return;
        } catch {
          addEntry('command', trimmed);
          addEntry('error', `Invalid JSON: ${argsStr}`);
          return;
        }
      }
    }

    // Exact tool name match
    const tool = tools.find(t => t.name === trimmed);
    if (tool) {
      startParamPrompt(trimmed, tool);
      return;
    }

    // Natural language query — semantic search via HuggingFace embeddings
    addEntry('command', trimmed);
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(trimmed)}`));
      const data = await res.json();

      if (data.best && data.best.score > 0.25) {
        const matchedTool = tools.find(t => t.name === data.best.name);
        const method = data.method === 'semantic' ? `AI semantic match (${data.model})` : 'keyword match';
        const topMatches = (data.matches || []).slice(0, 3)
          .map((m: any, i: number) => `  ${i + 1}. ${m.name} (${(m.score * 100).toFixed(1)}%)`)
          .join('\n');

        addEntry('system', `  ${method}\n  Best match: ${data.best.name} (${(data.best.score * 100).toFixed(1)}% confidence)\n\n  Top matches:\n${topMatches}`);

        if (matchedTool) {
          setLoading(false);
          startParamPrompt(matchedTool.name, matchedTool);
          return;
        }
      }

      addEntry('error', `No matching tool found for: "${trimmed}"\n\nTry:\n  • Use exact tool names (e.g., lido_get_balance)\n  • Ask naturally: "what is my balance?" or "stake 1 ETH"\n  • Type "tools" to see all available tools`);
    } catch {
      addEntry('error', 'Semantic search failed. Use exact tool names instead.');
    } finally {
      setLoading(false);
    }
  }, [tools, paramState, walletAddress, chainId, chainName, addEntry, callTool, handleParamInput, startParamPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      executeCommand(input);
      setInput('');
    } else if (e.key === 'Escape' && paramState) {
      setParamState(null);
      addEntry('system', '  (cancelled)');
    } else if (e.key === 'ArrowUp' && !paramState) {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(cmdHistoryIdx + 1, cmdHistory.length - 1);
        setCmdHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx]!);
      }
    } else if (e.key === 'ArrowDown' && !paramState) {
      e.preventDefault();
      if (cmdHistoryIdx > 0) {
        setCmdHistoryIdx(cmdHistoryIdx - 1);
        setInput(cmdHistory[cmdHistoryIdx - 1]!);
      } else {
        setCmdHistoryIdx(-1);
        setInput('');
      }
    }
  };

  const promptSymbol = paramState ? '?' : '>';

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-output">
        {history.map(entry => (
          <div key={entry.id} className={`terminal-entry terminal-${entry.type}`}>
            {entry.type === 'command' && <span className="terminal-prompt">&gt; </span>}
            {entry.type === 'param-prompt' && <span className="terminal-prompt-param">? </span>}
            {entry.type === 'result' ? (
              <pre className="terminal-json" dangerouslySetInnerHTML={{ __html: syntaxHighlightJSON(escapeHtml(entry.text)) }} />
            ) : (
              <pre>{entry.text}</pre>
            )}
          </div>
        ))}
        {loading && (
          <div className="terminal-entry terminal-loading">
            <span className="spinner" /> <span>Executing on-chain...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="terminal-input-row">
        <span className={`terminal-prompt ${paramState ? 'prompt-param' : ''}`}>{promptSymbol}</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            loading ? 'Processing...' :
            paramState ? `Enter ${paramState.current?.name}...` :
            'Ask a question or enter a tool name...'
          }
          disabled={loading}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

// Semantic search is handled server-side via HuggingFace embeddings (see server/proxy.ts)
