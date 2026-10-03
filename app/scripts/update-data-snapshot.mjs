// Descarga la publicación actual de datos a public/data-snapshot/v1, la copia
// que se incluye en la app para el primer arranque sin conexión.
// Uso: npm run data:snapshot
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REMOTE = 'https://deiwix.github.io/emt-remake/data/v1/';
const TARGET = join(import.meta.dirname, '..', 'public', 'data-snapshot', 'v1');

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return response.text();
}

const manifestText = await getText(`${REMOTE}manifest.json`);
const manifest = JSON.parse(manifestText);
const files = {};
for (const entry of Object.values(manifest.files)) {
  const text = await getText(`${REMOTE}${entry.path}`);
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha !== entry.sha256) throw new Error(`${entry.path}: la huella no coincide`);
  files[entry.path] = text;
}

await mkdir(TARGET, { recursive: true });
for (const [path, text] of Object.entries(files)) await writeFile(join(TARGET, path), text);
await writeFile(join(TARGET, 'manifest.json'), manifestText);
console.log(`Copia actualizada: datos ${manifest.dataVersion} del ${manifest.generatedAt}`);
