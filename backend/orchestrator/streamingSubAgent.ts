import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, stepCountIs } from "ai";
import fs from "fs/promises";
import path from "path";
import Exa from "exa-js";
import { EventEmitter } from "events";
import { getSubAgentPrompt } from "../prompts/subagent.js";
import { createLogger } from "../logger.js";
import { stateManager } from "./stateManager.js";
import { ToolErrors } from "../../shared/types/tools.js";
import {
  createWebSearchTool,
  createFileTool,
  createCodeInterpreterTool,
  createViewImageTool,
  type SubAgentContext,
  type Message,
} from "../tools/subagent/index.js";
import type {
  AgentStatus,
  ToolInput,
  ToolResult,
  ToolErrorInfo,
} from "../../shared/types/index.js";
import type { ExaClient } from "../utils/exaTypes.js";

interface SubAgentConfig {
  id: string;
  sessionId: string;
  task: string;
  resultsFile: string;
  worklogFile: string;
  statusFile: string;
  contextFiles?: string[];
  model?: string;
  summarizerModel?: string;
}

interface SubAgentStatus {
  id: string;
  status: AgentStatus;
  task: string;
  retryCount: number;
  error: string | null;
  timestamp: string;
}


interface ValidationResult {
  valid: boolean;
  reason?: string;
  content_length?: number;
}

export class StreamingSubAgent extends EventEmitter {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly task: string;
  public readonly resultsFile: string;
  public readonly worklogFile: string;
  public readonly statusFile: string;

  private contextFiles: string[];
  private agentDir: string;
  private allowedFilePaths: Set<string>;
  private logger: ReturnType<typeof createLogger>;

  private status: AgentStatus;
  private retryCount: number;
  private error: string | null;

  private messages: Message[];
  private systemPrompt: string;
  private model: string;
  private openrouter: ReturnType<typeof createOpenRouter>;
  private summarizerModel: string;
  private exaClient: ExaClient;

  // Tool call tracking to prevent runaway behavior
  private toolCallCounts: Map<string, number> = new Map();
  private consecutiveToolFailures: Map<string, number> = new Map();

  // Per-tool limits - reasonable limits for focused sub-agent work
  private static readonly TOOL_CALL_LIMITS: Record<string, number> = {
    'view_image': 5,         // View each chart after generating it
    'code_interpreter': 5,   // A few charts with room for retries
    'web_search': 20,        // Focused searching with margin (includes auto-summarization)
    'file': 15,              // Reading/writing
  };

  // Max consecutive failures before blocking a tool
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;

  // Abort controller for cancellation
  private abortController: AbortController;

  constructor(config: SubAgentConfig) {
    super();

    this.id = config.id;
    this.sessionId = config.sessionId;
    this.task = config.task;
    this.resultsFile = config.resultsFile;
    this.worklogFile = config.worklogFile;
    this.statusFile = config.statusFile;
    this.contextFiles = config.contextFiles || [];
    this.logger = createLogger(`SubAgent:${this.id}`, this.sessionId);

    this.agentDir = path.dirname(this.resultsFile);

    this.allowedFilePaths = new Set([
      this.resultsFile,
      this.worklogFile,
      this.statusFile,
      ...this.contextFiles,
    ]);

    this.status = "pending";
    this.retryCount = 0;
    this.error = null;

    this.messages = [];
    this.systemPrompt = getSubAgentPrompt(this.task);

    this.model = config.model ?? "anthropic/claude-haiku-4.5";

    this.openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    this.summarizerModel = config.summarizerModel ?? "google/gemini-2.5-flash";
    this.exaClient = new Exa(process.env.EXASEARCH_API_KEY) as unknown as ExaClient;

    // Initialize abort controller
    this.abortController = new AbortController();

    this.initializeFiles();
  }

  private async initializeFiles(): Promise<void> {
    await fs.writeFile(
      this.worklogFile,
      `# Agent Worklog: ${this.id}\nTask: ${this.task}\nStarted: ${new Date().toISOString()}\n\n`,
      "utf-8"
    );

    await fs.writeFile(
      this.resultsFile,
      `# Results: ${this.task}\n\n*Processing...*\n\n`,
      "utf-8"
    );

    await this.updateStatus();
  }

  /**
   * Check if a tool can be called (hasn't exceeded limits)
   * Returns errorInfo if blocked, null if allowed
   */
  private checkToolCallLimit(toolName: string): ToolErrorInfo | null {
    const limit = StreamingSubAgent.TOOL_CALL_LIMITS[toolName];
    if (!limit) return null; // No limit for this tool

    const currentCount = this.toolCallCounts.get(toolName) || 0;
    if (currentCount >= limit) {
      this.logger.warn(`[${this.id}] Tool ${toolName} has reached call limit (${limit})`);
      return ToolErrors.toolCallLimitReached(toolName, limit);
    }

    // Check consecutive failures
    const consecutiveFailures = this.consecutiveToolFailures.get(toolName) || 0;
    if (consecutiveFailures >= StreamingSubAgent.MAX_CONSECUTIVE_FAILURES) {
      this.logger.warn(`[${this.id}] Tool ${toolName} blocked after ${consecutiveFailures} consecutive failures`);
      return {
        errorCode: 'TOOL_CALL_LIMIT_REACHED',
        message: `${toolName} has failed ${consecutiveFailures} times in a row`,
        suggestedAction: `The ${toolName} tool is not working. Skip this step and proceed with what you have. Write your results now.`,
        canRetry: false,
      };
    }

    return null;
  }

  /**
   * Record a tool call and its success/failure
   */
  private recordToolCall(toolName: string, success: boolean): void {
    // Increment call count
    const currentCount = this.toolCallCounts.get(toolName) || 0;
    this.toolCallCounts.set(toolName, currentCount + 1);

    // Track consecutive failures
    if (success) {
      this.consecutiveToolFailures.set(toolName, 0);
    } else {
      const failures = this.consecutiveToolFailures.get(toolName) || 0;
      this.consecutiveToolFailures.set(toolName, failures + 1);
    }
  }

  /**
   * Get current tool usage stats for debugging
   */
  private getToolUsageStats(): Record<string, { calls: number; consecutiveFailures: number }> {
    const stats: Record<string, { calls: number; consecutiveFailures: number }> = {};
    for (const toolName of Object.keys(StreamingSubAgent.TOOL_CALL_LIMITS)) {
      stats[toolName] = {
        calls: this.toolCallCounts.get(toolName) || 0,
        consecutiveFailures: this.consecutiveToolFailures.get(toolName) || 0,
      };
    }
    return stats;
  }

  private async updateStatus(): Promise<void> {
    const statusData: SubAgentStatus = {
      id: this.id,
      status: this.status,
      task: this.task,
      retryCount: this.retryCount,
      error: this.error,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(this.statusFile, JSON.stringify(statusData, null, 2));
    this.emit("statusUpdate", statusData);
  }

  private async validateResults(): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(this.resultsFile, "utf-8");
      const isPlaceholder = content.includes("*Processing...*");
      const hasMinimalContent = content.trim().split('\n').length <= 3;
      const headerMatch = content.match(/^# Results:.*\n\n/);
      const headerLength = headerMatch ? headerMatch[0].length : 0;
      const actualContentLength = content.length - headerLength;

      if (isPlaceholder && hasMinimalContent) {
        return {
          valid: false,
          reason: "Results file still contains placeholder. Use file tool to write your findings.",
          content_length: actualContentLength
        };
      }

      if (actualContentLength < 100) {
        return {
          valid: false,
          reason: `Results file has only ${actualContentLength} characters of content. Please write detailed findings.`,
          content_length: actualContentLength
        };
      }

      return {
        valid: true,
        content_length: actualContentLength
      };
    } catch (error: any) {
      return {
        valid: false,
        reason: `Error reading results file: ${error.message}`,
        content_length: 0
      };
    }
  }

  public async executeTask(): Promise<void> {
    this.logger.info(`${this.id} [TASK] Starting task execution`);
    this.logger.info(`${this.id} [TASK] Task: ${this.task}`);
    this.logger.debug(`${this.id} [TASK] Agent directory: ${this.agentDir}`);
    this.logger.debug(`${this.id} [TASK] Results file: ${this.resultsFile}`);
    this.logger.debug(`${this.id} [TASK] Worklog file: ${this.worklogFile}`);
    
    this.status = "running";
    await this.updateStatus();

    // Load context files if any
    if (this.contextFiles.length > 0) {
      this.logger.info(`${this.id} [CONTEXT] Loading ${this.contextFiles.length} context files`);
      let contextContent = "\n## Context Files:\n";
      for (const filePath of this.contextFiles) {
        try {
          this.logger.debug(`${this.id} [CONTEXT] Reading: ${filePath}`);
          const content = await fs.readFile(filePath, "utf-8");
          contextContent += `\n### ${path.basename(filePath)}\n${content}\n`;
          this.logger.debug(`${this.id} [CONTEXT] Loaded ${content.length} chars from ${path.basename(filePath)}`);
        } catch (error) {
          this.logger.warn(`${this.id} [CONTEXT] Failed to read context file ${filePath}: ${error}`);
        }
      }
      this.messages.push({
        role: "system",
        content: contextContent
      });
      this.logger.info(`${this.id} [CONTEXT] Added context to messages (${contextContent.length} chars)`);
    } else {
      this.logger.debug(`${this.id} [CONTEXT] No context files provided`);
    }

    // Add task as user message
    this.messages.push({
      role: "user",
      content: `Your task: ${this.task}\n\nImportant: Write your findings to the results file using the file tool.`
    });
    this.logger.debug(`${this.id} [TASK] Initial message count: ${this.messages.length}`);

    while (this.retryCount < 3) {
      try {
        await this.runAgent();

        const validation = await this.validateResults();
        if (!validation.valid) {
          this.logger.warn(`${this.id} validation failed: ${validation.reason}`);

          if (this.retryCount < 2) {
            this.messages.push({
              role: "system",
              content: `VALIDATION FAILED: ${validation.reason}\n\nPlease complete the task and write detailed findings to the results file.`
            });
            this.retryCount++;
            this.logger.info(`${this.id} retrying (attempt ${this.retryCount + 1}/3)`);
            continue;
          }
        }

        this.status = "completed";
        await this.updateStatus();
        
        // Log tool usage stats for debugging
        const stats = this.getToolUsageStats();
        this.logger.debug(`${this.id} [STATS] Tool usage: ${JSON.stringify(stats)}`);
        
        this.logger.success(`${this.id} completed successfully`);
        return;

      } catch (error: any) {
        this.error = error.message;
        this.retryCount++;
        
        // Classify the error for better logging and handling
        const errorMsg = error.message?.toLowerCase() || '';
        const isBadRequest = error.status === 400 || errorMsg.includes('bad request');
        const isRateLimit = error.status === 429 || errorMsg.includes('rate limit') || errorMsg.includes('too many');
        const isServerError = error.status >= 500 || errorMsg.includes('server error');
        const isAuthError = error.status === 401 || error.status === 403 || errorMsg.includes('unauthorized') || errorMsg.includes('forbidden');
        
        if (isBadRequest) {
          this.logger.error(`${this.id} attempt ${this.retryCount} failed with Bad Request: ${error.message}`);
          this.logger.error(`${this.id} This usually means invalid parameters were sent to the API. Check message format.`);
        } else if (isRateLimit) {
          this.logger.warn(`${this.id} attempt ${this.retryCount} hit rate limit. Waiting longer before retry.`);
        } else if (isServerError) {
          this.logger.error(`${this.id} attempt ${this.retryCount} failed due to server error: ${error.message}`);
        } else if (isAuthError) {
          this.logger.error(`${this.id} attempt ${this.retryCount} failed due to authentication error. Check API key.`);
        } else {
          this.logger.error(`${this.id} attempt ${this.retryCount} failed: ${error.message}`);
        }

        if (this.retryCount >= 3) {
          this.status = "failed";
          await this.updateStatus();
          
          // Emit detailed error event
          stateManager.emitEvent(this.sessionId, 'agent_failed', {
            agentId: this.id,
            error: error.message,
            errorType: isBadRequest ? 'bad_request' : isRateLimit ? 'rate_limit' : isServerError ? 'server_error' : isAuthError ? 'auth_error' : 'unknown',
            attempts: this.retryCount,
          });
          
          this.logger.error(`${this.id} failed after 3 attempts`);
          throw error;
        }

        // Exponential backoff with longer wait for rate limits
        const baseDelay = isRateLimit ? 5000 : 2000;
        const delay = baseDelay * Math.pow(2, this.retryCount - 1);
        this.logger.info(`${this.id} waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private async runAgent(): Promise<void> {
    let agentStepNumber = 0;

    this.logger.info(`${this.id} [AGENT] Starting agent run`);
    this.logger.debug(`${this.id} [AGENT] Model: ${this.model}`);
    this.logger.debug(`${this.id} [AGENT] Message count: ${this.messages.length}`);
    this.logger.debug(`${this.id} [AGENT] System prompt length: ${this.systemPrompt.length} chars`);

    // Note: OpenRouter model types don't perfectly align with AI SDK types,
    // so we use type assertion here. This is a known limitation.
    // Ensure messages is never undefined - use non-null assertion since we always have messages
    const messagesToSend: Message[] = this.messages.length > 0
      ? this.messages
      : [{ role: 'user' as const, content: this.task }];

    const result = await streamText({
      model: this.openrouter.chat(this.model) as unknown as Parameters<typeof streamText>[0]['model'],
      system: this.systemPrompt,
      messages: messagesToSend as any,
      tools: this.getTools(),
      stopWhen: stepCountIs(25),
      temperature: 0.7,
      abortSignal: this.abortController.signal,

      onStepFinish: (stepResult) => {
        agentStepNumber++;
        const { toolCalls } = stepResult;

        this.logger.info(`${this.id} [STEP ${agentStepNumber}] Completed with ${toolCalls?.length || 0} tool calls`);

        // Log tool calls for debugging (events are now emitted by tools themselves via onInputAvailable)
        toolCalls?.forEach((call, index) => {
          this.logger.debug(`${this.id} [TOOL ${index + 1}/${toolCalls.length}] ${call.toolName}`);
        });
      },
    });

    let fullResponse = '';
    for await (const textPart of result.textStream) {
      fullResponse += textPart;
    }

    this.messages.push({
      role: "assistant",
      content: fullResponse
    });

    await this.appendToWorklog(`\n## Step ${agentStepNumber} Response\n${fullResponse}\n`);
  }

  /**
   * Create the context object required by tool factory functions
   */
  private createToolContext(): SubAgentContext {
    return {
      id: this.id,
      sessionId: this.sessionId,
      agentDir: this.agentDir,
      resultsFile: this.resultsFile,
      worklogFile: this.worklogFile,
      allowedFilePaths: this.allowedFilePaths,
      logger: this.logger,
      exaClient: this.exaClient,
      openrouter: this.openrouter,
      summarizerModel: this.summarizerModel,
      messages: this.messages,
      checkToolCallLimit: this.checkToolCallLimit.bind(this),
      recordToolCall: this.recordToolCall.bind(this),
      appendToWorklog: this.appendToWorklog.bind(this),

      // Tool lifecycle events - emit when tools start and end for real-time UI
      emitToolStart: (toolCallId: string, toolName: string, input: Record<string, unknown>, description?: string) => {
        stateManager.addToolCall(this.sessionId, this.id, toolName, {
          input: { toolName, ...input } as ToolInput,
          stepNumber: 1,
          indexInStep: 0,
          description,
          externalId: toolCallId, // Use AI SDK's toolCallId
        });
      },
      emitToolEnd: (toolCallId: string, result: unknown, success: boolean) => {
        stateManager.updateToolCall(
          this.sessionId,
          this.id,
          toolCallId,
          result as ToolResult,
          success ? 'completed' : 'failed'
        );
      },
    };
  }

  private getTools() {
    const ctx = this.createToolContext();
    return {
      web_search: createWebSearchTool(ctx),
      file: createFileTool(ctx),
      code_interpreter: createCodeInterpreterTool(ctx),
      view_image: createViewImageTool(ctx),
    };
  }

  private async appendToWorklog(content: string): Promise<void> {
    await fs.appendFile(this.worklogFile, content, "utf-8");
  }

  public async getStatus(): Promise<SubAgentStatus> {
    try {
      const statusData = await fs.readFile(this.statusFile, "utf-8");
      return JSON.parse(statusData);
    } catch {
      return {
        id: this.id,
        status: this.status,
        task: this.task,
        retryCount: this.retryCount,
        error: this.error,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async getProgress(): Promise<string> {
    try {
      const worklog = await fs.readFile(this.worklogFile, "utf-8");
      const steps = (worklog.match(/## Step \d+/g) || []).length;
      const searches = (worklog.match(/### Web Search:/g) || []).length;
      const files = (worklog.match(/wrote \d+ chars to results/g) || []).length;

      return `Steps: ${steps}, Searches: ${searches}, Files written: ${files}`;
    } catch {
      return "Starting...";
    }
  }

  /**
   * Abort this agent's execution
   */
  public abort(): void {
    this.logger.info(`[${this.id}] Aborting agent`);
    this.abortController.abort();
    this.status = 'failed';
    this.error = 'Agent aborted - user disconnected';
  }
}