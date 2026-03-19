# Lido MCP Server — 100 Tools Plan

## Summary: 100 tools (28 write, 72 read)

> Current: 14 tools. Target: 100 tools.
> New: 86 tools to add. Every tool maps to a real on-chain function or meaningful aggregation.

---

## Category 1: Core Staking (3 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 1 | `lido_stake` | Lido | `submit(referral)` | DONE |
| 2 | `lido_stake_and_wrap` | wstETH | `receive()` — ETH→wstETH in one tx | NEW |
| 3 | `lido_stake_with_referral` | Lido | `submit(referral)` with explicit referral tracking | NEW |

## Category 2: Token Transfers (4 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 4 | `lido_transfer_steth` | Lido | `transfer(to, amount)` | NEW |
| 5 | `lido_transfer_wsteth` | wstETH | `transfer(to, amount)` | NEW |
| 6 | `lido_transfer_shares` | Lido | `transferShares(to, sharesAmount)` | NEW |
| 7 | `lido_transfer_shares_from` | Lido | `transferSharesFrom(sender, to, sharesAmount)` | NEW |

## Category 3: Wrap/Unwrap (2 write) — DONE

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 8 | `lido_wrap` | wstETH | `wrap(stETHAmount)` | DONE |
| 9 | `lido_unwrap` | wstETH | `unwrap(wstETHAmount)` | DONE |

## Category 4: Approvals & Allowances (5 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 10 | `lido_approve_steth` | Lido | `approve(spender, amount)` | NEW |
| 11 | `lido_approve_wsteth` | wstETH | `approve(spender, amount)` | NEW |
| 12 | `lido_revoke_steth_approval` | Lido | `approve(spender, 0)` | NEW |
| 13 | `lido_revoke_wsteth_approval` | wstETH | `approve(spender, 0)` | NEW |
| 14 | `lido_increase_steth_allowance` | Lido | `increaseAllowance(spender, added)` | NEW |

## Category 5: Withdrawal Requests (5 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 15 | `lido_request_withdrawal` | WithdrawalQueue | `requestWithdrawals(amounts, owner)` | DONE |
| 16 | `lido_request_withdrawal_wsteth` | WithdrawalQueue | `requestWithdrawalsWstETH(amounts, owner)` | NEW |
| 17 | `lido_claim_withdrawal` | WithdrawalQueue | `claimWithdrawals(ids, hints)` | DONE |
| 18 | `lido_claim_withdrawal_to` | WithdrawalQueue | `claimWithdrawalsTo(ids, hints, recipient)` | NEW |
| 19 | `lido_claim_single_withdrawal` | WithdrawalQueue | `claimWithdrawal(requestId)` — simpler single claim | NEW |

## Category 6: Withdrawal NFT (3 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 20 | `lido_transfer_withdrawal_nft` | WithdrawalQueue | `transferFrom(from, to, requestId)` | NEW |
| 21 | `lido_approve_withdrawal_nft` | WithdrawalQueue | `approve(to, requestId)` | NEW |
| 22 | `lido_set_withdrawal_nft_approval_all` | WithdrawalQueue | `setApprovalForAll(operator, approved)` | NEW |

## Category 7: Governance (6 write)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 23 | `lido_cast_vote` | Voting | `vote(voteId, supports, false)` | DONE |
| 24 | `lido_delegate` | Voting | `assignDelegate(delegate)` | NEW |
| 25 | `lido_undelegate` | Voting | `unassignDelegate()` | NEW |
| 26 | `lido_transfer_ldo` | LDO | `transfer(to, amount)` | NEW |
| 27 | `lido_approve_ldo` | LDO | `approve(spender, amount)` | NEW |
| 28 | `lido_revoke_ldo_approval` | LDO | `approve(spender, 0)` | NEW |

---

## Category 8: Balance Queries (10 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 29 | `lido_get_balance` | Multiple | ETH + stETH + wstETH + LDO + shares | DONE |
| 30 | `lido_get_eth_balance` | — | `getBalance(address)` | NEW |
| 31 | `lido_get_steth_balance` | Lido | `balanceOf(address)` | NEW |
| 32 | `lido_get_wsteth_balance` | wstETH | `balanceOf(address)` | NEW |
| 33 | `lido_get_ldo_balance` | LDO | `balanceOf(address)` | NEW |
| 34 | `lido_get_shares_balance` | Lido | `sharesOf(address)` | NEW |
| 35 | `lido_get_l2_wsteth_balance` | L2 wstETH | `balanceOf(address)` on specific L2 | NEW |
| 36 | `lido_get_all_l2_balances` | L2 wstETH | wstETH across all supported L2s | NEW |
| 37 | `lido_get_total_staked_value` | Multiple | stETH + wstETH equivalent in ETH | NEW |
| 38 | `lido_get_position_overview` | Multiple | Full cross-chain position summary | DONE |

## Category 9: Allowance Queries (4 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 39 | `lido_get_steth_allowance` | Lido | `allowance(owner, spender)` | NEW |
| 40 | `lido_get_wsteth_allowance` | wstETH | `allowance(owner, spender)` | NEW |
| 41 | `lido_get_ldo_allowance` | LDO | `allowance(owner, spender)` | NEW |
| 42 | `lido_get_all_allowances` | Multiple | All token allowances for common spenders | NEW |

## Category 10: Amount Conversion (10 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 43 | `lido_convert_eth_to_steth` | Lido | `getSharesByPooledEth` → amount calc | NEW |
| 44 | `lido_convert_steth_to_eth` | Lido | `getPooledEthByShares` → amount calc | NEW |
| 45 | `lido_convert_steth_to_wsteth` | wstETH | `getWstETHByStETH(amount)` | NEW |
| 46 | `lido_convert_wsteth_to_steth` | wstETH | `getStETHByWstETH(amount)` | NEW |
| 47 | `lido_convert_eth_to_wsteth` | Both | ETH → stETH → wstETH | NEW |
| 48 | `lido_convert_wsteth_to_eth` | Both | wstETH → stETH → ETH | NEW |
| 49 | `lido_convert_eth_to_shares` | Lido | `getSharesByPooledEth(amount)` | NEW |
| 50 | `lido_convert_shares_to_eth` | Lido | `getPooledEthByShares(amount)` | NEW |
| 51 | `lido_get_exchange_rate` | wstETH | `stEthPerToken()` + `tokensPerStEth()` | NEW |
| 52 | `lido_get_share_rate` | Lido | `totalPooledEther / totalShares` | NEW |

## Category 11: Rewards & APR (4 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 53 | `lido_get_rewards` | Multiple | APR + projected rewards for address | DONE |
| 54 | `lido_get_current_apr` | Lido | Computed from share rate | NEW |
| 55 | `lido_get_protocol_fee` | Lido | `getFee()` — fee in basis points | NEW |
| 56 | `lido_get_fee_distribution` | StakingRouter | `getStakingFeeAggregateDistribution()` | NEW |

## Category 12: Protocol Stats (8 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 57 | `lido_get_protocol_info` | Multiple | TVL, rates, limits, paused state | DONE |
| 58 | `lido_get_tvl` | Lido | `getTotalPooledEther()` | NEW |
| 59 | `lido_get_total_shares` | Lido | `getTotalShares()` | NEW |
| 60 | `lido_get_total_supply` | Lido | `totalSupply()` | NEW |
| 61 | `lido_get_buffered_ether` | Lido | `getBufferedEther()` | NEW |
| 62 | `lido_get_depositable_ether` | Lido | `getDepositableEther()` | NEW |
| 63 | `lido_is_staking_paused` | Lido | `isStakingPaused()` | NEW |
| 64 | `lido_get_staking_limit` | Lido | `getCurrentStakeLimit()` + `getStakeLimitFullInfo()` | NEW |

## Category 13: Validator & Infrastructure (11 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 65 | `lido_get_beacon_stats` | Lido | `getBeaconStat()` — deposited, exited, CL validators | NEW |
| 66 | `lido_get_staking_modules` | StakingRouter | `getStakingModules()` — all modules | NEW |
| 67 | `lido_get_staking_module` | StakingRouter | `getStakingModule(id)` — single module details | NEW |
| 68 | `lido_get_staking_module_status` | StakingRouter | `getStakingModuleStatus(id)` | NEW |
| 69 | `lido_get_staking_module_validators` | StakingRouter | `getStakingModuleSummary(id)` — validator counts | NEW |
| 70 | `lido_get_all_module_digests` | StakingRouter | `getAllStakingModuleDigests()` — comprehensive | NEW |
| 71 | `lido_get_node_operators` | NodeOperatorsRegistry | `getNodeOperatorsCount()` + listing | NEW |
| 72 | `lido_get_node_operator` | NodeOperatorsRegistry | `getNodeOperator(id, true)` — single operator | NEW |
| 73 | `lido_get_node_operator_summary` | NodeOperatorsRegistry | `getNodeOperatorSummary(id)` | NEW |
| 74 | `lido_get_active_operators_count` | NodeOperatorsRegistry | `getActiveNodeOperatorsCount()` | NEW |
| 75 | `lido_get_withdrawal_credentials` | StakingRouter | `getWithdrawalCredentials()` | NEW |

## Category 14: Withdrawal Queue Analytics (11 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 76 | `lido_get_withdrawal_status` | WithdrawalQueue | Request statuses for IDs/address | DONE |
| 77 | `lido_get_withdrawal_requests` | WithdrawalQueue | `getWithdrawalRequests(owner)` — list IDs | NEW |
| 78 | `lido_get_withdrawal_queue_info` | WithdrawalQueue | Queue depth, pending, locked, bunker | NEW |
| 79 | `lido_get_last_request_id` | WithdrawalQueue | `getLastRequestId()` | NEW |
| 80 | `lido_get_last_finalized_id` | WithdrawalQueue | `getLastFinalizedRequestId()` | NEW |
| 81 | `lido_get_unfinalized_count` | WithdrawalQueue | `unfinalizedRequestNumber()` | NEW |
| 82 | `lido_get_unfinalized_steth` | WithdrawalQueue | `unfinalizedStETH()` | NEW |
| 83 | `lido_get_locked_ether` | WithdrawalQueue | `getLockedEtherAmount()` | NEW |
| 84 | `lido_is_bunker_mode` | WithdrawalQueue | `isBunkerModeActive()` + timestamp | NEW |
| 85 | `lido_get_claimable_ether` | WithdrawalQueue | `getClaimableEther(ids, hints)` | NEW |
| 86 | `lido_get_withdrawal_nft_owner` | WithdrawalQueue | `ownerOf(requestId)` | NEW |

## Category 15: Governance Analytics (8 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 87 | `lido_get_vote` | Voting | Full vote details + voter state | DONE |
| 88 | `lido_list_votes` | Voting | List recent votes | DONE |
| 89 | `lido_get_open_votes` | Voting | Filter to only open votes | NEW |
| 90 | `lido_get_vote_count` | Voting | `votesLength()` | NEW |
| 91 | `lido_can_vote` | Voting | `canVote(voteId, address)` | NEW |
| 92 | `lido_get_voter_state` | Voting | `getVoterState(voteId, address)` | NEW |
| 93 | `lido_get_ldo_voting_power` | LDO | LDO balance = voting power | NEW |
| 94 | `lido_get_delegate` | Voting | Check who address has delegated to | NEW |

## Category 16: Token Info (3 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 95 | `lido_get_steth_token_info` | Lido | name, symbol, decimals, totalSupply | NEW |
| 96 | `lido_get_wsteth_token_info` | wstETH | name, symbol, decimals, totalSupply | NEW |
| 97 | `lido_get_ldo_token_info` | LDO | name, symbol, decimals, totalSupply | NEW |

## Category 17: System & Meta (3 read)

| # | Tool | Contract | Function | Status |
|---|------|----------|----------|--------|
| 98 | `lido_status` | — | Server health, chain, wallet status | DONE |
| 99 | `lido_get_contract_addresses` | LidoLocator | All protocol addresses | NEW |
| 100 | `lido_get_supported_chains` | — | List all chains + wstETH addresses | NEW |

---

## Implementation Effort

| Category | # Tools | New | Complexity |
|----------|---------|-----|------------|
| Core Staking | 3 | 2 | Low |
| Token Transfers | 4 | 4 | Low |
| Wrap/Unwrap | 2 | 0 | Done |
| Approvals | 5 | 5 | Low |
| Withdrawal Requests | 5 | 3 | Medium |
| Withdrawal NFT | 3 | 3 | Low |
| Governance Write | 6 | 5 | Medium |
| Balance Queries | 10 | 8 | Low-Medium |
| Allowance Queries | 4 | 4 | Low |
| Conversions | 10 | 10 | Low |
| Rewards & APR | 4 | 3 | Low |
| Protocol Stats | 8 | 7 | Low |
| Validators & Infra | 11 | 11 | Medium |
| Withdrawal Queue | 11 | 10 | Low-Medium |
| Governance Read | 8 | 6 | Low |
| Token Info | 3 | 3 | Low |
| System & Meta | 3 | 1 | Low |
| **Total** | **100** | **86** | — |

## New Directories Needed

```
src/tools/
├── stake/              # 1-3 (add stake_and_wrap, stake_with_referral)
├── transfer/           # 4-7 (NEW directory)
├── wrap/               # 8-9 (DONE)
├── approve/            # 10-14 (NEW directory)
├── withdraw/           # 15-19 (expand)
├── withdrawal-nft/     # 20-22 (NEW directory)
├── governance/         # 23-28 (expand with delegate, LDO ops)
├── balance/            # 29-38 (expand)
├── allowance/          # 39-42 (NEW directory)
├── convert/            # 43-52 (NEW directory)
├── rewards/            # 53-56 (expand)
├── protocol/           # 57-64 (expand)
├── validators/         # 65-75 (NEW directory)
├── withdrawal-status/  # 76-86 (expand)
├── governance-read/    # 87-94 (NEW directory, split from governance)
├── token-info/         # 95-97 (NEW directory)
└── system/             # 98-100 (rename from status)
```

## New ABIs Needed

- `src/abis/staking-router.ts` — StakingRouter read functions
- `src/abis/node-operators.ts` — NodeOperatorsRegistry read functions
- `src/abis/lido-locator.ts` — LidoLocator address getters

## New Contract Addresses Needed (in contracts.ts)

- StakingRouter: mainnet `0xFdDf38947aFB03C621C71b06C9C70bce73f12999`, Holesky `0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229`
- NodeOperatorsRegistry: mainnet `0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5`, Holesky `0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC`
- LidoLocator: mainnet `0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb`, Holesky `0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8`
- Need to look up Hoodi addresses for these
