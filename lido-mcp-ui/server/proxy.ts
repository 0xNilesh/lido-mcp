import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

let client: Client;

function loadEnvFile(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      vars[key] = value;
    }
  } catch {
    console.warn(`Could not read env file at ${filePath}`);
  }
  return vars;
}

async function initMCP() {
  const mcpServerPath = path.resolve(__dirname, '../../lido-mcp/dist/index.js');
  const envPath = path.resolve(__dirname, '../../lido-mcp/.env');
  const envVars = loadEnvFile(envPath);

  console.log(`MCP server path: ${mcpServerPath}`);
  console.log(`Loaded env from: ${envPath}`);
  console.log(`Chain ID: ${envVars.CHAIN_ID || '560048'}`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
    env: {
      ...process.env,
      ETHEREUM_RPC_URL: envVars.ETHEREUM_RPC_URL || process.env.ETHEREUM_RPC_URL || 'https://hoodi.drpc.org',
      PRIVATE_KEY: envVars.PRIVATE_KEY || process.env.PRIVATE_KEY || '',
      CHAIN_ID: envVars.CHAIN_ID || process.env.CHAIN_ID || '560048',
      MAX_TRANSACTION_ETH: envVars.MAX_TRANSACTION_ETH || process.env.MAX_TRANSACTION_ETH || '100',
      MAX_DAILY_SPEND_ETH: envVars.MAX_DAILY_SPEND_ETH || process.env.MAX_DAILY_SPEND_ETH || '500',
    },
  });

  client = new Client({ name: 'lido-mcp-ui', version: '1.0.0' });
  await client.connect(transport);
  console.log('MCP client connected to lido-mcp server');
}

// List all tools
app.get('/api/tools', async (_req, res) => {
  try {
    const result = await client.listTools();
    res.json(result.tools);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Call a tool
app.post('/api/call', async (req, res) => {
  try {
    const { name, args } = req.body;
    const result = await client.callTool({ name, arguments: args || {} });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get skill file resource
app.get('/api/skill', async (_req, res) => {
  try {
    const result = await client.readResource({ uri: 'lido://skill' });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', connected: !!client });
});

const PORT = 3001;

initMCP().then(() => {
  app.listen(PORT, () => {
    console.log(`Lido MCP proxy running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize MCP:', err);
  process.exit(1);
});
