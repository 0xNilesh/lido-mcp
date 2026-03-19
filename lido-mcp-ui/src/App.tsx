import { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import Dashboard from './components/Dashboard';
import type { Tool } from './types';
import { apiUrl } from './api';
import './App.css';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  17000: 'Holesky Testnet',
  560048: 'Hoodi Testnet',
};

type ViewMode = 'dashboard' | 'terminal';

function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mode, setMode] = useState<ViewMode>('dashboard');

  // Impersonation state — lives at App level so it affects everything
  const [impersonateAddress, setImpersonateAddress] = useState('');
  const [impersonateInput, setImpersonateInput] = useState('');
  const [showImpersonatePopover, setShowImpersonatePopover] = useState(false);

  const { address: realAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();

  // The effective address used everywhere
  const activeAddress = impersonateAddress || realAddress;
  const isImpersonating = !!impersonateAddress;

  useEffect(() => {
    async function fetchTools() {
      try {
        const res = await fetch(apiUrl('/api/tools'));
        if (!res.ok) throw new Error('Failed');
        setTools(await res.json());
        setMcpConnected(true);
      } catch {
        setMcpConnected(false);
      }
    }
    fetchTools();
  }, []);

  const handleImpersonate = useCallback(() => {
    const addr = impersonateInput.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setImpersonateAddress(addr);
      setShowImpersonatePopover(false);
    }
  }, [impersonateInput]);

  const clearImpersonation = useCallback(() => {
    setImpersonateAddress('');
    setImpersonateInput('');
  }, []);

  const handleSelectTool = useCallback((toolName: string) => {
    setPendingCommand(toolName);
    setSidebarOpen(false);
    setMode('terminal');
  }, []);

  const handleCommandConsumed = useCallback(() => {
    setPendingCommand(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        {mode === 'terminal' && (
          <button className="menu-btn" onClick={() => setSidebarOpen(prev => !prev)} aria-label="Toggle sidebar">
            <span className="menu-icon">&#9776;</span>
          </button>
        )}

        <div className="header-title">
          <span className="header-logo">&#9670;</span>
          <h1>LIDO MCP</h1>
        </div>

        <div className="header-controls">
          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button className={`mode-btn ${mode === 'dashboard' ? 'mode-active' : ''}`} onClick={() => setMode('dashboard')}>Dashboard</button>
            <button className={`mode-btn ${mode === 'terminal' ? 'mode-active' : ''}`} onClick={() => setMode('terminal')}>Terminal</button>
          </div>

          {/* Network Switcher */}
          <div className="network-switcher">
            <select className="network-select" value={chainId} onChange={(e) => switchChain({ chainId: Number(e.target.value) })}>
              {chains.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>

          {/* MCP Status */}
          <div className="mcp-status">
            <span className={`status-dot ${mcpConnected ? 'status-connected' : 'status-disconnected'}`} />
            <span className="status-text">MCP</span>
          </div>

          {/* Impersonate Button */}
          <div className="impersonate-wrapper">
            <button
              className={`impersonate-toggle ${isImpersonating ? 'active' : ''}`}
              onClick={() => setShowImpersonatePopover(p => !p)}
              title="Impersonate any address"
            >
              🕵️
            </button>
            {showImpersonatePopover && (
              <>
                <div className="impersonate-backdrop" onClick={() => setShowImpersonatePopover(false)} />
                <div className="impersonate-popover">
                  <div className="impersonate-popover-title">🕵️ Impersonate Address</div>
                  <div className="impersonate-popover-desc">View any wallet's Lido position. All read tools will use this address.</div>
                  <input
                    className="impersonate-popover-input"
                    type="text"
                    placeholder="0x..."
                    value={impersonateInput}
                    onChange={e => setImpersonateInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleImpersonate()}
                    autoFocus
                  />
                  <button
                    className="impersonate-popover-btn"
                    onClick={handleImpersonate}
                    disabled={!/^0x[a-fA-F0-9]{40}$/.test(impersonateInput.trim())}
                  >
                    🕵️ Impersonate →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* RainbowKit Wallet */}
          <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
        </div>
      </header>

      {/* Impersonation — inline in header area */}
      {isImpersonating && (
        <div className="impersonate-banner">
          <span>🕵️ Viewing as <strong>{impersonateAddress.substring(0, 10)}...{impersonateAddress.substring(38)}</strong></span>
          <button className="impersonate-exit" onClick={clearImpersonation}>✕ Exit</button>
        </div>
      )}

      <div className="app-body">
        {mode === 'terminal' && (
          <Sidebar tools={tools} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(prev => !prev)} onSelectTool={handleSelectTool} />
        )}
        <main className="app-main">
          {mode === 'dashboard' ? (
            <Dashboard
              tools={tools}
              walletAddress={activeAddress}
              chainId={chainId}
              chainName={CHAIN_NAMES[chainId] || `Chain ${chainId}`}
            />
          ) : (
            <Terminal
              tools={tools}
              pendingCommand={pendingCommand}
              onCommandConsumed={handleCommandConsumed}
              walletAddress={activeAddress}
              chainId={chainId}
              chainName={CHAIN_NAMES[chainId] || `Chain ${chainId}`}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
