import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { getContracts } from "../../contracts.js";
import { resolveChainId, getClient, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const beaconStatAbi = [
  {
    name: "getBeaconStat",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "depositedValidators", type: "uint256" },
      { name: "beaconValidators", type: "uint256" },
      { name: "beaconBalance", type: "uint256" },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_beacon_stats",
    "Get Beacon chain validator statistics from the Lido protocol, including deposited validators, beacon validators, and beacon balance.",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const [depositedValidators, beaconValidators, beaconBalance] =
          (await client.readContract({
            address: contracts.lido,
            abi: beaconStatAbi,
            functionName: "getBeaconStat",
          })) as [bigint, bigint, bigint];

        return success({
          deposited_validators: depositedValidators.toString(),
          beacon_validators: beaconValidators.toString(),
          beacon_balance: formatEther(beaconBalance) + " ETH",
          beacon_balance_wei: beaconBalance.toString(),
          summary: `Beacon stats: ${depositedValidators.toString()} deposited validators, ${beaconValidators.toString()} beacon validators, ${formatEther(beaconBalance)} ETH beacon balance.`,
        });
      } catch (err) {
        return error(
          `Beacon stats query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
