export const withdrawalQueueAbi = [
  {
    name: "getWithdrawalStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_requestIds", type: "uint256[]" }],
    outputs: [
      {
        name: "statuses",
        type: "tuple[]",
        components: [
          { name: "amountOfStETH", type: "uint256" },
          { name: "amountOfShares", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "timestamp", type: "uint256" },
          { name: "isFinalized", type: "bool" },
          { name: "isClaimed", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getWithdrawalRequests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "requestsIds", type: "uint256[]" }],
  },
  {
    name: "getLastFinalizedRequestId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getClaimableEther",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_hints", type: "uint256[]" },
    ],
    outputs: [{ name: "claimableEth", type: "uint256[]" }],
  },
  {
    name: "findCheckpointHints",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_requestIds", type: "uint256[]" },
      { name: "_firstIndex", type: "uint256" },
      { name: "_lastIndex", type: "uint256" },
    ],
    outputs: [{ name: "hintIds", type: "uint256[]" }],
  },
  {
    name: "getLastCheckpointIndex",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isBunkerModeActive",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
