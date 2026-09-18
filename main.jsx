import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  OllamaClient,
  ModelRouter,
  ToolRegistry,
  ContextManager,
  AgentCore,
  ResponseValidator,
  SYSTEM_PROMPT
} from "./agent/index.js";
const defaultSkills = [
  {
    icon: "📚",
    name: "RAG Local",
    desc: "Busca em documentos e memórias salvas antes de responder",
    prompt: "Consulte as memórias e documentos do usuário antes de responder.",
    enabled: true,
    builtin: true,
  },
  {
    id: "csv",
    icon: "📊",
    name: "Analisador CSV",
    desc: "Interpreta planilhas e dados tabulares automaticamente",
    prompt:
      "Analise CSVs com colunas, tipos, outliers e insights estruturados.",
    enabled: true,
    builtin: true,
  },
  {
    id: "gen",
    icon: "🤖",
    name: "Gerador de Agente",
    desc: "Cria sub-agentes especializados sob demanda",
    prompt: "Sugira agentes especializados para tarefas repetitivas.",
    enabled: false,
    builtin: true,
  },
  {
    id: "sql",
    icon: "🗄️",
    name: "SQL Tool",
    desc: "Gera e otimiza queries SQL a partir de linguagem natural",
    prompt: "Traduza pedidos em SQL ANSI otimizado e alerte sobre riscos.",
    enabled: false,
    builtin: true,
  },
];
const defaultAgent = {
  name: "BOT.IA Financeiro",
  systemPrompt:
    "Você é o BOT.IA, assistente financeiro especialista em fluxo de caixa, DRE e análises gerenciais. Seja direto, use markdown e foque em ação.",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
};
const warnStorage = (key, reason) => {
  console.warn(
    `[BOT.IA] localStorage "${key}": ${reason}. Usando valor padrão.`,
  );
};
const dropStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};
const isArrayOfObjects = (value) =>
  Array.isArray(value) &&
  value.every(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  );
const readStored = (key, fallback, isValid) => {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw == null || raw === "") return fallback;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    warnStorage(key, "JSON inválido");
    dropStorage(key);
    return fallback;
  }
  if (!isValid(value)) {
    warnStorage(key, "formato inválido");
    dropStorage(key);
    return fallback;
  }
  return value;
};
const readStoredString = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return typeof value === "string" && value.length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};
const sanitizeAgent = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const number = (input, fallback) =>
    typeof input === "number" && Number.isFinite(input) ? input : fallback;
  return {
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name
        : defaultAgent.name,
    systemPrompt:
      typeof value.systemPrompt === "string"
        ? value.systemPrompt
        : defaultAgent.systemPrompt,
    temperature: number(value.temperature, defaultAgent.temperature),
    topP: number(value.topP, defaultAgent.topP),
    maxTokens: number(value.maxTokens, defaultAgent.maxTokens),
  };
};
const readStoredAgent = (key, fallback) => {
  const stored = readStored(key, fallback, (value) => sanitizeAgent(value) !== null);
  return sanitizeAgent(stored) || fallback;
};
const timeNow = () =>
  new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
const sizeOf = (bytes) =>
  bytes < 1024
    ? `${bytes}B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)}KB`
      : `${(bytes / 1048576).toFixed(1)}MB`;

// BUG-03: limite de leitura por arquivo (evita ler arquivos gigantes inteiros).
const MAX_ATTACH_BYTES = 2 * 1024 * 1024;
const TEXT_FILE_PATTERN =
  /\.(txt|md|markdown|json|csv|log|xml|yaml|yml|js|ts|jsx|tsx|css|html?)$/i;
// SEC-01: contrato local-only — a CSP só permite estas origens.
const OLLAMA_ORIGINS = ["http://127.0.0.1:11434", "http://localhost:11434"];
// BUG-13: abas válidas de configuração.
const CONFIG_TABS = ["memoria", "skills", "agente"];
// BUG-07: id realmente único (fallback seguro para ambientes sem randomUUID).
const uid = (prefix) =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
// SEC-01: aceita apenas URL http(s) apontando para uma origem Ollama permitida.
const parseEndpoint = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return OLLAMA_ORIGINS.includes(url.origin) ? url.origin : null;
};
// FASE 3: limite técnico APENAS da persistência (o estado em memória não é cortado).
const MAX_STORED_MESSAGES = 400;
const MAX_STORED_BYTES = 1500000;
// PEND-07: teto do array em memória, sempre acima do persistido e nunca aplicado
// durante o streaming (a mensagem ativa jamais é removida).
const MAX_MEMORY_MESSAGES = 800;
const limitHistory = (list) => {
  if (!Array.isArray(list) || !list.length)
    return { payload: JSON.stringify([]), dropped: 0 };
  let limited = list;
  let dropped = 0;
  if (limited.length > MAX_STORED_MESSAGES) {
    dropped = limited.length - MAX_STORED_MESSAGES;
    limited = limited.slice(dropped);
  }
  let payload = JSON.stringify(limited);
  // Remove as mais antigas (mantendo as recentes) até caber no limite de bytes,
  // estimando o custo por mensagem para preservar o máximo possível.
  while (payload.length > MAX_STORED_BYTES && limited.length > 1) {
    const perMessage = Math.max(
      1,
      Math.floor(payload.length / limited.length),
    );
    const step = Math.min(
      limited.length - 1,
      Math.max(1, Math.ceil((payload.length - MAX_STORED_BYTES) / perMessage)),
    );
    limited = limited.slice(step);
    dropped += step;
    payload = JSON.stringify(limited);
  }
  return { payload, dropped };
};

// BUG-11: timeout + cancelamento externo sem perder a semântica original.
const signalWithTimeout = (signal, ms) => {
  const timed = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : null;
  if (!timed) return signal;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timed]) : timed;
};

const extractPreviewContent = (text) => {
  if (typeof text !== "string" || !text.trim()) return "";
  const fenced = text.match(/```(?:html|htm|xml|svg)?\s*\n?([\s\S]*?)```/i);
  if (fenced && /<[a-z!/][\s\S]*>/i.test(fenced[1])) return fenced[1].trim();
  const doc =
    text.match(/<!doctype html[\s\S]*?<\/html>/i) ||
    text.match(/<html[\s\S]*?<\/html>/i);
  if (doc) return doc[0].trim();
  const looksLikeMarkup = /<[a-z][^>]*>[\s\S]*<\/[a-z][^>]*>/i.test(text);
  if (looksLikeMarkup) {
    const start = text.search(
      /<(?:!doctype|html|body|div|section|main|header|footer|style|svg|canvas|button|p|ul|ol|table|form|article|aside)\b/i,
    );
    if (start >= 0) return text.slice(start).trim();
  }
  return "";
};

// CONTRATO DEFINITIVO DO PREVIEW (auditoria BUG-05/SEC-06 — limitação
// INTENCIONAL de segurança, não pendência de correção):
//   PERMITIDO  — HTML e CSS do agente (renderização estática).
//   BLOQUEADO  — JavaScript do agente: o documento srcdoc herda a CSP do
//                documento pai (script-src 'self'; sem unsafe-inline/inline-eval),
//                comprovadamente recusando handlers e tags inline.
//   BLOQUEADO  — acesso ao contexto principal: sandbox sem allow-same-origin
//                mantém origem opaca (sem DOM do app, sem localStorage, sem cookies).
//   BLOQUEADO  — navegação externa: frame-src 'none' na CSP + sandbox sem
//                allow-popups/allow-top-navigation + setWindowOpenHandler com
//                allowlist http/https no processo principal.
// Habilitar JS isolado exigiria um webview/BrowserView com sessão e CSP próprias
// (mudança de arquitetura). Não foi feito: a ordem proíbe enfraquecer a segurança
// do renderer para fazer o Preview executar scripts.
const RenderResult = ({ content }) => (
  <div className="preview-stage" role="region" aria-label="Resultado visual do agente">
    {content ? (
      <iframe
        title="Resultado visual do agente"
        className="preview-frame"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={content}
      />
    ) : (
      <p className="preview-empty">Aguardando construção...</p>
    )}
  </div>
);

const ModelSelector = ({ active, models, onSelect }) => (
  <label className="model-selector" title="Trocar modelo do agente">
    <span>MODELO</span>
    <select
      aria-label="Modelo do agente"
      value={active}
      onChange={(event) => onSelect(event.target.value)}
      disabled={!models.length}
    >
      <option value="">
        {models.length ? "NENHUM MODELO" : "NENHUM MODELO INSTALADO"}
      </option>
      {models.map((model) => (
        <option key={model.name} value={model.name}>
          {model.name}
        </option>
      ))}
    </select>
    <span className="model-chevron">▼</span>
  </label>
);

const Status = ({ status }) => {
  const text = status || "";
  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span
        className={`h-2 w-2 rounded-full ${text === "OLLAMA ONLINE" ? "bg-emerald-400" : text === "CONECTANDO..." || text.includes("INICIANDO") ? "bg-amber-300 animate-pulse" : "bg-red-400"}`}
      />
      {text}
    </div>
  );
};

const actionButtonClass = (active) =>
  `flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors ${
    active ? "text-white" : "text-[#999]"
  } hover:border-white/10 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60`;

// Barra de ações das respostas do agente: somente leitura/originada por props,
// sem listeners globais, sem timers, sem estado próprio.
// Barra de ações das respostas do agente: somente leitura/originada por props,
// sem listeners globais, sem timers, sem estado próprio. Único botão: Copiar mensagem.
const MessageActions = ({ message, onCopyMessage }) => (
  <div
    className="mt-2 flex max-w-full flex-wrap items-center gap-1"
    role="group"
    aria-label="Ações da resposta"
    onClick={(event) => event.stopPropagation()}
  >
    <button
      type="button"
      aria-label="Copiar mensagem"
      title="Copiar mensagem"
      onClick={(event) => {
        event.stopPropagation();
        onCopyMessage(message);
      }}
      className={actionButtonClass(false)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  </div>
);

const Message = ({ message, onCopyMessage }) => (
  <div
    className={`flex ${message.from === "me" ? "justify-end" : "justify-start"}`}
  >
    {message.from === "system" ? (
      <div className="rounded-full bg-[#2A2A2A] px-4 py-2 font-mono text-[10px] text-[#999]">
        ⚙️ {message.text} · {message.time}
      </div>
    ) : (
      <div
        className={`max-w-[88%] px-5 py-3 ${message.from === "me" ? "border-l-2 border-white/15 bg-transparent pr-1 text-[#EDEDED]" : "bg-transparent"}`}
      >
        {message.model && (
          <p className="mb-1 font-mono text-[10px] text-emerald-300">
            {message.model}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.text || (message.streaming ? "..." : "")}
        </p>
        {message.files?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.files.map((file) => (
              <span
                key={file.name}
                className="rounded-full border border-white/10 px-2 py-1 font-mono text-[10px]"
              >
                📎 {file.name} · {file.size}
              </span>
            ))}
          </div>
        )}
        {message.context && (
          <div className="mt-3 flex flex-wrap gap-1 pt-2">
            {message.context.memories.map((memory) => (
              <span
                key={memory.id}
                className="rounded-full bg-amber-500/10 px-2 py-1 font-mono text-[9px] text-amber-200"
              >
                📌 {memory.title}
              </span>
            ))}
            {message.context.skills.map((skill) => (
              <span
                key={skill.id}
                className="rounded-full bg-white/5 px-2 py-1 font-mono text-[9px]"
              >
                {skill.icon} {skill.name}
              </span>
            ))}
          </div>
        )}
        {message.interrupted && (
          <span className="mt-1 block font-mono text-[9px] text-[#8a8a8a]">
            ⏹ geração interrompida
          </span>
        )}
        <span className="mt-2 block font-mono text-[10px] opacity-60">
          {message.time}
        </span>
        {message.from === "them" && !message.streaming && (
          <MessageActions message={message} onCopyMessage={onCopyMessage} />
        )}
      </div>
    )}
  </div>
);

const copyConversationText = (messages) =>
  messages
    .filter((message) => message.from === "me" || message.from === "them")
    .map(
      (message) =>
        `${message.from === "me" ? "USUÁRIO" : "AGENTE"}:\n${message.text || ""}`,
    )
    .join("\n\n");

async function handleFilesystemCommand(text) {
  const t = text.trim().toLowerCase();
  const api = window.botiaDesktop?.filesystem;
  if (!api) return null;

  try {
    if (/^(liste|lista|arquivos?|pastas?)\s+(.+)/.test(t)) {
      const path = t.match(/^(?:liste|lista|arquivos?|pastas?)\s+(.+)/i)[1].trim();
      const res = await api.list(path, { deep: false });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [
        `📁 ${res.path || path}`,
        `Pastas: ${res.folders ?? 0} | Arquivos: ${res.files ?? 0} | Total: ${res.filesTotal ?? 0}`,
        res.truncated ? "⚠️ Truncado (limite de entradas atingido)" : null,
        res.entries
          ?.map(
            (e) =>
              `${e.isDir ? "📂" : "📄"} ${e.name}${e.size != null ? ` (${sizeOf(e.size)})` : ""}`,
          )
          .join("\n"),
      ].filter(Boolean);
      return lines.join("\n");
    }

    if (/^(analise|analisar|inspecione|inspecionar)\s+(.+)/.test(t)) {
      const path = t.match(/^(?:analise|analisar|inspecione|inspecionar)\s+(.+)/i)[1].trim();
      const res = await api.inspect(path);
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      if (!res.exists) return `❌ Não existe: ${path}`;
      const lines = [
        `${res.isDir ? "📁" : "📄"} ${res.path}`,
        `Tipo: ${res.type || (res.isDir ? "diretório" : res.isFile ? "arquivo" : "outro")}`,
        res.size != null ? `Tamanho: ${sizeOf(res.size)}` : null,
        res.mtime ? `Modificado: ${new Date(res.mtime).toLocaleString("pt-BR")}` : null,
        res.isDir && res.files != null
          ? `Conteúdo: ${res.files} arquivos, ${res.folders} pastas`
          : null,
      ].filter(Boolean);
      return lines.join("\n");
    }

    if (/^(ache|busque|procure)\s+(.+)/.test(t)) {
      const match = t.match(/^(?:ache|busque|procure)\s+(.+)/i);
      const rest = match[1].trim();
      const typeMatch = rest.match(/^(arquivo|pasta|diretorio|diretório)\s+(.+)/i);
      const type = typeMatch ? typeMatch[1] : "arquivo";
      const name = typeMatch ? typeMatch[2].trim() : rest;
      const res = await api.search(["C:\\", "D:\\"], { name, type: type === "arquivo" ? "file" : "dir", maxResults: 20 });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [`🔍 Busca: "${name}" (${type})`, `Resultados: ${res.count}`];
      if (res.results?.length) {
        lines.push(
          ...res.results.map(
            (r) =>
              `${r.type === "dir" ? "📂" : "📄"} ${r.path}${r.size != null ? ` (${sizeOf(r.size)})` : ""}`,
          ),
        );
      }
      return lines.join("\n");
    }

    if (/^(descubra|projetos)\s+(.+)/.test(t)) {
      const path = t.match(/^(?:descubra|projetos)\s+(.+)/i)[1].trim();
      const res = await api.discover([path], { maxResults: 10 });
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = [`📦 Projetos encontrados: ${res.count}`];
      if (res.projects?.length) {
        lines.push(
          ...res.projects.map(
            (p) => `📁 ${p.path} (${p.kind}${p.markers ? `, ${p.markers.join(", ")}` : ""})`,
          ),
        );
      }
      return lines.join("\n");
    }

    if (/^(quanto pesa|peso|hash)\s+(.+)/.test(t)) {
      const path = t.match(/^(?:quanto pesa|peso|hash)\s+(.+)/i)[1].trim();
      const res = await api.hash(path);
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      return `🔐 SHA256: ${res.sha256}\nTamanho: ${sizeOf(res.size || 0)}`;
    }

    if (/(^|\s)(unidades|drives|discos)\b/.test(t) && /(quais\s+(?:unidades|drives|discos)\s+(?:existem|dispon[íi]veis)|mostre\s+(?:as\s+)?(?:unidades|drives|discos)\s*(?:dispon[íi]veis)?|liste\s+(?:as\s+)?(?:minhas\s+)?(?:unidades|drives|discos)\s*(?:dispon[íi]veis)?|liste\s+os\s+discos|quais\s+(?:unidades|drives|discos)\s+(?:existem|dispon[íi]veis))\b/.test(t)) {
      const res = await api.drives();
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      const lines = ["💽 Unidades disponíveis:"];
      if (res.drives?.length) {
        lines.push(...res.drives.map((d) => `  ${d.letter}: ${d.label || ""} ${d.available ? "✓" : "✗"}`));
      }
      return lines.join("\n");
    }

    if (/^cancele?\s+(a\s+)?(busca|buscar|pesquisa)/.test(t)) {
      const res = await api.cancel("user-cancel");
      if (!res.ok) return `Erro: ${res.error?.message || "falha"}`;
      return res.cancelled ? "✅ Busca cancelada" : "ℹ️ Nenhuma busca ativa para cancelar";
    }

    return null;
  } catch (error) {
    return `Erro no comando de filesystem: ${error.message}`;
  }
}

function App() {
  const [route, setRoute] = useState(location.hash || "#chat");
  const [messages, setMessages] = useState(() =>
    readStored(
      "botia_messages",
      [
        {
          id: "welcome",
          from: "system",
          text: "BOT.IA • Sistema unificado v4 • Memória + Skills + Agente configurável • Split 50/50",
          time: timeNow(),
        },
      ],
      isArrayOfObjects,
    ),
  );
  const [memories, setMemories] = useState(() =>
    readStored("botia_memories", [], isArrayOfObjects),
  );
  const [skills, setSkills] = useState(() =>
    readStored("botia_skills", defaultSkills, isArrayOfObjects),
  );
  const [agent, setAgent] = useState(() =>
    readStoredAgent("botia_agent", defaultAgent),
  );
  const [endpoint, setEndpoint] = useState(() =>
    readStoredString("botia_endpoint", "http://localhost:11434"),
  );
  const [input, setInput] = useState("");
  const [memTitle, setMemTitle] = useState("");
  const [memContent, setMemContent] = useState("");
  const [newSkill, setNewSkill] = useState({
    icon: "✨",
    name: "",
    desc: "",
    prompt: "",
    enabled: true,
  });
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [attached, setAttached] = useState([]);
  const [splitPct, setSplitPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(innerWidth <= 768);
  const [previewContent, setPreviewContent] = useState(() => {
    // BUG-04: reconstrói o Preview a partir do último HTML salvo no histórico,
    // sem duplicar mensagens e sem alterar o formato persistido.
    const lastReply = [...messages]
      .reverse()
      .find((message) => message.from === "them" && message.text);
    return lastReply ? extractPreviewContent(lastReply.text) : "";
  });
  const [ollama, setOllama] = useState(() => ({
    status: "CONECTANDO...",
    endpoint: "",
    models: [],
    running: [],
    active: readStoredString("botia_active_model", ""),
  }));
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState(null);
  const [copying, setCopying] = useState(false);
  const abortRef = useRef(null);
  const streamingRef = useRef(false); // BUG-01/BUG-09: trava síncrona de geração
  const storageWarnedRef = useRef(false); // BUG-02: avisa cota apenas uma vez
  const historyWarnedRef = useRef(false); // FASE 3: avisa truncamento de histórico
  const memoryWarnedRef = useRef(false); // PEND-07: avisa corte do array em memória
  const [previewMinimized, setPreviewMinimized] = useState(false); // minimizador do Preview
  const toastTimerRef = useRef(null); // BUG-08
  const scrollTimerRef = useRef(null); // BUG-06
  const stickToBottomRef = useRef(true); // BUG-06
  const endpointRef = useRef(endpoint); // BUG-11
  const appliedEndpointRef = useRef(null); // BUG-11
  const firstEndpointRef = useRef(true); // BUG-11
  const detectAbortRef = useRef(null); // BUG-11
  const splitRef = useRef(null);
  const bottomRef = useRef(null);
  const chatScrollRef = useRef(null);
  const fileRef = useRef(null);

  // AgentCore initialization
  const agentCoreRef = useRef(null);
  const ollamaClientRef = useRef(null);
  const agentInitializedRef = useRef(false);
  if (!agentInitializedRef.current && window.botiaDesktop?.filesystem) {
    const fsApi = window.botiaDesktop.filesystem;
    const ollamaClient = new OllamaClient({ baseUrl: endpoint });
    ollamaClientRef.current = ollamaClient;
    const modelRouter = new ModelRouter(ollamaClient);
    const toolRegistry = new ToolRegistry(fsApi);
    const contextManager = new ContextManager({ limits: { maxContextTokens: 8000 } });
    contextManager.setSystemPrompt(SYSTEM_PROMPT);
    const responseValidator = new ResponseValidator({ strictMode: true });
    const agentCore = new AgentCore(ollamaClient, modelRouter, toolRegistry, contextManager, {
      maxSteps: 12,
      stepTimeout: 60000
    });
    agentCore.setOnStepCallback((stepInfo) => {
      console.log('[AgentCore Step]', stepInfo);
    });
    agentCore.setOnProgressCallback((progress) => {
      console.log('[AgentCore Progress]', progress);
    });
    agentCoreRef.current = agentCore;
    agentInitializedRef.current = true;
    console.log('[AgentCore] Initialized');
  }

  const isChat = route === "#chat";
  const hasCopyableMessages = messages.some(
    (message) => message.from === "me" || message.from === "them",
  );
  const requestedTab = route.startsWith("#config/")
    ? route.split("/")[1]
    : "memoria";
  const activeTab = CONFIG_TABS.includes(requestedTab)
    ? requestedTab
    : "memoria";
  const activeSkills = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );
  const pinned = memories.filter((memory) => memory.pinned);
  const contextMemories = pinned.length
    ? pinned
    : memories.filter((memory) => !memory.pinned).slice(0, 5);
  const context = useMemo(
    () =>
      `${agent.systemPrompt}\n\n[MEMÓRIAS DO USUÁRIO]\n${contextMemories.map((memory) => `• ${memory.title}: ${memory.content}`).join("\n")}\n\n[SKILLS ATIVAS]\n${activeSkills.map((skill) => `• ${skill.name}: ${skill.prompt}`).join("\n")}\n\n[CONFIG AGENTE] Nome=${agent.name} | Temp=${agent.temperature} | TopP=${agent.topP} | MaxTokens=${agent.maxTokens}`,
    [agent, contextMemories, activeSkills],
  );

  useEffect(() => {
    const sync = () => setRoute(location.hash || "#chat");
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const resize = () => setIsMobile(innerWidth <= 768);
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    // BUG-13: hash inválido nunca deixa a tela vazia.
    if (route === "#chat") return;
    if (route.startsWith("#config") && CONFIG_TABS.includes(requestedTab)) return;
    navigate(route.startsWith("#config") ? "#config/memoria" : "#chat");
  }, [route, requestedTab]);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);
  useEffect(
    () => () => {
      // BUG-06/BUG-08/BUG-11: limpa timers e diagnóstico pendente no unmount.
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      detectAbortRef.current?.abort();
      agentCoreRef.current?.abort();
    },
    [],
  );
  const persist = (key, value) => {
    try {
      localStorage.setItem(key, value);
      storageWarnedRef.current = false;
      return true;
    } catch (error) {
      // BUG-02: trata QuotaExceededError sem apagar histórico e sem quebrar o app.
      const quota =
        error?.name === "QuotaExceededError" ||
        error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error?.code === 22;
      console.warn(`[BOT.IA] Falha ao salvar ${key}:`, error?.message);
      if (quota && !storageWarnedRef.current) {
        storageWarnedRef.current = true;
        notify(
          "Armazenamento local cheio: novas mensagens podem não ser salvas. Copie a conversa e use Limpar para liberar espaço.",
        );
      }
      return false;
    }
  };
  const persistMessages = (list) => {
    // FASE 3: aplica o limite técnico antes do JSON.stringify e avisa ao truncar.
    const { payload, dropped } = limitHistory(list);
    if (dropped > 0 && !historyWarnedRef.current) {
      historyWarnedRef.current = true;
      notify(
        `Histórico limitado: ${dropped} mensagem(ns) antiga(s) não serão salvas. As recentes estão preservadas.`,
      );
    }
    if (dropped === 0) historyWarnedRef.current = false;
    return persist("botia_messages", payload);
  };
  useEffect(() => {
    // BUG-02: não persistir a cada chunk do streaming (grava ao terminar a geração).
    if (isStreaming) return;
    persistMessages(messages);
  }, [messages, isStreaming]);
  useEffect(() => {
    // PEND-07: teto do array em memória — só fora do streaming, preservando as
    // mensagens recentes e nunca cortando no meio de uma geração.
    if (isStreaming) return;
    if (messages.length <= MAX_MEMORY_MESSAGES) return;
    const excess = messages.length - MAX_MEMORY_MESSAGES;
    setMessages((items) =>
      items.length <= MAX_MEMORY_MESSAGES
        ? items
        : items.slice(items.length - MAX_MEMORY_MESSAGES),
    );
    if (!memoryWarnedRef.current) {
      memoryWarnedRef.current = true;
      notify(
        `Conversa muito longa: ${excess} mensagem(ns) antiga(s) saíram da tela para manter o app leve. As recentes foram preservadas.`,
      );
    }
  }, [messages, isStreaming]);
  useEffect(() => {
    persist("botia_memories", JSON.stringify(memories));
  }, [memories]);
  useEffect(() => {
    persist("botia_skills", JSON.stringify(skills));
  }, [skills]);
  useEffect(() => {
    persist("botia_agent", JSON.stringify(agent));
  }, [agent]);
  useEffect(() => {
    persist("botia_endpoint", endpoint);
  }, [endpoint]);
  useEffect(() => {
    try {
      if (ollama.active) localStorage.setItem("botia_active_model", ollama.active);
      else localStorage.removeItem("botia_active_model");
    } catch (error) {
      console.warn("[BOT.IA] Falha ao salvar botia_active_model:", error?.message);
    }
  }, [ollama.active]);
  useEffect(() => {
    // BUG-06: auto-scroll com throttle, respeitando quem rolou para cima.
    if (!stickToBottomRef.current || scrollTimerRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      if (!stickToBottomRef.current) return;
      bottomRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
    }, 150);
  }, [messages, isStreaming]);
  const onChatScroll = () => {
    const element = chatScrollRef.current;
    if (!element) return;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const notify = (text) => {
    // BUG-08: um único timer ativo, cancelado antes de cada novo aviso.
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 3000);
  };
  const navigate = (target) => {
    // DUP-03/BUG-13: evita atualização dupla de estado (o hashchange já sincroniza).
    if (location.hash === target) {
      setRoute(target);
      return;
    }
    location.hash = target;
  };
  const clamp = (value) => Math.min(70, Math.max(30, value));
  const startDrag = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };
  useEffect(() => {
    if (!isDragging) return;
    const move = (x, y) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSplitPct(
        clamp(
          isMobile
            ? ((y - rect.top) / rect.height) * 100
            : ((x - rect.left) / rect.width) * 100,
        ),
      );
    };
    const mouse = (event) => move(event.clientX, event.clientY);
    const touch = (event) =>
      event.touches[0] &&
      move(event.touches[0].clientX, event.touches[0].clientY);
    const stop = () => setIsDragging(false);
    addEventListener("mousemove", mouse);
    addEventListener("mouseup", stop);
    addEventListener("touchmove", touch, { passive: false });
    addEventListener("touchend", stop);
    return () => {
      removeEventListener("mousemove", mouse);
      removeEventListener("mouseup", stop);
      removeEventListener("touchmove", touch);
      removeEventListener("touchend", stop);
    };
  }, [isDragging, isMobile]);
  const dividerKey = (event) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "Home") setSplitPct(30);
    else if (event.key === "End") setSplitPct(70);
    else if (event.key === "PageUp") setSplitPct((value) => clamp(value - 5));
    else if (event.key === "PageDown") setSplitPct((value) => clamp(value + 5));
    else if (
      (!isMobile && event.key === "ArrowLeft") ||
      (isMobile && event.key === "ArrowUp")
    )
      setSplitPct((value) => clamp(value - step));
    else if (
      (!isMobile && event.key === "ArrowRight") ||
      (isMobile && event.key === "ArrowDown")
    )
      setSplitPct((value) => clamp(value + step));
    else return;
    event.preventDefault();
  };

  const detectOllama = async () => {
    // BUG-11: cancela o diagnóstico anterior e evita atualização de status inútil.
    detectAbortRef.current?.abort();
    const detectSignal = new AbortController();
    detectAbortRef.current = detectSignal;
    setOllama((value) =>
      // BUG-16: não rebaixar o status durante o polling periódico; se o status
      // virar "CONECTANDO..." um envio nessa janela cairia no caminho offline.
      value.status === "CONECTANDO..." || value.status === "OLLAMA ONLINE"
        ? value
        : { ...value, status: "CONECTANDO..." },
    );
    const desktop = window.botiaDesktop?.inspectOllama
      ? await window.botiaDesktop.inspectOllama()
      : null;
    if (detectSignal.signal.aborted) return;
    const candidates = [
      ...OLLAMA_ORIGINS,
      parseEndpoint(endpointRef.current),
    ].filter((value, index, list) => value && list.indexOf(value) === index);
    for (const base of candidates) {
      if (detectSignal.signal.aborted) return;
      try {
        const client = ollamaClientRef.current;
        if (!client) continue;
        client.setBaseUrl(base);
        const modelResult = await client.listModels();
        if (detectSignal.signal.aborted || !modelResult.ok) continue;
        const runningResult = await client.listRunningModels();
        const running = runningResult.ok ? runningResult.models : [];
        const models = (modelResult.models || [])
          .filter((model) => model?.name)
          .map((model) => ({
            name: model.name,
            size: model.size || 0,
            digest: model.digest || "",
            modified_at: model.modified_at || "",
            installed: true,
          }));
        const runningNames = running
          .map((model) => model.name || model.model)
          .filter(Boolean);
        const preferred = localStorage.getItem("botia_active_model");
        const active = models.some((model) => model.name === preferred)
          ? preferred
          : runningNames.find((name) =>
              models.some((model) => model.name === name),
            ) ||
            models[0]?.name ||
            "";
        const signature = `online|${base}|${active}|${models.map((model) => model.name).join(",")}|${runningNames.join(",")}`;
        setOllama((value) =>
          value.signature === signature
            ? value
            : {
                status: "OLLAMA ONLINE",
                endpoint: base,
                models,
                running,
                active,
                signature,
              },
        );
        appliedEndpointRef.current = base;
        // SEC-01/BUG-16: não sobrescrever um endpoint inválido digitado pelo
        // usuário (o aviso de configuração precisa permanecer visível).
        if (parseEndpoint(endpointRef.current) || !endpointRef.current.trim()) {
          setEndpoint((value) => (value === base ? value : base));
        }
        return;
      } catch {}
    }
    if (detectSignal.signal.aborted) return;
    // SEC-01: endpoint configurado fora do contrato tem erro próprio.
    const invalidEndpoint =
      endpointRef.current.trim() !== "" && !parseEndpoint(endpointRef.current);
    const status = invalidEndpoint
      ? "ENDPOINT INVÁLIDO"
      : desktop?.installed === false
        ? "OLLAMA NÃO DETECTADO"
        : desktop?.installed
          ? "OLLAMA INSTALADO — OFFLINE"
          : "OLLAMA OFFLINE";
    const signature = `offline|${status}`;
    setOllama((value) =>
      value.signature === signature
        ? value
        : { status, endpoint: "", models: [], running: [], active: "", signature },
    );
  };
  useEffect(() => {
    // BUG-11: o polling é criado uma única vez (não reinicia ao trocar endpoint).
    detectOllama();
    const timer = setInterval(detectOllama, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // BUG-11: mudança Manual de endpoint dispara um único re-diagnóstico.
    if (appliedEndpointRef.current === endpoint) return;
    if (firstEndpointRef.current) {
      firstEndpointRef.current = false;
      return;
    }
    const timer = setTimeout(detectOllama, 400);
    return () => clearTimeout(timer);
  }, [endpoint]);
  const startOllama = async () => {
    setOllama((value) => ({ ...value, status: "OLLAMA INSTALADO — INICIANDO..." }));
    const result = await window.botiaDesktop?.startOllama?.();
    notify(
      result?.message ||
        (result?.ok
          ? "Ollama iniciado, conectando..."
          : "Inicie o Ollama manualmente."),
    );
    setTimeout(detectOllama, 1500);
  };

  const fileContext = (files) => {
    if (!files?.length) return "";
    return files
      .map((file) =>
        file.content
          ? `\n\n[ARQUIVO: ${file.name}]\n${file.content}`
          : `\n\n[ARQUIVO ANEXADO: ${file.name} (${file.size}) · conteúdo binário não inlinado]`,
      )
      .join("");
  };
  const sendMessage = async () => {
    // BUG-09: trava síncrona (o estado React não bloqueia dois Enter no mesmo tick).
    if ((!input.trim() && !attached.length) || streamingRef.current) return;
    streamingRef.current = true;
    const content = input.trim() || "Arquivos anexados";
    const fileNames = attached.map((file) => file.name).join(", ");
    const userText = fileNames ? `${content} [${fileNames}]` : content;
    const attachmentContext = fileContext(attached);
    setMessages((items) => [
      ...items,
      {
        id: uid("user"),
        from: "me",
        text: userText,
        files: attached,
        time: timeNow(),
      },
    ]);
    setInput("");
    setAttached([]);

    // Use AgentCore for all message processing (filesystem + Ollama + validation)
    const agentCore = agentCoreRef.current;
    if (agentCore) {
      try {
        // Add user message to context
        agentCore.context.addShortMessage({ from: 'me', text: userText, time: timeNow() });

        // Show streaming placeholder
        const id = uid("assistant");
        setMessages((items) => [
          ...items,
          {
            id,
            from: "them",
            model: "AGENTE",
            text: "",
            streaming: true,
            time: timeNow(),
          },
        ]);
        setIsStreaming(true);

        // Set up step/progress callbacks for UI updates
        agentCore.setOnProgressCallback((progress) => {
          console.log('[AgentCore Progress]', progress);
        });
        agentCore.setOnStepCallback((stepInfo) => {
          console.log('[AgentCore Step]', stepInfo);
        });

        // Process through AgentCore (handles intent, planning, tools, Ollama, validation)
        const result = await agentCore.process(userText);

        // Get final response from agent context
        const shortMem = agentCore.context.getShortMemory(1);
        const lastMsg = shortMem[shortMem.length - 1];
        const finalText = lastMsg?.content?.text || (result.ok ? result.response : `Erro: ${result.error?.message}`);

        // Validate response against observations
        const observations = agentCore.context.getWorkingMemory()
          .filter(m => m.content?.type === 'observation')
          .map(m => m.content);
        const validator = new ResponseValidator({ strictMode: true });
        const validation = validator.validate(finalText, observations, agentCore.tools.getAllTools().map(t => ({ tool: t.id })));
        const finalResponse = validator.blockUnverifiedClaims ? validator.response : finalText;

        // Update message with final response
        setMessages((items) =>
          items.map((message) =>
            message.id === id
              ? { ...message, streaming: false, text: finalResponse, model: validator.ok ? "AGENTE ✓" : "AGENTE ⚠" }
              : message,
          ),
        );
        const visual = extractPreviewContent(finalResponse);
        if (visual) setPreviewContent(visual);
      } catch (error) {
        console.error('[AgentCore] Error:', error);
        // Fallback to old behavior
        const fsResult = await handleFilesystemCommand(content);
        if (fsResult) {
          setMessages((items) => [
            ...items,
            {
              id: uid("fs"),
              from: "them",
              model: "FILESYSTEM • LOCAL",
              text: fsResult,
              time: timeNow(),
            },
          ]);
          const visual = extractPreviewContent(fsResult);
          if (visual) setPreviewContent(visual);
          streamingRef.current = false;
          return;
        }

        if (ollama.status !== "OLLAMA ONLINE" || !ollama.active) {
          const offlineText = `${ollama.status}\n\nContexto montado: ${contextMemories.length} memórias + ${activeSkills.length} skills.`;
          setMessages((items) => [
            ...items,
            {
              id: uid("offline"),
              from: "them",
              model: agent.name,
              text: offlineText,
              context: { memories: contextMemories, skills: activeSkills },
              time: timeNow(),
            },
          ]);
          const offlineVisual = extractPreviewContent(offlineText);
          if (offlineVisual) setPreviewContent(offlineVisual);
          window.setTimeout(() => {
            if (streamingRef.current) streamingRef.current = false;
          }, 300);
          return;
        }

        // Fallback to direct Ollama
        const id = uid("assistant");
        setMessages((items) => [
          ...items,
          {
            id,
            from: "them",
            model: `${ollama.active} • ${agent.name}`,
            text: "",
            streaming: true,
            time: timeNow(),
            context: { memories: contextMemories, skills: activeSkills },
          },
        ]);
        setIsStreaming(true);
        const controller = new AbortController();
        abortRef.current = controller;
        let full = "";
        try {
          const response = await ollamaClientRef.current.chat(
            [
              { role: "system", content: context },
              ...messages
                .filter((message) => message.from === "me" || message.from === "them")
                .slice(-10)
                .map((message) => ({
                  role: message.from === "me" ? "user" : "assistant",
                  content: message.from === "me" ? `${message.text}${fileContext(message.files)}` : message.text,
                })),
              { role: "user", content: `${userText}${attachmentContext}` },
            ],
            { model: ollama.active, stream: true, options: { temperature: agent.temperature, top_p: agent.topP, num_predict: agent.maxTokens } },
          );
          if (!response.ok || !response.stream) throw new Error(response.error?.message || "Falha no Ollama");
          const reader = response.stream;
          const decoder = response.decoder;
          let buffer = "";
          const applyLine = (line) => {
            const text = line.trim();
            if (!text) return;
            try {
              const json = JSON.parse(text);
              const piece = json.message?.content || "";
              if (!piece) return;
              full += piece;
              setMessages((items) =>
                items.map((message) =>
                  message.id === id ? { ...message, text: full } : message,
                ),
              );
            } catch {}
          };
          const drainBuffer = (flush) => {
            const lines = buffer.split("\n");
            buffer = flush ? "" : (lines.pop() ?? "");
            for (const line of lines) applyLine(line);
          };
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            drainBuffer(false);
          }
          buffer += decoder.decode();
          drainBuffer(true);
          setMessages((items) =>
            items.map((message) =>
              message.id === id
                ? { ...message, streaming: false, text: full || "[sem resposta]" }
                : message,
            ),
          );
          const visual = extractPreviewContent(full);
          if (visual) setPreviewContent(visual);
        } catch (error) {
          const aborted = error.name === "AbortError";
          setMessages((items) =>
            items.map((message) =>
              message.id === id
                ? {
                    ...message,
                    streaming: false,
                    interrupted: aborted,
                    text: aborted
                      ? full.trim()
                        ? full
                        : "[interrompido]"
                      : `Erro Ollama: ${error.message}`,
                  }
                : message,
            ),
          );
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
          setIsStreaming(false);
          streamingRef.current = false;
        }
      }
    } else {
      // Fallback: AgentCore not initialized
        const fsResult = await handleFilesystemCommand(content);
        if (fsResult) {
          setMessages((items) => [
            ...items,
            {
              id: uid("fs"),
              from: "them",
              model: "FILESYSTEM • LOCAL",
              text: fsResult,
              time: timeNow(),
            },
          ]);
          const visual = extractPreviewContent(fsResult);
          if (visual) setPreviewContent(visual);
          streamingRef.current = false;
          return;
        }

        if (ollama.status !== "OLLAMA ONLINE" || !ollama.active) {
          const offlineText = `${ollama.status}\n\nContexto montado: ${contextMemories.length} memórias + ${activeSkills.length} skills.`;
          setMessages((items) => [
            ...items,
            {
              id: uid("offline"),
              from: "them",
              model: agent.name,
              text: offlineText,
              context: { memories: contextMemories, skills: activeSkills },
              time: timeNow(),
            },
          ]);
          const offlineVisual = extractPreviewContent(offlineText);
          if (offlineVisual) setPreviewContent(offlineVisual);
          window.setTimeout(() => {
            if (streamingRef.current) streamingRef.current = false;
          }, 300);
          return;
        }
        const id = uid("assistant");
        setMessages((items) => [
          ...items,
          {
            id,
            from: "them",
            model: `${ollama.active} • ${agent.name}`,
            text: "",
            streaming: true,
            time: timeNow(),
            context: { memories: contextMemories, skills: activeSkills },
          },
        ]);
        setIsStreaming(true);
        const controller = new AbortController();
        abortRef.current = controller;
        let full = "";
        try {
          const response = await ollamaClientRef.current.chat(
            [
              { role: "system", content: context },
              ...messages
                .filter((message) => message.from === "me" || message.from === "them")
                .slice(-10)
                .map((message) => ({
                  role: message.from === "me" ? "user" : "assistant",
                  content: message.from === "me" ? `${message.text}${fileContext(message.files)}` : message.text,
                })),
              { role: "user", content: `${userText}${attachmentContext}` },
            ],
            { model: ollama.active, stream: true, options: { temperature: agent.temperature, top_p: agent.topP, num_predict: agent.maxTokens } },
          );
          if (!response.ok || !response.stream) throw new Error(response.error?.message || "Falha no Ollama");
          const reader = response.stream;
          const decoder = response.decoder;
          let buffer = "";
          const applyLine = (line) => {
            const text = line.trim();
            if (!text) return;
            try {
              const json = JSON.parse(text);
              const piece = json.message?.content || "";
              if (!piece) return;
              full += piece;
              setMessages((items) =>
                items.map((message) =>
                  message.id === id ? { ...message, text: full } : message,
                ),
              );
            } catch {}
          };
          const drainBuffer = (flush) => {
            const lines = buffer.split("\n");
            buffer = flush ? "" : (lines.pop() ?? "");
            for (const line of lines) applyLine(line);
          };
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            drainBuffer(false);
          }
          buffer += decoder.decode();
          drainBuffer(true);
          setMessages((items) =>
            items.map((message) =>
              message.id === id
                ? { ...message, streaming: false, text: full || "[sem resposta]" }
                : message,
            ),
          );
          const visual = extractPreviewContent(full);
          if (visual) setPreviewContent(visual);
        } catch (error) {
          const aborted = error.name === "AbortError";
          setMessages((items) =>
            items.map((message) =>
              message.id === id
                ? {
                    ...message,
                    streaming: false,
                    interrupted: aborted,
                    text: aborted
                      ? full.trim()
                        ? full
                        : "[interrompido]"
                      : `Erro Ollama: ${error.message}`,
                  }
                : message,
            ),
          );
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
          setIsStreaming(false);
          streamingRef.current = false;
        }
      }
    }
  const stopGeneration = () => {
    // BUG-01: aborta somente a geracao atual; o finally dela encerra o estado.
    abortRef.current?.abort();
    agentCoreRef.current?.abort();
    ollamaClientRef.current?.abort();
  };

  const saveMemory = () => {
    if (!memTitle.trim() || !memContent.trim()) return notify('Titulo e conteudo obrigatorios');
    setMemories((value) => [
      {
        id: uid('mem'),
        title: memTitle.trim(),
        content: memContent.trim(),
        createdAt: new Date().toISOString(),
      },
      ...value,
    ]);
    setMemTitle('');
    setMemContent('');
    notify('Memoria salva');
  };
  const createSkill = () => {
    if (!newSkill.name.trim() || !newSkill.prompt.trim()) {
      notify('Nome e prompt obrigatorios');
      return;
    }
    setSkills((value) => [
      {
        id: uid('skill'),
        ...newSkill,
        name: newSkill.name.trim(),
        desc: newSkill.desc.trim(),
        prompt: newSkill.prompt.trim(),
        builtin: false,
      },
      ...value,
    ]);
    setNewSkill({ icon: '✨', name: '', desc: '', prompt: '', enabled: true });
    setShowNewSkill(false);
    notify('Skill criada');
  };
  const selectModel = (model) => {
    if (model && ollama.models.some((item) => item.name === model))
      setOllama((value) => ({ ...value, active: model }));
  };
  const stopModel = async (model) => {
    const result = ollamaClientRef.current && ollama.endpoint
      ? await ollamaClientRef.current.stopModel(model)
      : { ok: false };
    const stopped = result.ok;
    if (!stopped) {
      // BUG-12: não anunciar sucesso quando a operação falhou.
      notify(`Não foi possível parar ${model}`);
      return;
    }
    setOllama((value) => ({
      ...value,
      // BUG-11: invalida a assinatura para o próximo diagnóstico atualizar o estado.
      signature: undefined,
      active: value.active === model ? "" : value.active,
      running: value.running.filter(
        (item) => (item.name || item.model) !== model,
      ),
    }));
    notify(`Modelo parado: ${model}`);
  };

  const preview = (
    <aside
      className={`preview-panel min-w-0 ${
        previewMinimized ? "minimized" : ""
      }`}
      style={
        isMobile
          ? { height: previewMinimized ? "40px" : `${100 - splitPct}%` }
          : { width: previewMinimized ? "44px" : `${100 - splitPct}%` }
      }
    >
      {previewMinimized ? (
        <button
          type="button"
          aria-label="Restaurar Preview"
          title="Restaurar Preview"
          onClick={() => setPreviewMinimized(false)}
          className="preview-minimized-button"
        >
          {isMobile ? "⌃" : "◀"}
        </button>
      ) : (
        <>
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <b>👁️ Preview</b>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Minimizar Preview"
                title="Minimizar Preview"
                onClick={() => setPreviewMinimized(true)}
                className="icon-button"
              >
                {isMobile ? "⌄" : "▶"}
              </button>
              <button
                type="button"
                aria-label="Limpar resultado do preview"
                title="Limpar resultado"
                onClick={() => setPreviewContent("")}
                disabled={!previewContent}
                className="icon-button"
              >
                🗑
              </button>
            </div>
          </div>
          <RenderResult content={previewContent} />
        </>
      )}
    </aside>
  );

  const config = (
    <main className="flex-1 overflow-auto bg-[#121212] p-4 lg:p-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">⚙️ Configurações</h1>
            <p className="mt-2 font-mono text-[11px] text-[#888]">
              Memória manual + Skills + Agente · localStorage
            </p>
          </div>
          <button onClick={() => navigate("#chat")} className="button-primary">
            ← Voltar ao Chat
          </button>
        </div>
        <nav className="my-5 flex gap-1 rounded-full bg-[#1E1E1E] p-1">
          {[
            ["memoria", "Memória Manual"],
            ["skills", "Skills"],
            ["agente", "Agente"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => navigate(`#config/${tab}`)}
              className={`rounded-full px-4 py-2 font-mono text-[11px] ${activeTab === tab ? "bg-white text-black" : "text-[#999]"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {activeTab === "memoria" && (
          <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
            <section className="panel space-y-3">
              <p className="label">🧠 Nova memória</p>
              <input
                value={memTitle}
                onChange={(event) => setMemTitle(event.target.value)}
                placeholder="Título"
                aria-label="Título da memória"
                className="field"
              />
              <textarea
                value={memContent}
                onChange={(event) => setMemContent(event.target.value)}
                placeholder="Conteúdo da memória..."
                aria-label="Conteúdo da memória"
                className="field min-h-32"
              />
              <button onClick={saveMemory} className="button-primary w-full">
                Salvar memória
              </button>
              <p className="label">Preview do contexto</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-[10px] text-[#999]">
                {context}
              </pre>
            </section>
            <div className="space-y-3">
              {memories.map((memory) => (
                <section
                  key={memory.id}
                  className={`panel ${memory.pinned ? "border-amber-400/30 bg-amber-500/10" : ""}`}
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <b>
                        {memory.pinned ? "📌" : "🧠"} {memory.title}
                      </b>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#aaa]">
                        {memory.content}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={
                          memory.pinned ? "Desafixar memória" : "Fixar memória"
                        }
                        aria-pressed={Boolean(memory.pinned)}
                        onClick={() =>
                          setMemories((items) =>
                            items.map((item) =>
                              item.id === memory.id
                                ? { ...item, pinned: !item.pinned }
                                : item,
                            ),
                          )
                        }
                        className="icon-button"
                      >
                        {memory.pinned ? "📌" : "📍"}
                      </button>
                      <button
                        type="button"
                        aria-label="Excluir memória"
                        onClick={() =>
                          setMemories((items) =>
                            items.filter((item) => item.id !== memory.id),
                          )
                        }
                        className="icon-button"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        {activeTab === "skills" && (
          <div>
            <div className="mb-4 flex justify-between">
              <span className="label">
                {activeSkills.length} ativas / {skills.length} total
              </span>
              <button
                onClick={() => setShowNewSkill(true)}
                className="button-primary"
              >
                ＋ Nova skill
              </button>
            </div>
            {showNewSkill && (
              <section className="panel mb-4 grid gap-3">
                <input
                  value={newSkill.name}
                  onChange={(event) =>
                    setNewSkill({ ...newSkill, name: event.target.value })
                  }
                  placeholder="Nome"
                  aria-label="Nome da skill"
                  className="field"
                />
                <input
                  value={newSkill.icon}
                  onChange={(event) =>
                    setNewSkill({ ...newSkill, icon: event.target.value })
                  }
                  placeholder="Ícone"
                  aria-label="Ícone da skill"
                  className="field"
                />
                <input
                  value={newSkill.desc}
                  onChange={(event) =>
                    setNewSkill({ ...newSkill, desc: event.target.value })
                  }
                  placeholder="Descrição"
                  aria-label="Descrição da skill"
                  className="field"
                />
                <textarea
                  value={newSkill.prompt}
                  onChange={(event) =>
                    setNewSkill({ ...newSkill, prompt: event.target.value })
                  }
                  placeholder="Prompt"
                  aria-label="Prompt da skill"
                  className="field min-h-28"
                />
                <div>
                  <button onClick={createSkill} className="button-primary">
                    Criar
                  </button>
                  <button
                    onClick={() => setShowNewSkill(false)}
                    className="button-secondary ml-2"
                  >
                    Cancelar
                  </button>
                </div>
              </section>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {skills.map((skill) => (
                <section
                  key={skill.id}
                  className={`panel ${!skill.enabled ? "opacity-60" : ""}`}
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <b>
                        {skill.icon} {skill.name}
                      </b>
                      <p className="mt-1 text-xs text-[#999]">{skill.desc}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={
                        skill.enabled
                          ? `Desativar skill ${skill.name}`
                          : `Ativar skill ${skill.name}`
                      }
                      aria-pressed={Boolean(skill.enabled)}
                      onClick={() =>
                        setSkills((items) =>
                          items.map((item) =>
                            item.id === skill.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                      className="icon-button"
                    >
                      {skill.enabled ? "●" : "○"}
                    </button>
                  </div>
                  <p className="mt-3 font-mono text-[10px] text-[#8a8a8a]">
                    {skill.prompt}
                  </p>
                  {!skill.builtin && (
                    <button
                      onClick={() =>
                        setSkills((items) =>
                          items.filter((item) => item.id !== skill.id),
                        )
                      }
                      className="mt-3 text-xs text-red-300"
                    >
                      Remover
                    </button>
                  )}
                </section>
              ))}
            </div>
          </div>
        )}
        {activeTab === "agente" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel space-y-4">
              <p className="label">Configuração do agente</p>
              <input
                value={agent.name}
                onChange={(event) =>
                  setAgent({ ...agent, name: event.target.value })
                }
                aria-label="Nome do agente"
                className="field"
              />
              <textarea
                value={agent.systemPrompt}
                onChange={(event) =>
                  setAgent({ ...agent, systemPrompt: event.target.value })
                }
                aria-label="Prompt de sistema do agente"
                className="field min-h-40"
              />
              <label className="label">
                Temperature {agent.temperature}
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={agent.temperature}
                  onChange={(event) =>
                    setAgent({
                      ...agent,
                      temperature: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full"
                />
              </label>
              <label className="label">
                Top P {agent.topP}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={agent.topP}
                  onChange={(event) =>
                    setAgent({ ...agent, topP: Number(event.target.value) })
                  }
                  className="mt-2 w-full"
                />
              </label>
              <label className="label">
                Max Tokens {agent.maxTokens}
                <input
                  type="range"
                  min="256"
                  max="4096"
                  step="128"
                  value={agent.maxTokens}
                  onChange={(event) =>
                    setAgent({
                      ...agent,
                      maxTokens: Number(event.target.value),
                    })
                  }
                  className="mt-2 w-full"
                />
              </label>
            </section>
            <section className="panel">
              <p className="label">Preview do contexto</p>
              <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-[10px] text-[#999]">
                {context}
              </pre>
              <p className="label mt-5">Endpoint Ollama</p>
              <input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                aria-invalid={!parseEndpoint(endpoint)}
                aria-label="Endpoint do Ollama"
                className="field mt-2"
              />
              {!parseEndpoint(endpoint) && (
                <p className="mt-2 border-l-2 border-white/20 pl-2 font-mono text-[10px] text-[#EDEDED]">
                  Endpoint inválido. Aceitos: http://127.0.0.1:11434 e
                  http://localhost:11434 (a política de segurança do app
                  bloqueia outros hosts).
                </p>
              )}
              <button
                type="button"
                aria-label="Retestar conexão com o Ollama"
                onClick={detectOllama}
                className="button-secondary mt-3"
              >
                RETESTAR · <Status status={ollama.status} />
              </button>
              {ollama.status === "OLLAMA INSTALADO — OFFLINE" && (
                <button
                  type="button"
                  aria-label="Iniciar Ollama"
                  onClick={startOllama}
                  className="button-secondary ml-2 mt-3"
                >
                  INICIAR OLLAMA
                </button>
              )}
              {ollama.active && (
                <div className="mt-5">
                  <p className="label">Modelo em execução</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 font-mono text-xs">
                      {ollama.active}
                    </span>
                    <button
                      type="button"
                      aria-label={`Parar modelo ${ollama.active}`}
                      onClick={() => stopModel(ollama.active)}
                      className="button-secondary"
                    >
                      ⏹ Parar
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}


createRoot(document.getElementById("root")).render(<App />);
