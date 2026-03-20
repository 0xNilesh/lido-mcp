import { z } from "zod";
import { formatEther } from "viem";
import { success, error } from "../../../utils/format.js";
import { lidoAbi } from "../../../abis/lido.js";
import { wstethAbi } from "../../../abis/wsteth.js";
import { getContracts } from "../../../contracts.js";
import {
  resolveChainId,
  getClient,
  getWalletAddress,
  formatTokenAmount,
  extractErrorMessage,
} from "../../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../../provider.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default estimated gross APR for Lido staking (basis points). */
const DEFAULT_APR_BPS = 350; // 3.50%

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_rewards",
    "Get staking rewards information for a Lido stETH holder, including current balance, share rate, estimated APR, and projected rewards.",
    {
      address: z
        .string()
        .optional()
        .describe(
          "Ethereum address to check rewards for. Defaults to the configured wallet.",
        ),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { address?: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);

        const walletAddress = getWalletAddress(provider, args.address);
        if (!walletAddress) {
          return error(
            "No address provided and no wallet configured. Provide an address parameter or set the PRIVATE_KEY environment variable.",
          );
        }

        // Multicall to fetch all needed data in one round trip
        const results = await client.multicall({
          contracts: [
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "balanceOf",
              args: [walletAddress],
            },
            {
              address: contracts.lido,
              abi: lidoAbi,
              functionName: "sharesOf",
              args: [walletAddress],
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "balanceOf",
              args: [walletAddress],
            },
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
              functionName: "getFee",
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "getStETHByWstETH",
              args: [1_000_000_000_000_000_000n], // 1 wstETH
            },
          ],
        });

        // Extract results safely
        const stethBalance =
          results[0]?.status === "success" ? (results[0].result as bigint) : 0n;
        const shares =
          results[1]?.status === "success" ? (results[1].result as bigint) : 0n;
        const wstethBalance =
          results[2]?.status === "success" ? (results[2].result as bigint) : 0n;
        const totalPooledEther =
          results[3]?.status === "success" ? (results[3].result as bigint) : 0n;
        const totalShares =
          results[4]?.status === "success" ? (results[4].result as bigint) : 0n;
        const protocolFeeBps =
          results[5]?.status === "success" ? Number(results[5].result) : 1000;
        const stethPerWsteth =
          results[6]?.status === "success"
            ? (results[6].result as bigint)
            : 1_000_000_000_000_000_000n;

        // Compute share rate
        let shareRate = 0;
        if (totalShares > 0n) {
          shareRate =
            Number((totalPooledEther * 1_000_000_000_000_000_000n) / totalShares) / 1e18;
        }

        // Protocol fee as percentage (getFee returns basis points where 10000 = 100%)
        const protocolFeePercent = protocolFeeBps / 100;

        // Effective APR estimation
        const grossAprPercent = DEFAULT_APR_BPS / 100;
        const netAprPercent = grossAprPercent * (1 - protocolFeeBps / 10000);

        // Total stETH-equivalent exposure
        const wstethAsSteth =
          (wstethBalance * stethPerWsteth) / 1_000_000_000_000_000_000n;
        const totalExposure = stethBalance + wstethAsSteth;

        // Project rewards from total exposure
        const totalExposureNum = Number(formatEther(totalExposure));
        const dailyReward = (totalExposureNum * netAprPercent) / 100 / 365;
        const weeklyReward = dailyReward * 7;
        const monthlyReward = (totalExposureNum * netAprPercent) / 100 / 12;
        const yearlyReward = (totalExposureNum * netAprPercent) / 100;

        return success({
          address: walletAddress,
          balances: {
            steth: formatTokenAmount(stethBalance, "stETH"),
            wsteth: formatTokenAmount(wstethBalance, "wstETH"),
            wsteth_as_steth: formatEther(wstethAsSteth) + " stETH equivalent",
            total_exposure: formatEther(totalExposure) + " stETH equivalent",
            shares: shares.toString(),
          },
          protocol: {
            total_pooled_ether: formatTokenAmount(totalPooledEther, "ETH"),
            total_shares: totalShares.toString(),
            share_rate: shareRate.toFixed(6) + " ETH/share",
            protocol_fee: protocolFeePercent.toFixed(1) + "%",
            steth_per_wsteth: formatEther(stethPerWsteth),
          },
          apr: {
            gross_apr: grossAprPercent.toFixed(2) + "%",
            net_apr: netAprPercent.toFixed(2) + "%",
            note: "APR is estimated at ~3.5% gross. Actual APR varies based on validator performance and network conditions.",
          },
          projected_rewards: {
            daily: dailyReward.toFixed(6) + " stETH",
            weekly: weeklyReward.toFixed(6) + " stETH",
            monthly: monthlyReward.toFixed(6) + " stETH",
            yearly: yearlyReward.toFixed(6) + " stETH",
          },
          ...(totalExposure === 0n
            ? {
                note: "This address has no stETH or wstETH. Projected rewards are zero.",
              }
            : {}),
          summary: `Rewards for ${walletAddress}: ${formatTokenAmount(stethBalance, "stETH")} + ${formatTokenAmount(wstethBalance, "wstETH")} (${formatEther(totalExposure)} stETH equivalent). Net APR: ${netAprPercent.toFixed(2)}%. Projected yearly: ${yearlyReward.toFixed(4)} stETH.`,
        });
      } catch (err) {
        return error(
          `Rewards query failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );
}
