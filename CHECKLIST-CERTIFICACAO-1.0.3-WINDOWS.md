# CHECKLIST DE CERTIFICACAO 1.0.3 — WINDOWS

Estado inicial: `BOT.IA 1.0.2 — BASELINE PRESERVADA`

Commit de referencia: `49d4b0a08d858ea284121a8b0ecaac801948a0d0`

## AMBIENTE

- [ ] Windows real
- [ ] Node
- [ ] npm
- [ ] Electron
- [ ] Ollama
- [ ] Ollama responde em `127.0.0.1:11434`
- [ ] Ollama responde em `localhost:11434`
- [ ] Modelos reais listados por `ollama list`

## APLICACAO

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] Electron inicia
- [ ] Janela abre
- [ ] UI carrega
- [ ] Preload funciona
- [ ] AgentCore inicializa uma unica vez
- [ ] OllamaClient inicializa uma unica vez
- [ ] ToolRegistry inicializa
- [ ] ModelRouter inicializa
- [ ] ContextManager inicializa

## OLLAMA REAL

- [ ] `/api/tags`
- [ ] Modelo real selecionado
- [ ] CHAT
- [ ] CONTEXTO
- [ ] STREAMING
- [ ] ANALYZE
- [ ] CODE
- [ ] CANCELAMENTO
- [ ] Fallback para modelo real existente

## AGENTE

- [ ] FILESYSTEM
- [ ] MULTI-STEP
- [ ] RETRY
- [ ] LOOP PROTECTION
- [ ] WATCHDOG
- [ ] CONCORRENCIA
- [ ] MEMORIA
- [ ] VALIDATOR

## IPC

- [ ] `filesystem.inspect`
- [ ] `filesystem.list`
- [ ] `filesystem.search`
- [ ] `filesystem.discover`
- [ ] `filesystem.hash`
- [ ] `filesystem.cancel`
- [ ] `ollama:inspect`
- [ ] `ollama:start`
- [ ] Cancelamento recebido por `fs-audit.cancelToken()`

## SEGURANCA

- [ ] `contextIsolation: true`
- [ ] `nodeIntegration: false`
- [ ] `sandbox: true`
- [ ] Filesystem acessado somente por IPC
- [ ] Nenhum shell arbitrario
- [ ] Nenhuma execucao de comando originada diretamente do Ollama
- [ ] Allowlist de ferramentas preservada
- [ ] CSP preservada

## REGRESSAO UI

- [ ] Chat normal
- [ ] Mensagem longa
- [ ] Copiar mensagem
- [ ] Upload
- [ ] Historico
- [ ] Limpar historico
- [ ] Preview
- [ ] Cancelamento
- [ ] Sem mensagens duplicadas
- [ ] Sem streams duplicados

## CERTIFICACAO

- [ ] Todos os testes criticos classificados como `PASS — REAL`
- [ ] Build `PASS — REAL`
- [ ] Audit `PASS — REAL`
- [ ] Nenhum item `BLOQUEADO`
- [ ] Nenhum item `NÃO TESTADO`
- [ ] Baseline 1.0.2 verificada antes de qualquer move
- [ ] SHA-256 do installer 1.0.2 confirmado:
  `7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5`

## EVIDENCIA POR TESTE

Para cada item marcado, registrar:

- data e hora;
- Windows e arquitetura;
- Node, npm, Electron e Ollama;
- modelo real;
- comando ou acao executada;
- resultado;
- executionId;
- steps;
- tool calls;
- retries;
- duracao;
- erro, quando houver;
- classificacao: `PASS — REAL`, `PASS — CONTROLADO`, `FAIL`, `BLOQUEADO PELO AMBIENTE` ou `NÃO TESTADO`.

## PROCEDIMENTO

Executar na raiz do projeto em PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\VALIDAR-WINDOWS-1.0.3.ps1
```

Nao alterar versao, nao gerar installer e nao mover o installer 1.0.2 enquanto qualquer item critico estiver pendente.
