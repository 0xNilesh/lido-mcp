import { formatEther, type PublicClient, type HttpTransport, type Chain } from "viem";
import type { Provider } from "../provider.js";

// ---------------------------------------------------------------------------
// Chain ID — multi-chain aware
// ---------------------------------------------------------------------------

/**
 * Get the default chain ID from the provider.
 */
export function getChainId(provider: Provider): number {
  return provider.defaultChainId;
}

/**
 * Resolve the chain ID to use for a request.
 * If `requestedChainId` is provided and supported, use it.
 * Otherwise fall back to the provider's default.
 */
export function resolveChainId(provider: Provider, requestedChainId?: number | string): number {
  return provider.resolveChainId(requestedChainId);
}

/**
 * Get a public client for the specified chain (or default chain).
 * This is the key multi-chain function — tools call this instead of provider.publicClient directly.
 */
export function getClient(provider: Provider, chainId?: number | string): PublicClient<HttpTransport, Chain> {
  const resolved = provider.resolveChainId(chainId);
  return provider.getPublicClient(resolved);
}

// ---------------------------------------------------------------------------
// Wallet address resolution
// ---------------------------------------------------------------------------

export function getWalletAddress(
  provider: Provider,
  addressParam?: string,
): `0x${string}` | undefined {
  return (addressParam as `0x${string}` | undefined) ?? provider.account?.address;
}

// ---------------------------------------------------------------------------
// Wallet requirement (write operations)
// ---------------------------------------------------------------------------

export function requireWallet(provider: Provider): {
  account: NonNullable<Provider["account"]>;
  walletClient: NonNullable<Provider["walletClient"]>;
} {
  if (!provider.account || !provider.walletClient) {
    throw new WalletRequiredError();
  }
  return { account: provider.account, walletClient: provider.walletClient };
}

export class WalletRequiredError extends Error {
  constructor() {
    super("No wallet configured. Set the PRIVATE_KEY environment variable to enable write operations.");
    this.name = "WalletRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTokenAmount(amount: bigint, symbol: string): string {
  return `${formatEther(amount)} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Error message normalisation
// ---------------------------------------------------------------------------

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return (err as { shortMessage?: string }).shortMessage ?? err.message;
  }
  return String(err ?? fallback);
}
