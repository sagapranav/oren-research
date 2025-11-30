'use client';

import { ReactNode, useState, useEffect } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface TabbedPanelProps {
  tabs: Tab[];
  defaultActiveTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export function TabbedPanel({
  tabs,
  defaultActiveTab,
  activeTab: controlledActiveTab,
  onTabChange
}: TabbedPanelProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultActiveTab || tabs[0]?.id || ''
  );

  // Use controlled or uncontrolled state
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const handleTabClick = (tabId: string) => {
    if (!controlledActiveTab) {
      setInternalActiveTab(tabId);
    }
    onTabChange?.(tabId);
  };

  // Update internal state if controlled value changes
  useEffect(() => {
    if (controlledActiveTab) {
      setInternalActiveTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-800 bg-gray-900/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`
              px-4 py-3 text-sm font-medium transition-colors relative
              flex items-center gap-2
              ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300 border-b-2 border-transparent'
              }
            `}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTabContent}
      </div>
    </div>
  );
}
