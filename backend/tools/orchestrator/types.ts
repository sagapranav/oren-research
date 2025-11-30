/**
 * Types for orchestrator tool context
 * Tools receive this context to access orchestrator state and methods
 */

import type { StreamingSubAgent } from '../../orchestrator/streamingSubAgent.js';
import type { PlanStep } from '../../../shared/types/index.js';
import type { createLogger } from '../../logger.js';

export interface OrchestratorContext {
  // Session info
  sessionId: string;
  workDir: string;
  model: string;
  subagentModel: string;
  reportWritingModel: string;
  summarizerModel: string;
  planningModel: string;
  query: string | null;
  clarificationContext: string | null;
  strategicPerspective: string;

  // Agent tracking
  agents: Map<string, StreamingSubAgent>;
  agentCounter: number;
  runningAgents: Set<string>;
  completedAgents: Set<string>;
  failedAgents: Set<string>;
  maxAgents: number;

  // Plan tracking
  planFile: string;
  planSteps: Map<string, PlanStep>;
  stepCounter: number;

  // File paths
  allowedFilePaths: Set<string>;

  // Logger
  logger: ReturnType<typeof createLogger>;

  // Methods that tools may need
  incrementAgentCounter: () => number;
  incrementStepCounter: () => number;
  listAgentArtifacts: (agentId: string) => Promise<string[]>;
}
