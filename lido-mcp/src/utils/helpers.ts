import { formatEther } from "viem";
import type { Provider } from "../provider.js";

// ---------------------------------------------------------------------------
// Chain ID
// ---------------------------------------------------------------------------

/**
 * Retrieve the chain ID from the provider, falling back to Holesky (17000).
 */
export function getChainId(provider: Provider): number {
  return provider.publicClient.chain?.id ?? 17000;
}

// ---------------------------------------------------------------------------
// Wallet address resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a wallet address from an explicit parameter or the connected wallet.
 * Returns `undefined` when neither source is available.
 */
export function getWalletAddress(
  provider: Provider,
  addressParam?: string,
): `0x${string}` | undefined {
  return (addressParam as `0x${string}` | undefined) ?? provider.account?.address;
}

// ---------------------------------------------------------------------------
// Wallet requirement (write operations)
// ---------------------------------------------------------------------------

/**
 * Assert that a wallet is configured and return the account + walletClient.
 * Throws a descriptive string (for use in `error()`) when no wallet is present.
 */
export function requireWallet(provider: Provider): {
  account: NonNullable<Provider["account"]>;
  walletClient: NonNullable<Provider["walletClient"]>;
} {
  if (!provider.account || !provider.walletClient) {
    throw new WalletRequiredError();
  }
  return {
    account: provider.account,
    walletClient: provider.walletClient,
  };
}

export class WalletRequiredError extends Error {
  constructor() {
    super(
      "No wallet configured. Set the PRIVATE_KEY environment variable to enable write operations.",
    );
    this.name = "WalletRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a bigint token amount with its symbol, e.g. "1.5 stETH".
 */
export function formatTokenAmount(amount: bigint, symbol: string): string {
  return `${formatEther(amount)} ${symbol}`;
}

// ---------------------------------------------------------------------------
// Error message normalisation
// ---------------------------------------------------------------------------

/**
 * Extract the most useful error message from a viem/ethers error object.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return (err as { shortMessage?: string }).shortMessage ?? err.message;
  }
  return String(err ?? fallback);
}
