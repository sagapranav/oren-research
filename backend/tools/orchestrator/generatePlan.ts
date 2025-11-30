/**
 * generate_plan tool - Uses Claude Opus 4.5 with extended thinking to create a research plan
 * This tool is called at the start of research to get a strategic, well-thought-out plan
 */

import { tool } from 'ai';
import { z } from 'zod';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import fs from 'fs/promises';
import type { OrchestratorContext } from './types.js';
import { getPlanGenerationPrompt } from '../../prompts/tools/generate_plan.js';

export interface GeneratePlanResult {
  success: boolean;
  strategic_perspective?: string;
  error?: string;
}

export function createGeneratePlanTool(ctx: OrchestratorContext) {
  return tool({
    description: "Generate a strategic research plan using advanced reasoning. Call this FIRST before spawning any agents. The plan will guide how you decompose the research into agent tasks.",
    inputSchema: z.object({
      query: z.string().describe("The research query to plan for"),
      clarification_context: z.string().optional().describe("Additional context from user clarifications"),
    }),
    execute: async ({ query, clarification_context }: { query: string; clarification_context?: string }): Promise<GeneratePlanResult> => {
      // Get the plan generation prompt
      const PLAN_GENERATION_PROMPT = getPlanGenerationPrompt();

      ctx.logger.info(`[PLAN] Generating research plan with Opus 4.5`);
      ctx.logger.info(`[PLAN] Query: ${query.substring(0, 100)}...`);

      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
      });

      try {
        const openrouter = createOpenRouter({
          apiKey: process.env.OPENROUTER_API_KEY,
        });

        // Build the user message with query and clarifications
        let userMessage = `<query>\n${query}\n</query>`;

        if (clarification_context) {
          userMessage += `\n\n<user_clarifications>\n${clarification_context}\n</user_clarifications>`;
        }

        userMessage += `\n\n<current_date>${currentDate}</current_date>`;
        userMessage += `\n\nProvide your strategic perspective on how to approach this research query.`;

        ctx.logger.debug(`[PLAN] Calling planning model: ${ctx.planningModel}`);

        const { text, reasoning } = await generateText({
          model: openrouter.chat(ctx.planningModel) as any,
          system: PLAN_GENERATION_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          providerOptions: {
            anthropic: {
              thinking: {
                type: 'enabled',
              }
            }
          }
        });

        ctx.logger.debug(`[PLAN] Received strategic perspective from planning model`);
        // reasoning may be an array of reasoning steps
        const reasoningText = reasoning ? JSON.stringify(reasoning) : null;
        if (reasoningText) {
          ctx.logger.debug(`[PLAN] Reasoning provided: ${reasoningText.substring(0, 200)}...`);
        }

        const strategicPerspective = text.trim();
        ctx.logger.success(`[PLAN] Strategic perspective generated (${strategicPerspective.length} chars)`);

        // Save plan to file
        const planData = {
          session_id: ctx.sessionId,
          created: new Date().toISOString(),
          query,
          clarification_context,
          strategic_perspective: strategicPerspective,
          reasoning: reasoningText,
        };

        await fs.writeFile(ctx.planFile, JSON.stringify(planData, null, 2), 'utf-8');

        // Store the strategic perspective in context so orchestrator can use it
        ctx.strategicPerspective = strategicPerspective;

        return {
          success: true,
          strategic_perspective: strategicPerspective,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ctx.logger.error(`[PLAN] Failed to generate plan: ${errorMessage}`);

        return {
          success: false,
          error: `Failed to generate research plan: ${errorMessage}`,
        };
      }
    },
  });
}
