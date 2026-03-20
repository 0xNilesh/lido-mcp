import { z } from "zod";
import { success, error } from "../../../utils/format.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const vaultHubAbi = [
  {
    inputs: [],
    name: "vaultsCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_vault_hub_stats",
    "Get overall VaultHub statistics including total vault count and contract address.",
    {
      chain_id: z
        .number()
        .optional()
        .describe("Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain."),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);

        const totalVaults = (await client.readContract({
          address: contracts.vaultHub,
          abi: vaultHubAbi,
          functionName: "vaultsCount",
        })) as bigint;

        const chainName =
          chainId === 1
            ? "Ethereum Mainnet"
            : chainId === 560048
              ? "Hoodi Testnet"
              : "Holesky Testnet";

        return success({
          chain: chainName,
          chain_id: chainId,
          vault_hub_address: contracts.vaultHub,
          vault_factory_address: contracts.vaultFactory,
          total_vaults: Number(totalVaults),
          summary: `VaultHub on ${chainName} (chain ${chainId}) has ${totalVaults} vaults. Address: ${contracts.vaultHub}.`,
        });
      } catch (err) {
        return error(
          `VaultHub stats query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
