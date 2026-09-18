# INVENTARIO DA ENTREGA GITHUB

- Repositorio destino: `netstudio500-bit/Biblioteca-de-Prompts-`
- Branch: `main`
- Commit de origem: `49d4b0a08d858ea284121a8b0ecaac801948a0d0`
- Commit remoto anterior: `cfda2cbec8d2c0974314bf0261e5d93c331629ed`
- Versao do projeto: `1.0.2`
- Estado: base preparada para validacao Windows
- Arquivos rastreados entregues: 46 antes dos artefatos deste inventario
- Installer 1.0.3: AGUARDANDO WINDOWS REAL
- Installer 1.0.2 binario: omitido deste branch por exceder o limite de 100 MB do GitHub; hash preservado nos registros

## Arquivos entregues

A entrega preserva a estrutura real da base, sem criar `src/` artificial:

- `main.jsx`
- `styles.css`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.mjs`
- `agent/`
- `electron/`
- `build/`
- scripts de teste e certificacao existentes
- documentacao e certificacoes historicas
- `INSTALADORES_OFICIAIS/` e catalogos de instaladores
- `cert-runtime-1.0.3.cjs`
- `VALIDACAO-WINDOWS-1.0.3.md`
- `VALIDAR-WINDOWS-1.0.3.ps1`
- `CHECKLIST-CERTIFICACAO-1.0.3-WINDOWS.md`
- `RELATORIO-RUNTIME-1.0.3.md`

## Arquivos omitidos

- `.git/`
- `node_modules/`
- `dist/`
- `release/`
- caches e logs
- ZIP de exportacao `BOT.IA-BASE-COMPLETA.zip`
- installer 1.0.3, pois ainda nao existe validado em Windows
- `INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe`, omitido do branch por limite de tamanho do GitHub

## Estado da certificacao

A arquitetura foi validada em testes controlados e o build limpo passou. Ollama real, Electron real, UI runtime, streaming real e cancelamento IPC permanecem aguardando ambiente Windows.

## Estado do installer

`INSTALLER 1.0.3 = AGUARDANDO WINDOWS REAL`

O installer 1.0.2 permanece preservado com SHA-256:

`7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5`

## Limitacoes de ambiente

A certificacao 1.0.3 nao deve ser declarada neste ambiente Linux. O handoff Windows esta em `VALIDAR-WINDOWS-1.0.3.ps1` e o checklist esta em `CHECKLIST-CERTIFICACAO-1.0.3-WINDOWS.md`.
