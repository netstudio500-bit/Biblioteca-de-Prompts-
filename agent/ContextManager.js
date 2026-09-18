/**
 * ContextManager - Gerenciamento de memória em 3 níveis
 * SHORT: últimas N mensagens
 * WORKING: contexto da tarefa atual (projeto, arquivos, decisões)
 * LONG: memórias persistidas pelo usuário
 * ContextBudget: controle de tokens
 */
export const MEMORY_TYPES = {
  SHORT: 'short',
  WORKING: 'working',
  LONG: 'long'
};

const DEFAULT_LIMITS = {
  shortMessages: 20,
  workingItems: 50,
  longMemories: 100,
  maxContextTokens: 8000,
  summaryTriggerRatio: 0.7
};

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function createMemoryItem(content, type, metadata = {}) {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    metadata: { createdAt: Date.now(), ...metadata },
    tokens: estimateTokens(JSON.stringify(content))
  };
}

export class ContextManager {
  constructor(options = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.shortMemory = [];
    this.workingMemory = [];
    this.longMemory = [];
    this.contextSummary = '';
    this.projectContext = null;
    this.systemPrompt = '';
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  addShortMessage(message) {
    this.shortMemory.push(createMemoryItem(message, MEMORY_TYPES.SHORT));
    this.pruneShortMemory();
  }

  getShortMemory(limit) {
    return this.shortMemory.slice(-(limit || this.limits.shortMessages));
  }

  pruneShortMemory() {
    if (this.shortMemory.length > this.limits.shortMessages) {
      this.shortMemory = this.shortMemory.slice(-this.limits.shortMessages);
    }
  }

  setProjectContext(context) {
    this.projectContext = { ...context, updatedAt: Date.now() };
    this.addWorkingItem({ type: 'project_context', data: context });
  }

  getProjectContext() {
    return this.projectContext;
  }

  addWorkingItem(item) {
    this.workingMemory.push(createMemoryItem(item, MEMORY_TYPES.WORKING));
    this.pruneWorkingMemory();
  }

  getWorkingMemory() {
    return this.workingMemory;
  }

  pruneWorkingMemory() {
    if (this.workingMemory.length > this.limits.workingItems) {
      this.workingMemory = this.workingMemory.slice(-this.limits.workingItems);
    }
  }

  clearWorkingMemory() {
    this.workingMemory = [];
    this.projectContext = null;
  }

  addLongMemory(content, metadata = {}) {
    const item = createMemoryItem(content, MEMORY_TYPES.LONG, metadata);
    this.longMemory.push(item);
    this.pruneLongMemory();
    return item.id;
  }

  getLongMemories(query = null, limit = 10) {
    let memories = this.longMemory;
    if (query) {
      const q = query.toLowerCase();
      memories = memories.filter(m =>
        JSON.stringify(m.content).toLowerCase().includes(q) ||
        JSON.stringify(m.metadata).toLowerCase().includes(q)
      );
    }
    return memories.slice(-limit);
  }

  pruneLongMemory() {
    if (this.longMemory.length > this.limits.longMemories) {
      this.longMemory = this.longMemory.slice(-this.limits.longMemories);
    }
  }

  removeLongMemory(id) {
    this.longMemory = this.longMemory.filter(m => m.id !== id);
  }

  estimateContextTokens() {
    let total = 0;
    total += this.systemPrompt ? Math.ceil((this.systemPrompt || '').length / 4) : 0;
    total += this.contextSummary ? Math.ceil((this.contextSummary || '').length / 4) : 0;
    total += this.projectContext ? Math.ceil(JSON.stringify(this.projectContext).length / 4) : 0;
    total += this.workingMemory.reduce((sum, m) => sum + m.tokens, 0);
    total += this.shortMemory.reduce((sum, m) => sum + m.tokens, 0);
    return total;
  }

  getBudgetStatus() {
    const used = this.estimateContextTokens();
    const budget = this.limits.maxContextTokens;
    return {
      used,
      budget,
      available: Math.max(0, budget - used),
      ratio: used / budget,
      shouldSummarize: used / budget >= this.limits.summaryTriggerRatio
    };
  }

  async createContextSummary(summarizerFn) {
    if (!this.getBudgetStatus().shouldSummarize) return this.contextSummary;
    const contextData = {
      systemPrompt: this.systemPrompt,
      project: this.projectContext,
      working: this.workingMemory.slice(-20),
      recent: this.shortMemory.slice(-10)
    };
    try {
      const summary = await summarizerFn(contextData);
      this.contextSummary = summary;
      return summary;
    } catch {
      return this.contextSummary;
    }
  }

  getBudgetStatus() {
    const used = this.estimateContextTokens();
    const budget = this.limits.maxContextTokens;
    return {
      used,
      budget,
      available: Math.max(0, budget - used),
      ratio: used / budget,
      shouldSummarize: used / budget >= this.limits.summaryTriggerRatio
    };
  }

  getContextSummary() {
    return this.contextSummary;
  }

  buildContextForLLM(maxTokens = null) {
    const budget = maxTokens || this.limits.maxContextTokens;
    const parts = [];
    let used = 0;

    if (this.systemPrompt) {
      parts.push({ role: 'system', content: this.systemPrompt });
      used += Math.ceil(this.systemPrompt.length / 4);
    }

    if (this.contextSummary) {
      const summaryTokens = Math.ceil(this.contextSummary.length / 4);
      if (used + summaryTokens <= budget) {
        parts.push({ role: 'system', content: `CONTEXT SUMMARY:\n${this.contextSummary}` });
        used += summaryTokens;
      }
    }

    if (this.projectContext) {
      const projTokens = Math.ceil(JSON.stringify(this.projectContext).length / 4);
      if (used + projTokens <= budget) {
        parts.push({ role: 'system', content: `PROJECT CONTEXT:\n${JSON.stringify(this.projectContext, null, 2)}` });
        used += projTokens;
      }
    }

    for (let i = this.workingMemory.length - 1; i >= 0; i--) {
      const item = this.workingMemory[i];
      if (used + item.tokens > budget) break;
      parts.unshift({ role: 'system', content: `WORKING: ${JSON.stringify(item.content)}` });
      used += item.tokens;
    }

    for (let i = this.shortMemory.length - 1; i >= 0; i--) {
      const item = this.shortMemory[i];
      if (used + item.tokens > budget) break;
      const role = item.content?.from === 'me' ? 'user' : 'assistant';
      parts.push({ role, content: item.content?.text || '' });
      used += item.tokens;
    }

    return { messages: parts, tokensUsed: used };
  }

  toJSON() {
    return {
      shortMemory: this.shortMemory,
      workingMemory: this.workingMemory,
      longMemory: this.longMemory,
      contextSummary: this.contextSummary,
      projectContext: this.projectContext,
      systemPrompt: this.systemPrompt
    };
  }

  static fromJSON(data) {
    const cm = new ContextManager();
    if (data) {
      cm.shortMemory = data.shortMemory || [];
      cm.workingMemory = data.workingMemory || [];
      cm.longMemory = data.longMemory || [];
      cm.contextSummary = data.contextSummary || '';
      cm.projectContext = data.projectContext || null;
      cm.systemPrompt = data.systemPrompt || '';
    }
    return cm;
  }
}

export const createContextManager = (options) => new ContextManager(options);