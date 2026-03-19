import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_staking_limit",
    "Get the current staking limit (max ETH that can be staked right now)",
    {},
    async () => {
      try {
        const stakeLimit = (await provider.publicClient.readContract({
          address: contracts.lido,
          abi: lidoAbi,
          functionName: "getCurrentStakeLimit",
        })) as bigint;

        return success({
          current_stake_limit: formatEther(stakeLimit) + " ETH",
          current_stake_limit_wei: stakeLimit.toString(),
          summary: `Current staking limit: ${formatEther(stakeLimit)} ETH`,
        });
      } catch (err) {
        return error(
          `Staking limit query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
