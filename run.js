#!/usr/bin/env node
/**
 * One-command setup and start for StoreGrid:  node run.js
 *
 * Installs what is missing (Python environment, npm packages), starts the classifier,
 * the API and the dashboard, then loads one week of demo feedback so the first screen has data.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CODE = path.join(__dirname, 'FULL_CODE');
const NLP = path.join(CODE, 'nlp');
const API = path.join(CODE, 'api');
const WEB = path.join(CODE, 'web');
const DATA = path.join(CODE, 'data');
const isWindows = process.platform === 'win32';
const API_URL = `http://localhost:${process.env.PORT || 5001}`;
const WEB_URL = 'http://localhost:5173';
const STARTUP_TIMEOUT_MS = 180000;
const MIN_NODE = [22, 13]; // node:sqlite is unflagged from 22.13
const MIN_PYTHON = [3, 11]; // the pinned pandas needs it

function fail(message) {
  console.error(`\nStoreGrid cannot start: ${message}\n`);
  process.exit(1);
}

function run(cmd, args, cwd, label) {
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) fail(`"${label}" failed. See the messages above.`);
}

function findPython() {
  const check = 'import sys; print(".".join(map(str, sys.version_info[:2])))';
  for (const cmd of ['python3', 'python', 'py']) {
    const result = spawnSync(cmd, ['-c', check], { encoding: 'utf-8', shell: isWindows });
    if (result.status !== 0) continue;
    const [major, minor] = result.stdout.trim().split('.').map(Number);
    if (major > MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor >= MIN_PYTHON[1])) return cmd;
  }
  return null;
}

async function waitFor(url, label) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  fail(`${label} did not come up within ${STARTUP_TIMEOUT_MS / 1000} seconds.`);
}

async function loadDemoData(python) {
  const existing = await (await fetch(`${API_URL}/api/feedback?limit=1`)).json();
  if ((existing.data || []).length > 0) return;

  console.log('\n> Loading one week of demo feedback (about a minute)...');
  const slice = path.join(__dirname, 'demo_slice.csv');
  const built = spawnSync(
    python,
    [
      path.join(NLP, 'make_demo_csv.py'),
      '--feedback',
      path.join(DATA, 'feedback.csv'),
      '--weeks',
      '1',
      '--shift-to-today',
      '--out',
      slice,
    ],
    { cwd: NLP, stdio: 'inherit', shell: isWindows },
  );
  if (built.status !== 0) fail('could not build the demo data.');

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(slice)], { type: 'text/csv' }), 'demo_slice.csv');
  const res = await fetch(`${API_URL}/api/datasets/upload`, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) fail(`demo data upload failed: ${JSON.stringify(body.error || body)}`);
  console.log(`Loaded ${body.data.importedCount} demo comments.`);
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    fail(
      `Node ${MIN_NODE.join('.')} or newer is required (you have ${process.versions.node}). Get it at https://nodejs.org`,
    );
  }
  const python = findPython();
  if (!python) fail(`Python ${MIN_PYTHON.join('.')} or newer is required. Get it at https://www.python.org`);
  if (!fs.existsSync(path.join(DATA, 'feedback.csv')))
    fail('FULL_CODE/data/feedback.csv is missing. Re-download the bundle.');

  const venvPython = path.join(NLP, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(venvPython)) run(python, ['-m', 'venv', '.venv'], NLP, 'Creating the Python environment');
  const marker = path.join(NLP, '.venv', '.requirements-installed');
  if (!fs.existsSync(marker)) {
    run(venvPython, ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'], NLP, 'Installing Python packages');
    fs.writeFileSync(marker, 'ok');
  }
  for (const dir of [API, WEB]) {
    if (!fs.existsSync(path.join(dir, 'node_modules')))
      run('npm', ['ci', '--silent'], dir, `Installing packages in ${path.basename(dir)}`);
  }
  const env = path.join(API, '.env');
  if (!fs.existsSync(env)) fs.copyFileSync(path.join(API, '.env.example'), env);

  console.log('\n> Starting StoreGrid (the classifier trains its model first, about 15 seconds)...');
  // Own process group, so one signal stops every server the start script launched.
  const stack = spawn(process.execPath, [path.join(API, 'scripts', 'start-dev.js')], {
    cwd: API,
    stdio: 'inherit',
    detached: !isWindows,
  });
  const stop = () => {
    if (isWindows) spawnSync('taskkill', ['/pid', String(stack.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-stack.pid, 'SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  stack.on('exit', (code) => process.exit(code ?? 0));

  await waitFor('http://127.0.0.1:8000/health', 'The classifier service');
  await waitFor(`${API_URL}/api/health`, 'The API');
  await loadDemoData(venvPython);

  console.log(
    `\n=======================================================\n  StoreGrid is running:  ${WEB_URL}\n  Press Ctrl+C here to stop it.\n=======================================================\n`,
  );
}

main().catch((err) => fail(err.message));
