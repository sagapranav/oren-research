/**
 * view_image tool for orchestrator - View charts created by agents
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { ViewImageResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { OrchestratorContext } from './types.js';

export function createViewImageTool(ctx: OrchestratorContext) {
  return tool({
    description: `View a chart created by an agent. Use this to see charts before including them in your final report. The get_agent_result tool returns an 'artifacts' array like ["charts/funding.png"] - construct the full path as: agents/{agent_id}/{artifact}`,
    inputSchema: z.object({
      imagePath: z.string().describe("Full path to the image (e.g., 'agents/agent_1/charts/funding_chart.png')"),
      description: z.string().optional().describe("Brief description for UI (e.g., 'Viewing funding chart')"),
    }),

    execute: async ({ imagePath, description: _description }: { imagePath: string; description?: string }): Promise<ViewImageResult> => {
      ctx.logger.info(`[ORCHESTRATOR] Viewing image: ${imagePath}`);

      try {
        // Resolve the full path relative to session directory
        const sessionDir = path.join(ctx.workDir, ctx.sessionId);
        const fullPath = imagePath.startsWith('/')
          ? imagePath
          : path.join(sessionDir, imagePath);

        ctx.logger.debug(`[ORCHESTRATOR] Full image path: ${fullPath}`);

        // Check if file exists
        try {
          await fs.access(fullPath);
        } catch {
          ctx.logger.error(`[ORCHESTRATOR] Image not found: ${fullPath}`);
          return {
            success: false,
            error: `Image not found: ${imagePath}. Check the agent_id and filename from get_agent_result artifacts.`,
            addedToContext: false,
            errorInfo: ToolErrors.imageNotFound(imagePath),
          };
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

        ctx.logger.success(`[ORCHESTRATOR] Loaded image: ${imagePath} (${imageBuffer.length} bytes)`);

        // Return with the image data - the AI SDK will handle adding it to context
        return {
          success: true,
          description: `Chart loaded: ${imagePath}. You can now see this chart and describe it accurately in your report. Reference it as: ![Caption](${imagePath})`,
          imagePath: fullPath,
          addedToContext: true,
          // Include the base64 image data for the model to see
          imageData: `data:${mediaType};base64,${base64Image}`,
        } as ViewImageResult & { imageData: string };

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error viewing image';
        ctx.logger.error(`[ORCHESTRATOR] View image failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
          addedToContext: false,
          errorInfo: ToolErrors.unknownError(errorMessage),
        };
      }
    },
  });
}
