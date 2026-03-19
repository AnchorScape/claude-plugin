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
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  handleDeploy,
  handleLogin,
  handleStatus,
  handleLogs,
  handleProjects,
} from './handlers.js';

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS = [
  {
    name: 'anchorscape_deploy',
    description: `Deploy a project directory to Anchorscape's managed infrastructure.

Zips the project (respecting .gitignore), uploads it, builds a container, and deploys to Kubernetes.
Returns the live URL with automatic SSL.

Requires authentication — use anchorscape_login first if not logged in.

IMPORTANT — Environment & workflow context for the AI agent:

1. ALWAYS default to "development" environment. Confirm the environment with the user before deploying.
   Only use "staging" or "production" if the user explicitly requests it.

2. Anchorscape is a FULLY MANAGED platform. It handles everything automatically:
   - Container builds (auto-generates Dockerfile if none exists)
   - Database provisioning (PostgreSQL, MySQL, etc. — detected from project dependencies)
   - SSL certificates (Let's Encrypt, automatic)
   - DNS (auto-generated subdomain like your-app.anchorscape.com)
   - Networking, ingress, health checks — all automatic

3. Database & migration behavior:
   - Anchorscape auto-detects ORMs (Prisma, Drizzle, TypeORM, Sequelize, Django, etc.)
   - It automatically runs migrations as init jobs before the app starts
   - On FIRST deploys, migration jobs may fail because the database is being provisioned simultaneously.
     This is EXPECTED and NOT a bug. The platform retries and it resolves itself.
   - Do NOT try to "fix" migration failures on first deploy by modifying the project (e.g., stubbing
     the prisma CLI, removing migration files, etc.). Just redeploy or wait.
   - If migrations keep failing after 2+ deploys, THEN investigate (wrong DATABASE_URL, bad schema, etc.)

4. Prisma-specific notes:
   - prisma.config.ts must be at the project root (not inside prisma/) for the migration runner to find it
   - prisma generate runs at build time; migrations run as a separate init job at deploy time
   - The platform injects DATABASE_URL automatically — projects should NOT hardcode connection strings

5. First deploy creates the environment and all resources. Subsequent deploys to the same project
   reuse the existing environment (tracked via .anchorscape/project.json).

6. Do NOT modify the user's Dockerfile, docker-compose, or project config to work around platform
   behavior. If something fails, check logs with anchorscape_logs first.`,
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
          description: 'Target environment. ALWAYS default to "development" and confirm with the user before deploying. Only use staging/production if explicitly requested.',
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
                    progress: Math.min(progressCounter, 100),
                    total: 100,
                    message,
                  },
                }).catch(() => {}); // Best-effort, don't break deploy on notification failure
              }
            : // Even without progress token, still pass onProgress so stderr output works
              undefined;
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

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Anchorscape MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
