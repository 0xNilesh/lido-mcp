import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config.js";
import { createProvider, type Provider } from "./provider.js";

// Domain-level tool registrations
import { register as registerStaking } from "./tools/staking/index.js";
import { register as registerWrapping } from "./tools/wrapping/index.js";
import { register as registerWithdrawals } from "./tools/withdrawals/index.js";
import { register as registerTokens } from "./tools/tokens/index.js";
import { register as registerRewards } from "./tools/rewards/index.js";
import { register as registerPosition } from "./tools/position/index.js";
import { register as registerGovernance } from "./tools/governance/index.js";
import { register as registerEasyTrack } from "./tools/easy-track-gov/index.js";
import { register as registerDualGovernance } from "./tools/dual-governance-gov/index.js";
import { register as registerProtocol } from "./tools/protocol/index.js";
import { register as registerSystem } from "./tools/system/index.js";

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

  // ---- Register all tools by domain ----
  registerStaking(server, provider);
  registerWrapping(server, provider);
  registerWithdrawals(server, provider);
  registerTokens(server, provider);
  registerRewards(server, provider);
  registerPosition(server, provider);
  registerGovernance(server, provider);
  registerEasyTrack(server, provider);
  registerDualGovernance(server, provider);
  registerProtocol(server, provider);
  registerSystem(server, provider);

  return { server, provider };
}
