'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2, AlertCircle, ImageIcon, Download } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface ReportViewerProps {
  sessionId: string | null;
  isComplete: boolean;
}

/**
 * Transform image paths in markdown to use the API endpoint
 * Handles both relative paths (agents/agent_1/charts/chart.png) and 
 * paths that might be referenced differently
 */
function transformImagePath(src: string, sessionId: string): string {
  // If it's already an absolute URL, return as-is
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }
  
  // Build the API URL for serving images from the session's report directory
  // The backend should serve files from: reports/{sessionId}/{path}
  return `${API_BASE}/api/files/${sessionId}/${src}`;
}

export function ReportViewer({ sessionId, isComplete }: ReportViewerProps) {
  const [report, setReport] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!sessionId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`${API_BASE}/api/report/${sessionId}/pdf`);

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : `report_${sessionId}.pdf`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading PDF:', err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !isComplete) {
      setReport('');
      setError(null);
      return;
    }

    const fetchReport = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/api/report/${sessionId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch report: ${response.statusText}`);
        }

        const data = await response.json();
        setReport(data.report || '# No report generated yet\n\nThe report will appear here once the research is complete.');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load report';
        setError(errorMessage);
        console.error('Error fetching report:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [sessionId, isComplete]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium tracking-wide uppercase">No Report Generated</p>
        </div>
      </div>
    );
  }

  if (!isComplete) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-3 opacity-50 animate-spin" />
          <p className="text-sm">Research in progress...</p>
          <p className="text-xs mt-1">Report will be generated upon completion</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <p className="text-sm">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <div className="text-center max-w-md px-4">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-2">Failed to load report</p>
          <p className="text-xs text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto py-16 px-8">
        {/* Download PDF Button - Top Left */}
        <div className="flex justify-start mb-6">
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:cursor-not-allowed text-zinc-200 text-sm font-medium rounded-lg transition-colors border border-zinc-700"
          >
            {isDownloading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Download PDF</span>
              </>
            )}
          </button>
        </div>

        <article className="prose prose-invert prose-zinc max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Customize heading styles
              h1: ({ node, ...props }) => (
                <h1 className="text-4xl font-bold text-white tracking-tight leading-tight mb-6 pb-4 border-b border-zinc-800" {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-xl font-semibold text-white mt-8 mb-4" {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-semibold text-zinc-200 mt-6 mb-3" {...props} />
              ),
              // Customize paragraph
              p: ({ node, ...props }) => (
                <p className="text-zinc-400 mb-4 leading-8" {...props} />
              ),
              // Customize links
              a: ({ node, ...props }) => (
                <a
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                />
              ),
              // Customize code blocks
              code: ({ node, inline, ...props }: any) =>
                inline ? (
                  <code className="bg-zinc-800 text-emerald-500 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
                ) : (
                  <code className="block bg-zinc-900 text-zinc-300 p-4 rounded-lg overflow-x-auto font-mono text-sm" {...props} />
                ),
              // Customize blockquotes
              blockquote: ({ node, ...props }) => (
                <blockquote className="border-l-4 border-zinc-600 pl-4 py-2 my-4 bg-zinc-900/30 italic text-zinc-400" {...props} />
              ),
              // Customize lists
              ul: ({ node, ...props }) => (
                <ul className="list-disc pl-6 mb-4 text-zinc-400 space-y-2" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal pl-6 mb-4 text-zinc-400 space-y-2" {...props} />
              ),
              li: ({ node, children, ...props }) => (
                <li className="pl-2" {...props}>
                  {children}
                </li>
              ),
              // Customize tables
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full border border-zinc-800 rounded-lg" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead className="bg-zinc-900" {...props} />
              ),
              th: ({ node, ...props }) => (
                <th className="border border-zinc-800 px-4 py-2 text-left text-zinc-200 font-semibold" {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="border border-zinc-800 px-4 py-2 text-zinc-300" {...props} />
              ),
              // Customize horizontal rules
              hr: ({ node, ...props }) => (
                <hr className="my-8 border-zinc-800" {...props} />
              ),
              // Customize images - handle chart images from agents
              img: ({ node, src, alt, ...props }) => {
                // Transform the image source to use the API endpoint
                const imageSrc = src && sessionId ? transformImagePath(src, sessionId) : src;
                
                return (
                  <figure className="my-6">
                    <div className="relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageSrc}
                        alt={alt || 'Chart'}
                        className="w-full h-auto"
                        loading="lazy"
                        onError={(e) => {
                          // Show placeholder on error
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.nextElementSibling;
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }}
                        {...props}
                      />
                      <div 
                        className="hidden items-center justify-center py-12 text-zinc-500"
                        style={{ display: 'none' }}
                      >
                        <div className="text-center">
                          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">Image not available</p>
                          <p className="text-[10px] text-zinc-600 mt-1">{src}</p>
                        </div>
                      </div>
                    </div>
                    {alt && (
                      <figcaption className="text-center text-xs text-zinc-500 mt-2 italic">
                        {alt}
                      </figcaption>
                    )}
                  </figure>
                );
              },
            }}
          >
            {report}
          </ReactMarkdown>
        </article>
        <div className="h-20" />
      </div>
    </div>
  );
}
