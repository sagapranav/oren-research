import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream, WriteStream } from 'fs';

export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

// Log output configuration
// LOG_OUTPUT: 'console' (default) | 'file' | 'both'
// SAVE_LOGS: legacy support - if set to 'true' or '1', implies LOG_OUTPUT='both'
type LogOutput = 'console' | 'file' | 'both';

// Lazy-loaded config to ensure dotenv has loaded before we read env vars
let _logConfig: { logOutput: LogOutput; consoleEnabled: boolean; fileEnabled: boolean } | null = null;

function getLogConfig() {
  if (_logConfig) return _logConfig;

  // Legacy support: SAVE_LOGS=true implies 'both' (case-insensitive)
  const saveLogs = process.env.SAVE_LOGS?.toLowerCase();
  let logOutput: LogOutput = 'console';

  if (saveLogs === 'true' || saveLogs === '1') {
    logOutput = 'both';
  } else {
    const output = process.env.LOG_OUTPUT?.toLowerCase();
    if (output === 'file' || output === 'both') {
      logOutput = output;
    }
  }

  _logConfig = {
    logOutput,
    consoleEnabled: logOutput === 'console' || logOutput === 'both',
    fileEnabled: logOutput === 'file' || logOutput === 'both',
  };

  return _logConfig;
}

const LOG_DIR = path.join(process.cwd(), 'logging');

// Map to store log file streams for each session
const sessionLogStreams: Map<string, WriteStream> = new Map();
let globalLogStream: WriteStream | null = null;

// Initialize global file logging if file output is enabled
async function initializeGlobalLogging(): Promise<void> {
  if (!getLogConfig().fileEnabled) return;
  
  try {
    // Create logging directory if it doesn't exist
    await fs.mkdir(LOG_DIR, { recursive: true });
    
    // Create global log file for non-session-specific logs
    const globalLogFile = path.join(LOG_DIR, 'app.log');
    globalLogStream = createWriteStream(globalLogFile, { flags: 'a' });
    
    // Write initial log entry
    const timestamp = new Date().toISOString();
    globalLogStream.write(`\n${'='.repeat(80)}\n`);
    globalLogStream.write(`Logging started at ${timestamp}\n`);
    globalLogStream.write(`${'='.repeat(80)}\n\n`);
  } catch (error) {
    console.error('Failed to initialize global file logging:', error);
  }
}

// Get or create a log file stream for a specific session
async function getSessionLogStream(sessionId: string): Promise<WriteStream | null> {
  if (!getLogConfig().fileEnabled) return null;
  
  // Return existing stream if available
  if (sessionLogStreams.has(sessionId)) {
    return sessionLogStreams.get(sessionId)!;
  }
  
  try {
    // Create logging directory if it doesn't exist
    await fs.mkdir(LOG_DIR, { recursive: true });
    
    // Create session-specific log file
    const sessionLogFile = path.join(LOG_DIR, `${sessionId}.log`);
    const stream = createWriteStream(sessionLogFile, { flags: 'a' });
    sessionLogStreams.set(sessionId, stream);
    
    // Write initial log entry for this session
    const timestamp = new Date().toISOString();
    stream.write(`\n${'='.repeat(80)}\n`);
    stream.write(`Session log started at ${timestamp}\n`);
    stream.write(`Session ID: ${sessionId}\n`);
    stream.write(`${'='.repeat(80)}\n\n`);
    
    return stream;
  } catch (error) {
    console.error(`Failed to create log file for session ${sessionId}:`, error);
    return null;
  }
}

// Write log message to file(s)
async function writeToFile(level: string, prefix: string, message: string, sessionId?: string): Promise<void> {
  if (!getLogConfig().fileEnabled) return;

  // Ensure global logging is initialized on first write
  await ensureGlobalLoggingInitialized();

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${prefix} ${message}\n`;

  try {
    // Write to session-specific log file if sessionId is provided
    if (sessionId) {
      const sessionStream = await getSessionLogStream(sessionId);
      if (sessionStream) {
        sessionStream.write(logEntry);
      }
    }

    // Also write to global log file
    if (globalLogStream) {
      globalLogStream.write(logEntry);
    }
  } catch (error) {
    // Silently fail if file write fails to avoid breaking the app
    console.error('Failed to write to log file:', error);
  }
}

// Close a specific session log file
export function closeSessionLog(sessionId: string): void {
  const stream = sessionLogStreams.get(sessionId);
  if (stream) {
    const timestamp = new Date().toISOString();
    stream.write(`\n${'='.repeat(80)}\n`);
    stream.write(`Session log closed at ${timestamp}\n`);
    stream.write(`${'='.repeat(80)}\n\n`);
    stream.end();
    sessionLogStreams.delete(sessionId);
  }
}

// Cleanup function to close all log file streams
export function closeAllLogFiles(): void {
  // Close all session log files
  for (const stream of sessionLogStreams.values()) {
    const timestamp = new Date().toISOString();
    stream.write(`\n${'='.repeat(80)}\n`);
    stream.write(`Session log closed at ${timestamp}\n`);
    stream.write(`${'='.repeat(80)}\n\n`);
    stream.end();
  }
  sessionLogStreams.clear();
  
  // Close global log file
  if (globalLogStream) {
    const timestamp = new Date().toISOString();
    globalLogStream.write(`\n${'='.repeat(80)}\n`);
    globalLogStream.write(`Logging stopped at ${timestamp}\n`);
    globalLogStream.write(`${'='.repeat(80)}\n\n`);
    globalLogStream.end();
    globalLogStream = null;
  }
}

// Flag to track if global logging has been initialized
let globalLoggingInitialized = false;

// Lazy initialization of global file logging (called on first log write)
async function ensureGlobalLoggingInitialized(): Promise<void> {
  if (globalLoggingInitialized || !getLogConfig().fileEnabled) return;
  globalLoggingInitialized = true;
  await initializeGlobalLogging();
}

// Handle process exit to close log files gracefully
process.on('exit', () => {
  closeAllLogFiles();
});

process.on('SIGINT', () => {
  closeAllLogFiles();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeAllLogFiles();
  process.exit(0);
});

export function createLogger(prefix?: string, sessionId?: string): Logger {
  const prefixStr = prefix ? `[${prefix}]` : '';

  return {
    info: (message: string) => {
      if (getLogConfig().consoleEnabled) {
        console.log(chalk.blue(prefixStr), chalk.white(message));
      }
      writeToFile('INFO', prefixStr, message, sessionId).catch(() => {});
    },

    success: (message: string) => {
      if (getLogConfig().consoleEnabled) {
        console.log(chalk.green(prefixStr), chalk.white(message));
      }
      writeToFile('SUCCESS', prefixStr, message, sessionId).catch(() => {});
    },

    warn: (message: string) => {
      if (getLogConfig().consoleEnabled) {
        console.log(chalk.yellow(prefixStr), chalk.white(message));
      }
      writeToFile('WARN', prefixStr, message, sessionId).catch(() => {});
    },

    error: (message: string) => {
      if (getLogConfig().consoleEnabled) {
        console.log(chalk.red(prefixStr), chalk.white(message));
      }
      writeToFile('ERROR', prefixStr, message, sessionId).catch(() => {});
    },

    debug: (message: string) => {
      if (process.env.DEBUG) {
        if (getLogConfig().consoleEnabled) {
          console.log(chalk.gray(prefixStr), chalk.gray(message));
        }
        writeToFile('DEBUG', prefixStr, message, sessionId).catch(() => {});
      }
    }
  };
}
