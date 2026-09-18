# CERTIFICAÇÃO OFICIAL — BOT.IA v1.0.0

STATUS: `VERSÃO 1.0.0 CONGELADA E CERTIFICADA`

Data da certificação: 2026-09-17

==================================================
ESTADO OFICIAL
==================================================

- Aplicativo: `BOT.IA`
- Versão: `1.0.0`
- AppId: `com.botia.app`
- Instalador oficial: `release/BOT.IA-Setup-1.0.0.exe`

`BOT.IA-Setup-1.0.0.exe = VERSÃO OFICIAL CERTIFICADA`

==================================================
HASH DO INSTALADOR OFICIAL
==================================================

| Arquivo | SHA-256 |
| --- | --- |
| `release/BOT.IA-Setup-1.0.0.exe` | `1CCBDC9A3EC8C4439A0807B991AC98C09EEB31DC451AC7F88731DE8A36F123A8` |

Resultado da verificação: **CONTÉM** (hash confere com o valor certificado).

==================================================
HASH DOS ARQUIVOS FUNCIONAIS
==================================================

| Arquivo | SHA-256 |
| --- | --- |
| `src/main.jsx` | `3A4782AEAD40B6D2C212E865D7039430E7146232F9DD241C33F42C796490E551` |
| `src/styles.css` | `2A6504464EF6CB856EC6921F87EC12B1791DA55E8D5E571576616932CEB9A132` |
| `electron/main.cjs` | `7E16CA29E7EDCF8838D6B0731AC8A72B03717EBD9B3BD18E0F8CBA2A73C12FDF` |
| `electron/preload.cjs` | `1A204276AC17D0BFCBA044F1A6462EB9A2337728AD526483186ED98332E555F3` |
| `index.html` | `35F528CFFF8C23A14E6ECB9CEC9F6A5F864A3A65C9A692353708598B4DD55B4F` |
| `vite.config.mjs` | `589BE02D5B9B50EC30EC964943179FBB323839DFAE798FE5FD124EA219CF4C27` |
| `package.json` | `C5CC1C8F4800FDF9BA2169EDAA9A7944B2A1EB8C857E6BEF9DE543F0F7E8C341` |
| `package-lock.json` | `16E3A8B32E79DB0532BF1B768C1030B324F40A94F3CFD006EC5E2A2CDA76A546` |
| `release/win-unpacked/resources/app.asar` | `71F63813BA37DE8C8AEEF4A948AC38C59E505541BFB06117D58BA1C714036BB3` |

`app.asar` validado contra o `dist`.

==================================================
VALIDADO NA VERSÃO EMPACOTADA
==================================================

- Minimização/restauração do Preview.
- Chat.
- Preview.
- Upload.
- Endpoint.
- Segurança.
- Acessibilidade.
- Scrollbar.

==================================================
PENDÊNCIAS CONHECIDAS
==================================================

- `SEC-07`: ausência de assinatura de código.
- Instalação GUI do Setup não executada.
- Versão `1.0.0` mantida intencionalmente.

NÃO corrigir automaticamente.

==================================================
REGRAS DE CONGELAMENTO (BASELINE IMUTÁVEL)
==================================================

1. A versão certificada atual é um BASELINE IMUTÁVEL.
2. NÃO alterar: `src/main.jsx`, `src/styles.css`, `electron/main.cjs`,
   `electron/preload.cjs`, `index.html`, `vite.config.mjs`, `package.json`,
   `package-lock.json`.
3. NÃO executar: refactor, limpeza, mudanças visuais, atualização de
   dependências, mudanças de arquitetura, alterações no Preview/Chat.
4. NÃO regenerar: `dist/`, instalador ou `app.asar` sem nova autorização.
5. Se algo quebrar: preservar a versão certificada, não sobrescrever o
   instalador oficial, corrigir somente na nova fase.

==================================================
NOVA FASE FUNCIONAL (COMANDO OBRIGATÓRIO DE ABERTURA)
==================================================

Toda nova funcionalidade inicia como `NOVA FASE FUNCIONAL` e deve:
- partir dos hashes atuais;
- não destruir a versão certificada;
- alterar somente os arquivos necessários;
- executar nova auditoria;
- gerar novo `dist`;
- gerar novo instalador;
- testar o app empacotado;
- gerar novo hash do instalador.

NÃO reutilizar automaticamente o instalador `1.0.0` como versão final da
próxima fase.

==================================================
REGRA FINAL
==================================================

- NÃO TOCAR NO CÓDIGO CERTIFICADO.
- NÃO REABRIR BUGS JÁ VALIDADOS.
- NÃO REGERAR O INSTALADOR 1.0.0.