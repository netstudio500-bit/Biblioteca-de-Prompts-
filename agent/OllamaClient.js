/**
 * OllamaClient - Camada centralizada de acesso ao Ollama
 * Responsabilidades: /api/chat, streaming, abort, timeout, retry, erro estruturado
 * NÃO espalhar fetch() do Ollama pelo projeto.
 */
export class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.defaultTimeout = options.timeout || 120000;
    this.defaultModel = options.defaultModel || null;
    this.maxRetries = options.maxRetries ?? 2;
    this.defaultOptions = {
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      num_predict: options.maxTokens ?? 2048,
      ...options.defaultOptions
    };
    this.abortController = null;
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setDefaultModel(model) {
    this.defaultModel = model;
  }

  setDefaultOptions(opts) {
    this.defaultOptions = { ...this.defaultOptions, ...opts };
  }

  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return { ok: true, models: data.models || [] };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'ERR', message: error.message || String(error) } };
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      return { ok: response.ok, installed: response.ok };
    } catch {
      return { ok: false, installed: false };
    }
  }

  async listRunningModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/ps`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) return { ok: false, models: [] };
      const data = await response.json();
      return { ok: true, models: data.models || [] };
    } catch (error) {
      return { ok: false, models: [], error: this.error(error) };
    }
  }

  async stopModel(model) {
    if (!model) return { ok: false, error: { code: 'EINVAL', message: 'Modelo ausente.' } };
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', keep_alive: 0 }),
        signal: AbortSignal.timeout(5000)
      });
      return { ok: response.ok, error: response.ok ? undefined : { code: `HTTP_${response.status}`, message: `HTTP ${response.status}` } };
    } catch (error) {
      return { ok: false, error: this.error(error) };
    }
  }

  async chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    if (!model) {
      return { ok: false, error: { code: 'EINVAL', message: 'Nenhum modelo selecionado.' } };
    }
    const payload = {
      model,
      messages,
      stream: options.stream ?? true,
      options: { ...this.defaultOptions, ...options.options }
    };

    // ETAPA 5: Retry com backoff para falhas transitórias
    const maxRetries = this.maxRetries;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      this.abortController = controller;

      if (controller.signal.aborted) {
        return { ok: false, cancelled: true, error: { code: 'CANCELLED', message: 'Requisição cancelada.' } };
      }

      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          let detail = '';
          try { detail = (await response.text()).slice(0, 300); } catch {}

          const error = new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
          error.status = response.status;

          // Verificar se é erro transitório (5xx, 429, 408, 409)
          const isTransient = response.status >= 500 || response.status === 429 || response.status === 408 || response.status === 409;

          if (isTransient && attempt < maxRetries) {
            attempt++;
            console.log(`[OllamaClient] retry ${attempt}/${maxRetries}`);

            // Backoff exponencial: 1s, 2s, 4s...
            const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise((resolve, reject) => {
              const timer = setTimeout(resolve, backoff);
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(Object.assign(new Error('Requisição cancelada.'), { name: 'AbortError' }));
              }, { once: true });
            });
            continue; // Tentar novamente
          }

          throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
        }

        if (!options.stream) {
          const data = await response.json();
          return { ok: true, data };
        }

        return {
          ok: true,
          stream: response.body.getReader(),
          decoder: new TextDecoder(),
          buffer: '',
          controller
        };
      } catch (error) {
        if (error.name === 'AbortError') {
          return { ok: false, cancelled: true, error: { code: 'CANCELLED', message: 'Requisição cancelada.' } };
        }

        // Não fazer retry para erros não transitórios (4xx exceto 429, 408, 409)
        const isTransient = error.status >= 500 || error.status === 429 || error.status === 408 || error.status === 409;

        if (isTransient && attempt < maxRetries) {
          attempt++;
          console.log(`[OllamaClient] retry ${attempt}/${maxRetries}`);

          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, backoff);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(Object.assign(new Error('Requisição cancelada.'), { name: 'AbortError' }));
            }, { once: true });
          });
          continue;
        }

        return { ok: false, error: { code: error.code || 'ERR', message: error.message || String(error) } };
      }
    }
    return { ok: false, error: { code: 'RETRY_EXHAUSTED', message: 'Tentativas esgotadas.' } };
  }

  async chatNonStream(messages, options = {}) {
    return this.chat(messages, { ...options, stream: false });
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      return true;
    }
    return false;
  }

  isStreaming() {
    return !!this.abortController;
  }

  createStreamProcessor(onChunk, onComplete, onError) {
    let buffer = '';
    return {
      async process(streamObj) {
        const { stream, decoder, controller } = streamObj;
        try {
          while (true) {
            const chunk = await stream.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const text = line.trim();
              if (!text) continue;
              try {
                const json = JSON.parse(text);
                const piece = json.message?.content || '';
                if (piece) onChunk(piece, json);
              } catch {}
            }
          }
          buffer += decoder.decode();
          const lines = buffer.split('\n');
          for (const line of lines) {
            const text = line.trim();
            if (!text) continue;
            try {
              const json = JSON.parse(text);
              const piece = json.message?.content || '';
              if (piece) onChunk(piece, json);
            } catch {}
          }
          onComplete();
        } catch (error) {
          if (error.name !== 'AbortError') onError(error);
        }
      }
    };
  }
}

export const ollamaClient = new OllamaClient();