/**
 * write_report tool - Uses a strong model to synthesize all research into a final report
 * Takes all context (query, clarifications, plan, agent results, images) and produces a polished report
 */

import { tool } from 'ai';
import { z } from 'zod';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import fs from 'fs/promises';
import path from 'path';
import { stateManager } from '../../orchestrator/stateManager.js';
import type { OrchestratorContext } from './types.js';
import { getReportWriterPrompt } from '../../prompts/tools/write_report.js';

// Schema for agent result input - only need agent_id and task
// Results and artifacts are read from the artifacts folder
const AgentResultSchema = z.object({
  agent_id: z.string().describe("The agent ID (e.g., 'agent_1')"),
  task: z.string().describe("The task that was assigned to this agent"),
});

export interface WriteReportResult {
  success: boolean;
  message?: string;
  error?: string;
  chartCount?: number;
  wordCount?: number;
}

export function createWriteReportTool(ctx: OrchestratorContext) {
  const inputSchema = z.object({
    query: z.string().describe("The original research question"),
    clarification_context: z.string().optional().describe("Any clarifications provided by the user"),
    agent_results: z.array(AgentResultSchema).describe("List of agents that completed - only need agent_id and task. Results and artifacts are read from the artifacts folder automatically."),
  });

  // Note: Type assertion needed due to AI SDK's deep type inference with nested Zod schemas
  return tool({
    description: `Write the final research report. Call this after collecting all agent results. Pass the original query, any clarifications, and the list of agents (agent_id and task only). The tool reads results and artifacts from the artifacts folder automatically.`,
    inputSchema: inputSchema as any,
    execute: async ({ query, clarification_context, agent_results }: {
      query: string;
      clarification_context?: string;
      agent_results: Array<{
        agent_id: string;
        task: string;
      }>;
    }): Promise<WriteReportResult> => {
      // Get the report writer prompt
      const REPORT_WRITER_PROMPT = getReportWriterPrompt();

      ctx.logger.info(`[WRITE_REPORT] ========== STARTING REPORT GENERATION ==========`);
      ctx.logger.info(`[WRITE_REPORT] Query: ${query.substring(0, 100)}...`);
      ctx.logger.info(`[WRITE_REPORT] Clarification context: ${clarification_context ? 'provided' : 'none'}`);
      ctx.logger.info(`[WRITE_REPORT] Number of agent results received: ${agent_results.length}`);

      // Log agent info
      for (const ar of agent_results) {
        ctx.logger.info(`[WRITE_REPORT] Agent ${ar.agent_id}: ${ar.task.substring(0, 80)}...`);
      }

      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
      });

      try {
        const openrouter = createOpenRouter({
          apiKey: process.env.OPENROUTER_API_KEY,
        });

        const sessionDir = path.join(ctx.workDir, ctx.sessionId);
        const artifactsBaseDir = path.join(sessionDir, "artifacts");

        // Build the context with all agent findings
        let researchContext = `<research_query>\n${query}\n</research_query>\n\n`;
        researchContext += `<current_date>${currentDate}</current_date>\n\n`;

        if (clarification_context) {
          researchContext += `<user_clarifications>\n${clarification_context}\n</user_clarifications>\n\n`;
        }

        // Collect all charts and build agent findings section
        // READ EVERYTHING FROM THE ARTIFACTS FOLDER
        const allCharts: Array<{ path: string; agentId: string; base64: string; mediaType: string }> = [];
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        const mediaTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        };

        researchContext += `<agent_findings>\n`;

        for (const agentResult of agent_results) {
          const agentArtifactsDir = path.join(artifactsBaseDir, agentResult.agent_id);

          // Read results.md from artifacts folder
          let agentResultText = '';
          const resultsPath = path.join(agentArtifactsDir, 'results.md');
          try {
            agentResultText = await fs.readFile(resultsPath, 'utf-8');
            ctx.logger.info(`[WRITE_REPORT] ✓ Read results.md for ${agentResult.agent_id} (${agentResultText.length} chars)`);
          } catch (e: any) {
            ctx.logger.error(`[WRITE_REPORT] ✗ Failed to read results.md for ${agentResult.agent_id}: ${e.message}`);
            agentResultText = `[Error: Could not read results for ${agentResult.agent_id}]`;
          }

          researchContext += `\n<agent id="${agentResult.agent_id}" task="${agentResult.task}">\n`;
          researchContext += agentResultText;
          researchContext += `\n</agent>\n`;

          // Scan artifacts folder for images
          try {
            const files = await fs.readdir(agentArtifactsDir);
            const imageFiles = files.filter(f =>
              imageExtensions.includes(path.extname(f).toLowerCase())
            );

            ctx.logger.info(`[WRITE_REPORT] Found ${imageFiles.length} images for ${agentResult.agent_id}: ${JSON.stringify(imageFiles)}`);

            for (const imageFile of imageFiles) {
              const fullPath = path.join(agentArtifactsDir, imageFile);
              // Use artifacts path for the report (where images actually are)
              const chartPath = `artifacts/${agentResult.agent_id}/${imageFile}`;

              try {
                const imageBuffer = await fs.readFile(fullPath);
                const base64 = imageBuffer.toString('base64');
                const ext = path.extname(fullPath).toLowerCase();
                const mediaType = mediaTypes[ext] || 'image/png';

                allCharts.push({
                  path: chartPath,
                  agentId: agentResult.agent_id,
                  base64,
                  mediaType,
                });

                ctx.logger.info(`[WRITE_REPORT]   ✓ Loaded: ${chartPath} (${imageBuffer.length} bytes)`);
              } catch (e: any) {
                ctx.logger.error(`[WRITE_REPORT]   ✗ Failed to load: ${fullPath} - ${e.message}`);
              }
            }
          } catch (e: any) {
            ctx.logger.warn(`[WRITE_REPORT] Could not scan artifacts folder for ${agentResult.agent_id}: ${e.message}`);
          }
        }

        researchContext += `</agent_findings>`;

        ctx.logger.info(`[WRITE_REPORT] ========== CONTEXT SUMMARY ==========`);
        ctx.logger.info(`[WRITE_REPORT] Research context: ${researchContext.length} chars`);
        ctx.logger.info(`[WRITE_REPORT] Total charts loaded: ${allCharts.length}`);
        if (allCharts.length > 0) {
          ctx.logger.info(`[WRITE_REPORT] Chart paths that will be in report:`);
          allCharts.forEach((c, i) => ctx.logger.info(`[WRITE_REPORT]   ${i + 1}. ${c.path}`));
        } else {
          ctx.logger.warn(`[WRITE_REPORT] WARNING: No charts were loaded! Check if artifacts were passed correctly.`);
        }

        // Build messages with proper chart reference structure
        const messageContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];

        // STEP 1: Build and add chart reference guide FIRST (before images)
        // This tells the model exactly what paths to use before it sees the images
        if (allCharts.length > 0) {
          // Find the task for each agent to provide context
          const agentTaskMap = new Map<string, string>();
          for (const agentResult of agent_results) {
            agentTaskMap.set(agentResult.agent_id, agentResult.task);
          }

          let chartGuide = `<chart_reference_guide>\n`;
          chartGuide += `Your report must include these charts. Use the EXACT paths shown below.\n`;
          chartGuide += `The images will appear after this guide in the same numbered order.\n\n`;

          allCharts.forEach((chart, index) => {
            const chartNum = index + 1;
            const agentTask = agentTaskMap.get(chart.agentId) || 'Research task';
            chartGuide += `Chart ${chartNum}:\n`;
            chartGuide += `  Path: ${chart.path}\n`;
            chartGuide += `  Source: ${chart.agentId} (task: "${agentTask}")\n`;
            chartGuide += `  Markdown: ![Your Caption](${chart.path})\n\n`;
          });

          chartGuide += `</chart_reference_guide>`;

          messageContent.push({
            type: 'text',
            text: chartGuide,
          });

          // STEP 2: Add images in numbered order matching the guide
          // AI SDK supports base64 data URLs per docs
          allCharts.forEach((chart, index) => {
            const chartNum = index + 1;
            messageContent.push({
              type: 'image',
              image: `data:${chart.mediaType};base64,${chart.base64}`,
            } as any);
            messageContent.push({
              type: 'text',
              text: `[This is Chart ${chartNum}: ${chart.path}]`,
            });
          });
        }

        // STEP 3: Add research context (query, clarifications, agent findings)
        messageContent.push({
          type: 'text',
          text: researchContext,
        });

        // STEP 4: Final instruction
        const finalInstruction = allCharts.length > 0
          ? `\n\nWrite a comprehensive research report synthesizing all the findings above.\n\nIMPORTANT: You MUST include ALL ${allCharts.length} charts in your report using the EXACT paths from the chart_reference_guide. Place each chart in a relevant section using markdown: ![Caption](path). Do not skip any charts.`
          : `\n\nWrite a comprehensive research report synthesizing all the findings above.`;

        messageContent.push({
          type: 'text',
          text: finalInstruction,
        });

        ctx.logger.info(`[WRITE_REPORT] Building message content complete. Total parts: ${messageContent.length}`);

        ctx.logger.info(`[WRITE_REPORT] ========== MAKING API CALL ==========`);
        ctx.logger.info(`[WRITE_REPORT] Model: ${ctx.reportWritingModel}`);
        ctx.logger.info(`[WRITE_REPORT] System prompt length: ${REPORT_WRITER_PROMPT.length}`);
        ctx.logger.info(`[WRITE_REPORT] Message parts: ${messageContent.length}`);
        ctx.logger.info(`[WRITE_REPORT] Temperature: 0.5, MaxTokens: 24000`);

        const apiStartTime = Date.now();
        const result = await generateText({
          model: openrouter.chat(ctx.reportWritingModel) as any,
          system: REPORT_WRITER_PROMPT,
          messages: [{
            role: 'user',
            content: messageContent,
          }],
          temperature: 0.5,
          maxOutputTokens: 24000,
        });
        const apiDuration = Date.now() - apiStartTime;

        const text = result.text;
        const wordCount = text.split(/\s+/).length;
        const chartMatches = text.match(/!\[.*?\]\(.*?\.png\)/g) || [];

        ctx.logger.info(`[WRITE_REPORT] ========== API RESPONSE ==========`);
        ctx.logger.info(`[WRITE_REPORT] Duration: ${(apiDuration / 1000).toFixed(2)}s`);
        ctx.logger.info(`[WRITE_REPORT] Response length: ${text.length} chars, ${wordCount} words`);
        ctx.logger.info(`[WRITE_REPORT] Chart references found: ${chartMatches.length}`);
        if (chartMatches.length === 0) {
          ctx.logger.warn(`[WRITE_REPORT] WARNING: No chart references in output!`);
        }

        ctx.logger.success(`[WRITE_REPORT] Report generated: ${wordCount} words, ${chartMatches.length} charts`);

        // Save the report directly - don't return content to orchestrator
        // This prevents the orchestrator from modifying/summarizing and stripping images
        const reportPath = path.join(sessionDir, 'final_report.md');
        await fs.writeFile(reportPath, text, 'utf-8');
        ctx.logger.info(`[WRITE_REPORT] Saved to ${reportPath}`);

        // Emit event
        stateManager.emitEvent(ctx.sessionId, 'orchestrator_step', {
          stepNumber: 99, // Use high number to indicate final step
          toolCalls: [{
            toolName: 'write_report',
            input: { toolName: 'write_report', query, agent_count: agent_results.length } as any,
          }],
        });

        return {
          success: true,
          message: `DONE. Report has been written and saved to final_report.md (${wordCount} words, ${chartMatches.length} charts). Your work is complete - do not call any more tools or write anything else.`,
          chartCount: allCharts.length,
          wordCount,
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        ctx.logger.error(`[WRITE_REPORT] Failed to generate report: ${errorMessage}`);

        return {
          success: false,
          error: `Failed to generate report: ${errorMessage}`,
        };
      }
    },
  });
}
