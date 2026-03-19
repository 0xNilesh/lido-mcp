# Lido MCP Server — Architecture Document (v3)

> v2: Revised after three-agent review (UX, System Design, DevX). 49 issues addressed.
> v3: Revised after five-agent review (Security, Web3, MCP Protocol, Hackathon Judge, QA). 52 additional issues addressed.

## 1. Overview

A production-grade Model Context Protocol (MCP) server that makes Lido's liquid staking protocol natively callable by AI agents. The server exposes stETH staking, position management, cross-chain wstETH queries, and DAO governance as structured tools — enabling developers to stake ETH, manage positions, and participate in governance through natural language without writing integration code.

### Target Use Cases (from hackathon brief — verbatim)

1. **Zero-integration staking** — "A developer stakes ETH via Claude without writing any integration code." The bar: point Claude or Cursor at this MCP server and stake ETH from a conversation. No custom code.
2. **Autonomous position management** — "An agent autonomously monitors and manages a staking position within human-set bounds." The agent can check balances across chains, track rewards, evaluate wrap/unwrap tradeoffs, request withdrawals when thresholds are met — all within guardrails the human sets via natural language.
3. **Natural language governance** — "A DAO contributor queries and votes on governance proposals through natural language." List open votes, inspect details, cast votes — all through conversation.
4. **Cross-chain position visibility** — wstETH is deployed on Base, Optimism, Arbitrum, Polygon, zkSync, Mantle, Linea, Scroll, Mode, BSC, Zircuit. The server queries balances across all of them.
5. **Not a REST wrapper** — "Not looking for REST API wrappers with an MCP label on top." Every tool hits on-chain contracts directly via viem + Lido SDK. No intermediary APIs.

### Hackathon Requirements Checklist

| Requirement (from brief) | Covered | Section |
|--------------------------|---------|---------|
| Stake ETH → stETH | ✓ | §5.1 |
| Unstake (request + claim) | ✓ | §5.3 |
| Wrap stETH → wstETH | ✓ | §5.2 |
| Unwrap wstETH → stETH | ✓ | §5.2 |
| Balance queries | ✓ | §5.5 |
| Rewards queries | ✓ | §5.6 |
| At least one governance action (write) | ✓ | §5.7 (lido_cast_vote) |
| All write operations support dry_run | ✓ | §6 — all 5 write tools |
| Integrate with stETH or wstETH on-chain | ✓ | §8 — real contracts |
| No mocks | ✓ | §2 — design principle |
| Any L2 or mainnet accepted | ✓ | §7 — 13 chains |
| wstETH on Base, Optimism, Arbitrum, others | ✓ | §7 — all addresses |
| Staking + governance on Ethereum | ✓ | §7 — mainnet + Holesky |
| lido.skill.md with Lido mental model | ✓ | §12 |
| Rebasing mechanics in skill | ✓ | §12 point 3 |
| wstETH vs stETH tradeoffs in skill | ✓ | §12 point 2 |
| Safe staking patterns in skill | ✓ | §12 point 4 |
| Dev stakes from conversation, no code | ✓ | npx + MCP config |
| Agent monitors/manages position | ✓ | §5.12 (lido_get_position_overview) |
| Not REST API wrappers | ✓ | Direct on-chain via SDK + viem |

---

## 2. Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Real on-chain** | Direct contract interactions via viem + Lido SDK. Zero mocks. |
| **dry_run first** | Every write tool defaults to `dry_run: true`. Agents must explicitly opt in to real transactions. |
| **Structured responses** | All tools return JSON for machine parsing + human-readable summary. No markdown-only responses. |
| **Auto-approve** | Wrap and withdrawal tools handle ERC-20 approvals internally. Agents never deal with allowances. |
| **Minimal config** | Two env vars to start (`ETHEREUM_RPC_URL` + `PRIVATE_KEY`). Chain defaults to Holesky for safety. |
| **Fail loud** | Clear, actionable error messages. Contract reverts decoded to human-readable reasons. |
| **Serialized writes** | Write operations serialized through a mutex to prevent nonce conflicts. |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AI Agent (Claude, Cursor, etc.)           │
│                                                             │
│  "Stake 1 ETH with Lido"                                   │
│  "What's my wstETH balance on Arbitrum?"                    │
│  "Vote yes on proposal 178"                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │ MCP Protocol (stdio)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Lido MCP Server                          │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ Tool Router   │  │ lido.skill.md │  │ Config           │ │
│  │ (server.ts)   │  │ (resource)    │  │ (.env + env vars)│ │
│  └──────┬───────┘  └───────────────┘  └────────┬─────────┘ │
│         │                                       │           │
│  ┌──────▼───────────────────────────────────────▼────────┐  │
│  │                    Tool Handlers                       │  │
│  │  ┌────────┐ ┌──────┐ ┌──────────┐ ┌─────────────────┐ │  │
│  │  │ Stake  │ │ Wrap │ │Withdraw  │ │ Balance+Rewards │ │  │
│  │  └────────┘ └──────┘ └──────────┘ └─────────────────┘ │  │
│  │  ┌────────────┐ ┌──────────────┐ ┌─────────────────┐  │  │
│  │  │ Governance │ │ Protocol Info│ │ Status (health) │  │  │
│  │  └────────────┘ └──────────────┘ └─────────────────┘  │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼────────────────────────────────┐  │
│  │              Provider Layer                            │  │
│  │  ┌──────────────────┐  ┌────────────────────────────┐ │  │
│  │  │ viem clients     │  │ Lido Ethereum SDK          │ │  │
│  │  │ (public + wallet)│  │ (stake, wrap, withdraw)    │ │  │
│  │  └────────┬─────────┘  └──────────┬─────────────────┘ │  │
│  │           │  Write Mutex          │                    │  │
│  │           │  (nonce serialization)│                    │  │
│  └───────────┼───────────────────────┼────────────────────┘  │
└──────────────┼───────────────────────┼───────────────────────┘
               │                       │
               ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Ethereum / L2 Networks                     │
│                                                              │
│  Mainnet: Lido  wstETH  WithdrawalQueue  Voting  LDO        │
│  Holesky: Lido  wstETH  WithdrawalQueue  Voting  LDO        │
│  L2s:     wstETH (balance-only: Arb, OP, Base, + 12 more)   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Structure

```
lido-mcp/
├── src/
│   ├── index.ts                 # Entry point — stdio transport bootstrap
│   ├── server.ts                # MCP server init, tool + resource registration
│   ├── config.ts                # Env var parsing, chain config, contract addresses
│   ├── provider.ts              # createProvider() factory — viem + Lido SDK
│   ├── tools/
│   │   ├── stake.ts             # lido_stake (includes stake limit validation)
│   │   ├── wrap.ts              # lido_wrap, lido_unwrap (auto-approval built in)
│   │   ├── withdraw.ts          # lido_request_withdrawal, lido_claim_withdrawal
│   │   ├── withdrawal-status.ts # lido_get_withdrawal_status
│   │   ├── balance.ts           # lido_get_balance (includes shares + L2 wstETH)
│   │   ├── rewards.ts           # lido_get_rewards
│   │   ├── governance.ts        # lido_cast_vote, lido_get_vote, lido_list_votes
│   │   ├── protocol.ts          # lido_get_protocol_info (stats + rates merged)
│   │   ├── position.ts          # lido_get_position_overview (full position summary)
│   │   └── status.ts            # lido_status (health check)
│   ├── abis/
│   │   ├── lido.ts              # Lido/stETH ABI
│   │   ├── wsteth.ts            # wstETH ABI
│   │   ├── withdrawal-queue.ts  # WithdrawalQueueERC721 ABI
│   │   ├── voting.ts            # Aragon Voting ABI
│   │   └── erc20.ts             # Minimal ERC-20 ABI (balanceOf, approve, allowance)
│   └── utils/
│       ├── dry-run.ts           # executeOrSimulate — governance-only (SDK handles rest)
│       ├── format.ts            # JSON + summary response builder
│       └── mutex.ts             # Write operation serialization
├── lido.skill.md                # Agent mental model (bundled as MCP resource)
├── .env.example                 # Template for required env vars
├── .gitignore                   # Blocks .env, dist/, node_modules/
├── package.json                 # Fully specified (see §15)
├── tsconfig.json                # Strict TypeScript config (see §15)
├── tsup.config.ts               # Build config with shebang (see §15)
├── ARCHITECTURE.md              # This document
├── INSTRUCTIONS.md              # Hackathon requirements reference
└── README.md                    # Clone-to-stake quickstart
```

**Design rationale:**
- `tools/` grouped by domain, flat — one file per capability area, no nesting
- `withdrawal-status.ts` separate from `withdraw.ts` — reads vs writes, different complexity
- `rewards.ts` separate from `balance.ts` — rewards requires APR calculation logic, balance is simple multicall
- `position.ts` — the "god view" tool for autonomous position management; aggregates balance + rewards + withdrawals + L2 in one call
- `status.ts` — health check tool, critical for first-time setup verification
- `abis/erc20.ts` — needed for LDO balance queries and L2 wstETH queries
- `utils/mutex.ts` — prevents nonce conflicts on concurrent write tool calls
- `provider.ts` exports a factory function, not module-level singletons — testable
- `lido.skill.md` at root — included in npm `files` field, resolved via `import.meta.url`

---

## 5. Tool Catalog (14 tools)

> Consolidated from 17 → 14 after UX review. Merged `get_shares` into `get_balance`, merged `get_exchange_rate` + `get_protocol_stats` into `get_protocol_info`, inlined `get_stake_limit` into `stake` validation, removed standalone `get_voter_state` (included in `get_vote` response). Added `get_position_overview` for autonomous position management use case.

### 5.1 `lido_stake`
Stake ETH to receive stETH. Validates against current stake limit internally.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `amount` | string | yes | — | Amount of ETH to stake (e.g. "1.5") |
| `referral_address` | string | no | "0x0000..." | Referral address for tracking |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, steth_received, shares_received, gas_estimate, gas_cost_eth, tx_hash?, summary }`

**Implementation:** Uses `lidoSDK.stake.stakeEth()` for execution. For dry_run, uses SDK's callback mechanism at `GAS_LIMIT` stage to capture estimate, then aborts. Internally checks `getCurrentStakeLimit()` and returns actionable error if amount exceeds limit.

**Requires wallet:** Yes (write operation)

### 5.2 `lido_wrap` / `lido_unwrap`
Wrap stETH → wstETH or unwrap wstETH → stETH. **Auto-handles ERC-20 approval.**

#### `lido_wrap`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `amount` | string | yes | — | Amount of stETH to wrap |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, wsteth_received, exchange_rate, gas_estimate, gas_cost_eth, approval_needed, tx_hash?, summary }`

**Implementation:** Checks `lidoSDK.wrap.getStethForWrapAllowance()`. If insufficient, calls `lidoSDK.wrap.approveStethForWrap()` first (included in dry_run output as `approval_needed: true`). Then calls `lidoSDK.wrap.wrapSteth()`.

#### `lido_unwrap`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `amount` | string | yes | — | Amount of wstETH to unwrap |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, steth_received, exchange_rate, gas_estimate, gas_cost_eth, tx_hash?, summary }`

**Implementation:** Uses `lidoSDK.wrap.unwrap()`. No approval needed (wstETH unwrap is direct).

**Requires wallet:** Yes (write operations)

### 5.3 `lido_request_withdrawal` / `lido_claim_withdrawal`
Request and claim ETH withdrawals. **Auto-handles approval.**

#### `lido_request_withdrawal`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `amount` | string | yes | — | Amount to withdraw (max 1000 ETH per request, auto-splits larger amounts) |
| `token` | string | no | "stETH" | Token to withdraw: "stETH" or "wstETH" |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, request_ids, nft_token_ids, estimated_wait_days, gas_estimate, gas_cost_eth, approval_needed, tx_hash?, summary }`

**Implementation:** Uses `lidoSDK.withdraw.request.requestWithdrawalWithPermit({ amount, token })`. The `WithPermit` variant handles EIP-2612 permit signing inline — no separate approval transaction needed. Auto-splits amounts > 1000 ETH into multiple requests. Note: the SDK module is `withdraw`, NOT `withdrawals`.

**Validation:** Amount must be ≥ 100 wei. If > 1000 ETH, automatically batched. Zod schema enforces valid decimal string.

#### `lido_claim_withdrawal`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `request_ids` | string[] | yes | — | Request IDs to claim (as strings for uint256 safety) |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, claimed_amounts, total_eth_claimed, gas_estimate, gas_cost_eth, tx_hash?, summary }`

**Implementation:** Uses `lidoSDK.withdraw.claim.claimRequests({ requestsIds })`. SDK handles `findCheckpointHints` internally.

**Requires wallet:** Yes (write operations)

### 5.4 `lido_get_withdrawal_status`
Check status of withdrawal requests.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `request_ids` | string[] | no | — | Specific request IDs to check |
| `address` | string | no | connected wallet | Owner address to list all requests |

**Returns (JSON):** `{ requests: [{ id, amount_steth, shares, owner, timestamp, is_finalized, is_claimed, claimable_eth }], summary }`

**Requires wallet:** No (read operation)

### 5.5 `lido_get_balance`
Get all Lido-related token balances for an address. Includes shares, L2 wstETH if chain specified.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `address` | string | no | connected wallet | Address to query |
| `chain` | string | no | current chain | Chain to query: "ethereum", "arbitrum", "optimism", "base", etc. |

**Returns (JSON):**
```json
{
  "address": "0x...",
  "chain": "ethereum",
  "eth": "5.234",
  "steth": "10.543",
  "wsteth": "9.123",
  "ldo": "1500.0",
  "shares": "9876543210...",
  "steth_value_of_wsteth": "10.234",
  "total_staked_value_eth": "20.777",
  "summary": "You hold 10.543 stETH + 9.123 wstETH (~10.234 stETH) = ~20.777 ETH total staked value."
}
```

On L2 chains, only `wsteth` and `eth` are returned (stETH doesn't exist on L2s, only wstETH).

**Requires wallet:** No (read operation)

### 5.6 `lido_get_rewards`
Get staking rewards and APR information.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `address` | string | no | connected wallet | Address to query |

**Returns (JSON):**
```json
{
  "address": "0x...",
  "current_apr_pct": "3.45",
  "steth_balance": "10.543",
  "estimated_daily_eth": "0.000997",
  "estimated_monthly_eth": "0.0299",
  "estimated_yearly_eth": "0.3637",
  "protocol_fee_pct": "10",
  "summary": "At 3.45% APR, your 10.543 stETH earns ~0.001 ETH/day (~0.364 ETH/year). Protocol fee: 10%."
}
```

**Implementation:** APR computed from `getTotalPooledEther()` and the last `TokenRebased` event's share rate delta. Per-user rewards are projections: `balance × APR`. No subgraph dependency.

**Requires wallet:** No (read operation)

### 5.7 `lido_cast_vote`
Vote on a Lido DAO Aragon governance proposal.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `vote_id` | number | yes | — | The vote/proposal ID |
| `vote_for` | boolean | yes | — | true = vote FOR, false = vote AGAINST |
| `dry_run` | boolean | no | true | Simulate without broadcasting |

**Returns (JSON):** `{ success, vote_id, voted, yea_pct, nay_pct, quorum_reached, gas_estimate, gas_cost_eth, tx_hash?, summary }`

**Implementation:** Direct viem `simulateContract` / `writeContract` against Aragon Voting at `0x2e59A20f205bB85a89C53f1936454680651E618e`. Uses `executeOrSimulate` utility (governance is not covered by Lido SDK).

**Requires wallet:** Yes (write operation). Must hold LDO tokens.

### 5.8 `lido_get_vote`
Get details of a specific governance vote. Includes connected wallet's vote if wallet configured.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `vote_id` | number | yes | — | The vote/proposal ID |

**Returns (JSON):**
```json
{
  "vote_id": 178,
  "open": true,
  "executed": false,
  "start_date": "2026-03-15T14:00:00Z",
  "end_date": "2026-03-20T14:00:00Z",
  "phase": "main",
  "support_required_pct": "50",
  "min_quorum_pct": "5",
  "yea": "12345678.9",
  "nay": "987654.3",
  "yea_pct": "92.6",
  "nay_pct": "7.4",
  "voting_power": "100000000",
  "your_vote": "not_voted",
  "can_vote": true,
  "summary": "Vote #178 is OPEN (main phase, ends Mar 20). 92.6% FOR / 7.4% AGAINST. Quorum reached. You have not voted."
}
```

**Implementation:** Calls `Voting.getVote(voteId)` + `Voting.getVoterState(voteId, walletAddress)` + `Voting.canVote(voteId, walletAddress)` via multicall. Also queries dual governance state from `lidoSDK.dualGovernance.getDualGovernanceState()` — if governance is in "Blocked" state, includes warning that proposals cannot execute even if they pass.

**Dual governance awareness:** Lido has activated dual governance on mainnet. stETH holders can signal opposition via veto escrow, potentially blocking proposal execution. The `governance_state` field ("Normal" | "Warning" | "Blocked") is included in both `lido_get_vote` and `lido_get_protocol_info` responses.

**Requires wallet:** No (read operation, but wallet enriches response with `your_vote`)

### 5.9 `lido_list_votes`
List recent governance votes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `count` | number | no | 5 | Number of recent votes to return (max 20) |
| `status` | string | no | "all" | Filter: "all", "open", "executed" |

**Returns (JSON):** `{ votes: [{ vote_id, open, executed, yea_pct, nay_pct, start_date }], total_votes, summary }`

**Implementation:** Calls `Voting.votesLength()`, then batch-fetches via viem `multicall` (not sequential RPC calls). Scans backwards, max depth 50. Hard-capped at 20 results.

**Requires wallet:** No (read operation)

### 5.10 `lido_get_protocol_info`
Get protocol statistics AND exchange rates (merged from two tools).

**Returns (JSON):**
```json
{
  "total_pooled_eth": "9876543.21",
  "total_shares": "8765432100000000000000000",
  "buffered_eth": "1234.56",
  "current_apr_pct": "3.45",
  "protocol_fee_pct": "10",
  "steth_per_share": "1.1267",
  "wsteth_per_steth": "0.8876",
  "steth_per_wsteth": "1.1267",
  "staking_limit_remaining_eth": "150000",
  "is_staking_paused": false,
  "governance_state": "Normal",
  "summary": "Lido TVL: 9.88M ETH. APR: 3.45%. 1 wstETH = 1.1267 stETH. Staking open, 150K ETH capacity. Governance: Normal."
}
```

**Requires wallet:** No (read operation)

### 5.11 `lido_status`
Health check — verify server configuration and connectivity.

**Returns (JSON):**
```json
{
  "connected": true,
  "chain": "holesky",
  "chain_id": 17000,
  "rpc_endpoint": "https://eth-hol...***",
  "current_block": 1234567,
  "wallet_configured": true,
  "wallet_address": "0xAbC...123",
  "write_operations_available": true,
  "supported_operations": ["stake", "wrap", "unwrap", "withdraw", "governance", "balance", "rewards"],
  "summary": "Lido MCP connected to Holesky (block 1,234,567). Wallet 0xAbC...123 configured. All operations available."
}
```

**Requires wallet:** No (but reports wallet status)

### 5.12 `lido_get_position_overview`
Full position summary across chains — the single tool an agent calls to understand the user's complete Lido position. Designed for the "autonomous position management" use case.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `address` | string | no | connected wallet | Address to query |
| `include_l2` | boolean | no | true | Include wstETH balances on all supported L2s |

**Returns (JSON):**
```json
{
  "address": "0x...",
  "ethereum": {
    "eth": "5.234",
    "steth": "10.543",
    "wsteth": "9.123",
    "ldo": "1500.0",
    "shares": "9876543210...",
    "steth_value_of_wsteth": "10.234",
    "total_staked_value_eth": "20.777"
  },
  "l2_balances": {
    "arbitrum": { "wsteth": "5.0", "wsteth_in_steth": "5.63" },
    "optimism": { "wsteth": "2.0", "wsteth_in_steth": "2.25" },
    "base": { "wsteth": "0.0", "wsteth_in_steth": "0.0" }
  },
  "total_wsteth_all_chains": "16.123",
  "total_staked_value_all_chains_eth": "28.64",
  "pending_withdrawals": {
    "count": 1,
    "total_steth": "5.0",
    "requests": [
      { "id": "123", "amount": "5.0", "is_finalized": false, "is_claimed": false }
    ]
  },
  "rewards": {
    "current_apr_pct": "3.45",
    "estimated_daily_eth": "0.00271",
    "estimated_yearly_eth": "0.988"
  },
  "summary": "Total Lido position: ~28.64 ETH across 3 chains. 10.54 stETH + 16.12 wstETH (~18.17 stETH). 1 pending withdrawal (5.0 stETH, not finalized). Earning ~3.45% APR (~0.003 ETH/day)."
}
```

**Implementation:** Multicall on Ethereum for stETH/wstETH/LDO/shares/withdrawal requests. Parallel L2 queries via separate public clients for each chain with wstETH balance > 0. Exchange rate from wstETH contract on mainnet. APR from protocol stats.

**Why this tool matters:** The hackathon brief says "an agent autonomously monitors and manages a staking position within human-set bounds." This tool gives the agent the full picture in one call — no need to chain 5+ separate balance/rewards/withdrawal queries. An agent can call this periodically and make decisions like "wrap stETH to wstETH because the user wants everything on L2" or "the withdrawal is finalized, claim it now."

**Requires wallet:** No (read operation)

---

## 6. dry_run Implementation

**Philosophy:** All write operations default to `dry_run: true`. An agent must explicitly set `dry_run: false` to broadcast. This is the #1 safety mechanism.

### Two Implementation Paths (by design)

**Path A: SDK-backed operations** (stake, wrap, unwrap, withdraw, claim)
- Uses the Lido SDK's built-in simulation capabilities
- SDK handles: allowance checks, share calculations, permit signing, gas estimation
- dry_run uses SDK's `populateTx` / callback-based gas estimation
- Execution uses SDK's full transaction lifecycle

**Path B: Direct viem operations** (governance only)
- Uses `executeOrSimulate` utility in `utils/dry-run.ts`
- dry_run calls `publicClient.simulateContract()` + `publicClient.estimateGas()`
- Execution calls `walletClient.writeContract()` after simulation

**Why two paths:** The Lido SDK doesn't cover Aragon governance. Building a custom simulation layer for SDK-covered operations would duplicate logic and create divergence risk (per system design review C2).

### dry_run Response Contract

Every write tool returns this shape when `dry_run: true`:

```typescript
interface DryRunResult {
  dry_run: true;
  success: boolean;          // Would the tx succeed?
  result: Record<string, any>; // Expected outcome (tokens received, etc.)
  gas_estimate: string;      // Gas units
  gas_cost_eth: string;      // Estimated cost in ETH (using current gas price)
  warnings: string[];        // Risk factors, approval needs, rate limit proximity
  summary: string;           // Human-readable one-liner
}
```

### dry_run Per-Tool Matrix

Every write tool's dry_run behavior, explicitly:

| Tool | dry_run Simulation Method | What It Checks | What It Returns |
|------|--------------------------|----------------|-----------------|
| `lido_stake` | SDK `stakeEth` with GAS_LIMIT callback abort | ETH balance ≥ amount + gas, stake limit not exceeded, staking not paused | Expected stETH, shares, gas cost |
| `lido_wrap` | SDK `wrapSteth` simulate + allowance check | stETH balance ≥ amount, allowance status | Expected wstETH, exchange rate, whether approval tx needed |
| `lido_unwrap` | SDK `unwrap` simulate | wstETH balance ≥ amount | Expected stETH, exchange rate |
| `lido_request_withdrawal` | SDK `requestWithdrawalWithPermit` simulate | Token balance ≥ amount, amount within 100 wei–1000 ETH, withdrawals not paused, permit signed | Expected request IDs, estimated wait time |
| `lido_claim_withdrawal` | SDK `claimRequests` simulate | All request IDs are finalized, caller is owner | ETH amounts per request, total claimable |
| `lido_cast_vote` | viem `simulateContract` on Voting.vote() | Vote is open, caller holds LDO, hasn't voted yet | Current tallies, quorum status |

### Gas Cost Calculation

dry_run fetches EIP-1559 fee data alongside the simulation:

```typescript
const fees = await publicClient.estimateFeesPerGas();
// fees = { maxFeePerGas, maxPriorityFeePerGas }
const gasCostWei = gasEstimate * fees.maxFeePerGas;
const gasCostEth = formatEther(gasCostWei);
```

Returns `gas_estimate` (units), `max_fee_gwei`, `gas_cost_eth` (readable ETH amount). Uses `estimateFeesPerGas()` (NOT legacy `eth_gasPrice`) for accurate EIP-1559 cost estimates.

---

## 7. Chain Configuration

### Supported Chains

| Chain | ID | Operations | wstETH Address |
|-------|-----|-----------|----------------|
| Ethereum Mainnet | 1 | All (stake, unstake, wrap, unwrap, governance, balance) | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| Holesky Testnet | 17000 | All (stake, unstake, wrap, unwrap, governance, balance) | `0x8d09a4502Cc8Cf1547aD300E066060D043f6982D` |
| Hoodi Testnet | 560048 | All (stake, unstake, wrap, unwrap, governance, balance) | `0x7E99eE3C66636DE415D2d7C880938F2f40f94De4` |
| Arbitrum One | 42161 | Balance only (wstETH) | `0x5979D7b546E38E414F7E9822514be443A4800529` |
| Optimism | 10 | Balance only (wstETH) | `0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb` |
| Base | 8453 | Balance only (wstETH) | `0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452` |
| Polygon PoS | 137 | Balance only (wstETH) | `0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD` |
| zkSync Era | 324 | Balance only (wstETH) | `0x703b52F2b28fEbcB60E1372858AF5b18849FE867` |
| Mantle | 5000 | Balance only (wstETH) | `0x458ed78EB972a369799fb278c0243b25e5242A83` |
| Linea | 59144 | Balance only (wstETH) | `0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F` |
| Scroll | 534352 | Balance only (wstETH) | `0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32` |
| Mode | 34443 | Balance only (wstETH) | `0x98f96A4B34D03a2E6f225B28b8f8Cb1279562d81` |
| BSC | 56 | Balance only (wstETH) | `0x26c5e01524d2E6280A48F2c50fF6De7e52E9611C` |
| Zircuit | 48900 | Balance only (wstETH) | `0xf0e673Bc224A8Ca3ff67a61605814666b1234833` |

### Mainnet Contract Addresses

| Contract | Address |
|----------|---------|
| Lido/stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` |
| wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| WithdrawalQueue | `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` |
| Aragon Voting | `0x2e59A20f205bB85a89C53f1936454680651E618e` |
| LDO Token | `0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32` |

### Holesky Contract Addresses (DEPRECATED — use Hoodi)

| Contract | Address |
|----------|---------|
| Lido/stETH | `0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034` |
| wstETH | `0x8d09a4502Cc8Cf1547aD300E066060D043f6982D` |
| WithdrawalQueue | `0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50` |
| Aragon Voting | `0xdA7d2573Df555002503F29aA4003e398d28cc00f` |
| LDO Token | `0x14ae7daeecdf57034f3E9db8564e46Dba8D97344` |

### Hoodi Contract Addresses (RECOMMENDED testnet)

| Contract | Address |
|----------|---------|
| Lido/stETH | `0x3508A952176b3c15387C97BE809eaffB1982176a` |
| wstETH | `0x7E99eE3C66636DE415D2d7C880938F2f40f94De4` |
| WithdrawalQueue | `0xfe56573178f1bcdf53F01A6E9977670dcBBD9186` |
| Aragon Voting | `0x49B3512c44891bef83F8967d075121Bd1b07a01B` |
| LDO Token | `0xEf2573966D009CcEA0Fc74451dee2193564198dc` |

### L2 Balance Queries

For L2 wstETH balance queries, the server creates a temporary `publicClient` for the target chain using viem's built-in chain definitions (which include reputable default RPCs). Users can optionally configure custom L2 RPCs via env vars (e.g., `ARBITRUM_RPC_URL`, `OPTIMISM_RPC_URL`) for reliability.

**Partial failure handling:** For `lido_get_position_overview` (which queries all L2s in parallel), a single L2 RPC failure does NOT fail the entire call. Failed chains return `{ "error": "RPC unreachable" }` while successful chains return normally. The `summary` notes which chains failed.

**Why L2 queries matter:** The hackathon brief says "Any L2 or mainnet accepted — wstETH is available on Base, Optimism, Arbitrum, and others." Cross-chain balance visibility is a differentiator.

### Default Chain: Hoodi (560048)

The server defaults to **Hoodi testnet** (`CHAIN_ID=560048`), not mainnet. Holesky is still supported but deprecated by Lido. When mainnet is explicitly selected, the server logs: `"⚠ Connected to Ethereum Mainnet — all transactions use REAL ETH."` This prevents accidental mainnet usage during development.

---

## 8. Provider Architecture

```typescript
// provider.ts — Factory function, NOT module-level singletons

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, holesky } from 'viem/chains';
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';

export interface Provider {
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  lidoSDK: LidoSDK;
  account: Account | null;
}

export function createProvider(config: Config): Provider {
  // Strict chain ID validation — reject unsupported chains immediately
  const SUPPORTED_CHAINS = { 1: mainnet, 17000: holesky, 560048: hoodi };
  const chain = SUPPORTED_CHAINS[config.chainId];
  if (!chain) {
    throw new Error(`Unsupported CHAIN_ID '${config.chainId}'. Supported: 1 (mainnet), 17000 (holesky), 560048 (hoodi).`);
  }

  // Private key format validation
  if (config.privateKey && !/^0x[a-fA-F0-9]{64}$/.test(config.privateKey)) {
    throw new Error('Invalid PRIVATE_KEY format. Must be a 66-character hex string starting with 0x.');
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1_000,
    }),
  });

  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : null;

  const walletClient = account
    ? createWalletClient({
        account,
        chain,
        transport: http(config.rpcUrl, {
          timeout: 30_000,
          retryCount: 3,
          retryDelay: 1_000,
        }),
      })
    : null;

  // Lido SDK — correct constructor params
  const lidoSDK = new LidoSDK({
    chainId: config.chainId,
    rpcUrls: [config.rpcUrl],
    web3Provider: walletClient,  // SDK expects web3Provider, not walletClient
  });

  // Scrub private key from process environment after loading
  if (process.env.PRIVATE_KEY) {
    delete process.env.PRIVATE_KEY;
  }

  return { publicClient, walletClient, lidoSDK, account };
}
```

**Key decisions:**
- **Factory function** — testable, no module-level side effects
- **Correct SDK params** — `rpcUrls` and `web3Provider`, not `publicClient`/`walletClient` (SDK API mismatch caught in system design review C1)
- **RPC timeout + retry** — 30s timeout, 3 retries with 1s delay. Prevents hung tool calls
- **Private key scrubbing** — `delete process.env.PRIVATE_KEY` after reading. Reduces exposure window
- **Startup validation** — `createProvider` called at server init, performs `eth_chainId` check to fail fast on bad RPC

---

## 9. Concurrency: Write Mutex

MCP servers can receive concurrent tool calls. Two simultaneous `lido_stake` calls from the same wallet would get the same nonce, causing one to fail.

```typescript
// utils/mutex.ts
class WriteMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

export const writeMutex = new WriteMutex();
```

All write tool handlers MUST use try/finally to guarantee release:

```typescript
await writeMutex.acquire();
try {
  // ... write operation
} finally {
  writeMutex.release();
}
```

**Without try/finally, a single exception permanently deadlocks all future write operations.** Read operations are not serialized.

---

## 10. Response Format

All tools return structured JSON for machine parsing, with a `summary` field for human readability.

```typescript
// utils/format.ts

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function success(data: Record<string, any>): ToolResponse {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
}

function error(message: string): ToolResponse {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: true, message }, null, 2)
    }],
    isError: true
  };
}
```

**Why JSON over markdown:** Agents can programmatically extract values (e.g., use `steth_received` from `lido_stake` as input to `lido_wrap`). Markdown requires regex parsing and breaks tool composability. The `summary` field provides the human-readable version.

---

## 11. ABI Strategy

Minimal ABIs — only functions we actually call. Each ABI file exports a `const` assertion for full viem type inference.

### Lido/stETH (for direct reads — SDK handles writes)
- `submit(address) payable returns (uint256)` — stake ETH
- `getSharesByPooledEth(uint256) view returns (uint256)` — share conversion
- `getPooledEthByShares(uint256) view returns (uint256)` — share conversion
- `sharesOf(address) view returns (uint256)` — share balance
- `getTotalPooledEther() view returns (uint256)` — TVL
- `getTotalShares() view returns (uint256)` — total shares
- `getCurrentStakeLimit() view returns (uint256)` — rate limit
- `getStakeLimitFullInfo() view returns (...)` — full limit info
- `balanceOf(address) view returns (uint256)` — stETH balance

### wstETH
- `getWstETHByStETH(uint256) view returns (uint256)` — rate query
- `getStETHByWstETH(uint256) view returns (uint256)` — rate query
- `stEthPerToken() view returns (uint256)` — exchange rate
- `balanceOf(address) view returns (uint256)` — wstETH balance

### WithdrawalQueue (reads only — SDK handles writes)
- `getWithdrawalStatus(uint256[]) view` — request status
- `getWithdrawalRequests(address) view returns (uint256[])` — list by owner
- `getLastFinalizedRequestId() view returns (uint256)` — queue state
- `getClaimableEther(uint256[],uint256[]) view returns (uint256[])` — claimable amounts

### Aragon Voting (full read + write — not covered by SDK)
- `vote(uint256,bool,bool)` — cast vote
- `getVote(uint256) view` — vote details (returns 10-field tuple)
- `getVoterState(uint256,address) view returns (uint8)` — how someone voted
- `votesLength() view returns (uint256)` — total vote count
- `canVote(uint256,address) view returns (bool)` — eligibility check

### ERC-20 (minimal)
- `balanceOf(address) view returns (uint256)` — for LDO + L2 wstETH queries
- `approve(address,uint256) returns (bool)` — for approvals if needed
- `allowance(address,address) view returns (uint256)` — for allowance checks

---

## 12. Skill File Design (lido.skill.md)

The skill file is served as an MCP **resource** (`lido://skill`). Agents read it before calling tools. It is NOT documentation — it is a **decision framework** written in second person, with explicit rules, disambiguation, and guardrails.

### Structure

1. **What is Lido** — One paragraph. Liquid staking. stETH = receipt token. Rewards accrue automatically.

2. **stETH vs wstETH decision table**
   - stETH: rebasing, balance grows daily, use for simple holdings
   - wstETH: non-rebasing, balance fixed, use for DeFi/bridging/L2s
   - "If the user is bridging to L2 or depositing into DeFi, ALWAYS wrap to wstETH first"

3. **Rebasing mechanics** — stETH balance changes daily. Shares are the stable unit. 1-2 wei rounding is normal.

4. **Hard rules (NEVER/ALWAYS)**
   - NEVER call `lido_claim_withdrawal` immediately after `lido_request_withdrawal`. Withdrawals take 1-5 days to finalize.
   - ALWAYS call `lido_get_balance` before `lido_stake` to verify the user has sufficient ETH.
   - ALWAYS use `dry_run: true` first, show the user the result, and ask for confirmation before setting `dry_run: false`.
   - NEVER try to "unstake" by calling `lido_unwrap` — unwrap converts wstETH→stETH, it does NOT return ETH. Use `lido_request_withdrawal` to get ETH back.
   - If the user says "unstake" or "withdraw", they mean `lido_request_withdrawal`, NOT `lido_unwrap`.

5. **Tool recipes**
   - Stake ETH: `lido_get_balance` → `lido_stake(dry_run)` → confirm → `lido_stake(execute)`
   - Full unstake: `lido_request_withdrawal(dry_run)` → confirm → `lido_request_withdrawal(execute)` → wait days → `lido_get_withdrawal_status` → `lido_claim_withdrawal`
   - Bridge-ready: `lido_stake` → `lido_wrap` → bridge wstETH to L2
   - Position check: `lido_get_position_overview` — single call to see everything (all chains, rewards, pending withdrawals)
   - Autonomous management: Call `lido_get_position_overview` → evaluate against user's stated bounds → take action (wrap, unstake, claim) with `dry_run` → present to user for approval

6. **Governance primer**
   - Need LDO tokens to vote. Main phase 3 days, objection phase 2 days.
   - 5% quorum + simple majority to pass.
   - Use `lido_list_votes(status: "open")` to find votable proposals.

7. **Risk awareness**
   - Slashing risk (extremely rare, Lido diversifies across operators)
   - stETH can trade below ETH peg temporarily
   - Staking has rate limits — check before large stakes

8. **Cross-chain notes**
   - stETH only exists on Ethereum. wstETH is bridged to L2s.
   - On L2s, only balance queries work. Staking/governance is Ethereum-only.

---

## 13. Error Handling

| Category | Example | Agent-facing JSON |
|----------|---------|-------------------|
| **Config** | Missing RPC_URL | `{ "error": true, "message": "ETHEREUM_RPC_URL not set. Add it to your env or .env file." }` |
| **Auth** | Missing PRIVATE_KEY for write | `{ "error": true, "message": "Write operations require PRIVATE_KEY. Set it in your env. Current mode: read-only." }` |
| **Validation** | Bad amount | `{ "error": true, "message": "Invalid amount 'abc'. Must be a positive decimal like '1.5'." }` |
| **Validation** | Negative amount | `{ "error": true, "message": "Amount must be positive. Got '-1'." }` |
| **Validation** | Zero amount | `{ "error": true, "message": "Amount must be greater than 0." }` |
| **Validation** | Scientific notation | `{ "error": true, "message": "Use decimal notation like '1.5', not '1e18'." }` |
| **Validation** | Comma in amount | `{ "error": true, "message": "Remove commas. Use '1000.5' not '1,000.5'." }` |
| **Validation** | Unit in amount | `{ "error": true, "message": "Provide number only. Use '1.5' not '1.5 ETH'." }` |
| **Validation** | Bad address | `{ "error": true, "message": "Invalid address '0x123'. Must be 42-char hex starting with 0x." }` |
| **Validation** | Negative vote_id | `{ "error": true, "message": "vote_id must be a non-negative integer." }` |
| **Validation** | Unknown chain | `{ "error": true, "message": "Unknown chain 'arbitrm'. Supported: ethereum, arbitrum, optimism, base, polygon, zksync, mantle, linea, scroll, mode, bsc, zircuit." }` |
| **Validation** | Exceeds tx limit | `{ "error": true, "message": "Amount 200 ETH exceeds MAX_TRANSACTION_ETH (100). Adjust limit or use smaller amount." }` |
| **Stake limit** | Protocol limit | `{ "error": true, "message": "Protocol stake limit exceeded. Current limit: 150,000 ETH (protocol-wide, not per-user)." }` |
| **Contract revert** | Staking paused | `{ "error": true, "message": "Transaction would revert: staking is currently paused." }` |
| **Balance** | Insufficient ETH | `{ "error": true, "message": "Insufficient ETH. Have: 0.5 ETH. Need: 1.0 ETH + ~0.003 ETH gas." }` |
| **Network** | RPC timeout | `{ "error": true, "message": "RPC request timed out after 30s. Check ETHEREUM_RPC_URL." }` |
| **Network** | Tx broadcast timeout | `{ "error": true, "message": "Tx broadcast but receipt not confirmed. Hash: 0x... Check block explorer." }` |
| **Withdrawal** | Bunker mode | `{ "error": true, "message": "Lido is in bunker mode. Withdrawals delayed. No requests currently claimable." }` |
| **Governance** | Dual gov blocked | `{ "error": true, "message": "Governance is in Blocked state (stETH veto active). Proposals cannot execute." }` |

All errors returned via `format.error()` with `isError: true` in MCP response.

---

## 14. Security Model

| Concern | Mitigation |
|---------|-----------|
| **Private key in memory** | Loaded from env var → `delete process.env.PRIVATE_KEY` after read. **Limitation:** the key persists in viem's `Account` object for the process lifetime — JavaScript cannot zero immutable strings. This is best-effort, not a security boundary. For high-value wallets, use a hardware signer. |
| **Accidental transactions** | **Server-side enforced two-step pattern**: the first call with any parameter set MUST be `dry_run: true`. The server stores a hash of params; `dry_run: false` is only accepted if a matching dry_run was executed within the last 5 minutes. This prevents agents from bypassing dry_run. |
| **Transaction limits** | `MAX_TRANSACTION_ETH` env var (default: 100 ETH). Any single write operation above this is rejected. `MAX_DAILY_SPEND_ETH` env var (default: 500 ETH) for cumulative daily limit. Configurable per deployment. |
| **Accidental mainnet** | Default chain is Hoodi testnet. Mainnet requires explicit `CHAIN_ID=1` + startup warning. |
| **Input injection** | All inputs validated through zod/v4 schemas with `.regex()` refinements. Amounts: positive decimal only. Addresses: 42-char hex. Vote IDs: non-negative integers. |
| **Excessive spending** | Human-readable amounts ("1.5" ETH), not raw wei. Transaction limits enforce caps. |
| **Nonce conflicts** | Write operations serialized through mutex with mandatory `try/finally` on `release()`. |
| **Approval safety** | Use `WithPermit` SDK methods (EIP-2612) — single-use, deadline-bound. For wrap: `approveStethForWrap` with **exact amount** (not unlimited). If approval succeeds but main tx fails, response includes the approval tx hash and notes the outstanding allowance. |
| **Approve frontrunning** | Permit eliminates the approve frontrun vector. For any fallback `approve` path: always `approve(spender, 0)` first, then `approve(spender, exactAmount)`. |
| **Config file key leak** | `.env.example` documents `PRIVATE_KEY` but `.gitignore` blocks `.env`. README warns: "NEVER hardcode PRIVATE_KEY in MCP client config files — use shell environment variables." |
| **RPC trust** | The RPC endpoint is a fully trusted component. Document: "A compromised RPC can manipulate data and censor transactions. Use your own authenticated RPC (Alchemy/Infura), never a public endpoint for mainnet." |
| **Rate limiting** | Write operations: max 1 per 10 seconds. `lido_get_position_overview`: max 1 per 30 seconds. Global RPC budget: max 500 calls per minute. Prevents agent loops from exhausting RPC quota. |

---

## 15. Build & Configuration Files

### package.json

```json
{
  "name": "lido-mcp",
  "version": "0.1.0",
  "description": "MCP server for Lido liquid staking — stake, unstake, wrap, governance, all from AI agents",
  "type": "module",
  "bin": { "lido-mcp": "./dist/index.js" },
  "main": "./dist/index.js",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup && chmod +x dist/index.js",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "inspect": "npm run build && npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "files": ["dist", "lido.skill.md"],
  "dependencies": {
    "@modelcontextprotocol/server": "^1.12.0",
    "@lidofinance/lido-ethereum-sdk": "^4.0.0",
    "viem": "^2.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  clean: true,
  dts: false,
  // Externalize node_modules — npx resolves deps from published package
  external: [
    '@modelcontextprotocol/server',
    '@lidofinance/lido-ethereum-sdk',
    'viem',
    'zod',
  ],
});
```

### .env.example

```bash
# Required: JSON-RPC endpoint (Alchemy, Infura, etc.)
# IMPORTANT: Use your own authenticated RPC, never a public endpoint for mainnet
ETHEREUM_RPC_URL=https://eth-hoodi.g.alchemy.com/v2/YOUR_KEY

# Required for write operations (stake, wrap, vote, etc.)
# NEVER hardcode this in MCP client config files — use shell env vars
# Leave empty for read-only mode
PRIVATE_KEY=

# Chain ID: 560048 = Hoodi (default), 17000 = Holesky (deprecated), 1 = Mainnet
CHAIN_ID=560048

# Transaction safety limits (optional)
MAX_TRANSACTION_ETH=100
MAX_DAILY_SPEND_ETH=500
```

### .gitignore

```
node_modules/
dist/
.env
*.log
```

---

## 16. Testing Strategy

| Layer | Tool | What |
|-------|------|------|
| **Smoke test** | MCP Inspector | `npm run inspect` — verify all tools list, call `lido_status`, call `lido_get_protocol_info` |
| **Manual integration** | Holesky testnet | Stake 0.01 ETH, wrap, request withdrawal, check balances, cast a vote |
| **dry_run verification** | Any chain | Every write tool tested with `dry_run: true` against mainnet — verifies simulation without spending |

**Why no unit test framework:** This is a hackathon project. The value is in real on-chain integration, not mocked unit tests. The `inspect` script + Holesky manual testing provides higher signal than 50 mocked tests that pass but never touch a real contract.

---

## 17. Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | Required by Lido SDK |
| Language | TypeScript (strict mode) | Type safety for contract interactions |
| MCP SDK | `@modelcontextprotocol/server` | Official MCP server framework — `McpServer` + `StdioServerTransport` |
| Ethereum | viem | Lightweight, type-safe, `simulateContract` for dry_run |
| Lido | `@lidofinance/lido-ethereum-sdk` | Official SDK — stake, wrap, withdraw with approval handling |
| Validation | zod/v4 | MCP SDK requires `zod/v4` for JSON Schema conversion in `server.registerTool` |
| Build | tsup | Fast bundler, shebang injection, ESM output |
| Transport | stdio | Standard MCP transport |

---

## 18. MCP Server Registration Pattern

```typescript
// server.ts — Tool registration with zod/v4 schemas

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const server = new McpServer({
  name: 'lido-mcp',
  version: '0.1.0',
}, {
  capabilities: { logging: {} }
});

// Register skill file as a resource (registerResource, NOT resource)
server.registerResource(
  'lido-skill',
  'lido://skill',
  {
    title: 'Lido Skill File',
    description: 'Agent mental model for Lido liquid staking protocol',
    mimeType: 'text/markdown',
  },
  async (uri) => ({
    contents: [{ uri: uri.href, text: skillFileContent }]
  })
);

// Example tool registration (handler receives destructured params)
server.registerTool('lido_stake', {
  title: 'Stake ETH',
  description: 'Stake ETH to receive stETH via Lido. Requires wallet. Returns stETH received and shares. Use dry_run=true (default) to simulate first.',
  inputSchema: z.object({
    amount: z.string()
      .regex(/^\d+\.?\d*$/, 'Must be a positive decimal number like "1.5"')
      .describe('Amount of ETH to stake, e.g. "1.5"'),
    referral_address: z.string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address')
      .optional()
      .describe('Optional referral address'),
    dry_run: z.boolean().default(true).describe('Simulate without broadcasting (default: true)')
  })
}, async ({ amount, referral_address, dry_run }, ctx) => {
  // ... handler implementation
});
```

**Key MCP patterns:**
- Import from `@modelcontextprotocol/server` (NOT `@modelcontextprotocol/sdk/server`)
- Use `zod/v4` (NOT `zod`) — required by the latest MCP SDK for JSON Schema conversion
- Use `server.registerTool()` and `server.registerResource()` (NOT `server.tool()` or `server.resource()` — those are removed)
- Handler receives destructured params directly, not an `args` object
- Add `title` field on tools for better MCP client listing UX
- All logging goes to `console.error` or MCP logging capability — NEVER `console.log` (corrupts stdio protocol stream)
- Input validation via zod `.regex()` / `.refine()` catches malformed inputs at the schema level

---

## 19. Startup Flow

```
1. Load .env file (if exists, using Node 20 --env-file or dotenv)
2. Parse config from environment variables:
   - ETHEREUM_RPC_URL: required, must be non-empty URL
   - PRIVATE_KEY: optional, validated as 66-char hex (0x + 64 hex chars)
   - CHAIN_ID: optional, must be 1 | 17000 | 560048, default 560048 (Hoodi)
   - MAX_TRANSACTION_ETH: optional, default 100
   - MAX_DAILY_SPEND_ETH: optional, default 500
3. Validate all config values (fail immediately with clear errors)
4. Create provider (createProvider factory)
5. Verify RPC connectivity: eth_chainId check
6. Verify RPC chain ID matches configured CHAIN_ID
7. Check for pending transactions (eth_getTransactionCount pending vs latest)
8. Log startup info (to stderr, NOT stdout):
   - Chain name + ID
   - Wallet address (if configured) or "read-only mode"
   - "⚠ MAINNET — all transactions use REAL ETH" warning if chainId=1
   - Transaction limits (MAX_TRANSACTION_ETH, MAX_DAILY_SPEND_ETH)
9. Register all tools + resources
10. Connect stdio transport
11. Ready for tool calls
```

**Fail fast:** If RPC is unreachable, chain ID doesn't match, or config is invalid, the server exits with a clear error before accepting any tool calls.

**RPC failure during write operations:** If a write transaction is broadcast but the receipt times out, the response ALWAYS includes the `tx_hash` (captured at broadcast time) and guidance: "Transaction broadcast (hash: 0x...) but receipt not confirmed. Check on a block explorer."

---

## 20. Non-Goals (v1)

- **Historical rewards tracking** — Requires subgraph indexing. Out of scope.
- **Multi-wallet support** — One private key per instance. Multiple wallets = multiple instances.
- **Custom gas parameters** — No gas price overrides. EIP-1559 fee estimation is automatic.
- **Withdrawal NFT trading** — The NFT is a claim ticket, not a tradeable asset.
- **L2 write operations** — Staking/governance are mainnet-only. L2 wstETH is a standard ERC-20.
- **Easy Track motions** — Only Aragon on-chain voting in v1. Easy Track is a v2 feature.
- **Hardware wallet / KMS** — v1 uses raw private key. Hardware signer / WalletConnect / AWS KMS is v2.
- **ENS resolution** — Addresses must be hex format. ENS name resolution is v2.

## 21. Known Limitations (documented for transparency)

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| Private key in process memory | Key accessible for process lifetime via viem Account object | Use low-value wallets. v2: hardware signer support. |
| dry_run ≠ execution guarantee | State can change between dry_run and execution (rebase, gas spike, balance change) | dry_run responses include caveat: "point-in-time estimate" |
| L2 RPCs are best-effort | Default public RPCs may be slow, rate-limited, or return stale data | Users can configure custom L2 RPCs via env vars |
| APR is approximate | Computed from last `TokenRebased` event, not a moving average | For precise APR, use the Lido API directly |
| Holesky deprecated | Lido has deprecated Holesky in favor of Hoodi | Default is Hoodi. Holesky still supported with warning. |
| getVote returns 11 fields | Lido's modified Aragon Voting adds `phase` as 11th return value | ABI includes all 11 fields |
| Voting periods are governance-set | 3+2 day periods are current values, not protocol constants | Could change via DAO vote |
