export const stakingRouterAbi = [
  { name: 'getStakingModulesCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getWithdrawalCredentials', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'getLido', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const;
