const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const audit = require('./fs-audit.cjs');

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#121212',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const entry = path.join(__dirname, '..', 'dist', 'index.html');
  const entryUrl = pathToFileURL(entry).toString();

  window.once('ready-to-show', () => window.show());
  // SEC-02: somente http/https podem ser abertos no navegador do sistema.
  window.webContents.setWindowOpenHandler(({ url }) => {
    let protocol = '';
    try {
      protocol = new URL(url).protocol;
    } catch {
      protocol = '';
    }
    if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
    return { action: 'deny' };
  });
  // SEC-03: impede navegação para fora do conteúdo local empacotado.
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] === entryUrl) return;
    event.preventDefault();
  });
  window.loadFile(entry);
}

function run(command, args) {
  return new Promise(resolve => execFile(command, args, { windowsHide: true, timeout: 2500 }, (error, stdout) => resolve({ ok: !error, output: stdout || '' })));
}

function ollamaCandidates() {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
    path.join(localAppData, 'Ollama', 'ollama.exe'),
    path.join(programFiles, 'Ollama', 'ollama.exe'),
    path.join(programFilesX86, 'Ollama', 'ollama.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe')
  ];
}

async function findOllama() {
  // SEC-04: caminhos conhecidos têm prioridade; o PATH é apenas fallback controlado.
  const known = [...new Set(ollamaCandidates())].find(value => fs.existsSync(value));
  if (known) return known;
  const fromPath = await run('where.exe', ['ollama.exe']);
  if (!fromPath.ok) return '';
  return fromPath.output
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
    .find(value => fs.existsSync(value)) || '';
}

ipcMain.handle('ollama:inspect', async () => {
  if (process.platform !== 'win32') return { installed: null, active: null };
  const executable = await findOllama();
  const processes = await run('tasklist.exe', ['/FI', 'IMAGENAME eq ollama.exe', '/NH']);
  return { installed: Boolean(executable), active: processes.ok && /ollama\.exe/i.test(processes.output), path: executable };
});

ipcMain.handle('ollama:start', async () => {
  if (process.platform !== 'win32') return { ok: false, message: 'Inicialização automática disponível apenas no Windows.' };
  const executable = await findOllama();
  if (!executable) return { ok: false, message: 'Ollama não está instalado.' };
  const child = spawn(executable, ['serve'], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true };
});

const aud = require('./fs-audit.cjs');
// IPC com contrato mínimo: strings de caminho validadas no main, nunca shell.
const ipcStr = (value) => (typeof value === "string" ? value : "");
const ipcInt = (value, fallback) =>
  Number.isInteger(value) && value >= 0 ? value : fallback;

ipcMain.handle("filesystem:drives", async (_event) => {
  try {
    return { ok: true, drives: aud.detectDrives() };
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:inspect", async (_event, payload) => {
  try {
    return await aud.inspectPath(ipcStr(payload?.path));
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:list", async (_event, payload) => {
  try {
    return await aud.analyzeDirectory(
      ipcStr(payload?.path),
      {
        deep: Boolean(payload?.deep),
        entryLimit: ipcInt(payload?.entryLimit, 60000),
        depthLimit: ipcInt(payload?.depthLimit, 16),
        cancelId: ipcStr(payload?.cancelId),
      },
    );
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:search", async (_event, payload) => {
  try {
    return await aud.searchByName(
      Array.isArray(payload?.roots) ? payload.roots.map(ipcStr) : [],
      {
        name: ipcStr(payload?.name),
        type: ipcStr(payload?.type),
        entryLimit: ipcInt(payload?.entryLimit, 60000),
        depthLimit: ipcInt(payload?.depthLimit, 12),
        maxResults: ipcInt(payload?.maxResults, 12),
        cancelId: ipcStr(payload?.cancelId),
      },
    );
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:discover", async (_event, payload) => {
  try {
    return await aud.discoverProjects(
      Array.isArray(payload?.roots) ? payload.roots.map(ipcStr) : [],
      {
        filter: ipcStr(payload?.filter) || null,
        entryLimit: ipcInt(payload?.entryLimit, 60000),
        depthLimit: ipcInt(payload?.depthLimit, 12),
        maxResults: ipcInt(payload?.maxResults, 12),
        cancelId: ipcStr(payload?.cancelId),
      },
    );
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:hash", async (_event, payload) => {
  try {
    return await aud.hashFile(ipcStr(payload?.path));
  } catch (error) {
    return { ok: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

ipcMain.handle("filesystem:cancel", (_event, payload) => {
  try {
    return { ok: true, cancelled: aud.cancelToken(ipcStr(payload?.cancelId)) };
  } catch (error) {
    return { ok: false, cancelled: false, error: { code: error.code || "ERR", message: error.message || String(error) } };
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.botia.app');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
