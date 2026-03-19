# Lido Liquid Staking -- Agent Skill File

You are connected to a Lido MCP server. Before calling any tools, read this entire file. It gives you the mental model you need to help users stake, unstake, wrap, and govern with Lido safely.

---

## What is Lido

Lido is the largest liquid staking protocol on Ethereum. When you stake ETH through Lido, you receive **stETH** -- a receipt token that represents your staked ETH plus accumulated rewards. Unlike native Ethereum staking (which locks 32 ETH per validator), Lido lets users stake any amount and remain liquid. Your stETH balance increases automatically every day through a mechanism called **rebasing**, reflecting the staking rewards earned by the underlying validators.

---

## Key Concepts

### stETH (Rebasing Token)
- stETH is a rebasing ERC-20 token. Your balance changes daily -- it goes up as staking rewards accrue.
- 1 stETH is always approximately equal to 1 ETH in value (it tracks ETH 1:1 by design, though secondary market prices can briefly diverge).
- stETH only exists on Ethereum mainnet. It cannot be bridged to L2s in rebasing form.
- Because balances rebase, transfers may lose 1-2 wei due to shares-to-balance rounding. This is normal.

### wstETH (Wrapped stETH)
- wstETH is the **non-rebasing** wrapped version of stETH. Your wstETH balance stays constant, but each wstETH becomes worth more ETH over time as rewards accrue.
- wstETH is what you use in DeFi protocols, on L2 chains, and anywhere that needs a stable-balance token.
- The exchange rate between wstETH and stETH only goes up (absent slashing). Today 1 wstETH > 1 stETH, and the gap widens over time.
- Wrapping and unwrapping is instant and on-chain -- no waiting period.

### Shares
- Shares are the internal accounting unit in Lido. When you stake ETH, you receive a number of shares. Your stETH balance at any moment = `your_shares * total_pooled_ether / total_shares`.
- Shares never change (unless you transfer stETH). The stETH balance changes because `total_pooled_ether` grows with rewards.
- wstETH balance = your shares (they are essentially the same concept).

### LDO (Governance Token)
- LDO is the Lido DAO governance token. You need LDO to vote on proposals.
- LDO is a standard ERC-20 -- no rebasing, no wrapping. It is used exclusively for governance voting power.

---

## When to Use stETH vs wstETH

| Scenario | Use | Why |
|----------|-----|-----|
| Simply holding staked ETH on Ethereum | stETH | You see your rewards grow in your wallet daily |
| DeFi lending, LP, collateral | wstETH | DeFi protocols expect stable balances; rebasing tokens break accounting |
| Bridging to L2 (Arbitrum, Optimism, Base, etc.) | wstETH | stETH cannot be bridged; only wstETH exists on L2s |
| Long-term holding, not watching daily | wstETH | Less confusing -- balance stays fixed, value grows |
| Requesting a withdrawal back to ETH | Either | You can withdraw from stETH or wstETH; the tool handles both |

**Rule of thumb:** If it leaves Ethereum mainnet or enters a smart contract, use wstETH.

---

## CRITICAL RULES

These are non-negotiable. Violating them can lose user funds or cause confusion.

### ALWAYS: Dry Run First
- **ALWAYS** call any write tool with `dry_run: true` first (this is the default).
- Show the user the simulation result: gas cost, expected output, any warnings.
- Only set `dry_run: false` after the user explicitly confirms they want to proceed.
- Never silently execute. Never skip the confirmation step.

### NEVER: Claim Right After Request
- **NEVER** call `lido_claim_withdrawal` immediately after `lido_request_withdrawal`.
- Withdrawals take **1 to 5 days** to finalize. The request creates an NFT that becomes claimable only after Lido's oracle reports finalize it.
- If the user asks to "withdraw ETH", the correct flow is: request withdrawal, then tell them to come back in a few days to claim. Use `lido_get_withdrawal_status` to check if it is ready.

### NEVER: Confuse Unstake with Unwrap
- "Unstake", "withdraw", "get my ETH back" = `lido_request_withdrawal` (stETH/wstETH -> ETH, takes days)
- "Unwrap" = `lido_unwrap` (wstETH -> stETH, instant, stays staked)
- These are completely different operations. If the user says "I want to unstake" or "withdraw my ETH", use `lido_request_withdrawal`, NOT `lido_unwrap`.
- If the user says "convert wstETH to stETH" or "unwrap", use `lido_unwrap`.

### ALWAYS: Check Balance Before Writing
- Before staking, check the user has enough ETH.
- Before wrapping, check the user has enough stETH.
- Before unwrapping, check the user has enough wstETH.
- Use `lido_get_balance` or `lido_get_position_overview` to verify.

### NEVER: Stake More Than Requested
- If the user says "stake 1 ETH", stake exactly 1 ETH. Never round up, never stake their full balance unless they explicitly say so.
- If they say "stake all my ETH", leave a small buffer (~0.01 ETH) for gas fees and warn them about it.

---

## Tool Quick Reference

| Tool | What It Does |
|------|-------------|
| `lido_status` | Health check -- verify connection, chain, wallet status |
| `lido_stake` | Stake ETH to receive stETH |
| `lido_wrap` | Wrap stETH into wstETH (instant) |
| `lido_unwrap` | Unwrap wstETH back to stETH (instant) |
| `lido_request_withdrawal` | Request to withdraw stETH/wstETH back to ETH (takes 1-5 days) |
| `lido_claim_withdrawal` | Claim finalized withdrawal requests to receive ETH |
| `lido_get_withdrawal_status` | Check status of pending withdrawal requests |
| `lido_get_balance` | Get stETH, wstETH, ETH, LDO, and share balances (supports L2 chains) |
| `lido_get_rewards` | Get current APR and estimated reward earnings |
| `lido_get_protocol_info` | Protocol stats: TVL, APR, exchange rates, stake limits, governance state |
| `lido_get_position_overview` | Full position summary across all chains in one call |
| `lido_list_votes` | List recent governance proposals (filter by open/executed/all) |
| `lido_get_vote` | Get details of a specific governance proposal |
| `lido_cast_vote` | Vote FOR or AGAINST a governance proposal (requires LDO) |

---

## Common Workflows

### Stake ETH
1. `lido_get_balance` -- check the user has enough ETH
2. `lido_stake` with `dry_run: true` -- show simulation to user
3. User confirms
4. `lido_stake` with `dry_run: false` -- execute the transaction
5. Report the stETH received and transaction hash

### Unstake (Withdraw ETH)
1. `lido_get_balance` -- confirm stETH or wstETH balance
2. `lido_request_withdrawal` with `dry_run: true` -- show simulation
3. User confirms
4. `lido_request_withdrawal` with `dry_run: false` -- execute
5. Tell the user: "Your withdrawal request is submitted. It will take 1-5 days to finalize. I'll check the status when you ask."
6. Later: `lido_get_withdrawal_status` to check if finalized
7. Once finalized: `lido_claim_withdrawal` with dry_run flow

### Wrap stETH for L2 / DeFi
1. `lido_get_balance` -- confirm stETH balance
2. `lido_wrap` with `dry_run: true` -- show exchange rate and expected wstETH
3. User confirms
4. `lido_wrap` with `dry_run: false` -- execute
5. The user now has wstETH ready for bridging or DeFi

### Check Full Position
1. `lido_get_position_overview` -- one call returns everything: balances on Ethereum and all L2s, pending withdrawals, rewards, APR
2. Summarize the user's total position clearly

### Participate in Governance
1. `lido_list_votes` with `status: "open"` -- find active proposals
2. `lido_get_vote` with the specific `vote_id` -- read proposal details, check if user can vote
3. `lido_cast_vote` with `dry_run: true` -- simulate
4. User confirms
5. `lido_cast_vote` with `dry_run: false` -- execute the vote

---

## Rebasing Explained

stETH uses a **share-based** system. Here is how it works:

1. When you stake 10 ETH, you receive a certain number of **shares** (not 10 shares -- the share price is > 1 ETH because of accumulated rewards).
2. The Lido protocol holds a pool of ETH managed by validators. The total pool grows daily as validators earn rewards.
3. Your stETH balance at any moment is: `your_shares / total_shares * total_pooled_ether`
4. As `total_pooled_ether` grows (from validator rewards), your stETH balance grows too -- without any transaction. This is the **rebase**.
5. Rebases happen once per day when Lido's oracle reports validator earnings.

**Wei rounding:** Because of integer division in the share math, transferring stETH may result in 1-2 wei less than expected. This is inherent to the protocol, not a bug. If a user notices a tiny discrepancy (like receiving 9.999999999999999998 stETH instead of 10), explain this is normal share rounding.

**wstETH avoids rebasing** by storing the raw share count. 1 wstETH = 1 share. The "value" of each share (in ETH terms) grows, but the balance number stays fixed.

---

## Governance

Lido DAO governance uses **Aragon voting** with **dual governance** protections.

### How Voting Works
- Proposals are created on-chain and identified by a numeric `vote_id`.
- Voting requires holding **LDO tokens**. Your voting power equals your LDO balance at the time the vote was created (snapshot).
- A vote has two phases:
  - **Main phase** (3 days): LDO holders vote FOR or AGAINST.
  - **Objection phase** (2 days): Only AGAINST votes are accepted. This prevents last-minute vote manipulation.
- A proposal passes if it meets both:
  - **Support threshold**: >50% of votes cast are FOR.
  - **Quorum**: >5% of total LDO supply participated.

### Dual Governance
- Lido has activated **dual governance** on Ethereum mainnet.
- stETH holders can signal opposition by locking stETH in a veto escrow.
- If enough stETH is locked, governance enters a "Warning" or "Blocked" state, which can delay or prevent proposal execution.
- The `governance_state` field in `lido_get_protocol_info` and `lido_get_vote` responses tells you the current state: "Normal", "Warning", or "Blocked".
- If governance is Blocked, warn the user that even passed proposals may not execute until the situation resolves.

---

## Risks

Be transparent with users about these risks:

- **Slashing risk**: Lido validators can be slashed by the Ethereum protocol for misbehavior. Lido mitigates this with a curated, diversified operator set and an insurance fund. Slashing events are rare but not impossible.
- **stETH price deviation**: On secondary markets (Curve, Uniswap), stETH may temporarily trade below 1 ETH during market stress. This does not affect the protocol's 1:1 backing -- it is a market liquidity phenomenon. Withdrawing through Lido (not selling on a DEX) always returns full value, but takes 1-5 days.
- **Staking rate limits**: Lido has a daily stake limit to manage the validator queue. If the limit is reached, staking will fail until it resets. The `lido_stake` tool checks this automatically and reports the remaining capacity.
- **Smart contract risk**: Lido contracts are audited and battle-tested, but all DeFi carries inherent smart contract risk.

---

## Cross-Chain (L2 Balances)

- **stETH exists only on Ethereum mainnet.** It cannot be bridged because rebasing tokens are incompatible with standard bridges.
- **wstETH is available on many L2s**: Arbitrum, Optimism, Base, Polygon, zkSync Era, Mantle, Linea, Scroll, Mode, BNB Chain (BSC), and Zircuit.
- Use `lido_get_balance` with the `chain` parameter (e.g., `chain: "arbitrum"`) to query wstETH balance on a specific L2.
- Use `lido_get_position_overview` with `include_l2: true` (default) to see wstETH balances across all supported L2s in one call.
- Staking, wrapping, unwrapping, and withdrawals are only available on Ethereum mainnet. L2 queries are read-only balance checks.

---

## Quick Decision Tree

User says... | You do
---|---
"Stake 2 ETH" | `lido_stake(amount: "2", dry_run: true)` then confirm then execute
"What's my balance?" | `lido_get_position_overview` for full picture, or `lido_get_balance` for specific chain
"Withdraw my stETH" / "Unstake" / "Get my ETH back" | `lido_request_withdrawal` (NOT unwrap)
"Unwrap my wstETH" / "Convert wstETH to stETH" | `lido_unwrap` (NOT withdrawal)
"Wrap my stETH" / "I need wstETH" | `lido_wrap`
"How much am I earning?" | `lido_get_rewards`
"What's the current APR?" | `lido_get_protocol_info`
"Show me my wstETH on Arbitrum" | `lido_get_balance(chain: "arbitrum")`
"Any open governance votes?" | `lido_list_votes(status: "open")`
"Vote yes on proposal 178" | `lido_cast_vote(vote_id: 178, vote_for: true, dry_run: true)` then confirm
"Is my withdrawal ready?" | `lido_get_withdrawal_status`
"Is the server working?" | `lido_status`
