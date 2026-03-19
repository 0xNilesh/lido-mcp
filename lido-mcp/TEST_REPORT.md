# Lido MCP Server — Test Report

**Network:** Hoodi Testnet (Chain ID 560048)
**RPC:** https://hoodi.drpc.org
**Wallet:** `0x778D3206374f8AC265728E18E3fE2Ae6b93E4ce4`
**Date:** 2026-03-19
**Tools:** 52 registered MCP tools
**Tests:** 65/65 passed (100%)
**Total on-chain transactions:** 23 across 4 test runs

---

## Latest Test Run (Run 4 — Full 65-test suite, post-expansion to 52 tools)

### Results by Category

| Category | Tests | Passed | Details |
|----------|:-----:|:------:|---------|
| Setup | 4 | 4 | Config, provider, RPC, wallet balance |
| Protocol Read | 12 | 12 | TVL, shares, stake limit, fee, beacon stats, external ether, etc. |
| Token Read | 8 | 8 | stETH/wstETH/LDO metadata, exchange rates |
| Balance | 6 | 6 | ETH, stETH, wstETH, LDO, shares, conversions |
| Conversion | 4 | 4 | wstETH↔stETH, share rate, round-trip |
| Withdrawal Queue | 8 | 8 | Request IDs, finalization, bunker mode, unfinalized stats |
| Governance | 5 | 5 | Vote count, vote details, voter state, canVote, LDO token |
| Infrastructure | 4 | 4 | Staking modules, node operators, delegation |
| Contract Addresses | 2 | 2 | LidoLocator, bytecode verification |
| Dry Run Simulation | 4 | 4 | Stake, wrap, unwrap, withdrawal simulations |
| Write Transactions | 5 | 5 | Real on-chain: stake, approve, wrap, unwrap, withdraw |
| Post-Tx Verification | 3 | 3 | Balance changes, withdrawal request existence |
| **Total** | **65** | **65** | **100% pass rate** |

### Run 4 Transaction Hashes

| # | Operation | Tx Hash |
|---|-----------|---------|
| 1 | Stake 0.001 ETH → stETH | `0x42028ed3bb76b4b29558a4e3620ac62838813129aa3558be606b10719c650035` |
| 2 | Approve stETH for wstETH | `0x16d006854cc4afec445bf507c736b20713a5efd74701367cf3b9e6252a88a1b9` |
| 3 | Wrap stETH → wstETH | `0xd459c0cdee64be17ef2215782002be22bfb15d1decbcfcad06d38732f0cd8fbf` |
| 4 | Unwrap wstETH → stETH | `0xaa2ad184600f2d6f9983acc68d234ac535fde6b2848c61aef576c9cc9d29f36e` |
| 5 | Request Withdrawal | `0xf068c5ac694984cd12af58c54eba5511ed477f1e7a2b5abeac8e33b76eb26c1e` |

---

## All Transaction Hashes (All Runs)

### Run 1 (Initial implementation)
| Operation | Tx Hash |
|-----------|---------|
| Stake 0.01 ETH | `0x9327f23fbf03327aceae513289c0d0ded1f52fef84760ad8b03e62fb6f1520b3` |
| Approve stETH | `0x0d7e98c66d679f41c440f9b0191c14d909d8a3fe58514cc037f1204211c980bb` |
| Wrap stETH | `0xf8559dcfa6de90d6eacc5a291cb4f87f89de9d006e210819860bec3ac0474fbb` |
| Unwrap wstETH | `0x92e11412e3f3061c1a81cf579962d3e25a953f40431e191a2ae2437a1ba953f5` |
| Request Withdrawal | `0x078c9eadd4b4cd4d3332e6fde63668bd69f02bffa1e51cb039c5dd460010bcc4` |

### Run 2 (ABI fixes)
| Operation | Tx Hash |
|-----------|---------|
| Stake 0.01 ETH | `0x6b28f540780deeb19bd22153cabd61e9e97c3ff9221cf20b39170bf4363b885b` |
| Approve stETH | `0x4003066a9e0a9eb2e2530295d1938672dc65c970868e8cc948b23bdac29e38cd` |
| Wrap stETH | `0x53056a117eb0a1cf5bc9968b97d963210080ee937ce35d06d8138357bc7f108e` |
| Unwrap wstETH | `0x37ac697560b7bd3dd2e06f01c170719214a8578838b29c675e1d32692505e56d` |
| Request Withdrawal | `0x4a6c68d718fe9b90e61a014232a11ffbcb6cfe93be7cdc0e448fffd44f388fff` |

### Run 3 (Post-refactor)
| Operation | Tx Hash |
|-----------|---------|
| Stake 0.01 ETH | `0xd5eee65cbbe3882279c512906c44e7b6870ee348ee5a6d64254127b35f441786` |
| Approve stETH | `0x68057e453ceca5c031174e3e0e4e745f3059ff5ae5c73cf04dfa87ef7ecd066e` |
| Wrap stETH | `0x24021498244aa40b00a5e5e0cf636eda4a5de435aedf4e067747647871bb79a3` |
| Unwrap wstETH | `0x696290c48d5039aab6f5f323f594ad7b4072cc6577d167025e151d4556b6ffa9` |
| Request Withdrawal | `0x0c72394b1e5d305c09b33914c37092adc81c34f558f851dcb645f5283498dd97` |

### Run 4 (Full 52-tool suite)
| Operation | Tx Hash |
|-----------|---------|
| Stake 0.001 ETH | `0x42028ed3bb76b4b29558a4e3620ac62838813129aa3558be606b10719c650035` |
| Approve stETH | `0x16d006854cc4afec445bf507c736b20713a5efd74701367cf3b9e6252a88a1b9` |
| Wrap stETH | `0xd459c0cdee64be17ef2215782002be22bfb15d1decbcfcad06d38732f0cd8fbf` |
| Unwrap wstETH | `0xaa2ad184600f2d6f9983acc68d234ac535fde6b2848c61aef576c9cc9d29f36e` |
| Request Withdrawal | `0xf068c5ac694984cd12af58c54eba5511ed477f1e7a2b5abeac8e33b76eb26c1e` |

---

## Tool Coverage Summary (52 tools)

### Write Tools (20) — all with dry_run support
| Tool | Tested | Tx Hash |
|------|:------:|---------|
| `lido_stake` | real tx | 4 hashes across runs |
| `lido_stake_and_wrap` | dry_run | — |
| `lido_wrap` | real tx | 4 hashes |
| `lido_unwrap` | real tx | 4 hashes |
| `lido_transfer` | untested (needs recipient) | — |
| `lido_transfer_ldo` | untested (0 LDO) | — |
| `lido_transfer_withdrawal_nft` | untested | — |
| `lido_approve` | real tx (via approve tests) | 4 hashes |
| `lido_approve_withdrawal_nft` | untested | — |
| `lido_revoke_all_approvals` | untested | — |
| `lido_increase_allowance` | untested | — |
| `lido_request_withdrawal` | real tx | 4 hashes |
| `lido_claim_withdrawal` | untested (not finalized) | — |
| `lido_claim_single_withdrawal` | untested (not finalized) | — |
| `lido_claim_withdrawal_to` | untested (not finalized) | — |
| `lido_cast_vote` | dry_run only | — |
| `lido_delegate` | untested | — |
| `lido_undelegate` | untested | — |

### Read Tools (32)
| Tool | Tested |
|------|:------:|
| `lido_status` | setup |
| `lido_get_balance` | balance tests |
| `lido_get_position_overview` | implicit |
| `lido_get_l2_balances` | implicit |
| `lido_get_allowance` | dry_run |
| `lido_get_all_allowances` | dry_run |
| `lido_convert` | conversion tests |
| `lido_get_exchange_rates` | token read tests |
| `lido_get_share_rate` | conversion tests |
| `lido_get_rewards` | implicit |
| `lido_get_protocol_fee` | protocol read |
| `lido_get_protocol_info` | protocol read |
| `lido_get_staking_limit` | protocol read |
| `lido_is_staking_paused` | protocol read |
| `lido_get_beacon_stats` | protocol read |
| `lido_get_staking_modules` | infrastructure |
| `lido_get_staking_module` | infrastructure |
| `lido_get_node_operators` | infrastructure |
| `lido_get_node_operator` | infrastructure |
| `lido_get_withdrawal_status` | withdrawal queue |
| `lido_get_withdrawal_requests` | withdrawal queue |
| `lido_get_withdrawal_queue_info` | withdrawal queue |
| `lido_get_claimable_ether` | withdrawal queue |
| `lido_get_withdrawal_nft_owner` | withdrawal queue |
| `lido_is_bunker_mode` | withdrawal queue |
| `lido_get_vote` | governance |
| `lido_list_votes` | governance |
| `lido_can_vote` | governance |
| `lido_get_voter_state` | governance |
| `lido_get_vote_count` | governance |
| `lido_get_token_info` | token read |
| `lido_get_contract_addresses` | contract addresses |
| `lido_get_supported_chains` | contract addresses |
| `lido_get_delegate` | governance |

---

## Protocol Data Verified on Hoodi

| Metric | Value |
|--------|-------|
| Total Pooled ETH (TVL) | ~2,056,455 ETH |
| Total Shares | ~2,013,995,863,321,541,884,304,863 |
| Stake Limit | 3,000 ETH |
| Staking Paused | false |
| Protocol Fee | 1,000 basis points (10%) |
| Exchange Rate | 1 wstETH = 1.0211 stETH |
| Bunker Mode | false |
| Aragon Votes | 61 total |
| Staking Modules | deployed |
| Node Operators | deployed |
| Dual Governance | deployed |
| VaultHub (V3) | deployed |
| VaultFactory (V3) | deployed |
