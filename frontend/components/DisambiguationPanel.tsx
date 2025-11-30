'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, ChevronRight, SkipForward } from 'lucide-react';

interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
}

interface Clarification {
  id: string;
  label: string;
  question: string;
  options: ClarificationOption[];
}

interface DisambiguationPanelProps {
  clarifications: Clarification[];
  onComplete: (selections: Record<string, string[]>, customInputs: Record<string, string>) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export function DisambiguationPanel({
  clarifications,
  onComplete,
  onSkip,
  isLoading,
}: DisambiguationPanelProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
  const [isTypingMode, setIsTypingMode] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const currentClarification = clarifications[activeTab];
  const currentOptions = currentClarification?.options || [];

  // Auto-scroll active tab into view
  useEffect(() => {
    if (tabRefs.current[activeTab]) {
      tabRefs.current[activeTab]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTab]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComplete || isLoading) return;

      if (isTypingMode) {
        if (e.key === 'Escape') {
          setIsTypingMode(false);
        } else if (e.key === 'Enter' && e.ctrlKey) {
          handleNext();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev > 0 ? prev - 1 : currentOptions.length - 1
          );
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedOptionIndex((prev) =>
            prev < currentOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (activeTab > 0) {
            setActiveTab(activeTab - 1);
            setFocusedOptionIndex(0);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (activeTab < clarifications.length - 1) {
            setActiveTab(activeTab + 1);
            setFocusedOptionIndex(0);
          }
          break;
        case 'Enter':
          e.preventDefault();
          const selectedOption = currentOptions[focusedOptionIndex];
          if (selectedOption?.id === 'custom') {
            setIsTypingMode(true);
          } else {
            // Toggle selection for multi-select
            setSelectedOptions((prev) => {
              const currentSelections = prev[currentClarification.id] || [];
              const isSelected = currentSelections.includes(selectedOption?.id);
              return {
                ...prev,
                [currentClarification.id]: isSelected
                  ? currentSelections.filter(id => id !== selectedOption?.id)
                  : [...currentSelections, selectedOption?.id],
              };
            });
          }
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey && activeTab > 0) {
            setActiveTab(activeTab - 1);
          } else if (!e.shiftKey && activeTab < clarifications.length - 1) {
            setActiveTab(activeTab + 1);
          }
          setFocusedOptionIndex(0);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, focusedOptionIndex, isTypingMode, currentOptions, isComplete, isLoading, clarifications.length, currentClarification?.id]);

  const handleNext = useCallback(() => {
    if (activeTab < clarifications.length - 1) {
      setActiveTab(activeTab + 1);
      setFocusedOptionIndex(0);
      setIsTypingMode(false);
    } else {
      setIsComplete(true);
    }
  }, [activeTab, clarifications.length]);

  const handleOptionClick = (optionId: string, index: number) => {
    setFocusedOptionIndex(index);
    if (optionId === 'custom') {
      setIsTypingMode(true);
    } else {
      // Toggle selection for multi-select
      setSelectedOptions((prev) => {
        const currentSelections = prev[currentClarification.id] || [];
        const isSelected = currentSelections.includes(optionId);
        return {
          ...prev,
          [currentClarification.id]: isSelected
            ? currentSelections.filter(id => id !== optionId)
            : [...currentSelections, optionId],
        };
      });
    }
  };

  const handleCustomInput = (value: string) => {
    setCustomInputs((prev) => ({
      ...prev,
      [currentClarification.id]: value,
    }));
  };

  const handleSubmitCustom = () => {
    if (customInputs[currentClarification.id]?.trim()) {
      setSelectedOptions((prev) => ({
        ...prev,
        [currentClarification.id]: ['custom'],
      }));
      handleNext();
    }
  };

  const getTabStatus = (index: number) => {
    const clarification = clarifications[index];
    if (selectedOptions[clarification.id]?.length > 0) return 'completed';
    if (index === activeTab) return 'active';
    return 'pending';
  };

  const handleRestart = () => {
    setActiveTab(0);
    setSelectedOptions({});
    setCustomInputs({});
    setFocusedOptionIndex(0);
    setIsTypingMode(false);
    setIsComplete(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-sm text-zinc-400">Analyzing your query...</span>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Clarification Complete</span>
        </div>

        {/* Summary */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-4">
          <h3 className="text-xs text-zinc-400 mb-3 uppercase tracking-wider">Summary</h3>
          <div className="space-y-2">
            {clarifications.map((c) => {
              const selections = selectedOptions[c.id] || [];
              let displayValue = 'Skipped';

              if (selections.includes('custom')) {
                const customValue = customInputs[c.id] || '';
                displayValue = customValue.length > 40
                  ? customValue.substring(0, 40) + '...'
                  : customValue || 'Custom (empty)';
              } else if (selections.length > 0) {
                const labels = selections
                  .map(id => c.options.find((o) => o.id === id)?.label)
                  .filter(Boolean);
                displayValue = labels.length > 0 ? labels.join(', ') : 'Skipped';
              }

              return (
                <div key={c.id} className="flex justify-between items-start text-xs gap-2">
                  <span className="text-zinc-500 flex-shrink-0">{c.label}</span>
                  <span className="text-emerald-500 text-right max-w-[60%] truncate" title={displayValue}>
                    {displayValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onComplete(selectedOptions, customInputs)}
            className="w-full py-2.5 bg-emerald-600 text-black font-medium rounded-md text-xs hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
          >
            <ChevronRight size={14} />
            START RESEARCH
          </button>
          <button
            onClick={handleRestart}
            className="w-full py-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Clarification</span>
        </div>
        <button
          onClick={onSkip}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
        >
          <SkipForward size={10} />
          Skip all
        </button>
      </div>

      <h2 className="text-sm text-zinc-300 mb-4">
        Help refine the research objective
      </h2>

      {/* Tab Navigation - Compact numbered dots */}
      <div className="flex items-center gap-2 mb-4">
        {clarifications.map((clarification, index) => {
          const status = getTabStatus(index);
          return (
            <button
              key={clarification.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              onClick={() => {
                setActiveTab(index);
                setFocusedOptionIndex(0);
                setIsTypingMode(false);
              }}
              title={clarification.label}
              className={`
                w-6 h-6 rounded-full text-[10px] font-medium transition-all flex items-center justify-center
                ${status === 'active'
                  ? 'bg-emerald-600 text-black ring-2 ring-emerald-600/30'
                  : status === 'completed'
                    ? 'bg-emerald-600/20 text-emerald-500'
                    : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                }
              `}
            >
              {status === 'completed' ? <Check size={10} /> : index + 1}
            </button>
          );
        })}
        <span className="text-[10px] text-zinc-500 ml-2">{clarifications[activeTab]?.label}</span>
      </div>

      {/* Progress Bar */}
      <div className="h-0.5 bg-zinc-800 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${((Object.keys(selectedOptions).length) / clarifications.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="mb-3">
        <p className="text-[10px] text-zinc-600 mb-1">
          {activeTab + 1} of {clarifications.length}
        </p>
        <h3 className="text-sm text-zinc-200">
          {currentClarification?.question}
        </h3>
      </div>

      {/* Options */}
      <div className="space-y-1.5 mb-3">
        {currentOptions.map((option, index) => {
          const isSelected = selectedOptions[currentClarification.id]?.includes(option.id);
          const isFocused = focusedOptionIndex === index && !isTypingMode;

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option.id, index)}
              className={`
                w-full px-3 py-2.5 text-left text-xs rounded border transition-all
                group
                ${isFocused
                  ? 'bg-zinc-800 border-emerald-600/50'
                  : isSelected
                    ? 'bg-emerald-600/10 border-emerald-600/30'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`font-medium block ${
                    isSelected ? 'text-emerald-500' : isFocused ? 'text-zinc-100' : 'text-zinc-300'
                  }`}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className={`text-[11px] leading-relaxed mt-0.5 block ${
                      isSelected ? 'text-emerald-500/70' : 'text-zinc-500'
                    }`}>
                      {option.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {isSelected && <Check size={12} className="text-emerald-500" />}
                  {isFocused && !isSelected && (
                    <span className="text-[9px] text-zinc-600">
                      Enter
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Input */}
      {isTypingMode && (
        <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="relative">
            <textarea
              autoFocus
              value={customInputs[currentClarification.id] || ''}
              onChange={(e) => handleCustomInput(e.target.value)}
              placeholder="Type your custom response..."
              className="w-full px-3 py-2 bg-zinc-900 border border-emerald-600/50 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleSubmitCustom();
                }
              }}
            />
            <div className="absolute bottom-2 right-2 text-[9px] text-zinc-600">
              Ctrl+Enter
            </div>
          </div>
          <button
            onClick={handleSubmitCustom}
            disabled={!customInputs[currentClarification.id]?.trim()}
            className="mt-2 w-full py-1.5 bg-emerald-600/10 border border-emerald-600/30 text-emerald-500 rounded text-xs hover:bg-emerald-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => {
            if (activeTab > 0) {
              setActiveTab(activeTab - 1);
              setFocusedOptionIndex(0);
              setIsTypingMode(false);
            }
          }}
          disabled={activeTab === 0}
          className="flex-1 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded text-xs hover:border-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-1.5 bg-emerald-600/10 border border-emerald-600/30 text-emerald-500 rounded text-xs hover:bg-emerald-600/20 transition-colors"
        >
          {activeTab === clarifications.length - 1 ? 'Review & Complete' : 'Next'}
        </button>
      </div>

      {/* Keyboard Hints */}
      <div className="mt-4 pt-3 border-t border-zinc-800">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-600">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500">↵</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500">←→</kbd>
            Tabs
          </span>
        </div>
      </div>
    </div>
  );
}
