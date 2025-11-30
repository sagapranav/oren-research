import EventEmitter from 'events';
import { randomUUID } from 'crypto';
import type {
  Session,
  SessionStatus,
  AgentState,
  AgentStatus,
  ToolCall,
  PlanStep,
  SSEEvent,
  AgentSpawnedData,
  AgentStatusChangeData,
  ToolCallData,
  ToolResultData,
  SessionStatusChangeData,
  OrchestratorStepData,
  ToolInput,
  ToolResult,
  FlowNode,
  FlowEdge,
  FlowData,
} from '../../shared/types/index.js';

/**
 * Internal session state with additional fields
 */
interface SessionState extends Omit<Session, 'agents' | 'planSteps'> {
  agents: Map<string, AgentState>;
  planSteps: Map<string, PlanStep>;
  flowNodes: Map<string, FlowNode>;
  flowEdges: FlowEdge[];
}

/**
 * Parameters for adding an agent
 */
interface AddAgentParams {
  task: string;
  description?: string; // Brief 5-6 word summary for UI display
}

/**
 * Parameters for adding a tool call
 */
interface AddToolCallParams {
  input: ToolInput;
  stepNumber: number;
  indexInStep: number;
  description?: string;
  externalId?: string; // Optional external ID (e.g., from AI SDK) to use instead of generating one
}

/**
 * Centralized state manager for all sessions
 * Manages session state and event streaming with full type safety
 */
export class StateManager extends EventEmitter {
  public sessions: Map<string, SessionState>;

  constructor() {
    super();
    this.sessions = new Map<string, SessionState>();
  }

  /**
   * Create a new session
   */
  createSession(query: string): string {
    // Use cryptographically secure UUID - makes session enumeration practically impossible
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session: SessionState = {
      sessionId,
      query,
      status: 'initializing',
      orchestrator: {
        messages: [],
        currentStep: 0,
        totalSteps: 0
      },
      agents: new Map<string, AgentState>(),
      planSteps: new Map<string, PlanStep>(),
      events: [],
      flowNodes: new Map<string, FlowNode>(),
      flowEdges: [],
      createdAt: now,
      updatedAt: now
    };

    // Add orchestrator node
    session.flowNodes.set('orchestrator', {
      id: 'orchestrator',
      type: 'orchestrator',
      label: 'Orchestrator',
      status: 'active',
      position: { x: 0, y: 0 },
      data: { query }
    });

    // Add orchestrator as an agent for timeline visualization
    const orchestratorAgent: AgentState = {
      id: 'orchestrator',
      task: 'Coordinate research and manage sub-agents',
      status: 'running',
      toolCalls: [],
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    };
    session.agents.set('orchestrator', orchestratorAgent);

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.updatedAt = new Date().toISOString();

      const eventData: SessionStatusChangeData = { status };
      this.emitEvent(sessionId, 'session_status_change', eventData);
    }
  }

  /**
   * Add an agent to the session
   */
  addAgent(sessionId: string, agentId: string, agentData: AddAgentParams): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const now = new Date().toISOString();

      const agent: AgentState = {
        id: agentId,
        task: agentData.task,
        status: 'pending',
        description: agentData.description,
        toolCalls: [],
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now
      };

      session.agents.set(agentId, agent);

      // Add agent node to flow - use description for label if available
      session.flowNodes.set(agentId, {
        id: agentId,
        type: 'agent',
        label: agentData.description || agentId,
        status: 'pending',
        data: { task: agentData.task, description: agentData.description }
      });

      // Add edge from orchestrator to agent
      session.flowEdges.push({
        id: `orchestrator-${agentId}`,
        source: 'orchestrator',
        target: agentId
      });

      const eventData: AgentSpawnedData = {
        agentId,
        task: agentData.task,
        description: agentData.description
      };

      this.emitEvent(sessionId, 'agent_spawned', eventData);
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(
    sessionId: string,
    agentId: string,
    status: AgentStatus,
    additionalData?: Partial<AgentState>
  ): void {
    const session = this.sessions.get(sessionId);
    if (session && session.agents.has(agentId)) {
      const agent = session.agents.get(agentId)!;
      agent.status = status;
      agent.updatedAt = new Date().toISOString();

      if (additionalData) {
        Object.assign(agent, additionalData);
      }

      // Update flow node
      const flowNode = session.flowNodes.get(agentId);
      if (flowNode) {
        flowNode.status = status;
      }

      const eventData: AgentStatusChangeData = {
        agentId,
        status,
        error: additionalData?.error,
        retryCount: additionalData?.retryCount
      };

      this.emitEvent(sessionId, 'agent_status_change', eventData);
    }
  }

  /**
   * Add a tool call to an agent
   */
  addToolCall(
    sessionId: string,
    agentId: string,
    toolName: string,
    toolData: AddToolCallParams
  ): string | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.agents.has(agentId)) {
      const agent = session.agents.get(agentId)!;
      // Use external ID if provided (e.g., from AI SDK), otherwise generate one
      const toolCallId = toolData.externalId || `${agentId}_tool_${agent.toolCalls.length + 1}`;
      const startedAt = new Date().toISOString();

      const toolCall: ToolCall = {
        id: toolCallId,
        toolName,
        status: 'executing',
        input: toolData.input,
        stepNumber: toolData.stepNumber,
        indexInStep: toolData.indexInStep,
        createdAt: startedAt,
        startedAt: startedAt,
        description: toolData.description
      };

      agent.toolCalls.push(toolCall);
      agent.lastActivityAt = startedAt;
      agent.updatedAt = startedAt;

      // Add tool node to flow - use description as label if available
      session.flowNodes.set(toolCallId, {
        id: toolCallId,
        type: 'tool',
        label: toolData.description || toolName,
        status: 'executing',
        data: {
          toolName,
          input: toolData.input,
          stepNumber: toolData.stepNumber,
          indexInStep: toolData.indexInStep,
          description: toolData.description
        }
      });

      // Add edges based on step numbers (simplified logic)
      if (toolData.stepNumber === 1) {
        session.flowEdges.push({
          id: `${agentId}-${toolCallId}`,
          source: agentId,
          target: toolCallId,
          type: 'initial'
        });
      } else {
        // Connect to previous step tools
        const previousStepTools = agent.toolCalls.filter(
          tc => tc.stepNumber === toolData.stepNumber - 1
        );

        previousStepTools.forEach(prevTool => {
          const edgeType = previousStepTools.length > 1 ? 'join' : 'sequential';
          session.flowEdges.push({
            id: `${prevTool.id}-${toolCallId}`,
            source: prevTool.id,
            target: toolCallId,
            type: edgeType
          });
        });

        // Fallback to agent if no previous tools
        if (previousStepTools.length === 0) {
          session.flowEdges.push({
            id: `${agentId}-${toolCallId}`,
            source: agentId,
            target: toolCallId,
            type: 'initial'
          });
        }
      }

      const eventData: ToolCallData = {
        agentId,
        toolCallId,
        toolName,
        input: toolData.input,
        stepNumber: toolData.stepNumber,
        indexInStep: toolData.indexInStep,
        startedAt,
        description: toolData.description
      };

      this.emitEvent(sessionId, 'tool_call', eventData);
      return toolCallId;
    }

    return undefined;
  }

  /**
   * Update tool call result
   */
  updateToolCall(
    sessionId: string,
    agentId: string,
    toolCallId: string,
    result: ToolResult,
    status: 'completed' | 'failed' = 'completed'
  ): void {
    const session = this.sessions.get(sessionId);
    if (session && session.agents.has(agentId)) {
      const agent = session.agents.get(agentId)!;
      const toolCall = agent.toolCalls.find(tc => tc.id === toolCallId);

      if (toolCall) {
        const completedAt = new Date().toISOString();
        toolCall.status = status;
        toolCall.result = result;
        toolCall.completedAt = completedAt;

        // Calculate duration in milliseconds
        const startTime = new Date(toolCall.startedAt).getTime();
        const endTime = new Date(completedAt).getTime();
        toolCall.duration = endTime - startTime;

        // Update agent activity
        agent.lastActivityAt = completedAt;
        agent.updatedAt = completedAt;

        // Update flow node
        const flowNode = session.flowNodes.get(toolCallId);
        if (flowNode) {
          flowNode.status = status;
          flowNode.data.completedAt = completedAt;
          flowNode.data.duration = toolCall.duration;
        }

        const eventData: ToolResultData = {
          agentId,
          toolCallId,
          toolName: toolCall.toolName,
          status,
          result,
          startedAt: toolCall.startedAt,
          completedAt,
          duration: toolCall.duration,
          stepNumber: toolCall.stepNumber,
          indexInStep: toolCall.indexInStep
        };

        this.emitEvent(sessionId, 'tool_result', eventData);
      }
    }
  }

  /**
   * Add orchestrator step
   */
  addOrchestratorStep(
    sessionId: string,
    stepNumber: number,
    toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.orchestrator.currentStep = stepNumber;
      session.orchestrator.totalSteps = Math.max(session.orchestrator.totalSteps, stepNumber);

      const eventData: OrchestratorStepData = {
        stepNumber,
        toolCalls: toolCalls.map(tc => ({
          toolName: tc.toolName,
          input: { toolName: tc.toolName, ...tc.args } as ToolInput
        }))
      };

      this.emitEvent(sessionId, 'orchestrator_step', eventData);
    }
  }

  /**
   * Emit a typed event for a session
   */
  public emitEvent<T extends SSEEvent['type']>(
    sessionId: string,
    eventType: T,
    data: Extract<SSEEvent, { type: T }>['data']
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const event: SSEEvent = {
        type: eventType,
        data,
        timestamp: new Date().toISOString()
      } as SSEEvent;

      session.events.push(event);

      // Emit to all listeners for this session
      this.emit(`event:${sessionId}`, event);
    }
  }

  /**
   * Get flow data for visualization
   */
  getFlowData(sessionId: string): FlowData {
    const session = this.sessions.get(sessionId);
    if (session) {
      return {
        nodes: Array.from(session.flowNodes.values()),
        edges: session.flowEdges
      };
    }
    return { nodes: [], edges: [] };
  }

  /**
   * Clean up old sessions (call periodically)
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - new Date(session.createdAt).getTime();
      if (age > maxAgeMs && (session.status === 'completed' || session.status === 'failed')) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

// Singleton instance
export const stateManager = new StateManager();