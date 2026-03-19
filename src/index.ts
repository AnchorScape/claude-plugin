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

IMPORTANT — Read this before deploying. This applies to ANY project type (websites, APIs, full-stack
apps, microservices, static sites, scripts — anything).

== THE TWO RULES ==

RULE 1: "If it builds locally, Anchorscape handles the rest."
   Anchorscape is a fully managed platform. It figures out your project and deploys it. You do NOT
   need to create Dockerfiles, configure databases, set up SSL, write nginx configs, provision DNS,
   inject environment variables, or run migrations manually. The platform does ALL of this automatically.
   Do NOT hack, patch, stub, or modify the user's project to make it work on Anchorscape. If you find
   yourself writing workarounds for platform behavior — STOP. You are doing it wrong. Trust the platform.

RULE 2: "If it doesn't build locally, it won't build on Anchorscape."
   Anchorscape is not magic. If the project has broken imports, missing dependencies, syntax errors, or
   a build script that fails — that is a CODE problem, not a platform problem. Fix the code first, verify
   it builds/runs locally, THEN deploy. Do not deploy broken code and blame the platform.

== ENVIRONMENT ==

- ALWAYS default to "development". Confirm with the user before deploying.
- Only use "staging" or "production" if the user explicitly asks.
- First deploy creates the environment. Subsequent deploys reuse it (tracked via .anchorscape/project.json).

== WHAT THE PLATFORM HANDLES AUTOMATICALLY ==

- Dockerfile generation (if none exists — detects framework, language, build tool)
- Database provisioning (PostgreSQL, MySQL — detected from project dependencies/ORMs)
- ORM migrations (Prisma, Drizzle, TypeORM, Sequelize, Django, Rails, etc.) as init jobs
- SSL certificates (Let's Encrypt)
- DNS (auto-generated subdomain: your-app.anchorscape.com)
- Environment variables (DATABASE_URL, PORT, etc. — auto-injected)
- Networking, ingress, health checks, restarts

== FIRST DEPLOY BEHAVIOR ==

On first deploys, the database and app are provisioned simultaneously. Migration init jobs may fail
on the first attempt because the database isn't ready yet. This is NORMAL and EXPECTED — not a bug.
The platform retries automatically. Do NOT "fix" this by stubbing binaries, removing migration files,
or modifying the project. If migrations still fail after a second deploy, THEN check logs.

== WHEN THINGS FAIL ==

1. Check logs with anchorscape_logs — read the actual error
2. If it's a build error (missing module, syntax error, type error) — that's a code problem, fix it
3. If it's a platform error (migration race, health check timeout) — redeploy, it usually resolves
4. NEVER modify Dockerfiles, docker-compose, or project config to work around platform behavior`,
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
