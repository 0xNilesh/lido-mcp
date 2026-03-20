# Lido MCP Server — Test Report

**Network:** Hoodi Testnet (Chain ID 560048) + Ethereum Mainnet (Chain ID 1)
**RPC:** https://hoodi.drpc.org (Hoodi), https://eth.drpc.org (Mainnet)
**Wallet:** `0x778D3206374f8AC265728E18E3fE2Ae6b93E4ce4`
**Date:** 2026-03-20
**Tools:** 67 registered MCP tools across 12 domains
**Tests:** 65/65 integration tests + 41/41 agent simulation tests = 106/106 passed (100%)
**Total on-chain transactions:** 50+ across all test runs

---

## Test Suite Results (65/65 passed)

| Category | Tests | Passed | Details |
|----------|:-----:|:------:|---------|
| System | 3 | 3 | Config, provider, RPC, wallet |
| Protocol Read | 5 | 5 | TVL, fee, limit, paused, beacon stats |
| Token Read | 3 | 3 | stETH/wstETH/LDO metadata + rates |
| Conversion & Rates | 3 | 3 | Exchange rates, share rate, conversions |
| Balance | 3 | 3 | All balances, rewards, position overview |
| Allowance | 2 | 2 | Single + all allowances |
| Withdrawal Queue | 6 | 6 | Queue stats, requests, status, bunker, NFT |
| Governance | 6 | 6 | Votes, voter state, delegate |
| Infrastructure | 4 | 4 | Staking modules, node operators |
| L2 | 1 | 1 | Cross-chain wstETH balances |
| Dry Run Simulations | 13 | 13 | All write tools simulated |
| Real Transactions | 10 | 10 | Stake, wrap, unwrap, approve, withdraw, transfer |
| **stVaults (V3)** | **6** | **6** | VaultHub stats, list, details, owner, operator, deposits |
| **Total** | **65** | **65** | **100% pass rate** |

## Agent Simulation Results (41/41 passed)

Simulates a fresh Claude agent following the lido.skill.md workflows:

| Workflow | Tests | Status |
|----------|:-----:|:------:|
| Full position summary (lido_summary) | 1 | ✅ |
| Stake ETH flow | 2 | ✅ |
| Wrap stETH flow | 2 | ✅ |
| Withdrawal status check | 3 | ✅ |
| Governance — Aragon voting (list, details, IPFS, can_vote, voter_state, simulate vote) | 5 | ✅ |
| Easy Track motions | 1 | ✅ |
| Dual Governance state | 2 | ✅ |
| stVaults V3 (hub stats, list, get vault) | 3 | ✅ |
| Token operations (convert, rates, allowances, token info) | 5 | ✅ |
| Protocol infrastructure (9 tools) | 9 | ✅ |
| Position monitoring with bounds | 1 | ✅ |
| Cross-chain L2 balances | 1 | ✅ |
| System (health, prepare tx) | 2 | ✅ |
| Multi-chain (same tool on mainnet vs hoodi) | 3 | ✅ |
| Impersonation (vitalik's mainnet balance) | 1 | ✅ |
| **Total** | **41** | **41 (100%)** |

## Latest Transaction Hashes (Test Run)

| Operation | Tx Hash |
|-----------|---------|
| Stake 0.001 ETH | `0x6338477185b9ccadcb926ae831bbf847c02e2b187344fb067704c84de18d8d7e` |
| Approve stETH | `0xbf8b05ebb705f3b940efee432c9c85498f59332397d55a722683fbd48eb901b3` |
| Wrap stETH | `0x11782b6dd6b22aec0a333a3fc094ee83043700a8a510c349bf85e80dc67aa7e1` |
| Unwrap wstETH | `0x811a4070ae039821b1ad22e0c468703671bc048ecfa4437d24a4588cc1769cf3` |
| Increase allowance | `0x2eebffc3031614569450975e4731fa1861a33442adc2423455a6398d6b200f87` |
| Approve for WQ | `0xeb523b425fdfe087eaee7276b64c805ef31e75cfe03c2aa617f7579ba2aef60c` |
| Request withdrawal | `0x02b08ae547f7a4d5e53491bac4d80f91d5762c29fa1471f4b5fa5969480f55c8` |
| Stake+wrap | `0x3159bb8865ebdd476585ea567552a20b42dc04059a0dd7143358c05d50af5dad` |
| Self-transfer stETH | `0x6aef91ec11e7e4dfacbd8c27bd53a2ba564c78255d831fef1cb4915d908e863d` |
| Revoke approvals | `0x87d82f78875024ee1ff06b68fde97003ce20739a95506dbd69d50491ba66119c` |

## Protocol Data Verified

| Metric | Hoodi | Mainnet |
|--------|-------|---------|
| TVL | ~2.06M ETH | ~9.8M ETH |
| Validators | 72,504 | 300K+ |
| Staking APR | ~3.15% | ~3.15% |
| Exchange Rate | 1 wstETH = 1.0211 stETH | 1 wstETH ≈ 1.19 stETH |
| Bunker Mode | false | false |
| Aragon Votes | 61 | 199 |
| Easy Track Motions | — | 1 active |
| Dual Governance | Normal | Normal |
| stVaults (V3) | 541 vaults | — |

## Tool Coverage (67 tools)

| Domain | Tools | All Tested |
|--------|:-----:|:----------:|
| ↗ Staking | 5 | ✅ |
| ⇄ Wrapping | 2 | ✅ |
| ↩ Withdrawals | 12 | ✅ |
| 🪙 Tokens | 10 | ✅ |
| 💎 Rewards | 1 | ✅ |
| 📊 Position | 4 | ✅ |
| 🏛 Governance | 10 | ✅ |
| ⚡ Easy Track | 2 | ✅ |
| 🛡 Dual Governance | 2 | ✅ |
| 🏗 stVaults (V3) | 7 | ✅ |
| ⬢ Protocol | 10 | ✅ |
| ⚙ System | 2 | ✅ |
| **Total** | **67** | **100%** |
