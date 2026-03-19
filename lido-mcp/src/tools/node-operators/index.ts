import { z } from "zod";
import { success, error } from "../../utils/format.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

const nodeOperatorsAbi = [
  {
    name: "getNodeOperatorsCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getActiveNodeOperatorsCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getNodeOperator",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_id", type: "uint256" },
      { name: "_fullInfo", type: "bool" },
    ],
    outputs: [
      { name: "active", type: "bool" },
      { name: "name", type: "string" },
      { name: "rewardAddress", type: "address" },
      { name: "totalVettedValidators", type: "uint64" },
      { name: "totalExitedValidators", type: "uint64" },
      { name: "totalAddedValidators", type: "uint64" },
      { name: "totalDepositedValidators", type: "uint64" },
    ],
  },
] as const;

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_node_operators",
    "Get node operator count and optionally details for a specific operator by ID",
    {
      operator_id: z
        .string()
        .optional()
        .describe("Optional operator ID to get details for a specific operator"),
    },
    async (args: { operator_id?: string }) => {
      try {
        const results = await provider.publicClient.multicall({
          contracts: [
            {
              address: contracts.nodeOperatorsRegistry,
              abi: nodeOperatorsAbi,
              functionName: "getNodeOperatorsCount",
            },
            {
              address: contracts.nodeOperatorsRegistry,
              abi: nodeOperatorsAbi,
              functionName: "getActiveNodeOperatorsCount",
            },
          ],
        });

        const totalCount = results[0]?.status === "success" ? Number(results[0].result) : null;
        const activeCount = results[1]?.status === "success" ? Number(results[1].result) : null;

        const result: Record<string, unknown> = {
          node_operators_registry: contracts.nodeOperatorsRegistry,
          total_operators: totalCount,
          active_operators: activeCount,
        };

        if (args.operator_id !== undefined) {
          try {
            const opData = (await provider.publicClient.readContract({
              address: contracts.nodeOperatorsRegistry,
              abi: nodeOperatorsAbi,
              functionName: "getNodeOperator",
              args: [BigInt(args.operator_id), true],
            })) as [boolean, string, string, bigint, bigint, bigint, bigint];

            result.operator = {
              id: args.operator_id,
              active: opData[0],
              name: opData[1],
              reward_address: opData[2],
              total_vetted_validators: opData[3].toString(),
              total_exited_validators: opData[4].toString(),
              total_added_validators: opData[5].toString(),
              total_deposited_validators: opData[6].toString(),
            };
          } catch (e) {
            result.operator_error = `Failed to fetch operator #${args.operator_id}: ${extractErrorMessage(e, "Unknown error")}`;
          }
        }

        result.summary = `Node Operators Registry: ${totalCount ?? "unknown"} total, ${activeCount ?? "unknown"} active.${args.operator_id !== undefined && result.operator ? ` Operator #${args.operator_id}: ${(result.operator as Record<string, unknown>).name}` : ""}`;

        return success(result);
      } catch (err) {
        return error(
          `Node operators query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_node_operator",
    "Get detailed information for a specific node operator by ID",
    {
      operator_id: z.number().describe("The node operator ID to query"),
    },
    async (args: { operator_id: number }) => {
      try {
        const opData = (await provider.publicClient.readContract({
          address: contracts.nodeOperatorsRegistry,
          abi: nodeOperatorsAbi,
          functionName: "getNodeOperator",
          args: [BigInt(args.operator_id), true],
        })) as [boolean, string, string, bigint, bigint, bigint, bigint];

        return success({
          operator_id: args.operator_id,
          active: opData[0],
          name: opData[1],
          reward_address: opData[2],
          total_vetted_validators: opData[3].toString(),
          total_exited_validators: opData[4].toString(),
          total_added_validators: opData[5].toString(),
          total_deposited_validators: opData[6].toString(),
          summary: `Operator #${args.operator_id}: "${opData[1]}", active=${opData[0]}, deposited=${opData[6].toString()}, exited=${opData[4].toString()}.`,
        });
      } catch (err) {
        return error(
          `Node operator query failed: ${extractErrorMessage(err, "Unknown error")}. Check the operator ID and RPC connection.`,
        );
      }
    },
  );
}
