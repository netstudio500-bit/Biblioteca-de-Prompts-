# CERTIFICAÇÃO OFICIAL — BOT.IA 1.0.2 (BASELINE IMUTÁVEL)

- Versão: `1.0.2` (anterior: `1.0.1` — motivo: barra de ações reduzida ao botão único "Copiar mensagem")
- Nome: `BOT.IA`
- AppId: `com.botia.app`
- Data/hora da certificação: `2026-09-17`
- Instalador oficial: `INSTALADORES_OFICIAIS\BOT.IA-Setup-1.0.2.exe`
- Status: `VERSÃO OFICIAL CERTIFICADA E CONGELADA`

## Instalador 1.0.2

- Arquivo: `INSTALADORES_OFICIAIS\BOT.IA-Setup-1.0.2.exe` (MOVE de `release\`; SHA recalculado após o MOVE: idêntico)
- Tamanho: `111447770 bytes`
- Mtime: `17/09/2026 08:34:58`
- SHA-256: `7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5`

## app.asar (extraído de `release\win-unpacked\resources\app.asar`)

- Tamanho: `210939 bytes`
- SHA-256: `52397F518DEC39037068208B190590F626384371F64E482B08D6ABBD83644AF3`
- Arquivos no pacote: `6` (`dist/index.html`, `dist/assets/*`, `electron/*`, `package.json` sanitizado v1.0.2)
- Correspondência com `dist`: bundle JS byte-idêntico (`index--B7E7bd7.js`), `index.html`/`main.cjs`/`preload.cjs` idênticos.
- `package.json` embutido: `name: botia`, `version: 1.0.2`, `productName: BOT.IA`, `main: electron/main.cjs`.

## Arquivos funcionais (SHA-256 | bytes)

- `src/main.jsx`: `538647C4CF83CC216C38D4842B1635064FE31EF21E2AC0245BEAE710C791F6B7` | 64947
- `src/styles.css`: `2A6504464EF6CB856EC6921F87EC12B1791DA55E8D5E571576616932CEB9A132` | 6339
- `electron/main.cjs`: `7E16CA29E7EDCF8838D6B0731AC8A72B03717EBD9B3BD18E0F8CBA2A73C12FDF` | 3840
- `electron/preload.cjs`: `1A204276AC17D0BFCBA044F1A6462EB9A2337728AD526483186ED98332E555F3` | 232
- `index.html`: `35F528CFFF8C23A14E6ECB9CEC9F6A5F864A3A65C9A692353708598B4DD55B4F` | 748
- `vite.config.mjs`: `589BE02D5B9B50EC30EC964943179FBB323839DFAE798FE5FD124EA219CF4C27` | 206
- `package.json`: `8CEEA5C2EF401A628736B71941D2A75906EB8846E6B07E2679532DD46A8142CE` | 1348
- `package-lock.json`: `B8578D7E0B7A302033C0F63130B45770DDCD9BA1D67BC63FAE0337904FF726C3` | 175968

## dist 1.0.2 (SHA-256)

- `dist/index.html`: `7651029424F80260B5A1693EC607A16240D0668694C3930EAECF105294499875` (848 B)
- `dist/assets/index-BOGKa0-C.css`: `27D3967402BA9EEA07EA22090DF7D03BA0CAF3BD7BF3F3DC1AB76EBEBA07F425` (30411 B)
- `dist/assets/index--B7E7bd7.js`: `79C816038FA22E6592FD00FF20F680A7FE55BCABA089F0401F381F11B6A68BC3` (173771 B)

## Alterações funcionais desta versão

- Barra de ações do agente reduzida a UM botão: `Copiar mensagem` (`aria-label`/`title` = "Copiar mensagem", `type=button`, `tabIndex=0`).
- Removidos: botões `Comentar`, `Curtir`, `Compartilhar` e seus handlers `commentMessage`, `toggleMessageLike`, `shareMessage`; estado `liked` removido.
- Copiar copia EXATAMENTE `message.text` (última versão do texto renderizado), incluindo mensagens longas, multilinha e interrompidas.
- Toast: `Mensagem copiada` em sucesso; `Área de transferência indisponível` em falha.
- Preview/minimizador/streaming/Ollama/CSP/Electron: preservados, 0 regressões.

## Validação

- Build: PASS (determinístico; `index--B7E7bd7.js`). `npm audit`: 0 vulnerabilidades. `npm ls --depth=0`: consistente (`botia@1.0.2`). `node --check`: OK ×2.
- FASE 4/5 — Runtime (Electron real, harness `copy3.cjs`): 5/5 mensagens copiadas byte-a-byte (spy `writeText` + round-trip da área de transferência do OS), foco garantido (`hasFocus=true`), barra única (1 botão nos 5), `barSingle` OK, toast `Mensagem copiada`, barra do streaming = 0 botões, rotulações antigas ausentes do DOM, console 0 erros, sem vazamentos de ID/URL/JSON. Smoke: config/preview-min/upload/copiar-conversa/limpar/composer/send presentes.
- FASE 6 — Segurança: `eval` apenas em comentário CSP; sem `window.open`/`postMessage`/`javascript:`/`innerHTML`; `BOT.IA • Mensagem` e termos antigos = 0 no bundle; ocorrências `Comentar/Curtir/Compartilhar` só em `CERTIFICACAO-1.0.1.md` (histórico congelado).
- FASE 7 — `dist:win` gerado: instalador 1.0.2 + win-unpacked + `app.asar` idêntico ao `dist`.
- FASE 9 — `app.asar` validado: 6 arquivos, bundle byte-idêntico ao `dist`, `package.json` embutido = 1.0.2, marcadores presentes/ausentes corretos (`Copiar mensagem` ✓, `Comentar/Curtir/Compartilhar/Repostar/Copiar link` = 0).
- FASE 10 — Binário empacotado real (`release\win-unpacked\BOT.IA.exe`, CDP): boot OK (título `BOT.IA - Sistema Unificado V4 Split`), seed + reload + DOM: 3/3 cópias EXATAS na área de transferência do OS — `COPIA-TESTE-1.0.2`, multilinha `linha 1\nlinha 2\nlinha 3`, e interrompida; `barSingle` ✓, ausência de rótulos antigos ✓, toast ✓.

## Artefatos regeráveis (SHA-256 registrados antes da remoção)

- `win-unpacked\BOT.IA.exe`: `78DACF4303D273E72B90501F38070FC3C74E44FAD23A097FBCA78F09F4BDEFD8`
- `win-unpacked\resources\elevate.exe`: `9B1FBF0C11C520AE714AF8AA9AF12CFD48503EEDECD7398D8992EE94D1B4DC37`
- `BOT.IA-Setup-1.0.2.exe.blockmap`: `912F323ADA07007E4A333BB079CEA1BC56FFE574C6FD7D44CB42D987F219A985` (117581 B)
- `builder-debug.yml`: `83E9B290979B5B01898F7D4B647E4CBFDF24F2C2F703C3D3669D1436AD6BB6EF` (7477 B)
- `.icon-ico\icon.ico`: `149ABEDC34B5BE06762666C562C6E78E567F0CCB3EDC642E7C396F1D7FA54876` (12193 B)

## Instalador 1.0.1 (preservado, imutável — ARQUIVADO)

- Arquivo: `INSTALADORES_ARQUIVADOS\BOT.IA-Setup-1.0.1.exe`
- Tamanho: `111448239 bytes`
- SHA-256: `677B781443EAB52D17743B3865B9CCE6DA30C17DDDD70F3E75D631C675F06A08` (idêntico ao registrado na certificação 1.0.1; apenas o caminho mudou)

## Nota de rastreabilidade

- `INSTALADORES_ARQUIVADOS/` foi recriada nesta finalização e contém apenas o 1.0.1.
  As versões arquivadas anteriores (1.0.0 `1CCBDC9A…23A8` e `.stale-Setup-1.0.0.exe`
  `DCA11A17…2C1D85`) não estão mais em disco — estado alterado fora deste fluxo;
  registros históricos permanecem no catálogo e nas certificações anteriores.
- `release/` removida por completo (artefatos registrados acima); recriável via `npm run dist:win`.

## Pendências (somente em nova ordem específica)

- SEC-07 — assinatura de código.
- Setup GUI não executado.

## Regra do baseline

`1.0.2 = BASELINE OFICIAL`. Nova funcionalidade/correção/mudança visual exige nova fase partindo destes hashes, nova versão, novo instalador e nova certificação. Nunca modificar versão certificada para testes.

## REGISTRO FINAL — BOT.IA 1.0.2 CERTIFICADA E CONGELADA

STATUS:
`BOT.IA 1.0.2 = NOVO BASELINE OFICIAL IMUTÁVEL`

FUNCIONALIDADE CERTIFICADA:
- Barra de ações reduzida a EXATAMENTE 1 botão.
- `Copiar mensagem`.
- Copia exatamente `message.text`.
- Comentar removido.
- Curtir removido.
- Compartilhar removido.
- Repostar/link removido.
- Teste byte-a-byte PASS.
- Teste no aplicativo empacotado PASS.
- Console = 0 erros.
- Segurança = PASS.
- Build = PASS.
- `npm audit` = 0 vulnerabilidades.

INSTALADOR OFICIAL:
`INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe`

APP.ASAR:
`52397F51…44AF3`

INSTALADOR 1.0.2:
`7AC452C4…8EC5`

INSTALADOR 1.0.1:
preservado em `INSTALADORES_ARQUIVADOS/`

ESTRUTURA:
`INSTALADORES_OFICIAIS/`
└── `BOT.IA-Setup-1.0.2.exe`

`INSTALADORES_ARQUIVADOS/`
└── `BOT.IA-Setup-1.0.1.exe`

DOCUMENTAÇÃO:
`CERTIFICACAO-1.0.2.md`

PENDÊNCIAS:
- SEC-07 — assinatura de código.
- Setup GUI — não testado.

REGRA ATIVA:
1.0.2 é o NOVO BASELINE OFICIAL.
Não modificar a versão certificada.
Qualquer nova alteração começa como:

`NOVA FASE FUNCIONAL — BASELINE 1.0.2`