/**
 * Centralized rate limiter for Exa API with retry support
 * Uses a simple serial queue with enforced minimum delay between requests
 * to prevent rate limit errors across all parallel agents.
 */

import { createLogger } from '../logger.js';

const logger = createLogger('ExaRateLimiter');

interface QueueItem<T> {
  searchFn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retryCount: number;
  maxRetries: number;
}

interface RetryConfig {
  maxRetries?: number;
}

class ExaRateLimiter {
  // Minimum delay between requests (350ms = ~2.8 requests/sec, leaving headroom for 5/sec limit)
  private minDelayMs: number;
  private queue: QueueItem<any>[];
  private isProcessing: boolean;
  private lastRequestTime: number;

  // Default retry configuration
  private defaultMaxRetries = 3;

  constructor(minDelayMs: number = 350) {
    this.minDelayMs = minDelayMs;
    this.queue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;

    logger.info(`Initialized with ${minDelayMs}ms minimum delay between requests`);
  }

  /**
   * Add a search request to the queue with automatic retry on transient failures
   * @param searchFn - Async function that performs the search
   * @param config - Optional retry configuration
   * @returns Promise that resolves with search results
   */
  async enqueue<T>(searchFn: () => Promise<T>, config?: RetryConfig): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        searchFn,
        resolve,
        reject,
        retryCount: 0,
        maxRetries: config?.maxRetries ?? this.defaultMaxRetries,
      });

      // Only start processing if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Rate limit errors
    if (error.status === 429) return true;

    // Server errors (5xx)
    if (error.status >= 500 && error.status < 600) return true;

    // Network errors
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('rate limit') ||
        errorMsg.includes('network') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('socket')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for exponential backoff
   */
  private getRetryDelay(retryCount: number, error: any): number {
    // For rate limits, use longer delay
    if (error.status === 429 || error.message?.toLowerCase().includes('rate limit')) {
      // Check for Retry-After header
      const retryAfter = error.headers?.['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
      // 2s, 4s, 8s for rate limits
      return 2000 * Math.pow(2, retryCount);
    }

    // Standard exponential backoff: 1s, 2s, 4s...
    return 1000 * Math.pow(2, retryCount);
  }

  /**
   * Wait until we can make the next request
   */
  private async waitForNextSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Process the queue one item at a time with enforced spacing
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Wait for rate limit slot
      await this.waitForNextSlot();

      const item = this.queue.shift()!;
      this.lastRequestTime = Date.now();

      try {
        const result = await item.searchFn();
        item.resolve(result);
      } catch (error: any) {
        // Check if we should retry
        if (this.isRetryableError(error) && item.retryCount < item.maxRetries) {
          const delay = this.getRetryDelay(item.retryCount, error);
          item.retryCount++;

          logger.warn(`Exa API request failed (attempt ${item.retryCount}/${item.maxRetries + 1}): ${error.message}`);
          logger.info(`Retrying in ${delay}ms...`);

          // Wait for backoff delay, then add back to queue
          await new Promise(resolve => setTimeout(resolve, delay));
          this.queue.unshift(item); // Add to front of queue for priority retry
        } else {
          // Max retries exceeded or non-retryable error
          if (item.retryCount > 0) {
            logger.error(`Exa API request failed after ${item.retryCount + 1} attempts: ${error.message}`);
          }
          item.reject(error as Error);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get current queue length for debugging
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

// Singleton instance with 350ms minimum delay (~2.8 req/sec, well under 5/sec limit)
export const exaRateLimiter = new ExaRateLimiter(350);
