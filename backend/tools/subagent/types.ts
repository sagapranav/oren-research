/**
 * Types for subagent tool context
 * Tools receive this context to access subagent state and methods
 */

import type { createLogger } from '../../logger.js';
import type { ToolErrorInfo } from '../../../shared/types/index.js';
import type { ExaClient } from '../../utils/exaTypes.js';
import type { createOpenRouter } from '@openrouter/ai-sdk-provider';

// AI SDK multimodal content types
export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; image: string };
export type MessageContent = string | Array<TextContent | ImageContent>;

export interface Message {
  role: "user" | "assistant" | "system";
  content: MessageContent;
}

export interface SubAgentContext {
  // Agent info
  id: string;
  sessionId: string;
  agentDir: string;
  resultsFile: string;
  worklogFile: string;

  // File access
  allowedFilePaths: Set<string>;

  // Logger
  logger: ReturnType<typeof createLogger>;

  // External services
  exaClient: ExaClient;
  openrouter: ReturnType<typeof createOpenRouter>;
  summarizerModel: string;

  // Messages (for viewImage to add images to context)
  messages: Message[];

  // Methods
  checkToolCallLimit: (toolName: string) => ToolErrorInfo | null;
  recordToolCall: (toolName: string, success: boolean) => void;
  appendToWorklog: (content: string) => Promise<void>;

  // Tool lifecycle events for real-time UI updates
  emitToolStart: (toolCallId: string, toolName: string, input: Record<string, unknown>, description?: string) => void;
  emitToolEnd: (toolCallId: string, result: unknown, success: boolean) => void;
}
