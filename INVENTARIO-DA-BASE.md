# INVENTÁRIO DA BASE

- Nome do projeto: botia
- Caminho da raiz: /workspaces/Biblioteca-de-Prompts-
- Versão atual: 1.0.2
- Branch atual: main
- Commit atual: 8b2bd0ea12241ae22d35f7aa1119bbbc3e4d831f
- Quantidade total de arquivos incluídos: 39
- Tamanho total do pacote: 111577997 bytes
- Arquivo ZIP: BOT.IA-BASE-COMPLETA.zip
- SHA-256 do ZIP: 48a8919c81b8d844960538ee5b88f0ee656931baed286efa2254ddb0b0c9176c

## Estrutura de diretórios

.
./INSTALADORES_OFICIAIS
./agent
./build
./electron

## Principais arquivos

- package.json
- package-lock.json
- vite.config.mjs
- README.md
- main.jsx
- styles.css
- index.html
- agent/AgentCore.js
- agent/OllamaClient.js
- agent/ModelRouter.js
- agent/ToolRegistry.js
- agent/ContextManager.js
- agent/ResponseValidator.js
- agent/SystemPrompt.js
- agent/AgentWatchdog.js
- agent/index.js
- electron/main.cjs
- electron/preload.cjs
- electron/fs-audit.cjs
- build/icon.svg
- INSTALADORES_OFICIAIS/BOT.IA-Setup-1.0.2.exe
- CERTIFICACAO-1.0.0.md
- CERTIFICACAO-1.0.1.md
- CERTIFICACAO-1.0.2.md

## Tecnologias utilizadas

- JavaScript / ES modules
- React 18
- Vite 8
- Tailwind CSS v4
- Electron 44
- Electron Builder 26
- Ollama (integração via HTTP local)
- Node.js

## Comandos de instalação

```bash
npm install
```

## Comando de desenvolvimento

```bash
npm run dev
```

## Comando de build

```bash
npm run build
```

## Comando de empacotamento

```bash
npm run dist:win
```

## Dependências principais

- @tailwindcss/vite
- electron
- electron-builder
- react
- react-dom
- tailwindcss
- vite

## Integrações externas

- Ollama em http://localhost:11434 e http://127.0.0.1:11434
- acesso local ao sistema de arquivos via IPC do Electron
- execução local do app em ambiente desktop

## Configuração Ollama

- endpoint principal: http://127.0.0.1:11434
- endpoint alternativo: http://localhost:11434
- verificação por /api/tags
- inicialização automática em Windows via ollama.exe serve
- CSP e validação de origem aplicadas na UI

## Arquitetura do AgentCore

O AgentCore orquestra intenção, planejamento, execução de ferramentas, observações, geração de resposta e validação. Ele usa ContextManager para memória, ModelRouter para roteamento de modelos, ToolRegistry para ferramentas do sistema de arquivos, ResponseValidator para validação e AgentWatchdog para impedir loops e falta de progresso.

## Ferramentas disponíveis

- filesystem.drives
- filesystem.inspect
- filesystem.list
- filesystem.search
- filesystem.discover
- filesystem.hash
- filesystem.cancel

## IPCs existentes

- ollama:inspect
- ollama:start
- filesystem:drives
- filesystem:inspect
- filesystem:list
- filesystem:search
- filesystem:discover
- filesystem:hash
- filesystem:cancel

## Fluxo principal da aplicação

1. O Electron carrega a interface web em dist/index.html.
2. A UI detecta o Ollama e mantém estado de conexão.
3. O AgentCore recebe a mensagem do usuário.
4. O agente classifica a intenção e constrói o plano.
5. Ferramentas de filesystem podem ser executadas por IPC seguro.
6. O cliente Ollama envia mensagens para o modelo selecionado.
7. A resposta é validada antes de ser entregue ao usuário.
8. A aplicação persiste memória e histórico em localStorage.

## Arquivos críticos

- src/main.jsx: NÃO EXISTE
- src/styles.css: NÃO EXISTE
- src/agent/AgentCore.js: NÃO EXISTE
- src/agent/OllamaClient.js: NÃO EXISTE
- src/agent/ModelRouter.js: NÃO EXISTE
- src/agent/ToolRegistry.js: NÃO EXISTE
- src/agent/toolSchemas.js: NÃO EXISTE
- src/agent/ContextManager.js: NÃO EXISTE
- src/agent/ResponseValidator.js: NÃO EXISTE
- src/agent/SystemPrompt.js: NÃO EXISTE
- src/agent/AgentWatchdog.js: NÃO EXISTE
- src/agent/index.js: NÃO EXISTE
- electron/main.cjs: EXISTE
- electron/preload.cjs: EXISTE
- electron/fs-audit.cjs: EXISTE
- package.json: EXISTE
- package-lock.json: EXISTE
- vite.config.mjs: EXISTE
- index.html: EXISTE

## Observações de exportação

- Nenhum arquivo do projeto original foi alterado.
- O pacote foi gerado no diretório raiz do projeto.
- node_modules, .git, dist e caches locais foram excluídos do pacote.
