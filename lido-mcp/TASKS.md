# Lido MCP Server — Task Checklist

## Core Infrastructure
- [x] Project scaffolding (package.json, tsconfig, tsup.config, .gitignore, .env.example)
- [x] Config loader with validation (config.ts)
- [x] Provider factory — viem + Lido SDK (provider.ts)
- [x] Centralized contract addresses — mainnet, Holesky, Hoodi (contracts.ts)
- [x] Response formatting utils (utils/format.ts)
- [x] Write mutex for nonce safety (utils/mutex.ts)
- [x] dry_run simulation util for governance (utils/dry-run.ts)
- [x] ABI files — Lido, wstETH, WithdrawalQueue, Voting, ERC20

## Chain Support
- [x] Ethereum Mainnet (chain ID 1)
- [x] Holesky Testnet (chain ID 17000)
- [x] Hoodi Testnet (chain ID 560048) — default
- [x] L2 wstETH addresses (Arbitrum, Optimism, Base, Polygon)

## Tool Implementations (14 tools)
- [x] `lido_status` — Health check
- [x] `lido_stake` — Stake ETH → stETH (with dry_run)
- [x] `lido_wrap` — Wrap stETH → wstETH (with dry_run + auto-approval)
- [x] `lido_unwrap` — Unwrap wstETH → stETH (with dry_run)
- [x] `lido_request_withdrawal` — Request withdrawal (with dry_run + approval)
- [x] `lido_claim_withdrawal` — Claim finalized withdrawal (with dry_run)
- [x] `lido_get_withdrawal_status` — Check withdrawal request status
- [x] `lido_get_balance` — ETH/stETH/wstETH/LDO balances + shares
- [x] `lido_get_rewards` — APR and reward projections
- [x] `lido_get_protocol_info` — TVL, rates, limits, fees
- [x] `lido_get_position_overview` — Full position across chains
- [x] `lido_cast_vote` — Vote on Aragon proposal (with dry_run)
- [x] `lido_get_vote` — Get vote details + voter state
- [x] `lido_list_votes` — List recent governance votes

## Server & Entry Point
- [x] MCP server setup with tool registration (server.ts)
- [x] Stdio transport entry point (index.ts)
- [x] Skill file served as MCP resource (lido://skill)

## Skill File (lido.skill.md)
- [x] Lido protocol overview
- [x] stETH vs wstETH decision table
- [x] Rebasing mechanics explanation
- [x] NEVER/ALWAYS safety rules
- [x] Tool quick reference
- [x] Common workflow recipes
- [x] Governance primer
- [x] Risk awareness
- [x] Cross-chain notes

## Documentation
- [x] ARCHITECTURE.md (v3 — 3 rounds of review, 100+ issues addressed)
- [x] README.md with quickstart
- [x] INSTRUCTIONS.md (hackathon requirements)
- [x] .env.example

## Testing
- [x] Integration test suite (test/run-tests.ts)
- [x] Setup tests (config, provider, RPC, balance) — 4/4 passed
- [x] Read-only contract tests (15 tests) — 15/15 passed
- [x] Dry-run simulation tests — 2/2 passed
- [x] Real transaction tests on Hoodi — 8/8 passed (stake, approve, wrap, unwrap, withdraw request)
- [x] Governance read tests — 2/2 passed
- [x] Final balance verification — 3/3 passed
- [x] Test report with transaction hashes (test/test-report.json)

## Hackathon Requirements Compliance
- [x] Stake ETH → stETH
- [x] Unstake (request + claim)
- [x] Wrap stETH → wstETH
- [x] Unwrap wstETH → stETH
- [x] Balance queries
- [x] Rewards queries
- [x] At least one governance action (cast_vote write + get_vote/list_votes reads)
- [x] All write operations support dry_run
- [x] On-chain integration (no mocks)
- [x] L2 + mainnet support
- [x] lido.skill.md with agent mental model
- [x] Not a REST API wrapper

## Remaining / Nice-to-Have
- [ ] MCP Inspector smoke test (`npm run inspect`)
- [ ] Easy Track governance motions (v2)
- [ ] Hardware wallet / WalletConnect support (v2)
- [ ] ENS resolution for address parameters (v2)
- [ ] Historical rewards tracking via subgraph (v2)
- [ ] Server-side dry_run enforcement (two-step hash matching)
- [ ] Transaction value limits (MAX_TRANSACTION_ETH enforcement in handlers)
- [ ] Rate limiting per tool
- [ ] Dual governance state in protocol info
- [ ] npm publish

## Test Transaction Hashes (Hoodi Testnet)

| Run | Operation | Tx Hash |
|-----|-----------|---------|
| 1 | Stake 0.01 ETH | `0x9327f23fbf03327aceae513289c0d0ded1f52fef84760ad8b03e62fb6f1520b3` |
| 1 | Wrap stETH | `0xf8559dcfa6de90d6eacc5a291cb4f87f89de9d006e210819860bec3ac0474fbb` |
| 1 | Unwrap wstETH | `0x92e11412e3f3061c1a81cf579962d3e25a953f40431e191a2ae2437a1ba953f5` |
| 1 | Request Withdrawal | `0x078c9eadd4b4cd4d3332e6fde63668bd69f02bffa1e51cb039c5dd460010bcc4` |
| 2 | Stake 0.01 ETH | `0x6b28f540780deeb19bd22153cabd61e9e97c3ff9221cf20b39170bf4363b885b` |
| 2 | Approve stETH | `0x4003066a9e0a9eb2e2530295d1938672dc65c970868e8cc948b23bdac29e38cd` |
| 2 | Wrap stETH | `0x53056a117eb0a1cf5bc9968b97d963210080ee937ce35d06d8138357bc7f108e` |
| 2 | Unwrap wstETH | `0x37ac697560b7bd3dd2e06f01c170719214a8578838b29c675e1d32692505e56d` |
| 2 | Request Withdrawal | `0x4a6c68d718fe9b90e61a014232a11ffbcb6cfe93be7cdc0e448fffd44f388fff` |
