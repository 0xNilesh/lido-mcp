import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type HttpTransport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, holesky } from "viem/chains";
import { LidoSDK } from "@lidofinance/lido-ethereum-sdk";
import type { Config } from "./config.js";

// Hoodi testnet chain definition (not in viem yet)
const hoodi: Chain = {
  id: 560048,
  name: "Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://hoodi.drpc.org"] },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
};

// All supported chains with default public RPCs
const CHAIN_CONFIGS: Record<number, { chain: Chain; defaultRpc: string }> = {
  1: { chain: mainnet, defaultRpc: "https://eth.drpc.org" },
  17000: { chain: holesky, defaultRpc: "https://holesky.drpc.org" },
  560048: { chain: hoodi, defaultRpc: "https://hoodi.drpc.org" },
};

export interface Provider {
  /** Default public client (for the configured chain) */
  publicClient: PublicClient<HttpTransport, Chain>;
  /** Wallet client (if private key configured) */
  walletClient: WalletClient | null;
  /** Lido SDK (on the configured chain) */
  lidoSDK: LidoSDK;
  /** Account (if private key configured) */
  account: any;
  /** Default chain ID */
  defaultChainId: number;
  /**
   * Get a public client for ANY supported chain.
   * Returns the default client if chainId matches, otherwise creates/caches a new one.
   */
  getPublicClient: (chainId: number) => PublicClient<HttpTransport, Chain>;
  /**
   * Get the chain ID to use — prefers the requested chain, falls back to default.
   */
  resolveChainId: (requested?: number | string) => number;
}

export function createProvider(config: Config): Provider {
  const defaultChainConfig = CHAIN_CONFIGS[config.chainId] ?? CHAIN_CONFIGS[560048]!;

  const makeTransport = (rpcUrl: string) =>
    http(rpcUrl, { timeout: 30_000, retryCount: 3, retryDelay: 1_000 });

  // Default public client
  const publicClient = createPublicClient({
    chain: defaultChainConfig.chain,
    transport: makeTransport(config.rpcUrl),
  }) as PublicClient<HttpTransport, Chain>;

  // Wallet client (optional)
  let account: any;
  let walletClient: WalletClient | null = null;

  if (config.privateKey) {
    account = privateKeyToAccount(config.privateKey);
    delete process.env.PRIVATE_KEY;

    walletClient = createWalletClient({
      account,
      chain: defaultChainConfig.chain,
      transport: makeTransport(config.rpcUrl),
    });
  }

  // Lido SDK on default chain
  const lidoSDK = new LidoSDK({
    chainId: config.chainId,
    rpcUrls: [config.rpcUrl],
    web3Provider: walletClient ?? undefined,
  });

  // Cache of public clients per chain
  const clientCache = new Map<number, PublicClient<HttpTransport, Chain>>();
  clientCache.set(config.chainId, publicClient);

  function getPublicClient(chainId: number): PublicClient<HttpTransport, Chain> {
    const cached = clientCache.get(chainId);
    if (cached) return cached;

    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`);
    }

    const newClient = createPublicClient({
      chain: chainConfig.chain,
      transport: makeTransport(chainConfig.defaultRpc),
    }) as PublicClient<HttpTransport, Chain>;

    clientCache.set(chainId, newClient);
    return newClient;
  }

  function resolveChainId(requested?: number | string): number {
    if (requested) {
      const id = typeof requested === 'string' ? parseInt(requested, 10) : requested;
      if (CHAIN_CONFIGS[id]) return id;
    }
    return config.chainId;
  }

  return {
    publicClient,
    walletClient,
    lidoSDK,
    account,
    defaultChainId: config.chainId,
    getPublicClient,
    resolveChainId,
  };
}
