import { z } from "zod";
import { success, error } from "../../../utils/format.js";
import { getContracts } from "../../../contracts.js";
import { resolveChainId, extractErrorMessage } from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_contract_addresses",
    "Get all Lido contract addresses for the specified chain (stETH, wstETH, WithdrawalQueue, Voting, LDO, Locator, StakingRouter, NodeOperatorsRegistry, etc.)",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const chainName = chainId === 1 ? "Ethereum Mainnet" : chainId === 560048 ? "Hoodi Testnet" : "Holesky Testnet";
        return success({
          chain: chainName,
          chain_id: chainId,
          contracts: {
            lido_steth: contracts.lido,
            wsteth: contracts.wsteth,
            withdrawal_queue: contracts.withdrawalQueue,
            voting: contracts.voting,
            ldo: contracts.ldo,
            locator: contracts.locator,
            staking_router: contracts.stakingRouter,
            node_operators_registry: contracts.nodeOperatorsRegistry,
            vault_hub: contracts.vaultHub,
            vault_factory: contracts.vaultFactory,
            accounting: contracts.accounting,
            dual_governance: contracts.dualGovernance,
            operator_grid: contracts.operatorGrid,
          },
          summary: `Lido contract addresses on ${chainName} (chain ${chainId}). stETH: ${contracts.lido}, wstETH: ${contracts.wsteth}, WithdrawalQueue: ${contracts.withdrawalQueue}.`,
        });
      } catch (err) {
        return error(
          `Contract addresses query failed: ${extractErrorMessage(err, "Unknown error")}.`,
        );
      }
    },
  );
}
