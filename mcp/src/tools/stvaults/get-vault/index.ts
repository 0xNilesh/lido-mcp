import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const vaultHubAbi = [
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
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "withdrawableValue",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "locked",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "vault", type: "address" }],
    name: "liabilityShares",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const stakingVaultAbi = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nodeOperator",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "depositor",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "beaconChainDepositsPaused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawalCredentials",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_vault",
    "Get detailed information about a specific Lido staking vault, including VaultHub status, value, and vault-level configuration.",
    {
      vault_address: z
        .string()
        .describe("The vault contract address"),
      chain_id: z
        .number()
        .optional()
        .describe("Chain ID (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain."),
    },
    async (args: { vault_address: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const vaultAddr = args.vault_address as `0x${string}`;

        // Fetch VaultHub data and StakingVault data in parallel via multicall
        const results = await client.multicall({
          contracts: [
            // VaultHub reads (0-5)
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "isVaultConnected", args: [vaultAddr] },
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "isVaultHealthy", args: [vaultAddr] },
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "totalValue", args: [vaultAddr] },
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "withdrawableValue", args: [vaultAddr] },
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "locked", args: [vaultAddr] },
            { address: contracts.vaultHub, abi: vaultHubAbi, functionName: "liabilityShares", args: [vaultAddr] },
            // StakingVault reads (6-10)
            { address: vaultAddr, abi: stakingVaultAbi, functionName: "owner" },
            { address: vaultAddr, abi: stakingVaultAbi, functionName: "nodeOperator" },
            { address: vaultAddr, abi: stakingVaultAbi, functionName: "depositor" },
            { address: vaultAddr, abi: stakingVaultAbi, functionName: "beaconChainDepositsPaused" },
            { address: vaultAddr, abi: stakingVaultAbi, functionName: "withdrawalCredentials" },
          ],
        });

        const val = (i: number) => (results[i]?.status === "success" ? results[i].result : null);

        const connected = val(0) as boolean | null;
        const healthy = val(1) as boolean | null;
        const totalValue = val(2) as bigint | null;
        const withdrawableValue = val(3) as bigint | null;
        const lockedValue = val(4) as bigint | null;
        const liabilityShares = val(5) as bigint | null;
        const owner = val(6) as string | null;
        const nodeOperator = val(7) as string | null;
        const depositor = val(8) as string | null;
        const depositsPaused = val(9) as boolean | null;
        const withdrawalCreds = val(10) as string | null;

        return success({
          vault_address: vaultAddr,
          vault_hub: contracts.vaultHub,
          chain_id: chainId,
          hub_status: {
            connected,
            healthy,
            total_value: totalValue !== null ? formatEther(totalValue) + " ETH" : "unavailable",
            withdrawable_value: withdrawableValue !== null ? formatEther(withdrawableValue) + " ETH" : "unavailable",
            locked: lockedValue !== null ? formatEther(lockedValue) + " ETH" : "unavailable",
            liability_shares: liabilityShares !== null ? liabilityShares.toString() : "unavailable",
          },
          vault_config: {
            owner,
            node_operator: nodeOperator,
            depositor,
            beacon_chain_deposits_paused: depositsPaused,
            withdrawal_credentials: withdrawalCreds,
          },
          summary: `Vault ${vaultAddr}: connected=${connected}, healthy=${healthy}, totalValue=${totalValue !== null ? formatEther(totalValue) + " ETH" : "N/A"}.`,
        });
      } catch (err) {
        return error(
          `Failed to get vault info: ${extractErrorMessage(err, "Unknown error")}. Check the vault address and RPC connection.`,
        );
      }
    },
  );
}
