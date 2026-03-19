import { formatEther, formatGwei } from "viem";

interface ExecuteOrSimulateParams {
  publicClient: any;
  walletClient: any;
  account: any;
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args?: any[];
  value?: bigint;
  dryRun: boolean;
}

interface SimulationResult {
  status: "simulated";
  simulatedResult: any;
  estimatedGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCostEth: string;
}

interface ExecutionResult {
  status: "executed";
  transactionHash: string;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  txStatus: string;
}

interface ErrorResult {
  status: "error";
  message: string;
}

export type DryRunResult = SimulationResult | ExecutionResult | ErrorResult;

export async function executeOrSimulate(
  params: ExecuteOrSimulateParams
): Promise<DryRunResult> {
  const {
    publicClient,
    walletClient,
    account,
    address,
    abi,
    functionName,
    args = [],
    value,
    dryRun,
  } = params;

  try {
    // Always simulate first to validate the call
    const { request, result: simulatedResult } =
      await publicClient.simulateContract({
        account,
        address,
        abi,
        functionName,
        args,
        ...(value !== undefined && { value }),
      });

    if (dryRun) {
      // Estimate gas and fees for the simulation report
      const estimatedGas = await publicClient.estimateGas({
        account: account.address,
        to: address,
        data: request.data,
        ...(value !== undefined && { value }),
      });

      const feeData = await publicClient.estimateFeesPerGas();
      const maxFeePerGas: bigint = feeData.maxFeePerGas ?? 0n;
      const maxPriorityFeePerGas: bigint =
        feeData.maxPriorityFeePerGas ?? 0n;
      const estimatedCostWei = estimatedGas * maxFeePerGas;

      return {
        status: "simulated",
        simulatedResult:
          simulatedResult !== undefined
            ? String(simulatedResult)
            : undefined,
        estimatedGas: estimatedGas.toString(),
        maxFeePerGas: formatGwei(maxFeePerGas) + " gwei",
        maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas) + " gwei",
        estimatedCostEth: formatEther(estimatedCostWei) + " ETH",
      };
    }

    // Execute for real
    if (!walletClient) {
      return {
        status: "error",
        message:
          "No wallet configured. Set PRIVATE_KEY to execute transactions.",
      };
    }

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      status: "executed",
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice:
        formatGwei(receipt.effectiveGasPrice) + " gwei",
      txStatus: receipt.status === "success" ? "success" : "reverted",
    };
  } catch (err: unknown) {
    const e = err as { shortMessage?: string; message?: string } | undefined;
    const message =
      e?.shortMessage ?? e?.message ?? "Unknown error during execution";
    return {
      status: "error",
      message,
    };
  }
}
