/**
 * ResponseValidator - Camada anti-hallucination
 * Verifica se a resposta do modelo é compatível com observações reais
 * Bloqueia afirmações não confirmadas
 */
export const CLAIM_TYPES = {
  FACT: 'FACT',       // dado confirmado por ferramenta
  INFERENCE: 'INFERENCE', // inferência baseada em fatos
  UNKNOWN: 'UNKNOWN',     // não confirmado
  TOOL_EXECUTION: 'TOOL_EXECUTION' // afirmação de execução
};

export const CONFIDENCE_LEVELS = {
  HIGH: 'HIGH',   // dado diretamente confirmado por ferramenta
  MEDIUM: 'MEDIUM', // inferência baseada em múltiplos fatos
  LOW: 'LOW'      // hipótese não confirmada
};

function classifyClaim(text, observations) {
  // Análise simples - em produção usar LLM para classificação mais precisa
  const lower = text.toLowerCase();
  const obsFacts = observations.flatMap(o => o.facts || []).filter(Boolean);

  // Verificar afirmações de execução de ferramenta
  if (/executei|rodei|executei|usei a ferramenta|chamei/i.test(lower)) {
    return { type: CLAIM_TYPES.TOOL_EXECUTION, confidence: CONFIDENCE_LEVELS.LOW, needsVerification: true };
  }

  // Verificar afirmações de existência de caminho/arquivo
  const pathClaims = lower.match(/(?:em|no|na)\s+([A-Za-z]:[\\/][^\s.,;]+)/g);
  if (pathClaims) {
    const hasFact = pathClaims.some(claim =>
      obsFacts.some(fact =>
        JSON.stringify(fact).toLowerCase().includes(claim.toLowerCase().replace(/^(?:em|no|na)\s+/, ''))
      )
    );
    return {
      type: CLAIM_TYPES.FACT,
      confidence: hasFact ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.LOW,
      needsVerification: !hasFact
    };
  }

  // Verificar afirmações de "encontrei/encontrou"
  if (/encontrei|encontrou|existe|existem/.test(lower)) {
    return { type: CLAIM_TYPES.FACT, confidence: CONFIDENCE_LEVELS.MEDIUM, needsVerification: true };
  }

  // Inferências explícitas
  if (/parece|provavelmente|provavel|suspeito|acredito|acho que/.test(lower)) {
    return { type: CLAIM_TYPES.INFERENCE, confidence: CONFIDENCE_LEVELS.MEDIUM, needsVerification: false };
  }

  return { type: CLAIM_TYPES.UNKNOWN, confidence: CONFIDENCE_LEVELS.LOW, needsVerification: false };
}

export class ResponseValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode ?? true;
    this.blockUnverifiedClaims = options.blockUnverifiedClaims ?? true;
    this.requireEvidenceForPaths = options.requireEvidenceForPaths ?? true;
  }

  /**
   * Valida resposta antes de enviar ao usuário
   * @returns {Object} { ok: boolean, response: string, issues: Array, originalResponse: string }
   */
  validate(response, observations, toolResults = []) {
    const issues = [];
    let cleanedResponse = response;

    // 1. Verificar afirmações de execução de ferramenta
    const toolExecutionClaims = this.extractToolExecutionClaims(response);
    for (const claim of toolExecutionClaims) {
      const verified = toolResults.some(r => r.tool && claim.text.toLowerCase().includes(r.tool.toLowerCase()));
      if (!verified && this.blockUnverifiedClaims) {
        issues.push({
          type: 'UNVERIFIED_TOOL_EXECUTION',
          claim: claim.text,
          message: 'Afirmação de execução de ferramenta não confirmada nos resultados.'
        });
        // Substituir por frase segura
        cleanedResponse = cleanedResponse.replace(claim.text, '[Ação não confirmada]');
      }
    }

    // 2. Verificar afirmações de caminhos/arquivos
    if (this.requireEvidenceForPaths) {
      const pathClaims = this.extractPathClaims(response);
      for (const claim of pathClaims) {
        const hasFact = this.verifyPathClaim(claim.path, observations);
        if (!hasFact) {
          issues.push({
            type: 'UNVERIFIED_PATH',
            claim: claim.text,
            path: claim.path,
            message: `Caminho "${claim.path}" afirmado mas não confirmado por observação.`
          });
          if (this.blockUnverifiedClaims) {
            cleanedResponse = cleanedResponse.replace(claim.text, `[Caminho não confirmado: ${claim.path}]`);
          }
        }
      }
    }

    // 3. Verificar afirmações de "encontrei/encontrou/existe"
    const existenceClaims = this.extractExistenceClaims(response);
    for (const claim of existenceClaims) {
      const hasFact = this.verifyExistenceClaim(claim.target, observations);
      if (!hasFact) {
        issues.push({
          type: 'UNVERIFIED_EXISTENCE',
          claim: claim.text,
          message: `Afirmação de existência ("${claim.target}") não confirmada.`
        });
        if (this.blockUnverifiedClaims) {
          cleanedResponse = cleanedResponse.replace(claim.text, '[Existência não confirmada]');
        }
      }
    }

    // 4. Verificar contradições com observações
    const contradictions = this.findContradictions(response, observations);
    for (const contradiction of contradictions) {
      issues.push({
        type: 'CONTRADICTION',
        claim: contradiction.claim,
        expected: contradiction.expected,
        message: `Contradição: "${contradiction.claim}" contradiz observação.`
      });
      if (this.blockUnverifiedClaims) {
        cleanedResponse = cleanedResponse.replace(contradiction.claim, `[Contradiz observação: ${contradiction.expected}]`);
      }
    }

    // 5. Adicionar disclaimers para inferências não marcadas
    if (this.strictMode) {
      cleanedResponse = this.addInferenceDisclaimers(cleanedResponse);
    }

    return {
      ok: issues.length === 0,
      response: cleanedResponse,
      issues,
      originalResponse: response,
      observationCount: observations.length
    };
  }

  extractToolExecutionClaims(text) {
    const claims = [];
    const patterns = [
      /executei\s+(?:a\s+)?(?:ferramenta\s+)?(\w+)/gi,
      /rodei\s+(?:a\s+)?(?:ferramenta\s+)?(\w+)/gi,
      /usei\s+(?:a\s+)?(?:ferramenta\s+)?(\w+)/gi,
      /chamei\s+(?:a\s+)?(?:ferramenta\s+)?(\w+)/gi,
      /a ferramenta\s+(\w+)\s+(?:rodou|executei|retornou)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        claims.push({ text: match[0], tool: match[1] });
      }
    }
    return claims;
  }

  extractPathClaims(text) {
    const claims = [];
    // Caminhos Windows: C:\..., D:\...
    const pattern = /(?:em|no|na|em\s+o\s+caminho|no\s+caminho|na\s+pasta|no\s+arquivo)\s+([A-Za-z]:[\\/][^\s.,;)]+)/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      claims.push({ text: match[0], path: match[1] });
    }
    // Caminhos absolutos soltos
    const absPattern = /([A-Za-z]:[\\/][^\s.,;)]+)/g;
    while ((match = absPattern.exec(text)) !== null) {
      // Filtrar apenas se parece ser uma afirmação (precedido por verbo de existência)
      const before = text.substring(Math.max(0, match.index - 30), match.index);
      if (/existe|encontrei|encontrou|há|tem|possui|localizado|salvo|em/.test(before)) {
        claims.push({ text: match[0], path: match[1] });
      }
    }
    return claims;
  }

  extractExistenceClaims(text) {
    const claims = [];
    const patterns = [
      /encontrei\s+(?:o\s+)?([^\s.,;]+)/gi,
      /encontrou\s+(?:o\s+)?([^\s.,;]+)/gi,
      /existe\s+(?:o\s+)?([^\s.,;]+)/gi,
      /existem\s+([^\s.,;]+)/gi,
      /há\s+([^\s.,;]+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        claims.push({ text: match[0], target: match[1] });
      }
    }
    return claims;
  }

  verifyPathClaim(path, observations) {
    // Verificar se o caminho aparece nos fatos das observações
    for (const obs of observations) {
      const factsStr = JSON.stringify(obs.facts || obs.data || obs).toLowerCase();
      if (factsStr.includes(path.toLowerCase())) return true;
    }
    return false;
  }

  verifyExistenceClaim(target, observations) {
    const lower = target.toLowerCase();
    for (const obs of observations) {
      const factsStr = JSON.stringify(obs.facts || obs.data || obs).toLowerCase();
      if (factsStr.includes(lower)) return true;
    }
    return false;
  }

  findContradictions(response, observations) {
    const contradictions = [];
    const facts = observations.flatMap(o => o.facts || []).filter(Boolean);

    // Verificar afirmações de "não existe" vs fatos de existência
    const notExistsPattern = /não\s+existe|não\s+encontrei|não\s+encontrou|inexistente/gi;
    let match;
    while ((match = notExistsPattern.exec(response)) !== null) {
      // Verificar se há fato contradizendo
      for (const fact of facts) {
        if (JSON.stringify(fact).toLowerCase().includes('exist') && fact.exists !== false) {
          contradictions.push({
            claim: match[0],
            expected: 'Observação indica existência'
          });
        }
      }
    }

    return contradictions;
  }

  addInferenceDisclaimers(response) {
    // Adicionar (INFERENCE) após frases de inferência não marcadas
    let result = response;
    const inferencePatterns = [
      /(parece que|provavelmente|provavel|suspeito|acredito que|acho que|indicam que|sugere que)([^.]*\.)/gi
    ];

    for (const pattern of inferencePatterns) {
      result = result.replace(pattern, (match, prefix, rest) => {
        if (!/(INFERENCE|FACT|HIPÓTESE)/i.test(match)) {
          return `${prefix}${rest.trim()} (INFERENCE)`;
        }
        return match;
      });
    }

    return result;
  }
}

export const createResponseValidator = (options) => new ResponseValidator(options);