# Lido MCP CLI

Command-line interface for interacting with all 67 Lido MCP tools directly from your terminal. No AI agent required.

## Install

```bash
npm install -g @lido-mcp/cli
```

Or run directly:

```bash
npx @lido-mcp/cli
```

## Setup

```bash
lido setup
```

Configures your RPC URL, private key (optional), and chain ID. Saved to `~/.lido-mcp/config.json`.

## Usage

```bash
# Interactive mode — pick category, tool, fill params
lido

# Search tools with natural language
lido search "my staking rewards"
lido search "proposal 198"
lido search "governance"

# List all 67 tools by category
lido tools

# Check server status
lido status

# Run any tool directly
lido lido_stake --amount 0.01 --dry_run true
lido lido_get_balance --address 0xd8dA...6045 --chain_id 1
lido lido_get_protocol_info --chain_id 1
lido lido_list_votes --count 5 --status open --chain_id 1
lido lido_get_vote_details --vote_id 198 --chain_id 1
```

## How it works

The CLI spawns the `lido-mcp` npm package as a child process and communicates via the MCP stdio protocol. All 67 tools are available — same ones that Claude and Cursor use.

## License

MIT
