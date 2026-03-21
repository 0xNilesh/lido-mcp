import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "readline";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ChainConfig {
  rpcUrl: string;
  privateKey?: string;
}

interface FullConfig {
  activeChain: number;
  chains: Record<string, ChainConfig>;
}

// Backward-compatible Config type used throughout the app
interface Config {
  rpcUrl: string;
  privateKey?: string;
  chainId: number;
}

const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".lido-mcp"
);
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function loadFullConfig(): FullConfig {
  const defaults: FullConfig = {
    activeChain: 560048,
    chains: {
      "1": { rpcUrl: "https://eth.drpc.org" },
      "17000": { rpcUrl: "https://holesky.drpc.org" },
      "560048": { rpcUrl: "https://hoodi.drpc.org" },
    },
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      // Handle old flat config format
      if (saved.rpcUrl && !saved.chains) {
        return {
          activeChain: saved.chainId || 560048,
          chains: {
            ...defaults.chains,
            [String(saved.chainId || 560048)]: { rpcUrl: saved.rpcUrl, privateKey: saved.privateKey },
          },
        };
      }
      return { ...defaults, ...saved, chains: { ...defaults.chains, ...(saved.chains || {}) } };
    }
  } catch { /* ignore */ }
  return defaults;
}

function loadConfig(): Config {
  const full = loadFullConfig();
  const active = full.chains[String(full.activeChain)] || full.chains["560048"]!;
  return { rpcUrl: active.rpcUrl, privateKey: active.privateKey, chainId: full.activeChain };
}

function saveFullConfig(config: FullConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function saveConfig(config: Config): void {
  const full = loadFullConfig();
  full.activeChain = config.chainId;
  full.chains[String(config.chainId)] = { rpcUrl: config.rpcUrl, privateKey: config.privateKey };
  saveFullConfig(full);
}

// ---------------------------------------------------------------------------
// Readline helpers
// ---------------------------------------------------------------------------

function createRL(): ReturnType<typeof createInterface> {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

// ---------------------------------------------------------------------------
// Find MCP server
// ---------------------------------------------------------------------------

function findMcpServer(): { command: string; args: string[] } {
  // 1. Development sibling folder (for local dev)
  const devPath = path.resolve(__dirname, "..", "..", "mcp", "dist", "index.js");
  if (fs.existsSync(devPath)) return { command: "node", args: [devPath] };

  // 2. Use published npm package (npx lido-mcp)
  return { command: "npx", args: ["-y", "lido-mcp"] };
}

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: any;
}

let client: Client | null = null;
let toolsList: ToolInfo[] = [];

async function connectToMcp(): Promise<Client> {
  if (client) return client;

  const server = findMcpServer();
  const config = loadConfig();

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ETHEREUM_RPC_URL: config.rpcUrl,
    CHAIN_ID: String(config.chainId),
  };
  if (config.privateKey) {
    env.PRIVATE_KEY = config.privateKey;
  }

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env,
  });

  client = new Client({ name: "lido-cli", version: "0.1.0" });
  await client.connect(transport);

  // Fetch available tools
  const res = await client.listTools();
  toolsList = (res.tools || []).map((t: any) => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema,
  }));

  return client;
}

async function callTool(name: string, args: Record<string, any>): Promise<any> {
  const c = await connectToMcp();
  const result = await c.callTool({ name, arguments: args });
  return result;
}

// ---------------------------------------------------------------------------
// Category helpers
// ---------------------------------------------------------------------------

interface Category {
  name: string;
  pattern: RegExp;
}

const CATEGORIES: Category[] = [
  { name: "Staking", pattern: /stake|staking|beacon/ },
  { name: "Wrapping", pattern: /^lido_(wrap|unwrap)$/ },
  { name: "Withdrawals", pattern: /withdrawal|withdraw|claim|bunker|nft/ },
  { name: "Tokens", pattern: /transfer|approve|revoke|allowance|balance|token_info|convert|exchange|share_rate/ },
  { name: "Rewards", pattern: /reward/ },
  { name: "Position", pattern: /position|l2_balance|summary|monitor/ },
  { name: "Governance", pattern: /(?<!(easy_track|dual)).*?(vote|voter|delegate)/ },
  { name: "Easy Track", pattern: /easy_track|motion/ },
  { name: "Dual Governance", pattern: /dual_governance|governance_overview/ },
  { name: "stVaults", pattern: /vault/ },
  { name: "Protocol", pattern: /protocol|staking_module|node_operator|contract_address|supported_chain/ },
  { name: "System", pattern: /status|prepare/ },
];

function categorize(tools: ToolInfo[]): Map<string, ToolInfo[]> {
  const map = new Map<string, ToolInfo[]>();
  const assigned = new Set<string>();

  for (const cat of CATEGORIES) {
    const matched = tools.filter((t) => cat.pattern.test(t.name) && !assigned.has(t.name));
    if (matched.length > 0) {
      map.set(cat.name, matched);
      matched.forEach((t) => assigned.add(t.name));
    }
  }

  const uncategorized = tools.filter((t) => !assigned.has(t.name));
  if (uncategorized.length > 0) {
    map.set("Other", uncategorized);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function banner(): void {
  console.log("");
  console.log(chalk.cyan.bold("  Lido MCP CLI"));
  console.log(chalk.gray("  Interact with 67 Lido staking tools from your terminal"));
  console.log(chalk.gray("  -------------------------------------------------------"));
  console.log("");
}

function printToolResult(result: any): void {
  if (!result) {
    console.log(chalk.yellow("No result returned."));
    return;
  }

  // MCP callTool returns { content: [{ type, text }] }
  const contents = result.content || result;
  if (Array.isArray(contents)) {
    for (const item of contents) {
      if (item.type === "text" && item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.summary) {
            console.log(chalk.green.bold("\nSummary:"));
            console.log(chalk.white(parsed.summary));
            console.log("");
          }
          if (parsed.details || parsed.data || parsed.result) {
            const detail = parsed.details || parsed.data || parsed.result;
            console.log(chalk.cyan("Details:"));
            console.log(prettyPrint(detail));
          }
          // If no summary/details, just pretty print the whole thing
          if (!parsed.summary && !parsed.details && !parsed.data && !parsed.result) {
            console.log(prettyPrint(parsed));
          }
        } catch {
          // Not JSON, print as-is
          console.log(item.text);
        }
      } else if (item.text) {
        console.log(item.text);
      }
    }
  } else if (typeof contents === "string") {
    console.log(contents);
  } else {
    console.log(prettyPrint(contents));
  }
}

function prettyPrint(obj: any, indent = 0): string {
  if (obj === null || obj === undefined) return chalk.gray("null");
  if (typeof obj === "string") return chalk.white(obj);
  if (typeof obj === "number") return chalk.yellow(String(obj));
  if (typeof obj === "boolean") return obj ? chalk.green("true") : chalk.red("false");

  const pad = "  ".repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return chalk.gray("[]");
    return obj.map((item, i) => `${pad}  ${chalk.gray(`[${i}]`)} ${prettyPrint(item, indent + 1)}`).join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj);
    if (entries.length === 0) return chalk.gray("{}");
    return entries
      .map(([k, v]) => {
        const val = typeof v === "object" && v !== null ? "\n" + prettyPrint(v, indent + 1) : " " + prettyPrint(v, indent + 1);
        return `${pad}  ${chalk.cyan(k)}:${val}`;
      })
      .join("\n");
  }

  return String(obj);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const DEFAULT_RPCS: Record<number, string> = {
  1: "https://eth.drpc.org",
  17000: "https://holesky.drpc.org",
  560048: "https://hoodi.drpc.org",
};

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  17000: "Holesky Testnet",
  560048: "Hoodi Testnet",
};

async function cmdSetup(): Promise<void> {
  const rl = createRL();
  const config = loadConfig();

  console.log(chalk.cyan.bold("\n  Lido MCP Setup Wizard\n"));

  // 1. Chain ID first
  const chainIdStr = await ask(
    rl,
    chalk.white(`  Chain ID [1=mainnet, 17000=holesky, 560048=hoodi] ${chalk.gray(`(${config.chainId})`)}: `)
  );
  const chainId = chainIdStr ? parseInt(chainIdStr, 10) : config.chainId;
  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
  const defaultRpc = DEFAULT_RPCS[chainId] || "https://hoodi.drpc.org";

  console.log(chalk.gray(`  → ${chainName}\n`));

  // 2. RPC URL — show the default public RPC for the selected chain
  const rpcUrl = await ask(
    rl,
    chalk.white(`  RPC URL ${chalk.gray(`(${defaultRpc})`)}: `)
  );

  // 3. Private key
  const privateKey = await ask(
    rl,
    chalk.white(`  Private key ${chalk.gray("(optional, press Enter to skip)")}: `)
  );

  const newConfig: Config = {
    rpcUrl: rpcUrl || defaultRpc,
    chainId,
  };
  if (privateKey) {
    newConfig.privateKey = privateKey;
  } else if (config.privateKey) {
    newConfig.privateKey = config.privateKey;
  }

  saveConfig(newConfig);
  console.log(chalk.green(`\n  ✓ Config saved to ${CONFIG_PATH}`));
  console.log(chalk.gray(`    Chain: ${chainName} (${chainId})`));
  console.log(chalk.gray(`    RPC: ${newConfig.rpcUrl}`));
  console.log(chalk.gray(`    Wallet: ${newConfig.privateKey ? "configured" : "read-only"}\n`));
  rl.close();
}

async function cmdTools(): Promise<void> {
  const spinner = ora("Connecting to MCP server...").start();
  try {
    await connectToMcp();
    spinner.succeed("Connected to MCP server");
  } catch (e: any) {
    spinner.fail("Failed to connect to MCP server");
    console.log(chalk.red(`  ${e.message}`));
    process.exit(1);
  }

  console.log(chalk.cyan.bold(`\n  Lido MCP Tools (${toolsList.length} total)\n`));

  const grouped = categorize(toolsList);
  for (const [category, tools] of grouped) {
    console.log(chalk.yellow.bold(`  ${category} (${tools.length})`));
    for (const tool of tools) {
      const desc = tool.description ? chalk.gray(` - ${tool.description.slice(0, 80)}`) : "";
      console.log(`    ${chalk.white(tool.name)}${desc}`);
    }
    console.log("");
  }
}

async function cmdStatus(): Promise<void> {
  const spinner = ora("Fetching Lido status...").start();
  try {
    await connectToMcp();
    const result = await callTool("lido_status", {});
    spinner.succeed("Lido status retrieved");
    printToolResult(result);
  } catch (e: any) {
    spinner.fail("Failed to get status");
    console.log(chalk.red(`  ${e.message}`));
    process.exit(1);
  }
}

async function cmdSearch(query: string): Promise<void> {
  const spinner = ora("Connecting to MCP server...").start();
  try {
    await connectToMcp();
    spinner.succeed("Connected");
  } catch (e: any) {
    spinner.fail("Failed to connect");
    console.log(chalk.red(`  ${e.message}`));
    process.exit(1);
  }

  const q = query.toLowerCase();
  console.log(chalk.cyan(`\n  Searching for: "${query}"\n`));

  // Intent detection — specific patterns first
  const voteMatch = q.match(/(?:proposal|vote)\s*#?\s*(\d+)/);
  if (voteMatch) {
    const voteId = parseInt(voteMatch[1]!, 10);
    const execSpinner = ora(`Fetching vote #${voteId}...`).start();
    try {
      const result = await callTool("lido_get_vote_details", { vote_id: voteId, chain_id: 1 });
      execSpinner.succeed(`Vote #${voteId}`);
      printToolResult(result);
    } catch (e: any) {
      execSpinner.fail(e.message);
    }
    return;
  }

  // Keyword scoring against tool names + descriptions
  const scored = toolsList.map((t) => {
    const haystack = `${t.name.replace(/_/g, " ")} ${t.description || ""}`.toLowerCase();
    let score = 0;
    for (const word of q.split(/\s+/)) {
      if (word.length > 2 && haystack.includes(word)) score += 2;
    }
    if (t.name.toLowerCase().includes(q.replace(/\s+/g, "_"))) score += 5;
    return { tool: t, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    console.log(chalk.yellow("  No matching tools found."));
    console.log(chalk.gray("  Try: 'lido search balance', 'lido search stake', 'lido search governance'"));
    return;
  }

  console.log(chalk.white(`  Top matches:\n`));
  const top = scored.slice(0, 8);
  top.forEach((s, i) => {
    const desc = s.tool.description ? chalk.gray(` — ${s.tool.description.slice(0, 70)}`) : "";
    const scoreBar = chalk.green("█".repeat(Math.min(s.score, 10)));
    console.log(`    ${chalk.yellow(`${i + 1}.`)} ${chalk.cyan(s.tool.name)}${desc}`);
    console.log(`       ${scoreBar} ${chalk.gray(`score: ${s.score}`)}`);
  });

  // Auto-execute the best match if it has no required params (or only address/chain_id)
  const best = scored[0]!;
  const schema = best.tool.inputSchema;
  const required = schema?.required?.filter((r: string) => r !== "address" && r !== "chain_id") || [];

  if (required.length === 0) {
    console.log(chalk.cyan(`\n  Auto-executing best match: ${best.tool.name}\n`));
    const execSpinner = ora(`Running ${best.tool.name}...`).start();
    try {
      const result = await callTool(best.tool.name, {});
      execSpinner.succeed(`${best.tool.name} completed`);
      printToolResult(result);
    } catch (e: any) {
      execSpinner.fail(e.message);
    }
  } else {
    console.log(chalk.gray(`\n  Run: lido ${best.tool.name} --${required[0]} <value>`));
  }
}

async function cmdDirect(toolName: string, rawArgs: string[]): Promise<void> {
  // Parse --key value pairs
  const args: Record<string, any> = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = rawArgs[i + 1];
      if (val === undefined || val.startsWith("--")) {
        args[key] = true;
      } else {
        // Try to parse as number/boolean/JSON
        if (val === "true") args[key] = true;
        else if (val === "false") args[key] = false;
        else if (/^\d+$/.test(val)) args[key] = parseInt(val, 10);
        else if (/^\d+\.\d+$/.test(val)) args[key] = parseFloat(val);
        else args[key] = val;
        i++;
      }
    }
  }

  const spinner = ora(`Running ${chalk.cyan(toolName)}...`).start();
  try {
    await connectToMcp();

    // Verify tool exists
    const tool = toolsList.find((t) => t.name === toolName);
    if (!tool) {
      spinner.fail(`Tool "${toolName}" not found`);
      console.log(chalk.yellow("\n  Available tools:"));
      // Show closest matches
      const matches = toolsList
        .filter((t) => t.name.includes(toolName) || toolName.includes(t.name))
        .slice(0, 5);
      if (matches.length > 0) {
        matches.forEach((t) => console.log(`    ${chalk.white(t.name)}`));
      } else {
        console.log(chalk.gray("    Run 'lido tools' to see all available tools."));
      }
      process.exit(1);
    }

    const result = await callTool(toolName, args);
    spinner.succeed(`${toolName} completed`);
    printToolResult(result);
  } catch (e: any) {
    spinner.fail(`${toolName} failed`);
    console.log(chalk.red(`  ${e.message}`));
    process.exit(1);
  }
}

async function cmdInteractive(): Promise<void> {
  banner();

  const spinner = ora("Connecting to MCP server...").start();
  try {
    await connectToMcp();
    spinner.succeed(`Connected — ${toolsList.length} tools available`);
  } catch (e: any) {
    spinner.fail("Failed to connect to MCP server");
    console.log(chalk.red(`  ${e.message}`));
    console.log(chalk.yellow("  Run 'lido setup' to configure your RPC URL and credentials."));
    process.exit(1);
  }

  const rl = createRL();
  const grouped = categorize(toolsList);

  // Show categories
  console.log(chalk.cyan("\n  Categories:\n"));
  const catNames = [...grouped.keys()];
  catNames.forEach((name, i) => {
    const count = grouped.get(name)!.length;
    console.log(`    ${chalk.yellow(`${i + 1}.`)} ${chalk.white(name)} ${chalk.gray(`(${count} tools)`)}`);
  });

  console.log("");
  const catChoice = await ask(rl, chalk.white("  Select a category (number): "));
  const catIdx = parseInt(catChoice, 10) - 1;

  if (isNaN(catIdx) || catIdx < 0 || catIdx >= catNames.length) {
    console.log(chalk.red("  Invalid selection."));
    rl.close();
    return;
  }

  const selectedCat = catNames[catIdx];
  const catTools = grouped.get(selectedCat)!;

  // Show tools in selected category
  console.log(chalk.cyan(`\n  ${selectedCat} Tools:\n`));
  catTools.forEach((tool, i) => {
    const desc = tool.description ? chalk.gray(` - ${tool.description.slice(0, 70)}`) : "";
    console.log(`    ${chalk.yellow(`${i + 1}.`)} ${chalk.white(tool.name)}${desc}`);
  });

  console.log("");
  const toolChoice = await ask(rl, chalk.white("  Select a tool (number): "));
  const toolIdx = parseInt(toolChoice, 10) - 1;

  if (isNaN(toolIdx) || toolIdx < 0 || toolIdx >= catTools.length) {
    console.log(chalk.red("  Invalid selection."));
    rl.close();
    return;
  }

  const selectedTool = catTools[toolIdx];

  // Prompt for parameters
  const args: Record<string, any> = {};
  const schema = selectedTool.inputSchema;
  if (schema && schema.properties) {
    const props = schema.properties as Record<string, any>;
    const required = new Set<string>(schema.required || []);

    console.log(chalk.cyan(`\n  Parameters for ${selectedTool.name}:\n`));

    for (const [key, propSchema] of Object.entries(props)) {
      const isRequired = required.has(key);
      const typeHint = (propSchema as any).type || "string";
      const desc = (propSchema as any).description || "";
      const defaultVal = (propSchema as any).default;

      const label = isRequired
        ? chalk.white(`  ${key}`) + chalk.red(" *")
        : chalk.white(`  ${key}`) + chalk.gray(" (optional)");

      const hint = desc ? chalk.gray(` [${desc.slice(0, 50)}]`) : "";
      const defHint = defaultVal !== undefined ? chalk.gray(` (default: ${defaultVal})`) : "";

      const val = await ask(rl, `${label}${hint}${defHint}: `);

      if (val) {
        // Parse value based on type
        if (typeHint === "boolean") {
          args[key] = val === "true" || val === "1" || val === "yes";
        } else if (typeHint === "number" || typeHint === "integer") {
          args[key] = Number(val);
        } else {
          args[key] = val;
        }
      } else if (isRequired && defaultVal !== undefined) {
        args[key] = defaultVal;
      }
    }
  }

  console.log("");
  const execSpinner = ora(`Running ${chalk.cyan(selectedTool.name)}...`).start();
  try {
    const result = await callTool(selectedTool.name, args);
    execSpinner.succeed(`${selectedTool.name} completed`);
    printToolResult(result);
  } catch (e: any) {
    execSpinner.fail(`${selectedTool.name} failed`);
    console.log(chalk.red(`  ${e.message}`));
  }

  rl.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await cmdInteractive();
  } else if (args[0] === "setup") {
    await cmdSetup();
  } else if (args[0] === "tools") {
    await cmdTools();
  } else if (args[0] === "status") {
    await cmdStatus();
  } else if (args[0] === "config") {
    const full = loadFullConfig();
    const activeChainName = CHAIN_NAMES[full.activeChain] || `Chain ${full.activeChain}`;
    console.log(chalk.cyan.bold("\n  Lido MCP Configuration\n"));
    console.log(`  ${chalk.gray("Config file:")}   ${CONFIG_PATH}`);
    console.log(`  ${chalk.gray("Active chain:")}  ${chalk.white(activeChainName)} ${chalk.gray(`(${full.activeChain})`)}`);
    console.log("");
    console.log(chalk.gray("  Saved chain configs:"));
    for (const [id, cfg] of Object.entries(full.chains)) {
      const name = CHAIN_NAMES[Number(id)] || `Chain ${id}`;
      const isActive = Number(id) === full.activeChain;
      const prefix = isActive ? chalk.green("  ▸ ") : chalk.gray("    ");
      const label = isActive ? chalk.green.bold(name) : chalk.white(name);
      console.log(`${prefix}${label} ${chalk.gray(`(${id})`)}`);
      console.log(`      ${chalk.gray("RPC:")}    ${cfg.rpcUrl}`);
      console.log(`      ${chalk.gray("Wallet:")} ${cfg.privateKey ? chalk.green("configured") + chalk.gray(` (${cfg.privateKey.substring(0, 6)}...${cfg.privateKey.substring(62)})`) : chalk.yellow("not set")}`);
    }
    console.log("");
  } else if (args[0] === "search" || args[0] === "ask") {
    const query = args.slice(1).join(" ");
    if (!query) {
      console.log(chalk.red("\n  Usage: lido search <query>"));
      console.log(chalk.gray("  Example: lido search 'my rewards'"));
      process.exit(1);
    }
    await cmdSearch(query);
  } else if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    banner();
    console.log(chalk.white("  Usage:\n"));
    console.log(`    ${chalk.cyan("lido")}                          ${chalk.gray("Interactive mode")}`);
    console.log(`    ${chalk.cyan("lido setup")}                    ${chalk.gray("Configure RPC, keys, chain")}`);
    console.log(`    ${chalk.cyan("lido config")}                   ${chalk.gray("Show current configuration")}`);
    console.log(`    ${chalk.cyan("lido tools")}                    ${chalk.gray("List all 67 tools by category")}`);
    console.log(`    ${chalk.cyan("lido status")}                   ${chalk.gray("Show Lido protocol status")}`);
    console.log(`    ${chalk.cyan("lido search <query>")}           ${chalk.gray("Search tools with natural language")}`);
    console.log(`    ${chalk.cyan("lido <tool> [--param value]")}   ${chalk.gray("Run a tool directly")}`);
    console.log("");
    console.log(chalk.white("  Examples:\n"));
    console.log(`    ${chalk.gray("$")} lido search "my staking rewards"`);
    console.log(`    ${chalk.gray("$")} lido search "proposal 198"`);
    console.log(`    ${chalk.gray("$")} lido lido_stake --amount 0.01 --dry_run true`);
    console.log(`    ${chalk.gray("$")} lido lido_get_balance --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`);
    console.log("");
  } else {
    // Direct tool invocation
    await cmdDirect(args[0], args.slice(1));
  }

  // Graceful shutdown
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(chalk.red(`\nFatal error: ${e.message}`));
  process.exit(1);
});
