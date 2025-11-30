import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { SSEEvent } from '@shared/types';

interface EventLogProps {
  events: SSEEvent[];
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-zinc-400 space-y-1">
      {events.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center opacity-20 gap-2">
          <Terminal size={24} />
          <span>Waiting for stream...</span>
        </div>
      )}
      {events.map((event, i) => (
        <EventEntry key={i} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function EventEntry({ event }: { event: SSEEvent }) {
  const getEventColor = () => {
    switch (event.type) {
      case 'agent_spawned':
        return 'text-indigo-400';
      case 'agent_status_change':
        return event.data.status === 'completed'
          ? 'text-emerald-500'
          : event.data.status === 'failed'
          ? 'text-red-400'
          : 'text-amber-400';
      case 'tool_call':
        return 'text-indigo-400';
      case 'tool_result':
        return event.data.status === 'completed' ? 'text-emerald-500' : 'text-red-400';
      case 'error':
        return 'text-red-400';
      case 'orchestrator_step':
        return 'text-blue-400';
      case 'session_status_change':
        return 'text-blue-400';
      default:
        return 'text-zinc-300';
    }
  };

  const formatEventData = () => {
    switch (event.type) {
      case 'agent_spawned':
        return `Spawned ${event.data.agentId} - ${event.data.task.substring(0, 60)}...`;

      case 'agent_status_change':
        return `${event.data.agentId} → ${event.data.status}`;

      case 'tool_call':
        const inputStr = typeof event.data.input === 'string'
          ? event.data.input
          : JSON.stringify(event.data.input);
        return `${event.data.agentId} calling ${event.data.toolName}(${inputStr.substring(0, 40)}...)`;

      case 'tool_result':
        const success = event.data.status === 'completed';
        return `${event.data.agentId} ${event.data.toolName} → ${success ? 'SUCCESS' : 'FAILED'}`;

      case 'orchestrator_step':
        const toolNames = event.data.toolCalls?.map((tc: any) => tc.toolName).join(', ') || 'none';
        return `Orchestrator step ${event.data.stepNumber}: ${toolNames}`;

      case 'session_status_change':
        return `Session status → ${event.data.status}`;

      case 'error':
        return `ERROR in ${event.data.source}: ${event.data.error}`;

      default:
        return JSON.stringify(event.data).substring(0, 100);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getAgentId = () => {
    if ('agentId' in event.data && event.data.agentId) {
      return event.data.agentId;
    }
    return null;
  };

  return (
    <div className="flex gap-3 hover:bg-zinc-900/50 p-0.5 rounded -mx-1 px-1 transition-colors">
      <span className="text-zinc-600 shrink-0 w-[85px]">{formatTime(event.timestamp)}</span>

      <div className="flex-1 break-words">
        {getAgentId() && (
          <span className="text-indigo-400 mr-2 opacity-80">[{getAgentId()}]</span>
        )}
        <span className={getEventColor()}>
          {formatEventData()}
        </span>
      </div>
    </div>
  );
}
