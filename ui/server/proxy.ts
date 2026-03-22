import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── State ───
let client: Client;
let embedderProcess: ChildProcess | null = null;
let embedderReady = false;
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let reqCounter = 0;

interface ToolEntry { name: string; description: string; searchText: string; embedding: number[] | null; }
let toolIndex: ToolEntry[] = [];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; magA += a[i]! * a[i]!; magB += b[i]! * b[i]!; }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function sendToEmbedder(msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!embedderProcess || !embedderReady) { reject(new Error('Embedder not ready')); return; }
    const id = String(++reqCounter);
    pendingRequests.set(id, { resolve, reject });
    embedderProcess.stdin!.write(JSON.stringify({ ...msg, id }) + '\n');
    setTimeout(() => { if (pendingRequests.has(id)) { pendingRequests.delete(id); reject(new Error('Embedder timeout')); } }, 30000);
  });
}

function loadEnvFile(p: string): Record<string, string> {
  const v: Record<string, string> = {};
  try { for (const l of fs.readFileSync(p, 'utf-8').split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const eq = t.indexOf('='); if (eq > 0) v[t.slice(0, eq).trim()] = t.slice(eq + 1).trim(); } } catch {}
  return v;
}

async function initMCP() {
  const mcpPath = path.resolve(__dirname, '../../mcp/dist/index.js');
  const envPath = path.resolve(__dirname, '../../mcp/.env');
  const env = loadEnvFile(envPath);
  console.log(`MCP: ${mcpPath} | Chain: ${env.CHAIN_ID || '560048'}`);

  const transport = new StdioClientTransport({
    command: 'node', args: [mcpPath],
    env: { ...process.env, ETHEREUM_RPC_URL: env.ETHEREUM_RPC_URL || 'https://hoodi.drpc.org', PRIVATE_KEY: env.PRIVATE_KEY || '', CHAIN_ID: env.CHAIN_ID || '560048', MAX_TRANSACTION_ETH: env.MAX_TRANSACTION_ETH || '100', MAX_DAILY_SPEND_ETH: env.MAX_DAILY_SPEND_ETH || '500' },
  });
  client = new Client({ name: 'lido-mcp-ui', version: '1.0.0' });
  await client.connect(transport);
  console.log('MCP connected');
}

function initEmbedder() {
  console.log('Starting embedder process...');
  const tsxPath = path.resolve(__dirname, '../node_modules/.bin/tsx');
  const embedderPath = path.resolve(__dirname, 'embedder.ts');
  embedderProcess = spawn(tsxPath, [embedderPath], { stdio: ['pipe', 'pipe', 'inherit'] });

  const rl = createInterface({ input: embedderProcess.stdout! });
  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'ready') {
        embedderReady = true;
        console.log('Embedder ready');
        buildToolEmbeddings();
      } else if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id)!;
        pendingRequests.delete(msg.id);
        if (msg.type === 'error') reject(new Error(msg.error));
        else resolve(msg);
      }
    } catch {}
  });

  embedderProcess.on('exit', (code) => { console.warn('Embedder exited:', code); embedderReady = false; });
}

async function buildToolEmbeddings() {
  try {
    const result = await client.listTools();
    toolIndex = result.tools.map(t => ({ name: t.name, description: t.description || '', searchText: `${t.name.replace(/_/g, ' ')}. ${t.description || ''}`, embedding: null }));
    console.log(`Embedding ${toolIndex.length} tools...`);

    // Batch embed
    const BATCH = 10;
    for (let i = 0; i < toolIndex.length; i += BATCH) {
      const batch = toolIndex.slice(i, i + BATCH);
      try {
        const resp = await sendToEmbedder({ type: 'embed_batch', texts: batch.map(t => t.searchText) });
        for (let j = 0; j < batch.length; j++) { batch[j]!.embedding = resp.embeddings[j]; }
      } catch (err) { console.warn('Batch failed:', (err as Error).message); }
    }
    const count = toolIndex.filter(t => t.embedding).length;
    console.log(`Semantic index: ${count}/${toolIndex.length} tools embedded`);
  } catch (err) { console.warn('Embedding build failed:', (err as Error).message); }
}

// ─── Express ───
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => { res.json({ status: 'ok', connected: !!client, semanticSearch: embedderReady, model: embedderReady ? 'Xenova/all-MiniLM-L6-v2' : null }); });

app.get('/api/tools', async (_req, res) => { try { res.json((await client.listTools()).tools); } catch (e: any) { res.status(500).json({ error: e.message }); } });

app.post('/api/call', async (req, res) => { try { res.json(await client.callTool({ name: req.body.name, arguments: req.body.args || {} })); } catch (e: any) { res.status(500).json({ error: e.message }); } });

app.get('/api/skill', async (_req, res) => { try { res.json(await client.readResource({ uri: 'lido://skill' })); } catch (e: any) { res.status(500).json({ error: e.message }); } });

app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query) { res.status(400).json({ error: 'q param required' }); return; }

    const results: Array<{ name: string; description: string; score: number }> = [];

    if (embedderReady && toolIndex.some(t => t.embedding)) {
      // Semantic search
      const resp = await sendToEmbedder({ type: 'embed', text: query });
      const qEmb: number[] = resp.embedding;
      for (const t of toolIndex) {
        if (!t.embedding) continue;
        results.push({ name: t.name, description: t.description, score: Math.round(cosineSimilarity(qEmb, t.embedding) * 1000) / 1000 });
      }
    } else {
      // Keyword fallback
      const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      for (const t of toolIndex) {
        const hay = t.searchText.toLowerCase();
        let score = 0;
        for (const tok of tokens) { if (hay.includes(tok)) score += 0.2; }
        if (score > 0) results.push({ name: t.name, description: t.description, score: Math.min(score, 1) });
      }
    }

    results.sort((a, b) => b.score - a.score);
    res.json({ query, method: embedderReady ? 'semantic' : 'keyword', model: embedderReady ? 'Xenova/all-MiniLM-L6-v2' : 'none', matches: results.slice(0, 5), best: results[0] || null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Serve skill file as plain text
app.get('/skill.md', async (_req, res) => {
  try {
    const result = await client.readResource({ uri: 'lido://skill' });
    const text = result.contents?.[0]?.text || 'Skill file not available';
    res.setHeader('Content-Type', 'text/markdown');
    res.send(text);
  } catch (e: any) {
    res.status(500).send('Failed to load skill file');
  }
});

// ─── Start ───
const PORT = 3001;
initMCP().then(() => {
  app.listen(PORT, () => console.log(`Proxy on http://localhost:${PORT}`));
  initEmbedder();
}).catch(err => { console.error('Fatal:', err); process.exit(1); });
