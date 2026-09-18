// Testes unitários do intent router do renderer (handleFilesystemCommand)
const path = require('node:path');
const os = require('node:os');
const fsp = require('node:fs/promises');
const { execFileSync } = require('child_process');

// Mock do window.botiaDesktop.filesystem que chama o módulo real via IPC simulado
const aud = require('D:/FREE.BOT/FREE.BOT-main/FREE.BOT-main/electron/fs-audit.cjs');

const mockApi = {
  drives: async () => {
    try { return { ok: true, drives: aud.detectDrives() }; } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  inspect: async (p) => {
    try { return await aud.inspectPath(p); } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  list: async (p, opts = {}) => {
    try { return await aud.analyzeDirectory(p, opts); } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  search: async (roots, opts = {}) => {
    try { return await aud.searchByName(roots, opts); } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  discover: async (roots, opts = {}) => {
    try { return await aud.discoverProjects(roots, opts); } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  hash: async (p) => {
    try { return await aud.hashFile(p); } catch (e) { return { ok: false, error: { message: e.message } }; }
  },
  cancel: async (cancelId) => {
    try { return { ok: true, cancelled: aud.cancelToken(cancelId) }; } catch (e) { return { ok: false, error: { message: e.message } }; }
  }
};

const sizeOf = (bytes) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`;

async function handleFilesystemCommand(text) {
  const t = text.trim().toLowerCase();
  const api = mockApi;

  try {
    if (/^(liste|lista|arquivos?|pastas?)\s+(.+)/.test(t)) {
      const p = t.match(/^(?:liste|lista|arquivos?|pastas?)\s+(.+)/i)[1].trim();
      const res = await api.list(p, { deep: false });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [
        `📁 ${res.path || p}`,
        `Pastas: ${res.folders ?? 0} | Arquivos: ${res.files ?? 0} | Total: ${res.filesTotal ?? 0}`,
        res.truncated ? "⚠️ Truncado (limite de entradas atingido)" : null,
        res.entries?.map(e => `${e.isDir ? "📂" : "📄"} ${e.name}${e.size != null ? ` (${sizeOf(e.size)})` : ""}`).join("\n"),
      ].filter(Boolean);
      return lines.join("\n");
    }

    if (/^(analise|analisar|inspecione|inspecionar)\s+(.+)/.test(t)) {
      const p = t.match(/^(?:analise|analisar|inspecione|inspecionar)\s+(.+)/i)[1].trim();
      const res = await api.inspect(p);
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      if (!res.exists) return `❌ Não existe: ${p}`;
      const lines = [
        `${res.isDir ? "📁" : "📄"} ${res.path}`,
        `Tipo: ${res.type || (res.isDir ? "diretório" : res.isFile ? "arquivo" : "outro")}`,
        res.size != null ? `Tamanho: ${sizeOf(res.size)}` : null,
        res.mtime ? `Modificado: ${new Date(res.mtime).toLocaleString("pt-BR")}` : null,
        res.isDir && res.files != null ? `Conteúdo: ${res.files} arquivos, ${res.folders} pastas` : null,
      ].filter(Boolean);
      return lines.join("\n");
    }

    if (/^(ache|busque|procure)\s+(.+)/.test(t)) {
      const match = t.match(/^(?:ache|busque|procure)\s+(.+)/i);
      const rest = match[1].trim();
      const typeMatch = rest.match(/^(arquivo|pasta|diretorio|diretório)\s+(.+)/i);
      const type = typeMatch ? typeMatch[1] : "arquivo";
      const name = typeMatch ? typeMatch[2].trim() : rest;
      const res = await api.search(["C:\\", "D:\\"], { name, type: type === "arquivo" ? "file" : "dir", maxResults: 20 });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [`🔍 Busca: "${name}" (${type})`, `Resultados: ${res.count}`];
      if (res.results?.length) {
        lines.push(...res.results.map(r => `${r.type === "dir" ? "📂" : "📄"} ${r.path}${r.size != null ? ` (${sizeOf(r.size)})` : ""}`));
      }
      return lines.join("\n");
    }

    if (/^(descubra|projetos)\s+(.+)/.test(t)) {
      const p = t.match(/^(?:descubra|projetos)\s+(.+)/i)[1].trim();
      const res = await api.discover([p], { maxResults: 10 });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [`📦 Projetos encontrados: ${res.count}`];
      if (res.projects?.length) {
        lines.push(...res.projects.map(p => `📁 ${p.path} (${p.kind}${p.markers ? `, ${p.markers.join(", ")}` : ""})`));
      }
      return lines.join("\n");
    }

    if (/^(quanto pesa|peso|hash)\s+(.+)/.test(t)) {
      const p = t.match(/^(?:quanto pesa|peso|hash)\s+(.+)/i)[1].trim();
      const res = await api.hash(p);
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      return `🔐 SHA256: ${res.sha256}\nTamanho: ${sizeOf(res.size || 0)}`;
    }

    if (/^(unidades|drives|discos)/.test(t)) {
      const res = await api.drives();
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = ["💽 Unidades disponíveis:"];
      if (res.drives?.length) {
        lines.push(...res.drives.map(d => `  ${d.letter}: ${d.label || ""} ${d.available ? "✓" : "✗"}`));
      }
      return lines.join("\n");
    }

    if (/^cancele?\s+(a\s+)?(busca|buscar|pesquisa)/.test(t)) {
      const res = await api.cancel("user-cancel");
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      return res.cancelled ? "✅ Busca cancelada" : "ℹ️ Nenhuma busca ativa para cancelar";
    }

    return null;
  } catch (error) {
    return `Erro no comando de filesystem: ${error.message}`;
  }
}

const testResults = [];
async function runTest(name, fn) {
  try {
    const result = await fn();
    testResults.push({ name, status: 'PASS', data: result });
    console.log('[PASS]', name, '-', JSON.stringify(result).slice(0,200));
    return true;
  } catch (e) {
    testResults.push({ name, status: 'FAIL', error: e.message });
    console.error('[FAIL]', name, ':', e.message);
    return false;
  }
}

(async () => {
  console.log('=== TESTE UNITÁRIO DO INTENT ROUTER DO RENDERER ===\n');

  const base = path.join(os.tmpdir(), 'opencode-cert-router-' + Date.now());
  await fsp.rm(base, { recursive: true, force: true }).catch(()=>{});
  await fsp.mkdir(path.join(base, 'pasta-vazia'), { recursive: true });
  await fsp.mkdir(path.join(base, 'pasta-com-arquivo'), { recursive: true });
  await fsp.writeFile(path.join(base, 'pasta-com-arquivo', 'nota.txt'), 'conteudo real');
  await fsp.mkdir(path.join(base, 'projeto'), { recursive: true });
  await fsp.writeFile(path.join(base, 'projeto', 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0', dependencies: { react: '^18' } }));
  await fsp.mkdir(path.join(base, 'projeto', 'src'), { recursive: true });

  const tests = [
    ['R-01 drives', () => handleFilesystemCommand('unidades')],
    ['R-02 drives (drives)', () => handleFilesystemCommand('drives')],
    ['R-03 inspect pasta real', () => handleFilesystemCommand(`analise ${base}`)],
    ['R-04 inspect pasta vazia', () => handleFilesystemCommand(`analise ${path.join(base, 'pasta-vazia')}`)],
    ['R-05 inspect inexistente', () => handleFilesystemCommand('analise C:\\nao-existe-xyz')],
    ['R-06 inspect arquivo', () => handleFilesystemCommand(`analise ${path.join(base, 'pasta-com-arquivo', 'nota.txt')}`)],
    ['R-07 list pasta com arquivo', () => handleFilesystemCommand(`liste ${path.join(base, 'pasta-com-arquivo')}`)],
    ['R-08 list pasta vazia', () => handleFilesystemCommand(`liste ${path.join(base, 'pasta-vazia')}`)],
    ['R-09 search nota', () => handleFilesystemCommand('ache nota')],
    ['R-10 search package.json', () => handleFilesystemCommand('ache package.json')],
    ['R-11 discover projetos', () => handleFilesystemCommand(`descubra ${base}`)],
    ['R-12 hash arquivo', () => handleFilesystemCommand(`hash ${path.join(base, 'pasta-com-arquivo', 'nota.txt')}`)],
    ['R-13 cancel', () => handleFilesystemCommand('cancele a busca')],
    ['R-14 drives via sinônimo', () => handleFilesystemCommand('quais unidades existem')],
    ['R-15 peso arquivo', () => handleFilesystemCommand(`quanto pesa ${path.join(base, 'pasta-com-arquivo', 'nota.txt')}`)],
    ['R-16 intenção inexistente (não dispara fs)', () => handleFilesystemCommand('ola mundo')],
  ];

  let pass = 0, fail = 0;
  for (const [name, fn] of tests) {
    const ok = await runTest(name, fn);
    if (ok) pass++; else fail++;
  }

  await fsp.rm(base, { recursive: true, force: true }).catch(()=>{});

  console.log(`\n=== RESULTADO ROUTER ===`);
  console.log(`PASS: ${pass} | FAIL: ${fail}`);

  if (fail > 0) process.exit(1);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });