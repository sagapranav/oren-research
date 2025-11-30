/**
 * web_search tool - Search the web using Exa AI and summarize results with Gemini
 * Raw search results never enter the model's context - only summaries are returned
 */

import { tool, streamText } from 'ai';
import { z } from 'zod';
import { exaRateLimiter } from '../../utils/exa-rate-limiter.js';
import type { WebSearchResult } from '../../../shared/types/index.js';
import { ToolErrors } from '../../../shared/types/tools.js';
import type { ExaSearchOptions, ExaSearchResponse } from '../../utils/exaTypes.js';
import type { SubAgentContext } from './types.js';
import { getSearchSummarizationPrompt } from '../../prompts/tools/search_summarization.js';

export function createWebSearchTool(ctx: SubAgentContext) {
  return tool({
    description: "Search the web for information using Exa AI. Results are automatically summarized to extract key facts and figures.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      description: z.string().describe("A brief 5-6 word summary of what you're searching for, for UI display (e.g., 'Finding 2024 market size data')"),
      num_results: z.number().optional().default(5).describe("Number of results"),
      search_type: z.enum(["keyword", "neural"]).optional().default("neural"),
      use_autoprompt: z.boolean().optional().default(true),
      start_published_date: z.string().optional().describe("Filter by publish date (YYYY-MM-DD)"),
    }),

    execute: async (params, { toolCallId }): Promise<WebSearchResult> => {
      // Emit tool start event
      const description = params.description || `Searching "${params.query.substring(0, 30)}..."`;
      ctx.emitToolStart(toolCallId, 'web_search', params as unknown as Record<string, unknown>, description);
      // Check tool call limits
      const limitError = ctx.checkToolCallLimit('web_search');
      if (limitError) {
        const result = {
          success: false,
          error: limitError.message,
          errorInfo: limitError,
        };
        ctx.emitToolEnd(toolCallId, result, false);
        return result;
      }

      const startTime = Date.now();

      // Detailed logging of search parameters
      ctx.logger.info(`${ctx.id} [SEARCH] Starting web search`);
      ctx.logger.debug(`${ctx.id} [SEARCH] Query: "${params.query}"`);
      ctx.logger.debug(`${ctx.id} [SEARCH] Query type: ${typeof params.query}`);
      ctx.logger.debug(`${ctx.id} [SEARCH] Full params: ${JSON.stringify(params, null, 2)}`);

      try {
        // Build Exa search options with proper types
        const searchOptions: ExaSearchOptions = {
          num_results: params.num_results || 5,
          type: params.search_type || 'neural',
          use_autoprompt: params.use_autoprompt !== false,
          contents: {
            text: {
              max_characters: 2000,
              include_html_tags: false
            }
          }
        };

        if (params.start_published_date) {
          searchOptions.start_published_date = params.start_published_date;
        }

        ctx.logger.debug(`${ctx.id} [SEARCH] Search options: ${JSON.stringify(searchOptions, null, 2)}`);
        ctx.logger.debug(`${ctx.id} [SEARCH] Calling Exa API with query="${params.query}" (type: ${typeof params.query})`);

        const searchResults = await exaRateLimiter.enqueue(() =>
          ctx.exaClient.searchAndContents(params.query, searchOptions)
        ) as ExaSearchResponse;

        const searchDuration = Date.now() - startTime;
        ctx.logger.success(`${ctx.id} [SEARCH] Exa search completed in ${searchDuration}ms, found ${searchResults.results.length} results`);
        ctx.logger.debug(`${ctx.id} [SEARCH] Autoprompt: ${searchResults.autoprompt_string || 'none'}`);

        // Compile all raw content for summarization
        const rawResultsForSummary = searchResults.results.map((r, i) => {
          return `[Source ${i + 1}: ${r.title}]\nURL: ${r.url}\n${r.text || 'No content available'}`;
        }).join('\n\n---\n\n');

        // Summarize all results together using Gemini
        ctx.logger.info(`${ctx.id} [SEARCH] Summarizing ${searchResults.results.length} results with ${ctx.summarizerModel}`);
        const summarizeStart = Date.now();

        let summary = '';
        try {
          const summaryResult = await streamText({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            model: ctx.openrouter.chat(ctx.summarizerModel) as any,
            system: getSearchSummarizationPrompt(),
            messages: [{
              role: "user",
              content: `Search query: "${params.query}"\n\nExtract and synthesize the key information from these search results. Include ALL numbers, statistics, and specific figures mentioned:\n\n${rawResultsForSummary}`
            }],
            temperature: 0.4,
            maxOutputTokens: 1000,
          });

          for await (const part of summaryResult.textStream) {
            summary += part;
          }
        } catch (summarizeError: unknown) {
          const errMsg = summarizeError instanceof Error ? summarizeError.message : 'Unknown error';
          ctx.logger.warn(`${ctx.id} [SEARCH] Summarization failed: ${errMsg}, returning snippets instead`);
          // Fallback to snippets if summarization fails
          summary = searchResults.results.map((r, i) =>
            `[${i + 1}] ${r.title}: ${r.text?.substring(0, 300) || 'No content'}...`
          ).join('\n\n');
        }

        const summarizeDuration = Date.now() - summarizeStart;
        ctx.logger.success(`${ctx.id} [SEARCH] Summarization completed in ${summarizeDuration}ms (${summary.length} chars)`);

        // Build results with only metadata (no raw content) plus the summary
        const results = searchResults.results.map((r) => ({
          title: r.title,
          url: r.url,
          author: r.author,
          publishedDate: r.published_date,
          score: r.score
        }));

        const totalDuration = Date.now() - startTime;
        await ctx.appendToWorklog(
          `\n### Web Search: "${params.query}"\nFound ${results.length} results, summarized in ${totalDuration}ms\n`
        );

        ctx.recordToolCall('web_search', true);
        const result = {
          success: true,
          results,
          summary, // The summarized content - this is what enters model context
          count: results.length,
          searchQuery: searchResults.autoprompt_string || params.query
        };
        ctx.emitToolEnd(toolCallId, result, true);
        return result;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown search error';
        ctx.logger.error(`${ctx.id} search failed: ${errorMessage}`);
        ctx.recordToolCall('web_search', false);

        // Provide better error info
        const isRateLimited = errorMessage.toLowerCase().includes('rate') || errorMessage.toLowerCase().includes('429');
        const errorInfo = isRateLimited
          ? ToolErrors.searchRateLimited()
          : ToolErrors.searchFailed(errorMessage);

        const result = {
          success: false,
          error: errorMessage,
          errorInfo,
        };
        ctx.emitToolEnd(toolCallId, result, false);
        return result;
      }
    },
  });
}
