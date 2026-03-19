# Lido MCP Server — Final Tool Plan (50 tools)

> Revised after Security, UX, and Web3 reviews. Covers 100+ contract functions via smart parameter design.
> Removed: 6 broken/redundant tools. Merged: granular subsets into parameterized tools. Added: stVaults V3.

## Write Tools (15)

### Staking (2)
| # | Tool | Function | Notes |
|---|------|----------|-------|
| 1 | `lido_stake` | `Lido.submit(referral)` | Has optional referral_address param |
| 2 | `lido_stake_and_wrap` | Send ETH to wstETH (receive fallback) | ETH→wstETH in one tx |

### Wrap/Unwrap (2)
| 3 | `lido_wrap` | `wstETH.wrap(amount)` | Auto-approval |
| 4 | `lido_unwrap` | `wstETH.unwrap(amount)` | |

### Transfers (2)
| 5 | `lido_transfer` | `transfer(to, amount)` | `token` param: stETH/wstETH/shares. Shares uses `transferShares()` |
| 6 | `lido_transfer_withdrawal_nft` | `WithdrawalQueue.transferFrom(from, to, id)` | Transfer withdrawal NFT |

### Approvals (1)
| 7 | `lido_approve` | `approve(spender, amount)` | `token` param: stETH/wstETH/LDO. amount=0 revokes |

### Withdrawals (3)
| 8 | `lido_request_withdrawal` | `requestWithdrawals/requestWithdrawalsWstETH` | `token` param: stETH/wstETH |
| 9 | `lido_claim_withdrawal` | `claimWithdrawals(ids, hints)` | Auto-finds hints |
| 10 | `lido_claim_single_withdrawal` | `claimWithdrawal(requestId)` | Simpler single-claim |

### Governance (2)
| 11 | `lido_cast_vote` | `Voting.vote(id, supports, false)` | |
| 12 | `lido_transfer_ldo` | `LDO.transfer(to, amount)` | LDO governance token transfer |

### NFT Approvals (1)
| 13 | `lido_approve_withdrawal_nft` | `WithdrawalQueue.approve(to, requestId)` | Single NFT approval |

### Safety (2)
| 14 | `lido_revoke_all_approvals` | Multiple `approve(spender, 0)` calls | Revoke stETH+wstETH+LDO for a spender |
| 15 | `lido_increase_allowance` | `Lido.increaseAllowance(spender, added)` | Safer than approve for existing allowances |

## Read Tools (35)

### Balance & Portfolio (5)
| 16 | `lido_get_balance` | Multicall: ETH+stETH+wstETH+LDO+shares | Optional `chain` param for L2 |
| 17 | `lido_get_position_overview` | Full position: balances+rewards+withdrawals+L2 | The "dashboard" tool |
| 18 | `lido_get_l2_balances` | wstETH across all L2s via Promise.allSettled | Partial failure tolerant |
| 19 | `lido_get_allowance` | `allowance(owner, spender)` | `token` param: stETH/wstETH/LDO |
| 20 | `lido_get_all_allowances` | All token allowances for common Lido spenders | wstETH contract, WithdrawalQueue |

### Conversion & Rates (3)
| 21 | `lido_convert` | Any-to-any conversion | `from`/`to` params: ETH/stETH/wstETH/shares. `amount` param |
| 22 | `lido_get_exchange_rates` | `stEthPerToken` + `tokensPerStEth` + share rate | All rates in one call |
| 23 | `lido_get_share_rate` | `totalPooledEther / totalShares` | Current share rate |

### Rewards (2)
| 24 | `lido_get_rewards` | APR + projected daily/monthly/yearly rewards | |
| 25 | `lido_get_protocol_fee` | `getFee()` + per-module fee breakdown | |

### Protocol Stats (3)
| 26 | `lido_get_protocol_info` | TVL, shares, supply, buffered, depositable, limit, paused | Expanded with all stats |
| 27 | `lido_get_staking_limit` | `getCurrentStakeLimit` + `getStakeLimitFullInfo` | Full limit details |
| 28 | `lido_is_staking_paused` | `isStakingPaused()` | Quick boolean check |

### Validator Infrastructure (5)
| 29 | `lido_get_beacon_stats` | `Lido.getBeaconStat()` | deposited, exited, CL balance |
| 30 | `lido_get_staking_modules` | `StakingRouter.getStakingModules()` | All modules with status |
| 31 | `lido_get_staking_module` | `StakingRouter.getStakingModule(id)` + summary | Single module detail |
| 32 | `lido_get_node_operators` | `NOR.getNodeOperatorsCount()` + listing | List all operators |
| 33 | `lido_get_node_operator` | `NOR.getNodeOperator(id, true)` + summary | Single operator detail |

### Withdrawal Queue (6)
| 34 | `lido_get_withdrawal_status` | Per-user withdrawal request statuses | Existing, enhanced |
| 35 | `lido_get_withdrawal_requests` | `getWithdrawalRequests(owner)` | List request IDs for address |
| 36 | `lido_get_withdrawal_queue_info` | Queue depth, pending count, locked ETH, bunker | Protocol-level queue stats |
| 37 | `lido_get_claimable_ether` | `getClaimableEther(ids, hints)` | How much ETH claimable |
| 38 | `lido_get_withdrawal_nft_owner` | `ownerOf(requestId)` | Who owns the withdrawal NFT |
| 39 | `lido_is_bunker_mode` | `isBunkerModeActive()` + `bunkerModeSinceTimestamp()` | Bunker mode status |

### Governance (5)
| 40 | `lido_get_vote` | Full vote details + voter state | |
| 41 | `lido_list_votes` | List votes with status filter | |
| 42 | `lido_can_vote` | `canVote(voteId, address)` | Quick eligibility check |
| 43 | `lido_get_voter_state` | `getVoterState(voteId, address)` | How an address voted |
| 44 | `lido_get_vote_count` | `votesLength()` | Total votes on-chain |

### Token Info (3)
| 45 | `lido_get_token_info` | name, symbol, decimals, totalSupply | `token` param: stETH/wstETH/LDO |
| 46 | `lido_get_steth_total_supply` | `Lido.totalSupply()` | Quick total supply |
| 47 | `lido_get_wsteth_total_supply` | `wstETH.totalSupply()` | Quick total supply |

### System (3)
| 48 | `lido_status` | Server health + chain + wallet | |
| 49 | `lido_get_contract_addresses` | All protocol addresses from LidoLocator | |
| 50 | `lido_get_supported_chains` | List all supported chains + wstETH addresses | |

---

## Removed (from original 100)
- `lido_delegate` / `lido_undelegate` — functions don't exist on Aragon Voting
- `lido_claim_withdrawal_to` — function doesn't exist on WithdrawalQueue
- `lido_stake_with_referral` — redundant with `lido_stake`
- `lido_set_withdrawal_nft_approval_all` — too dangerous for agent use
- Individual balance tools (eth, steth, wsteth, ldo, shares) — subsets of `lido_get_balance`
- Individual protocol stat tools (tvl, total_shares, etc.) — subsets of `lido_get_protocol_info`

## New ABIs Needed
- `src/abis/staking-router.ts`
- `src/abis/node-operators.ts`
- `src/abis/lido-locator.ts`

## New Contract Addresses (resolve via LidoLocator)
- StakingRouter: resolved dynamically
- NodeOperatorsRegistry: resolved dynamically
- LidoLocator mainnet: `0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb`

## Category: Lido V3 stVaults (10 tools)

### stVault Write Tools (5)
| # | Tool | Contract | Function | Notes |
|---|------|----------|----------|-------|
| 51 | `lido_vault_fund` | StakingVault | `fund()` payable | Deposit ETH into a vault |
| 52 | `lido_vault_withdraw` | StakingVault | `withdraw(recipient, ether)` | Withdraw ETH from vault |
| 53 | `lido_vault_request_validator_exit` | StakingVault | `requestValidatorExit(pubkeys)` | Request validator exit |
| 54 | `lido_vault_pause_deposits` | StakingVault | `pauseBeaconChainDeposits()` | Pause beacon deposits |
| 55 | `lido_vault_resume_deposits` | StakingVault | `resumeBeaconChainDeposits()` | Resume beacon deposits |

### stVault Read Tools (5)
| 56 | `lido_get_vault_info` | StakingVault | `owner` + `nodeOperator` + `depositor` + `availableBalance` + `stagedBalance` + `beaconChainDepositsPaused` | Full vault details |
| 57 | `lido_get_vault_balance` | StakingVault | `availableBalance()` + `stagedBalance()` | Vault ETH balances |
| 58 | `lido_get_vault_withdrawal_fee` | StakingVault | `calculateValidatorWithdrawalFee(keys)` | Calculate withdrawal fee |
| 59 | `lido_get_vault_credentials` | StakingVault | `withdrawalCredentials()` | Vault withdrawal credentials |
| 60 | `lido_get_external_ether_info` | Lido | `getExternalEther()` + `getExternalShares()` + `getMaxExternalRatioBP()` | V3 external (vault) ETH stats |

---

**FINAL TOTAL: 60 tools (20 write, 40 read)**

Covers: Lido V1/V2 (stETH, wstETH, WithdrawalQueue, Aragon Voting), Lido V3 (stVaults), StakingRouter, NodeOperatorsRegistry, LidoLocator, and 13 L2 chains.

---

## Security Tiers
| Tier | Tools | Extra Safeguards |
|------|-------|-----------------|
| Standard | stake, wrap, unwrap, claim, vote, reads | dry_run default |
| Elevated | transfer, approve, request_withdrawal, stake_and_wrap | dry_run + spending limits enforced |
| Restricted | transfer_withdrawal_nft, approve_withdrawal_nft | dry_run + spending limits + warning in response |
