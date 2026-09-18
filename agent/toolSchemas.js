/**
 * toolSchemas - Schemas JSON para validação de parâmetros das ferramentas
 * Usados pelo ToolRegistry e expostos ao LLM para function calling
 */
export const toolSchemas = {
  drives: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false
  },
  inspect: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho absoluto do arquivo ou pasta a inspecionar' }
    },
    required: ['path'],
    additionalProperties: false
  },
  list: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho absoluto do diretório' },
      deep: { type: 'boolean', description: 'Se true, lista recursivamente', default: false },
      entryLimit: { type: 'integer', description: 'Limite máximo de entradas', default: 60000, minimum: 1 },
      depthLimit: { type: 'integer', description: 'Limite de profundidade', default: 16, minimum: 1 },
      cancelId: { type: 'string', description: 'ID para cancelamento', default: '' }
    },
    required: ['path'],
    additionalProperties: false
  },
  search: {
    type: 'object',
    properties: {
      roots: { type: 'array', items: { type: 'string' }, description: 'Raízes de busca (ex: ["C:\\\\", "D:\\\\"])', minItems: 1 },
      name: { type: 'string', description: 'Nome ou padrão para buscar' },
      type: { type: 'string', enum: ['file', 'dir', 'both'], description: 'Tipo: file, dir ou both', default: 'file' },
      maxResults: { type: 'integer', description: 'Máximo de resultados', default: 20, minimum: 1 },
      depthLimit: { type: 'integer', description: 'Limite de profundidade', default: 12, minimum: 1 },
      entryLimit: { type: 'integer', description: 'Limite de entradas escaneadas', default: 60000, minimum: 1 },
      cancelId: { type: 'string', description: 'ID para cancelamento', default: '' }
    },
    required: ['roots', 'name'],
    additionalProperties: false
  },
  discover: {
    type: 'object',
    properties: {
      roots: { type: 'array', items: { type: 'string' }, description: 'Raízes de descoberta', minItems: 1 },
      maxResults: { type: 'integer', description: 'Máximo de projetos', default: 10, minimum: 1 },
      depthLimit: { type: 'integer', description: 'Limite de profundidade', default: 4, minimum: 1 },
      entryLimit: { type: 'integer', description: 'Limite de entradas escaneadas', default: 50000, minimum: 1 },
      filter: { type: 'string', description: 'Filtro por kind/framework/marker', default: '' },
      cancelId: { type: 'string', description: 'ID para cancelamento', default: '' }
    },
    required: ['roots'],
    additionalProperties: false
  },
  hash: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho absoluto do arquivo para hash SHA-256' }
    },
    required: ['path'],
    additionalProperties: false
  },
  cancel: {
    type: 'object',
    properties: {
      cancelId: { type: 'string', description: 'ID da operação a cancelar' }
    },
    required: ['cancelId'],
    additionalProperties: false
  }
};