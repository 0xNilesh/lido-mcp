// Centralized contract addresses per chain

export interface ContractAddresses {
  lido: `0x${string}`;
  wsteth: `0x${string}`;
  withdrawalQueue: `0x${string}`;
  voting: `0x${string}`;
  ldo: `0x${string}`;
}

const MAINNET_CONTRACTS: ContractAddresses = {
  lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  withdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  voting: "0x2e59A20f205bB85a89C53f1936454680651E618e",
  ldo: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
};

const HOLESKY_CONTRACTS: ContractAddresses = {
  lido: "0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034",
  wsteth: "0x8d09a4502Cc8Cf1547aD300E066060D043f6982D",
  withdrawalQueue: "0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50",
  voting: "0xdA7d2573Df555002503F29aA4003e398d28cc00f",
  ldo: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
};

const HOODI_CONTRACTS: ContractAddresses = {
  lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
  wsteth: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
  withdrawalQueue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
  voting: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
  ldo: "0xEf2573966D009CcEA0Fc74451dee2193564198dc",
};

const CHAIN_CONTRACTS: Record<number, ContractAddresses> = {
  1: MAINNET_CONTRACTS,
  17000: HOLESKY_CONTRACTS,
  560048: HOODI_CONTRACTS,
};

export function getContracts(chainId: number): ContractAddresses {
  const contracts = CHAIN_CONTRACTS[chainId];
  if (!contracts) {
    throw new Error(`No contract addresses for chain ID ${chainId}. Supported: 1 (mainnet), 17000 (holesky), 560048 (hoodi).`);
  }
  return contracts;
}

// L2 wstETH addresses for cross-chain balance queries
export const L2_WSTETH: Record<string, { chainId: number; address: `0x${string}` }> = {
  arbitrum: { chainId: 42161, address: "0x5979D7b546E38E414F7E9822514be443A4800529" },
  optimism: { chainId: 10, address: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb" },
  base: { chainId: 8453, address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" },
  polygon: { chainId: 137, address: "0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD" },
};
