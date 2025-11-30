/**
 * file tool - Read/write files in the session workspace
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { FileOperationResult } from '../../../shared/types/index.js';
import type { OrchestratorContext } from './types.js';

export function createFileTool(ctx: OrchestratorContext) {
  return tool({
    description: "Read or write files in the workspace",
    inputSchema: z.object({
      operation: z.enum(["read", "write", "append"]).describe("The file operation to perform"),
      path: z.string().describe("The file path relative to session directory"),
      content: z.string().optional().describe("Content to write (for write/append operations)"),
    }),
    execute: async ({ operation, path: filePath, content }: { operation: "read" | "write" | "append"; path: string; content?: string }): Promise<FileOperationResult> => {
      const fullPath = path.join(ctx.workDir, ctx.sessionId, filePath);

      // Security check - ensure path is within session directory
      const resolvedPath = path.resolve(fullPath);
      const sessionDir = path.resolve(path.join(ctx.workDir, ctx.sessionId));
      if (!resolvedPath.startsWith(sessionDir)) {
        return {
          success: false,
          path: filePath,
          error: "Access denied: Path is outside session directory",
        };
      }

      // Add to allowed paths if writing
      if (operation === "write" || operation === "append") {
        ctx.allowedFilePaths.add(resolvedPath);
      }

      try {
        if (operation === "read") {
          const fileContent = await fs.readFile(resolvedPath, "utf-8");
          return {
            success: true,
            path: filePath,
            content: fileContent,
            size: fileContent.length,
          };
        } else if (operation === "write" && content !== undefined) {
          // Normalize newlines: convert literal \n sequences to actual newlines
          // This handles cases where the LLM outputs escaped newlines in the content
          const normalizedContent = content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');
          await fs.writeFile(resolvedPath, normalizedContent, "utf-8");
          return {
            success: true,
            path: filePath,
            size: normalizedContent.length,
          };
        } else if (operation === "append" && content !== undefined) {
          // Normalize newlines for append as well
          const normalizedContent = content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');
          await fs.appendFile(resolvedPath, normalizedContent, "utf-8");
          return {
            success: true,
            path: filePath,
            size: normalizedContent.length,
          };
        } else {
          return {
            success: false,
            path: filePath,
            error: "Invalid operation or missing content",
          };
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          path: filePath,
          error: errorMessage,
        };
      }
    },
  });
}
