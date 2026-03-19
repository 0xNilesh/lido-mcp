# Lido MCP Server

Stake ETH, manage positions, and participate in Lido DAO governance -- all from AI agents via the Model Context Protocol.

## Features

- **Liquid staking** -- Stake ETH, receive stETH, earn daily rewards
- **Wrap / unwrap** -- Convert between stETH and wstETH for DeFi and L2 use
- **Withdrawals** -- Request and claim ETH withdrawals with full lifecycle tracking
- **Cross-chain balances** -- Query wstETH on Arbitrum, Optimism, Base, and 10+ L2s
- **Governance** -- List proposals, inspect votes, cast ballots with LDO
- **Position overview** -- Full portfolio summary across all chains in one call
- **Safety first** -- All write operations default to `dry_run: true` with simulation output
- **Real on-chain** -- Direct contract calls via viem + Lido SDK. No REST wrappers.

## Quick Setup

### 1. Install

```bash
git clone https://github.com/your-org/lido-mcp.git
cd lido-mcp
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
CHAIN_ID=17000                                  # 17000 = Holesky (safe), 1 = Mainnet
```

No private key? The server runs in **read-only mode** -- you can still query balances, rewards, protocol info, and governance proposals.

### 3. Use

```bash
npm start
```

## MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lido": {
      "command": "node",
      "args": ["/absolute/path/to/lido-mcp/dist/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.drpc.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "CHAIN_ID": "17000"
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
      "command": "node",
      "args": ["/absolute/path/to/lido-mcp/dist/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.drpc.org",
        "PRIVATE_KEY": "0xYOUR_PRIVATE_KEY",
        "CHAIN_ID": "17000"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `lido_status` | Health check -- verify connection, chain, and wallet configuration |
| `lido_stake` | Stake ETH to receive stETH |
| `lido_wrap` | Wrap stETH into wstETH |
| `lido_unwrap` | Unwrap wstETH back to stETH |
| `lido_request_withdrawal` | Request withdrawal of stETH/wstETH back to ETH (1-5 day wait) |
| `lido_claim_withdrawal` | Claim finalized withdrawal requests |
| `lido_get_withdrawal_status` | Check status of pending withdrawals |
| `lido_get_balance` | Get token balances (stETH, wstETH, ETH, LDO, shares) on any chain |
| `lido_get_rewards` | Current APR and estimated daily/monthly/yearly earnings |
| `lido_get_protocol_info` | Protocol stats: TVL, exchange rates, stake limits, governance state |
| `lido_get_position_overview` | Full position summary across Ethereum and all L2s |
| `lido_list_votes` | List recent governance proposals |
| `lido_get_vote` | Get details of a specific governance vote |
| `lido_cast_vote` | Vote FOR or AGAINST a proposal (requires LDO) |

## Skill File

The `lido.skill.md` file is served as an MCP resource (`lido://skill`). It gives AI agents a complete mental model of Lido before they use any tools -- covering rebasing mechanics, stETH vs wstETH tradeoffs, critical safety rules, common workflows, governance, and risks.

Agents that read the skill file before acting will:
- Never confuse "unstake" with "unwrap"
- Always dry-run before executing
- Never try to claim a withdrawal that was just requested
- Know when to recommend wstETH over stETH

## Development

```bash
npm run dev          # Watch mode with tsx
npm run build        # Production build with tsup
npm run typecheck    # Type checking without emit
npm run inspect      # Open MCP Inspector for interactive testing
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ETHEREUM_RPC_URL` | Yes | -- | Ethereum JSON-RPC endpoint |
| `PRIVATE_KEY` | No | -- | Wallet private key (0x-prefixed, 64 hex chars) |
| `CHAIN_ID` | No | `17000` | `1` for mainnet, `17000` for Holesky testnet |
| `MAX_TRANSACTION_ETH` | No | `100` | Per-transaction ETH limit |
| `MAX_DAILY_SPEND_ETH` | No | `500` | Daily cumulative ETH limit |

### Architecture

```
src/
  index.ts          Entry point (stdio transport)
  server.ts         MCP server setup, tool + resource registration
  config.ts         Environment variable parsing
  provider.ts       viem + Lido SDK provider factory
  tools/            One file per domain (stake, wrap, withdraw, governance, etc.)
  abis/             Contract ABIs (Lido, wstETH, WithdrawalQueue, Voting, ERC-20)
  utils/            Shared helpers (response formatting, dry-run, write mutex)
lido.skill.md       Agent skill file (served as MCP resource)
```

## License

MIT
