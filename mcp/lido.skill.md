# Lido Liquid Staking -- Agent Skill File

You are connected to a Lido MCP server with 67 tools spanning staking, wrapping, withdrawals, governance, stVaults (V3), and more. Before calling any tools, read this entire file. It gives you the mental model you need to help users stake, unstake, wrap, manage staking vaults, and govern with Lido safely.

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

### stVaults (Lido V3)
- stVaults are modular staking vaults introduced in Lido V3. Each vault is independently managed by an owner and node operator.
- Vaults hold ETH, stake it via beacon chain deposits, and can mint stETH against collateral through VaultHub.
- VaultHub is the central registry that tracks all vaults, enforces collateralization rules, and coordinates minting/burning.
- Vaults have health status — an unhealthy vault may be subject to forced rebalancing.
- Use `lido_list_vaults` to browse, `lido_get_vault` for details, and `lido_vault_fund`/`lido_vault_withdraw` to manage.

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

### Safe Staking Patterns
- Before a large stake (>10 ETH), check `lido_get_staking_limit` to verify protocol capacity. The stake limit is protocol-wide and regenerates over blocks.
- When staking all ETH, always keep a **0.01-0.05 ETH buffer** for future gas fees. Tell the user: "I'm keeping 0.02 ETH for gas."
- After staking, the stETH balance may show 1-2 wei less than the ETH deposited. This is normal share rounding, not lost funds.
- stETH balance will appear to "drop" slightly right before the daily rebase (oracle report). It hasn't dropped — the rebase just hasn't happened yet. Don't alarm the user.
- If `isStakingPaused` returns true, staking is temporarily halted. Don't retry — inform the user and suggest checking back later.
- For large positions, recommend wrapping to wstETH — it avoids the psychological confusion of rebasing balances and is safer for DeFi integrations.
- Never recommend swapping stETH for ETH on a DEX during market stress. The protocol withdrawal queue always returns full value (1:1), even if the DEX price shows a discount. The trade-off is waiting 1-5 days.

### Rebasing Gotchas for Agents
- Do NOT compare stETH balances across different blocks/timestamps and conclude funds were lost. The balance changes with every rebase.
- When computing "profit", compare shares (which are stable) rather than stETH balances (which rebase). Use `lido_get_balance` which returns both.
- wstETH-to-stETH exchange rate only goes UP (barring a slashing event). If a user asks "did I lose money on wstETH?", the answer is almost certainly no — check the rate with `lido_get_exchange_rates`.
- Negative rebases (stETH balance going down) are extremely rare and only happen during mass slashing events. If one occurs, explain calmly — it is a known risk, not a hack.

### wstETH vs stETH: Deeper Tradeoffs
- **Tax implications**: In some jurisdictions, daily rebasing (stETH balance increasing) may be treated as a taxable event. wstETH avoids this because the balance doesn't change — only the exchange rate moves. This is NOT tax advice, but worth mentioning if the user asks.
- **Smart contract compatibility**: Many DeFi protocols (Aave, Maker, Uniswap) support wstETH but NOT stETH, precisely because rebasing breaks their accounting. Always recommend wstETH for DeFi.
- **Bridging**: stETH CANNOT be bridged to L2. If someone bridges stETH, the rewards go to the bridge contract and are permanently locked. Always wrap to wstETH before bridging. This is a critical safety rule.
- **Conversion is lossless**: Wrapping stETH → wstETH and unwrapping back preserves value exactly (minus 1-2 wei for rounding). There is no fee, no slippage, no cost beyond gas. Users should not hesitate to wrap/unwrap.

---

## Tool Reference (by Category)

### ↗ Staking
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_stake` | write | Stake ETH → receive stETH |
| `lido_stake_and_wrap` | write | Stake ETH → receive wstETH (one tx, more gas efficient) |
| `lido_get_staking_limit` | read | Current protocol-wide staking capacity |
| `lido_is_staking_paused` | read | Quick check: is staking open? |
| `lido_get_beacon_stats` | read | Validator stats: deposited, active, beacon balance |

### ⇄ Wrapping
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_wrap` | write | stETH → wstETH (instant, on-chain, no fee) |
| `lido_unwrap` | write | wstETH → stETH (instant, on-chain, no fee) |

### ↩ Withdrawals
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_request_withdrawal` | write | Request ETH withdrawal from stETH/wstETH (takes 1-5 days) |
| `lido_claim_withdrawal` | write | Claim finalized withdrawal requests → receive ETH |
| `lido_claim_single_withdrawal` | write | Claim one specific withdrawal request (simpler) |
| `lido_get_withdrawal_status` | read | Check status of specific withdrawal request IDs |
| `lido_get_withdrawal_requests` | read | List all withdrawal request IDs for an address |
| `lido_get_withdrawal_queue_info` | read | Protocol-level queue: depth, pending, locked ETH, bunker mode |
| `lido_get_claimable_ether` | read | How much ETH is claimable for specific request IDs |
| `lido_is_bunker_mode` | read | Is the protocol in emergency bunker mode? |

### 🪙 Tokens & Balances
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_get_balance` | read | ETH + stETH + wstETH + LDO + shares for an address |
| `lido_transfer` | write | Transfer stETH, wstETH, or shares to another address |
| `lido_transfer_ldo` | write | Transfer LDO governance tokens |
| `lido_approve` | write | Approve stETH/wstETH/LDO spending for a contract |
| `lido_revoke_all_approvals` | write | Revoke stETH + wstETH approvals for a spender |
| `lido_get_allowance` | read | Check token allowance for a specific spender |
| `lido_get_all_allowances` | read | Check allowances for all common Lido spenders |
| `lido_convert` | read | Convert between ETH ↔ stETH ↔ wstETH ↔ shares |
| `lido_get_exchange_rates` | read | Current stETH/wstETH exchange rate + share rate |
| `lido_get_token_info` | read | Token metadata: name, symbol, decimals, totalSupply |

### 💎 Rewards
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_get_rewards` | read | APR, projected daily/monthly/yearly rewards for an address |

### 📊 Position & Portfolio
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_summary` | read | **The god tool** — everything about an address in one call |
| `lido_get_position_overview` | read | Balances + L2 wstETH + pending withdrawals + rewards |
| `lido_get_l2_balances` | read | wstETH balances across all supported L2 chains |

### 🏛 Governance (Aragon Voting)
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_cast_vote` | write | Vote FOR or AGAINST a proposal (requires LDO) |
| `lido_delegate` | write | Delegate your voting power to another address |
| `lido_list_votes` | read | List recent proposals (filter: all/open/executed) |
| `lido_get_vote` | read | Get vote tallies and status for a specific proposal |
| `lido_get_vote_details` | read | **Deep dive** — decoded on-chain actions + IPFS description |
| `lido_can_vote` | read | Can a specific address vote on a proposal? |
| `lido_get_voter_state` | read | How did an address vote? (absent/yea/nay) |

### ⚡ Easy Track
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_get_easy_track_motions` | read | List active Easy Track motions with time remaining |
| `lido_object_to_motion` | write | Object to a motion (uses stETH, NOT LDO) |

### 🛡 Dual Governance
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_get_dual_governance_state` | read | Current state: Normal / VetoSignalling / Blocked / RageQuit |
| `lido_get_governance_overview` | read | Full governance landscape: DG state + links |

### 🏗 stVaults (V3)
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_list_vaults` | read | List staking vaults from VaultHub (paginated, shows connected/healthy/value) |
| `lido_get_vault` | read | Full vault details — owner, operator, depositor, value, locked, credentials |
| `lido_get_vault_hub_stats` | read | VaultHub overview — total vault count and addresses |
| `lido_vault_fund` | write | Deposit ETH into a staking vault |
| `lido_vault_withdraw` | write | Withdraw ETH from a vault to a recipient |
| `lido_vault_pause_deposits` | write | Pause beacon chain deposits for a vault |
| `lido_vault_resume_deposits` | write | Resume beacon chain deposits for a vault |

### ⬢ Protocol Infrastructure
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_get_protocol_info` | read | TVL, shares, rates, limits, fee, paused state |
| `lido_get_protocol_fee` | read | Current protocol fee in basis points |
| `lido_get_staking_modules` | read | List staking modules (Curated, SimpleDVT, CSM) |
| `lido_get_node_operators` | read | Count of node operators |
| `lido_get_contract_addresses` | read | All protocol contract addresses for current chain |
| `lido_get_supported_chains` | read | All supported chains + L2 wstETH addresses |

### ⚙ System
| Tool | Type | What It Does |
|------|------|-------------|
| `lido_status` | read | Health check: chain, wallet, block number |
| `lido_prepare_transaction` | write | Encode tx calldata for browser wallet signing |

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

### Get Complete Position Summary
1. `lido_summary` -- one call returns EVERYTHING: balances, staking, rewards, withdrawals, allowances, governance, protocol stats
2. Use this as the first call when a user asks "what's my position?" or "show me everything"

### Monitor Easy Track
1. `lido_get_easy_track_motions` -- shows all active motions with time remaining and objection status
2. If a motion looks objectionable: `lido_object_to_motion` (requires stETH, not LDO -- different from Aragon voting)
3. Easy Track motions auto-pass after 72 hours unless 0.5% of stETH objects

### Check Dual Governance Health
1. `lido_get_dual_governance_state` -- returns Normal, VetoSignalling, VetoCooldown, or RageQuit
2. If state is NOT Normal, warn the user that governance proposals may be delayed or blocked
3. This is critical context before voting or expecting proposal execution

### Stake and Wrap in One Transaction
1. `lido_stake_and_wrap` -- sends ETH directly to the wstETH contract
2. More gas-efficient than staking then wrapping separately
3. Useful when the user wants wstETH directly (for DeFi or bridging)

### Manage a Staking Vault (V3)
1. `lido_get_vault_hub_stats` -- check how many vaults exist
2. `lido_list_vaults` -- browse vaults, find one by address or index
3. `lido_get_vault` -- inspect a specific vault: owner, operator, health, value, locked ETH
4. `lido_vault_fund` with `dry_run: true` -- simulate depositing ETH
5. User confirms → `lido_vault_fund` with `dry_run: false` -- execute
6. Monitor: `lido_get_vault` periodically to check health and value

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
"Stake 2 ETH" | `lido_stake(amount: "2", dry_run: true)` → confirm → execute
"Get me wstETH" | `lido_stake_and_wrap(amount: "2")` — one tx, more efficient
"What's my balance?" | `lido_summary` for everything, or `lido_get_balance` for basics
"Show me everything" | `lido_summary` — the god tool
"Withdraw my stETH" / "Unstake" / "Get ETH back" | `lido_request_withdrawal` (NOT unwrap!)
"Unwrap my wstETH" / "Convert wstETH to stETH" | `lido_unwrap` (NOT withdrawal!)
"Wrap my stETH" / "I need wstETH" | `lido_wrap`
"How much am I earning?" | `lido_get_rewards`
"What's the current APR?" | `lido_get_protocol_info`
"Show my wstETH on Arbitrum" | `lido_get_balance(chain: "arbitrum")`
"Show all my L2 balances" | `lido_get_l2_balances`
"Any open governance votes?" | `lido_list_votes(status: "open")`
"Tell me about proposal 198" | `lido_get_vote_details(vote_id: 198)` — gets IPFS description
"Vote yes on proposal 178" | `lido_cast_vote(vote_id: 178, vote_for: true, dry_run: true)` → confirm
"Any Easy Track motions?" | `lido_get_easy_track_motions`
"Is governance blocked?" | `lido_get_dual_governance_state`
"Is my withdrawal ready?" | `lido_get_withdrawal_status`
"Convert 5 stETH to wstETH amount" | `lido_convert(from: "stETH", to: "wstETH", amount: "5")`
"Send 1 stETH to 0x..." | `lido_transfer(token: "stETH", to: "0x...", amount: "1")`
"Is the server working?" | `lido_status`
"Can I still stake?" | `lido_is_staking_paused` + `lido_get_staking_limit`
"Show me vaults" / "List staking vaults" | `lido_list_vaults`
"Tell me about vault 0xABC..." | `lido_get_vault(vault_address: "0xABC...")`
"Fund vault with 10 ETH" | `lido_vault_fund(vault_address: "0x...", amount: "10", dry_run: true)` → confirm
