import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, holesky, type Chain } from "viem/chains";
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

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  17000: holesky,
  560048: hoodi,
};

export interface Provider {
  publicClient: any;
  walletClient: any;
  lidoSDK: LidoSDK;
  account: any;
}

export function createProvider(config: Config): Provider {
  const chain = CHAINS[config.chainId] ?? holesky;

  const transport = http(config.rpcUrl, {
    timeout: 30_000,
    retryCount: 3,
    retryDelay: 1_000,
  });

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  let account: any;
  let walletClient: any;

  if (config.privateKey) {
    account = privateKeyToAccount(config.privateKey);
    // Clear the private key from the environment immediately
    delete process.env.PRIVATE_KEY;

    walletClient = createWalletClient({
      account,
      chain,
      transport,
    });
  }

  const lidoSDK = new LidoSDK({
    chainId: config.chainId,
    rpcUrls: [config.rpcUrl],
    web3Provider: walletClient,
  });

  return {
    publicClient,
    walletClient,
    lidoSDK,
    account,
  };
}
