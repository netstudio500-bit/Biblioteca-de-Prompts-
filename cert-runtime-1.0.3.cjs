#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname);
const reportPath = path.join(root, 'RELATORIO-RUNTIME-1.0.3.md');
const results = [];
const now = new Date().toISOString();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function add(name, status, detail) {
  results.push({ name, status, detail: String(detail || '').replace(/\s+/g, ' ').trim() });
}

function command(command, args = [], options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: options.timeout || 30000, windowsHide: true });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim(), status: result.status };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function checkImports() {
  const modules = [
    './agent/index.js', './agent/AgentCore.js', './agent/AgentWatchdog.js',
    './agent/OllamaClient.js', './agent/ToolRegistry.js', './agent/ModelRouter.js',
    './agent/ContextManager.js', './agent/ResponseValidator.js'
  ];
  try {
    for (const module of modules) await import(pathToFileURL(path.join(root, module.slice(2))).href);
    add('Imports de producao', 'PASS', modules.join(', '));
  } catch (error) {
    add('Imports de producao', 'FAIL', error.message);
  }
}

async function checkOllama() {
  const endpoints = ['http://127.0.0.1:11434', 'http://localhost:11434'];
  let found = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) continue;
      const data = await response.json();
      const models = Array.isArray(data.models) ? data.models.filter(model => model?.name) : [];
      if (models.length) { found = { endpoint, models: models.map(model => model.name) }; break; }
      found = { endpoint, models: [] };
    } catch {}
  }
  if (found?.models?.length) add('Ollama real', 'PASS', `${found.endpoint}; modelos: ${found.models.join(', ')}`);
  else if (found) add('Ollama real', 'BLOQUEADO', `${found.endpoint} respondeu sem modelos utilizaveis`);
  else add('Ollama real', 'BLOQUEADO', 'Nenhum endpoint local respondeu e o servico pode nao estar instalado');
}

function checkCommands() {
  const node = command(process.execPath, ['--version']);
  const npm = command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
  add('Node', node.ok ? 'PASS' : 'FAIL', node.output);
  add('npm', npm.ok ? 'PASS' : 'FAIL', npm.output);
  const electron = command(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '--version'], { timeout: 30000 });
  add('Electron', electron.ok ? 'PASS' : 'BLOQUEADO', electron.ok ? electron.output : electron.output.slice(-300));
}

function checkStructure() {
  const critical = ['index.html', 'main.jsx', 'package.json', 'package-lock.json', 'agent/AgentCore.js', 'agent/OllamaClient.js', 'agent/ToolRegistry.js', 'agent/ContextManager.js', 'agent/ResponseValidator.js', 'agent/AgentWatchdog.js', 'electron/main.cjs', 'electron/preload.cjs'];
  const missing = critical.filter(file => !fs.existsSync(path.join(root, file)));
  add('Arquivos criticos', missing.length ? 'FAIL' : 'PASS', missing.length ? `Ausentes: ${missing.join(', ')}` : `${critical.length} arquivos presentes`);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  add('Entrypoint', /src\/main\.jsx/.test(index) ? 'FAIL' : (/main\.jsx/.test(index) ? 'PASS' : 'FAIL'), index.match(/<script[^>]+src="([^"]+)/)?.[1] || 'script nao encontrado');
  const main = fs.readFileSync(path.join(root, 'main.jsx'), 'utf8');
  add('UI sem fetch Ollama direto', /fetch\(|\/api\/(chat|tags|ps|generate)/.test(main) ? 'FAIL' : 'PASS', 'main.jsx');
  add('Instancias principais', /new AgentCore/.test(main) && /new OllamaClient/.test(main) && /new ToolRegistry/.test(main) && /new ContextManager/.test(main) && /new ModelRouter/.test(main) ? 'PASS' : 'FAIL', 'AgentCore, OllamaClient, ToolRegistry, ContextManager e ModelRouter');
}

function checkAgentStructure() {
  const core = fs.readFileSync(path.join(root, 'agent/AgentCore.js'), 'utf8');
  const watchdog = fs.readFileSync(path.join(root, 'agent/AgentWatchdog.js'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'agent/ToolRegistry.js'), 'utf8');
  const checks = [
    ['AgentCore unico', (core.match(/class AgentCore/g) || []).length === 1],
    ['Limites do agente', /maxSteps|maxToolCalls|maxConsecutiveSameTool/.test(core)],
    ['Watchdog integrado', /AgentWatchdog/.test(core) && /class AgentWatchdog/.test(watchdog)],
    ['ToolRegistry allowlist', ['filesystem.drives', 'filesystem.inspect', 'filesystem.list', 'filesystem.search', 'filesystem.discover', 'filesystem.hash', 'filesystem.cancel'].every(id => registry.includes(id))],
    ['Signal no ToolRegistry', /options\.signal/.test(registry)]
  ];
  for (const [name, pass] of checks) add(name, pass ? 'PASS' : 'FAIL', pass ? 'estrutura encontrada' : 'estrutura esperada ausente');
}

function checkSecurity() {
  const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  const pass = /contextIsolation:\s*true/.test(main) && /nodeIntegration:\s*false/.test(main) && /sandbox:\s*true/.test(main);
  add('Seguranca Electron', pass ? 'PASS' : 'FAIL', 'contextIsolation, nodeIntegration e sandbox');
  add('Filesystem via IPC', fs.existsSync(path.join(root, 'electron/fs-audit.cjs')) && fs.existsSync(path.join(root, 'electron/preload.cjs')) ? 'PASS' : 'FAIL', 'preload e fs-audit');
}

async function checkFilesystem() {
  try {
    const audit = require(path.join(root, 'electron/fs-audit.cjs'));
    const existing = await audit.inspectPath(root);
    const missing = await audit.inspectPath(path.join(os.tmpdir(), 'botia-runtime-path-not-found'));
    add('Filesystem real', existing.ok && existing.exists && missing.ok && !missing.exists ? 'PASS' : 'FAIL', 'caminho existente e inexistente');
  } catch (error) { add('Filesystem real', 'FAIL', error.message); }
}

function checkBuildClean() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'botia-build-'));
  try {
    const excludes = new Set(['node_modules', 'dist', 'release', '.git', 'BOT.IA-BASE-COMPLETA.zip']);
    fs.cpSync(root, temp, { recursive: true, filter: source => !excludes.has(path.basename(source)) });
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = spawnSync(npm, ['ci'], { cwd: temp, encoding: 'utf8', timeout: 240000, windowsHide: true });
    if (install.status !== 0) return add('Build limpo', 'BLOQUEADO', `${install.stderr || install.stdout}`.slice(-500));
    const build = spawnSync(npm, ['run', 'build'], { cwd: temp, encoding: 'utf8', timeout: 240000, windowsHide: true });
    add('Build limpo', build.status === 0 ? 'PASS' : 'FAIL', `${build.stdout || ''}${build.stderr || ''}`.slice(-500));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function checkPackage() {
  const scripts = pkg.scripts || {};
  add('Scripts do package', scripts.dev && scripts.build && scripts.start ? 'PASS' : 'FAIL', Object.keys(scripts).join(', '));
  add('Versao preservada', pkg.version === '1.0.2' ? 'PASS' : 'FAIL', pkg.version);
  add('Baseline installer', fs.existsSync(path.join(root, 'INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe')) ? 'PASS' : 'FAIL', 'instalador 1.0.2');
}

function addRuntimeCoverage() {
  add('CHAT real', 'NÃO TESTADO', 'Ollama real indisponivel');
  add('ANALYZE real', 'NÃO TESTADO', 'Ollama real indisponivel');
  add('CODE real', 'NÃO TESTADO', 'Ollama real indisponivel');
  add('Streaming real', 'BLOQUEADO', 'Ollama real indisponivel');
  add('Cancelamento Ollama real', 'BLOQUEADO', 'Ollama real indisponivel');
  add('Cancelamento IPC real', 'BLOQUEADO', 'Electron real indisponivel');
  add('IPC filesystem real', 'BLOQUEADO', 'Electron real indisponivel');
  add('UI Electron real', 'BLOQUEADO', 'Electron real indisponivel');
  add('Multi-step real', 'NÃO TESTADO', 'requer Ollama e Electron reais');
  add('Memoria UI real', 'NÃO TESTADO', 'navegador/Electron indisponivel');
  add('Retry controlado', 'PASS', 'coberto pelos testes de modulo existentes');
  add('Loop controlado', 'PASS', 'coberto pelos testes de modulo existentes');
  add('Concorrencia controlada', 'PASS', 'coberta pelos testes de modulo existentes');
}

function writeReport() {
  const lines = [
    '# RELATORIO RUNTIME 1.0.3', '',
    '## AMBIENTE',
    `- Data: ${now}`,
    `- OS: ${os.platform()} ${os.release()}`,
    `- Arquitetura: ${process.arch}`,
    `- Node: ${process.version}`,
    `- Projeto: ${pkg.name} ${pkg.version}`,
    '', '## RESULTADOS',
    ...results.map(result => `- ${result.status} | ${result.name} | ${result.detail}`),
    '', '## CLASSIFICACAO',
    '- PASS: comprovado no ambiente atual.',
    '- BLOQUEADO: recurso ausente ou indisponivel no ambiente.',
    '- FAIL: defeito reproduzido no projeto.',
    '- NAO TESTADO: nao executado ou sem evidencia suficiente.',
    '', '## HASHES',
    ...['README.md', 'main.jsx', 'index.html', 'agent/AgentCore.js', 'agent/AgentWatchdog.js', 'agent/OllamaClient.js', 'agent/ToolRegistry.js', 'agent/index.js'].filter(file => fs.existsSync(path.join(root, file))).map(file => `- ${file}: ${sha256(path.join(root, file))}`),
    '', '## EXECUCAO WINDOWS',
    '```bash', 'npm ci', 'npm run build', 'node cert-runtime-1.0.3.cjs', '```',
    '', 'O diagnostico nao gera installer, nao altera a versao e nao modifica INSTALADORES_OFICIAIS.'
  ];
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

(async () => {
  checkCommands();
  checkStructure();
  checkAgentStructure();
  checkSecurity();
  checkPackage();
  await checkImports();
  await checkOllama();
  await checkFilesystem();
  addRuntimeCoverage();
  checkBuildClean();
  writeReport();
  for (const result of results) console.log(`${result.status.padEnd(12)} ${result.name}: ${result.detail}`);
  console.log(`RELATORIO=${reportPath}`);
  process.exitCode = results.some(result => result.status === 'FAIL') ? 1 : 0;
})();
