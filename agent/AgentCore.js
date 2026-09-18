/**
 * AgentCore - Orquestrador principal do agente
 * Fluxo: Intent → Plan → Tool Calls → Observations → Model → Validation → Final Answer
 * Loop controlado com limite de passos
 */
import { createContextManager, MEMORY_TYPES } from './ContextManager.js';
import { AgentWatchdog } from './AgentWatchdog.js';

export const AGENT_MODES = {
  CHAT: 'chat',
  ANALYZE: 'analyze',
  CODE: 'code',
  FILESYSTEM: 'filesystem',
  RESEARCH: 'research',
  PLAN: 'plan',
  EXECUTION: 'execution',
  SUMMARY: 'summary',
  AUTO: 'auto'
};

export const AGENT_STEP_TYPES = {
  THINK: 'think',
  PLAN: 'plan',
  TOOL: 'tool',
  OBSERVE: 'observe',
  DECIDE: 'decide',
  FINAL: 'final'
};

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_TOOL_CALLS = 12;
const DEFAULT_MAX_CONSECUTIVE_SAME_TOOL = 3;
const DEFAULT_STEP_TIMEOUT = 60000;

export class AgentCore {
  constructor(ollamaClient, modelRouter, toolRegistry, contextManager, options = {}) {
    this.client = ollamaClient;
    this.router = modelRouter;
    this.tools = toolRegistry;
    this.context = contextManager;
    this.maxSteps = Math.min(DEFAULT_MAX_STEPS, Math.max(1, Math.floor(options.maxSteps || DEFAULT_MAX_STEPS)));
    this.maxToolCalls = Math.min(DEFAULT_MAX_TOOL_CALLS, Math.max(1, Math.floor(options.maxToolCalls || DEFAULT_MAX_TOOL_CALLS)));
    this.maxRetries = Math.min(2, Math.max(0, Math.floor(options.maxRetries ?? 2)));
    this.maxConsecutiveSameTool = Math.min(DEFAULT_MAX_CONSECUTIVE_SAME_TOOL, Math.max(1, Math.floor(options.maxConsecutiveSameTool || DEFAULT_MAX_CONSECUTIVE_SAME_TOOL)));
    this.stepTimeout = options.stepTimeout || DEFAULT_STEP_TIMEOUT;
    this.currentMode = options.mode || AGENT_MODES.AUTO;
    this.isRunning = false;
    this.isCancelled = false;
    this.currentStep = 0;
    this.plan = [];
    this.stepHistory = [];
    this.toolCallsCount = 0;
    this.lastToolName = null;
    this.consecutiveSameToolCount = 0;
    this.stateSignatures = new Set();
    this.watchdog = null;
    this.onStepCallback = null;
    this.onProgressCallback = null;
  }

  setMode(mode) {
    if (Object.values(AGENT_MODES).includes(mode)) {
      this.currentMode = mode;
    }
  }

  getMode() {
    return this.currentMode;
  }

  setMaxSteps(max) {
    this.maxSteps = Math.max(1, Math.floor(max));
  }

  setOnStepCallback(fn) {
    this.onStepCallback = fn;
  }

  setOnProgressCallback(fn) {
    this.onProgressCallback = fn;
  }

async process(userInput, options = {}) {
    // ETAPA 8: Controle global de execução - impedir execuções concorrentes
    if (this.isRunning) {
      return {
        ok: false,
        error: { code: 'EXECUTION_IN_PROGRESS', message: 'EXECUÇÃO JÁ EM ANDAMENTO' }
      };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.abortController = new AbortController();
    this.currentStep = 0;
    this.plan = [];
    this.stepHistory = [];
    this.toolCallsCount = 0;
    this.lastToolName = null;
    this.consecutiveSameToolCount = 0;
    this.stateSignatures = new Set();

    // Adicionar mensagem do usuário ao contexto
    this.context.addShortMessage({ from: 'me', text: userInput, time: Date.now() });

    // ETAPA 7: Iniciar watchdog
    if (!this.watchdog) {
      const { AgentWatchdog } = await import('./AgentWatchdog.js');
      this.watchdog = new (await import('./AgentWatchdog.js')).AgentWatchdog(this, {
        maxStepsWithoutProgress: 5,
        checkIntervalMs: 5000
      });
    }
    this.watchdog.start();

    try {
      let finalResponse = null;

      if (this.currentMode === AGENT_MODES.AUTO) {
        finalResponse = await this.runAutoMode(userInput, options);
      } else {
        finalResponse = await this.runDirectedMode(userInput, options);
      }

      // Adicionar resposta final ao contexto
      if (finalResponse) {
        this.context.addShortMessage({ from: 'them', text: finalResponse, time: Date.now() });
      }

      return {
        ok: true,
        response: finalResponse,
        mode: this.currentMode,
        steps: this.currentStep,
        plan: this.plan,
        history: this.stepHistory
      };
    } catch (error) {
      return {
        ok: false,
        error: { code: error.code || 'ERR', message: error.message || String(error) },
        steps: this.currentStep,
        plan: this.plan
      };
    } finally {
      // Parar watchdog
      if (this.watchdog) {
        this.watchdog.stop();
      }
      this.abortController = null;
      this.isRunning = false;
    }
  }

  async runAutoMode(userInput, options) {
    // 1. Classificar intenção
    const intent = await this.classifyIntent(userInput);
    this.emitProgress('intent', { intent });

    // 2. Se intenção simples (chat), responder diretamente
    if (intent.type === 'chat' && !intent.needsTools) {
      return this.generateDirectResponse(userInput, intent);
    }

    // 3. Criar plano
    this.plan = await this.createPlan(userInput, intent);
    this.emitProgress('plan', { plan: this.plan });

    // 4. Executar loop de passos
    return this.executePlan(userInput, intent, options);
  }

  async runDirectedMode(userInput, options) {
    // Modo direto: usuário pediu explicitamente uma ferramenta
    const intent = { type: 'directed', originalInput: userInput, needsTools: true };
    this.plan = [{ step: 1, action: 'execute_directed', description: userInput }];
    return this.executePlan(userInput, intent, options);
  }

  async classifyIntent(input) {
    const lower = input.toLowerCase().trim();

    // Palavras-chave por tipo de intenção
    const patterns = {
      filesystem: [
        /^(liste|lista|arquivos?|pastas?)\s+/,
        /^(analise|analisar|inspecione|inspecionar)\s+/,
        /^(ache|busque|procure)\s+/,
        /^(descubra|projetos)\s+/,
        /^(quanto pesa|peso|hash)\s+/,
        /^(unidades|drives|discos)/
      ],
      analyze: [
        /^(analise|analisar)\s+(?:o\s+)?(?:projeto|codigo|código)/,
        /^(revise|revise)\s+/
      ],
      code: [
        /^(corrija|corrigir|arregle)\s+(?:o\s+)?(?:codigo|código|bug)/,
        /^(escreva|escrever|crie|criar)\s+(?:o\s+)?(?:codigo|código|função|componente)/
      ],
      research: [
        /^(pesquise|pesquisar|procure\s+sobre)\s+/,
        /^o que (?:é|são)\s+/
      ],
      cancel: [
        /^cancele?\s+(?:a\s+)?(?:busca|buscar|pesquisa|operaçao)/
      ]
    };

    for (const [type, regexes] of Object.entries(patterns)) {
      if (regexes.some(r => r.test(lower))) {
        return {
          type,
          needsTools: type !== 'chat',
          originalInput: lower,
          matched: true
        };
      }
    }

    // Default: chat
    return { type: 'chat', needsTools: false, originalInput: lower, matched: false };
  }

  async createPlan(userInput, intent) {
    const plan = [];
    const stepDescriptions = this.getPlanSteps(intent.type, userInput);

    stepDescriptions.forEach((desc, i) => {
      plan.push({
        step: i + 1,
        action: desc.action,
        description: desc.desc,
        tool: desc.tool,
        status: 'pending'
      });
    });

    return plan;
  }

  getPlanSteps(intentType, userInput) {
    const base = { action: 'think', desc: 'Analisando a solicitação...' };

    switch (intentType) {
      case 'filesystem':
        if (/^(liste|lista|arquivos?|pastas?)\s+/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Listando diretório...', tool: 'filesystem.list' },
            { action: 'observe', desc: 'Processando resultado...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        if (/^(analise|analisar|inspecione)\s+/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Inspecionando caminho...', tool: 'filesystem.inspect' },
            { action: 'observe', desc: 'Processando resultado...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        if (/^(ache|busque|procure)\s+/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Buscando arquivos...', tool: 'filesystem.search' },
            { action: 'observe', desc: 'Processando resultados...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        if (/^(descubra|projetos)\s+/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Descobrindo projetos...', tool: 'filesystem.discover' },
            { action: 'observe', desc: 'Processando resultados...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        if (/^(quanto pesa|peso|hash)\s+/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Calculando hash...', tool: 'filesystem.hash' },
            { action: 'observe', desc: 'Processando resultado...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        if (/^(unidades|drives|discos)/.test(userInput.toLowerCase())) {
          return [
            { action: 'tool', desc: 'Listando unidades...', tool: 'filesystem.drives' },
            { action: 'observe', desc: 'Processando resultado...' },
            { action: 'final', desc: 'Formatando resposta...' }
          ];
        }
        return [base, { action: 'final', desc: 'Respondendo...' }];

      case 'analyze':
        return [
          base,
          { action: 'tool', desc: 'Descobrindo projeto...', tool: 'filesystem.discover' },
          { action: 'tool', desc: 'Inspecionando estrutura...', tool: 'filesystem.list' },
          { action: 'observe', desc: 'Analisando resultados...' },
          { action: 'final', desc: 'Gerando análise...' }
        ];

      case 'code':
        return [
          base,
          { action: 'tool', desc: 'Inspecionando arquivos...', tool: 'filesystem.inspect' },
          { action: 'tool', desc: 'Lendo código relevante...', tool: 'filesystem.list' },
          { action: 'observe', desc: 'Analisando código...' },
          { action: 'final', desc: 'Gerando sugestões...' }
        ];

      case 'research':
        return [
          base,
          { action: 'tool', desc: 'Buscando informações...', tool: 'filesystem.search' },
          { action: 'observe', desc: 'Processando...' },
          { action: 'final', desc: 'Sintetizando resposta...' }
        ];

      case 'cancel':
        return [
          { action: 'tool', desc: 'Cancelando operações...', tool: 'filesystem.cancel' },
          { action: 'final', desc: 'Confirmando cancelamento...' }
        ];

      default:
        return [base, { action: 'final', desc: 'Gerando resposta...' }];
    }
  }

  async executePlan(userInput, intent, options) {
    this.currentStep = 0;
    this.toolCallsCount = 0;
    this.lastToolName = null;
    this.consecutiveSameToolCount = 0;
    this.stateSignatures = new Set();

    while (this.currentStep < this.maxSteps) {
      if (this.isCancelled || this.abortController?.signal?.aborted) {
        return 'Operação cancelada pelo usuário.';
      }

      this.currentStep++;
      const currentPlanItem = this.plan[this.currentStep - 1] || { action: 'final', desc: 'Finalizando...' };

      this.emitStep('start', this.currentStep, currentPlanItem);

      let result;
      switch (currentPlanItem.action) {
        case 'think':
          result = await this.thinkStep(userInput, intent);
          break;
        case 'tool':
          // ETAPA 2: Limitar tool calls
          if (this.toolCallsCount >= this.maxToolCalls) {
            console.log('[AgentCore] maxToolCalls reached');
            return 'Limite de chamadas de ferramenta atingido. Execução interrompida por segurança.';
          }

          // ETAPA 3: Detectar mesma ferramenta repetida
          const currentToolName = currentPlanItem.tool;
          if (currentToolName === this.lastToolName) {
            this.consecutiveSameToolCount++;
            if (this.consecutiveSameToolCount >= this.maxConsecutiveSameTool) {
              console.log('[AgentCore] REPETIÇÃO CONSECUTIVA DE FERRAMENTA DETECTADA');
              return 'Repetição consecutiva da mesma ferramenta detectada. Execução interrompida por segurança.';
            }
          } else {
            this.consecutiveSameToolCount = 1;
            this.lastToolName = currentToolName;
          }

          result = await this.executeToolStep(currentPlanItem.tool, intent.originalInput);

          break;
        case 'observe':
          result = await this.observeStep();
          break;
        case 'final':
          result = await this.generateFinalResponse(userInput, intent);
          this.emitStep('complete', this.currentStep, currentPlanItem, result);
          return result;
        default:
          result = await this.generateFinalResponse(userInput, intent);
          this.emitStep('complete', this.currentStep, currentPlanItem, result);
          return result;
      }

      this.stepHistory.push({
        step: this.currentStep,
        action: currentPlanItem.action,
        tool: currentPlanItem.tool,
        result: result?.status,
        timestamp: Date.now()
      });

      this.emitStep('complete', this.currentStep, currentPlanItem, result);

      if (result?.status === 'error' && currentPlanItem.critical) {
        return `Erro crítico no passo ${this.currentStep}: ${result.error}`;
      }
    }

    return 'Limite de passos atingido. Resposta parcial gerada.';
  }

  async thinkStep(userInput, intent) {
    // Armazenar pensamento no working memory
    this.context.addWorkingItem({
      type: 'thought',
      data: { input: userInput, intent: intent.type, reasoning: `Identificada intenção: ${intent.type}` }
    });
    return { status: 'success', thought: `Intenção classificada como: ${intent.type}` };
  }

  async executeToolStep(toolName, input) {
    if (!toolName) return { status: 'error', error: 'Nenhuma ferramenta especificada' };
    if (this.toolCallsCount >= this.maxToolCalls) return { status: 'error', error: 'MAX_TOOL_CALLS_REACHED' };
    this.toolCallsCount++;

    // Extrair parâmetros do input (simplificado - em produção usar LLM para extrair params)
    const params = this.extractToolParams(toolName, input);

    const result = await this.tools.execute(toolName, params, { signal: this.abortController?.signal });

    const stateSignature = this.createStateSignature(toolName, input, result);
    if (this.stateSignatures.has(stateSignature)) {
      this.context.addWorkingItem({
        type: 'warning',
        data: { type: 'repeated_state', signature: stateSignature, step: this.currentStep }
      });
      return { status: 'error', error: 'REPEATED_STATE_DETECTED' };
    }
    this.stateSignatures.add(stateSignature);

    // Armazenar observação
    this.context.addWorkingItem({
      type: 'observation',
      data: { tool: toolName, params, result: result.status, facts: result.facts }
    });

    return result;
  }

  extractToolParams(toolName, input) {
    // Extração simples de parâmetros - em produção usar LLM
    const lower = input.toLowerCase();

    switch (toolName) {
      case 'filesystem.drives':
        return {};

      case 'filesystem.inspect':
      case 'filesystem.list':
      case 'filesystem.hash':
        // Extrair caminho após o comando
        const pathMatch = input.match(/(?:analise|inspecione|liste|hash|peso)\s+(.+)/i);
        return { path: pathMatch ? pathMatch[1].trim() : input.trim() };

      case 'filesystem.search':
        const searchMatch = input.match(/(?:ache|busque|procure)\s+(?:arquivo\s+|pasta\s+|diretorio\s+|diretório\s+)?(.+)/i);
        const name = searchMatch ? searchMatch[1].trim() : input.trim();
        const typeMatch = input.match(/^(?:ache|busque|procure)\s+(arquivo|pasta|diretorio|diretório)\s+/i);
        return {
          roots: ['C:\\', 'D:\\'],
          name,
          type: typeMatch ? (typeMatch[1] === 'arquivo' ? 'file' : 'dir') : 'file',
          maxResults: 20
        };

      case 'filesystem.discover':
        const discoverMatch = input.match(/(?:descubra|projetos)\s+(.+)/i);
        return {
          roots: discoverMatch ? [discoverMatch[1].trim()] : ['C:\\', 'D:\\'],
          maxResults: 10
        };

      case 'filesystem.cancel':
        return { cancelId: 'user-cancel' };

      default:
        return {};
    }
  }

  async observeStep() {
    // Processar observações recentes
    const working = this.context.getWorkingMemory();
    const recentObs = working
      .filter(m => m.content?.type === 'observation')
      .slice(-3);

    this.context.addWorkingItem({
      type: 'synthesis',
      data: { observations: recentObs.map(o => o.content), synthesized: true }
    });

    return { status: 'success', synthesized: recentObs.length };
  }

  async generateFinalResponse(userInput, intent) {
    // Construir contexto para LLM
    const contextData = this.context.buildContextForLLM();
    const messages = contextData.messages;

    // Adicionar prompt final
    messages.push({
      role: 'user',
      content: `Responda ao usuário de forma clara e objetiva baseada APENAS nas observações e fatos acima.

Pergunta original: ${userInput}
Intenção: ${intent.type}

REGRAS:
- Use APENAS fatos das observações (FACT)
- Marque inferências como (INFERENCE)
- Se não há dado: "NÃO FOI POSSÍVEL CONFIRMAR"
- Nunca invente caminhos, arquivos ou unidades
- Responda no idioma do usuário`
    });

    // Selecionar modelo
    const model = this.router.selectModelForTask(intent.type === 'code' ? 'code' : intent.type === 'analyze' ? 'reasoning' : 'general');

    // Chamar Ollama (non-stream para resposta final limpa)
    const result = await this.client.chatNonStream(messages, { model });

    if (!result.ok) {
      return `Erro ao gerar resposta: ${result.error?.message || 'Falha no modelo'}`;
    }

    const response = result.data?.message?.content || result.data?.response || '';
    return response.trim() || 'Resposta vazia do modelo.';
  }

  async generateDirectResponse(userInput, intent) {
    const contextData = this.context.buildContextForLLM(4000);
    const messages = contextData.messages;

    messages.push({
      role: 'user',
      content: userInput
    });

    const model = this.router.getModelForRole('fast') || this.router.getSelectedModel();
    const result = await this.client.chatNonStream(messages, { model });

    if (!result.ok) return `Erro: ${result.error?.message || 'Falha no modelo'}`;
    return (result.data?.message?.content || result.data?.response || '').trim();
  }

  emitStep(event, step, planItem, result) {
    if (this.onStepCallback) {
      this.onStepCallback({ event, step, planItem, result, timestamp: Date.now() });
    }
  }

  emitProgress(phase, data) {
    if (this.onProgressCallback) {
      this.onProgressCallback({ phase, data, timestamp: Date.now() });
    }
  }

  abort() {
    this.isCancelled = true;
    this.abortController?.abort();
    this.client.abort();

    // Parar watchdog
    if (this.watchdog) {
      this.watchdog.stop();
    }

    return true;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.currentMode,
      currentStep: this.currentStep,
      maxSteps: this.maxSteps,
      plan: this.plan,
      historyLength: this.stepHistory.length
    };
  }

  reset() {
    this.isRunning = false;
    this.isCancelled = false;
    this.currentStep = 0;
    this.plan = [];
    this.stepHistory = [];
    this.toolCallsCount = 0;
    this.lastToolName = null;
    this.consecutiveSameToolCount = 0;
    this.stateSignatures = new Set();
    this.context.clearWorkingMemory();
    this.abortController = null;

    // Parar watchdog se estiver ativo
    if (this.watchdog) {
      this.watchdog.stop();
      this.watchdog = null;
    }
  }

  /**
   * Cria uma assinatura determinística do estado baseada em:
   * - nome da ferramenta
   * - argumentos normalizados
   * - observação/resultados relevantes
   */
  createStateSignature(toolName, input, result) {
    // Normalizar argumentos
    const normalizedArgs = this.extractToolParams(toolName, input || '');
    const argsStr = JSON.stringify(normalizedArgs);

    // Extrair observação relevante do resultado
    const obsStr = result?.facts ? JSON.stringify(result.facts) :
                   result?.data ? JSON.stringify(result.data) :
                   result?.status ? result.status : '';

    // Criar assinatura determinística
    const signature = `${toolName}|${argsStr}|${obsStr}`;

    // Hash simples para evitar strings muito longas
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
      const char = signature.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `${toolName}|${Math.abs(hash)}|${argsStr.length}|${obsStr.length}`;
  }

}

export const createAgentCore = (ollamaClient, modelRouter, toolRegistry, contextManager, options) =>
  new AgentCore(ollamaClient, modelRouter, toolRegistry, contextManager, options);