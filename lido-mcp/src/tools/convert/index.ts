import { z } from "zod";
import { formatEther, parseEther } from "viem";
import { success, error } from "../../utils/format.js";
import { lidoAbi } from "../../abis/lido.js";
import { wstethAbi } from "../../abis/wsteth.js";
import { getContracts } from "../../contracts.js";
import { resolveChainId,
  getClient, extractErrorMessage } from "../../utils/helpers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Provider } from "../../provider.js";

export function register(server: McpServer, provider: Provider): void {
  server.tool(
    "lido_convert",
    "Convert between stETH, wstETH, shares, and ETH amounts using on-chain exchange rates",
    {
      amount: z.string().describe('Amount to convert (e.g. "1.5")'),
      from: z
        .enum(["stETH", "wstETH", "shares", "ETH"])
        .describe("Source unit"),
      to: z
        .enum(["stETH", "wstETH", "shares", "ETH"])
        .describe("Target unit"),
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { amount: string; from: string; to: string; chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);

        const amountWei = parseEther(args.amount);

        if (args.from === args.to) {
          return success({
            input: args.amount,
            from: args.from,
            to: args.to,
            result: args.amount,
            summary: `${args.amount} ${args.from} = ${args.amount} ${args.to} (same unit)`,
          });
        }

        let result: bigint;

        if ((args.from === "stETH" || args.from === "ETH") && args.to === "wstETH") {
          result = (await client.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getWstETHByStETH",
            args: [amountWei],
          })) as bigint;
        } else if (args.from === "wstETH" && (args.to === "stETH" || args.to === "ETH")) {
          result = (await client.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getStETHByWstETH",
            args: [amountWei],
          })) as bigint;
        } else if ((args.from === "stETH" || args.from === "ETH") && args.to === "shares") {
          result = (await client.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "getSharesByPooledEth",
            args: [amountWei],
          })) as bigint;
        } else if (args.from === "shares" && (args.to === "stETH" || args.to === "ETH")) {
          result = (await client.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "getPooledEthByShares",
            args: [amountWei],
          })) as bigint;
        } else if (args.from === "wstETH" && args.to === "shares") {
          const steth = (await client.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getStETHByWstETH",
            args: [amountWei],
          })) as bigint;
          result = (await client.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "getSharesByPooledEth",
            args: [steth],
          })) as bigint;
        } else if (args.from === "shares" && args.to === "wstETH") {
          const steth = (await client.readContract({
            address: contracts.lido,
            abi: lidoAbi,
            functionName: "getPooledEthByShares",
            args: [amountWei],
          })) as bigint;
          result = (await client.readContract({
            address: contracts.wsteth,
            abi: wstethAbi,
            functionName: "getWstETHByStETH",
            args: [steth],
          })) as bigint;
        } else {
          // stETH <-> ETH is 1:1 (rebasing)
          result = amountWei;
        }

        return success({
          input: args.amount,
          from: args.from,
          to: args.to,
          result: formatEther(result),
          result_raw: result.toString(),
          summary: `${args.amount} ${args.from} = ${formatEther(result)} ${args.to}`,
        });
      } catch (err) {
        return error(
          `Conversion failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_exchange_rates",
    "Get current exchange rates between stETH, wstETH, shares, and ETH",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const results = await client.multicall({
          contracts: [
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

        const stEthPerToken = results[0]?.status === "success" ? (results[0].result as bigint) : null;
        const tokensPerStEth = results[1]?.status === "success" ? (results[1].result as bigint) : null;
        const totalPooledEther = results[2]?.status === "success" ? (results[2].result as bigint) : null;
        const totalShares = results[3]?.status === "success" ? (results[3].result as bigint) : null;

        const shareRate =
          totalPooledEther !== null && totalShares !== null && totalShares > 0n
            ? formatEther((totalPooledEther * BigInt(1e18)) / totalShares)
            : null;

        return success({
          stETH_per_wstETH: stEthPerToken !== null ? formatEther(stEthPerToken) : null,
          wstETH_per_stETH: tokensPerStEth !== null ? formatEther(tokensPerStEth) : null,
          total_pooled_ether: totalPooledEther !== null ? formatEther(totalPooledEther) : null,
          total_shares: totalShares !== null ? formatEther(totalShares) : null,
          share_rate: shareRate,
          summary: `Exchange rates: 1 wstETH = ${stEthPerToken !== null ? formatEther(stEthPerToken) : "unknown"} stETH, share rate = ${shareRate ?? "unknown"}.`,
        });
      } catch (err) {
        return error(
          `Exchange rates query failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );

  server.tool(
    "lido_get_share_rate",
    "Get the current share rate (total pooled ether / total shares) from the Lido contract",
    {
      chain_id: z.number().optional().describe('Chain ID to query (1=mainnet, 17000=holesky, 560048=hoodi). Defaults to server chain.'),
    },
    async (args: { chain_id?: number }) => {
      try {
        const chainId = resolveChainId(provider, args.chain_id);
        const contracts = getContracts(chainId);
        const client = getClient(provider, args.chain_id);
        const results = await client.multicall({
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
          ],
        });

        const totalPooledEther = results[0]?.status === "success" ? (results[0].result as bigint) : null;
        const totalShares = results[1]?.status === "success" ? (results[1].result as bigint) : null;

        if (totalPooledEther === null || totalShares === null) {
          return error("Failed to read totalPooledEther or totalShares from the Lido contract.");
        }

        const shareRate = totalShares > 0n
          ? formatEther((totalPooledEther * BigInt(1e18)) / totalShares)
          : "0";

        return success({
          total_pooled_ether: formatEther(totalPooledEther),
          total_pooled_ether_raw: totalPooledEther.toString(),
          total_shares: formatEther(totalShares),
          total_shares_raw: totalShares.toString(),
          share_rate: shareRate,
          summary: `Share rate: ${shareRate} (totalPooledEther=${formatEther(totalPooledEther)}, totalShares=${formatEther(totalShares)}).`,
        });
      } catch (err) {
        return error(
          `Share rate query failed: ${extractErrorMessage(err, "Unknown error")}. Check RPC connection.`,
        );
      }
    },
  );
}
