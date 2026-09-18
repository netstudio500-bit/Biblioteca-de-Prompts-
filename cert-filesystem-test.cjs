const { contextBridge, ipcRenderer } = require('electron');

// Preload expõe botiaDesktop.filesystem.* — simular invocação IPC real
const fsApi = {
  drives: () => ipcRenderer.invoke('filesystem:drives'),
  inspect: (path) => ipcRenderer.invoke('filesystem:inspect', { path }),
  list: (path, opts = {}) => ipcRenderer.invoke('filesystem:list', { path, ...opts }),
  search: (roots, opts = {}) => ipcRenderer.invoke('filesystem:search', { roots, ...opts }),
  discover: (roots, opts = {}) => ipcRenderer.invoke('filesystem:discover', { roots, ...opts }),
  hash: (path) => ipcRenderer.invoke('filesystem:hash', { path }),
  cancel: (cancelId) => ipcRenderer.invoke('filesystem:cancel', { cancelId })
};

const testResults = [];

async function runTest(name, fn) {
  try {
    const result = await fn();
    testResults.push({ name, status: 'PASS', data: result });
    console.log('[PASS]', name);
  } catch (e) {
    testResults.push({ name, status: 'FAIL', error: e.message });
    console.error('[FAIL]', name, e.message);
  }
}

const sizeOf = (bytes) =>
  bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`;

(async () => {
  console.log('=== INICIANDO TESTES END-TO-END NO ELECTRON ===\n');

  // Teste 1: drives
  await runTest('FS-01 drives', async () => {
    const res = await fsApi.drives();
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { drives: res.drives };
  });

  // Teste 2: inspect C:\
  await runTest('FS-02 inspect C:\\', async () => {
    const res = await fsApi.inspect('C:\\');
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, isDir: res.isDir, files: res.files, folders: res.folders };
  });

  // Teste 3: inspect D:\ (se existir)
  await runTest('FS-03 inspect D:\\', async () => {
    const res = await fsApi.inspect('D:\\');
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, isDir: res.isDir, files: res.files, folders: res.folders };
  });

  // Teste 4: pasta conhecida real
  await runTest('FS-04 pasta real (user profile)', async () => {
    const res = await fsApi.inspect(require('node:os').homedir());
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, isDir: res.isDir, files: res.files, folders: res.folders };
  });

  // Teste 5: pasta vazia
  const os = require('node:os');
  const path = require('node:path');
  const fsp = require('node:fs/promises');
  const emptyDir = path.join(os.tmpdir(), 'opencode-cert-vazia-' + Date.now());
  await fsp.mkdir(emptyDir, { recursive: true });
  await runTest('FS-05 pasta vazia', async () => {
    const res = await fsApi.inspect(emptyDir);
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, isDir: res.isDir, files: res.files, folders: res.folders };
  });

  // Teste 6: pasta inexistente
  await runTest('FS-06 pasta inexistente', async () => {
    const res = await fsApi.inspect('C:\\nao-existe-certificacao-12345');
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, error: res.error };
  });

  // Teste 7: unidade inexistente
  await runTest('FS-07 unidade inexistente', async () => {
    const res = await fsApi.inspect('Z:\\');
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, error: res.error };
  });

  // Teste 8: arquivo real
  const fileDir = path.join(os.tmpdir(), 'opencode-cert-arq-' + Date.now());
  await fsp.mkdir(fileDir, { recursive: true });
  const testFile = path.join(fileDir, 'teste-cert.txt');
  await fsp.writeFile(testFile, 'conteudo de teste real certificacao');
  await runTest('FS-08 arquivo real', async () => {
    const res = await fsApi.inspect(testFile);
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, isFile: res.isFile, size: res.size };
  });

  // Teste 9: arquivo inexistente
  await runTest('FS-09 arquivo inexistente', async () => {
    const res = await fsApi.inspect(path.join(fileDir, 'nao-existe.txt'));
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { exists: res.exists, error: res.error };
  });

  // Teste 10: list (shallow)
  await runTest('FS-10 list shallow', async () => {
    const res = await fsApi.list(fileDir);
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { files: res.files, folders: res.folders };
  });

  // Teste 11: list (deep)
  await runTest('FS-11 list deep', async () => {
    const res = await fsApi.list(fileDir, { deep: true });
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { files: res.files, folders: res.folders, totalFiles: res.totalFiles, totalFolders: res.totalFolders };
  });

  // Teste 12: search por nome
  await runTest('FS-12 search', async () => {
    const res = await fsApi.search([fileDir], { name: 'teste', type: 'file', maxResults: 10 });
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { count: res.count, results: res.results?.map(r => r.name) };
  });

  // Teste 13: discover projects
  await runTest('FS-13 discover', async () => {
    const res = await fsApi.discover([fileDir], { maxResults: 5 });
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { count: res.count, projects: res.projects?.map(p => p.kind) };
  });

  // Teste 14: hash real
  await runTest('FS-14 hash', async () => {
    const res = await fsApi.hash(testFile);
    if (!res.ok) throw new Error(res.error?.message || 'falha');
    return { sha256: res.sha256, size: res.size };
  });

  // Teste 15: hash byte-idêntico
  const copyFile = path.join(fileDir, 'copy-teste-cert.txt');
  await fsp.copyFile(testFile, copyFile);
  await runTest('FS-15 hash byte-identico', async () => {
    const h1 = await fsApi.hash(testFile);
    const h2 = await fsApi.hash(copyFile);
    if (!h1.ok || !h2.ok) throw new Error('hash falhou');
    return { identical: h1.sha256 === h2.sha256, h1: h1.sha256, h2: h2.sha256 };
  });

  // Teste 16: hash diferente
  const diffFile = path.join(fileDir, 'diff-teste-cert.txt');
  await fsp.writeFile(diffFile, 'conteudo diferente');
  await runTest('FS-16 hash diferente', async () => {
    const h1 = await fsApi.hash(testFile);
    const h2 = await fsApi.hash(diffFile);
    if (!h1.ok || !h2.ok) throw new Error('hash falhou');
    return { different: h1.sha256 !== h2.sha256, h1: h1.sha256, h2: h2.sha256 };
  });

  // Teste 17: cancelamento
  await runTest('FS-17 cancel', async () => {
    const cancelId = 'cert-cancel-' + Date.now();
    const res = await fsApi.cancel(cancelId);
    return { cancelled: res.cancelled };
  });

  // Limpeza
  await fsp.rm(emptyDir, { recursive: true, force: true }).catch(()=>{});
  await fsp.rm(fileDir, { recursive: true, force: true }).catch(()=>{});

  console.log('\n=== RESULTADO FINAL ===');
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`PASS: ${passed} | FAIL: ${failed}`);

  if (failed > 0) {
    console.log('\nFALHAS:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => console.log(' -', r.name, ':', r.error));
    process.exit(1);
  }
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });