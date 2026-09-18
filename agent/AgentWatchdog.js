/**
 * AgentWatchdog - Monitor de segurança para detectar loops e falta de progresso
 * O watchdog monitora o AgentCore e pode abortar execuções que não progridem
 */
export class AgentWatchdog {
  constructor(agentCore, options = {}) {
    this.agentCore = agentCore;
    this.maxStepsWithoutProgress = options.maxStepsWithoutProgress ?? 5;
    this.checkIntervalMs = options.checkIntervalMs ?? 5000;
    this.intervalId = null;
    this.lastStep = -1;
    this.lastToolCallsCount = 0;
    this.lastObservationHash = null;
    this.noProgressChecks = 0;
    this.isActive = false;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.lastStep = this.agentCore.currentStep;
    this.lastToolCallsCount = this.agentCore.toolCallsCount;
    this.lastObservationHash = this.computeObservationHash();
    this.noProgressChecks = 0;

    this.intervalId = setInterval(() => this.check(), this.checkIntervalMs);
    console.log('[AgentWatchdog] Started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isActive = false;
    console.log('[AgentWatchdog] Stopped');
  }

  computeObservationHash() {
    const working = this.agentCore.context.getWorkingMemory();
    const observations = working
      .filter(m => m.content?.type === 'observation')
      .slice(-5)
      .map(m => JSON.stringify(m.content));

    if (observations.length === 0) return null;

    // Hash simples das observações recentes
    const str = observations.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  check() {
    if (!this.isActive) return;
    if (!this.agentCore.isRunning) {
      this.stop();
      return;
    }

    const currentStep = this.agentCore.currentStep;
    const currentToolCalls = this.agentCore.toolCallsCount;
    const currentObsHash = this.computeObservationHash();

    // Verificar progresso de steps
    const stepsSinceLastCheck = this.agentCore.currentStep - this.lastStep;

    // Verificar progresso de tool calls
    const toolCallsSinceLastCheck = this.agentCore.toolCallsCount - this.lastToolCallsCount;

    // Verificar mudança nas observações
    const observationChanged = this.lastObservationHash !== null &&
                               this.lastObservationHash !== currentObsHash;

    let progressMade = false;

    if (stepsSinceLastCheck > 0) progressMade = true;
    if (toolCallsSinceLastCheck > 0) progressMade = true;
    if (observationChanged) progressMade = true;

    if (progressMade) {
      // Progresso detectado - resetar contador
      this.lastStep = currentStep;
      this.lastToolCallsCount = currentToolCalls;
      this.lastObservationHash = currentObsHash;
      this.noProgressChecks = 0;
    } else {
      this.noProgressChecks += 1;
      const stepsWithoutProgress = this.noProgressChecks;

      if (stepsWithoutProgress >= this.maxStepsWithoutProgress) {
        console.log('[AgentWatchdog] SEM PROGRESSO - Disparando abort()');
        console.log(`[AgentWatchdog] Steps sem progresso: ${stepsWithoutProgress}`);
        console.log(`[AgentWatchdog] Tool calls sem progresso: ${this.agentCore.toolCallsCount - this.lastToolCallsCount}`);
        console.log(`[AgentWatchdog] Observação mudou: ${observationChanged}`);

        this.agentCore.abort();
        this.stop();
        return;
      }
    }

  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isActive = false;
    console.log('[AgentWatchdog] Stopped');
  }
}

export const createAgentWatchdog = (agentCore, options) => new AgentWatchdog(agentCore, options);