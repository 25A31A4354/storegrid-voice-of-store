const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=======================================================');
console.log(' Starting StoreGrid Fullstack Services (Frontend + Backend + NLP)');
console.log('=======================================================');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const targetPort = process.env.PORT || '5001';

// 0. Locate and Start Python FastAPI NLP Microservice (if present)
const candidateNlpDirs = [path.resolve(__dirname, '../../nlp')];

let nlpProcess = null;
const nlpDir = candidateNlpDirs.find((d) => fs.existsSync(d));

if (nlpDir) {
  const venvPython = isWindows
    ? path.join(nlpDir, '.venv', 'Scripts', 'python.exe')
    : path.join(nlpDir, '.venv', 'bin', 'python');

  const pythonCmd = fs.existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3';

  try {
    nlpProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: nlpDir,
      stdio: 'pipe',
      shell: false,
    });

    nlpProcess.stdout.on('data', (data) => {
      process.stdout.write(`[StoreGrid NLP] ${data}`);
    });

    nlpProcess.stderr.on('data', (data) => {
      process.stderr.write(`[StoreGrid NLP ERR] ${data}`);
    });

    nlpProcess.on('error', (err) => {
      console.warn(`[StoreGrid NLP] Notice: Unable to spawn NLP microservice (${err.message})`);
    });

    console.log(`[StoreGrid NLP] Found NLP microservice at ${nlpDir}`);
  } catch (err) {
    console.warn(`[StoreGrid NLP] Could not start Python microservice: ${err.message}`);
  }
} else {
  console.log('[StoreGrid NLP] No local nlp directory found; backend will use graceful fallback.');
}

// 1. Start Backend Express Server
const backend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'pipe',
  shell: true,
  env: { ...process.env, PORT: targetPort },
});

backend.stdout.on('data', (data) => {
  process.stdout.write(`[StoreGrid Backend] ${data}`);
});

backend.stderr.on('data', (data) => {
  process.stderr.write(`[StoreGrid Backend ERR] ${data}`);
});

// 2. Start Frontend Vite Server
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.resolve(__dirname, '../../web'),
  stdio: 'pipe',
  shell: true,
  env: { ...process.env, VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || `http://localhost:${targetPort}` },
});

frontend.stdout.on('data', (data) => {
  process.stdout.write(`[StoreGrid Frontend] ${data}`);
});

frontend.stderr.on('data', (data) => {
  process.stderr.write(`[StoreGrid Frontend ERR] ${data}`);
});

// Handle exit
function cleanup() {
  console.log('\n[StoreGrid] Shutting down fullstack development servers...');
  // kill() returns false instead of throwing when a child has already exited.
  [nlpProcess, backend, frontend].forEach((child) => child?.kill('SIGINT'));
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
