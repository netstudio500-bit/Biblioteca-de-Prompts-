/**
 * ToolRegistry - Sistema genérico de ferramentas
 * Cada ferramenta: id, nome, descrição, schema, função, nível de segurança
 * Ferramentas filesystem usam botiaDesktop.filesystem (IPC real)
 */
import { toolSchemas } from './toolSchemas.js';

const SECURITY_LEVELS = {
  READ: 'read',       // leitura apenas
  ANALYZE: 'analyze', // análise/leitura profunda
  WRITE: 'write',     // escrita (futuro, com permissão)
  DANGEROUS: 'dangerous' // execução arbitrária (BLOQUEADO)
};

function createToolResult(status, data, metadata = {}) {
  return {
    status, // 'success' | 'partial' | 'not_found' | 'access_denied' | 'timeout' | 'cancelled' | 'error'
    data,
    metadata: { timestamp: Date.now(), ...metadata }
  };
}

function normalizeObservation(toolName, result) {
  return {
    tool: toolName,
    status: result.status,
    facts: result.data,
    errors: result.status === 'error' || result.status === 'partial' ? [result.metadata?.error].filter(Boolean) : [],
    timestamp: result.metadata?.timestamp || Date.now()
  };
}

export class ToolRegistry {
  constructor(filesystemApi) {
    this.tools = new Map();
    this.filesystemApi = filesystemApi;
    this.registerFilesystemTools();
  }

  registerFilesystemTools() {
    const fs = this.filesystemApi;

    // filesystem.drives
    this.register({
      id: 'filesystem.drives',
      name: 'Listar unidades',
      description: 'Retorna unidades de disco disponíveis no sistema (C:\, D:\, etc.)',
      schema: toolSchemas.drives,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async () => {
        try {
          const res = await this.filesystemApi.drives();
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha ao listar unidades' });
          return createToolResult('success', { drives: res.drives || [] });
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.inspect
    this.register({
      id: 'filesystem.inspect',
      name: 'Inspecionar caminho',
      description: 'Inspeciona um arquivo ou pasta (existe, tipo, tamanho, mtime, etc.)',
      schema: toolSchemas.inspect,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ path }) => {
        try {
          const res = await this.filesystemApi.inspect(path);
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha na inspeção' });
          if (!res.exists) return createToolResult('not_found', { path: res.path }, { reason: 'Caminho não existe' });
          return createToolResult('success', res);
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.list
    this.register({
      id: 'filesystem.list',
      name: 'Listar diretório',
      description: 'Lista conteúdo de diretório (shallow ou deep com recursão)',
      schema: toolSchemas.list,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ path, deep = false, entryLimit = 60000, depthLimit = 16, cancelId }) => {
        try {
          const res = await this.filesystemApi.list(path, { deep, entryLimit, depthLimit, cancelId });
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha ao listar' });
          return createToolResult('success', res);
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.search
    this.register({
      id: 'filesystem.search',
      name: 'Buscar por nome',
      description: 'Busca arquivos/pastas por nome em raízes definidas',
      schema: toolSchemas.search,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ roots, name, type = 'file', maxResults = 20, depthLimit = 12, entryLimit = 60000, cancelId }) => {
        try {
          const res = await this.filesystemApi.search(roots, { name, type, maxResults, depthLimit, entryLimit, cancelId });
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha na busca' });
          return createToolResult('success', res);
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.discover
    this.register({
      id: 'filesystem.discover',
      name: 'Descobrir projetos',
      description: 'Descobre projetos (package.json, Cargo.toml, etc.) em raízes',
      schema: toolSchemas.discover,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ roots, maxResults = 10, depthLimit = 4, entryLimit = 50000, filter, cancelId }) => {
        try {
          const res = await this.filesystemApi.discover(roots, { maxResults, depthLimit, entryLimit, filter, cancelId });
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha na descoberta' });
          return createToolResult('success', res);
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.hash
    this.register({
      id: 'filesystem.hash',
      name: 'Hash SHA-256',
      description: 'Calcula SHA-256 de um arquivo',
      schema: toolSchemas.hash,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ path }) => {
        try {
          const res = await this.filesystemApi.hash(path);
          if (!res.ok) return createToolResult('error', null, { error: res.error?.message || 'Falha no hash' });
          return createToolResult('success', res);
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });

    // filesystem.cancel
    this.register({
      id: 'filesystem.cancel',
      name: 'Cancelar operação',
      description: 'Cancela busca/descoberta em andamento via cancelId',
      schema: toolSchemas.cancel,
      securityLevel: SECURITY_LEVELS.READ,
      execute: async ({ cancelId }) => {
        try {
          const res = await this.filesystemApi.cancel(cancelId);
          return createToolResult('success', { cancelled: res.cancelled });
        } catch (e) {
          return createToolResult('error', null, { error: e.message });
        }
      }
    });
  }

  register(tool) {
    if (!tool.id || !tool.execute || typeof tool.execute !== 'function') {
      throw new Error('Ferramenta inválida: id e execute obrigatórios');
    }
    this.tools.set(tool.id, {
      ...tool,
      schema: tool.schema || { type: 'object', properties: {} },
      securityLevel: tool.securityLevel || SECURITY_LEVELS.READ
    });
  }

  unregister(toolId) {
    this.tools.delete(toolId);
  }

  getTool(toolId) {
    return this.tools.get(toolId);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getToolsBySecurityLevel(level) {
    return Array.from(this.tools.values()).filter(t => t.securityLevel === level);
  }

  async execute(toolId, params, options = {}) {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return createToolResult('error', null, { error: `Ferramenta não encontrada: ${toolId}` });
    }

    const signal = options.signal;
    if (signal?.aborted) return createToolResult('cancelled', null, { error: 'Operação cancelada.' });
    const cancelId = params?.cancelId;
    const cancelOnAbort = () => {
      if (cancelId && this.filesystemApi?.cancel) this.filesystemApi.cancel({ cancelId }).catch(() => {});
    };
    signal?.addEventListener('abort', cancelOnAbort, { once: true });

    // Validação básica de schema (opcional - pode usar JSON Schema validator real)
    if (tool.schema) {
      // Validação básica: propriedades required
      if (tool.schema.required) {
        for (const req of tool.schema.required) {
          if (!(req in params)) {
            return createToolResult('error', null, { error: `Parâmetro obrigatório ausente: ${req}` });
          }
        }
      }
    }

    // ETAPA 6: Retry para falhas transitórias (máx 2 retries)
    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= 2) {
      try {
        const result = await tool.execute(params, options);
        if (signal?.aborted) return createToolResult('cancelled', null, { error: 'Operação cancelada.' });
        return normalizeObservation(toolId, result);
      } catch (error) {
        // Verificar se é erro transitório
        const isTransient = this.isTransientError(error);

        if (isTransient && attempt < 2) {
          attempt++;
          console.log(`[ToolRegistry] retry ${attempt}/2 for ${toolId}`);

          // Backoff exponencial: 500ms, 1000ms
          const backoff = Math.min(500 * Math.pow(2, attempt - 1), 2000);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }

        // Erro não transitório ou retries esgotados
        if (signal?.aborted || error.name === 'AbortError') return normalizeObservation(toolId, createToolResult('cancelled', null, { error: 'Operação cancelada.' }));
        return normalizeObservation(toolId, createToolResult('error', null, { error: error.message }));
      }
    }

    // Se chegou aqui, todos os retries falharam
    return normalizeObservation(toolId, createToolResult('error', null, { error: 'Máximo de retries atingido' }));
  }

  /**
   * Verifica se o erro é transitório (pode valer a pena tentar novamente)
   * Erros transitórios: timeout, rede, 5xx, 429, 408, 409
   * Erros NÃO transitórios: caminho inexistente, argumento inválido, permissão negada, etc.
   */
  isTransientError(error) {
    if (!error) return false;

    const message = error.message || String(error);
    const code = error.code || '';
    const status = error.status || error.statusCode || 0;

    // Códigos de erro transitórios conhecidos
    const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'ETIMEDOUT'];
    const transientStatuses = [408, 409, 429, 500, 502, 503, 504];

    // Verificar código de erro
    if (transientCodes.includes(code)) return true;

    // Verificar status HTTP
    if (transientStatuses.includes(status)) return true;

    // Verificar mensagens de erro conhecidas como transitórias
    const transientMessages = [
      'timeout',
      'timed out',
      'connection refused',
      'connection reset',
      'network error',
      'temporary failure',
      'service unavailable',
      'too many requests',
      'rate limit'
    ];

    const lowerMessage = message.toLowerCase();
    if (transientMessages.some(msg => lowerMessage.includes(msg))) return true;

    return false;
  }

  // Executar múltiplas ferramentas em sequência
  async executeSequence(toolCalls) {
    const results = [];
    for (const call of toolCalls) {
      const result = await this.execute(call.tool, call.params);
      results.push({ tool: call.tool, ...result });
      // Se erro crítico, pode parar (opcional)
      if (result.status === 'error' && call.critical) break;
    }
    return results;
  }

  // Obter schemas para LLM (function calling style)
  getSchemasForLLM() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.id,
      description: t.description,
      parameters: t.schema
    }));
  }
}

export { SECURITY_LEVELS, createToolResult, normalizeObservation };