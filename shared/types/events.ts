/**
 * Server-Sent Events (SSE) type definitions
 * Discriminated unions for type-safe event handling
 */

import type { AgentStatus, SessionStatus } from './core';
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