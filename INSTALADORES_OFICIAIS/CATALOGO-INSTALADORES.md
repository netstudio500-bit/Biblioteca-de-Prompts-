# CATÁLOGO DE INSTALADORES OFICIAIS — BOT.IA

Esta pasta é o local oficial de armazenamento dos instaladores do BOT.IA.
Regras permanentes: uma versão certificada = uma cópia oficial; duplicatas
byte-idênticas devem ser removidas; builds com SHA diferente não são apagados
automaticamente; instaladores certificados nunca são sobrescritos; cada nova
versão possui novo SHA-256 e novo registro neste catálogo.

## VERSÃO 1.0.2 (OFICIAL / BASELINE ATUAL)

- arquivo: `BOT.IA-Setup-1.0.2.exe`
- tamanho: `111447770 bytes`
- SHA-256: `7AC452C49C89385EEA8B3F745034842B5574CC0E358944C600366DB9AA3E8EC5`
- status: `OFICIAL / CERTIFICADA / BASELINE ATUAL`
- certificação: `CERTIFICACAO-1.0.2.md`
- app.asar: `52397F518DEC39037068208B190590F626384371F64E482B08D6ABBD83644AF3`
- Pasta oficial contém EXATAMENTE 1 `.exe` (o 1.0.2): `EXE_COUNT = 1`.

## VERSÃO 1.0.1 (ARQUIVADA)

- arquivo: `BOT.IA-Setup-1.0.1.exe` → `INSTALADORES_ARQUIVADOS\BOT.IA-Setup-1.0.1.exe`
- tamanho: `111448239 bytes`
- SHA-256: `677B781443EAB52D17743B3865B9CCE6DA30C17DDDD70F3E75D631C675F06A08`
- status: `ARQUIVADA / CERTIFICADA`
- certificação: `CERTIFICACAO-1.0.1.md`
- motivo do arquivamento: substituída pela 1.0.2 (barra de ações = botão único
  "Copiar mensagem"); SHA recalculado após o MOVE: idêntico (só o caminho mudou).

## VERSÃO 1.0.0 (ARQUIVADA — registro histórico)

- arquivo: `BOT.IA-Setup-1.0.0.exe` (ver histórico abaixo)
- tamanho: `111534642 bytes`
- SHA-256: `1CCBDC9A3EC8C4439A0807B991AC98C09EEB31DC451AC7F88731DE8A36F123A8`
- status: `ARQUIVADA / CERTIFICADA`
- certificação: `CERTIFICACAO-1.0.0.md`
- Observação (2026-09-17): o arquivo NÃO está mais presente em disco;
  somente este registro histórico permanece (ver "Histórico de organização").

## Histórico de organização (2026-09-17)

- Finalização da certificação 1.0.2: `release/` recriada por `npm run dist:win`
  (instalador 1.0.2 + win-unpacked + blockmap); instalador movido para esta
  pasta (MOVE, não cópia); SHA recalculado após a movimentação: idêntico.
- `BOT.IA-Setup-1.0.1.exe` movido desta pasta para `INSTALADORES_ARQUIVADOS/`
  (SHA idêntico após o MOVE); pasta oficial passou a ter só o 1.0.2.
- `release/` removida por completo após registro dos artefatos regeráveis
  (ver "Artefatos regeráveis registrados").
- IMPORTANTE: `INSTALADORES_ARQUIVADOS/` foi RECRIADA nesta finalização.
  As versões anteriores arquivadas (1.0.0 e `.stale-Setup-1.0.0.exe`, SHAs
  `1CCBDC9A…23A8` e `DCA11A17…2C1D85`) NÃO estão mais em disco; os registros
  históricos permanecem neste catálogo e em `CERTIFICACAO-1.0.0.md` /
  `CERTIFICACAO-1.0.1.md`. Nada foi apagado nesta sessão; o estado anterior
  do diretório foi alterado fora deste fluxo.

## Duplicados removidos

- Nenhum. Todos os `.exe` inventariados tinham SHA-256 distintos entre si.

## Temporários removidos de `release/` (SHAs registrados antes)

- `win-unpacked/` — artefato de empacotamento, regenerável via `npm run dist:win`;
  incluía `BOT.IA.exe`
  `78DACF4303D273E72B90501F38070FC3C74E44FAD23A097FBCA78F09F4BDEFD8`
  e `elevate.exe`
  `9B1FBF0C11C520AE714AF8AA9AF12CFD48503EEDECD7398D8992EE94D1B4DC37`.
- `BOT.IA-Setup-1.0.2.exe.blockmap` (117581 B,
  `912F323ADA07007E4A333BB079CEA1BC56FFE574C6FD7D44CB42D987F219A985`).
- `builder-debug.yml` (7477 B,
  `83E9B290979B5B01898F7D4B647E4CBFDF24F2C2F703C3D3669D1436AD6BB6EF`).
- `.icon-ico/icon.ico` (12193 B, `149ABEDC34B5BE06762666C562C6E78E567F0CCB3EDC642E7C396F1D7FA54876`).
- `win-unpacked/resources/app.asar` (210939 B,
  `52397F518DEC39037068208B190590F626384371F64E482B08D6ABBD83644AF3`) —
  mesmo conteúdo byte-a-byte do bundle `dist/` (verificado na FASE 9).
- Motivo: artefatos regeráveis do electron-builder, sem valor de certificação.