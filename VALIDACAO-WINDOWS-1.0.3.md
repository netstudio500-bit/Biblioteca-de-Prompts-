# Validacao Windows 1.0.3

## Estado

Esta etapa prepara a validacao real do BOT.IA no Windows. Ela nao certifica a versao 1.0.3, nao altera a versao atual `1.0.2` e nao gera installer.

Baseline preservada:

- Versao: `1.0.2`
- Commit de referencia: `49d4b0a08d858ea284121a8b0ecaac801948a0d0`
- Installer: `INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe`
- SHA-256: `7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5`
- Quantidade esperada de `.exe`: `1`

## Execucao no Windows

Abra PowerShell na raiz do projeto e execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\VALIDAR-WINDOWS-1.0.3.ps1
```

O script executa, sem atualizar dependencias:

1. Node, npm e Electron.
2. Ollama CLI, `ollama list` e os endpoints `/api/tags`.
3. Arquivos criticos, versao e entrypoint.
4. Hash e quantidade do installer 1.0.2.
5. `npm ci` usando o `package-lock.json`.
6. `npm run build`.
7. `node cert-runtime-1.0.3.cjs`.
8. `npm audit --omit=dev --audit-level=high`.
9. `git diff --check`.

O resultado e gravado em:

```text
RELATORIO-WINDOWS-1.0.3.md
```

## Classificacao

Cada item usa uma destas classificacoes:

- `PASS — REAL`: executado no Windows com recurso real.
- `PASS — CONTROLADO`: teste deterministico sem substituir runtime real.
- `FAIL`: defeito reproduzido.
- `BLOQUEADO PELO AMBIENTE`: recurso ausente ou indisponivel.
- `NÃO TESTADO`: sem evidencia suficiente.

Mocks nao podem ser classificados como `PASS — REAL`.

## Testes funcionais obrigatorios

Com Electron e Ollama reais disponiveis, registrar no relatorio:

- CHAT.
- Contexto com pelo menos duas mensagens.
- Streaming e igualdade entre chunks concatenados e resposta final.
- ANALYZE.
- CODE.
- Filesystem real via IPC e `fs-audit`.
- Caminho inexistente.
- Pasta vazia.
- Busca e descoberta multi-step.
- ModelRouter com modelos retornados por `ollama list`.
- Cancelamento do Ollama.
- Cancelamento filesystem via `filesystem:cancel` e `cancelToken`.
- Retry transitivo, erro permanente e cancelamento.
- Protecao contra loop e watchdog.
- Concorrencia.
- Memoria, historico, upload, copiar e preview.
- Seguranca Electron: `contextIsolation`, `nodeIntegration` e `sandbox`.

## Criterio de certificacao

A classificacao somente pode mudar para `PRONTO PARA CERTIFICACAO 1.0.3` depois que Windows, Electron, Ollama, UI, streaming e cancelamento IPC forem comprovados como reais e todos os testes criticos passarem.

Nenhuma etapa deste handoff deve:

- alterar `package.json` ou `package-lock.json` para trocar a versao;
- modificar `INSTALADORES_OFICIAIS`;
- mover ou sobrescrever o installer 1.0.2;
- gerar installer 1.0.3;
- instalar Ollama automaticamente;
- converter bloqueio ambiental em sucesso.

Estado esperado antes da validacao Windows:

`BOT.IA 1.0.2 — BASELINE PRESERVADA`

`BOT.IA 1.0.3 — CODIGO PREPARADO / VALIDACAO WINDOWS PENDENTE`
