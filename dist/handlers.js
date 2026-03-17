/**
 * MCP Tool Handlers — Deploy-focused
 *
 * Handles deploy, auth, status, logs, and project listing.
 * Reuses patterns from the CLI (cli/src/) but adapted for MCP context.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'anchorscape');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
function loadCredentials() {
    try {
        const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
function saveCredentials(creds) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}
function isTokenExpired(creds) {
    return new Date(creds.expiresAt) < new Date();
}
const ALLOWED_API_HOSTS = ['anchorscape.com', 'www.anchorscape.com', 'localhost'];
function getBaseUrl() {
    const url = process.env.ANCHOR_API_URL || loadCredentials()?.apiUrl || 'https://anchorscape.com';
    // Validate the URL to prevent SSRF
    try {
        const parsed = new URL(url);
        if (!ALLOWED_API_HOSTS.includes(parsed.hostname) && !parsed.hostname.endsWith('.anchorscape.com')) {
            return 'https://anchorscape.com';
        }
        // Enforce HTTPS for non-localhost
        if (parsed.hostname !== 'localhost' && parsed.protocol !== 'https:') {
            return 'https://anchorscape.com';
        }
    }
    catch {
        return 'https://anchorscape.com';
    }
    return url;
}
function requireAuth() {
    const creds = loadCredentials();
    if (!creds) {
        throw new Error('Not logged in. Use the anchorscape_login tool first.');
    }
    if (isTokenExpired(creds)) {
        throw new Error('Session expired. Use the anchorscape_login tool to re-authenticate.');
    }
    return creds;
}
// ============================================================================
// HTTP CLIENT
// ============================================================================
async function apiRequest(method, urlPath, options) {
    const url = `${getBaseUrl()}${urlPath}`;
    const headers = { ...options?.headers };
    if (!options?.noAuth) {
        const creds = requireAuth();
        headers['Authorization'] = `Bearer ${creds.token}`;
    }
    if (options?.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
        method,
        headers,
        body: options?.body instanceof FormData
            ? options.body
            : options?.body ? JSON.stringify(options.body) : undefined,
    });
    return res;
}
async function apiJSON(method, urlPath, options) {
    const res = await apiRequest(method, urlPath, options);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Request failed: ${res.status}`);
    }
    return res.json();
}
// ============================================================================
// ZIP
// ============================================================================
// Always exclude regardless of .gitignore
const ALWAYS_EXCLUDE = [
    '.git',
    'node_modules',
    '.anchor',
    '.anchorscape',
    '.DS_Store',
    'Thumbs.db',
    '__pycache__',
    '.venv',
    'venv',
    '.next',
    '.nuxt',
    'dist',
    'build',
    'coverage',
    '.env',
    '.env.local',
    '.env.production',
    '.env.staging',
    '.env.development',
    '.env.test',
];
function shouldExclude(relativePath, isDir, gitignorePatterns) {
    const parts = relativePath.split('/');
    const name = parts[parts.length - 1];
    // Check always-exclude list (exact match and .env.* pattern)
    if (ALWAYS_EXCLUDE.includes(name))
        return true;
    if (name.startsWith('.env.'))
        return true;
    // Check gitignore patterns (basic implementation)
    for (const pattern of gitignorePatterns) {
        if (!pattern || pattern.startsWith('#'))
            continue;
        const trimmed = pattern.trim();
        if (!trimmed)
            continue;
        // Simple matching: exact name, or wildcard
        const isNegation = trimmed.startsWith('!');
        const pat = isNegation ? trimmed.slice(1) : trimmed;
        // Directory-only pattern (ends with /)
        if (pat.endsWith('/')) {
            if (isDir && name === pat.slice(0, -1))
                return !isNegation;
            continue;
        }
        // Exact match
        if (name === pat || relativePath === pat) {
            return !isNegation;
        }
        // Wildcard match (*.ext)
        if (pat.startsWith('*.')) {
            const ext = pat.slice(1);
            if (name.endsWith(ext))
                return !isNegation;
        }
    }
    return false;
}
async function zipDirectory(dir) {
    // Load gitignore patterns
    let gitignorePatterns = [];
    for (const ignoreFile of ['.gitignore', '.anchorignore']) {
        try {
            const content = fs.readFileSync(path.join(dir, ignoreFile), 'utf-8');
            gitignorePatterns.push(...content.split('\n'));
        }
        catch { /* file doesn't exist */ }
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        let fileCount = 0;
        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('error', reject);
        archive.on('end', () => {
            resolve({ buffer: Buffer.concat(chunks), fileCount });
        });
        const addDir = (currentDir, prefix) => {
            let entries;
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (shouldExclude(relativePath, entry.isDirectory(), gitignorePatterns)) {
                    continue;
                }
                const fullPath = path.join(currentDir, entry.name);
                // Skip symlinks to prevent path traversal attacks
                if (entry.isSymbolicLink()) {
                    continue;
                }
                if (entry.isDirectory()) {
                    addDir(fullPath, relativePath);
                }
                else if (entry.isFile()) {
                    // Verify resolved path is still within the root directory
                    const resolved = fs.realpathSync(fullPath);
                    if (!resolved.startsWith(fs.realpathSync(dir) + path.sep) && resolved !== fs.realpathSync(dir)) {
                        continue;
                    }
                    archive.file(fullPath, { name: relativePath });
                    fileCount++;
                }
            }
        };
        addDir(dir, '');
        archive.finalize();
    });
}
// ============================================================================
// HANDLERS
// ============================================================================
/**
 * Deploy a project directory
 */
export async function handleDeploy(directory, environment = 'development', projectName) {
    // Validate directory
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error(`Directory not found: ${directory}`);
    }
    // Check auth
    requireAuth();
    // Detect project name
    if (!projectName) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf-8'));
            projectName = pkg.name?.replace(/^@[^/]+\//, '') || path.basename(directory);
        }
        catch {
            projectName = path.basename(directory);
        }
    }
    // Clean project name for K8s compatibility
    const cleanName = (projectName || path.basename(directory))
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    projectName = cleanName;
    // ZIP the directory
    const { buffer, fileCount } = await zipDirectory(directory);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    if (buffer.length > 100 * 1024 * 1024) {
        throw new Error(`Project is too large (${sizeMB} MB, max 100 MB). Add large files to .gitignore or .anchorignore.`);
    }
    // Check if project/environment already exists
    let environmentId = null;
    try {
        const projects = await apiJSON('GET', '/api/k3s/projects');
        const existingProject = projects.projects?.find((p) => p.name === projectName || p.displayName === projectName);
        if (existingProject) {
            const env = existingProject.environments?.find((e) => e.name === environment);
            if (env) {
                environmentId = env.id;
            }
        }
    }
    catch { /* first deploy, no existing project */ }
    // Upload
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(buffer)]), 'project.zip');
    if (environmentId) {
        formData.append('environmentId', environmentId);
    }
    else {
        formData.append('projectName', projectName);
        formData.append('environmentName', environment);
    }
    const uploadRes = await apiRequest('POST', '/api/k3s/deploy/upload', {
        body: formData,
    });
    if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(`Upload failed: ${data.error || data.message || `HTTP ${uploadRes.status}`}`);
    }
    const deployData = await uploadRes.json();
    // Wait for deployment to complete (poll instead of SSE for MCP compatibility)
    const deploymentId = deployData.deploymentId;
    const maxWait = 300_000; // 5 minutes
    const pollInterval = 5_000; // 5 seconds
    const startTime = Date.now();
    let finalStatus = 'unknown';
    let finalUrl = '';
    let errorMessage = '';
    while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        try {
            const statusRes = await apiJSON('GET', `/api/k3s/deployments/${deploymentId}`);
            const dep = statusRes.deployment;
            if (dep.status === 'completed') {
                finalStatus = 'completed';
                finalUrl = dep.externalUrl || dep.deployedUrls?.[0] || `https://${projectName}.anchorscape.com`;
                break;
            }
            if (dep.status === 'failed') {
                finalStatus = 'failed';
                errorMessage = dep.errorMessage || 'Unknown error';
                break;
            }
            // Still building/deploying — continue polling
        }
        catch {
            // Network hiccup, keep polling
        }
    }
    if (finalStatus === 'completed') {
        const lines = [
            '# Deployed Successfully!',
            '',
            `**URL:** ${finalUrl}`,
            `**Environment:** ${environment}`,
            `**Project:** ${projectName}`,
            `**Files:** ${fileCount} (${sizeMB} MB)`,
            '',
            '## Add to your README',
            '```markdown',
            `[![Deployed on Anchorscape](https://anchorscape.com/api/badge/${projectName}/status)](${finalUrl})`,
            '```',
            '',
            'Use `/anchorscape:status` to check deployment health.',
        ];
        return lines.join('\n');
    }
    else if (finalStatus === 'failed') {
        throw new Error(`Deployment failed: ${errorMessage}`);
    }
    else {
        return [
            `Deployment started (ID: ${deploymentId})`,
            `Project: ${projectName}`,
            `Environment: ${environment}`,
            `Files: ${fileCount} (${sizeMB} MB)`,
            '',
            'Deployment is still in progress. Use anchorscape_status to check.',
        ].join('\n');
    }
}
/**
 * Login via browser OAuth (polling-based — works in WSL2, SSH, Docker, etc.)
 *
 * Flow:
 * 1. Create a pending auth session on the server
 * 2. Open browser to auth page referencing that session
 * 3. User authorizes in browser → server stores token
 * 4. MCP polls server until token is available
 */
export async function handleLogin(apiUrl) {
    let baseUrl = apiUrl || process.env.ANCHOR_API_URL || 'https://anchorscape.com';
    // Validate apiUrl against the same allowlist used by getBaseUrl()
    try {
        const parsed = new URL(baseUrl);
        if (!ALLOWED_API_HOSTS.includes(parsed.hostname) && !parsed.hostname.endsWith('.anchorscape.com')) {
            baseUrl = 'https://anchorscape.com';
        }
        // Enforce HTTPS for non-localhost
        if (parsed.hostname !== 'localhost' && parsed.protocol !== 'https:') {
            baseUrl = 'https://anchorscape.com';
        }
    }
    catch {
        baseUrl = 'https://anchorscape.com';
    }
    // Check if already logged in
    const existing = loadCredentials();
    if (existing && !isTokenExpired(existing)) {
        return [
            `Already logged in as **${existing.email}**`,
            `API: ${existing.apiUrl}`,
            '',
            'To switch accounts, delete ~/.config/anchorscape/credentials.json and run this tool again.',
        ].join('\n');
    }
    // Create a pending auth session on the server
    const sessionRes = await fetch(`${baseUrl}/api/auth/cli/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!sessionRes.ok) {
        throw new Error('Failed to create auth session. Is the Anchorscape server reachable?');
    }
    const { sessionId } = await sessionRes.json();
    const authUrl = `${baseUrl}/cli/auth?session=${sessionId}`;
    // Try to open browser (WSL/macOS/Linux/Windows)
    import('child_process').then(({ execFile }) => {
        const isWSL = (() => {
            try {
                return fs.readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');
            }
            catch {
                return false;
            }
        })();
        if (process.platform === 'win32') {
            execFile('cmd.exe', ['/c', 'start', '', authUrl], { timeout: 5000 }, () => { });
        }
        else if (isWSL) {
            execFile('wslview', [authUrl], { timeout: 5000 }, (err) => {
                if (err) {
                    execFile('cmd.exe', ['/c', 'start', '', authUrl], { timeout: 5000 }, () => { });
                }
            });
        }
        else if (process.platform === 'darwin') {
            execFile('open', [authUrl], { timeout: 5000 }, () => { });
        }
        else {
            execFile('xdg-open', [authUrl], { timeout: 5000 }, () => { });
        }
    }).catch(() => { });
    console.error(`\x1b[34m[auth]\x1b[0m Opening browser for login...`);
    console.error(`\x1b[34m[auth]\x1b[0m URL: ${authUrl}`);
    // Poll for completion
    const maxWait = 120_000; // 2 minutes
    const pollInterval = 2_000; // 2 seconds
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        try {
            const statusRes = await fetch(`${baseUrl}/api/auth/cli/session/${sessionId}/status`);
            if (!statusRes.ok)
                continue;
            const data = await statusRes.json();
            if (data.status === 'completed' && data.token) {
                saveCredentials({
                    token: data.token,
                    email: data.email || '',
                    name: data.name || '',
                    expiresAt: data.expiresAt || '',
                    apiUrl: baseUrl,
                });
                console.error(`\x1b[32m[auth]\x1b[0m Logged in as ${data.email}`);
                return [
                    `Logged in as **${data.email}**`,
                    '',
                    'You can now use anchorscape_deploy to deploy your projects.',
                ].join('\n');
            }
            if (data.status === 'expired') {
                break;
            }
            // status === 'pending' — keep polling
        }
        catch {
            // Network hiccup — keep polling
        }
    }
    // Timeout or expired
    return [
        '**Login was not completed in time.**',
        '',
        'Please open this URL in your browser to log in:',
        '',
        authUrl,
        '',
        'After authorizing, run this tool again.',
    ].join('\n');
}
/**
 * Check deployment status
 */
export async function handleStatus(projectName, environmentId) {
    requireAuth();
    // If specific environment given
    if (environmentId) {
        const data = await apiJSON('GET', `/api/k3s/environments/${environmentId}`);
        const env = data.environment;
        return formatEnvironmentStatus(env);
    }
    // List all projects
    const data = await apiJSON('GET', '/api/k3s/projects');
    const projects = data.projects || [];
    if (projects.length === 0) {
        return 'No projects found. Use anchorscape_deploy to deploy your first project.';
    }
    // Filter by project name if given
    const filtered = projectName
        ? projects.filter((p) => p.name === projectName || p.displayName === projectName)
        : projects;
    if (filtered.length === 0) {
        return `No project named "${projectName}" found. Available projects: ${projects.map((p) => p.name).join(', ')}`;
    }
    const lines = ['# Anchorscape Deployments', ''];
    for (const project of filtered) {
        lines.push(`## ${project.displayName || project.name}`);
        const environments = project.environments || [];
        if (environments.length === 0) {
            lines.push('  No environments');
        }
        else {
            for (const env of environments) {
                const status = env.activeDeploymentId ? 'LIVE' : 'IDLE';
                const url = env.customDomain
                    ? `https://${env.customDomain}`
                    : `https://${env.subdomain}.anchorscape.com`;
                lines.push(`  **${env.name}** — ${url} — ${status}`);
                lines.push(`    Environment ID: ${env.id}`);
            }
        }
        lines.push('');
    }
    lines.push('Use anchorscape_logs with an environment ID to view logs.');
    return lines.join('\n');
}
function formatEnvironmentStatus(env) {
    const url = env.customDomain
        ? `https://${env.customDomain}`
        : `https://${env.subdomain}.anchorscape.com`;
    return [
        `## ${env.displayName || env.name}`,
        '',
        `**URL:** ${url}`,
        `**Status:** ${env.activeDeploymentId ? 'LIVE' : 'IDLE'}`,
        `**Tier:** ${env.resourceTier}`,
        `**Port:** ${env.appPort}`,
        `**Replicas:** ${env.replicas}`,
        `**Environment ID:** ${env.id}`,
        env.customDomain ? `**Custom Domain:** ${env.customDomain}` : '',
        '',
        `Created: ${env.createdAt}`,
        `Updated: ${env.updatedAt}`,
    ].filter(Boolean).join('\n');
}
/**
 * Get logs for a deployment
 */
export async function handleLogs(environmentId, lines = 50) {
    requireAuth();
    // Clamp lines to prevent abuse
    const clampedLines = Math.max(1, Math.min(lines, 500));
    const data = await apiJSON('GET', `/api/k3s/environments/${environmentId}/logs?lines=${clampedLines}`);
    if (!data.logs || data.logs.length === 0) {
        return 'No logs available for this environment.';
    }
    return [
        `# Logs (last ${lines} lines)`,
        `Environment: ${environmentId}`,
        '',
        '```',
        data.logs,
        '```',
    ].join('\n');
}
/**
 * List all projects
 */
export async function handleProjects() {
    return handleStatus();
}
