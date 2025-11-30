/**
 * file tool - Read/write files in agent workspace
 */

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { FileOperationResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { SubAgentContext } from './types.js';

// Allowed file names for subagent writes
const ALLOWED_FILES = new Set(['results.md', 'worklog.md']);

export function createFileTool(ctx: SubAgentContext) {
  return tool({
    description: "Read or write to your worklog (thinking/notes) or results (final findings). You can ONLY write to 'worklog.md' or 'results.md' - no other files.",
    inputSchema: z.object({
      operation: z.enum(["read", "write", "append"]),
      path: z.enum(["results.md", "worklog.md"]).describe("File to operate on: 'worklog.md' for notes/thinking, 'results.md' for final findings"),
      content: z.string().optional().describe("Content for write/append operations"),
      description: z.string().describe("A brief 5-6 word summary of the file operation for UI display (e.g., 'Writing final analysis results')"),
    }),

    execute: async ({ operation, path: filePath, content, description: inputDescription }, { toolCallId }): Promise<FileOperationResult> => {
      // Emit tool start event
      const description = inputDescription ||
        (operation === 'write' ? 'Taking notes' : operation === 'read' ? 'Reading notes' : 'File operation');
      ctx.emitToolStart(toolCallId, 'file', { operation, path: filePath, content } as Record<string, unknown>, description);
      // Helper to emit end event and return result
      const emitAndReturn = (result: FileOperationResult): FileOperationResult => {
        ctx.emitToolEnd(toolCallId, result, result.success);
        return result;
      };

      // Validate file path - only allow results.md and worklog.md
      const fileName = path.basename(filePath);
      if (!ALLOWED_FILES.has(fileName)) {
        ctx.logger.warn(`[FILE] Rejected write to unauthorized file: ${filePath}`);
        return emitAndReturn({
          success: false,
          path: filePath,
          error: `You can only write to 'worklog.md' (for notes/thinking) or 'results.md' (for final findings). Put your content in the appropriate file.`,
          errorInfo: ToolErrors.fileAccessDenied(filePath),
        });
      }

      // Check tool call limits
      const limitError = ctx.checkToolCallLimit('file');
      if (limitError) {
        return emitAndReturn({
          success: false,
          path: filePath,
          error: limitError.message,
          errorInfo: limitError,
        });
      }

      const fullPath = filePath.startsWith('/')
        ? filePath
        : path.join(ctx.agentDir, filePath);

      // Helper to normalize newlines (convert literal \n to actual newlines)
      const normalizeContent = (text: string) => text
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');

      // Special handling for results file
      if (fullPath === ctx.resultsFile || filePath === "results.md") {
        if (operation === "write" && content) {
          const normalizedContent = normalizeContent(content);
          await fs.writeFile(ctx.resultsFile, normalizedContent, "utf-8");
          ctx.logger.info(`${ctx.id} wrote ${normalizedContent.length} chars to results`);
          return emitAndReturn({
            success: true,
            path: "results.md",
            size: normalizedContent.length
          });
        } else if (operation === "append" && content) {
          const normalizedContent = normalizeContent(content);
          await fs.appendFile(ctx.resultsFile, normalizedContent, "utf-8");
          return emitAndReturn({
            success: true,
            path: "results.md",
            size: normalizedContent.length
          });
        } else if (operation === "read") {
          const existingContent = await fs.readFile(ctx.resultsFile, "utf-8");
          return emitAndReturn({
            success: true,
            path: "results.md",
            content: existingContent,
            size: existingContent.length
          });
        }
      }

      // Check if path is allowed
      if (!ctx.allowedFilePaths.has(fullPath)) {
        const resolvedPath = path.resolve(fullPath);
        const agentDirResolved = path.resolve(ctx.agentDir);

        if (!resolvedPath.startsWith(agentDirResolved)) {
          ctx.recordToolCall('file', false);
          return emitAndReturn({
            success: false,
            path: filePath,
            error: "Access denied: Path is outside agent directory",
            errorInfo: ToolErrors.fileAccessDenied(filePath),
          });
        }
        ctx.allowedFilePaths.add(fullPath);
      }

      try {
        if (operation === "read") {
          const fileContent = await fs.readFile(fullPath, "utf-8");
          return emitAndReturn({
            success: true,
            path: filePath,
            content: fileContent,
            size: fileContent.length
          });
        } else if (operation === "write" && content !== undefined) {
          const normalizedContent = normalizeContent(content);
          await fs.writeFile(fullPath, normalizedContent, "utf-8");
          return emitAndReturn({
            success: true,
            path: filePath,
            size: normalizedContent.length
          });
        } else if (operation === "append" && content !== undefined) {
          const normalizedContent = normalizeContent(content);
          await fs.appendFile(fullPath, normalizedContent, "utf-8");
          return emitAndReturn({
            success: true,
            path: filePath,
            size: normalizedContent.length
          });
        } else {
          ctx.recordToolCall('file', false);
          return emitAndReturn({
            success: false,
            path: filePath,
            error: "Invalid operation or missing content",
            errorInfo: ToolErrors.validationFailed('Write/append operations require content parameter'),
          });
        }
      } catch (error: any) {
        ctx.recordToolCall('file', false);
        const isNotFound = error.code === 'ENOENT';
        return emitAndReturn({
          success: false,
          path: filePath,
          error: error.message,
          errorInfo: isNotFound
            ? ToolErrors.fileNotFound(filePath)
            : ToolErrors.unknownError(error.message),
        });
      }
    },
  });
}
