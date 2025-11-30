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