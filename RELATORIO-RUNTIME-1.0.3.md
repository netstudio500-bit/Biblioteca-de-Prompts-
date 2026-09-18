# RELATORIO RUNTIME 1.0.3

## AMBIENTE
- Data: 2026-09-18T14:45:08.477Z
- OS: linux 6.8.0-1064-azure
- Arquitetura: x64
- Node: v24.20.0
- Projeto: botia 1.0.2

## RESULTADOS
- PASS | Node | v24.20.0
- PASS | npm | 11.19.0
- BLOQUEADO | Electron | sh: 1: electron: Permission denied
- PASS | Arquivos criticos | 12 arquivos presentes
- PASS | Entrypoint | /main.jsx
- PASS | UI sem fetch Ollama direto | main.jsx
- PASS | Instancias principais | AgentCore, OllamaClient, ToolRegistry, ContextManager e ModelRouter
- PASS | AgentCore unico | estrutura encontrada
- PASS | Limites do agente | estrutura encontrada
- PASS | Watchdog integrado | estrutura encontrada
- PASS | ToolRegistry allowlist | estrutura encontrada
- PASS | Signal no ToolRegistry | estrutura encontrada
- PASS | Seguranca Electron | contextIsolation, nodeIntegration e sandbox
- PASS | Filesystem via IPC | preload e fs-audit
- PASS | Scripts do package | dev, build, start, dist:win, dist:dir
- PASS | Versao preservada | 1.0.2
- PASS | Baseline installer | instalador 1.0.2
- PASS | Imports de producao | ./agent/index.js, ./agent/AgentCore.js, ./agent/AgentWatchdog.js, ./agent/OllamaClient.js, ./agent/ToolRegistry.js, ./agent/ModelRouter.js, ./agent/ContextManager.js, ./agent/ResponseValidator.js
- BLOQUEADO | Ollama real | Nenhum endpoint local respondeu e o servico pode nao estar instalado
- PASS | Filesystem real | caminho existente e inexistente
- NÃO TESTADO | CHAT real | Ollama real indisponivel
- NÃO TESTADO | ANALYZE real | Ollama real indisponivel
- NÃO TESTADO | CODE real | Ollama real indisponivel
- BLOQUEADO | Streaming real | Ollama real indisponivel
- BLOQUEADO | Cancelamento Ollama real | Ollama real indisponivel
- BLOQUEADO | Cancelamento IPC real | Electron real indisponivel
- BLOQUEADO | IPC filesystem real | Electron real indisponivel
- BLOQUEADO | UI Electron real | Electron real indisponivel
- NÃO TESTADO | Multi-step real | requer Ollama e Electron reais
- NÃO TESTADO | Memoria UI real | navegador/Electron indisponivel
- PASS | Retry controlado | coberto pelos testes de modulo existentes
- PASS | Loop controlado | coberto pelos testes de modulo existentes
- PASS | Concorrencia controlada | coberta pelos testes de modulo existentes
- PASS | Build limpo | ... transforming... ✓ 25 modules transformed. rendering chunks... computing gzip size... dist/index.html 0.84 kB │ gzip: 0.47 kB dist/assets/index-B_sUPN_G.css 31.32 kB │ gzip: 6.77 kB dist/assets/index-A6-4GiQR.js 194.01 kB │ gzip: 62.77 kB ✓ built in 307ms [33m[INEFFECTIVE_DYNAMIC_IMPORT] [0magent/AgentWatchdog.js is dynamically imported by agent/AgentCore.js but also statically imported by agent/AgentCore.js, dynamic import will not move module into another chunk.

## CLASSIFICACAO
- PASS: comprovado no ambiente atual.
- BLOQUEADO: recurso ausente ou indisponivel no ambiente.
- FAIL: defeito reproduzido no projeto.
- NAO TESTADO: nao executado ou sem evidencia suficiente.

## HASHES
- README.md: 86201dd96848910a2b151e849ece1fd448579a7b4487a6b9ca442ebffacb2e10
- main.jsx: fa1ffb9f9100ad6601fd161dd406c597a0e82818e6a27aa33a63a235699fc5f5
- index.html: 9a904386902a63407fade9efc8c3ff8d02250f9e88737f4a11c886efdb6b8cef
- agent/AgentCore.js: a6c26ae1fcb0231d1800b7b01e38db42f75925e2c38a169f7bce86c385649d19
- agent/AgentWatchdog.js: ffe1134fb3a7703f9dd6ba7fd86345ceb3f3937d2bda1cc9991fdebf5c3f604b
- agent/OllamaClient.js: 20a857880f9b10022db939a7751b8ce2e7927fe5dddd2168b1899b7e03778319
- agent/ToolRegistry.js: 1b503ac760eca88d0004924f893c8fd9262b41b40575acd5ffc5dc3b4ad0ee81
- agent/index.js: 13845d01299912b51b999e26815c2c5a0f29004d62c2766b40c8e2bcf4fbe749

## EXECUCAO WINDOWS
```bash
npm ci
npm run build
node cert-runtime-1.0.3.cjs
```

O diagnostico nao gera installer, nao altera a versao e nao modifica INSTALADORES_OFICIAIS.
