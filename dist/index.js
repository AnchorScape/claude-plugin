#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const handlers_js_1 = require("./handlers.js");
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
    const server = new index_js_1.Server({
        name: 'anchorscape',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    // List available tools
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });
    // Handle tool calls
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            let result;
            switch (name) {
                case 'anchorscape_deploy': {
                    const { directory, environment = 'development', projectName } = args;
                    if (!directory || typeof directory !== 'string') {
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'directory is required');
                    }
                    // Extract progress token for MCP progress notifications (if supported by client)
                    const progressToken = request.params._meta?.progressToken;
                    let progressCounter = 0;
                    const onProgress = progressToken !== undefined
                        ? (message) => {
                            progressCounter++;
                            server.notification({
                                method: 'notifications/progress',
                                params: {
                                    progressToken,
                                    progress: progressCounter,
                                    total: 20, // Approximate total steps
                                    message,
                                },
                            }).catch(() => { }); // Best-effort, don't break deploy on notification failure
                        }
                        : undefined;
                    result = await (0, handlers_js_1.handleDeploy)(directory, environment, projectName, onProgress);
                    break;
                }
                case 'anchorscape_login': {
                    const { apiUrl } = (args || {});
                    result = await (0, handlers_js_1.handleLogin)(apiUrl);
                    break;
                }
                case 'anchorscape_status': {
                    const { projectName, environmentId } = (args || {});
                    result = await (0, handlers_js_1.handleStatus)(projectName, environmentId);
                    break;
                }
                case 'anchorscape_logs': {
                    const { environmentId, lines = 50 } = args;
                    if (!environmentId || typeof environmentId !== 'string') {
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, 'environmentId is required');
                    }
                    result = await (0, handlers_js_1.handleLogs)(environmentId, Math.min(lines, 500));
                    break;
                }
                case 'anchorscape_projects': {
                    result = await (0, handlers_js_1.handleProjects)();
                    break;
                }
                default:
                    throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
            return {
                content: [{ type: 'text', text: result }],
            };
        }
        catch (error) {
            if (error instanceof types_js_1.McpError)
                throw error;
            const message = error instanceof Error ? error.message : String(error);
            throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, message);
        }
    });
    // Start the server
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Anchorscape MCP server started');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
