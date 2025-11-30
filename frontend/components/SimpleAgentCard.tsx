import React from 'react';
import { Bot, Loader2, Check } from 'lucide-react';
import { SimpleToolCard, SimpleTool } from './SimpleToolCard';
import { SimpleStatus } from './SimpleStatusBadge';

export interface SimpleAgent {
  id: string;
  name: string;
  role: string;
  status: SimpleStatus;
  tools: SimpleTool[];
  color: string;
}

interface SimpleAgentCardProps {
  agent: SimpleAgent;
}

export const SimpleAgentCard: React.FC<SimpleAgentCardProps> = ({ agent }) => {
  const isActive = agent.status === SimpleStatus.RUNNING;
  const isCompleted = agent.status === SimpleStatus.COMPLETED;

  return (
    <div className={`
      flex flex-col w-full transition-all duration-500 ease-in-out
      ${isActive ? 'opacity-100' : 'opacity-60'}
    `}>
      {/* Agent Card */}
      <div className={`
        relative flex flex-col rounded-lg border transition-all duration-500 overflow-hidden
        ${isActive
          ? 'bg-zinc-900/60 border-zinc-700'
          : 'bg-zinc-950/80 border-zinc-800'}
      `}>

        {/* Header */}
        <div className={`
          flex items-center justify-between p-3 border-b transition-colors duration-500
          ${isActive ? 'border-zinc-700/50' : 'border-zinc-800/50'}
        `}>
          <div className="flex items-center gap-2.5">
            <div className={`
              p-1 rounded transition-colors duration-500
              ${isActive ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-900 text-zinc-600'}
            `}>
              <Bot className="w-3 h-3" />
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-medium ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                {agent.name}
              </span>
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                {agent.role}
              </span>
            </div>
          </div>

          {/* Status Icon */}
          <div className="flex items-center justify-center">
            {isActive ? (
              <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
            ) : isCompleted ? (
              <Check className="w-3 h-3 text-green-700/40" />
            ) : (
              <div className="w-1 h-1 rounded-full bg-zinc-700" />
            )}
          </div>
        </div>

        {/* Tools List */}
        <div className="p-2 flex flex-col gap-0.5">
          {agent.tools.map((tool) => (
            <SimpleToolCard key={tool.id} tool={tool} />
          ))}

          {agent.tools.length === 0 && (
            <div className="py-4 flex items-center justify-center">
              <span className="text-[10px] text-zinc-600 font-mono">Awaiting tasks...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};