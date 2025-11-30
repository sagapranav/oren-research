// Environment variables are loaded via --env-file=.env flag in npm scripts (Node 20.6+)
// This ensures env vars are available before any module initialization

import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs/promises';
import path from 'path';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, Content, ContentImage, ContentText } from 'pdfmake/interfaces';
import { marked, Tokens } from 'marked';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createLogger } from './logger.js';
import { stateManager } from './orchestrator/stateManager.js';
import { StreamingOrchestrator } from './orchestrator/streamingOrchestrator.js';
import { getDisambiguatePrompt } from './prompts/disambiguate.js';
import type {
  CreateReportRequest,
  CreateReportResponse,
  SessionStatusResponse,
  FlowDataResponse,
  ReportResponse,
  HealthResponse,
  ErrorResponse,
  AgentState,
  PlanStep,
} from '../shared/types/index.js';

const logger = createLogger('Server');

// ============================================
// Environment Variable Validation
// ============================================

interface EnvValidation {
  name: string;
  required: boolean;
  description: string;
}

// Check if running in production mode where users provide their own keys
const requireUserKeys = process.env.REQUIRE_USER_KEYS === 'true';

const requiredEnvVars: EnvValidation[] = requireUserKeys
  ? [] // No env keys required in production - users provide via headers
  : [
      { name: 'OPENROUTER_API_KEY', required: true, description: 'OpenRouter API key for LLM access' },
      { name: 'EXASEARCH_API_KEY', required: true, description: 'Exa API key for web search' },
      { name: 'E2B_API_KEY', required: true, description: 'E2B API key for code execution sandbox' },
    ];

const optionalEnvVars: EnvValidation[] = [
  { name: 'MODEL', required: false, description: 'LLM model to use (default: anthropic/claude-haiku-4.5)' },
  { name: 'PORT', required: false, description: 'Server port (default: 3001)' },
  { name: 'DEBUG', required: false, description: 'Enable debug logging' },
  { name: 'LOG_OUTPUT', required: false, description: 'Log output destination: console (default), file, or both' },
  { name: 'SAVE_LOGS', required: false, description: 'Legacy: set to true for LOG_OUTPUT=both' },
  { name: 'REQUIRE_USER_KEYS', required: false, description: 'Set to true for production (users provide API keys)' },
];

function validateEnvironment(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  logger.info('Validating environment variables...');

  if (requireUserKeys) {
    logger.info('Running in PRODUCTION mode (REQUIRE_USER_KEYS=true)');
    logger.info('API keys must be provided by users via request headers');
  }

  for (const env of requiredEnvVars) {
    if (!process.env[env.name]) {
      missing.push(`  ❌ ${env.name} - ${env.description}`);
    } else {
      logger.debug(`  ✓ ${env.name} is set`);
    }
  }

  for (const env of optionalEnvVars) {
    if (!process.env[env.name]) {
      warnings.push(`  ⚠️  ${env.name} not set - ${env.description}`);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing required environment variables:');
    missing.forEach(m => console.error(m));
    console.error('\nPlease set these variables in your .env file or environment.');
    console.error('Example .env file:');
    console.error('  OPENROUTER_API_KEY=your_key_here');
    console.error('  EXASEARCH_API_KEY=your_key_here');
    console.error('  E2B_API_KEY=your_key_here');
    process.exit(1);
  }

  if (warnings.length > 0) {
    logger.warn('Optional environment variables not set:');
    warnings.forEach(w => console.warn(w));
  }

  logger.success('Environment validation passed');
}

// Validate environment on startup
validateEnvironment();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Track orchestrators and active SSE connections for abort handling
const orchestrators = new Map<string, StreamingOrchestrator>();
const activeConnections = new Map<string, number>(); // sessionId -> connection count
const ABORT_GRACE_PERIOD_MS = 5000; // 5 seconds grace period before aborting

// ============================================
// Security Middleware Configuration
// ============================================

// Helmet: Security headers (production only - can interfere with local dev)
if (isProduction) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow loading images in PDF
  }));
  logger.info('Helmet security headers enabled');
}

// CORS: Permissive in development, restricted in production
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
const corsOptions: cors.CorsOptions = isProduction && allowedOrigins.length > 0
  ? {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`CORS blocked request from origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }
  : {}; // Permissive in development

app.use(cors(corsOptions));
if (isProduction && allowedOrigins.length > 0) {
  logger.info(`CORS restricted to: ${allowedOrigins.join(', ')}`);
} else if (isProduction) {
  logger.warn('CORS is open - set ALLOWED_ORIGINS for production security');
} else {
  logger.info('CORS is permissive (development mode)');
}

// Rate Limiting (production only)
if (isProduction) {
  // General API rate limit: 100 requests per 15 minutes per IP
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests', message: 'Please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Strict limit for report creation: 10 per hour per IP (expensive operation)
  const reportCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Rate limit exceeded', message: 'Maximum 10 reports per hour. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Disambiguate endpoint: 30 per 15 minutes per IP
  const disambiguateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Rate limit exceeded', message: 'Please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply limiters
  app.use('/api/', generalLimiter);
  app.post('/api/report', reportCreationLimiter);
  app.post('/api/disambiguate', disambiguateLimiter);

  logger.info('Rate limiting enabled');
} else {
  logger.info('Rate limiting disabled (development mode)');
}

app.use(express.json({ limit: '1mb' }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Helper to get API key from header or env
// In production mode (REQUIRE_USER_KEYS=true), only accept keys from headers
function getApiKey(req: Request, headerName: string, envName: string): string | undefined {
  const headerKey = req.headers[headerName.toLowerCase()] as string | undefined;

  // In production mode, only accept keys from headers (no env fallback)
  if (requireUserKeys) {
    return headerKey;
  }

  // In development mode, fall back to env vars
  return headerKey || process.env[envName];
}

/**
 * POST /api/disambiguate
 * Generate clarification domains for a research query
 */
app.post('/api/disambiguate', async (req: Request<{}, {}, { query: string; model?: string }>, res: Response): Promise<void> => {
  try {
    const { query, model } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Query parameter is required'
      });
      return;
    }

    // Get API key from header or fall back to env
    const openRouterKey = getApiKey(req, 'X-OpenRouter-Key', 'OPENROUTER_API_KEY');
    if (!openRouterKey) {
      res.status(400).json({
        error: 'Missing API key',
        message: 'OpenRouter API key is required. Please configure it in the API Keys section.'
      });
      return;
    }

    const searchModel = model || 'google/gemini-2.5-flash';
    logger.info(`Generating clarifications for query: "${query.substring(0, 50)}..." using model: ${searchModel}`);

    const openrouter = createOpenRouter({
      apiKey: openRouterKey,
    });

    const { text } = await generateText({
      model: openrouter.chat(searchModel) as any,
      system: getDisambiguatePrompt(),
      messages: [{ role: 'user', content: query }],
      temperature: 0.5,
    });

    // Parse and validate JSON - strip markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    let clarifications;
    try {
      clarifications = JSON.parse(jsonText);
    } catch {
      res.status(500).json({
        error: 'Server error',
        message: 'Failed to parse clarifications response'
      });
      return;
    }

    if (!Array.isArray(clarifications)) {
      throw new Error('Invalid response format');
    }

    res.json({ clarifications });

  } catch (error: any) {
    logger.error(`Disambiguation failed: ${error.message}`);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to generate clarifications'
    });
  }
});

interface ModelConfig {
  orchestrator?: string;
  planning?: string;
  searchSummarisation?: string;
  reportWriting?: string;
  subagent?: string;
}

/**
 * POST /api/report
 * Create a new report generation session
 */
app.post('/api/report', async (req: Request<{}, {}, CreateReportRequest & { clarificationContext?: string; models?: ModelConfig }>, res: Response<CreateReportResponse | ErrorResponse>): Promise<void> => {
  try {
    const { query, clarificationContext, models } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Query parameter is required and must be a non-empty string'
      });
      return;
    }

    // Limit query length to prevent abuse
    if (query.length > 10000) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Query exceeds maximum length of 10,000 characters'
      });
      return;
    }

    // Get API keys from headers or fall back to env
    const openRouterKey = getApiKey(req, 'X-OpenRouter-Key', 'OPENROUTER_API_KEY');
    const e2bKey = getApiKey(req, 'X-E2B-Key', 'E2B_API_KEY');
    const exaKey = getApiKey(req, 'X-Exa-Key', 'EXASEARCH_API_KEY');

    // Validate required keys
    const missingKeys: string[] = [];
    if (!openRouterKey) missingKeys.push('OpenRouter');
    if (!e2bKey) missingKeys.push('E2B');
    if (!exaKey) missingKeys.push('Exa');

    if (missingKeys.length > 0) {
      res.status(400).json({
        error: 'Missing API keys',
        message: `Please configure the following API keys: ${missingKeys.join(', ')}`
      });
      return;
    }

    logger.info(`Creating new report session for query: "${query}"`);
    if (clarificationContext) {
      logger.info(`With clarification context provided`);
    }

    // Create session in state manager
    const sessionId = stateManager.createSession(query);

    // Create orchestrator instance with model configuration and API keys
    const orchestrator = new StreamingOrchestrator({
      sessionId,
      workDir: './reports',
      model: models?.orchestrator || process.env.MODEL || 'anthropic/claude-haiku-4.5',
      subagentModel: models?.subagent || 'anthropic/claude-haiku-4.5',
      reportWritingModel: models?.reportWriting || 'anthropic/claude-haiku-4.5',
      summarizerModel: models?.searchSummarisation || 'google/gemini-2.5-flash',
      planningModel: models?.planning || 'anthropic/claude-opus-4.5',
      clarificationContext,
      // Pass API keys to orchestrator
      apiKeys: {
        openRouter: openRouterKey!,
        e2b: e2bKey!,
        exa: exaKey!,
      },
    });

    // Store orchestrator for potential abort
    orchestrators.set(sessionId, orchestrator);

    // Start report generation asynchronously
    orchestrator.generateReport(query).catch(error => {
      logger.error(`Report generation failed for ${sessionId}: ${error.message}`);
      stateManager.updateSessionStatus(sessionId, 'failed');
      stateManager.emitEvent(sessionId, 'error', {
        source: 'orchestrator',
        error: error.message,
        stack: error.stack
      });
    }).finally(() => {
      // Clean up orchestrator reference when done
      orchestrators.delete(sessionId);
    });

    // Return session info immediately
    const response: CreateReportResponse = {
      sessionId,
      status: 'initializing',
      query,
      streamUrl: `/api/stream/${sessionId}`,
      statusUrl: `/api/status/${sessionId}`
    };

    res.json(response);

  } catch (error: any) {
    logger.error(`Error creating report: ${error.message}`);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /api/stream/:sessionId
 * Server-Sent Events endpoint for real-time updates
 */
app.get('/api/stream/:sessionId', (req: Request<{ sessionId: string }>, res: Response): void => {
  const { sessionId } = req.params;

  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Track active connection
  const currentCount = activeConnections.get(sessionId) || 0;
  activeConnections.set(sessionId, currentCount + 1);
  logger.info(`SSE connection established for session: ${sessionId} (connections: ${currentCount + 1})`);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Send all existing events
  session.events.forEach(event => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  });

  // Listen for new events
  const eventListener = (event: any) => {
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    } catch (error: any) {
      logger.error(`Error sending SSE event: ${error.message}`);
    }
  };

  stateManager.on(`event:${sessionId}`, eventListener);

  // Handle client disconnect
  req.on('close', () => {
    stateManager.off(`event:${sessionId}`, eventListener);

    // Decrement connection count
    const count = activeConnections.get(sessionId) || 1;
    activeConnections.set(sessionId, count - 1);
    logger.info(`SSE connection closed for session: ${sessionId} (connections: ${count - 1})`);

    // Grace period before aborting - allows for reconnection
    setTimeout(() => {
      const currentConnections = activeConnections.get(sessionId) || 0;
      const currentSession = stateManager.getSession(sessionId);
      const orchestrator = orchestrators.get(sessionId);

      // Only abort if:
      // 1. No active connections remain
      // 2. Session is still in progress (not completed/failed)
      // 3. Orchestrator exists
      if (
        currentConnections === 0 &&
        currentSession &&
        ['planning', 'running', 'delegating', 'initializing'].includes(currentSession.status) &&
        orchestrator
      ) {
        logger.info(`Aborting session ${sessionId} - user disconnected (no reconnection after ${ABORT_GRACE_PERIOD_MS}ms)`);
        orchestrator.abort();
        orchestrators.delete(sessionId);
        activeConnections.delete(sessionId);
      }
    }, ABORT_GRACE_PERIOD_MS);
  });
});

/**
 * GET /api/status/:sessionId
 * Get current session status
 */
app.get('/api/status/:sessionId', (req: Request<{ sessionId: string }>, res: Response<SessionStatusResponse | ErrorResponse>): void => {
  const { sessionId } = req.params;

  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found', message: 'Session does not exist' });
    return;
  }

  const flowData = stateManager.getFlowData(sessionId);

  // Convert Maps to Arrays for JSON serialization
  const agents: AgentState[] = Array.from(session.agents.values());
  const planSteps: PlanStep[] = Array.from(session.planSteps.values());

  const response: SessionStatusResponse = {
    sessionId: session.sessionId,
    query: session.query,
    status: session.status,
    orchestrator: session.orchestrator,
    agents,
    planSteps,
    flowData,
    eventCount: session.events.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };

  res.json(response);
});

/**
 * GET /api/flow/:sessionId
 * Get flow visualization data
 */
app.get('/api/flow/:sessionId', (req: Request<{ sessionId: string }>, res: Response<FlowDataResponse | ErrorResponse>): void => {
  const { sessionId } = req.params;

  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found', message: 'Session does not exist' });
    return;
  }

  const flowData = stateManager.getFlowData(sessionId);
  res.json(flowData);
});

/**
 * GET /api/report/:sessionId
 * Get the completed report markdown content
 */
app.get('/api/report/:sessionId', async (req: Request<{ sessionId: string }>, res: Response<ReportResponse | ErrorResponse>): Promise<void> => {
  const { sessionId } = req.params;

  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found', message: 'Session does not exist' });
    return;
  }

  try {
    // Use the same workDir path as the orchestrator (relative to project root)
    const workDir = './reports';
    const reportsDir = path.resolve(workDir, sessionId);

    // First, try to get final_report.md (the actual final report the orchestrator creates)
    const finalReportPath = path.join(reportsDir, 'final_report.md');

    try {
      const reportContent = await fs.readFile(finalReportPath, 'utf-8');
      logger.info(`Found final_report.md for session ${sessionId}`);
      res.json({ report: reportContent });
      return;
    } catch (error) {
      // If final_report.md doesn't exist, fall back to finding any markdown file
      // that's not orchestrator_worklog.md (in case orchestrator used a different name)
      const files = await fs.readdir(reportsDir, { withFileTypes: true });
      const markdownFiles = files
        .filter(file => {
          if (!file.isFile()) return false;
          if (!file.name.endsWith('.md')) return false;
          // Exclude orchestrator_worklog.md
          return file.name !== 'orchestrator_worklog.md';
        })
        .map(file => ({
          name: file.name,
          path: path.join(reportsDir, file.name)
        }));

      if (markdownFiles.length === 0) {
        res.json({
          report: '# No report generated yet\n\nThe report will appear here once the research is complete.'
        });
        return;
      }

      // If multiple markdown files exist, return the largest one (likely the main report)
      const fileStats = await Promise.all(
        markdownFiles.map(async (file) => {
          const stats = await fs.stat(file.path);
          return { ...file, size: stats.size };
        })
      );

      // Sort by size (descending) and take the largest
      fileStats.sort((a, b) => b.size - a.size);
      const reportFile = fileStats[0];

      if (!reportFile) {
        res.json({
          report: '# No report generated yet\n\nThe report will appear here once the research is complete.'
        });
        return;
      }

      const reportContent = await fs.readFile(reportFile.path, 'utf-8');
      logger.info(`Found report file ${reportFile.name} for session ${sessionId} (fallback)`);

      res.json({ report: reportContent });
      return;
    }

  } catch (error: any) {
    logger.error(`Error fetching report for ${sessionId}: ${error.message}`);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

// PDF fonts configuration
const pdfFonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  },
  Courier: {
    normal: 'Courier',
    bold: 'Courier-Bold',
    italics: 'Courier-Oblique',
    bolditalics: 'Courier-BoldOblique'
  }
};

const pdfPrinter = new PdfPrinter(pdfFonts);

/**
 * Convert markdown tokens to pdfmake content
 */
async function markdownToPdfContent(markdown: string, reportsDir: string): Promise<Content[]> {
  const tokens = marked.lexer(markdown);
  const content: Content[] = [];

  // Helper to read image and convert to base64
  async function getImageAsBase64(imagePath: string): Promise<string | null> {
    try {
      const fullPath = imagePath.startsWith('/')
        ? imagePath
        : path.join(reportsDir, imagePath);
      const imageBuffer = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const mimeType = mimeTypes[ext] || 'image/png';
      return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch {
      logger.warn(`Failed to load image: ${imagePath}`);
      return null;
    }
  }

type InlineFragment = string | Omit<ContentText, 'type'>;

function applyStyleToFragments(
  fragments: InlineFragment[],
  style: Partial<Omit<ContentText, 'text' | 'type'>>
): InlineFragment[] {
  return fragments.map(fragment => {
    if (typeof fragment === 'string') {
      return { text: fragment, ...style };
    }
    return { ...fragment, ...style };
  });
}

// Helper to process inline tokens (bold, italic, links, code, etc.)
function processInlineTokens(inlineTokens: Tokens.Generic[]): InlineFragment[] {
  const fragments: InlineFragment[] = [];

  inlineTokens.forEach(token => {
    switch (token.type) {
      case 'text': {
        const textToken = token as Tokens.Text & { tokens?: Tokens.Generic[] };
        if (textToken.tokens && textToken.tokens.length > 0) {
          fragments.push(...processInlineTokens(textToken.tokens as Tokens.Generic[]));
        } else {
          fragments.push(textToken.text);
        }
        break;
      }
      case 'strong': {
        const strong = token as Tokens.Strong;
        const children = strong.tokens
          ? processInlineTokens(strong.tokens as Tokens.Generic[])
          : [strong.text];
        fragments.push(...applyStyleToFragments(children, { bold: true }));
        break;
      }
      case 'em': {
        const em = token as Tokens.Em;
        const children = em.tokens
          ? processInlineTokens(em.tokens as Tokens.Generic[])
          : [em.text];
        fragments.push(...applyStyleToFragments(children, { italics: true }));
        break;
      }
      case 'codespan': {
        const code = token as Tokens.Codespan;
        fragments.push({
          text: code.text,
          font: 'Courier',
          color: '#d6336c',
        });
        break;
      }
      case 'link': {
        const link = token as Tokens.Link;
        const children = link.tokens
          ? processInlineTokens(link.tokens as Tokens.Generic[])
          : [link.text];
        fragments.push(
          ...applyStyleToFragments(children, {
            color: '#2563eb',
            link: link.href,
          })
        );
        break;
      }
      case 'br': {
        fragments.push('\n');
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray((token as { tokens?: Tokens.Generic[] }).tokens)) {
          fragments.push(...processInlineTokens((token as { tokens: Tokens.Generic[] }).tokens));
        } else if ('text' in token) {
          const tokenWithText = token as unknown as { text?: string };
          if (typeof tokenWithText.text === 'string') {
            fragments.push(tokenWithText.text);
          }
        } else if ('raw' in token) {
          const tokenWithRaw = token as unknown as { raw?: string };
          if (typeof tokenWithRaw.raw === 'string') {
            fragments.push(tokenWithRaw.raw);
          }
        }
      }
    }
  });

  return fragments;
}

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading;
        const fontSize = heading.depth === 1 ? 24 : heading.depth === 2 ? 18 : 14;
        const headingTokens = (heading as Tokens.Heading & { tokens?: Tokens.Generic[] }).tokens;
        content.push({
          text: headingTokens ? processInlineTokens(headingTokens as Tokens.Generic[]) : heading.text,
          fontSize,
          bold: true,
          margin: [0, heading.depth === 1 ? 0 : 16, 0, 8] as [number, number, number, number],
          color: '#1a1a1a'
        });
        if (heading.depth === 1) {
          content.push({
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e5e5e5' }],
            margin: [0, 0, 0, 16] as [number, number, number, number]
          });
        }
        break;
      }

      case 'paragraph': {
        const para = token as Tokens.Paragraph;
        // Check if paragraph contains an image
        const imageToken = para.tokens?.find((t: Tokens.Generic) => t.type === 'image');
        if (imageToken) {
          const img = imageToken as Tokens.Image;
          const base64 = await getImageAsBase64(img.href);
          if (base64) {
            content.push({
              image: base64,
              width: 400,
              margin: [0, 8, 0, 8] as [number, number, number, number],
              alignment: 'center'
            } as ContentImage);
            if (img.title || img.text) {
              content.push({
                text: img.title || img.text,
                fontSize: 10,
                italics: true,
                color: '#666666',
                alignment: 'center',
                margin: [0, 0, 0, 12] as [number, number, number, number]
              });
            }
          }
        } else {
          const paraTokens = (para as Tokens.Paragraph & { tokens?: Tokens.Generic[] }).tokens;
          const inlineContent = paraTokens
            ? processInlineTokens(paraTokens as Tokens.Generic[])
            : [para.text];
          content.push({
            text: inlineContent,
            fontSize: 11,
            lineHeight: 1.6,
            margin: [0, 0, 0, 12] as [number, number, number, number],
            color: '#4a4a4a'
          });
        }
        break;
      }

      case 'list': {
        const list = token as Tokens.List;
        const listItems = list.items.map((item: Tokens.ListItem) => {
          const itemTokens = (item as Tokens.ListItem & { tokens?: Tokens.Generic[] }).tokens;
          const inlineContent = itemTokens
            ? processInlineTokens(itemTokens as Tokens.Generic[])
            : [item.text];
          return {
            text: inlineContent,
            fontSize: 11,
            color: '#4a4a4a',
            margin: [0, 2, 0, 2] as [number, number, number, number]
          };
        });
        if (list.ordered) {
          content.push({
            ol: listItems,
            margin: [0, 0, 0, 12] as [number, number, number, number]
          });
        } else {
          content.push({
            ul: listItems,
            margin: [0, 0, 0, 12] as [number, number, number, number]
          });
        }
        break;
      }

      case 'code': {
        const code = token as Tokens.Code;
        content.push({
          text: code.text,
          fontSize: 9,
          font: 'Helvetica',
          background: '#f5f5f5',
          margin: [0, 8, 0, 8] as [number, number, number, number],
          preserveLeadingSpaces: true
        });
        break;
      }

      case 'blockquote': {
        const quote = token as Tokens.Blockquote;
        const quoteTokens = (quote as Tokens.Blockquote & { tokens?: Tokens.Generic[] }).tokens;
        const text = quoteTokens
          ? processInlineTokens(quoteTokens as Tokens.Generic[])
          : [quote.text];
        content.push({
          text,
          fontSize: 11,
          italics: true,
          color: '#666666',
          margin: [20, 8, 0, 8] as [number, number, number, number]
        });
        break;
      }

      case 'table': {
        const table = token as Tokens.Table;
        const tableBody = [
          table.header.map((cell: Tokens.TableCell) => {
            const cellTokens = (cell as Tokens.TableCell & { tokens?: Tokens.Generic[] }).tokens;
            return {
              text: cellTokens
                ? processInlineTokens(cellTokens as Tokens.Generic[])
                : [cell.text],
            bold: true,
            fontSize: 10,
            fillColor: '#f9f9f9'
            };
          }),
          ...table.rows.map((row: Tokens.TableCell[]) =>
            row.map((cell: Tokens.TableCell) => {
              const cellTokens = (cell as Tokens.TableCell & { tokens?: Tokens.Generic[] }).tokens;
              return {
                text: cellTokens
                  ? processInlineTokens(cellTokens as Tokens.Generic[])
                  : [cell.text],
                fontSize: 10
              };
            })
          )
        ];
        content.push({
          table: {
            headerRows: 1,
            widths: Array(table.header.length).fill('*'),
            body: tableBody
          },
          margin: [0, 8, 0, 12] as [number, number, number, number]
        });
        break;
      }

      case 'hr': {
        content.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e5e5e5' }],
          margin: [0, 16, 0, 16] as [number, number, number, number]
        });
        break;
      }

      case 'space': {
        break;
      }

      default: {
        if ('text' in token && typeof (token as { text: string }).text === 'string') {
          content.push({
            text: (token as { text: string }).text,
            fontSize: 11,
            margin: [0, 0, 0, 8] as [number, number, number, number]
          });
        }
      }
    }
  }

  return content;
}

/**
 * GET /api/report/:sessionId/pdf
 * Generate and download PDF version of the report
 */
app.get('/api/report/:sessionId/pdf', async (req: Request<{ sessionId: string }>, res: Response): Promise<void> => {
  const { sessionId } = req.params;

  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found', message: 'Session does not exist' });
    return;
  }

  try {
    const workDir = './reports';
    const reportsDir = path.resolve(workDir, sessionId);
    const finalReportPath = path.join(reportsDir, 'final_report.md');

    let reportContent: string;
    try {
      reportContent = await fs.readFile(finalReportPath, 'utf-8');
    } catch {
      res.status(404).json({ error: 'Report not found', message: 'No report has been generated yet' });
      return;
    }

    logger.info(`Generating PDF for session ${sessionId}`);

    // Convert markdown to pdfmake content
    const pdfContent = await markdownToPdfContent(reportContent, reportsDir);

    // Create document definition
    const docDefinition: TDocumentDefinitions = {
      content: pdfContent,
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 11,
        lineHeight: 1.4
      },
      pageMargins: [40, 40, 40, 40],
      info: {
        title: `Research Report - ${session.query.substring(0, 100)}`,
        author: 'Oren Research System',
        subject: session.query,
        creator: 'Oren'
      }
    };

    // Generate PDF
    const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);

    // Collect PDF chunks
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));

    pdfDoc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);

      // Generate filename from query
      const sanitizedQuery = session.query
        .substring(0, 50)
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
      const filename = `report_${sanitizedQuery}_${sessionId.substring(0, 8)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

      logger.success(`PDF generated successfully for session ${sessionId}`);
    });

    pdfDoc.on('error', (error: Error) => {
      logger.error(`PDF generation error: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed', message: error.message });
      }
    });

    pdfDoc.end();

  } catch (error: any) {
    logger.error(`Error generating PDF for ${sessionId}: ${error.message}`);
    res.status(500).json({
      error: 'PDF generation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/files/:sessionId/*
 * Serve files from session directory (charts, images, etc.)
 */
app.get('/api/files/:sessionId/*', async (req: Request<{ sessionId: string; 0?: string }>, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  // Get the file path from the URL (everything after /api/files/:sessionId/)
  const filePath = req.params['0'] || '';

  // Security: Validate sessionId exists
  const session = stateManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found', message: 'Session does not exist' });
    return;
  }

  try {
    const workDir = './reports';
    const fullPath = path.resolve(workDir, sessionId, filePath);
    const sessionDir = path.resolve(workDir, sessionId);

    // Security: Ensure the resolved path is within the session directory
    if (!fullPath.startsWith(sessionDir)) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      return;
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      res.status(404).json({ error: 'File not found', message: `File ${filePath} not found` });
      return;
    }

    // Determine content type based on extension
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.csv': 'text/csv',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Read and send file
    const fileContent = await fs.readFile(fullPath);
    res.send(fileContent);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error serving file ${filePath} for session ${sessionId}: ${errorMessage}`);
    res.status(500).json({ error: 'Server error', message: errorMessage });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response<HealthResponse>): void => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: stateManager.sessions.size
  });
});

// Error handling middleware
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  logger.error(err.stack);

  const response: ErrorResponse = {
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  };

  res.status(500).json(response);
};

app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  const response: ErrorResponse = {
    error: 'Not found',
    message: `Path ${req.path} not found`,
    path: req.path
  };
  res.status(404).json(response);
});

// Start server
app.listen(PORT, () => {
  logger.success(`Server running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Cleanup old sessions periodically (every hour)
setInterval(() => {
  logger.info('Running session cleanup...');
  stateManager.cleanupOldSessions();
}, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});