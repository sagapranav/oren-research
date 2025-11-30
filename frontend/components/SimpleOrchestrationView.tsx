'use client';

import React, { useMemo } from 'react';
import type { AgentState, ToolCall } from '@shared/types';
import { Command, Loader2, Check } from 'lucide-react';
import { SimpleStatus } from './SimpleStatusBadge';
import { SimpleAgentCard, SimpleAgent } from './SimpleAgentCard';
import { SimpleTool } from './SimpleToolCard';

interface SimpleOrchestrationViewProps {
  agents: Map<string, AgentState>;
  sessionStartTime: string | null;
  isComplete?: boolean;
}

// Get human-readable label for a tool
const getToolLabel = (toolCall: ToolCall): string => {
  const toolName = toolCall.toolName.toLowerCase();
  const input = toolCall.input as Record<string, any>;

  // Use description if provided
  if (toolCall.description) {
    return toolCall.description;
  }

  // Generate friendly labels based on tool type
  if (toolName === 'web_search' || toolName.includes('search')) {
    const query = input?.query;
    if (query && typeof query === 'string') {
      // Truncate long queries
      const truncated = query.length > 40 ? query.substring(0, 40) + '...' : query;
      return `Searching "${truncated}"`;
    }
    return 'Searching the web';
  }

  if (toolName === 'code_interpreter' || toolName.includes('code')) {
    const purpose = input?.purpose;
    if (purpose === 'visualization') return 'Creating visualization';
    if (purpose === 'analysis') return 'Analyzing data';
    if (purpose === 'computation') return 'Computing results';
    return 'Visualizing data';
  }

  if (toolName === 'file') {
    const operation = input?.operation;
    if (operation === 'write') return 'Taking notes';
    if (operation === 'read') return 'Reading notes';
    return 'Writing thoughts';
  }

  if (toolName === 'view_image') {
    return 'Viewing chart';
  }

  if (toolName === 'summarize_content') {
    return 'Summarizing content';
  }

  // Default: capitalize tool name
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

// Transform functions
const transformToolCall = (toolCall: ToolCall): SimpleTool => {
  let status: SimpleStatus;
  if (toolCall.status === 'executing') {
    status = SimpleStatus.RUNNING;
  } else if (toolCall.status === 'completed') {
    status = SimpleStatus.COMPLETED;
  } else if (toolCall.status === 'failed') {
    status = SimpleStatus.FAILED;
  } else {
    status = SimpleStatus.PENDING;
  }

  // Get icon name from tool name
  let icon = 'sparkles';
  const toolNameLower = toolCall.toolName.toLowerCase();
  if (toolNameLower.includes('read') || toolNameLower.includes('file')) icon = 'file';
  else if (toolNameLower.includes('search')) icon = 'search';
  else if (toolNameLower.includes('query') || toolNameLower.includes('database')) icon = 'database';
  else if (toolNameLower.includes('execute') || toolNameLower.includes('code')) icon = 'code';
  else if (toolNameLower.includes('fetch') || toolNameLower.includes('web')) icon = 'web';

  return {
    id: toolCall.id,
    name: toolCall.toolName,
    icon,
    status,
    durationMs: toolCall.duration,
    input: typeof toolCall.input === 'object' ? JSON.stringify(toolCall.input) : toolCall.input,
    output: typeof toolCall.result === 'string' ? toolCall.result : undefined,
    timestamp: new Date(toolCall.startedAt).getTime(),
    description: getToolLabel(toolCall),
  };
};

const transformAgentState = (agentState: AgentState): SimpleAgent => {
  // Determine agent status based on its state and tool statuses
  let status: SimpleStatus;
  const hasRunningTools = agentState.toolCalls.some(tc => tc.status === 'executing');
  const allToolsCompleted = agentState.toolCalls.length > 0 &&
    agentState.toolCalls.every(tc => tc.status === 'completed');

  if (hasRunningTools || agentState.status === 'running') {
    status = SimpleStatus.RUNNING;
  } else if (allToolsCompleted || agentState.status === 'completed') {
    status = SimpleStatus.COMPLETED;
  } else if (agentState.status === 'failed') {
    status = SimpleStatus.FAILED;
  } else {
    status = SimpleStatus.PENDING;
  }

  // Get agent display name from id and description
  const getAgentName = (id: string, description?: string): string => {
    if (id === 'orchestrator') return 'Orchestrator';
    if (description) return description;
    // Fallback to formatted agent id
    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Get agent role description
  const getAgentRole = (id: string): string => {
    if (id === 'orchestrator') return 'SUPERVISOR';
    return 'RESEARCH';
  };

  // Sort tools by timestamp (most recent first for better visibility)
  const tools = agentState.toolCalls
    .map(transformToolCall)
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    id: agentState.id,
    name: getAgentName(agentState.id, agentState.description),
    role: getAgentRole(agentState.id),
    status,
    tools,
    color: 'zinc', // We'll use a consistent color scheme
  };
};

interface OrchestratorState {
  status: SimpleStatus;
  agent?: SimpleAgent;
}

export function SimpleOrchestrationView({ agents, sessionStartTime, isComplete }: SimpleOrchestrationViewProps) {
  // Create a dependency key that changes when any agent or tool is updated
  // This ensures React detects changes to individual agents and their tools in the Map
  const agentsDependencyKey = useMemo(() => {
    let key = '';
    agents.forEach((agent) => {
      // Include agent ID, status, and tool details to detect any changes
      key += `${agent.id}:${agent.status}:${agent.updatedAt}:`;
      // Include each tool's status to detect tool-level changes
      agent.toolCalls.forEach(tool => {
        key += `${tool.id}:${tool.status},`;
      });
      key += ';';
    });
    return key;
  }, [agents]);

  // Transform agents data
  const { orchestrator, subAgents } = useMemo(() => {
    console.log('[SimpleOrchestrationView] Transforming agents:', {
      agentCount: agents.size,
      timestamp: new Date().toISOString()
    });

    let orchestratorState: OrchestratorState = { status: SimpleStatus.PENDING };
    const subAgentsList: SimpleAgent[] = [];

    agents.forEach((agentState) => {
      const transformedAgent = transformAgentState(agentState);

      // Log individual agent updates
      if (agentState.toolCalls.some(tc => tc.status === 'executing')) {
        console.log(`[SimpleOrchestrationView] Agent ${agentState.id} has running tools:`, {
          runningTools: agentState.toolCalls.filter(tc => tc.status === 'executing').map(tc => tc.toolName)
        });
      }

      if (agentState.id === 'orchestrator') {
        orchestratorState = {
          status: transformedAgent.status,
          agent: transformedAgent,
        };
      } else {
        subAgentsList.push(transformedAgent);
      }
    });

    // Sort sub-agents by status (active first) and then by name
    subAgentsList.sort((a, b) => {
      if (a.status === SimpleStatus.RUNNING && b.status !== SimpleStatus.RUNNING) return -1;
      if (b.status === SimpleStatus.RUNNING && a.status !== SimpleStatus.RUNNING) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      orchestrator: orchestratorState,
      subAgents: subAgentsList,
    };
  }, [agentsDependencyKey, agents]);

  // isActive should be false when session is complete
  const isActive = !isComplete && (
    orchestrator.status === SimpleStatus.RUNNING ||
    subAgents.some(agent => agent.status === SimpleStatus.RUNNING)
  );

  // Determine orchestrator phase for status text
  // Flow: Setting up → Planning → Researching → Putting everything together → Completed
  const getOrchestratorStatusText = (): string => {
    if (isComplete) return 'Completed';

    const orchestratorTools = orchestrator.agent?.tools || [];
    const planTool = orchestratorTools.find(t => t.name === 'generate_plan');
    const reportTool = orchestratorTools.find(t => t.name === 'write_report');

    // If write_report is running or completed, we're finalizing
    if (reportTool?.status === SimpleStatus.RUNNING || reportTool?.status === SimpleStatus.COMPLETED) {
      return 'Putting everything together';
    }

    // If agents exist and are working/completed, we're in research phase
    if (subAgents.length > 0) {
      const allAgentsComplete = subAgents.every(agent => agent.status === SimpleStatus.COMPLETED);
      if (allAgentsComplete) return 'Putting everything together';
      return 'Researching';
    }

    // If plan tool is running, we're planning
    if (planTool?.status === SimpleStatus.RUNNING) {
      return 'Planning';
    }

    // Initial state or spawning agents after planning
    return 'Setting up';
  };

  const orchestratorStatusText = getOrchestratorStatusText();

  // Waiting state
  if (!sessionStartTime || agents.size === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-zinc-500 text-sm">Waiting for session to start...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black p-6 overflow-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xs font-medium text-zinc-600 uppercase tracking-widest mb-2">
            OREN RESEARCH
          </h1>
        </div>

        {/* Orchestrator Section */}
        <div className="flex flex-col items-center w-full mb-8">
          {/* Orchestrator Capsule */}
          <div className={`
            relative flex items-center gap-6 pl-4 pr-6 py-3 rounded-full border backdrop-blur-xl
            transition-all duration-700 ease-out z-20
            ${isActive
              ? 'bg-zinc-900/90 border-zinc-700 shadow-2xl shadow-black/50'
              : 'bg-black border-zinc-800'}
          `}>

            {/* Icon */}
            <div className={`
              flex items-center justify-center w-8 h-8 rounded-full transition-all duration-500
              ${isActive ? 'bg-white text-black' : isComplete ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-700'}
            `}>
              {isActive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isComplete ? (
                <Check className="w-4 h-4" />
              ) : (
                <Command className="w-4 h-4" />
              )}
            </div>

            {/* Text Info */}
            <div className="flex flex-col items-start gap-0.5">
              <h2 className="text-sm font-medium text-zinc-100 tracking-tight">Orchestrator</h2>
            </div>

            {/* Divider */}
            <div className="h-8 w-[1px] bg-zinc-800/50 mx-2"></div>

            {/* Status - Custom text based on phase */}
            <div className="flex items-center gap-2">
              {isActive && <Loader2 className="w-3 h-3 text-white animate-spin" />}
              {isComplete && <Check className="w-3 h-3 text-emerald-500" />}
              <span className={`text-[10px] font-medium uppercase tracking-wider ${isComplete ? 'text-emerald-500' : 'text-white'}`}>
                {orchestratorStatusText}
              </span>
            </div>
          </div>

          {/* Connecting Line */}
          <div className={`
            w-[1px] transition-all duration-1000 bg-gradient-to-b from-zinc-700 to-transparent
            ${subAgents.length > 0 ? 'h-16 opacity-100' : 'h-0 opacity-0'}
          `}></div>
        </div>

        {/* Sub-Agents Row - Horizontal Layout */}
        {subAgents.length > 0 && (
          <div className="flex flex-row gap-4 justify-center flex-wrap">
            {subAgents.map((agent) => (
              <div key={agent.id} className="flex-shrink-0 w-64">
                <SimpleAgentCard agent={agent} />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {subAgents.length === 0 && (
          <div className="text-center py-12">
            <span className="text-zinc-600 text-sm">No agents active</span>
          </div>
        )}
      </div>
    </div>
  );
}