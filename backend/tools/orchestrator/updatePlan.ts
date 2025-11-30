/**
 * update_plan tool - Updates the orchestrator's research plan
 */

import { tool } from 'ai';
import fs from 'fs/promises';
import { getPlanToolDescription } from '../../prompts/tools/plan_tool.js';
import { stateManager } from '../../orchestrator/stateManager.js';
import type { PlanStep, UpdatePlanResult } from '../../../shared/types/index.js';
import type { OrchestratorContext } from './types.js';

export function createUpdatePlanTool(ctx: OrchestratorContext) {
  return tool({
    ...(getPlanToolDescription() as any),
    execute: async ({ steps, mode }: {
      steps: Array<{
        id?: string;
        description: string;
        status?: 'pending' | 'in_progress' | 'completed';
        agent_ids?: string[];
      }>;
      mode: 'replace' | 'append';
    }): Promise<UpdatePlanResult> => {
      try {
        const planData = JSON.parse(await fs.readFile(ctx.planFile, "utf-8")) as {
          steps: PlanStep[];
          updated: string;
          query: string | null;
        };

        const now = new Date().toISOString();

        if (mode === "replace") {
          planData.steps = steps.map((step): PlanStep => ({
            id: step.id || `step_${ctx.incrementStepCounter()}`,
            description: step.description,
            status: step.status || "pending",
            agent_ids: step.agent_ids || [],
            created: now,
            updated: now,
          }));
        } else {
          // append mode
          const newSteps: PlanStep[] = steps.map((step): PlanStep => ({
            id: step.id || `step_${ctx.incrementStepCounter()}`,
            description: step.description,
            status: step.status || "pending",
            agent_ids: step.agent_ids || [],
            created: now,
            updated: now,
          }));
          planData.steps.push(...newSteps);
        }

        planData.updated = now;
        planData.query = ctx.query;

        await fs.writeFile(ctx.planFile, JSON.stringify(planData, null, 2));

        // Update state manager with plan steps
        for (const step of planData.steps) {
          ctx.planSteps.set(step.id, step);
        }

        // Emit plan update event
        stateManager.emitEvent(ctx.sessionId, 'plan_update', {
          steps: planData.steps,
          totalSteps: planData.steps.length
        });

        ctx.logger.info(`Plan updated with ${planData.steps.length} steps (mode: ${mode})`);

        return {
          success: true,
          totalSteps: planData.steps.length,
          message: `Plan updated successfully with ${planData.steps.length} steps`,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ctx.logger.error(`Failed to update plan: ${errorMessage}`);
        return {
          success: false,
          totalSteps: 0,
          message: `Failed to update plan: ${errorMessage}`,
        };
      }
    },
  });
}
