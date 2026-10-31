/**
 * `npm test` entry point. The API tests that submit feedback need the classifier service, so this
 * starts it once (unless NLP_SERVICE_URL already answers), runs every test file against it, then stops it.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const NLP_DIR = path.resolve(__dirname, '../../nlp');
const STARTUP_TIMEOUT_MS = 60000; // the service trains its model on start-up (about 10 s on a laptop)
const isWindows = process.platform === 'win32';

async function isHealthy(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startClassifier() {
  const venvPython = path.join(NLP_DIR, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python3');
  const port = await freePort();
  const child = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: NLP_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    if (await isHealthy(url)) return { url, child };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(
    `The classifier service did not start (see "How to run" in the README: install FULL_CODE/nlp/requirements.txt ` +
      `and put the pack data in FULL_CODE/data).\n${stderr.slice(-1500)}`
  );
}

async function main() {
  let url = process.env.NLP_SERVICE_URL;
  let child = null;
  if (!url || !(await isHealthy(url))) {
    ({ url, child } = await startClassifier());
  }

  const testFiles = fs
    .readdirSync(path.join(__dirname, '../tests'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join('tests', f));
  const run = spawn(process.execPath, ['--test', ...testFiles], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { LOG_LEVEL: 'silent', ...process.env, NLP_SERVICE_URL: url },
  });
  run.on('exit', (code) => {
    child?.kill();
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
