/**
 * MCP Tool Handlers — Deploy-focused
 *
 * Handles deploy, auth, status, logs, and project listing.
 * Reuses patterns from the CLI (cli/src/) but adapted for MCP context.
 */
export declare function handleDeploy(directory: string, environment?: 'development' | 'staging' | 'production', projectName?: string): Promise<string>;
/**
 * Login via browser OAuth (polling-based — works in WSL2, SSH, Docker, etc.)
 *
 * Flow:
 * 1. Create a pending auth session on the server
 * 2. Open browser to auth page referencing that session
 * 3. User authorizes in browser → server stores token
 * 4. MCP polls server until token is available
 */
export declare function handleLogin(apiUrl?: string): Promise<string>;
/**
 * Check deployment status
 */
export declare function handleStatus(projectName?: string, environmentId?: string): Promise<string>;
/**
 * Get logs for a deployment
 */
export declare function handleLogs(environmentId: string, lines?: number): Promise<string>;
/**
 * List all projects
 */
export declare function handleProjects(): Promise<string>;
