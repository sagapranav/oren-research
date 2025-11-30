'use client';

import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Check } from 'lucide-react';

export interface ApiKeys {
  openRouter: string;
  e2b: string;
  exa: string;
}

interface ApiKeyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function ApiKeyField({ label, value, onChange, placeholder, disabled }: ApiKeyFieldProps) {
  const [showKey, setShowKey] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-xs w-28 flex-shrink-0 flex items-center gap-1.5">
        {hasValue && <Check size={10} className="text-emerald-500" />}
        {label}
      </span>
      <div className="relative flex-1">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 pr-8 text-xs text-zinc-300 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
        >
          {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>
    </div>
  );
}

interface ApiKeysPanelProps {
  apiKeys: ApiKeys;
  onChange: (keys: ApiKeys) => void;
  disabled?: boolean;
}

export function ApiKeysPanel({ apiKeys, onChange, disabled }: ApiKeysPanelProps) {
  const updateKey = (key: keyof ApiKeys, value: string) => {
    const newKeys = { ...apiKeys, [key]: value };
    onChange(newKeys);
    // Save to localStorage
    localStorage.setItem('oren_api_keys', JSON.stringify(newKeys));
  };

  return (
    <div className="space-y-2.5">
      <ApiKeyField
        label="OpenRouter"
        value={apiKeys.openRouter}
        onChange={(v) => updateKey('openRouter', v)}
        placeholder="sk-or-..."
        disabled={disabled}
      />
      <ApiKeyField
        label="E2B"
        value={apiKeys.e2b}
        onChange={(v) => updateKey('e2b', v)}
        placeholder="e2b_..."
        disabled={disabled}
      />
      <ApiKeyField
        label="Exa"
        value={apiKeys.exa}
        onChange={(v) => updateKey('exa', v)}
        placeholder="exa-..."
        disabled={disabled}
      />
      <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
        Keys are stored locally in your browser and sent directly to providers. Never shared with our servers.
      </p>
    </div>
  );
}

// Helper to load API keys from localStorage
export function loadApiKeys(): ApiKeys {
  if (typeof window === 'undefined') {
    return { openRouter: '', e2b: '', exa: '' };
  }
  try {
    const stored = localStorage.getItem('oren_api_keys');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { openRouter: '', e2b: '', exa: '' };
}

// Helper to check if all required keys are set
export function hasAllApiKeys(keys: ApiKeys): boolean {
  return keys.openRouter.trim() !== '' && keys.e2b.trim() !== '' && keys.exa.trim() !== '';
}

// Helper to check if this is a first-time user (no keys configured)
export function isFirstTimeUser(): boolean {
  if (typeof window === 'undefined') return true;
  const keys = loadApiKeys();
  return !hasAllApiKeys(keys);
}
