# CERTIFICAÇÃO OFICIAL — BOT.IA 1.0.1 (BASELINE IMUTÁVEL)

- Versão: `1.0.1` (anterior: `1.0.0` — motivo: barra de ações + BUG-N01/BUG-N02)
- Nome: `BOT.IA`
- AppId: `com.botia.app`
- Data/hora da certificação: `2026-09-17 18:55:38 -03:00`
- Instalador oficial: `release\BOT.IA-Setup-1.0.1.exe`
- Status: `VERSÃO OFICIAL CERTIFICADA E CONGELADA`

## Instalador 1.0.1

- Arquivo: `release\BOT.IA-Setup-1.0.1.exe`
- Tamanho: `111448239 bytes`
- Mtime: `17/09/2026 06:44:28`
- SHA-256: `677B781443EAB52D17743B3865B9CCE6DA30C17DDDD70F3E75D631C675F06A08`

## app.asar (extraído de `release\win-unpacked\resources\app.asar`)

- Tamanho: `213090 bytes`
- SHA-256: `2B43A583F5396A3A719C2B40ACE39CDF22845953C3EEF77BD8924EE950CB72B4`
- Arquivos no pacote: `6` (`dist/index.html`, `dist/assets/*`, `electron/*`, `package.json` sanitizado v1.0.1)
- Correspondência com `dist`: bundle JS byte-idêntico, `index.html`/`main.cjs`/`preload.cjs` idênticos.

## Arquivos funcionais (SHA-256 | bytes | linhas)

- `src/main.jsx`: `222F23591C30EBBBF684A0160165B10066FADDC4E1C3132A7EC85813FEC6E4AC` | 68157 | 1876
- `src/styles.css`: `2A6504464EF6CB856EC6921F87EC12B1791DA55E8D5E571576616932CEB9A132` | 6339 | 83
- `electron/main.cjs`: `7E16CA29E7EDCF8838D6B0731AC8A72B03717EBD9B3BD18E0F8CBA2A73C12FDF` | 3840 | 100
- `electron/preload.cjs`: `1A204276AC17D0BFCBA044F1A6462EB9A2337728AD526483186ED98332E555F3` | 232 | 6
- `index.html`: `35F528CFFF8C23A14E6ECB9CEC9F6A5F864A3A65C9A692353708598B4DD55B4F` | 748 | 17
- `vite.config.mjs`: `589BE02D5B9B50EC30EC964943179FBB323839DFAE798FE5FD124EA219CF4C27` | 206 | 8
- `package.json`: `2D3216AEDBA27A1CC27353DC0BD2F14022C8E71529BE9C4804F7D71DEBFF6853` | 1348 | 46
- `package-lock.json`: `F20127C15544C275FF5BF1BA96910301F445F6917EC8C4F181F6005358CC2693` | 175968 | 5135

## dist 1.0.1 (SHA-256)

- `dist/index.html`: `EEB8526F48C2697E75F8DA1E955311AD272F527255E3E84089839DB283278A2B`
- `dist/assets/index-BOGKa0-C.css`: `27D3967402BA9EEA07EA22090DF7D03BA0CAF3BD7BF3F3DC1AB76EBEBA07F425`
- `dist/assets/index-DxN0iKS0.js`: `7E2BBED65FD5064216FE3E1490542540E8BA6C3AFB7BFB0B6EA3D0B375DFF3BA`

## Alterações funcionais desta versão

- BUG-N01 corrigido: trava de envio mantida por janela curta no caminho offline + `!event.repeat` no Enter (delta sempre 2, nunca 4; sem bloqueio permanente).
- BUG-N02 corrigido: `room`/`candidates`/`excess` calculados antes da leitura; excedentes do limite de 5 não são lidos.
- Limpeza: classe morta `custom-scrollbar` removida do JSX (ausente no bundle).
- `MessageActions` (novo, certificado): barra compacta após cada resposta do agente (`from === "them" && !streaming`), 4 botões SVG monocromáticos (`Comentar`, `Repostar ou copiar link`, `Curtir` com `aria-pressed`, `Compartilhar`), `stopPropagation`, foco visível.
- Comentar: `Comentando: "<80 chars>"` no composer, sem enviar, sem backend.
- Repostar: referência interna `BOT.IA • Mensagem <id real>`, toast `Referência copiada`, sem URL externa.
- Curtir: `liked` por mensagem, persiste via `localStorage` (sobrevive a reload), sem servidor.
- Compartilhar: `navigator.share` quando disponível, senão clipboard + `Conteúdo copiado`; cancelamento silencioso.
- Preview/minimizador/streaming/Ollama/CSP/Electron: preservados, 0 regressões.

## Validação

- Build: PASS (determinístico). `npm audit`: 0 vulnerabilidades. `node --check`: OK ×2.
- Runtime (Electron real): streaming, Parar, 3 ciclos parar→nova, BUG-16 (~10s), concorrência on/offline, minimizador durante stream, upload, persistência (0 writes/chunk), estresse, Tab/foco, viewport 380px, reload — PASS, console sem erros.
- Binário 1.0.1 empacotado: boot, janela, saída limpa — PASS.

## Instalador 1.0.0 (preservado, imutável)

- Arquivo: `release\BOT.IA-Setup-1.0.0.exe`
- Tamanho: `111534642 bytes` — Mtime: `17/09/2026 12:03:39` (inalterado)
- SHA-256: `1CCBDC9A3EC8C4439A0807B991AC98C09EEB31DC451AC7F88731DE8A36F123A8`

## Pendências (somente em nova ordem específica)

- SEC-07 — assinatura de código.
- Setup GUI não executado.
- `navigator.share` nativo indisponível/não exercitado no Electron (fallback validado).

## Regra do baseline

`1.0.1 = BASELINE OFICIAL`. Nova funcionalidade/correção/mudança visual exige nova fase partindo destes hashes, nova versão, novo instalador e nova certificação. Nunca modificar versão certificada para testes.
