export interface Config {
  rpcUrl: string;
  privateKey: `0x${string}` | undefined;
  chainId: 1 | 17000 | 560048;
  maxTransactionEth: number;
  maxDailySpendEth: number;
}

export function loadConfig(): Config {
  const rpcUrl = process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl || rpcUrl.trim() === "") {
    throw new Error(
      "ETHEREUM_RPC_URL is required. Set it to an Ethereum JSON-RPC endpoint (e.g. https://eth.drpc.org)."
    );
  }

  let privateKey: `0x${string}` | undefined;
  const rawKey = process.env.PRIVATE_KEY;
  if (rawKey !== undefined && rawKey !== "") {
    if (!/^0x[a-fA-F0-9]{64}$/.test(rawKey)) {
      throw new Error(
        "PRIVATE_KEY must be a 32-byte hex string prefixed with 0x (66 characters total). Example: 0xac0974..."
      );
    }
    privateKey = rawKey as `0x${string}`;
  }

  let chainId: 1 | 17000 | 560048 = 17000;
  const rawChainId = process.env.CHAIN_ID;
  if (rawChainId !== undefined && rawChainId !== "") {
    const parsed = Number(rawChainId);
    if (parsed !== 1 && parsed !== 17000 && parsed !== 560048) {
      throw new Error(
        `CHAIN_ID must be 1 (mainnet), 17000 (holesky), or 560048 (hoodi). Got: ${rawChainId}`
      );
    }
    chainId = parsed as 1 | 17000 | 560048;
  }

  let maxTransactionEth = 100;
  const rawMaxTx = process.env.MAX_TRANSACTION_ETH;
  if (rawMaxTx !== undefined && rawMaxTx !== "") {
    const parsed = Number(rawMaxTx);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(
        `MAX_TRANSACTION_ETH must be a positive number. Got: ${rawMaxTx}`
      );
    }
    maxTransactionEth = parsed;
  }

  let maxDailySpendEth = 500;
  const rawMaxDaily = process.env.MAX_DAILY_SPEND_ETH;
  if (rawMaxDaily !== undefined && rawMaxDaily !== "") {
    const parsed = Number(rawMaxDaily);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(
        `MAX_DAILY_SPEND_ETH must be a positive number. Got: ${rawMaxDaily}`
      );
    }
    maxDailySpendEth = parsed;
  }

  return {
    rpcUrl,
    privateKey,
    chainId,
    maxTransactionEth,
    maxDailySpendEth,
  };
}
