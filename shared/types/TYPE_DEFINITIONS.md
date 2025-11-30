# Type Definitions

This document contains all type definitions from the `oren-flash/shared/types` folder.

---

## index.ts

```typescript
/**
 * Main entry point for all shared types
 * This file re-exports all types for easy importing
 */

// Core types
export * from './core';

// Tool types
export * from './tools';

// Event types
export * from './events';

// API types
export * from './api';

// ============================================
// Convenience Type Aliases
// ============================================

// Re-export commonly used types at the top level for convenience
export type {
  // Core
  Session,
  SessionStatus,
  AgentState,
  AgentType,
  AgentStatus,
  ToolCall,
  ToolStatus,
  PlanStep,
  Plan,
  Progress,
  ToolInput,
  ToolResult,
  FlowNode,
  FlowEdge,
  FlowData,
} from './core';

export type {
  // Events
  SSEEvent,
  EventHandler,
} from './events';

export type {
  // API
  CreateReportRequest,
  CreateReportResponse,
  SessionStatusResponse,
  ReportResponse,
  ErrorResponse,
} from './api';

// ============================================
// Version Information
// ============================================

export const TYPES_VERSION = '1.0.0';

// ============================================
// Constants
// ============================================

export const AGENT_TYPES = [
  'orchestrator',
  'researcher',
  'planner',
  'analyst',
  'critic',
  'code',
  'general',
] as const;

export const SESSION_STATUSES = [
  'idle',
  'initializing',
  'planning',
  'executing',
  'completed',
  'failed',
] as const;

export const AGENT_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'retrying',
] as const;

export const TOOL_STATUSES = [
  'executing',
  'completed',
  'failed',
] as const;

export const EVENT_TYPES = [
  'connected',
  'session_status_change',
  'agent_spawned',
  'agent_status_change',
  'orchestrator_step',
  'tool_call',
  'tool_result',
  'plan_update',
  'error',
] as const;
```

---

## core.ts

```typescript
/**
 * Core data types shared between frontend and backend
 * These types represent the fundamental entities in the multi-agent research system
 */

import type {
  SpawnAgentInput,
  CheckAgentStatusInput,
  GetAgentResultInput,
  WebSearchInput,
  FileOperationInput,
  SummarizeContentInput,
  UpdatePlanInput,
  CodeInterpreterInput,
  ViewImageInput,
  SpawnAgentResult,
  CheckAgentStatusResult,
  GetAgentResultResult,
  WebSearchResult,
  FileOperationResult,
  SummarizeContentResult,
  UpdatePlanResult,
  CodeInterpreterResult,
  ViewImageResult,
} from './tools';

// ============================================
// Session Types
// ============================================

export interface Session {
  sessionId: string;
  query: string;
  status: SessionStatus;
  orchestrator: OrchestratorState;
  agents: Map<string, AgentState>;
  planSteps: Map<string, PlanStep>;
  events: Event[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export type SessionStatus =
  | 'idle'
  | 'initializing'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed';

export interface OrchestratorState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  currentStep: number;
  totalSteps: number;
}

// ============================================
// Agent Types
// ============================================

export type AgentType =
  | 'orchestrator'
  | 'researcher'
  | 'planner'
  | 'analyst'
  | 'critic'
  | 'code'
  | 'general';

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying';

export interface AgentState {
  id: string;
  task: string;
  type: AgentType;
  status: AgentStatus;
  description?: string; // Brief 5-6 word summary for UI display (e.g., "Analyzing market trends")
  toolCalls: ToolCall[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  lastActivityAt: string; // ISO timestamp
  error?: string; // Error message if status is 'failed'
  retryCount?: number;
}

// ============================================
// Tool Types
// ============================================

export type ToolStatus =
  | 'executing'
  | 'completed'
  | 'failed';

export interface ToolCall {
  id: string;
  toolName: string;
  status: ToolStatus;
  input: ToolInput;
  result?: ToolResult;
  createdAt: string; // ISO timestamp
  startedAt: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  duration?: number; // Duration in milliseconds
  stepNumber: number; // Which orchestrator step this tool belongs to
  indexInStep: number; // Index within the step (for parallel tools)
  description?: string; // Brief 5-6 word summary for UI display
}

// Tool inputs will be properly typed based on tool name
export type ToolInput =
  | SpawnAgentInput
  | CheckAgentStatusInput
  | GetAgentResultInput
  | WebSearchInput
  | FileOperationInput
  | SummarizeContentInput
  | UpdatePlanInput
  | CodeInterpreterInput
  | ViewImageInput;

// Tool results will be properly typed based on tool name
export type ToolResult =
  | SpawnAgentResult
  | CheckAgentStatusResult
  | GetAgentResultResult
  | WebSearchResult
  | FileOperationResult
  | SummarizeContentResult
  | UpdatePlanResult
  | CodeInterpreterResult
  | ViewImageResult;

// ============================================
// Plan Types
// ============================================

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  agent_ids: string[]; // IDs of agents assigned to this step
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
  order?: number; // Execution order
}

export interface Plan {
  session_id: string;
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
  query: string;
  steps: PlanStep[];
}

// ============================================
// Event Types (Base - will be extended with discriminated unions)
// ============================================

export interface BaseEvent {
  type: string;
  timestamp: string; // ISO timestamp
}

// This will be replaced with a discriminated union in events.ts
export interface Event extends BaseEvent {
  data: any; // Will be properly typed in events.ts
}

// ============================================
// Progress Types
// ============================================

export interface Progress {
  current: number;
  total: number;
}

// ============================================
// Flow Visualization Types
// ============================================

export interface FlowNode {
  id: string;
  type: 'orchestrator' | 'agent' | 'tool';
  label: string;
  status: string;
  data: Record<string, any>;
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: 'initial' | 'sequential' | 'join';
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ============================================
// Error Types
// ============================================

export interface ApiError {
  error: string;
  message: string;
  stack?: string; // Only in development
}
```

---

## api.ts

```typescript
/**
 * API Request and Response type definitions
 * These types define the contracts between frontend and backend
 */

import type {
  SessionStatus,
  AgentState,
  PlanStep,
  OrchestratorState,
  ApiError,
  FlowData,
} from './core';

// ============================================
// POST /api/report
// ============================================

export interface CreateReportRequest {
  query: string;
}

export interface CreateReportResponse {
  sessionId: string;
  status: SessionStatus;
  query: string;
  streamUrl: string;
  statusUrl: string;
}

// ============================================
// GET /api/status/:sessionId
// ============================================

export interface SessionStatusResponse {
  sessionId: string;
  query: string;
  status: SessionStatus;
  orchestrator: OrchestratorState;
  agents: AgentState[]; // Array instead of Map for JSON serialization
  planSteps: PlanStep[]; // Array instead of Map for JSON serialization
  flowData?: {
    nodes: any[]; // Can be removed if flow visualization is not used
    edges: any[];
  };
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// GET /api/flow/:sessionId
// ============================================

export type FlowDataResponse = FlowData;

// ============================================
// GET /api/report/:sessionId
// ============================================

export interface ReportResponse {
  report: string; // Markdown content
}

// ============================================
// GET /api/health
// ============================================

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  sessions: number;
  version?: string;
}

// ============================================
// Error Responses
// ============================================

export interface ErrorResponse extends ApiError {
  status?: number;
  path?: string;
}

// ============================================
// SSE Stream Response
// ============================================

// SSE doesn't have a traditional response type, but we can define the connection info
export interface StreamConnectionInfo {
  url: string;
  sessionId: string;
  connected: boolean;
}

// ============================================
// Type Guards for API Responses
// ============================================

export function isCreateReportResponse(response: any): response is CreateReportResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'sessionId' in response &&
    'status' in response &&
    'query' in response &&
    'streamUrl' in response &&
    'statusUrl' in response
  );
}

export function isSessionStatusResponse(response: any): response is SessionStatusResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'sessionId' in response &&
    'query' in response &&
    'status' in response &&
    'orchestrator' in response &&
    'agents' in response
  );
}

export function isReportResponse(response: any): response is ReportResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'report' in response &&
    typeof response.report === 'string'
  );
}

export function isErrorResponse(response: any): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    'message' in response
  );
}

// ============================================
// API Client Types
// ============================================

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ApiClient {
  createReport(query: string): Promise<CreateReportResponse>;
  getSessionStatus(sessionId: string): Promise<SessionStatusResponse>;
  getFlowData(sessionId: string): Promise<FlowDataResponse>;
  getReport(sessionId: string): Promise<ReportResponse>;
  checkHealth(): Promise<HealthResponse>;
}

// ============================================
// Fetch Options
// ============================================

export interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}
```

---

## events.ts

```typescript
/**
 * Server-Sent Events (SSE) type definitions
 * Discriminated unions for type-safe event handling
 */

import type { AgentStatus, AgentType, SessionStatus } from './core';
import type { ToolInput, ToolResult } from './tools';

// ============================================
// Event Data Types
// ============================================

export interface SessionStatusChangeData {
  status: SessionStatus;
}

export interface AgentSpawnedData {
  agentId: string;
  task: string;
  type: AgentType;
  description?: string; // Brief 5-6 word summary for UI display
}

export interface AgentStatusChangeData {
  agentId: string;
  status: AgentStatus;
  error?: string;
  retryCount?: number;
}

export interface OrchestratorStepData {
  stepNumber: number;
  toolCalls: Array<{
    toolName: string;
    input: ToolInput;
  }>;
}

export interface ToolCallData {
  agentId: string;
  toolCallId: string;
  toolName: string;
  input: ToolInput;
  stepNumber: number;
  indexInStep: number;
  startedAt: string;
  description?: string; // Brief description for UI display
}

export interface ToolResultData {
  agentId: string;
  toolCallId: string;
  toolName: string;
  status: 'completed' | 'failed';
  result?: ToolResult;
  startedAt: string;
  completedAt: string;
  duration: number; // milliseconds
  stepNumber: number;
  indexInStep: number;
}

export interface PlanUpdateData {
  steps: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    agent_ids: string[];
  }>;
  totalSteps: number;
}

export interface ErrorData {
  source: 'orchestrator' | 'agent' | 'system';
  error: string;
  stack?: string;
  agentId?: string;
}

export interface AgentFailedData {
  agentId: string;
  error: string;
  errorType: 'bad_request' | 'rate_limit' | 'server_error' | 'auth_error' | 'unknown';
  attempts: number;
}

export interface ConnectionData {
  sessionId: string;
}

// ============================================
// Discriminated Union for Events
// ============================================

export type SSEEvent =
  | {
      type: 'connected';
      data: ConnectionData;
      timestamp: string;
    }
  | {
      type: 'session_status_change';
      data: SessionStatusChangeData;
      timestamp: string;
    }
  | {
      type: 'agent_spawned';
      data: AgentSpawnedData;
      timestamp: string;
    }
  | {
      type: 'agent_status_change';
      data: AgentStatusChangeData;
      timestamp: string;
    }
  | {
      type: 'orchestrator_step';
      data: OrchestratorStepData;
      timestamp: string;
    }
  | {
      type: 'tool_call';
      data: ToolCallData;
      timestamp: string;
    }
  | {
      type: 'tool_result';
      data: ToolResultData;
      timestamp: string;
    }
  | {
      type: 'plan_update';
      data: PlanUpdateData;
      timestamp: string;
    }
  | {
      type: 'error';
      data: ErrorData;
      timestamp: string;
    }
  | {
      type: 'agent_failed';
      data: AgentFailedData;
      timestamp: string;
    };

// ============================================
// Type Guards for Events
// ============================================

export function isConnectionEvent(event: SSEEvent): event is Extract<SSEEvent, { type: 'connected' }> {
  return event.type === 'connected';
}

export function isSessionStatusChangeEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'session_status_change' }> {
  return event.type === 'session_status_change';
}

export function isAgentSpawnedEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'agent_spawned' }> {
  return event.type === 'agent_spawned';
}

export function isAgentStatusChangeEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'agent_status_change' }> {
  return event.type === 'agent_status_change';
}

export function isOrchestratorStepEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'orchestrator_step' }> {
  return event.type === 'orchestrator_step';
}

export function isToolCallEvent(event: SSEEvent): event is Extract<SSEEvent, { type: 'tool_call' }> {
  return event.type === 'tool_call';
}

export function isToolResultEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'tool_result' }> {
  return event.type === 'tool_result';
}

export function isPlanUpdateEvent(
  event: SSEEvent
): event is Extract<SSEEvent, { type: 'plan_update' }> {
  return event.type === 'plan_update';
}

export function isErrorEvent(event: SSEEvent): event is Extract<SSEEvent, { type: 'error' }> {
  return event.type === 'error';
}

// ============================================
// Event Handler Type
// ============================================

export type EventHandler<T extends SSEEvent['type']> = (
  event: Extract<SSEEvent, { type: T }>
) => void;

// ============================================
// Event Emitter Interface
// ============================================

export interface EventEmitter {
  on<T extends SSEEvent['type']>(type: T, handler: EventHandler<T>): void;
  off<T extends SSEEvent['type']>(type: T, handler: EventHandler<T>): void;
  emit(event: SSEEvent): void;
}
```

---

## tools.ts

```typescript
/**
 * Tool-specific input and output types
 * These types define the parameters and return values for each tool
 */

// ============================================
// Standardized Error Response
// ============================================

/**
 * Error codes for consistent handling across all tools
 */
export type ToolErrorCode =
  | 'IMAGE_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'FILE_ACCESS_DENIED'
  | 'SEARCH_FAILED'
  | 'SEARCH_RATE_LIMITED'
  | 'CODE_EXECUTION_FAILED'
  | 'CODE_EXECUTION_TIMEOUT'
  | 'CODE_SANDBOX_ERROR'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_NOT_READY'
  | 'AGENT_LIMIT_REACHED'
  | 'TOOL_CALL_LIMIT_REACHED'
  | 'API_ERROR'
  | 'API_KEY_MISSING'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Standardized error information for all tool failures
 * Helps agents understand what went wrong and what to do next
 */
export interface ToolErrorInfo {
  errorCode: ToolErrorCode;    // Machine-readable error code
  message: string;             // Human-readable error message
  suggestedAction: string;     // What the agent should do next
  canRetry: boolean;           // Whether retrying might help
  retryAfterMs?: number;       // Suggested wait time before retry (if applicable)
}

/**
 * Helper to create standardized error responses
 */
export function createToolError(
  errorCode: ToolErrorCode,
  message: string,
  suggestedAction: string,
  canRetry: boolean = false,
  retryAfterMs?: number
): ToolErrorInfo {
  return { errorCode, message, suggestedAction, canRetry, retryAfterMs };
}

/**
 * Common error templates for reuse
 */
export const ToolErrors = {
  imageNotFound: (path: string) => createToolError(
    'IMAGE_NOT_FOUND',
    `Image not found: ${path}`,
    'Generate the chart first using code_interpreter with plt.show(), then call view_image. Check that code_interpreter returned files in its response.',
    false
  ),
  fileNotFound: (path: string) => createToolError(
    'FILE_NOT_FOUND',
    `File not found: ${path}`,
    'Check the file path is correct. Use file operation "read" to verify the file exists.',
    false
  ),
  fileAccessDenied: (path: string) => createToolError(
    'FILE_ACCESS_DENIED',
    `Access denied: ${path} is outside allowed directory`,
    'Only access files within your agent directory. Use relative paths like "results.md" or "charts/chart.png".',
    false
  ),
  searchFailed: (error: string) => createToolError(
    'SEARCH_FAILED',
    `Search failed: ${error}`,
    'Try a different search query or simplify your search terms.',
    true,
    2000
  ),
  searchRateLimited: () => createToolError(
    'SEARCH_RATE_LIMITED',
    'Search rate limit exceeded',
    'Wait a moment before searching again. The system will automatically retry.',
    true,
    5000
  ),
  codeExecutionFailed: (error: string) => createToolError(
    'CODE_EXECUTION_FAILED',
    `Code execution failed: ${error}`,
    'Check your Python code for syntax errors. Ensure you import all required libraries (matplotlib, numpy, pandas are available).',
    true
  ),
  codeExecutionTimeout: () => createToolError(
    'CODE_EXECUTION_TIMEOUT',
    'Code execution timed out after 30 seconds',
    'Simplify your code - avoid large datasets, complex loops, or heavy computations. Try reducing data points.',
    false
  ),
  codeSandboxError: () => createToolError(
    'CODE_SANDBOX_ERROR',
    'Code execution sandbox is unavailable',
    'The E2B sandbox service may be down. Skip chart generation and proceed with text-based results.',
    true,
    10000
  ),
  agentNotFound: (agentId: string) => createToolError(
    'AGENT_NOT_FOUND',
    `Agent not found: ${agentId}`,
    'Check the agent_id is correct. Use the agent_id returned from spawn_agent.',
    false
  ),
  agentNotReady: (agentId: string, status: string, retryCount: number) => createToolError(
    'AGENT_NOT_READY',
    `Agent ${agentId} is ${status} (retry ${retryCount}/3)`,
    'Wait 5-10 seconds and call check_agent_status again. The agent is still working.',
    true,
    5000
  ),
  agentLimitReached: (max: number) => createToolError(
    'AGENT_LIMIT_REACHED',
    `Maximum agent limit (${max}) reached`,
    'Wait for existing agents to complete before spawning new ones. Use get_agent_result to collect completed work.',
    false
  ),
  toolCallLimitReached: (toolName: string, max: number) => createToolError(
    'TOOL_CALL_LIMIT_REACHED',
    `${toolName} call limit (${max}) reached`,
    `You have called ${toolName} too many times. Proceed with the information you have and write your results.`,
    false
  ),
  apiKeyMissing: (service: string) => createToolError(
    'API_KEY_MISSING',
    `${service} API key is not configured`,
    'Contact the system administrator to configure the required API key.',
    false
  ),
  apiError: (service: string, error: string) => createToolError(
    'API_ERROR',
    `${service} API error: ${error}`,
    'This may be a temporary issue. Wait a moment and try again.',
    true,
    3000
  ),
  validationFailed: (reason: string) => createToolError(
    'VALIDATION_FAILED',
    `Validation failed: ${reason}`,
    'Review the requirements and fix the issue before retrying.',
    true
  ),
  unknownError: (error: string) => createToolError(
    'UNKNOWN_ERROR',
    `Unexpected error: ${error}`,
    'An unexpected error occurred. Try a different approach or simplify your request.',
    false
  ),
};

// ============================================
// Orchestrator Tools
// ============================================

// spawn_agent tool
export interface SpawnAgentInput {
  toolName: 'spawn_agent';
  task: string;
  context_files?: string[];
  agent_type?: string;
  description: string; // 5-6 word summary of what this agent does (e.g., "Analyze market trends data")
}

export interface SpawnAgentResult {
  agent_id: string;
  status: 'spawned' | 'failed';
  message?: string;
  workDir?: string;
  errorInfo?: ToolErrorInfo; // Standardized error details when status is 'failed'
}

// check_agent_status tool
export interface CheckAgentStatusInput {
  toolName: 'check_agent_status';
  agent_id: string;
}

export interface CheckAgentStatusResult {
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  task: string;
  retryCount: number;
  error?: string;
  timestamp: string;
  progress?: string;
}

// get_agent_result tool
export interface GetAgentResultInput {
  toolName: 'get_agent_result';
  agent_id: string;
}

export interface GetAgentResultResult {
  agent_id: string;
  status: 'success' | 'not_ready' | 'failed';
  result?: string; // Markdown content
  error?: string;
  length?: number;
  artifacts?: string[]; // List of generated artifacts (charts, images) relative to agent directory
  errorInfo?: ToolErrorInfo; // Standardized error details when status is not 'success'
}

// update_plan tool
export interface UpdatePlanInput {
  toolName: 'update_plan';
  steps: Array<{
    id?: string;
    description: string;
    status?: 'pending' | 'in_progress' | 'completed';
    agent_ids?: string[];
  }>;
  mode: 'replace' | 'append';
}

export interface UpdatePlanResult {
  success: boolean;
  totalSteps: number;
  message: string;
}

// ============================================
// SubAgent Tools
// ============================================

// web_search tool
export interface WebSearchInput {
  toolName: 'web_search';
  query: string;
  num_results?: number;
  search_type?: 'keyword' | 'neural';
  use_autoprompt?: boolean;
  start_published_date?: string;
  description: string; // 5-6 word summary of search intent (e.g., "Finding 2024 revenue figures")
}

export interface WebSearchResult {
  success: boolean;
  results?: Array<{
    title: string;
    url: string;
    snippet?: string;
    content?: string;
    author?: string;
    publishedDate?: string;
    score?: number;
  }>;
  count?: number;
  error?: string;
  searchQuery?: string;
  errorInfo?: ToolErrorInfo; // Standardized error details when success is false
}

// file tool (read/write operations)
export interface FileOperationInput {
  toolName: 'file';
  operation: 'read' | 'write' | 'append';
  path: string;
  content?: string; // Required for write/append operations
  description: string; // 5-6 word summary (e.g., "Writing final research results")
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  content?: string; // For read operations
  size?: number;
  error?: string;
  errorInfo?: ToolErrorInfo; // Standardized error details when success is false
}

// summarize_content tool
export interface SummarizeContentInput {
  toolName: 'summarize_content';
  content: string;
  type: 'article' | 'research' | 'general';
  maxLength?: number;
}

export interface SummarizeContentResult {
  success: boolean;
  summary?: string;
  keyPoints?: string[];
  error?: string;
  tokenCount?: number;
}

// code_interpreter tool (E2B powered)
export interface CodeInterpreterInput {
  toolName: 'code_interpreter';
  code: string;
  language?: 'python' | 'javascript';
  purpose?: 'analysis' | 'visualization' | 'computation' | 'data_processing';
  outputFile?: string; // Filename for saving charts/outputs (e.g., "chart.png")
  description: string; // 5-6 word summary of what code does (e.g., "Creating revenue bar chart")
}

export interface CodeExecutionFile {
  path: string;
  type: 'image' | 'data' | 'text';
  content: string; // Base64 for images, text for others
  size: number;
}

export interface CodeInterpreterResult {
  success: boolean;
  output?: string; // Stdout from code execution
  error?: string; // Error message if execution failed
  logs?: string[]; // Execution logs
  files?: CodeExecutionFile[]; // Generated files (charts, data)
  executionTime?: number; // Duration in milliseconds
  errorInfo?: ToolErrorInfo; // Standardized error details when success is false
}

// view_image tool (for agents to inspect generated charts)
export interface ViewImageInput {
  toolName: 'view_image';
  imagePath: string; // Path to image relative to agent directory
  question?: string; // Optional question about the image (e.g., "Is this chart correct?")
  description: string; // 5-6 word summary (e.g., "Verifying revenue chart accuracy")
}

export interface ViewImageResult {
  success: boolean;
  description?: string; // Confirmation message
  imagePath?: string; // Full path to the image
  error?: string; // Error message if image not found
  addedToContext: boolean; // Whether image was added to conversation context
  errorInfo?: ToolErrorInfo; // Standardized error details when success is false
}

// ============================================
// Type Guards
// ============================================

export function isSpawnAgentInput(input: any): input is SpawnAgentInput {
  return input?.toolName === 'spawn_agent';
}

export function isCheckAgentStatusInput(input: any): input is CheckAgentStatusInput {
  return input?.toolName === 'check_agent_status';
}

export function isGetAgentResultInput(input: any): input is GetAgentResultInput {
  return input?.toolName === 'get_agent_result';
}

export function isWebSearchInput(input: any): input is WebSearchInput {
  return input?.toolName === 'web_search';
}

export function isFileOperationInput(input: any): input is FileOperationInput {
  return input?.toolName === 'file';
}

export function isSummarizeContentInput(input: any): input is SummarizeContentInput {
  return input?.toolName === 'summarize_content';
}

export function isUpdatePlanInput(input: any): input is UpdatePlanInput {
  return input?.toolName === 'update_plan';
}

export function isCodeInterpreterInput(input: any): input is CodeInterpreterInput {
  return input?.toolName === 'code_interpreter';
}

export function isViewImageInput(input: any): input is ViewImageInput {
  return input?.toolName === 'view_image';
}

// ============================================
// Union Types
// ============================================

export type ToolInput =
  | SpawnAgentInput
  | CheckAgentStatusInput
  | GetAgentResultInput
  | WebSearchInput
  | FileOperationInput
  | SummarizeContentInput
  | UpdatePlanInput
  | CodeInterpreterInput
  | ViewImageInput;

export type ToolResult =
  | SpawnAgentResult
  | CheckAgentStatusResult
  | GetAgentResultResult
  | WebSearchResult
  | FileOperationResult
  | SummarizeContentResult
  | UpdatePlanResult
  | CodeInterpreterResult
  | ViewImageResult;
```

---

## Summary

This document contains all type definitions from:
- `index.ts` - Main entry point and convenience exports
- `core.ts` - Core data types (Session, Agent, Tool, Plan, etc.)
- `api.ts` - API request/response types
- `events.ts` - Server-Sent Events types
- `tools.ts` - Tool-specific input/output types

All types are preserved exactly as they appear in the source files.

