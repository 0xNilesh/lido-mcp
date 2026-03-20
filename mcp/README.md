# Lido MCP

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) server that provides Claude AI and other MCP-compatible agents with real-time access to Lido liquid staking on Ethereum — stake, unstake, wrap, govern, and manage staking positions directly from a conversation.

## Features

This server provides the following 67 tools to Claude:

### Staking
- **lido_stake**: Stake ETH to receive stETH
- **lido_stake_and_wrap**: Stake ETH and receive wstETH in one transaction
- **lido_get_staking_limit**: Get current protocol staking capacity
- **lido_is_staking_paused**: Check if staking is open
- **lido_get_beacon_stats**: Get validator statistics (deposited, active, balance)

### Wrapping
- **lido_wrap**: Wrap stETH into wstETH (instant, no fee)
- **lido_unwrap**: Unwrap wstETH back to stETH (instant, no fee)

### Withdrawals
- **lido_request_withdrawal**: Request ETH withdrawal from stETH or wstETH
- **lido_claim_withdrawal**: Claim finalized withdrawals (batch)
- **lido_claim_single_withdrawal**: Claim a single withdrawal request
- **lido_claim_withdrawal_to**: Claim to a different recipient address
- **lido_get_withdrawal_status**: Check status of withdrawal requests
- **lido_get_withdrawal_requests**: List all request IDs for an address
- **lido_get_withdrawal_queue_info**: Queue depth, pending count, locked ETH
- **lido_get_claimable_ether**: Check claimable amounts for requests
- **lido_is_bunker_mode**: Check emergency bunker mode status
- **lido_get_withdrawal_nft_owner**: Get owner of a withdrawal NFT
- **lido_transfer_withdrawal_nft**: Transfer a withdrawal NFT
- **lido_approve_withdrawal_nft**: Approve a withdrawal NFT for transfer

### Tokens & Balances
- **lido_get_balance**: Get ETH, stETH, wstETH, LDO, and share balances
- **lido_transfer**: Transfer stETH, wstETH, or shares
- **lido_transfer_ldo**: Transfer LDO governance tokens
- **lido_approve**: Approve stETH, wstETH, or LDO for a spender
- **lido_revoke_all_approvals**: Revoke all token approvals for a spender
- **lido_increase_allowance**: Safely increase stETH allowance
- **lido_get_allowance**: Check token allowance for a spender
- **lido_get_all_allowances**: Check all allowances for common Lido contracts
- **lido_get_token_info**: Get token metadata (name, symbol, supply)
- **lido_convert**: Convert between ETH, stETH, wstETH, and shares

### Rewards
- **lido_get_rewards**: Get current APR and projected daily/monthly/yearly rewards

### Position & Portfolio
- **lido_summary**: Complete position in one call — balances, rewards, withdrawals, rates, governance
- **lido_get_position_overview**: Full position including L2 wstETH balances
- **lido_get_l2_balances**: wstETH balances across 11 L2 chains
- **lido_monitor_position**: Check position against user-defined bounds, returns recommended actions

### Governance (Aragon Voting)
- **lido_cast_vote**: Vote FOR or AGAINST a proposal (requires LDO)
- **lido_delegate**: Delegate voting power to another address
- **lido_undelegate**: Remove voting delegation
- **lido_list_votes**: List recent proposals with tallies
- **lido_get_vote**: Get vote status and tallies
- **lido_get_vote_details**: Deep dive — decoded actions, IPFS description, timeline
- **lido_can_vote**: Check voting eligibility
- **lido_get_voter_state**: Check how an address voted
- **lido_get_vote_count**: Total proposals on-chain
- **lido_get_delegate**: Check current delegate

### Easy Track
- **lido_get_easy_track_motions**: List active Easy Track motions with time remaining
- **lido_object_to_motion**: Object to a motion using stETH

### Dual Governance
- **lido_get_dual_governance_state**: Current state (Normal/VetoSignalling/Blocked)
- **lido_get_governance_overview**: Full governance landscape with links

### stVaults (Lido V3)
- **lido_list_vaults**: List staking vaults from VaultHub
- **lido_get_vault**: Full vault details — owner, operator, value, health
- **lido_get_vault_hub_stats**: VaultHub overview and vault count
- **lido_vault_fund**: Deposit ETH into a staking vault
- **lido_vault_withdraw**: Withdraw ETH from a vault
- **lido_vault_pause_deposits**: Pause beacon chain deposits for a vault
- **lido_vault_resume_deposits**: Resume beacon chain deposits

### Protocol
- **lido_get_protocol_info**: TVL, shares, exchange rates, stake limits, fees
- **lido_get_protocol_fee**: Protocol fee in basis points
- **lido_get_exchange_rates**: stETH/wstETH exchange rates and share rate
- **lido_get_share_rate**: Current share rate
- **lido_get_staking_modules**: List staking modules
- **lido_get_staking_module**: Details of a specific module
- **lido_get_node_operators**: Node operator count
- **lido_get_node_operator**: Operator details
- **lido_get_contract_addresses**: All protocol contract addresses
- **lido_get_supported_chains**: Supported chains and L2 wstETH addresses

### System
- **lido_status**: Server health check — chain, wallet, block number
- **lido_prepare_transaction**: Encode transaction calldata for browser wallet signing

## Prerequisites

- Node.js 20 or higher
- An Ethereum JSON-RPC endpoint ([Alchemy](https://www.alchemy.com/), [Infura](https://www.infura.io/), or public RPCs)
- A private key (optional — only needed for write operations like staking and voting)

## Integration with Claude Desktop

1. Locate the Claude Desktop configuration file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the following configuration:

```json
{
  "mcpServers": {
    "lido": {
      "command": "npx",
      "args": ["-y", "lido-mcp"],
      "env": {
        "ETHEREUM_RPC_URL": "https://hoodi.drpc.org",
        "PRIVATE_KEY": "your-private-key-here",
        "CHAIN_ID": "560048"
      }
    }
  }
}
```

3. Restart Claude Desktop. You can now ask Claude to interact with Lido:
   - *"Show me my Lido staking position"*
   - *"Stake 0.1 ETH"*
   - *"What governance proposals are open?"*

## Integration with Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "lido": {
      "command": "npx",
      "args": ["-y", "lido-mcp"],
      "env": {
        "ETHEREUM_RPC_URL": "https://hoodi.drpc.org",
        "CHAIN_ID": "560048"
      }
    }
  }
}
```

## Manual Installation

```bash
git clone https://github.com/0xnilesh/lido-mcp.git
cd lido-mcp
npm install
npm run build
node dist/index.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `ETHEREUM_RPC_URL` | yes | — | Ethereum JSON-RPC endpoint |
| `PRIVATE_KEY` | for writes | — | Hex private key (0x-prefixed, 66 chars) |
| `CHAIN_ID` | no | `17000` | `1` (mainnet), `17000` (Holesky), `560048` (Hoodi) |
| `MAX_TRANSACTION_ETH` | no | `100` | Maximum ETH per transaction |
| `MAX_DAILY_SPEND_ETH` | no | `500` | Maximum daily ETH spend |

## Usage in Claude

Once configured, you can ask Claude to perform various Lido-related tasks:

- *"Show me my complete Lido position"*
- *"Stake 1 ETH with Lido"*
- *"Wrap all my stETH to wstETH"*
- *"What governance proposals are open? Tell me about proposal 198"*
- *"Monitor my position — claim any ready withdrawals"*
- *"How much am I earning from staking?"*
- *"Show me staking vaults on Hoodi"*
- *"What's the current protocol TVL and APR?"*
- *"Convert 5 stETH to wstETH"*

## Skill File

Ships with `lido.skill.md` (372 lines) — automatically served as an MCP resource at `lido://skill`. It gives agents the full Lido mental model before they act:

- Rebasing mechanics and share math
- stETH vs wstETH tradeoffs (tax, DeFi, bridging)
- Safe staking patterns and critical safety rules
- Tool recipes for every workflow
- Governance primer (Aragon, Easy Track, Dual Governance)
- Risk awareness

## Supported Chains

| Chain | ID | Operations |
|-------|-----|-----------|
| Ethereum Mainnet | 1 | All (stake, wrap, withdraw, governance) |
| Holesky Testnet | 17000 | All |
| Hoodi Testnet | 560048 | All (recommended for testing) |
| Arbitrum, Optimism, Base, Polygon + 7 more | — | wstETH balance queries |

## Links

- [GitHub Repository](https://github.com/0xnilesh/lido-mcp)
- [Lido Protocol](https://lido.fi)
- [Lido Documentation](https://docs.lido.fi)
- [MCP Specification](https://modelcontextprotocol.io)

## License

MIT
