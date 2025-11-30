/**
 * view_image tool - View and analyze generated charts
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { ViewImageResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { SubAgentContext, TextContent, ImageContent } from './types.js';

export function createViewImageTool(ctx: SubAgentContext) {
  return tool({
    description: `View a chart you generated to see how it turned out. After generating a chart with code_interpreter, use this to verify it looks correct before including it in your results.`,
    inputSchema: z.object({
      imagePath: z.string().describe("Path to the image (e.g., 'charts/revenue_chart.png')"),
      description: z.string().describe("Brief description for UI (e.g., 'Reviewing revenue chart')"),
      question: z.string()
        .optional()
        .describe("What you want to check about the chart"),
    }),

    execute: async (params, { toolCallId }): Promise<ViewImageResult> => {
      // Emit tool start event
      const description = params.description || 'Viewing chart';
      ctx.emitToolStart(toolCallId, 'view_image', params as unknown as Record<string, unknown>, description);
      // Helper to emit end event and return result
      const emitAndReturn = (result: ViewImageResult): ViewImageResult => {
        ctx.emitToolEnd(toolCallId, result, result.success);
        return result;
      };

      // Check tool call limits
      const limitError = ctx.checkToolCallLimit('view_image');
      if (limitError) {
        return emitAndReturn({
          success: false,
          error: limitError.message,
          addedToContext: false,
          errorInfo: limitError,
        });
      }

      const { imagePath, question } = params;

      ctx.logger.info(`${ctx.id} viewing image: ${imagePath}`);

      try {
        // Resolve the full path
        const fullPath = imagePath.startsWith('/')
          ? imagePath
          : path.join(ctx.agentDir, imagePath);

        // Check if file exists
        try {
          await fs.access(fullPath);
        } catch {
          ctx.recordToolCall('view_image', false);
          return emitAndReturn({
            success: false,
            error: `Image not found: ${imagePath}. Make sure the chart was generated successfully.`,
            addedToContext: false,
            errorInfo: ToolErrors.imageNotFound(imagePath),
          });
        }

        // Read the image and convert to base64
        const imageBuffer = await fs.readFile(fullPath);
        const base64Image = imageBuffer.toString('base64');

        // Determine media type from extension
        const ext = path.extname(fullPath).toLowerCase();
        const mediaTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        const mediaType = mediaTypes[ext] || 'image/png';

        // Create the data URL
        const dataUrl = `data:${mediaType};base64,${base64Image}`;

        // Build the message content with the image
        const messageContent: Array<TextContent | ImageContent> = [
          {
            type: 'image',
            image: dataUrl
          },
          {
            type: 'text',
            text: question
              ? `I've added the image "${imagePath}" to this conversation. ${question}`
              : `I've added the image "${imagePath}" to this conversation. Please analyze this image and verify it looks correct for the intended purpose.`
          }
        ];

        // Add the image to the message history so the model can see it
        ctx.messages.push({
          role: "user",
          content: messageContent
        });

        // Log to worklog
        await ctx.appendToWorklog(
          `\n### View Image: ${imagePath}\n` +
          `- Question: ${question || 'Verify image correctness'}\n` +
          `- Image added to conversation context\n\n`
        );

        ctx.logger.success(`${ctx.id} added image to context: ${imagePath}`);

        ctx.recordToolCall('view_image', true);
        return emitAndReturn({
          success: true,
          description: `Image "${imagePath}" has been added to the conversation. You can now see and analyze it.`,
          imagePath: fullPath,
          addedToContext: true
        });

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error viewing image';
        ctx.logger.error(`${ctx.id} view image failed: ${errorMessage}`);
        ctx.recordToolCall('view_image', false);
        return emitAndReturn({
          success: false,
          error: errorMessage,
          addedToContext: false,
          errorInfo: ToolErrors.unknownError(errorMessage),
        });
      }
    },
  });
}
