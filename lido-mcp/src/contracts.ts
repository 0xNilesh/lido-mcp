// Centralized contract addresses per chain

export interface ContractAddresses {
  lido: `0x${string}`;
  wsteth: `0x${string}`;
  withdrawalQueue: `0x${string}`;
  voting: `0x${string}`;
  ldo: `0x${string}`;
  locator: `0x${string}`;
  stakingRouter: `0x${string}`;
  nodeOperatorsRegistry: `0x${string}`;
  vaultHub: `0x${string}`;
  vaultFactory: `0x${string}`;
  accounting: `0x${string}`;
  dualGovernance: `0x${string}`;
  operatorGrid: `0x${string}`;
}

const MAINNET_CONTRACTS: ContractAddresses = {
  lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  withdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
  voting: "0x2e59A20f205bB85a89C53f1936454680651E618e",
  ldo: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
  locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
  stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
  nodeOperatorsRegistry: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5",
  vaultHub: "0x1d201BE093d847f6446530Efb0E8Fb426d176709",
  vaultFactory: "0x02Ca7772FF14a9F6c1a08aF385aA96bb1b34175A",
  accounting: "0x23ED611be0e1a820978875C0122F92260804cdDf",
  dualGovernance: "0x0000000000000000000000000000000000000000",
  operatorGrid: "0x0000000000000000000000000000000000000000",
};

const HOLESKY_CONTRACTS: ContractAddresses = {
  lido: "0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034",
  wsteth: "0x8d09a4502Cc8Cf1547aD300E066060D043f6982D",
  withdrawalQueue: "0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50",
  voting: "0xdA7d2573Df555002503F29aA4003e398d28cc00f",
  ldo: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
  locator: "0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8",
  stakingRouter: "0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229",
  nodeOperatorsRegistry: "0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC",
  vaultHub: "0x0000000000000000000000000000000000000000",
  vaultFactory: "0x0000000000000000000000000000000000000000",
  accounting: "0x4E97A3972ce8511D87F334dA17a2C332542a5246",
  dualGovernance: "0x0000000000000000000000000000000000000000",
  operatorGrid: "0x0000000000000000000000000000000000000000",
};

const HOODI_CONTRACTS: ContractAddresses = {
  lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
  wsteth: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
  withdrawalQueue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
  voting: "0x49B3512c44891bef83F8967d075121Bd1b07a01B",
  ldo: "0xEf2573966D009CcEA0Fc74451dee2193564198dc",
  locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
  stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
  nodeOperatorsRegistry: "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5",
  vaultHub: "0x4C9fFC325392090F789255b9948Ab1659b797964",
  vaultFactory: "0x7Ba269a03eeD86f2f54CB04CA3b4b7626636Df4E",
  accounting: "0x9b5b78D1C9A3238bF24662067e34c57c83E8c354",
  dualGovernance: "0x9CAaCCc62c66d817CC59c44780D1b722359795bF",
  operatorGrid: "0x501e678182bB5dF3f733281521D3f3D1aDe69917",
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
  zksync: { chainId: 324, address: "0x703b52F2b28fEbcB60E1372858AF5b18849FE867" },
  mantle: { chainId: 5000, address: "0x458ed78EB972a369799fb278c0243b25e5242A83" },
  linea: { chainId: 59144, address: "0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F" },
  scroll: { chainId: 534352, address: "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32" },
  mode: { chainId: 34443, address: "0x98f96A4B34D03a2E6f225B28b8f8Cb1279562d81" },
  bsc: { chainId: 56, address: "0x26c5e01524d2E6280A48F2c50fF6De7e52E9611C" },
  zircuit: { chainId: 48900, address: "0xf0e673Bc224A8Ca3ff67a61605814666b1234833" },
};
