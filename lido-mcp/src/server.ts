import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config.js";
import { createProvider, type Provider } from "./provider.js";

// Tool registrations
import { register as registerStatus } from "./tools/status/index.js";
import { register as registerStake } from "./tools/stake/index.js";
import { register as registerBalance } from "./tools/balance/index.js";
import { register as registerWrap } from "./tools/wrap/index.js";
import { register as registerWithdraw } from "./tools/withdraw/index.js";
import { register as registerWithdrawalStatus } from "./tools/withdrawal-status/index.js";
import { register as registerRewards } from "./tools/rewards/index.js";
import { register as registerProtocol } from "./tools/protocol/index.js";
import { register as registerGovernance } from "./tools/governance/index.js";
import { register as registerPosition } from "./tools/position/index.js";
import { register as registerL2Balances } from "./tools/l2-balances/index.js";
import { register as registerAllowance } from "./tools/allowance/index.js";
import { register as registerConvert } from "./tools/convert/index.js";
import { register as registerProtocolFee } from "./tools/protocol-fee/index.js";
import { register as registerStakingLimit } from "./tools/staking-limit/index.js";
import { register as registerStakingPaused } from "./tools/staking-paused/index.js";
import { register as registerTokenInfo } from "./tools/token-info/index.js";
import { register as registerBeaconStats } from "./tools/beacon-stats/index.js";
import { register as registerStakingModules } from "./tools/staking-modules/index.js";
import { register as registerNodeOperators } from "./tools/node-operators/index.js";
import { register as registerWithdrawalQueueInfo } from "./tools/withdrawal-queue-info/index.js";
import { register as registerWithdrawalRequests } from "./tools/withdrawal-requests/index.js";
import { register as registerClaimableEther } from "./tools/claimable-ether/index.js";
import { register as registerNftOwner } from "./tools/nft-owner/index.js";
import { register as registerBunkerMode } from "./tools/bunker-mode/index.js";
import { register as registerGovernanceRead } from "./tools/governance-read/index.js";
import { register as registerContractAddresses } from "./tools/contract-addresses/index.js";
import { register as registerSupportedChains } from "./tools/supported-chains/index.js";
import { register as registerStakeAndWrap } from "./tools/stake-and-wrap/index.js";
import { register as registerTransfer } from "./tools/transfer/index.js";
import { register as registerApprove } from "./tools/approve/index.js";
import { register as registerDelegate } from "./tools/delegate/index.js";
import { register as registerTransferLdo } from "./tools/transfer-ldo/index.js";
import { register as registerClaimSingle } from "./tools/claim-single/index.js";
import { register as registerClaimTo } from "./tools/claim-to/index.js";
import { register as registerTransferNft } from "./tools/transfer-nft/index.js";
import { register as registerApproveNft } from "./tools/approve-nft/index.js";
import { register as registerRevokeApprovals } from "./tools/revoke-approvals/index.js";
import { register as registerIncreaseAllowance } from "./tools/increase-allowance/index.js";
import { register as registerPrepare } from "./tools/prepare/index.js";
import { register as registerSummary } from "./tools/summary/index.js";

// ---------------------------------------------------------------------------
// Skill file loader
// ---------------------------------------------------------------------------

const FALLBACK_SKILL = `# Lido Skill
You are connected to a Lido MCP server. Use the available tools to interact with Lido liquid staking. Always dry_run first, then confirm with the user before executing.`;

function loadSkillContent(): string {
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    // In development: src/ -> project root
    // After build: dist/ -> project root
    const candidates = [
      path.resolve(thisDir, "..", "lido.skill.md"),
      path.resolve(thisDir, "lido.skill.md"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf-8");
      }
    }
  } catch {
    // Fall through to fallback
  }
  return FALLBACK_SKILL;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function createServer(): Promise<{
  server: McpServer;
  provider: Provider;
}> {
  const config = loadConfig();
  const provider = createProvider(config);

  const server = new McpServer({
    name: "lido-mcp",
    version: "0.1.0",
  });

  // ---- Resource: skill file ----
  const skillContent = loadSkillContent();
  server.resource("lido-skill", "lido://skill", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: skillContent,
        mimeType: "text/markdown",
      },
    ],
  }));

  // ---- Register all tools ----
  registerStatus(server, provider);
  registerBalance(server, provider);
  registerStake(server, provider);
  registerWrap(server, provider);
  registerWithdraw(server, provider);
  registerWithdrawalStatus(server, provider);
  registerRewards(server, provider);
  registerProtocol(server, provider);
  registerGovernance(server, provider);
  registerPosition(server, provider);
  registerL2Balances(server, provider);
  registerAllowance(server, provider);
  registerConvert(server, provider);
  registerProtocolFee(server, provider);
  registerStakingLimit(server, provider);
  registerStakingPaused(server, provider);
  registerTokenInfo(server, provider);
  registerBeaconStats(server, provider);
  registerStakingModules(server, provider);
  registerNodeOperators(server, provider);
  registerWithdrawalQueueInfo(server, provider);
  registerWithdrawalRequests(server, provider);
  registerClaimableEther(server, provider);
  registerNftOwner(server, provider);
  registerBunkerMode(server, provider);
  registerGovernanceRead(server, provider);
  registerContractAddresses(server, provider);
  registerSupportedChains(server, provider);
  registerStakeAndWrap(server, provider);
  registerTransfer(server, provider);
  registerApprove(server, provider);
  registerDelegate(server, provider);
  registerTransferLdo(server, provider);
  registerClaimSingle(server, provider);
  registerClaimTo(server, provider);
  registerTransferNft(server, provider);
  registerApproveNft(server, provider);
  registerRevokeApprovals(server, provider);
  registerIncreaseAllowance(server, provider);
  registerPrepare(server, provider);
  registerSummary(server, provider);

  return { server, provider };
}
