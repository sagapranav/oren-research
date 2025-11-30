/**
 * code_interpreter tool - Execute Python code in E2B sandbox
 */

import { tool } from 'ai';
import { z } from 'zod';
import { executeCodeWithChartSaving } from '../../orchestrator/codeExecutor.js';
import type { CodeInterpreterResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { SubAgentContext } from './types.js';

export function createCodeInterpreterTool(ctx: SubAgentContext) {
  return tool({
    description: `Execute Python code. Matplotlib, numpy, pandas are available.

For charts:
- ONE chart per call - never create multiple figures in a single execution
- Use plt.show() at the end - DO NOT use plt.savefig()
- Charts are automatically saved to charts/ folder
- The response 'files' array will contain the path (e.g., "charts/chart_1.png")
- Use that exact path with view_image to verify the chart
- If you need multiple charts, make SEPARATE code_interpreter calls for each`,
    inputSchema: z.object({
      code: z.string().describe("Python code to execute"),
      description: z.string().describe("Brief description for UI (e.g., 'Creating revenue chart')"),
      purpose: z.enum(["analysis", "visualization", "computation", "data_processing"])
        .optional()
        .default("computation")
        .describe("What the code is for"),
      outputFile: z.string()
        .optional()
        .describe("Filename for chart (e.g., 'revenue.png')"),
    }),

    execute: async (params, { toolCallId }): Promise<CodeInterpreterResult> => {
      // Emit tool start event
      const purpose = params.purpose || 'computation';
      const description = params.description ||
        (purpose === 'visualization' ? 'Creating visualization' :
         purpose === 'analysis' ? 'Analyzing data' : 'Computing results');
      ctx.emitToolStart(toolCallId, 'code_interpreter', params as unknown as Record<string, unknown>, description);
      // Check tool call limits
      const limitError = ctx.checkToolCallLimit('code_interpreter');
      if (limitError) {
        const result = {
          success: false,
          error: limitError.message,
          errorInfo: limitError,
        };
        ctx.emitToolEnd(toolCallId, result, false);
        return result;
      }

      const { code, outputFile } = params;

      ctx.logger.info(`${ctx.id} [CODE] Executing code for ${purpose}`);
      ctx.logger.debug(`${ctx.id} [CODE] Code length: ${code.length} chars`);
      ctx.logger.debug(`${ctx.id} [CODE] Output file: ${outputFile || 'auto-generated'}`);
      ctx.logger.debug(`${ctx.id} [CODE] Agent directory: ${ctx.agentDir}`);
      ctx.logger.debug(`${ctx.id} [CODE] Code preview:\n${code.substring(0, 500)}${code.length > 500 ? '...' : ''}`);

      try {
        // Execute code with chart saving capability
        const result = await executeCodeWithChartSaving(
          code,
          ctx.agentDir,
          outputFile
        );

        ctx.logger.debug(`${ctx.id} [CODE] Execution result: success=${result.success}, time=${result.executionTime}ms`);
        if (result.files) {
          ctx.logger.debug(`${ctx.id} [CODE] Generated files: ${JSON.stringify(result.files.map(f => ({ path: f.path, type: f.type, size: f.size })))}`);
        }
        if (result.logs && result.logs.length > 0) {
          ctx.logger.debug(`${ctx.id} [CODE] Logs: ${result.logs.join('\n')}`);
        }
        if (result.error) {
          ctx.logger.error(`${ctx.id} [CODE] Error: ${result.error}`);
        }

        // Log to worklog
        const chartInfo = result.files?.filter(f => f.type === 'image').map(f => f.path).join(', ') || 'none';
        await ctx.appendToWorklog(
          `\n### Code Execution (${purpose})\n` +
          `- Success: ${result.success}\n` +
          `- Execution time: ${result.executionTime}ms\n` +
          `- Charts generated: ${chartInfo}\n` +
          (result.error ? `- Error: ${result.error}\n` : '') +
          `\n`
        );

        // If charts were generated, add helpful message
        if (result.files && result.files.length > 0) {
          const chartFiles = result.files.filter(f => f.type === 'image');
          if (chartFiles.length > 0) {
            ctx.logger.success(`${ctx.id} generated ${chartFiles.length} chart(s): ${chartFiles.map(f => f.path).join(', ')}`);
          }
        }

        ctx.recordToolCall('code_interpreter', result.success);

        // Add better error info if failed
        if (!result.success && result.error) {
          const isTimeout = result.error.toLowerCase().includes('timeout');
          const isSandboxError = result.error.toLowerCase().includes('sandbox') || result.error.toLowerCase().includes('e2b');

          result.errorInfo = isTimeout
            ? ToolErrors.codeExecutionTimeout()
            : isSandboxError
              ? ToolErrors.codeSandboxError()
              : ToolErrors.codeExecutionFailed(result.error);
        }

        ctx.emitToolEnd(toolCallId, result, result.success);
        return result;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown code execution error';
        ctx.logger.error(`${ctx.id} code execution failed: ${errorMessage}`);
        ctx.recordToolCall('code_interpreter', false);

        const isSandboxError = errorMessage.toLowerCase().includes('sandbox') || errorMessage.toLowerCase().includes('e2b');

        const result = {
          success: false,
          error: errorMessage,
          errorInfo: isSandboxError
            ? ToolErrors.codeSandboxError()
            : ToolErrors.codeExecutionFailed(errorMessage),
        };
        ctx.emitToolEnd(toolCallId, result, false);
        return result;
      }
    },
  });
}
