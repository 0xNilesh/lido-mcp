/**
 * Standalone embedding worker.
 * Runs as a separate process to avoid ONNX runtime corrupting Express.
 * Communicates via stdin/stdout JSON lines.
 */
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

let extractor: FeatureExtractionPipeline | null = null;
const MODEL = 'Xenova/all-MiniLM-L6-v2';

async function init() {
  console.error('[embedder] Loading model...');
  extractor = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' }) as FeatureExtractionPipeline;
  console.error('[embedder] Model loaded:', MODEL);
  // Signal ready
  process.stdout.write(JSON.stringify({ type: 'ready' }) + '\n');
}

async function embed(text: string): Promise<number[]> {
  if (!extractor) throw new Error('Not ready');
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// Process JSON line requests from stdin
process.stdin.setEncoding('utf-8');
let buffer = '';
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop()!;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch { /* ignore malformed */ }
  }
});

async function handleMessage(msg: { id: string; type: string; texts?: string[]; text?: string }) {
  try {
    if (msg.type === 'embed_batch') {
      const embeddings: number[][] = [];
      for (const text of msg.texts || []) {
        embeddings.push(await embed(text));
      }
      process.stdout.write(JSON.stringify({ id: msg.id, type: 'result', embeddings }) + '\n');
    } else if (msg.type === 'embed') {
      const embedding = await embed(msg.text || '');
      process.stdout.write(JSON.stringify({ id: msg.id, type: 'result', embedding }) + '\n');
    }
  } catch (err: any) {
    process.stdout.write(JSON.stringify({ id: msg.id, type: 'error', error: err.message }) + '\n');
  }
}

init().catch(err => {
  console.error('[embedder] Fatal:', err);
  process.exit(1);
});
