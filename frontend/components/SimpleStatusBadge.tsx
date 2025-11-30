import React from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';

export enum SimpleStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

interface SimpleStatusBadgeProps {
  status: SimpleStatus;
}

export const SimpleStatusBadge: React.FC<SimpleStatusBadgeProps> = ({ status }) => {
  if (status === SimpleStatus.RUNNING) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-3 h-3 text-white animate-spin" />
        <span className="text-[10px] font-medium text-white uppercase tracking-wider">Active</span>
      </div>
    );
  }

  if (status === SimpleStatus.COMPLETED) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3 h-3 text-zinc-400" />
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Done</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 opacity-50">
      <Circle className="w-1.5 h-1.5 fill-zinc-600 text-transparent" />
      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Waiting</span>
    </div>
  );
};