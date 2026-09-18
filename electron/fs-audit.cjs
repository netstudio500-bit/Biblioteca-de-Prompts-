'use strict';
// fs-audit.cjs — Sistema de LOCALIZAÇÃO E AUDITORIA REAL de pastas/discos.
// READ-ONLY: usa exclusivamente fs/promises (nunca shell, exec, spawn ou ACL).
// A fonte da verdade é o filesystem real; nenhum dado é inventado aqui.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_PATH_LEN = 1024;
const MAX_NAME_LEN = 220;
const DEFAULT_ENTRY_LIMIT = 60000;
const DEFAULT_DEPTH = 16;
const MAX_RESULTS = 60;
const MAX_ERRORS = 30;
const MAX_PKG_BYTES = 262144;
const MSG_SECONDS = 1000;

const tokens = new Map(); // cancelId -> { cancelled:false }
function makeToken(id) {
  if (typeof id !== 'string' || !id) return null;
  const token = { cancelled: false };
  tokens.set(id, token);
  return token;
}
function cancelToken(id) {
  const token = tokens.get(id);
  if (token) token.cancelled = true;
  return Boolean(token);
}
function deleteToken(id) {
  if (typeof id === 'string') tokens.delete(id);
}

const SKIP_DESCEND = new Set([
  'node_modules', '.git', '.cache', '__pycache__', 'site-packages',
  'venv', '.venv', '.hg', '.svn', 'dist', 'out', 'build',
  'System Volume Information', '$Recycle.Bin', 'ProgramData', 'Windows',
  'Program Files', 'Program Files (x86)', '$WINDOWS.~BT', '$WINREAgent'
]);
const SKIP_AT_ROOT = new Set(['$Recycle.Bin', 'System Volume Information', '$WinREAgent', '$GetCurrent', 'Recovery']);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code || 'ERR_INVALID';
  return e;
}
function safePathInput(input) {
  if (typeof input !== 'string' || !input.trim()) throw err('EINVAL', 'Entrada de caminho vazia ou inválida.');
  if (input.length > MAX_PATH_LEN) throw err('E2BIG', 'Caminho acima do limite.');
  if (input.includes('\0')) throw err('EINVAL', 'Caminho contém caractere nulo.');
  const cleaned = input.trim().replace(/^["']+|["']+$/g, '');
  if (!cleaned) throw err('EINVAL', 'Entrada de caminho vazia ou inválida.');
  if (cleaned.includes('*') || cleaned.includes('?'))
    throw err('EINVAL', 'Curingas não são aceitos em caminhos (use a busca por nome).');
  return cleaned;
}
function validName(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (!n || n.length > MAX_NAME_LEN) return false;
  return !/[\\/:*?"<>|]/.test(n);
}
function detectDrives() {
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try { fs.accessSync(root); drives.push(root); } catch {}
  }
  return drives;
}
function resolveAbsolute(input) {
  const cleaned = safePathInput(input);
  const driveMatch = cleaned.match(/^([a-zA-Z]):\/?$/);
  if (driveMatch) return `${driveMatch[1].toUpperCase()}:\\`;
  let resolved;
  try {
    resolved = path.resolve(cleaned);
  } catch {
    throw err('EINVAL', 'Caminho inválido.');
  }
  if (process.platform === 'win32' && !/^[a-zA-Z]:[\\/]/.test(resolved) && !/^\\\\/.test(resolved))
    throw err('EINVAL', 'Caminho não é absoluto após a resolução.');
  return resolved;
}
async function lstatEntry(target) {
  try {
    const st = await fsp.lstat(target);
    return {
      ok: true, isDir: st.isDirectory(), isFile: st.isFile(), isLink: st.isSymbolicLink(),
      size: st.size, mtime: st.mtimeMs, mtimeISO: new Date(st.mtimeMs).toISOString()
    };
  } catch (e) {
    return { ok: false, code: e.code || 'ERR', message: e.message || String(e) };
  }
}
function summary(st, target) {
  const type = st.isDir ? 'directory' : st.isFile ? 'file' : st.isLink ? 'symbolic-link' : 'other';
  return {
    ok: true, exists: true, path: target, type,
    isDir: st.isDir, isFile: st.isFile, isLink: st.isLink,
    size: st.isFile ? st.size : null, mtime: st.mtimeISO,
    ext: st.isFile ? (path.extname(target) || null) : null
  };
}
function noteError(list, target, eobj, cap) {
  if (typeof cap !== 'number') cap = MAX_ERRORS;
  if (list.length < cap) {
    list.push({ path: target, code: (eobj && eobj.code) || 'ERR', message: (eobj && eobj.message) || String(eobj || '') });
  }
}
function dotHidden(name) {
  return typeof name === 'string' && name.charAt(0) === '.';
}

async function readPkgMarkers(dir, names) {
  const markers = [];
  const set = new Set(names);
  const add = (n) => { if (!markers.includes(n)) markers.push(n); };
  if (set.has('package.json')) {
    add('package.json');
    const file = path.join(dir, 'package.json');
    try {
      const handle = await fsp.open(file, 'r');
      const buffer = Buffer.alloc(MAX_PKG_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, MAX_PKG_BYTES, 0);
      await handle.close();
      const pkg = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const keys = Object.keys(deps);
      if (deps.react) add('react');
      if (deps.vue) add('vue');
      if (deps.angular) add('angular');
      if (deps.next) add('next');
      if (deps.webpack) add('webpack');
      if (deps.vite) add('vite');
      if (deps['@vitejs/plugin-react']) add('vite');
      if (deps.electron) add('electron');
      if (deps['electron-builder']) add('electron');
      if (deps.express) add('express');
      if (deps.typescript || set.has('tsconfig.json')) add('typescript');
      if (pkg.main) add('main');
      return { markers, framework: null };
    } catch {
      return { markers, framework: null };
    }
  }
  for (const marker of [
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'vite.config.js',
    'vite.config.ts', 'vite.config.mjs', 'webpack.config.js', 'webpack.config.ts',
    'next.config.js', 'next.config.ts', 'tsconfig.json', 'jsconfig.json',
    'index.html', 'src', 'app', 'electron', 'public', 'README.md',
    'Dockerfile', '.dockerignore', '.env.example', 'Cargo.toml', '.cargo',
    'requirements.txt', 'pyproject.toml', 'setup.py', 'go.mod', 'pom.xml',
    'build.gradle', 'settings.gradle', 'package.json.sample'
  ]) {
    if (set.has(marker)) add(marker);
  }
  if (names.some((n) => /^vite\.config\./.test(n))) add('vite.config.*');
  if (names.some((n) => /^next\.config\./.test(n))) add('next.config.*');
  if (names.some((n) => /^webpack\.config\./.test(n))) add('webpack.config.*');
  return { markers, framework: null };
}
async function detectProject(dir, names) {
  const set = new Set(names);
  const { markers, framework } = await readPkgMarkers(dir, names);
  let kind = null;
  let frameworkLabel = null;
  if (set.has('package.json')) {
    if (markers.includes('electron')) kind = 'Electron';
    else if (markers.includes('react')) kind = 'React';
    else if (markers.includes('vue')) kind = 'Vue';
    else if (markers.includes('next')) kind = 'Next.js';
    else if (markers.includes('angular')) kind = 'Angular';
    else kind = 'Node.js';
  } else if (set.has('Cargo.toml')) kind = 'Rust';
  else if (set.has('pyproject.toml') || set.has('requirements.txt') || set.has('setup.py')) kind = 'Python';
  else if (set.has('go.mod')) kind = 'Go';
  else if (set.has('pom.xml')) kind = 'Java (Maven)';
  else if (set.has('build.gradle')) kind = 'Java (Gradle)';
  if (kind === 'Node.js' || kind === 'React' || kind === 'Vue' || kind === 'Electron') {
    if (markers.includes('vite') || markers.includes('vite.config.*')) frameworkLabel = 'Vite';
    else if (markers.includes('webpack') || markers.includes('webpack.config.*')) frameworkLabel = 'Webpack';
    else if (markers.includes('next.config.*')) frameworkLabel = 'Next';
  }
  if (!kind) {
    const readsLike = markers.some((m) => ['src', 'app', 'electron', 'index.html', 'README.md'].includes(m));
    const hasCode = markers.includes('src') || markers.includes('app') || markers.includes('electron');
    if ((hasCode && readsLike) || (markers.length >= 3 && readsLike)) {
      kind = 'projeto-like (sem manifest)';
    }
  }
  if (!kind) return { detected: false, kind: null, framework: null, markers: [] };
  return { detected: true, kind, framework: frameworkLabel, markers };
}

async function inspectPath(input) {
  let target;
  try {
    target = resolveAbsolute(input);
  } catch (e) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  let st;
  try {
    st = await lstatEntry(target);
  } catch {
    st = null;
  }
  if (!st || !st.ok) {
    const code = (st && st.code) || 'EACCES';
    return { ok: true, exists: false, path: target, type: null, error: { code, message: (st && st.message) || 'acesso negado' } };
  }
  return summary(st, target);
}

async function analyzeDirectory(input, opts = {}) {
  let target;
  try {
    target = resolveAbsolute(input);
  } catch (e) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  const st = await lstatEntry(target);
  if (!st.ok) {
    return { ok: true, exists: false, path: target, type: null, error: { code: st.code, message: st.message } };
  }
  if (!st.isDir) {
    const single = summary(st, target);
    single.scope = 'arquivo';
    return single;
  }
  const deep = Boolean(opts.deep);
  const entryLimit = Number.isInteger(opts.entryLimit) ? opts.entryLimit : DEFAULT_ENTRY_LIMIT;
  const depthLimit = Number.isInteger(opts.depthLimit) ? opts.depthLimit : DEFAULT_DEPTH;
  const token = makeToken(opts.cancelId);
  const result = {
    ok: true, exists: true, path: target, type: 'directory', deep,
    files: 0, folders: 0, links: 0, totalBytes: 0, totalFolders: 0, totalFiles: 0,
    entries: [], errors: [], truncated: [], scanned: 0,
    project: null, scope: 'diretório'
  };
  const first = await fsp.readdir(target, { withFileTypes: true }).catch((e) => {
    noteError(result.errors, target, e);
    return null;
  });
  if (!first) return result;
  result.entries = [];
  const stack = [{ dir: target, names: first, depth: 0 }];
  let sawNames = first;
  while (stack.length) {
    if (token && token.cancelled) break;
    if (result.scanned >= entryLimit) { result.truncated.push('limite de entradas'); break; }
    const frame = stack.pop();
    const dir = frame.dir;
    const names = frame.names;
    result.scanned += 1;
    const entries = [];
    for (const dirent of names) {
      if (token && token.cancelled) break;
      if (result.scanned >= entryLimit) { result.truncated.push('limite de entradas'); break; }
      result.scanned += 1;
      const full = path.join(dir, dirent.name);
      const meta = await lstatEntry(full);
      if (!meta.ok) { noteError(result.errors, full, meta); continue; }
      const isLink = dirent.isSymbolicLink() || meta.isLink;
      const isDir = !isLink && (dirent.isDirectory() || meta.isDir);
      const isFile = !isLink && !isDir && (dirent.isFile() || meta.isFile);
      const hidden = dotHidden(dirent.name);
      if (isDir) {
        result.folders += 1;
        if (deep) result.totalFolders += 1;
        if (frame.depth === 0) entries.push({ name: dirent.name, type: 'dir', isDir: true, isLink: false, hidden });
        if (deep && frame.depth < depthLimit) {
          const child = await fsp.readdir(full, { withFileTypes: true }).catch((e) => {
            noteError(result.errors, full, e);
            return null;
          });
          if (child) stack.push({ dir: full, names: child, depth: frame.depth + 1 });
        }
      } else if (isFile) {
        result.files += 1;
        result.totalBytes += meta.size || 0;
        if (deep) result.totalFiles += 1;
        if (frame.depth === 0) entries.push({ name: dirent.name, type: 'file', isDir: false, isLink: false, hidden, size: meta.size || 0, mtime: meta.mtimeISO });
      } else {
        result.links += 1;
        if (frame.depth === 0) entries.push({ name: dirent.name, type: 'link', isDir: false, isLink: true, hidden });
      }
    }
    if (frame.depth === 0) {
      result.entries = entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      sawNames = names;
    }
  }
  deleteToken(opts.cancelId);
  result.totalFiles = deep ? (result.totalFiles || result.files) : result.files;
  result.totalFolders = deep ? (result.totalFolders || result.folders) : result.folders;
  result.cancelled = Boolean(token && token.cancelled);
  result.entryLimit = entryLimit;
  result.depthLimit = depthLimit;
  const proj = await detectProject(target, sawNames.map((d) => d.name));
  if (proj.detected) {
    result.project = { detected: true, kind: proj.kind, framework: proj.framework, markers: proj.markers };
  } else {
    result.project = { detected: false, kind: null, framework: null, markers: [] };
  }
  return result;
}

function chunkLoop(fn, start, end, step) {
  return new Promise((resolve) => {
    (function next(i) {
      if (i >= end) return resolve();
      const to = Math.min(end, i + step);
      for (let j = i; j < to; j++) fn(j);
      setImmediate(() => next(to));
    })(start);
  });
}

async function searchByName(inputs, opts = {}) {
  const roots = Array.isArray(inputs) ? inputs : [inputs];
  if (!validName(opts.name)) return { ok: false, error: { code: 'EINVAL', message: 'Nome de busca inválido.' } };
  const type = opts.type === 'dir' ? 'dir' : opts.type === 'file' ? 'file' : 'both';
  const resolvedRoots = [];
  for (const root of roots) {
    try {
      resolvedRoots.push(resolveAbsolute(root));
    } catch {}
  }
  if (!resolvedRoots.length) return { ok: false, error: { code: 'EINVAL', message: 'Nenhuma raiz válida de busca.' } };
  const entryLimit = Number.isInteger(opts.entryLimit) ? opts.entryLimit : DEFAULT_ENTRY_LIMIT;
  const depthLimit = Number.isInteger(opts.depthLimit) ? opts.depthLimit : DEFAULT_DEPTH;
  const maxResults = Number.isInteger(opts.maxResults) ? opts.maxResults : MAX_RESULTS;
  const token = makeToken(opts.cancelId);
  const started = Date.now();
  const needle = opts.name.toLowerCase();
  const results = [];
  const errors = [];
  let scanned = 0;
  let trimmed = false;
  const visited = new Set();
  outer:
  for (const root of resolvedRoots) {
    try {
      let seed = await fsp.readdir(root, { withFileTypes: true }).catch((e) => { noteError(errors, root, e, 10); return null; });
      if (!seed) continue;
      const stack = [{ dir: root, names: seed, depth: 0 }];
      while (stack.length) {
        if (token && token.cancelled) break;
        if (scanned >= entryLimit) { trimmed = true; break outer; }
        const frame = stack.pop();
        const dir = frame.dir;
        for (const dirent of frame.names) {
          if (token && token.cancelled) break outer;
          if (scanned >= entryLimit) { trimmed = true; break outer; }
          if (results.length >= maxResults && maxResults > 0) break outer;
          scanned += 1;
          if (scanned % 2048 === 0) setImmediate(() => {});
          const full = path.join(dir, dirent.name);
          const isLink = dirent.isSymbolicLink();
          const isDir = !isLink && dirent.isDirectory();
          const isFile = !isLink && dirent.isFile();
          const nameMatch = dirent.name.toLowerCase() === needle || dirent.name.toLowerCase().includes(needle);
          const wantDir = type === 'dir' || type === 'both';
          const wantFile = type === 'file' || type === 'both';
          if (isDir) {
            if (wantDir && nameMatch && results.length < maxResults) {
              const meta = await lstatEntry(full);
              results.push({ path: full, name: dirent.name, type: 'dir', isDir: true, isLink: false, size: null, mtime: meta.ok ? meta.mtimeISO : null });
            }
            const lower = dirent.name.toLowerCase();
            if (SKIP_DESCEND.has(lower) || lower.startsWith('.')) continue;
            if (frame.depth < depthLimit && !visited.has(full.toLowerCase())) {
              visited.add(full.toLowerCase());
              const child = await fsp.readdir(full, { withFileTypes: true }).catch((e) => { noteError(errors, full, e, 30); return null; });
              if (child) stack.push({ dir: full, names: child, depth: frame.depth + 1 });
            }
          } else if (isFile) {
            if (wantFile && nameMatch && results.length < maxResults) {
              const meta = await lstatEntry(full);
              results.push({ path: full, name: dirent.name, type: 'file', isDir: false, isLink: false, size: meta.ok ? meta.size : null, mtime: meta.ok ? meta.mtimeISO : null });
            }
          }
        }
      }
    } catch (e) {
      noteError(errors, root, e, 10);
    }
  }
  const cancelled = Boolean(token && token.cancelled);
  deleteToken(opts.cancelId);
  return {
    ok: true, name: opts.name, type, roots: resolvedRoots,
    results, count: results.length, scanned, cancelled, trimmed,
    entryLimit, depthLimit, errors, elapsedMs: Date.now() - started
  };
}

async function discoverProjects(inputs, opts = {}) {
  const roots = Array.isArray(inputs) ? inputs : [inputs];
  const resolvedRoots = [];
  for (const root of roots) {
    try { resolvedRoots.push(resolveAbsolute(root)); } catch {}
  }
  if (!resolvedRoots.length) return { ok: false, error: { code: 'EINVAL', message: 'Nenhuma raiz válida.' } };
  const entryLimit = Number.isInteger(opts.entryLimit) ? opts.entryLimit : DEFAULT_ENTRY_LIMIT;
  const depthLimit = Number.isInteger(opts.depthLimit) ? opts.depthLimit : 4;
  const maxResults = Number.isInteger(opts.maxResults) ? opts.maxResults : 30;
  const filter = typeof opts.filter === 'string' && opts.filter.trim() ? opts.filter.trim().toLowerCase() : null;
  const token = makeToken(opts.cancelId);
  const started = Date.now();
  const projects = [];
  const errors = [];
  let scanned = 0;
  let trimmed = false;
  const visited = new Set();
  outer:
  for (const root of resolvedRoots) {
    try {
      const names = await fsp.readdir(root, { withFileTypes: true }).catch((e) => { noteError(errors, root, e, 10); return null; });
      if (!names) continue;
      const stack = [{ dir: root, names, depth: 0 }];
      while (stack.length) {
        if (token && token.cancelled) break;
        if (scanned >= entryLimit) { trimmed = true; break outer; }
        if (projects.length >= maxResults) break outer;
        const frame = stack.pop();
        const dir = frame.dir;
        scanned += 1;
        const dirNames = frame.names.filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name);
        if (dirNames.length) {
          const proj = await detectProject(dir, dirNames);
          if (proj.detected) {
            const matchesFilter = !filter || proj.kind.toLowerCase().includes(filter) || String(proj.framework || '').toLowerCase().includes(filter) || proj.markers.some((m) => String(m).toLowerCase().includes(filter));
            if (matchesFilter && projects.length < maxResults) {
              projects.push({ path: dir, kind: proj.kind, framework: proj.framework, markers: proj.markers });
            }
          }
          for (const name of dirNames) {
            if (token && token.cancelled) break;
            if (scanned >= entryLimit) { trimmed = true; break outer; }
            if (projects.length >= maxResults) break outer;
            const lower = name.toLowerCase();
            if (SKIP_DESCEND.has(lower) || SKIP_AT_ROOT.has(name) || lower.startsWith('.')) continue;
            if (frame.depth >= depthLimit) continue;
            const child = path.join(dir, name);
            if (visited.has(child.toLowerCase())) continue;
            visited.add(child.toLowerCase());
            const childNames = await fsp.readdir(child, { withFileTypes: true }).catch((e) => { noteError(errors, child, e, 30); return null; });
            if (!childNames) continue;
            scanned += 1;
            stack.push({ dir: child, names: childNames, depth: frame.depth + 1 });
          }
        }
      }
    } catch (e) {
      noteError(errors, root, e, 10);
    }
  }
  const cancelled = Boolean(token && token.cancelled);
  deleteToken(opts.cancelId);
  return {
    ok: true, roots: resolvedRoots, projects, count: projects.length,
    scanned, cancelled, trimmed, entryLimit, depthLimit,
    filter: filter || null, errors, elapsedMs: Date.now() - started
  };
}
async function hashFile(input) {
  let target;
  try {
    target = resolveAbsolute(input);
  } catch (e) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  const st = await lstatEntry(target);
  if (!st.ok) return { ok: false, path: target, error: { code: st.code, message: st.message } };
  if (!st.isFile) return { ok: false, path: target, error: { code: 'EISDIR', message: 'Hash só é calculado para arquivos.' } };
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(target);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (e) => resolve({ ok: false, path: target, error: { code: e.code || 'ERR', message: e.message || String(e) } }));
    stream.on('end', () => {
      resolve({ ok: true, path: target, sha256: hash.digest('hex').toUpperCase(), size: st.size, mtime: st.mtimeISO });
    });
  });
}

module.exports = {
  detectDrives, inspectPath, analyzeDirectory, searchByName,
  discoverProjects, hashFile, cancelToken, resolveAbsolute, safePathInput,
  validName, MSG_SECONDS, chunkLoop
};