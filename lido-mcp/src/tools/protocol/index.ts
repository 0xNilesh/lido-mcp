import { formatEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { getContracts } from "../../contracts.js";
import { getChainId, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  const chainId = getChainId(provider);
  const contracts = getContracts(chainId);

  server.tool(
    "lido_get_protocol_info",
    "Get Lido protocol-level information including total staked ETH, share rate, exchange rates, stake limits, buffered ETH, and protocol fee.",
    {},
    async () => {
      try {
        // Multicall to fetch all protocol data in one round trip
        const results = await provider.publicClient.multicall({
          contracts: [
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "getTotalPooledEther",
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "getTotalShares",
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "getCurrentStakeLimit",
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "getBufferedEther",
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "getFee",
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "totalSupply",
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "stEthPerToken",
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "tokensPerStEth",
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "totalSupply",
            },
          ],
        });

        // Extract results with safe fallbacks
        const totalPooledEther =
          results[0]?.status === "success" ? (results[0].result as bigint) : null;
        const totalShares =
          results[1]?.status === "success" ? (results[1].result as bigint) : null;
        const currentStakeLimit =
          results[2]?.status === "success" ? (results[2].result as bigint) : null;
        const bufferedEther =
          results[3]?.status === "success" ? (results[3].result as bigint) : null;
        const protocolFeeBps =
          results[4]?.status === "success" ? Number(results[4].result) : null;
        const stethTotalSupply =
          results[5]?.status === "success" ? (results[5].result as bigint) : null;
        const stethPerWsteth =
          results[6]?.status === "success" ? (results[6].result as bigint) : null;
        const wstethPerSteth =
          results[7]?.status === "success" ? (results[7].result as bigint) : null;
        const wstethTotalSupply =
          results[8]?.status === "success" ? (results[8].result as bigint) : null;

        // Compute derived values
        let shareRate: string | null = null;
        if (totalPooledEther !== null && totalShares !== null && totalShares > 0n) {
          const rate =
            Number((totalPooledEther * 1_000_000_000_000_000_000n) / totalShares) / 1e18;
          shareRate = rate.toFixed(18);
        }

        const chainName = chainId === 1 ? "Ethereum Mainnet" : chainId === 560048 ? "Hoodi Testnet" : "Holesky Testnet";

        return success({
          chain: chainName,
          chain_id: chainId,
          contracts: {
            steth: contracts.lido,
            wsteth: contracts.wsteth,
          },
          staking: {
            total_pooled_ether:
              totalPooledEther !== null ? formatEther(totalPooledEther) + " ETH" : "unavailable",
            total_shares: totalShares !== null ? totalShares.toString() : "unavailable",
            share_rate: shareRate !== null ? shareRate + " ETH/share" : "unavailable",
            current_stake_limit:
              currentStakeLimit !== null
                ? formatEther(currentStakeLimit) + " ETH"
                : "unavailable",
            buffered_ether:
              bufferedEther !== null ? formatEther(bufferedEther) + " ETH" : "unavailable",
          },
          supply: {
            steth_total_supply:
              stethTotalSupply !== null
                ? formatEther(stethTotalSupply) + " stETH"
                : "unavailable",
            wsteth_total_supply:
              wstethTotalSupply !== null
                ? formatEther(wstethTotalSupply) + " wstETH"
                : "unavailable",
          },
          exchange_rates: {
            steth_per_wsteth:
              stethPerWsteth !== null
                ? formatEther(stethPerWsteth) + " stETH per 1 wstETH"
                : "unavailable",
            wsteth_per_steth:
              wstethPerSteth !== null
                ? formatEther(wstethPerSteth) + " wstETH per 1 stETH"
                : "unavailable",
          },
          protocol_fee:
            protocolFeeBps !== null ? (protocolFeeBps / 100).toFixed(1) + "%" : "unavailable",
          summary: `Lido protocol on ${chainName} (chain ${chainId}). Total pooled: ${totalPooledEther !== null ? formatEther(totalPooledEther) + " ETH" : "unavailable"}. Share rate: ${shareRate !== null ? shareRate + " ETH/share" : "unavailable"}.`,
        });
      } catch (err) {
        return error(
          `Protocol info query failed: ${extractErrorMessage(err, "Unknown error")}. Check the RPC connection.`,
        );
      }
    },
  );
}
