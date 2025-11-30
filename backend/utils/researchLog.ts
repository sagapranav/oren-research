/**
 * Research Log - Lightweight persistence of research queries and preferences
 * Stores query + disambiguation data in Supabase, while allowing session folders to be cleaned up
 */

import fs from 'fs/promises';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../logger.js';

const logger = createLogger('ResearchLog');

export interface ModelConfig {
  orchestrator: string;
  planning: string;
  searchSummarisation: string;
  reportWriting: string;
  subagent: string;
}

export interface ResearchLogEntry {
  sessionId: string;
  query: string;
  clarificationContext: string | null;
  models: ModelConfig;
  createdAt: string;
  completedAt: string;
}

// Initialize Supabase client (lazy)
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_API_KEY;

  if (!url || !key) {
    logger.warn('Supabase not configured (SUPABASE_URL or SUPABASE_API_KEY missing)');
    return null;
  }

  supabase = createClient(url, key);
  logger.info('Supabase client initialized');
  return supabase;
}

const LOG_FILE = 'research_log.jsonl';

/**
 * Log research session to Supabase (with local file fallback)
 */
export async function logResearchSession(
  reportsDir: string,
  entry: ResearchLogEntry
): Promise<void> {
  const client = getSupabaseClient();

  if (client) {
    // Primary: Store in Supabase
    try {
      const { error } = await client.from('research_sessions').insert({
        session_id: entry.sessionId,
        query: entry.query,
        clarification_context: entry.clarificationContext,
        models: entry.models,
        created_at: entry.createdAt,
        completed_at: entry.completedAt,
      });

      if (error) {
        logger.error(`Supabase insert failed: ${error.message}`);
        // Fall through to local backup
      } else {
        logger.info(`Logged research session to Supabase: ${entry.sessionId}`);
        return;
      }
    } catch (error: any) {
      logger.error(`Supabase error: ${error.message}`);
    }
  }

  // Fallback: Local JSONL file
  try {
    const logPath = path.join(reportsDir, LOG_FILE);
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(logPath, line, 'utf-8');
    logger.info(`Logged research session to local file: ${entry.sessionId}`);
  } catch (error: any) {
    logger.error(`Failed to log research session: ${error.message}`);
  }
}

/**
 * Schedule deletion of a session folder after a delay
 * Only runs in production (NODE_ENV=production) to preserve files during local development
 */
export function scheduleSessionCleanup(
  reportsDir: string,
  sessionId: string,
  delayMs: number = 10 * 60 * 1000 // Default: 10 minutes
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    logger.debug(`Skipping cleanup scheduling for session ${sessionId} (not in production)`);
    return;
  }

  logger.info(`Scheduling cleanup for session ${sessionId} in ${delayMs / 1000}s`);

  setTimeout(async () => {
    const sessionDir = path.join(reportsDir, sessionId);

    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      logger.info(`Cleaned up session folder: ${sessionId}`);
    } catch (error: any) {
      logger.error(`Failed to cleanup session ${sessionId}: ${error.message}`);
    }
  }, delayMs);
}
