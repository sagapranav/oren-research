import { useState, useEffect, useRef } from 'react';

// Import types from shared directory
import type {
  AgentState,
  ToolCall,
  PlanStep,
  SessionStatus,
  Progress,
  SSEEvent,
  SessionStatusResponse,
  FlowDataResponse,
  FlowNode,
  FlowEdge,
  FlowData,
} from '@shared/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

// Session status with additional fields
interface ExtendedSessionStatus {
  status: SessionStatus;
  currentStep?: number;
  totalSteps?: number;
}

// Re-export types that components depend on (for backward compatibility)
export type { AgentState, ToolCall, PlanStep, SessionStatus, FlowNode, FlowEdge, FlowData };
export type { SSEEvent };

export function useReportStream(sessionId: string | null) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [status, setStatus] = useState<ExtendedSessionStatus>({ status: 'idle' });
  const [flowData, setFlowData] = useState<FlowData>({ nodes: [], edges: [] });
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0 });
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) {
      // Reset state when no session
      setEvents([]);
      setAgents(new Map());
      setPlanSteps([]);
      setStatus({ status: 'idle' });
      setFlowData({ nodes: [], edges: [] });
      setProgress({ current: 0, total: 0 });
      setSessionStartTime(null);
      return;
    }

    console.log(`Connecting to SSE stream for session: ${sessionId}`);

    // Fetch initial session state (for reconnections or page reloads)
    fetch(`${API_BASE}/api/status/${sessionId}`)
      .then((res) => res.json())
      .then((data: SessionStatusResponse) => {
        console.log('Loaded initial session state:', data);

        // Set session start time from createdAt
        if (data.createdAt) {
          setSessionStartTime(data.createdAt);
        }

        // Load existing agents
        if (data.agents && Array.isArray(data.agents)) {
          const agentMap = new Map<string, AgentState>();
          data.agents.forEach((agent) => {
            agentMap.set(agent.id, agent);
          });
          setAgents(agentMap);
        }

        // Load plan steps
        if (data.planSteps && Array.isArray(data.planSteps)) {
          setPlanSteps(data.planSteps);
        }

        // Set status
        if (data.status) {
          setStatus({ status: data.status });
        }
      })
      .catch((err) => console.error('Error fetching initial session state:', err));

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Create new EventSource
    const eventSource = new EventSource(`${API_BASE}/api/stream/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setStatus({ status: 'initializing' });
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setStatus({ status: 'failed' });
    };

    // Listen for session status changes
    eventSource.addEventListener('session_status_change', (e) => {
      const data = JSON.parse(e.data);
      setStatus((prev) => ({
        ...prev,
        status: data.status,
      }));
      addEvent('session_status_change', data);
    });

    // Listen for agent spawned
    eventSource.addEventListener('agent_spawned', (e) => {
      const data = JSON.parse(e.data);
      const now = new Date().toISOString();

      setAgents((prev) => {
        const updated = new Map(prev);
        const newAgent: AgentState = {
          id: data.agentId,
          task: data.task,
          description: data.description, // Brief description for UI display
          status: 'pending',
          toolCalls: [],
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        };
        updated.set(data.agentId, newAgent);
        return updated;
      });
      addEvent('agent_spawned', data);
      updateFlowData();
    });

    // Listen for agent status changes
    eventSource.addEventListener('agent_status_change', (e) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => {
        const updated = new Map(prev);
        const agent = updated.get(data.agentId);
        if (agent) {
          updated.set(data.agentId, {
            ...agent,
            status: data.status,
            updatedAt: new Date().toISOString(),
            error: data.error,
            retryCount: data.retryCount,
          });
        }
        return updated;
      });
      addEvent('agent_status_change', data);
      updateFlowData();
    });

    // Listen for orchestrator steps
    eventSource.addEventListener('orchestrator_step', (e) => {
      const data = JSON.parse(e.data);
      setProgress({ current: data.stepNumber, total: data.stepNumber });
      addEvent('orchestrator_step', data);
    });

    // Listen for tool calls
    eventSource.addEventListener('tool_call', (e) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => {
        const updated = new Map(prev);
        const agent = updated.get(data.agentId);
        if (agent) {
          // Check if tool with this ID already exists
          const existingToolIndex = agent.toolCalls.findIndex(tc => tc.id === data.toolCallId);

          if (existingToolIndex >= 0) {
            // Update existing tool
            agent.toolCalls[existingToolIndex] = {
              ...agent.toolCalls[existingToolIndex],
              status: 'executing',
              input: { toolName: data.toolName, ...data.input },
              startedAt: data.startedAt || agent.toolCalls[existingToolIndex].startedAt,
            };
          } else {
            // Add new tool
            const newTool: ToolCall = {
              id: data.toolCallId,
              toolName: data.toolName,
              status: 'executing',
              input: { toolName: data.toolName, ...data.input },
              createdAt: data.startedAt || new Date().toISOString(),
              startedAt: data.startedAt || new Date().toISOString(),
              stepNumber: data.stepNumber || 0,
              indexInStep: data.indexInStep || 0,
              description: data.description,
            };
            agent.toolCalls.push(newTool);
          }

          agent.lastActivityAt = data.startedAt || new Date().toISOString();
          updated.set(data.agentId, { ...agent, updatedAt: new Date().toISOString() });
        }
        return updated;
      });
      addEvent('tool_call', data);
      updateFlowData();
    });

    // Listen for tool results
    eventSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => {
        const updated = new Map(prev);
        const agent = updated.get(data.agentId);
        if (agent) {
          const toolCall = agent.toolCalls.find((tc) => tc.id === data.toolCallId);
          if (toolCall) {
            toolCall.status = data.status;
            toolCall.result = data.result;
            toolCall.completedAt = data.completedAt;
            toolCall.duration = data.duration;
          }
          agent.lastActivityAt = data.completedAt || new Date().toISOString();
          updated.set(data.agentId, { ...agent, updatedAt: new Date().toISOString() });
        }
        return updated;
      });
      addEvent('tool_result', data);
      updateFlowData();
    });

    // Listen for errors
    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse(e.data);
      addEvent('error', data);
    });

    function addEvent(type: SSEEvent['type'], data: any) {
      const event: SSEEvent = {
        type,
        data,
        timestamp: new Date().toISOString(),
      } as SSEEvent; // Type assertion needed due to discriminated union

      setEvents((prev) => [...prev, event]);
    }

    function updateFlowData() {
      // Fetch updated flow data from backend
      fetch(`${API_BASE}/api/flow/${sessionId}`)
        .then((res) => res.json())
        .then((data: FlowDataResponse) => setFlowData(data))
        .catch((err) => console.error('Error fetching flow data:', err));
    }

    // Cleanup on unmount
    return () => {
      console.log('Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);

  return {
    events,
    agents,
    planSteps,
    status,
    flowData,
    progress,
    sessionStartTime
  };
}