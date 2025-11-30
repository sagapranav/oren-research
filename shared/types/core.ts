/**
 * Core data types shared between frontend and backend
 * These types represent the fundamental entities in the multi-agent research system
 */

import type {
  SpawnAgentInput,
  WaitForAgentsInput,
  GetAgentResultInput,
  WebSearchInput,
  FileOperationInput,
  SummarizeContentInput,
  UpdatePlanInput,
  CodeInterpreterInput,
  ViewImageInput,
  SpawnAgentResult,
  WaitForAgentsResult,
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

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying';

export interface AgentState {
  id: string;
  task: string;
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
  | WaitForAgentsInput
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
  | WaitForAgentsResult
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