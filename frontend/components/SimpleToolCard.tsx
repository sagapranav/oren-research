import React from 'react';
import { Search, FileText, Database, Terminal, Globe, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react';
import { SimpleStatus } from './SimpleStatusBadge';

export interface SimpleTool {
  id: string;
  name: string;
  icon: string;
  status: SimpleStatus;
  durationMs?: number;
  input?: string;
  output?: string;
  timestamp: number;
  description?: string; // Brief description for UI display
}

interface SimpleToolCardProps {
  tool: SimpleTool;
}

const getIcon = (iconName: string) => {
  const props = { className: "w-3 h-3" };
  switch (iconName.toLowerCase()) {
    case 'search': return <Search {...props} />;
    case 'file':
    case 'read': return <FileText {...props} />;
    case 'database':
    case 'query': return <Database {...props} />;
    case 'code':
    case 'execute': return <Terminal {...props} />;
    case 'web':
    case 'fetch': return <Globe {...props} />;
    default: return <Sparkles {...props} />;
  }
};

export const SimpleToolCard: React.FC<SimpleToolCardProps> = ({ tool }) => {
  const isActive = tool.status === SimpleStatus.RUNNING;
  const isCompleted = tool.status === SimpleStatus.COMPLETED;
  const isFailed = tool.status === SimpleStatus.FAILED;

  return (
    <div className="flex items-center justify-between py-1.5 px-2 group">
      <div className="flex items-center gap-2">
        <div className={`
          transition-colors duration-300
          ${isActive ? 'text-zinc-400' : isCompleted ? 'text-zinc-600' : isFailed ? 'text-red-500' : 'text-zinc-700'}
        `}>
          {getIcon(tool.icon)}
        </div>

        <div className="flex flex-col">
          <span className={`
            text-xs transition-colors duration-300
            ${isActive ? 'text-zinc-300' : isFailed ? 'text-red-400' : 'text-zinc-500'}
          `}>
            {tool.description || tool.name}
          </span>
        </div>
      </div>

      <div className="flex items-center">
        {isActive ? (
          <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
        ) : isCompleted ? (
          <Check className="w-3 h-3 text-green-700/50" />
        ) : isFailed ? (
          <AlertCircle className="w-3 h-3 text-red-500/50" />
        ) : null}
      </div>
    </div>
  );
};