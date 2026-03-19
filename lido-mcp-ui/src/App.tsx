import { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import type { Tool } from './types';
import './App.css';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  17000: 'Holesky Testnet',
  560048: 'Hoodi Testnet',
};

function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [mcpConnected, setMcpConnected] = useState(false);

  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();

  useEffect(() => {
    async function fetchTools() {
      try {
        const res = await fetch('/api/tools');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setTools(data);
        setMcpConnected(true);
      } catch {
        setMcpConnected(false);
      }
    }
    fetchTools();
  }, []);

  const handleSelectTool = useCallback((toolName: string) => {
    setPendingCommand(toolName);
    setSidebarOpen(false);
  }, []);

  const handleCommandConsumed = useCallback(() => {
    setPendingCommand(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="menu-btn"
          onClick={() => setSidebarOpen(prev => !prev)}
          aria-label="Toggle sidebar"
        >
          <span className="menu-icon">&#9776;</span>
        </button>

        <div className="header-title">
          <span className="header-logo">&#9670;</span>
          <h1>LIDO MCP CONSOLE</h1>
        </div>

        <div className="header-controls">
          {/* Network Switcher */}
          <div className="network-switcher">
            <label className="network-label">Network</label>
            <select
              className="network-select"
              value={chainId}
              onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
            >
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* MCP Status */}
          <div className="mcp-status">
            <span className={`status-dot ${mcpConnected ? 'status-connected' : 'status-disconnected'}`} />
            <span className="status-text">
              MCP {mcpConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* RainbowKit Wallet */}
          <ConnectButton
            accountStatus="address"
            chainStatus="none"
            showBalance={false}
          />
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          tools={tools}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(prev => !prev)}
          onSelectTool={handleSelectTool}
        />
        <main className="app-main">
          <Terminal
            tools={tools}
            pendingCommand={pendingCommand}
            onCommandConsumed={handleCommandConsumed}
            walletAddress={address}
            chainId={chainId}
            chainName={CHAIN_NAMES[chainId] || `Chain ${chainId}`}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
