#!/usr/bin/env node
/**
 * Anchorscape MCP Server
 *
 * Deploy-focused MCP tools for Claude Code.
 * Scanning and fixing are handled by SKILL.md files (zero cost).
 * This server handles deploy, auth, status, logs, and project listing.
 *
 * Tools:
 * - anchorscape_deploy: ZIP and deploy project to Anchorscape
 * - anchorscape_login: Authenticate via browser OAuth
 * - anchorscape_status: Check deployment status
 * - anchorscape_logs: View deployment logs
 * - anchorscape_projects: List projects and environments
 *
 * Usage:
 *   npx @anchorscape/claude-plugin
 *   OR: node dist/mcp/index.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  JSONRPCMessageSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  handleDeploy,
  handleLogin,
  handleStatus,
  handleLogs,
  handleProjects,
} from './handlers.js';

// ============================================================================
// DUAL-MODE STDIO TRANSPORT
// Auto-detects Content-Length framing vs newline-delimited JSON
// ============================================================================

class DualModeStdioTransport implements Transport {
  private _stdin: NodeJS.ReadableStream;
  private _stdout: NodeJS.WritableStream;
  private _buffer = Buffer.alloc(0);
  private _started = false;
  private _mode: 'unknown' | 'content-length' | 'newline' = 'unknown';

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream) {
    this._stdin = stdin ?? process.stdin;
    this._stdout = stdout ?? process.stdout;
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Transport already started');
    }
    this._started = true;

    this._stdin.on('data', (chunk: Buffer) => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._processBuffer();
    });

    this._stdin.on('error', (error: Error) => {
      this.onerror?.(error);
    });
  }

  private _processBuffer(): void {
    while (this._buffer.length > 0) {
      // Auto-detect mode from first bytes
      if (this._mode === 'unknown') {
        const peek = this._buffer.toString('utf8', 0, Math.min(20, this._buffer.length));
        if (peek.startsWith('Content-Length:')) {
          this._mode = 'content-length';
          console.error('[MCP] Detected Content-Length framing');
        } else {
          this._mode = 'newline';
          console.error('[MCP] Detected newline-delimited framing');
        }
      }

      if (this._mode === 'content-length') {
        // Parse Content-Length: N\r\n\r\n{json}
        const headerEnd = this._buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break; // Need more data

        const header = this._buffer.toString('utf8', 0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/);
        if (!match) {
          this.onerror?.(new Error(`Invalid header: ${header}`));
          // Skip past the bad header
          this._buffer = this._buffer.subarray(headerEnd + 4);
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        const messageStart = headerEnd + 4;
        if (this._buffer.length < messageStart + contentLength) break; // Need more data

        const messageStr = this._buffer.toString('utf8', messageStart, messageStart + contentLength);
        this._buffer = this._buffer.subarray(messageStart + contentLength);

        try {
          const message = JSONRPCMessageSchema.parse(JSON.parse(messageStr));
          this.onmessage?.(message);
        } catch (error) {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)));
        }
      } else {
        // Newline-delimited: read until \n
        const index = this._buffer.indexOf('\n');
        if (index === -1) break; // Need more data

        const line = this._buffer.toString('utf8', 0, index).replace(/\r$/, '');
        this._buffer = this._buffer.subarray(index + 1);

        if (!line.trim()) continue; // Skip empty lines

        try {
          const message = JSONRPCMessageSchema.parse(JSON.parse(line));
          this.onmessage?.(message);
        } catch (error) {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve) => {
      const json = JSON.stringify(message);

      let output: string;
      if (this._mode === 'content-length') {
        // Respond in Content-Length format to match client
        const byteLength = Buffer.byteLength(json, 'utf8');
        output = `Content-Length: ${byteLength}\r\n\r\n${json}`;
      } else {
        // Newline-delimited
        output = json + '\n';
      }

      if ((this._stdout as NodeJS.WriteStream).write(output)) {
        resolve();
      } else {
        (this._stdout as NodeJS.WriteStream).once('drain', resolve);
      }
    });
  }

  async close(): Promise<void> {
    this._stdin.removeAllListeners('data');
    this._stdin.removeAllListeners('error');
    if ('pause' in this._stdin && typeof (this._stdin as any).pause === 'function') {
      (this._stdin as any).pause();
    }
    this._buffer = Buffer.alloc(0);
    this.onclose?.();
  }

  get sessionId(): string | undefined {
    return undefined;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS = [
  {
    name: 'anchorscape_deploy',
    description: `Deploy a project directory to Anchorscape's managed infrastructure.

Zips the project (respecting .gitignore), uploads it, builds a container, and deploys to Kubernetes.
Returns the live URL with automatic SSL.

Requires authentication — use anchorscape_login first if not logged in.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the project directory to deploy',
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Target environment (default: development)',
          default: 'development',
        },
        projectName: {
          type: 'string',
          description: 'Project name (auto-detected from package.json or directory name if not provided)',
        },
      },
      required: ['directory'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: 'anchorscape_login',
    description: `Authenticate with Anchorscape via browser OAuth.

Opens a browser window for login. Credentials are stored locally at ~/.config/anchorscape/credentials.json.
Returns the logged-in user's email and plan tier.

If already logged in with a valid token, returns current session info without opening a browser.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiUrl: {
          type: 'string',
          description: 'API URL (default: https://anchorscape.com)',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'anchorscape_status',
    description: `Check the deployment status of a project or environment.

Returns current status, URL, health, and last deploy time.
If no project is specified, returns status of all projects.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectName: {
          type: 'string',
          description: 'Project name to check (optional — lists all if omitted)',
        },
        environmentId: {
          type: 'string',
          description: 'Specific environment ID to check',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'anchorscape_logs',
    description: `View recent logs from a deployed application.

Returns the most recent log lines from the specified environment's running containers.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        environmentId: {
          type: 'string',
          description: 'Environment ID to get logs from',
        },
        lines: {
          type: 'number',
          description: 'Number of log lines to return (default: 50, max: 500)',
          default: 50,
        },
      },
      required: ['environmentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'anchorscape_projects',
    description: `List all projects and their environments on Anchorscape.

Returns project names, environment names, URLs, status, and last deploy times.
Use this to find environment IDs for the status and logs tools.`,
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
];

// ============================================================================
// MCP SERVER
// ============================================================================

async function main() {
  const server = new Server(
    {
      name: 'anchorscape',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'anchorscape_deploy': {
          const { directory, environment = 'development', projectName } = args as {
            directory: string;
            environment?: 'development' | 'staging' | 'production';
            projectName?: string;
          };
          if (!directory || typeof directory !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'directory is required');
          }
          // Extract progress token for MCP progress notifications (if supported by client)
          const progressToken = request.params._meta?.progressToken;
          let progressCounter = 0;
          const onProgress = progressToken !== undefined
            ? (message: string) => {
                progressCounter++;
                server.notification({
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress: progressCounter,
                    total: 20, // Approximate total steps
                    message,
                  },
                }).catch(() => {}); // Best-effort, don't break deploy on notification failure
              }
            : undefined;
          result = await handleDeploy(directory, environment, projectName, onProgress);
          break;
        }

        case 'anchorscape_login': {
          const { apiUrl } = (args || {}) as { apiUrl?: string };
          result = await handleLogin(apiUrl);
          break;
        }

        case 'anchorscape_status': {
          const { projectName, environmentId } = (args || {}) as {
            projectName?: string;
            environmentId?: string;
          };
          result = await handleStatus(projectName, environmentId);
          break;
        }

        case 'anchorscape_logs': {
          const { environmentId, lines = 50 } = args as {
            environmentId: string;
            lines?: number;
          };
          if (!environmentId || typeof environmentId !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'environmentId is required');
          }
          result = await handleLogs(environmentId, Math.min(lines, 500));
          break;
        }

        case 'anchorscape_projects': {
          result = await handleProjects();
          break;
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  // Start the server with dual-mode transport (Content-Length + newline-delimited)
  const transport = new DualModeStdioTransport();
  await server.connect(transport);
  console.error('Anchorscape MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
