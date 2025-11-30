'use client';

import { useState, useEffect } from 'react';
import { TaskInput } from '@/components/TaskInput';
import { SimpleOrchestrationView } from '@/components/SimpleOrchestrationView';
import { StatusPanel } from '@/components/StatusPanel';
import { ReportViewer } from '@/components/ReportViewer';
import { DisambiguationPanel } from '@/components/DisambiguationPanel';
import { ModelSelectorContent, DEFAULT_MODELS, type ModelConfig } from '@/components/ModelSelector';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { ApiKeysPanel, loadApiKeys, hasAllApiKeys, type ApiKeys } from '@/components/ApiKeysPanel';
import { useReportStream } from '@/hooks/useReportStream';
import { Layers, FileText } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface Clarification {
  id: string;
  label: string;
  question: string;
  options: { id: string; label: string }[];
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'live' | 'report'>('live');
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODELS);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ openRouter: '', e2b: '', exa: '' });
  const [showConfigGlow, setShowConfigGlow] = useState(false);

  // Load API keys from localStorage on mount
  useEffect(() => {
    const keys = loadApiKeys();
    setApiKeys(keys);
    // Show glow if first-time user (no keys configured)
    if (!hasAllApiKeys(keys)) {
      setShowConfigGlow(true);
      // Auto-hide glow after animation completes (3 pulses * 2s = 6s)
      const timer = setTimeout(() => setShowConfigGlow(false), 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Hide glow when all keys are configured
  useEffect(() => {
    if (hasAllApiKeys(apiKeys)) {
      setShowConfigGlow(false);
    }
  }, [apiKeys]);

  // Disambiguation state
  const [showDisambiguation, setShowDisambiguation] = useState(false);
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [isLoadingClarifications, setIsLoadingClarifications] = useState(false);
  const [disambiguationSummary, setDisambiguationSummary] = useState<{ label: string; value: string }[] | null>(null);

  const { events, agents, planSteps, status, flowData, progress, sessionStartTime } = useReportStream(sessionId);

  // Auto-switch to report tab when research is completed
  useEffect(() => {
    if (status.status === 'completed') {
      setViewMode('report');
    }
  }, [status.status]);

  // Start the disambiguation flow
  const handleSubmit = async (query: string) => {
    if (!query.trim()) return;

    // If we already have a pending query and disambiguation failed, proceed directly
    if (pendingQuery && error) {
      await startReportGeneration(pendingQuery, '');
      return;
    }

    setPendingQuery(query);
    setIsLoadingClarifications(true);
    setError(null);

    try {
      // First, get clarifications from the LLM
      const disambigResponse = await fetch(`${API_BASE}/api/disambiguate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKeys.openRouter && { 'X-OpenRouter-Key': apiKeys.openRouter }),
        },
        body: JSON.stringify({ query, model: modelConfig.searchSummarisation }),
      });

      if (!disambigResponse.ok) {
        // If disambiguation fails, show error but don't proceed
        const errorData = await disambigResponse.json().catch(() => ({}));
        setError(`Disambiguation failed: ${errorData.message || 'Unknown error'}. Click START to proceed without clarifications.`);
        setIsLoadingClarifications(false);
        return;
      }

      const { clarifications: clarifs } = await disambigResponse.json();
      setClarifications(clarifs);
      setShowDisambiguation(true);
    } catch (err) {
      // On error, show error but don't proceed automatically
      console.error('Disambiguation error:', err);
      setError('Failed to generate clarifications. Click START to proceed without clarifications.');
    } finally {
      setIsLoadingClarifications(false);
    }
  };

  // Start report generation with optional clarification context
  const startReportGeneration = async (query: string, clarificationContext: string) => {
    setIsSubmitting(true);
    setShowDisambiguation(false);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKeys.openRouter && { 'X-OpenRouter-Key': apiKeys.openRouter }),
          ...(apiKeys.e2b && { 'X-E2B-Key': apiKeys.e2b }),
          ...(apiKeys.exa && { 'X-Exa-Key': apiKeys.exa }),
        },
        body: JSON.stringify({ query, clarificationContext, models: modelConfig }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setSessionId(data.sessionId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create report';
      setError(errorMessage);
      console.error('Error creating report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format clarification selections into a context string (includes label + description for planning)
  const formatClarifications = (
    selections: Record<string, string[]>,
    customInputs: Record<string, string>
  ): string => {
    return clarifications.map(c => {
      const selectedIds = selections[c.id];
      if (!selectedIds || selectedIds.length === 0) return `- ${c.label}: Not specified`;
      if (selectedIds.includes('custom')) {
        return `- ${c.label}: ${customInputs[c.id] || 'Not specified'}`;
      }
      // Include both label and description for richer context
      const selectedDetails = selectedIds
        .map(id => {
          const option = c.options.find(o => o.id === id);
          if (!option) return null;
          return option.description
            ? `${option.label} (${option.description})`
            : option.label;
        })
        .filter(Boolean)
        .join('; ');
      return `- ${c.label}: ${selectedDetails || 'Not specified'}`;
    }).join('\n');
  };

  // Handle disambiguation completion
  const handleDisambiguationComplete = async (
    selections: Record<string, string[]>,
    customInputs: Record<string, string>
  ) => {
    // Save summary for display during research
    const summary = clarifications.map(c => {
      const selectedIds = selections[c.id];
      let value = 'Not specified';
      if (selectedIds && selectedIds.includes('custom')) {
        value = customInputs[c.id] || 'Not specified';
      } else if (selectedIds && selectedIds.length > 0) {
        const selectedLabels = selectedIds
          .map(id => c.options.find(o => o.id === id)?.label)
          .filter(Boolean)
          .join(', ');
        value = selectedLabels || 'Not specified';
      }
      return { label: c.label, value };
    });
    setDisambiguationSummary(summary);

    const context = formatClarifications(selections, customInputs);
    await startReportGeneration(pendingQuery!, context);
  };

  // Handle disambiguation skip
  const handleDisambiguationSkip = async () => {
    await startReportGeneration(pendingQuery!, '');
  };

  const handleReset = () => {
    setSessionId(null);
    setError(null);
    setViewMode('live');
    setShowDisambiguation(false);
    setClarifications([]);
    setPendingQuery(null);
    setDisambiguationSummary(null);
  };

  const isResearching = status.status === 'executing' || status.status === 'planning' || status.status === 'initializing';
  const hasReport = status.status === 'completed';

  return (
    <div className="h-screen w-screen flex bg-black text-zinc-100">

      {/* Sidebar - Controls */}
      <aside className="w-[440px] flex flex-col border-r border-zinc-800 bg-zinc-950/50 z-10 flex-shrink-0">
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 gap-3">
          <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center text-[#0a0a0b] font-bold text-sm">
            O
          </div>
          <span className="font-semibold tracking-tight text-sm">OREN RESEARCH</span>
        </div>

        {/* Input Section */}
        <div className="p-6 flex flex-col gap-4">
          <TaskInput
            onSubmit={handleSubmit}
            disabled={isSubmitting || isLoadingClarifications || !!sessionId || showDisambiguation}
            isLoading={isSubmitting || isLoadingClarifications}
            onReset={sessionId ? handleReset : undefined}
          />
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Disambiguation Panel */}
        {(showDisambiguation || isLoadingClarifications) && (
          <div className="border-t border-zinc-800 flex-1 overflow-y-auto">
            <DisambiguationPanel
              clarifications={clarifications}
              onComplete={handleDisambiguationComplete}
              onSkip={handleDisambiguationSkip}
              isLoading={isLoadingClarifications}
            />
          </div>
        )}

        {/* Disambiguation Summary - shown during/after research */}
        {disambiguationSummary && !showDisambiguation && sessionId && (
          <div className="px-6 py-4 border-t border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase font-medium mb-3 tracking-wider">Research Scope</div>
            <div className="space-y-2">
              {disambiguationSummary.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">{item.label}</span>
                  <span className="text-emerald-500 text-right max-w-[60%] truncate">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan Steps */}
        {planSteps.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-800 flex-1 overflow-y-auto">
            <div className="text-[10px] text-zinc-500 uppercase font-medium mb-3 tracking-wider">Orchestrator Plan</div>
            <div className="space-y-2">
              {planSteps.map((step) => (
                <div
                  key={step.id}
                  className={`p-2 rounded border text-xs ${
                    step.status === 'completed'
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                      : step.status === 'in_progress'
                      ? 'bg-blue-900/20 border-blue-700/30 text-blue-300'
                      : 'bg-zinc-800/20 border-zinc-700/30 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono opacity-60">{step.id}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold ${
                      step.status === 'completed' ? 'bg-emerald-800' :
                      step.status === 'in_progress' ? 'bg-blue-700' : 'bg-zinc-700'
                    }`}>
                      {step.status}
                    </span>
                  </div>
                  <div className="text-[11px]">{step.description}</div>
                  {step.agent_ids.length > 0 && (
                    <div className="mt-1 text-[9px] opacity-60">
                      Agents: {step.agent_ids.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Configuration Sections - always at bottom */}
        <div className="mt-auto">
          {/* API Keys Section */}
          <CollapsibleSection
            title="API Keys"
            defaultOpen={!hasAllApiKeys(apiKeys)}
            showGlow={showConfigGlow}
          >
            <ApiKeysPanel
              apiKeys={apiKeys}
              onChange={setApiKeys}
              disabled={!!sessionId || isSubmitting}
            />
          </CollapsibleSection>

          {/* Model Configuration Section */}
          <CollapsibleSection
            title="Model Configuration"
            defaultOpen={false}
            showGlow={showConfigGlow}
          >
            <ModelSelectorContent
              models={modelConfig}
              onChange={setModelConfig}
              disabled={!!sessionId || isSubmitting}
            />
          </CollapsibleSection>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-black overflow-hidden">

        {/* Top Navigation Bar */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-black/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setViewMode('live')}
              className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
                viewMode === 'live'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Layers size={14} />
              <span>AGENT WORKFLOW</span>
            </button>
            <button
              onClick={() => hasReport && setViewMode('report')}
              disabled={!hasReport}
              className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
                viewMode === 'report'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              } ${!hasReport ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FileText size={14} />
              <span>Final Report</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <StatusPanel
              status={status}
              progress={progress}
              sessionId={sessionId}
            />
          </div>
        </header>

        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden">

          {/* LIVE VIEW */}
          <div
            className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${
              viewMode === 'live' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            {/* Graph Area - Full height now */}
            <div className="flex-1 bg-[#020203] min-h-0 p-4">
              <div className="h-full bg-black rounded-lg border border-zinc-800 overflow-hidden">
                <SimpleOrchestrationView
                  agents={agents}
                  sessionStartTime={sessionStartTime}
                  isComplete={status.status === 'completed'}
                />
              </div>
            </div>
          </div>

          {/* REPORT VIEW */}
          <div
            className={`absolute inset-0 bg-zinc-950 transition-opacity duration-500 overflow-hidden ${
              viewMode === 'report' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <ReportViewer sessionId={sessionId} isComplete={status.status === 'completed'} />
          </div>

        </div>

      </main>
    </div>
  );
}
