'use client';

import { ChevronDown } from 'lucide-react';

export interface ModelConfig {
  orchestrator: string;
  planning: string;
  searchSummarisation: string;
  reportWriting: string;
  subagent: string;
}

export const MODEL_OPTIONS = [
  { value: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5' },
  { value: 'anthropic/claude-opus-4-5-20250514', label: 'Claude Opus 4.5 (Extended Thinking)' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'x-ai/grok-4.1-fast:free', label: 'Grok 4.1 Fast' },
  { value: 'z-ai/glm-4.6:exacto', label: 'GLM 4.6 Exacto' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

export const DEFAULT_MODELS: ModelConfig = {
  orchestrator: 'anthropic/claude-haiku-4.5',
  planning: 'anthropic/claude-opus-4.5',
  searchSummarisation: 'google/gemini-2.5-flash',
  reportWriting: 'anthropic/claude-haiku-4.5',
  subagent: 'anthropic/claude-haiku-4.5',
};

interface ModelSelectorProps {
  models: ModelConfig;
  onChange: (models: ModelConfig) => void;
  disabled?: boolean;
}

interface SelectFieldProps {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function SelectField({ label, value, defaultValue, onChange, disabled }: SelectFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-xs w-32 flex-shrink-0">{label}</span>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none bg-zinc-900 border border-zinc-700 rounded px-2 py-1 pr-6 text-xs text-emerald-500 cursor-pointer hover:border-zinc-600 focus:outline-none focus:border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed w-full"
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === defaultValue ? `${option.label} (default)` : option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
        />
      </div>
    </div>
  );
}

// Inner content component for use inside CollapsibleSection
export function ModelSelectorContent({ models, onChange, disabled }: ModelSelectorProps) {
  const updateModel = (key: keyof ModelConfig, value: string) => {
    onChange({ ...models, [key]: value });
  };

  return (
    <div className="space-y-2">
      <SelectField
        label="Orchestrator"
        value={models.orchestrator}
        defaultValue={DEFAULT_MODELS.orchestrator}
        onChange={(v) => updateModel('orchestrator', v)}
        disabled={disabled}
      />
      <SelectField
        label="Strategic Planning"
        value={models.planning}
        defaultValue={DEFAULT_MODELS.planning}
        onChange={(v) => updateModel('planning', v)}
        disabled={disabled}
      />
      <SelectField
        label="Search Summarisation"
        value={models.searchSummarisation}
        defaultValue={DEFAULT_MODELS.searchSummarisation}
        onChange={(v) => updateModel('searchSummarisation', v)}
        disabled={disabled}
      />
      <SelectField
        label="Report Writing"
        value={models.reportWriting}
        defaultValue={DEFAULT_MODELS.reportWriting}
        onChange={(v) => updateModel('reportWriting', v)}
        disabled={disabled}
      />
      <SelectField
        label="Subagent"
        value={models.subagent}
        defaultValue={DEFAULT_MODELS.subagent}
        onChange={(v) => updateModel('subagent', v)}
        disabled={disabled}
      />
    </div>
  );
}

// Legacy wrapper component (kept for backward compatibility)
export function ModelSelector({ models, onChange, disabled }: ModelSelectorProps) {
  return (
    <div className="px-6 py-4 border-t border-zinc-800">
      <div className="text-[10px] text-zinc-500 uppercase font-medium mb-3 tracking-wider">
        Model Configuration
      </div>
      <ModelSelectorContent models={models} onChange={onChange} disabled={disabled} />
    </div>
  );
}
