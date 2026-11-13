#!/usr/bin/env node
/**
 * Pilha local descartável para os testes de navegador que gravam dados.
 *
 *   node scripts/e2e-local-stack.mjs -- npx playwright test e2e/check-do-dia.spec.js
 *
 * - Copia api/ para uma pasta temporária: o banco nasce vazio lá e some no fim.
 *   Nunca abre o api/praxis.db da árvore (que em produção é o banco de verdade).
 * - Agenda externa desligada, senha de teste própria, cookie sem Secure.
 * - Serve o dist/ e repassa /api na mesma origem, como a Vercel faz em produção.
 * Requer `npm run build` antes. Sem comando depois de `--`, fica no ar até Ctrl+C.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const apiPort = Number(process.env.PRAXIS_E2E_API_PORT || 18599);
const webPort = Number(process.env.PRAXIS_E2E_WEB_PORT || 4179);
const password = process.env.PRAXIS_E2E_PASSWORD || `e2e-${Math.random().toString(36).slice(2, 12)}`;
const separator = process.argv.indexOf('--');
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ não existe. Rode `npm run build` antes.');
  process.exit(2);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-e2e-'));
const apiDir = path.join(sandbox, 'api');
fs.cpSync(path.join(root, 'api'), apiDir, {
  recursive: true,
  filter: (src) => {
    const name = path.basename(src);
    return name !== 'node_modules' && name !== '.env' && name !== 'uploads' && !/\.db(-shm|-wal)?$/.test(name);
  },
});
fs.symlinkSync(fs.realpathSync(path.join(root, 'api', 'node_modules')), path.join(apiDir, 'node_modules'));

const api = spawn(process.env.PRAXIS_API_NODE || process.execPath, ['server.js'], {
  cwd: apiDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    PRAXIS_WEB_AUTH: '1',
    PRAXIS_APP_PASSWORD: password,
    FORJA_APP_PASSWORD: password,
    PRAXIS_COOKIE_SECURE: '0',
    FORJA_CALENDAR_SYNC_ENABLED: '0',
    PRAXIS_API_VERSION: 'e2e',
  },
});
const apiLogPath = path.join(sandbox, 'api.log');
const apiLog = fs.createWriteStream(apiLogPath);
api.stdout.pipe(apiLog);
api.stderr.pipe(apiLog);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const web = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request(
      { host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode || 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end('{"error":"api indisponível"}');
    });
    req.pipe(upstream);
    return;
  }
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const candidate = path.join(dist, path.normalize(pathname));
  const isFile = candidate.startsWith(dist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  const file = isFile ? candidate : path.join(dist, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

let closing = false;
/** Encerra a pilha de teste (API filha + servidor web) e apaga a pasta temporária. */
function stopStack(code) {
  if (closing) return;
  closing = true;
  web.close();
  api.kill('SIGTERM');
  if (code !== 0) {
    try {
      const tail = fs.readFileSync(apiLogPath, 'utf-8').split('\n').slice(-25).join('\n');
      process.stderr.write(`--- fim do log da API de teste ---\n${tail}\n`);
    } catch {
      // sem log
    }
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGINT', () => stopStack(130));
process.on('SIGTERM', () => stopStack(143));
api.on('exit', (code) => {
  if (!closing) {
    console.error(`A API de teste saiu sozinha (código ${code}).`);
    stopStack(1);
  }
});

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('A API de teste não respondeu em 15 s.');
}

web.listen(webPort, '127.0.0.1', async () => {
  try {
    await waitForApi();
  } catch (err) {
    console.error(err.message);
    stopStack(1);
    return;
  }
  const base = `http://127.0.0.1:${webPort}`;
  if (command.length === 0) {
    console.log(`Pilha de teste em ${base} (API em ${apiPort}). Ctrl+C encerra e apaga o banco.`);
    return;
  }
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PRAXIS_E2E_BASE: base, PRAXIS_E2E_PASSWORD: password, PRAXIS_E2E_LOCAL_STACK: '1' },
  });
  child.on('exit', (code) => stopStack(code ?? 1));
});
