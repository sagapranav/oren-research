/**
 * Orchestrator tools - exported as factory functions
 * Each tool receives an OrchestratorContext to access shared state
 */

export { createSpawnAgentTool } from './spawnAgent.js';
export { createWaitForAgentsTool } from './waitForAgents.js';
export { createGetAgentResultTool } from './getAgentResult.js';
export { createUpdatePlanTool } from './updatePlan.js';
export { createGeneratePlanTool } from './generatePlan.js';
export { createWriteReportTool } from './writeReport.js';
export { createFileTool } from './fileOperation.js';
export type { OrchestratorContext } from './types.js';
export type { GeneratePlanResult } from './generatePlan.js';
export type { WriteReportResult } from './writeReport.js';
