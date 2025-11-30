/**
 * wait_for_agents tool - Blocks until specified agents complete
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { WaitForAgentsResult, AgentCompletionStatus } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { OrchestratorContext } from './types.js';

export function createWaitForAgentsTool(ctx: OrchestratorContext) {
  return tool({
    description: "Wait for agents to complete their work. Use this after spawning agents instead of polling. This tool blocks until all specified agents finish (complete or fail).",
    inputSchema: z.object({
      agent_ids: z.array(z.string()).describe("IDs of the agents to wait for"),
      timeout_seconds: z.number().optional().default(180).describe("Maximum time to wait in seconds (default 180)"),
    }),
    execute: async ({ agent_ids, timeout_seconds }: { agent_ids: string[]; timeout_seconds?: number }): Promise<WaitForAgentsResult> => {
      const timeoutSeconds = timeout_seconds || 180;
      const startTime = Date.now();
      const timeoutMs = timeoutSeconds * 1000;
      const pollIntervalMs = 2000; // Check every 2 seconds

      ctx.logger.info(`[WAIT] Waiting for ${agent_ids.length} agents: ${agent_ids.join(', ')}`);
      ctx.logger.info(`[WAIT] Timeout: ${timeoutSeconds}s`);

      // Validate all agent IDs exist
      const invalidAgents = agent_ids.filter(id => !ctx.agents.has(id));
      if (invalidAgents.length > 0) {
        ctx.logger.warn(`[WAIT] Invalid agent IDs: ${invalidAgents.join(', ')}`);
        return {
          success: false,
          agents: [],
          elapsed_seconds: 0,
          error: `Agent(s) not found: ${invalidAgents.join(', ')}`,
          errorInfo: ToolErrors.agentNotFound(invalidAgents[0]!),
        };
      }

      // Poll until all agents complete or timeout
      while (Date.now() - startTime < timeoutMs) {
        const statuses: AgentCompletionStatus[] = [];
        let allDone = true;

        for (const agentId of agent_ids) {
          const agent = ctx.agents.get(agentId)!;
          const status = await agent.getStatus();

          if (status.status === 'completed' || status.status === 'failed') {
            statuses.push({
              agent_id: agentId,
              status: status.status,
              task: status.task,
              error: status.error || undefined,
            });
          } else {
            allDone = false;
            // Still running, add partial status for logging
            ctx.logger.debug(`[WAIT] ${agentId}: ${status.status} (retry ${status.retryCount})`);
          }
        }

        if (allDone) {
          const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
          const completedCount = statuses.filter(s => s.status === 'completed').length;
          const failedCount = statuses.filter(s => s.status === 'failed').length;

          ctx.logger.success(`[WAIT] All agents done in ${elapsedSeconds}s: ${completedCount} completed, ${failedCount} failed`);

          return {
            success: true,
            agents: statuses,
            elapsed_seconds: elapsedSeconds,
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      // Timeout reached - return current statuses
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      const finalStatuses: AgentCompletionStatus[] = [];

      for (const agentId of agent_ids) {
        const agent = ctx.agents.get(agentId)!;
        const status = await agent.getStatus();
        finalStatuses.push({
          agent_id: agentId,
          status: status.status === 'completed' ? 'completed' : 'failed',
          task: status.task,
          error: status.status !== 'completed' ? `Timeout after ${timeoutSeconds}s (was ${status.status})` : undefined,
        });
      }

      ctx.logger.warn(`[WAIT] Timeout after ${elapsedSeconds}s. Some agents may not have completed.`);

      return {
        success: false,
        agents: finalStatuses,
        elapsed_seconds: elapsedSeconds,
        error: `Timeout waiting for agents after ${timeoutSeconds} seconds`,
      };
    },
  });
}
