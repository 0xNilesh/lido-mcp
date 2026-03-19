import { z } from "zod";
import { createPublicClient, formatEther, http } from "viem";
import { arbitrum, optimism, base, polygon } from "viem/chains";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { erc20Abi } from "../../abis/erc20.js";
import { withdrawalQueueAbi } from "../../abis/withdrawal-queue.js";
import { getContracts } from "../../contracts.js";
import {
  resolveChainId,
  getClient,
  getWalletAddress,
  formatTokenAmount,
  extractErrorMessage,
} from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** L2 wstETH addresses for cross-chain balance queries. */
const L2_WSTETH: ReadonlyArray<{
  name: string;
  chainId: number;
  chain: typeof arbitrum | typeof optimism | typeof base | typeof polygon;
  address: `0x${string}`;
}> = [
  {
    name: "Arbitrum",
    chainId: 42161,
    chain: arbitrum,
    address: "0x5979D7b546E38E414F7E9822514be443A4800529",
  },
  {
    name: "Optimism",
    chainId: 10,
    chain: optimism,
    address: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
  },
  {
    name: "Base",
    chainId: 8453,
    chain: base,
    address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  },
  {
    name: "Polygon",
    chainId: 137,
    chain: polygon,
    address: "0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD",
  },
];

/** Estimated net APR for projections. */
const ESTIMATED_NET_APR = 3.15; // ~3.15% net after protocol fee

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WithdrawalStatus {
  amountOfStETH: bigint;
  amountOfShares: bigint;
  owner: string;
  timestamp: bigint;
  isFinalized: boolean;
  isClaimed: boolean;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_get_position_overview",
    "Get a comprehensive overview of a Lido position including all Ethereum balances (ETH, stETH, wstETH, LDO), pending withdrawals, projected rewards, and optionally L2 wstETH balances.",
    {
      address: z
        .string()
        .optional()
        .describe(
          "Ethereum address to query. Defaults to the configured wallet.",
        ),
      include_l2: z
        .boolean()
        .default(false)
        .describe(
          "Include wstETH balances on L2 chains (Arbitrum, Optimism, Base, Polygon). Slower due to cross-chain RPC calls.",
        ),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { address?: string; include_l2: boolean; chain_id?: number }) => {
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

        // --- Ethereum Balances (multicall) ---
        const ethBalancePromise = client.getBalance({
          address: walletAddress,
        });

        const multicallPromise = client.multicall({
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
              address: contracts.ldo,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [walletAddress],
            },
            {
              address: contracts.wsteth,
              abi: wstethAbi,
              functionName: "getStETHByWstETH",
              args: [1_000_000_000_000_000_000n], // 1 wstETH in stETH
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
          ],
        });

        // --- Withdrawal Requests ---
        const withdrawalPromise = (async () => {
          try {
            const requestIds = (await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "getWithdrawalRequests",
              args: [walletAddress],
            })) as bigint[];

            if (requestIds.length === 0) {
              return { requestIds: [], statuses: [], claimableAmounts: [] };
            }

            const statuses = (await client.readContract({
              address: contracts.withdrawalQueue,
              abi: withdrawalQueueAbi,
              functionName: "getWithdrawalStatus",
              args: [requestIds],
            })) as WithdrawalStatus[];

            // Get claimable ether for finalized unclaimed requests
            const finalizedIds: bigint[] = [];
            for (let i = 0; i < statuses.length; i++) {
              const st = statuses[i];
              const rid = requestIds[i];
              if (st && rid && st.isFinalized && !st.isClaimed) {
                finalizedIds.push(rid);
              }
            }

            let claimableAmounts: bigint[] = [];
            if (finalizedIds.length > 0) {
              try {
                const lastCheckpointIndex =
                  (await client.readContract({
                    address: contracts.withdrawalQueue,
                    abi: withdrawalQueueAbi,
                    functionName: "getLastCheckpointIndex",
                  })) as bigint;

                const hints = (await client.readContract({
                  address: contracts.withdrawalQueue,
                  abi: withdrawalQueueAbi,
                  functionName: "findCheckpointHints",
                  args: [finalizedIds, 1n, lastCheckpointIndex],
                })) as bigint[];

                claimableAmounts = (await client.readContract({
                  address: contracts.withdrawalQueue,
                  abi: withdrawalQueueAbi,
                  functionName: "getClaimableEther",
                  args: [finalizedIds, hints],
                })) as bigint[];
              } catch {
                // Continue without claimable amounts
              }
            }

            return {
              requestIds,
              statuses,
              claimableAmounts,
              finalizedIds,
            };
          } catch {
            return { requestIds: [], statuses: [], claimableAmounts: [] };
          }
        })();

        // --- L2 Balances (optional) ---
        const l2Promise = args.include_l2
          ? Promise.allSettled(
              L2_WSTETH.map(async (l2) => {
                const client = createPublicClient({
                  chain: l2.chain,
                  transport: http(),
                });

                const l2Balance = (await client.readContract({
                  address: l2.address,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [walletAddress],
                })) as bigint;

                return {
                  chain: l2.name,
                  chain_id: l2.chainId,
                  wsteth_address: l2.address,
                  balance: formatTokenAmount(l2Balance, "wstETH"),
                  balance_raw: l2Balance,
                };
              }),
            )
          : Promise.resolve(null);

        // Await all promises
        const [ethBalance, multicallResults, withdrawalData, l2Results] =
          await Promise.all([
            ethBalancePromise,
            multicallPromise,
            withdrawalPromise,
            l2Promise,
          ]);

        // --- Extract multicall results ---
        const stethBalance =
          multicallResults[0]?.status === "success"
            ? (multicallResults[0].result as bigint)
            : 0n;
        const shares =
          multicallResults[1]?.status === "success"
            ? (multicallResults[1].result as bigint)
            : 0n;
        const wstethBalance =
          multicallResults[2]?.status === "success"
            ? (multicallResults[2].result as bigint)
            : 0n;
        const ldoBalance =
          multicallResults[3]?.status === "success"
            ? (multicallResults[3].result as bigint)
            : 0n;
        const stethPerWsteth =
          multicallResults[4]?.status === "success"
            ? (multicallResults[4].result as bigint)
            : 1_000_000_000_000_000_000n;
        const totalPooledEther =
          multicallResults[5]?.status === "success"
            ? (multicallResults[5].result as bigint)
            : 0n;
        const totalShares =
          multicallResults[6]?.status === "success"
            ? (multicallResults[6].result as bigint)
            : 0n;

        // --- Compute derived values ---
        const wstethAsSteth =
          (wstethBalance * stethPerWsteth) / 1_000_000_000_000_000_000n;
        const totalStethExposure = stethBalance + wstethAsSteth;

        let shareRate = "N/A";
        if (totalShares > 0n) {
          const rate =
            Number(
              (totalPooledEther * 1_000_000_000_000_000_000n) / totalShares,
            ) / 1e18;
          shareRate = rate.toFixed(6) + " ETH/share";
        }

        // --- Ethereum balances ---
        const ethereumBalances: Record<string, unknown> = {
          eth: formatTokenAmount(ethBalance, "ETH"),
          steth: formatTokenAmount(stethBalance, "stETH"),
          wsteth: formatTokenAmount(wstethBalance, "wstETH"),
          wsteth_as_steth: formatEther(wstethAsSteth) + " stETH equivalent",
          ldo: formatTokenAmount(ldoBalance, "LDO"),
          shares: shares.toString(),
          total_steth_exposure:
            formatEther(totalStethExposure) + " stETH equivalent",
        };

        // --- L2 balances ---
        let l2Balances: Array<Record<string, unknown>> | null = null;
        let l2TotalWsteth = 0n;
        if (l2Results && Array.isArray(l2Results)) {
          l2Balances = [];
          for (const result of l2Results) {
            if (result.status === "fulfilled") {
              l2Balances.push({
                chain: result.value.chain,
                chain_id: result.value.chain_id,
                wsteth: result.value.balance,
              });
              l2TotalWsteth += result.value.balance_raw;
            } else {
              l2Balances.push({
                chain: "unknown",
                error: "Failed to fetch balance",
              });
            }
          }
        }

        // --- Withdrawal summary ---
        const withdrawalSummary: Record<string, unknown> = {
          total_requests: withdrawalData.requestIds.length,
        };

        if (withdrawalData.requestIds.length > 0) {
          let pendingCount = 0;
          let finalizedCount = 0;
          let claimedCount = 0;
          let pendingSteth = 0n;
          let totalClaimable = 0n;

          for (const s of withdrawalData.statuses) {
            if (s.isClaimed) {
              claimedCount++;
            } else if (s.isFinalized) {
              finalizedCount++;
            } else {
              pendingCount++;
              pendingSteth += s.amountOfStETH;
            }
          }

          if (withdrawalData.claimableAmounts) {
            for (const amt of withdrawalData.claimableAmounts) {
              totalClaimable += amt;
            }
          }

          withdrawalSummary.pending = pendingCount;
          withdrawalSummary.ready_to_claim = finalizedCount;
          withdrawalSummary.claimed = claimedCount;
          withdrawalSummary.pending_steth =
            pendingSteth > 0n
              ? formatTokenAmount(pendingSteth, "stETH")
              : "0 stETH";
          withdrawalSummary.claimable_eth =
            totalClaimable > 0n
              ? formatTokenAmount(totalClaimable, "ETH")
              : "0 ETH";

          if (
            finalizedCount > 0 &&
            withdrawalData.finalizedIds
          ) {
            withdrawalSummary.claimable_request_ids = (
              withdrawalData.finalizedIds as bigint[]
            ).map((id) => id.toString());
          }
        }

        // --- Rewards projections ---
        const l2WstethAsSteth =
          (l2TotalWsteth * stethPerWsteth) / 1_000_000_000_000_000_000n;
        const allChainsExposure = totalStethExposure + l2WstethAsSteth;
        const exposureNum = Number(formatEther(allChainsExposure));

        const dailyReward = (exposureNum * ESTIMATED_NET_APR) / 100 / 365;
        const weeklyReward = dailyReward * 7;
        const monthlyReward = (exposureNum * ESTIMATED_NET_APR) / 100 / 12;
        const yearlyReward = (exposureNum * ESTIMATED_NET_APR) / 100;

        const rewardsProjection: Record<string, unknown> = {
          estimated_net_apr: ESTIMATED_NET_APR.toFixed(2) + "%",
          total_staking_exposure:
            formatEther(allChainsExposure) +
            " stETH equivalent (all chains)",
          daily: dailyReward.toFixed(6) + " stETH",
          weekly: weeklyReward.toFixed(6) + " stETH",
          monthly: monthlyReward.toFixed(6) + " stETH",
          yearly: yearlyReward.toFixed(6) + " stETH",
        };

        // --- Build human-readable summary ---
        const summaryLines: string[] = [];
        summaryLines.push(`Position overview for ${walletAddress}`);
        summaryLines.push("---");
        summaryLines.push(
          `Ethereum: ${formatEther(stethBalance)} stETH + ${formatEther(wstethBalance)} wstETH (${formatEther(totalStethExposure)} stETH equivalent)`,
        );
        if (l2TotalWsteth > 0n) {
          summaryLines.push(
            `L2 Chains: ${formatEther(l2TotalWsteth)} wstETH total`,
          );
        }
        summaryLines.push(
          `Total staking exposure: ${formatEther(allChainsExposure)} stETH equivalent`,
        );
        if (withdrawalData.requestIds.length > 0) {
          const ready = withdrawalData.statuses.filter(
            (s) => s.isFinalized && !s.isClaimed,
          ).length;
          const pending = withdrawalData.statuses.filter(
            (s) => !s.isFinalized && !s.isClaimed,
          ).length;
          if (ready > 0) {
            summaryLines.push(`Withdrawals: ${ready} ready to claim`);
          }
          if (pending > 0) {
            summaryLines.push(`Withdrawals: ${pending} pending`);
          }
        }
        summaryLines.push(
          `Projected yearly rewards: ~${yearlyReward.toFixed(4)} stETH (${ESTIMATED_NET_APR}% APR)`,
        );

        const positionResult: Record<string, unknown> = {
          address: walletAddress,
          chain:
            chainId === 1
              ? "Ethereum Mainnet"
              : chainId === 560048
                ? "Hoodi Testnet"
                : "Holesky Testnet",
          ethereum_balances: ethereumBalances,
          exchange_rate: {
            steth_per_wsteth: formatEther(stethPerWsteth),
            share_rate: shareRate,
          },
          pending_withdrawals: withdrawalSummary,
          rewards_projection: rewardsProjection,
          summary: summaryLines.join("\n"),
        };

        if (l2Balances !== null) {
          positionResult.l2_balances = l2Balances;
          if (l2TotalWsteth > 0n) {
            positionResult.l2_total_wsteth =
              formatTokenAmount(l2TotalWsteth, "wstETH");
          }
        }

        return success(positionResult);
      } catch (err) {
        return error(
          `Position overview failed: ${extractErrorMessage(err, "Unknown error")}. Check the address and RPC connection.`,
        );
      }
    },
  );
}
