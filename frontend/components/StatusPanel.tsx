import { Clock } from 'lucide-react';
import type { SessionStatus } from '@shared/types';

interface StatusPanelProps {
  status: SessionStatus;
  progress: { current: number; total: number };
  sessionId: string | null;
}

export function StatusPanel({ status, progress, sessionId }: StatusPanelProps) {
  const isResearching = status === 'executing' || status === 'planning' || status === 'initializing';
  const isCompleted = status === 'completed';

  return (
    <>
      {isResearching && (
        <span className="flex items-center gap-2 text-[10px] text-emerald-600 uppercase font-medium animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Agent Active
        </span>
      )}
      {isCompleted && !isResearching && (
        <span className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase font-medium">
          <Clock size={12} />
          Done
        </span>
      )}
    </>
  );
}
