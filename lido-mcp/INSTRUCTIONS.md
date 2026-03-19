# Project Instructions — Lido MCP Server

## Core Requirements
1. **Reference MCP server for Lido** — structured toolset for stETH staking, position management, governance
2. **Must integrate with stETH or wstETH on-chain** — no mocks
3. **Minimum coverage**: stake, unstake, wrap/unwrap, balance/rewards queries, at least one governance action
4. **All write operations must support `dry_run`**
5. **Pair with `lido.skill.md`** — gives agents the Lido mental model (rebasing, wstETH vs stETH, safe patterns)
6. **Target**: developer points Claude/Cursor at MCP and stakes ETH from conversation — no custom integration code
7. **Not REST API wrappers with MCP label** — real on-chain integration

## Target Use Cases
- Developer stakes ETH via Claude without writing integration code
- Agent autonomously monitors/manages staking position within human-set bounds
- DAO contributor queries and votes on governance proposals through natural language

## Resources (ALWAYS fetch latest docs, don't rely on memory)
- Lido docs: https://docs.lido.fi
- Contract addresses (mainnet + Holesky): https://docs.lido.fi/deployed-contracts
- Lido JS SDK: https://github.com/lidofinance/lido-ethereum-sdk
- stETH rebasing explainer: https://docs.lido.fi/guides/steth-integration-guide
- Withdrawal queue mechanics: https://docs.lido.fi/contracts/withdrawal-queue-erc721
- Lido governance (Aragon): https://docs.lido.fi/contracts/lido-dao

## Build Principles
- Production-level architecture
- Great DevX/UX
- Scalable skill file
- Think as staff system design engineer + UX engineer
- Don't assume anything — fetch and verify from docs
- Use code-simplifier skill after writing code
- Keep everything in `lido-mcp/` folder

## Prizes
- 1st: $3,000 — Best reference MCP with full integration, governance, dry_run, skill file
- 2nd: $2,000 — Runner-up with strong on-chain integration and agent-callable tooling
