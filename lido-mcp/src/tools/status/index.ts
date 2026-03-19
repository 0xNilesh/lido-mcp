import { success, error } from "../../utils/format.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_status",
    "Check Lido MCP server health and configuration",
    {},
    async () => {
      try {
        const chainId = getChainId(provider);
        const chainName = provider.publicClient.chain?.name ?? "unknown";
        const blockNumber = await provider.publicClient.getBlockNumber();

        const walletConfigured = !!provider.account;
        let maskedAddress: string | null = null;
        if (provider.account?.address) {
          const addr = provider.account.address as string;
          maskedAddress = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        }

        return success({
          connected: true,
          chain: chainName,
          chain_id: chainId,
          wallet_configured: walletConfigured,
          wallet_address: maskedAddress,
          write_operations_available: walletConfigured,
          current_block: blockNumber.toString(),
          summary: walletConfigured
            ? `Connected to ${chainName} (chain ${chainId}) at block ${blockNumber}. Wallet ${maskedAddress} is configured for read and write operations.`
            : `Connected to ${chainName} (chain ${chainId}) at block ${blockNumber}. No wallet configured — read-only mode.`,
        });
      } catch (err) {
        return error(
          `Health check failed: ${extractErrorMessage(err, "Unknown error")}. Verify that ETHEREUM_RPC_URL is reachable.`,
        );
      }
    },
  );
}
