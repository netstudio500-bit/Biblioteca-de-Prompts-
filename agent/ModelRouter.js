/**
 * ModelRouter - Roteamento de modelos Ollama
 * Descobre modelos via /api/tags, permite configuração manual
 * Não assume nomes de modelos fixos.
 */
export class ModelRouter {
  constructor(ollamaClient) {
    this.client = ollamaClient;
    this.modelsCache = null;
    this.cacheTime = 0;
    this.cacheTtl = 30000; // 30s
    this.selectedModel = null;
    this.modelRoles = {
      fast: null,       // modelo rápido para tarefas simples
      reasoning: null,  // modelo de raciocínio complexo
      code: null,       // modelo especializado em código
      general: null     // modelo geral (default)
    };
  }

  async refreshModels() {
    const result = await this.client.listModels();
    if (result.ok) {
      this.modelsCache = result.models;
      this.cacheTime = Date.now();
      this.autoAssignRoles();
      return { ok: true, models: this.modelsCache };
    }
    return result;
  }

  async getModels(forceRefresh = false) {
    if (!this.modelsCache || forceRefresh || Date.now() - this.cacheTime > this.cacheTtl) {
      return this.refreshModels();
    }
    return { ok: true, models: this.modelsCache };
  }

  autoAssignRoles() {
    if (!this.modelsCache?.length) return;

    const names = this.modelsCache.map(m => m.name.toLowerCase());

    // Heurísticas simples para atribuição de papéis
    const codeModels = names.filter(n => /code|codellama|starcoder|wizardcoder|phind|deepseek-coder/.test(n));
    const reasoningModels = names.filter(n => /reason|r1|qwen|phi-3|nemotron|mistral|llama-3|gemma-2|command-r/.test(n));
    const fastModels = names.filter(n => /small|mini|tiny|1b|3b|7b/.test(n) && !/code/.test(n));

    this.modelRoles.code = codeModels[0] || this.modelRoles.code || this.modelsCache[0]?.name || null;
    this.modelRoles.reasoning = reasoningModels[0] || this.modelRoles.reasoning || this.modelsCache[0]?.name || null;
    this.modelRoles.fast = fastModels[0] || this.modelRoles.fast || this.modelsCache[0]?.name || null;
    this.modelRoles.general = this.modelRoles.general || this.modelsCache[0]?.name || null;
  }

  setModelForRole(role, modelName) {
    if (role in this.modelRoles) {
      this.modelRoles[role] = modelName;
    }
  }

  getModelForRole(role) {
    return this.modelRoles[role] || this.modelRoles.general;
  }

  getSelectedModel() {
    return this.selectedModel;
  }

  setSelectedModel(modelName) {
    this.selectedModel = modelName;
  }

  getAvailableModels() {
    return this.modelsCache ? this.modelsCache.map(m => ({ name: m.name, size: m.size, modified: m.modified_at })) : [];
  }

  getRoles() {
    return { ...this.modelRoles };
  }

  // Escolhe o melhor modelo baseado no tipo de tarefa
  selectModelForTask(taskType) {
    switch (taskType) {
      case 'code': return this.getModelForRole('code');
      case 'reasoning':
      case 'analyze':
      case 'plan': return this.getModelForRole('reasoning');
      case 'fast':
      case 'chat': return this.getModelForRole('fast');
      default: return this.selectedModel || this.getModelForRole('general');
    }
  }

  // Configuração manual de modelo
  setManualModel(modelName) {
    this.selectedModel = modelName;
  }
}

export const createModelRouter = (ollamaClient) => new ModelRouter(ollamaClient);