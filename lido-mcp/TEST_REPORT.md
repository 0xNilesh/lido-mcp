# Lido MCP Server — Test Report

**Network:** Hoodi Testnet (Chain ID 560048)
**RPC:** https://hoodi.drpc.org
**Wallet:** `0x778D3206374f8AC265728E18E3fE2Ae6b93E4ce4`
**Date:** 2026-03-19
**Result:** 34/34 tests passed
**Total on-chain transactions:** 18 (nonce verified) — 15 with reported hashes + 3 internal approval txs

---

## Transaction Hashes

### Run 1

| # | Tool Tested | Operation | Tx Hash | Gas Used | Status |
|---|------------|-----------|---------|----------|--------|
| 1 | `lido_stake` | Stake 0.01 ETH → stETH | [`0x9327f23fbf03327aceae513289c0d0ded1f52fef84760ad8b03e62fb6f1520b3`](https://hoodi.etherscan.io/tx/0x9327f23fbf03327aceae513289c0d0ded1f52fef84760ad8b03e62fb6f1520b3) | 93,854 | success |
| 2 | `lido_wrap` (approve) | Approve stETH for wstETH contract | [`0x0d7e98c66d679f41c440f9b0191c14d909d8a3fe58514cc037f1204211c980bb`](https://hoodi.etherscan.io/tx/0x0d7e98c66d679f41c440f9b0191c14d909d8a3fe58514cc037f1204211c980bb) | — | success |
| 3 | `lido_wrap` | Wrap 0.005 stETH → wstETH | [`0xf8559dcfa6de90d6eacc5a291cb4f87f89de9d006e210819860bec3ac0474fbb`](https://hoodi.etherscan.io/tx/0xf8559dcfa6de90d6eacc5a291cb4f87f89de9d006e210819860bec3ac0474fbb) | 114,107 | success |
| 4 | `lido_unwrap` | Unwrap 0.00245 wstETH → stETH | [`0x92e11412e3f3061c1a81cf579962d3e25a953f40431e191a2ae2437a1ba953f5`](https://hoodi.etherscan.io/tx/0x92e11412e3f3061c1a81cf579962d3e25a953f40431e191a2ae2437a1ba953f5) | 91,206 | success |
| 5 | `lido_request_withdrawal` | Request withdrawal of 0.001 stETH | [`0x078c9eadd4b4cd4d3332e6fde63668bd69f02bffa1e51cb039c5dd460010bcc4`](https://hoodi.etherscan.io/tx/0x078c9eadd4b4cd4d3332e6fde63668bd69f02bffa1e51cb039c5dd460010bcc4) | 232,659 | success |

### Run 2

| # | Tool Tested | Operation | Tx Hash | Gas Used | Status |
|---|------------|-----------|---------|----------|--------|
| 1 | `lido_stake` | Stake 0.01 ETH → stETH | [`0x6b28f540780deeb19bd22153cabd61e9e97c3ff9221cf20b39170bf4363b885b`](https://hoodi.etherscan.io/tx/0x6b28f540780deeb19bd22153cabd61e9e97c3ff9221cf20b39170bf4363b885b) | 76,754 | success |
| 2 | `lido_wrap` (approve) | Approve stETH for wstETH contract | [`0x4003066a9e0a9eb2e2530295d1938672dc65c970868e8cc948b23bdac29e38cd`](https://hoodi.etherscan.io/tx/0x4003066a9e0a9eb2e2530295d1938672dc65c970868e8cc948b23bdac29e38cd) | — | success |
| 3 | `lido_wrap` | Wrap 0.00825 stETH → wstETH | [`0x53056a117eb0a1cf5bc9968b97d963210080ee937ce35d06d8138357bc7f108e`](https://hoodi.etherscan.io/tx/0x53056a117eb0a1cf5bc9968b97d963210080ee937ce35d06d8138357bc7f108e) | 96,995 | success |
| 4 | `lido_unwrap` | Unwrap 0.00526 wstETH → stETH | [`0x37ac697560b7bd3dd2e06f01c170719214a8578838b29c675e1d32692505e56d`](https://hoodi.etherscan.io/tx/0x37ac697560b7bd3dd2e06f01c170719214a8578838b29c675e1d32692505e56d) | 91,206 | success |
| 5 | `lido_request_withdrawal` | Request withdrawal of 0.001 stETH | [`0x4a6c68d718fe9b90e61a014232a11ffbcb6cfe93be7cdc0e448fffd44f388fff`](https://hoodi.etherscan.io/tx/0x4a6c68d718fe9b90e61a014232a11ffbcb6cfe93be7cdc0e448fffd44f388fff) | 198,459 | success |

---

## Read-Only Tests (no transactions)

| # | Tool Tested | Function Called | Result |
|---|------------|----------------|--------|
| 1 | `lido_get_protocol_info` | `getTotalPooledEther()` | 2,056,455.64 ETH |
| 2 | `lido_get_protocol_info` | `getTotalShares()` | 2,013,995,843,734,483,397,870,569 |
| 3 | `lido_get_protocol_info` | `getCurrentStakeLimit()` | 3,000 ETH |
| 4 | `lido_get_balance` | `balanceOf(wallet)` on stETH | 0.0065 stETH (before run 2) |
| 5 | `lido_get_balance` | `balanceOf(wallet)` on wstETH | 0.00245 wstETH (before run 2) |
| 6 | `lido_get_protocol_info` | `stEthPerToken()` on wstETH | 1 wstETH = 1.0211 stETH |
| 7 | `lido_get_balance` | `sharesOf(wallet)` | 6,365,794,008,091,146 shares |
| 8 | `lido_get_balance` | `balanceOf(wallet)` on LDO | 0 LDO |
| 9 | `lido_get_withdrawal_status` | `isBunkerModeActive()` | false |
| 10 | `lido_get_withdrawal_status` | `getLastFinalizedRequestId()` | 3,531 |
| 11 | `lido_list_votes` | `votesLength()` | 61 votes |
| 12 | `lido_get_protocol_info` | `getSharesByPooledEth(1 ETH)` | 979,352,924,321,714,718 shares |
| 13 | `lido_get_protocol_info` | `getPooledEthByShares(1e18)` | 1.0211 ETH |
| 14 | `lido_get_protocol_info` | `getWstETHByStETH(1 stETH)` | 0.9794 wstETH |
| 15 | `lido_get_protocol_info` | `getStETHByWstETH(1 wstETH)` | 1.0211 stETH |

## Dry Run Simulation Tests

| # | Tool Tested | Simulation | Result |
|---|------------|------------|--------|
| 1 | `lido_stake` | Simulate stake 0.01 ETH | SUCCESS — estimated gas: 87,441 |
| 2 | `lido_wrap` | Check stETH allowance flow | stETH: 0.0065, allowance: 0.005 |

## Governance Tests

| # | Tool Tested | Query | Result |
|---|------------|-------|--------|
| 1 | `lido_list_votes` | Total votes on Hoodi | 61 |
| 2 | `lido_get_vote` | Vote #60 details | open=false, executed=true, yea=55,000 LDO |

## Withdrawal Status Tests

| # | Tool Tested | Query | Result |
|---|------------|-------|--------|
| 1 | `lido_get_withdrawal_status` | Requests for wallet | 2 requests: IDs [3532, 3533] |

## Final Wallet Balances (after all tests)

| Token | Balance |
|-------|---------|
| ETH | 99.9786 |
| stETH | 0.0126 |
| wstETH | 0.00526 |
| LDO | 0 |

---

## Tool Coverage Summary

| Tool | Read Tested | Dry Run Tested | Write Tested | Tx Hash |
|------|:-----------:|:--------------:|:------------:|:-------:|
| `lido_status` | via setup tests | — | — | — |
| `lido_stake` | balance check | simulate 0.01 ETH | 0.01 ETH x2 | 2 hashes |
| `lido_wrap` | allowance check | allowance flow | 0.005 + 0.00825 stETH | 2 hashes |
| `lido_unwrap` | balance check | — | 0.00245 + 0.00526 wstETH | 2 hashes |
| `lido_request_withdrawal` | status check | — | 0.001 stETH x2 | 2 hashes |
| `lido_claim_withdrawal` | finalization check | — | skipped (not finalized yet) | — |
| `lido_get_withdrawal_status` | 2 requests found | — | — | — |
| `lido_get_balance` | ETH/stETH/wstETH/LDO/shares | — | — | — |
| `lido_get_rewards` | APR/projections | — | — | — |
| `lido_get_protocol_info` | TVL/shares/rates/limit/fee | — | — | — |
| `lido_get_position_overview` | aggregated view | — | — | — |
| `lido_cast_vote` | canVote check | — | no open votes | — |
| `lido_get_vote` | vote #60 details | — | — | — |
| `lido_list_votes` | 61 votes listed | — | — | — |

### Run 3 (post-refactor)

| # | Tool Tested | Operation | Tx Hash | Gas Used | Status |
|---|------------|-----------|---------|----------|--------|
| 1 | `lido_stake` | Stake 0.01 ETH → stETH | [`0xd5eee65cbbe3882279c512906c44e7b6870ee348ee5a6d64254127b35f441786`](https://hoodi.etherscan.io/tx/0xd5eee65cbbe3882279c512906c44e7b6870ee348ee5a6d64254127b35f441786) | 76,754 | success |
| 2 | `lido_wrap` (approve) | Approve stETH for wstETH contract | [`0x68057e453ceca5c031174e3e0e4e745f3059ff5ae5c73cf04dfa87ef7ecd066e`](https://hoodi.etherscan.io/tx/0x68057e453ceca5c031174e3e0e4e745f3059ff5ae5c73cf04dfa87ef7ecd066e) | — | success |
| 3 | `lido_wrap` | Wrap 0.01131 stETH → wstETH | [`0x24021498244aa40b00a5e5e0cf636eda4a5de435aedf4e067747647871bb79a3`](https://hoodi.etherscan.io/tx/0x24021498244aa40b00a5e5e0cf636eda4a5de435aedf4e067747647871bb79a3) | 97,007 | success |
| 4 | `lido_unwrap` | Unwrap 0.00817 wstETH → stETH | [`0x696290c48d5039aab6f5f323f594ad7b4072cc6577d167025e151d4556b6ffa9`](https://hoodi.etherscan.io/tx/0x696290c48d5039aab6f5f323f594ad7b4072cc6577d167025e151d4556b6ffa9) | 91,206 | success |
| 5 | `lido_request_withdrawal` (approve) | Approve stETH for WithdrawalQueue | (internal — not reported in test output) | — | success |
| 6 | `lido_request_withdrawal` | Request withdrawal of 0.001 stETH | [`0x0c72394b1e5d305c09b33914c37092adc81c34f558f851dcb645f5283498dd97`](https://hoodi.etherscan.io/tx/0x0c72394b1e5d305c09b33914c37092adc81c34f558f851dcb645f5283498dd97) | 198,459 | success |

---

**18 real on-chain transactions across 3 test runs. All confirmed via RPC (nonce = 18). 15 hashes reported + 3 internal approval txs.**
