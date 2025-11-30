/**
 * E2B Code Interpreter Service
 * Provides sandboxed code execution for data analysis and visualization
 */

import { Sandbox } from '@e2b/code-interpreter';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../logger.js';
import type { CodeInterpreterResult, CodeExecutionFile } from '../../shared/types/index.js';

const logger = createLogger('CodeExecutor');

// Sandbox instance pool for reuse
let sandboxInstance: Sandbox | null = null;
let sandboxLastUsed: number = 0;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

/**
 * Get or create a sandbox instance
 */
async function getSandbox(): Promise<Sandbox> {
  const now = Date.now();
  
  // Reuse existing sandbox if it's still warm
  if (sandboxInstance && (now - sandboxLastUsed) < SANDBOX_TIMEOUT_MS) {
    sandboxLastUsed = now;
    return sandboxInstance;
  }
  
  // Close old sandbox if exists
  if (sandboxInstance) {
    try {
      await sandboxInstance.kill();
    } catch (e) {
      logger.warn('Failed to kill old sandbox');
    }
  }
  
  // Create new sandbox
  logger.info('Creating new E2B sandbox instance');
  sandboxInstance = await Sandbox.create();
  sandboxLastUsed = now;
  
  return sandboxInstance;
}

/**
 * Execute Python code in E2B sandbox
 */
export async function executeCode(
  code: string,
  options: {
    language?: 'python' | 'javascript';
    outputDir?: string;
    outputFile?: string;
    timeout?: number;
  } = {}
): Promise<CodeInterpreterResult> {
  const startTime = Date.now();
  const { language = 'python', outputDir, outputFile, timeout = 30000 } = options;

  // Only Python is supported by E2B code interpreter
  if (language !== 'python') {
    return {
      success: false,
      error: 'Only Python is currently supported for code execution',
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const sandbox = await getSandbox();
    
    logger.info(`Executing ${code.length} chars of ${language} code`);

    // Execute the code
    const execution = await sandbox.runCode(code, {
      timeoutMs: timeout,
    });

    const executionTime = Date.now() - startTime;
    const files: CodeExecutionFile[] = [];
    const logs: string[] = [];

    // Collect stdout logs
    if (execution.logs?.stdout) {
      logs.push(...execution.logs.stdout);
    }
    if (execution.logs?.stderr) {
      logs.push(...execution.logs.stderr.map(s => `[stderr] ${s}`));
    }

    // Process results (charts, data, etc.)
    if (execution.results && execution.results.length > 0) {
      for (let i = 0; i < execution.results.length; i++) {
        const result = execution.results[i];
        if (!result) continue;
        
        // Handle PNG images (matplotlib charts)
        if (result.png) {
          const filename = outputFile || `chart_${i + 1}.png`;

          // Save to disk if outputDir is provided
          if (outputDir) {
            const filePath = path.join(outputDir, filename);
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(filePath, result.png, { encoding: 'base64' });
            logger.info(`Saved chart to ${filePath}`);
          }

          // Return path relative to agent directory (including charts/ subdirectory)
          // This ensures view_image tool can find the file
          const relativePath = outputDir ? `charts/${filename}` : filename;

          files.push({
            path: relativePath,
            type: 'image',
            // Don't include full base64 content - it's too large for conversation history
            // The image is already saved to disk
            content: '[image saved to disk]',
            size: result.png.length,
          });
        }
        
        // Handle JPEG images
        if (result.jpeg) {
          const filename = outputFile?.replace('.png', '.jpg') || `chart_${i + 1}.jpg`;

          if (outputDir) {
            const filePath = path.join(outputDir, filename);
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(filePath, result.jpeg, { encoding: 'base64' });
          }

          // Return path relative to agent directory (including charts/ subdirectory)
          const relativePath = outputDir ? `charts/${filename}` : filename;

          files.push({
            path: relativePath,
            type: 'image',
            content: '[image saved to disk]',
            size: result.jpeg.length,
          });
        }
        
        // Handle text/data output
        if (result.text) {
          files.push({
            path: `output_${i + 1}.txt`,
            type: 'text',
            content: result.text,
            size: result.text.length,
          });
        }
        
        // Handle HTML output (interactive charts from plotly, etc.)
        if (result.html) {
          const filename = `output_${i + 1}.html`;
          
          if (outputDir) {
            const filePath = path.join(outputDir, filename);
            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(filePath, result.html, 'utf-8');
          }
          
          files.push({
            path: filename,
            type: 'text',
            content: result.html,
            size: result.html.length,
          });
        }
      }
    }

    // Check for errors
    if (execution.error) {
      logger.error(`Code execution error: ${execution.error.name}: ${execution.error.value}`);
      return {
        success: false,
        error: `${execution.error.name}: ${execution.error.value}`,
        output: logs.join('\n'),
        logs,
        files,
        executionTime,
      };
    }

    logger.success(`Code executed successfully in ${executionTime}ms, generated ${files.length} files`);

    return {
      success: true,
      output: logs.join('\n'),
      logs,
      files,
      executionTime,
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    logger.error(`Code execution failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message || 'Unknown execution error',
      executionTime,
    };
  }
}

/**
 * Execute code with automatic chart saving for research agents
 */
export async function executeCodeWithChartSaving(
  code: string,
  agentDir: string,
  chartName?: string
): Promise<CodeInterpreterResult> {
  const chartsDir = path.join(agentDir, 'charts');
  
  // Wrap code to ensure matplotlib figures are properly saved
  const wrappedCode = `
import matplotlib.pyplot as plt
plt.rcParams['figure.dpi'] = 100  # Lower DPI for smaller files

# User code
${code}

# Ensure all figures are shown
if plt.get_fignums():
    plt.show()
    plt.close('all')
`;

  return executeCode(wrappedCode, {
    language: 'python',
    outputDir: chartsDir,
    outputFile: chartName,
  });
}

/**
 * Cleanup sandbox on process exit
 */
export async function cleanupSandbox(): Promise<void> {
  if (sandboxInstance) {
    try {
      await sandboxInstance.kill();
      sandboxInstance = null;
      logger.info('Sandbox cleaned up');
    } catch (e) {
      logger.warn('Failed to cleanup sandbox');
    }
  }
}

// Cleanup on process exit
process.on('beforeExit', cleanupSandbox);
process.on('SIGINT', cleanupSandbox);
process.on('SIGTERM', cleanupSandbox);

