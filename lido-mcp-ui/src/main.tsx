import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, holesky } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';

// Hoodi chain definition
const hoodi = {
  id: 560048,
  name: 'Hoodi',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://hoodi.drpc.org'] },
  },
  testnet: true,
} as const;

const config = getDefaultConfig({
  appName: 'Lido MCP Agent Console',
  projectId: 'b1e8cb5ae49c8ab498e1e2e3e8a5136b', // WalletConnect public project ID
  chains: [hoodi, mainnet, holesky],
});

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#00e5a0',
            accentColorForeground: '#0a0e14',
            borderRadius: 'small',
            fontStack: 'system',
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
