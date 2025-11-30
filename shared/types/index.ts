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