'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  showGlow?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  showGlow = false,
  onToggle,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  return (
    <div className={`border-t border-zinc-800 ${showGlow ? 'animate-glow-pulse' : ''}`}>
      <button
        onClick={handleToggle}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
      >
        <span className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">
          {title}
        </span>
        <ChevronDown
          size={14}
          className={`text-zinc-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
