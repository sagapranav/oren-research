/**
 * get_agent_result tool - Retrieves results from a completed agent
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { GetAgentResultResult } from '../../../shared/types/index.js';
import type { OrchestratorContext } from './types.js';

export function createGetAgentResultTool(ctx: OrchestratorContext) {
  return tool({
    description: "Get the result from a completed agent",
    inputSchema: z.object({
      agent_id: z.string().describe("The ID of the agent whose result to retrieve"),
    }),
    execute: async ({ agent_id }: { agent_id: string }): Promise<GetAgentResultResult> => {
      ctx.logger.info(`[GET_RESULT] Fetching result for ${agent_id}`);

      const agent = ctx.agents.get(agent_id);
      if (!agent) {
        ctx.logger.warn(`[GET_RESULT] Agent ${agent_id} not found in agents map`);
        ctx.logger.debug(`[GET_RESULT] Available agents: ${Array.from(ctx.agents.keys()).join(', ')}`);
        return {
          agent_id: agent_id,
          status: 'failed',
          error: `Agent ${agent_id} not found`,
        };
      }

      const status = await agent.getStatus();
      ctx.logger.debug(`[GET_RESULT] Agent ${agent_id} status: ${status.status}`);

      if (status.status !== "completed") {
        ctx.logger.info(`[GET_RESULT] Agent ${agent_id} not ready: ${status.status}, retries: ${status.retryCount}/3`);
        return {
          agent_id: agent_id,
          status: 'not_ready',
          error: `Agent is ${status.status}. Current retry count: ${status.retryCount}/3`,
        };
      }

      const resultsFile = agent.resultsFile;
      ctx.logger.debug(`[GET_RESULT] Reading results from: ${resultsFile}`);

      try {
        const result = await fs.readFile(resultsFile, "utf-8");
        ctx.logger.debug(`[GET_RESULT] Read ${result.length} chars from results file`);

        // Collect artifacts (charts, images) from this agent
        const artifacts = await ctx.listAgentArtifacts(agent_id);

        ctx.logger.info(`[GET_RESULT] ${agent_id}: ${result.length} chars, ${artifacts.length} artifacts`);
        if (artifacts.length > 0) {
          ctx.logger.debug(`[GET_RESULT] Artifacts: ${JSON.stringify(artifacts)}`);
        }

        // Always copy results.md and any artifacts to the shared artifacts folder
        const sessionPath = path.join(ctx.workDir, ctx.sessionId);
        const artifactsDir = path.join(sessionPath, "artifacts", agent_id);
        await fs.mkdir(artifactsDir, { recursive: true });
        ctx.logger.debug(`[GET_RESULT] Copying to artifacts folder: ${artifactsDir}`);

        const agentDir = path.dirname(agent.resultsFile);

        // Always copy results.md
        try {
          const resultsDestPath = path.join(artifactsDir, "results.md");
          await fs.copyFile(resultsFile, resultsDestPath);
          ctx.logger.info(`[GET_RESULT] Copied results.md to artifacts folder`);
        } catch (e) {
          ctx.logger.warn(`[GET_RESULT] Failed to copy results.md to artifacts`);
        }

        // Copy chart artifacts
        for (const artifact of artifacts) {
          const srcPath = path.join(agentDir, artifact);
          const destPath = path.join(artifactsDir, path.basename(artifact));
          try {
            await fs.copyFile(srcPath, destPath);
            ctx.logger.debug(`[GET_RESULT] Copied: ${srcPath} -> ${destPath}`);
          } catch (e) {
            ctx.logger.warn(`[GET_RESULT] Failed to copy artifact: ${srcPath}`);
          }
        }

        return {
          agent_id: agent_id,
          status: 'success',
          result,
          length: result.length,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ctx.logger.error(`[GET_RESULT] Error reading results for ${agent_id}: ${errorMessage}`);
        return {
          agent_id: agent_id,
          status: 'failed',
          error: `Failed to read results: ${errorMessage}`,
        };
      }
    },
  });
}
