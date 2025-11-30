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
  description: string; // 5-6 word summary of what this agent does (e.g., "Analyze market trends data")
}

export interface SpawnAgentResult {
  agent_id: string;
  status: 'spawned' | 'failed';
  message?: string;
  workDir?: string;
  errorInfo?: ToolErrorInfo; // Standardized error details when status is 'failed'
}

// wait_for_agents tool (replaces check_agent_status)
export interface WaitForAgentsInput {
  toolName: 'wait_for_agents';
  agent_ids: string[];
  timeout_seconds?: number;
}

export interface AgentCompletionStatus {
  agent_id: string;
  status: 'completed' | 'failed';
  task: string;
  error?: string;
}

export interface WaitForAgentsResult {
  success: boolean;
  agents: AgentCompletionStatus[];
  elapsed_seconds: number;
  error?: string;
  errorInfo?: ToolErrorInfo;
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
    author?: string;
    publishedDate?: string;
    score?: number;
  }>;
  summary?: string; // AI-generated summary of all search results (raw content never enters model context)
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

export function isWaitForAgentsInput(input: any): input is WaitForAgentsInput {
  return input?.toolName === 'wait_for_agents';
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
  | WaitForAgentsInput
  | GetAgentResultInput
  | WebSearchInput
  | FileOperationInput
  | SummarizeContentInput
  | UpdatePlanInput
  | CodeInterpreterInput
  | ViewImageInput;

export type ToolResult =
  | SpawnAgentResult
  | WaitForAgentsResult
  | GetAgentResultResult
  | WebSearchResult
  | FileOperationResult
  | SummarizeContentResult
  | UpdatePlanResult
  | CodeInterpreterResult
  | ViewImageResult;