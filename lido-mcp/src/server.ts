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

  return { server, provider };
}
