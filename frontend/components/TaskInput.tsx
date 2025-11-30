import { useState } from 'react';
import { Play, Activity, Square } from 'lucide-react';

interface TaskInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  onReset?: () => void;
}

export function TaskInput({ onSubmit, disabled, isLoading, onReset }: TaskInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onSubmit(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
          Research Objective
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a topic to investigate..."
          disabled={disabled}
          className="w-full h-32 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-0 resize-none transition-colors"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={disabled || !query.trim() || isLoading}
          className={`flex-1 h-9 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all ${
            isLoading
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : disabled
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : 'bg-white text-black hover:bg-zinc-200'
          }`}
        >
          {isLoading ? (
            <>
              <Activity size={14} className="animate-spin" />
              PROCESSING
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" />
              START RESEARCH
            </>
          )}
        </button>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="h-9 w-9 rounded-md border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="Reset"
          >
            <Square size={14} className="fill-current" />
          </button>
        )}
      </div>
    </form>
  );
}
