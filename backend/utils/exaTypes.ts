/**
 * Type definitions for Exa Search API (exa-js package)
 * These types provide proper TypeScript support for the Exa client
 */

// ============================================
// Search Options
// ============================================

export interface ExaTextOptions {
  max_characters?: number;
  include_html_tags?: boolean;
}

export interface ExaHighlightsOptions {
  highlights_per_url?: number;
  num_sentences?: number;
  query?: string;
}

export interface ExaContentsOptions {
  text?: ExaTextOptions | boolean;
  highlights?: ExaHighlightsOptions | boolean;
  summary?: {
    query?: string;
  } | boolean;
}

export interface ExaSearchOptions {
  num_results?: number;
  type?: 'keyword' | 'neural' | 'auto';
  use_autoprompt?: boolean;
  start_published_date?: string;
  end_published_date?: string;
  start_crawl_date?: string;
  end_crawl_date?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  category?: string;
  contents?: ExaContentsOptions;
}

// ============================================
// Search Results
// ============================================

export interface ExaSearchResult {
  title: string;
  url: string;
  id: string;
  score?: number;
  published_date?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  highlight_scores?: number[];
  summary?: string;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
  autoprompt_string?: string;
  request_id?: string;
}

// ============================================
// Exa Client Interface
// ============================================

export interface ExaClient {
  search(query: string, options?: Omit<ExaSearchOptions, 'contents'>): Promise<ExaSearchResponse>;
  searchAndContents(query: string, options?: ExaSearchOptions): Promise<ExaSearchResponse>;
  getContents(ids: string[], options?: ExaContentsOptions): Promise<ExaSearchResponse>;
  findSimilar(url: string, options?: ExaSearchOptions): Promise<ExaSearchResponse>;
  findSimilarAndContents(url: string, options?: ExaSearchOptions): Promise<ExaSearchResponse>;
}

// ============================================
// Transformed Result for Internal Use
// ============================================

export interface TransformedSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  author?: string;
  publishedDate?: string;
  score?: number;
}

/**
 * Transform Exa search results to our internal format
 */
export function transformExaResults(results: ExaSearchResult[]): TransformedSearchResult[] {
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text?.substring(0, 200),
    content: r.text,
    author: r.author,
    publishedDate: r.published_date,
    score: r.score,
  }));
}






