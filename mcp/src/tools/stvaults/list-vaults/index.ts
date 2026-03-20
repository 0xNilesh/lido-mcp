import { z } from "zod";
import { formatEther } from "viem";
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
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "vaultByIndex",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "isVaultConnected",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "isVaultHealthy",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "totalValue",
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
    "lido_list_vaults",
    "List staking vaults from the Lido VaultHub. Returns vault addresses with connection status, health, and total value.",
    {
      count: z
        .number()
        .default(10)
        .describe("Number of vaults to return (max 50, default 10)"),
      offset: z
        .number()
        .default(1)
        .describe("Starting vault index (1-indexed, default 1)"),
      chain_id: z
        .number()
        .optional()
        .describe("Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain."),
    },
    async (args: { count: number; offset: number; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);

        const count = Math.min(args.count, 50);
        const offset = Math.max(args.offset, 1);

        // Get total vault count
        const totalVaults = (await client.readContract({
          address: contracts.vaultHub,
          abi: vaultHubAbi,
          functionName: "vaultsCount",
        })) as bigint;

        const total = Number(totalVaults);
        if (total === 0) {
          return success({
            total_vaults: 0,
            vaults: [],
            summary: "No vaults found on VaultHub.",
          });
        }

        // Determine the range of indices to fetch
        const endIndex = Math.min(offset + count - 1, total);
        if (offset > total) {
          return success({
            total_vaults: total,
            vaults: [],
            summary: `Offset ${offset} exceeds total vault count ${total}.`,
          });
        }

        // Fetch vault addresses
        const indices: number[] = [];
        for (let i = offset; i <= endIndex; i++) {
          indices.push(i);
        }

        const addressResults = await client.multicall({
          contracts: indices.map((i) => ({
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "vaultByIndex" as const,
            args: [BigInt(i)],
          })),
        });

        const vaultAddresses: `0x${string}`[] = [];
        for (const result of addressResults) {
          if (result.status === "success") {
            vaultAddresses.push(result.result as `0x${string}`);
          }
        }

        // Fetch details for each vault in parallel
        const detailCalls = vaultAddresses.flatMap((addr) => [
          {
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "isVaultConnected" as const,
            args: [addr],
          },
          {
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "isVaultHealthy" as const,
            args: [addr],
          },
          {
            address: contracts.vaultHub,
            abi: vaultHubAbi,
            functionName: "totalValue" as const,
            args: [addr],
          },
        ]);

        const detailResults = await client.multicall({ contracts: detailCalls });

        const vaults = vaultAddresses.map((addr, idx) => {
          const base = idx * 3;
          const connectedResult = detailResults[base];
          const healthyResult = detailResults[base + 1];
          const valueResult = detailResults[base + 2];
          const connected =
            connectedResult?.status === "success"
              ? (connectedResult.result as boolean)
              : null;
          const healthy =
            healthyResult?.status === "success"
              ? (healthyResult.result as boolean)
              : null;
          const value =
            valueResult?.status === "success"
              ? (valueResult.result as bigint)
              : null;

          return {
            index: indices[idx],
            address: addr,
            connected,
            healthy,
            total_value: value !== null ? formatEther(value) + " ETH" : "unavailable",
          };
        });

        return success({
          total_vaults: total,
          showing: `${offset} to ${endIndex}`,
          vault_hub: contracts.vaultHub,
          vaults,
          summary: `Showing vaults ${offset}-${endIndex} of ${total} total on VaultHub.`,
        });
      } catch (err) {
        return error(
          `Failed to list vaults: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
