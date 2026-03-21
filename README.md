# Lido MCP

> The most comprehensive MCP server for Ethereum liquid staking. Stake, wrap, govern, and manage staking vaults — all from AI agents.

**67 tools** · **3 chains** · **11 L2s** · **12 domains** · **dry-run safety on every write**

### Links

- **Live Demo:** [lido-mcp.vercel.app](https://lido-mcp.vercel.app)
- **MCP API:** [lido-mcp.onrender.com](https://lido-mcp.onrender.com)
- **MCP Server:** [npm: lido-mcp](https://www.npmjs.com/package/lido-mcp)
- **CLI:** [npm: lido-mcp-cli](https://www.npmjs.com/package/lido-mcp-cli)


```
lido-mcp/
├── mcp/     → MCP server (67 tools, published as lido-mcp on npm)
├── ui/      → Agent Console (React + RainbowKit + AI search)
└── cli/     → CLI tool (lido search "my rewards")
```

---

## What Is This

Lido MCP Server is a Model Context Protocol server that gives AI agents full access to the Lido liquid staking protocol. It connects directly to Ethereum smart contracts via viem and the Lido SDK -- no REST wrappers, no middleware. Agents can stake ETH, manage withdrawals, participate in governance, inspect staking vaults (V3), and monitor positions across Ethereum and 11 L2 networks.

---

## Features

- **↗ Staking** -- Stake ETH, stake+wrap in one tx, check limits, beacon chain stats
- **⇄ Wrapping** -- Wrap stETH to wstETH, unwrap back -- instant, no fee
- **↩ Withdrawals** -- Request, claim, check queue depth, inspect NFTs, detect bunker mode
- **🪙 Tokens** -- Transfer, approve, revoke, convert between ETH/stETH/wstETH/shares, allowances, balances
- **💎 Rewards** -- Live APR, projected daily/monthly/yearly earnings
- **📊 Position** -- Full portfolio summary, L2 balances across 11 chains, autonomous monitoring
- **🏛 Governance** -- Vote on proposals, delegate LDO, inspect vote details with decoded IPFS descriptions
- **⚡ Easy Track** -- Browse active motions, submit objections
- **🛡 Dual Governance** -- Check state (Normal/VetoSignalling/Blocked/RageQuit), full overview
- **🏗 stVaults (V3)** -- List vaults, inspect details, fund, withdraw, pause/resume beacon deposits
- **⬢ Protocol** -- TVL, fees, staking modules, node operators, contract addresses
- **⚙ System** -- Health checks, prepare transactions for browser wallet signing

---

## Quick Setup

### 1. Clone & Install

```bash
git clone https://github.com/0xNilesh/lido-mcp.git
cd mcp
npm install
npm run build
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
ETHEREUM_RPC_URL=https://eth.drpc.org          # Any Ethereum RPC
PRIVATE_KEY=0xac0974...                         # Optional: needed for write ops
CHAIN_ID=17000                                  # 17000 = Hoodi testnet, 1 = Mainnet
```

No private key? The server runs in **read-only mode** -- you can still query balances, rewards, protocol info, and governance.

### 3. Run

```bash
npm start
```

---

## MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lido": {
      "command": "npx",
      "args": ["-y", "lido-mcp"],
      "env": {
        "ETHEREUM_RPC_URL": "https://hoodi.drpc.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "CHAIN_ID": "560048"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "lido": {
      "command": "npx",
      "args": ["-y", "lido-mcp"],
      "env": {
        "ETHEREUM_RPC_URL": "https://hoodi.drpc.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "CHAIN_ID": "560048"
      }
    }
  }
}
```

---

## All 67 Tools

### ↗ Staking

| Tool | Type | Description |
|------|------|-------------|
| `lido_stake` | W | Stake ETH, receive stETH |
| `lido_stake_and_wrap` | W | Stake ETH, receive wstETH in one tx |
| `lido_get_staking_limit` | R | Current protocol-wide staking capacity |
| `lido_is_staking_paused` | R | Check if staking is currently open |
| `lido_get_beacon_stats` | R | Validator stats: deposited, active, beacon balance |

### ⇄ Wrapping

| Tool | Type | Description |
|------|------|-------------|
| `lido_wrap` | W | stETH to wstETH (instant, no fee) |
| `lido_unwrap` | W | wstETH to stETH (instant, no fee) |

### ↩ Withdrawals

| Tool | Type | Description |
|------|------|-------------|
| `lido_request_withdrawal` | W | Request ETH withdrawal from stETH/wstETH (1-5 day wait) |
| `lido_claim_withdrawal` | W | Claim finalized withdrawal requests, receive ETH |
| `lido_claim_single_withdrawal` | W | Claim one specific withdrawal request |
| `lido_get_withdrawal_status` | R | Check status of specific withdrawal request IDs |
| `lido_get_withdrawal_requests` | R | List all withdrawal request IDs for an address |
| `lido_get_withdrawal_queue_info` | R | Queue depth, pending ETH, locked ETH, bunker mode |
| `lido_get_claimable_ether` | R | How much ETH is claimable for specific request IDs |
| `lido_is_bunker_mode` | R | Is the protocol in emergency bunker mode? |

### 🪙 Tokens & Balances

| Tool | Type | Description |
|------|------|-------------|
| `lido_get_balance` | R | ETH + stETH + wstETH + LDO + shares for an address |
| `lido_transfer` | W | Transfer stETH, wstETH, or shares |
| `lido_transfer_ldo` | W | Transfer LDO governance tokens |
| `lido_approve` | W | Approve stETH/wstETH/LDO spending |
| `lido_revoke_all_approvals` | W | Revoke stETH + wstETH approvals for a spender |
| `lido_get_allowance` | R | Check token allowance for a spender |
| `lido_get_all_allowances` | R | Check allowances for all common Lido spenders |
| `lido_convert` | R | Convert between ETH/stETH/wstETH/shares |
| `lido_get_exchange_rates` | R | Current stETH/wstETH exchange rate + share rate |
| `lido_get_token_info` | R | Token metadata: name, symbol, decimals, totalSupply |

### 💎 Rewards

| Tool | Type | Description |
|------|------|-------------|
| `lido_get_rewards` | R | APR, projected daily/monthly/yearly rewards |

### 📊 Position & Portfolio

| Tool | Type | Description |
|------|------|-------------|
| `lido_summary` | R | Everything about an address in one call |
| `lido_get_position_overview` | R | Balances + L2 wstETH + pending withdrawals + rewards |
| `lido_get_l2_balances` | R | wstETH balances across all supported L2 chains |

### 🏛 Governance (Aragon Voting)

| Tool | Type | Description |
|------|------|-------------|
| `lido_cast_vote` | W | Vote FOR or AGAINST a proposal (requires LDO) |
| `lido_delegate` | W | Delegate voting power to another address |
| `lido_list_votes` | R | List recent proposals (filter: all/open/executed) |
| `lido_get_vote` | R | Vote tallies and status for a specific proposal |
| `lido_get_vote_details` | R | Decoded on-chain actions + IPFS description |
| `lido_can_vote` | R | Can a specific address vote on a proposal? |
| `lido_get_voter_state` | R | How did an address vote? (absent/yea/nay) |

### ⚡ Easy Track

| Tool | Type | Description |
|------|------|-------------|
| `lido_get_easy_track_motions` | R | List active motions with time remaining |
| `lido_object_to_motion` | W | Object to a motion (uses stETH, not LDO) |

### 🛡 Dual Governance

| Tool | Type | Description |
|------|------|-------------|
| `lido_get_dual_governance_state` | R | Current state: Normal/VetoSignalling/Blocked/RageQuit |
| `lido_get_governance_overview` | R | Full governance landscape: DG state + links |

### 🏗 stVaults (V3)

| Tool | Type | Description |
|------|------|-------------|
| `lido_list_vaults` | R | List staking vaults from VaultHub (paginated) |
| `lido_get_vault` | R | Full vault details: owner, operator, health, value, locked |
| `lido_get_vault_hub_stats` | R | VaultHub overview: total vault count and addresses |
| `lido_vault_fund` | W | Deposit ETH into a staking vault |
| `lido_vault_withdraw` | W | Withdraw ETH from a vault to a recipient |
| `lido_vault_pause_deposits` | W | Pause beacon chain deposits for a vault |
| `lido_vault_resume_deposits` | W | Resume beacon chain deposits for a vault |

### ⬢ Protocol Infrastructure

| Tool | Type | Description |
|------|------|-------------|
| `lido_get_protocol_info` | R | TVL, shares, rates, limits, fee, paused state |
| `lido_get_protocol_fee` | R | Current protocol fee in basis points |
| `lido_get_staking_modules` | R | List staking modules (Curated, SimpleDVT, CSM) |
| `lido_get_node_operators` | R | Count of node operators |
| `lido_get_contract_addresses` | R | All protocol contract addresses for current chain |
| `lido_get_supported_chains` | R | All supported chains + L2 wstETH addresses |

### ⚙ System

| Tool | Type | Description |
|------|------|-------------|
| `lido_status` | R | Health check: chain, wallet, block number |
| `lido_prepare_transaction` | W | Encode tx calldata for browser wallet signing |

---

## Architecture

- **Multi-chain provider** -- Pools viem clients per chain. Ethereum for writes, L2 RPCs for balance reads.
- **Domain-based tool organization** -- 12 domains (staking, wrapping, withdrawals, tokens, rewards, position, governance, easy-track, dual-governance, stvaults, protocol, system), each in its own directory.
- **Skill file as MCP resource** -- `lido.skill.md` is served via `lido://skill`, giving agents a complete mental model before they act.
- **Dry-run by default** -- Every write operation defaults to `dry_run: true`. Agents must simulate first, show the user the result, and only execute after confirmation.
- **Real on-chain execution** -- Direct smart contract calls via viem + Lido SDK. No REST APIs, no indexers, no middleware.

---

## Frontend (ui)

A companion web application built with Next.js that provides a visual interface for the MCP server.

- **Dashboard + Terminal** -- Dual-mode UI: graphical dashboard for overview, terminal for power users
- **RainbowKit wallet connection** -- Connect MetaMask, WalletConnect, Coinbase Wallet, and more
- **AI semantic search** -- Natural language tool discovery powered by HuggingFace embeddings
- **Impersonation mode** -- View any address's position without connecting a wallet
- **Light/dark theme** -- Toggle between themes
- **Write operations via connected wallet** -- MCP server prepares transactions, your browser wallet signs and broadcasts

---

## Testing

- **67 tools** tested across staking, wrapping, withdrawals, governance, stVaults, and protocol queries
- **59+ test scenarios** covering read operations, write simulations, and edge cases
- **40+ real transactions** executed on the Hoodi testnet with on-chain verification
- All write tools tested in both `dry_run: true` (simulation) and `dry_run: false` (execution) modes

---

## Skill File

The `lido.skill.md` file (350+ lines) is served as an MCP resource at `lido://skill`. It provides AI agents with a complete mental model of Lido before they use any tools:

- **Rebasing mechanics** -- How stETH balances change daily and why
- **stETH vs wstETH tradeoffs** -- When to use each, tax implications, DeFi compatibility
- **Critical safety rules** -- Dry-run first, never confuse unstake with unwrap, never claim right after request
- **stVaults (V3)** -- How modular staking vaults work, VaultHub registry, health status
- **Common workflows** -- Step-by-step flows for staking, withdrawals, governance, vault management
- **Quick decision tree** -- Maps natural language requests to exact tool calls

Agents that read the skill file before acting will never confuse "unstake" with "unwrap", never skip dry-run, and always recommend wstETH for DeFi and L2 use.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ETHEREUM_RPC_URL` | Yes | -- | Ethereum JSON-RPC endpoint (Alchemy, Infura, dRPC, etc.) |
| `PRIVATE_KEY` | No | -- | Wallet private key (0x-prefixed). Omit for read-only mode |
| `CHAIN_ID` | No | `17000` | `1` = Mainnet, `17000` = Hoodi testnet |
| `MAX_TRANSACTION_ETH` | No | `100` | Per-transaction ETH limit (safety cap) |
| `MAX_DAILY_SPEND_ETH` | No | `500` | Daily cumulative ETH limit (safety cap) |

---

## Development

### Scripts

```bash
npm run build        # Production build with tsup
npm run dev          # Watch mode with tsx
npm start            # Run the MCP server
npm run typecheck    # Type checking without emit
npm run inspect      # Open MCP Inspector for interactive testing
```

### Directory Structure

```
src/
  index.ts           Entry point (stdio transport)
  server.ts          MCP server setup, tool + resource registration
  config.ts          Environment variable parsing
  provider.ts        viem + Lido SDK multi-chain provider factory
  contracts.ts       Contract address resolution
  tools/
    staking/         Stake, stake+wrap, limits, beacon stats
    wrapping/        Wrap, unwrap
    withdrawals/     Request, claim, status, queue info
    tokens/          Balances, transfers, approvals, conversions
    rewards/         APR and reward projections
    position/        Summary, L2 balances, position overview
    governance/      Aragon voting, delegation
    easy-track-gov/  Easy Track motions, objections
    dual-governance-gov/  Dual governance state
    stvaults/        stVaults V3: list, inspect, fund, withdraw, pause, resume
    protocol/        Protocol info, fees, modules, operators
    system/          Health check, prepare transaction
  abis/              Contract ABIs (Lido, wstETH, WithdrawalQueue, Voting, ERC-20)
  utils/             Shared helpers (formatting, dry-run, write mutex)
lido.skill.md        Agent skill file (served as MCP resource)
```

---

## License

MIT
