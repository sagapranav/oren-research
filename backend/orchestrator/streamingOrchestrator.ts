import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, stepCountIs } from "ai";
import fs from "fs/promises";
import path from "path";
import { StreamingSubAgent } from "./streamingSubAgent.js";
import { getOrchestratorPrompt } from "../prompts/orchestrator.js";
import { createLogger } from "../logger.js";
import { stateManager } from "./stateManager.js";
import { logResearchSession, scheduleSessionCleanup } from "../utils/researchLog.js";
import {
  createSpawnAgentTool,
  createWaitForAgentsTool,
  createGetAgentResultTool,
  createUpdatePlanTool,
  createGeneratePlanTool,
  createWriteReportTool,
  createFileTool,
  type OrchestratorContext,
} from "../tools/orchestrator/index.js";
import type {
  PlanStep,
  ToolInput,
  ToolResult,
} from "../../shared/types/index.js";

export interface ApiKeys {
  openRouter: string;
  e2b: string;
  exa: string;
}

interface OrchestratorConfig {
  sessionId: string;
  model?: string;
  subagentModel?: string;
  reportWritingModel?: string;
  summarizerModel?: string;
  planningModel?: string;
  workDir?: string;
  clarificationContext?: string;
  apiKeys?: ApiKeys;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export class StreamingOrchestrator {
  private sessionId: string;
  private model: string;
  private subagentModel: string;
  private reportWritingModel: string;
  private summarizerModel: string;
  private planningModel: string;
  private messages: Message[];
  private systemPrompt: string;
  private clarificationContext: string;
  private strategicPerspective: string;
  private workDir: string;
  private query: string | null;
  private openrouter: ReturnType<typeof createOpenRouter>;
  private logger: ReturnType<typeof createLogger>;

  // Agent tracking
  private agents: Map<string, StreamingSubAgent>;
  private agentCounter: number;

  // Agent coordination
  private runningAgents: Set<string>;
  private completedAgents: Set<string>;
  private failedAgents: Set<string>;

  // Plan tracking
  private planSteps: Map<string, PlanStep>;
  private stepCounter: number;

  // File paths
  private planFile: string;
  private worklogFile: string;
  private allowedFilePaths: Set<string>;

  // Limits to prevent runaway behavior
  private static readonly MAX_AGENTS = 10;

  // Abort controller for cancellation
  private abortController: AbortController;

  constructor(config: OrchestratorConfig) {
    // Initialize abort controller
    this.abortController = new AbortController();
    // Core properties
    this.sessionId = config.sessionId;
    this.logger = createLogger("StreamingOrchestrator", this.sessionId);
    this.model = config.model || "anthropic/claude-haiku-4.5";
    this.subagentModel = config.subagentModel || "anthropic/claude-haiku-4.5";
    this.reportWritingModel = config.reportWritingModel || "anthropic/claude-haiku-4.5";
    this.summarizerModel = config.summarizerModel || "google/gemini-2.5-flash";
    this.planningModel = config.planningModel || "anthropic/claude-opus-4.5";
    this.messages = [];
    this.systemPrompt = getOrchestratorPrompt();
    this.clarificationContext = config.clarificationContext || "";
    this.strategicPerspective = ""; // Will be set by generate_plan tool
    this.workDir = config.workDir || "./reports";
    this.query = null;

    // Set API keys from config (allows per-request keys from frontend)
    // These override env vars for this session
    if (config.apiKeys) {
      process.env.OPENROUTER_API_KEY = config.apiKeys.openRouter;
      process.env.E2B_API_KEY = config.apiKeys.e2b;
      process.env.EXASEARCH_API_KEY = config.apiKeys.exa;
    }

    // Initialize OpenRouter with the (potentially overridden) key
    this.openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    // Track spawned agents
    this.agents = new Map();
    this.agentCounter = 0;

    // Agent coordination
    this.runningAgents = new Set();
    this.completedAgents = new Set();
    this.failedAgents = new Set();

    // Plan tracking
    this.planSteps = new Map();
    this.stepCounter = 0;

    // Files
    const sessionDir = path.join(this.workDir, this.sessionId);
    this.planFile = path.join(sessionDir, "orchestrator_plan.json");
    this.worklogFile = path.join(sessionDir, "orchestrator_worklog.md");

    // Allowed file paths
    this.allowedFilePaths = new Set([
      this.planFile,
      this.worklogFile,
      path.join(sessionDir, "final_report.md"),
    ]);

    this.initializeWorkspace();
  }

  async initializeWorkspace(): Promise<void> {
    const sessionPath = path.join(this.workDir, this.sessionId);
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.mkdir(path.join(sessionPath, "agents"), { recursive: true });
    // Create shared artifacts folder for collecting agent outputs
    await fs.mkdir(path.join(sessionPath, "artifacts"), { recursive: true });

    await fs.writeFile(
      this.worklogFile,
      `# Orchestrator Worklog\nSession: ${this.sessionId}\nStarted: ${new Date().toISOString()}\n\n`,
      "utf-8"
    );

    const initialPlan = {
      session_id: this.sessionId,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      query: null,
      steps: []
    };
    await fs.writeFile(this.planFile, JSON.stringify(initialPlan, null, 2), "utf-8");
  }

  /**
   * List artifacts for a specific agent
   */
  private async listAgentArtifacts(agentId: string): Promise<string[]> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return [];
    }

    const artifacts: string[] = [];
    const agentDir = path.dirname(agent.resultsFile);
    const chartsDir = path.join(agentDir, "charts");

    try {
      // Check charts directory
      const chartsDirExists = await fs.access(chartsDir).then(() => true).catch(() => false);
      if (chartsDirExists) {
        const files = await fs.readdir(chartsDir);
        const imageFiles = files.filter(f => 
          ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(path.extname(f).toLowerCase())
        );
        artifacts.push(...imageFiles.map(f => `charts/${f}`));
      }

      // Check agent directory for direct images
      const agentFiles = await fs.readdir(agentDir);
      const directImages = agentFiles.filter(f => 
        ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(path.extname(f).toLowerCase())
      );
      artifacts.push(...directImages);
    } catch (error) {
      this.logger.warn(`Error listing artifacts for ${agentId}: ${error}`);
    }

    return artifacts;
  }

  /**
   * Main entry point - generate report with streaming
   */
  async generateReport(query: string): Promise<string> {
    this.query = query;
    this.logger.info(`[ORCHESTRATOR] Starting report generation`);
    this.logger.info(`[ORCHESTRATOR] Query: "${query}"`);
    this.logger.debug(`[ORCHESTRATOR] Session ID: ${this.sessionId}`);
    this.logger.debug(`[ORCHESTRATOR] Model: ${this.model}`);
    this.logger.debug(`[ORCHESTRATOR] Work directory: ${this.workDir}`);
    this.logger.debug(`[ORCHESTRATOR] System prompt length: ${this.systemPrompt.length} chars`);

    stateManager.updateSessionStatus(this.sessionId, 'planning');

    // Add initial user message
    this.messages.push({ role: "user", content: query });
    this.logger.debug(`[ORCHESTRATOR] Initial messages: ${this.messages.length}`);

    try {
      // Track step number manually since AI SDK doesn't provide it
      let orchestratorStepNumber = 0;
      let hasExecutedSteps = false;

      this.logger.info(`[ORCHESTRATOR] Calling streamText with model: ${this.model}`);

      // Note: OpenRouter model types don't perfectly align with AI SDK types,
      // so we use type assertion here. This is a known limitation.
      // Clarification context is now passed through the generate_plan tool
      // which uses Opus 4.5 for strategic planning

      // Track tool calls that have been added via onChunk to avoid duplicates
      const toolCallsAddedByChunk = new Set<string>();

      const result = await streamText({
        model: this.openrouter.chat(this.model) as unknown as Parameters<typeof streamText>[0]['model'],
        system: this.systemPrompt,
        messages: this.messages,
        tools: this.getTools(),
        stopWhen: stepCountIs(100),
        abortSignal: this.abortController.signal,

        // Callback for streaming chunks - detect tool calls as they start
        onChunk: ({ chunk }) => {
          if (chunk.type === 'tool-input-start') {
            this.logger.info(`[ORCHESTRATOR] Tool starting: ${chunk.toolName} (${chunk.id})`);

            // Add tool call immediately with 'executing' status
            const toolInput = {
              toolName: chunk.toolName,
            } as ToolInput;

            stateManager.addToolCall(
              this.sessionId,
              'orchestrator',
              chunk.toolName,
              {
                input: toolInput,
                stepNumber: orchestratorStepNumber + 1, // Will be next step
                indexInStep: 0,
                externalId: chunk.id // Use the AI SDK's tool call id
              }
            );

            // Track that we added this tool call
            toolCallsAddedByChunk.add(chunk.id);
          }
        },

        // Callback for each step
        onStepFinish: (stepResult) => {
          hasExecutedSteps = true;
          orchestratorStepNumber++;
          const { toolCalls, toolResults } = stepResult;

          this.logger.info(`\n${'='.repeat(60)}`);
          this.logger.info(`ORCHESTRATOR Step ${orchestratorStepNumber} finished: ${toolCalls?.length || 0} tool calls`);
          this.logger.info(`${'='.repeat(60)}`);

          // Emit orchestrator step event - map input to args for compatibility
          if (toolCalls && toolCalls.length > 0) {
            const mappedCalls = toolCalls.map(tc => ({
              toolName: tc.toolName,
              args: (tc.input || {}) as Record<string, unknown>
            }));
            stateManager.addOrchestratorStep(this.sessionId, orchestratorStepNumber, mappedCalls);
          }

          // Track orchestrator tool calls in the orchestrator agent's timeline
          toolCalls?.forEach((call, index) => {
            const callInput = (call.input || {}) as Record<string, unknown>;
            this.logger.info(`  - ${call.toolName}(${JSON.stringify(callInput).substring(0, 100)})`);

            // Check if this tool call was already added via onChunk
            const alreadyAdded = toolCallsAddedByChunk.has(call.toolCallId);
            let toolCallId: string | undefined;

            if (alreadyAdded) {
              // Tool was already added with 'executing' status - use the same ID
              toolCallId = call.toolCallId;
              this.logger.debug(`  Tool ${call.toolName} already tracked via onChunk, updating result`);
            } else {
              // Build properly typed tool input
              const toolInput = {
                toolName: call.toolName,
                ...callInput
              } as ToolInput;

              // Add tool call to orchestrator agent
              toolCallId = stateManager.addToolCall(
                this.sessionId,
                'orchestrator',
                call.toolName,
                {
                  input: toolInput,
                  stepNumber: orchestratorStepNumber,
                  indexInStep: index,
                  externalId: call.toolCallId
                }
              );
            }

            // Find corresponding result - AI SDK provides toolCallId on the call object
            const typedToolResults = toolResults as Array<{ toolCallId?: string; result?: unknown }> | undefined;
            const toolResult = typedToolResults?.find((r) =>
              r.toolCallId === call.toolCallId
            );

            if (toolResult?.result && toolCallId) {
              stateManager.updateToolCall(
                this.sessionId,
                'orchestrator',
                toolCallId,
                toolResult.result as ToolResult,
                'completed'
              );
            }
          });

          this.logger.info(`${'='.repeat(60)}\n`);
        },
      });

      // Consume the stream
      let fullText = '';
      try {
        for await (const textPart of result.textStream) {
          fullText += textPart;
        }
      } catch (streamError: unknown) {
        const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown stream error';
        this.logger.error(`Error consuming text stream: ${errorMessage}`);
        throw streamError;
      }

      // Validate that work was actually done
      if (!hasExecutedSteps && orchestratorStepNumber === 0) {
        const errorMsg = 'Orchestrator completed without executing any steps or making tool calls. This usually indicates an API error or model configuration issue.';
        this.logger.error(errorMsg);
        this.logger.error(`Full text received: ${fullText.substring(0, 200)}`);
        stateManager.updateSessionStatus(this.sessionId, 'failed');
        stateManager.emitEvent(this.sessionId, 'error', {
          source: 'orchestrator',
          error: `${errorMsg} No steps executed. Received text length: ${fullText.length}`
        });
        throw new Error(errorMsg);
      }

      // Add assistant response to history
      this.messages.push({ role: "assistant", content: fullText });

      this.logger.success("Report generation complete");
      this.logger.info(`Steps executed: ${orchestratorStepNumber}`);
      this.logger.info(`Agents spawned: ${this.agents.size}`);
      this.logger.info(`Completed agents: ${this.completedAgents.size}`);

      stateManager.updateSessionStatus(this.sessionId, 'completed');

      // Log research session metadata (persisted) and schedule folder cleanup
      const completedAt = new Date().toISOString();
      const session = stateManager.getSession(this.sessionId);

      await logResearchSession(this.workDir, {
        sessionId: this.sessionId,
        query: this.query || '',
        clarificationContext: this.clarificationContext || null,
        models: {
          orchestrator: this.model,
          planning: this.planningModel,
          searchSummarisation: this.summarizerModel,
          reportWriting: this.reportWritingModel,
          subagent: this.subagentModel,
        },
        createdAt: session?.createdAt || completedAt,
        completedAt,
      });

      // Schedule folder deletion (production only, 10 min default - files no longer needed after report is sent)
      scheduleSessionCleanup(this.workDir, this.sessionId);

      return fullText;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Report generation failed: ${errorMessage}`);
      stateManager.updateSessionStatus(this.sessionId, 'failed');
      stateManager.emitEvent(this.sessionId, 'error', {
        source: 'orchestrator',
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * Abort the orchestrator and all running agents
   * Called when user disconnects (closes tab, navigates away)
   */
  abort(): void {
    this.logger.info('[ORCHESTRATOR] Aborting - user disconnected');
    this.abortController.abort();

    // Also abort any running sub-agents
    for (const [agentId, agent] of this.agents) {
      if (this.runningAgents.has(agentId)) {
        this.logger.info(`[ORCHESTRATOR] Aborting agent: ${agentId}`);
        agent.abort();
      }
    }

    stateManager.updateSessionStatus(this.sessionId, 'failed');
    stateManager.emitEvent(this.sessionId, 'error', {
      source: 'orchestrator',
      error: 'Research cancelled - user disconnected'
    });
  }

  /**
   * Create context object for tools
   */
  private createToolContext(): OrchestratorContext {
    return {
      sessionId: this.sessionId,
      workDir: this.workDir,
      model: this.model,
      subagentModel: this.subagentModel,
      reportWritingModel: this.reportWritingModel,
      summarizerModel: this.summarizerModel,
      planningModel: this.planningModel,
      query: this.query,
      clarificationContext: this.clarificationContext || null,
      strategicPerspective: this.strategicPerspective,
      agents: this.agents,
      agentCounter: this.agentCounter,
      runningAgents: this.runningAgents,
      completedAgents: this.completedAgents,
      failedAgents: this.failedAgents,
      maxAgents: StreamingOrchestrator.MAX_AGENTS,
      planFile: this.planFile,
      planSteps: this.planSteps,
      stepCounter: this.stepCounter,
      allowedFilePaths: this.allowedFilePaths,
      logger: this.logger,
      incrementAgentCounter: () => ++this.agentCounter,
      incrementStepCounter: () => ++this.stepCounter,
      listAgentArtifacts: (agentId: string) => this.listAgentArtifacts(agentId),
    };
  }

  /**
   * Define orchestrator tools using factory functions
   */
  private getTools() {
    const ctx = this.createToolContext();

    return {
      generate_plan: createGeneratePlanTool(ctx),
      spawn_agent: createSpawnAgentTool(ctx),
      wait_for_agents: createWaitForAgentsTool(ctx),
      get_agent_result: createGetAgentResultTool(ctx),
      write_report: createWriteReportTool(ctx),
      update_plan: createUpdatePlanTool(ctx),
      file: createFileTool(ctx),
    };
  }

}