/**
 * spawn_agent tool - Creates a new sub-agent with a specific task
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { StreamingSubAgent } from '../../orchestrator/streamingSubAgent.js';
import { stateManager } from '../../orchestrator/stateManager.js';
import type { SpawnAgentResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { OrchestratorContext } from './types.js';

export function createSpawnAgentTool(ctx: OrchestratorContext) {
  return tool({
    description: "Spawn a new sub-agent with a specific task. Each agent is a smart research agent that can search, analyze, and synthesize information.",
    inputSchema: z.object({
      task: z.string().describe("The specific task for this agent - be clear about what you need them to find or analyze"),
      description: z.string().describe("A brief 5-6 word summary for UI display (e.g., 'Analyze Q4 revenue trends')"),
      context_files: z
        .array(z.string())
        .optional()
        .describe("Paths to files this agent should read for context"),
    }),
    execute: async ({ task, description, context_files }: { task: string; description: string; context_files?: string[] }): Promise<SpawnAgentResult> => {
      // Check agent limit
      const currentAgentCount = ctx.agents.size;
      if (currentAgentCount >= ctx.maxAgents) {
        ctx.logger.warn(`[SPAWN] Agent limit reached (${ctx.maxAgents})`);
        return {
          agent_id: '',
          status: 'failed',
          message: `Maximum agent limit (${ctx.maxAgents}) reached. Wait for existing agents to complete.`,
          errorInfo: ToolErrors.agentLimitReached(ctx.maxAgents),
        };
      }

      const agentCounter = ctx.incrementAgentCounter();
      const agentId = `agent_${agentCounter}`;

      ctx.logger.info(`[SPAWN] Creating ${agentId} (${currentAgentCount + 1}/${ctx.maxAgents})`);
      ctx.logger.info(`[SPAWN] Description: ${description}`);
      ctx.logger.info(`[SPAWN] Task: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`);
      ctx.logger.debug(`[SPAWN] Context files: ${context_files?.length || 0}`);
      if (context_files && context_files.length > 0) {
        ctx.logger.debug(`[SPAWN] Context file paths: ${JSON.stringify(context_files)}`);
      }

      // Record in state manager with description for UI display
      stateManager.addAgent(ctx.sessionId, agentId, {
        task,
        description
      });

      // Update status immediately
      stateManager.updateAgentStatus(ctx.sessionId, agentId, 'running');

      // Agent workspace
      const agentDir = path.join(ctx.workDir, ctx.sessionId, "agents", agentId);
      await fs.mkdir(agentDir, { recursive: true });
      ctx.logger.debug(`[SPAWN] Agent directory: ${agentDir}`);

      const resultsFile = path.join(agentDir, "results.md");
      const worklogFile = path.join(agentDir, "worklog.md");
      const statusFile = path.join(agentDir, "status.json");
      ctx.logger.debug(`[SPAWN] Results file: ${resultsFile}`);
      ctx.logger.debug(`[SPAWN] Worklog file: ${worklogFile}`);

      // Add these files to allowed paths
      ctx.allowedFilePaths.add(resultsFile);

      // Create sub-agent instance
      ctx.logger.info(`[SPAWN] Using model: ${ctx.subagentModel}`);
      const agent = new StreamingSubAgent({
        id: agentId,
        sessionId: ctx.sessionId,
        task,
        resultsFile,
        worklogFile,
        statusFile,
        contextFiles: context_files,
        model: ctx.subagentModel,
        summarizerModel: ctx.summarizerModel,
      });

      ctx.agents.set(agentId, agent);
      ctx.runningAgents.add(agentId);
      ctx.logger.debug(`[SPAWN] Agent ${agentId} added to tracking. Running: ${ctx.runningAgents.size}, Completed: ${ctx.completedAgents.size}`);

      // Execute agent task asynchronously
      agent.executeTask().then(
        () => {
          ctx.logger.info(`${agentId} completed successfully`);
          ctx.runningAgents.delete(agentId);
          ctx.completedAgents.add(agentId);
          stateManager.updateAgentStatus(ctx.sessionId, agentId, 'completed');
        },
        (error) => {
          ctx.logger.error(`${agentId} failed: ${error.message}`);
          ctx.runningAgents.delete(agentId);
          ctx.failedAgents.add(agentId);
          stateManager.updateAgentStatus(ctx.sessionId, agentId, 'failed', {
            error: error.message
          });
        }
      );

      // Wait a moment for agent to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        agent_id: agentId,
        status: 'spawned',
        message: `Agent ${agentId} has been spawned and is now working on: ${task}`,
        workDir: agentDir,
      };
    },
  });
}
