import { success } from "../../utils/format.js";
import { L2_WSTETH } from "../../contracts.js";
import { resolveChainId } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_supported_chains",
    "List all supported chains for Lido (current L1 and all L2s with wstETH bridges)",
    {},
    async () => {
      const chainId = resolveChainId(provider);
      const chainName = chainId === 1 ? "Ethereum Mainnet" : chainId === 560048 ? "Hoodi Testnet" : "Holesky Testnet";
      const l2Chains = Object.entries(L2_WSTETH).map(([name, info]) => ({
        name,
        chain_id: info.chainId,
        wsteth_address: info.address,
      }));

      return success({
        current_chain: {
          name: chainName,
          chain_id: chainId,
        },
        supported_l1_chains: [
          { name: "Ethereum Mainnet", chain_id: 1 },
          { name: "Holesky Testnet", chain_id: 17000 },
          { name: "Hoodi Testnet", chain_id: 560048 },
        ],
        supported_l2_chains: l2Chains,
        summary: `Currently connected to ${chainName} (chain ${chainId}). wstETH is available on ${l2Chains.length} L2 chains.`,
      });
    },
  );
}
