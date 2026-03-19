import { z } from "zod";
import { success, error } from "../../utils/format.js";
import { stakingRouterAbi } from "../../abis/staking-router.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

const getStakingModuleAbi = [
  {
    name: "getStakingModule",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_stakingModuleId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint24" },
          { name: "stakingModuleAddress", type: "address" },
          { name: "stakingModuleFee", type: "uint16" },
          { name: "treasuryFee", type: "uint16" },
          { name: "stakeShareLimit", type: "uint16" },
          { name: "status", type: "uint8" },
          { name: "name", type: "string" },
          { name: "lastDepositAt", type: "uint64" },
          { name: "lastDepositBlock", type: "uint256" },
          { name: "exitedValidatorsCount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_staking_modules",
    "Get the number of staking modules and withdrawal credentials from the Staking Router",
    {},
    async () => {
      try {
        const results = await provider.publicClient.multicall({
          contracts: [
            {
              address: contracts.stakingRouter,
              abi: stakingRouterAbi,
              functionName: "getStakingModulesCount",
            },
            {
              address: contracts.stakingRouter,
              abi: stakingRouterAbi,
              functionName: "getWithdrawalCredentials",
            },
          ],
        });

        const modulesCount = results[0]?.status === "success" ? Number(results[0].result) : null;
        const withdrawalCreds = results[1]?.status === "success" ? results[1].result as string : null;

        return success({
          staking_router: contracts.stakingRouter,
          modules_count: modulesCount,
          withdrawal_credentials: withdrawalCreds,
          summary: `Staking Router has ${modulesCount !== null ? modulesCount : "unknown"} module(s). Withdrawal credentials: ${withdrawalCreds ?? "unavailable"}.`,
        });
      } catch (err) {
        return error(
          `Staking modules query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_staking_module",
    "Get details for a specific staking module by ID from the Staking Router",
    {
      module_id: z.number().describe("The staking module ID to query"),
    },
    async (args: { module_id: number }) => {
      try {
        const mod = (await provider.publicClient.readContract({
          address: contracts.stakingRouter,
          abi: getStakingModuleAbi,
          functionName: "getStakingModule",
          args: [BigInt(args.module_id)],
        })) as {
          id: number;
          stakingModuleAddress: string;
          stakingModuleFee: number;
          treasuryFee: number;
          stakeShareLimit: number;
          status: number;
          name: string;
          lastDepositAt: bigint;
          lastDepositBlock: bigint;
          exitedValidatorsCount: bigint;
        };

        return success({
          module_id: args.module_id,
          id: mod.id,
          name: mod.name,
          staking_module_address: mod.stakingModuleAddress,
          staking_module_fee: mod.stakingModuleFee,
          treasury_fee: mod.treasuryFee,
          stake_share_limit: mod.stakeShareLimit,
          status: mod.status,
          last_deposit_at: mod.lastDepositAt.toString(),
          last_deposit_block: mod.lastDepositBlock.toString(),
          exited_validators_count: mod.exitedValidatorsCount.toString(),
          summary: `Staking module #${args.module_id}: "${mod.name}" at ${mod.stakingModuleAddress}, status=${mod.status}, exited=${mod.exitedValidatorsCount.toString()}.`,
        });
      } catch (err) {
        return error(
          `Staking module query failed: ${extractErrorMessage(err, "Unknown error")}. Check the module ID and RPC connection.`,
        );
      }
    },
  );
}
