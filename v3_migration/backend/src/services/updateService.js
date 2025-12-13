/**
 * Update Service - Checks GitHub for updates and handles update process
 * 
 * Compares local package.json version with remote stable branch
 * Fetches CHANGELOG.md for update notes
 */

const https = require('https');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// GitHub repo info
const GITHUB_OWNER = 'gregtee2';
const GITHUB_REPO = 'T2AutoTron';
const UPDATE_BRANCH = 'stable';

// Cache update check results
let cachedUpdateInfo = null;
let lastCheckTime = 0;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Get local version from package.json
 */
function getLocalVersion() {
    try {
        const packagePath = path.join(__dirname, '../../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageJson.version || '0.0.0';
    } catch (err) {
        console.error('[UpdateService] Failed to read local version:', err.message);
        return '0.0.0';
    }
}

/**
 * Fetch file content from GitHub raw
 */
function fetchGitHubFile(filePath) {
    return new Promise((resolve, reject) => {
        const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${UPDATE_BRANCH}/${filePath}`;
        
        https.get(url, { headers: { 'User-Agent': 'T2AutoTron-UpdateChecker' } }, (res) => {
            if (res.statusCode === 404) {
                resolve(null);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Compare semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
    // Remove any prefix like 'v'
    v1 = v1.replace(/^v/, '');
    v2 = v2.replace(/^v/, '');
    
    // Split into parts (handle beta/alpha suffixes)
    const parse = (v) => {
        const [main, pre] = v.split('-');
        const parts = main.split('.').map(Number);
        return { parts, pre: pre || '' };
    };
    
    const p1 = parse(v1);
    const p2 = parse(v2);
    
    // Compare main version numbers
    for (let i = 0; i < Math.max(p1.parts.length, p2.parts.length); i++) {
        const n1 = p1.parts[i] || 0;
        const n2 = p2.parts[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    
    // Same main version - compare pre-release
    // No pre-release > has pre-release (2.1.0 > 2.1.0-beta.1)
    if (!p1.pre && p2.pre) return 1;
    if (p1.pre && !p2.pre) return -1;
    if (p1.pre && p2.pre) {
        // Compare pre-release strings (beta.2 > beta.1)
        return p1.pre.localeCompare(p2.pre, undefined, { numeric: true });
    }
    
    return 0;
}

/**
 * Parse CHANGELOG.md to extract latest version notes
 */
function parseChangelog(content, currentVersion, newVersion) {
    if (!content) return 'No changelog available.';
    
    const lines = content.split('\n');
    const notes = [];
    let capturing = false;
    let foundNewVersion = false;
    
    for (const line of lines) {
        // Look for version headers like "## [2.1.0]" or "## 2.1.0" or "### v2.1.0"
        const versionMatch = line.match(/^#{1,3}\s+\[?v?(\d+\.\d+\.\d+[^\]]*)\]?/i);
        
        if (versionMatch) {
            const lineVersion = versionMatch[1];
            
            // Start capturing at new version, stop at current version
            if (compareVersions(lineVersion, newVersion) === 0) {
                capturing = true;
                foundNewVersion = true;
                notes.push(line);
            } else if (compareVersions(lineVersion, currentVersion) <= 0) {
                capturing = false;
            } else if (capturing) {
                notes.push(line);
            }
        } else if (capturing) {
            notes.push(line);
        }
    }
    
    // If we didn't find structured changelog, return first 500 chars
    if (notes.length === 0) {
        return content.substring(0, 500) + (content.length > 500 ? '...' : '');
    }
    
    return notes.join('\n').trim();
}

/**
 * Check for updates from GitHub
 */
async function checkForUpdates(forceCheck = false) {
    const now = Date.now();
    
    // Return cached result if recent
    if (!forceCheck && cachedUpdateInfo && (now - lastCheckTime) < CHECK_INTERVAL) {
        return cachedUpdateInfo;
    }
    
    try {
        const localVersion = getLocalVersion();
        
        // Fetch remote package.json
        const remotePackageJson = await fetchGitHubFile('v3_migration/backend/package.json');
        if (!remotePackageJson) {
            throw new Error('Could not fetch remote package.json');
        }
        
        const remotePackage = JSON.parse(remotePackageJson);
        const remoteVersion = remotePackage.version || '0.0.0';
        
        // Compare versions
        const hasUpdate = compareVersions(remoteVersion, localVersion) > 0;
        
        let changelog = '';
        if (hasUpdate) {
            // Fetch changelog
            const changelogContent = await fetchGitHubFile('CHANGELOG.md');
            changelog = parseChangelog(changelogContent, localVersion, remoteVersion);
        }
        
        cachedUpdateInfo = {
            hasUpdate,
            currentVersion: localVersion,
            newVersion: remoteVersion,
            changelog,
            checkedAt: new Date().toISOString()
        };
        lastCheckTime = now;
        
        if (hasUpdate) {
            console.log(`[UpdateService] Update available: ${localVersion} → ${remoteVersion}`);
        } else {
            console.log(`[UpdateService] Up to date (${localVersion})`);
        }
        
        return cachedUpdateInfo;
        
    } catch (err) {
        console.error('[UpdateService] Update check failed:', err.message);
        return {
            hasUpdate: false,
            currentVersion: getLocalVersion(),
            newVersion: null,
            changelog: '',
            error: err.message
        };
    }
}

/**
 * Apply update - git pull and restart
 */
async function applyUpdate() {
    const projectRoot = path.join(__dirname, '../../../..');  // Up to T2AutoTron2.1 root
    
    console.log('[UpdateService] Starting update process...');
    console.log('[UpdateService] Project root:', projectRoot);
    
    try {
        // Backup config files that might be overwritten
        const configDir = path.join(projectRoot, 'v3_migration/backend/config');
        const configBackup = {};
        if (fs.existsSync(configDir)) {
            const configFiles = fs.readdirSync(configDir);
            for (const file of configFiles) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(configDir, file);
                    try {
                        configBackup[file] = fs.readFileSync(filePath, 'utf8');
                        console.log(`[UpdateService] Backed up config: ${file}`);
                    } catch (e) { /* ignore */ }
                }
            }
        }
        
        // Stash any local changes (tracked files)
        console.log('[UpdateService] Stashing local changes...');
        try {
            execSync('git stash --include-untracked', { cwd: projectRoot, stdio: 'pipe' });
        } catch (e) {
            // Ignore if nothing to stash
        }
        
        // Fetch and reset to stable (force overwrite)
        console.log('[UpdateService] Fetching updates from stable branch...');
        execSync(`git fetch origin ${UPDATE_BRANCH}`, { cwd: projectRoot, stdio: 'pipe' });
        execSync(`git checkout ${UPDATE_BRANCH}`, { cwd: projectRoot, stdio: 'pipe' });
        execSync(`git reset --hard origin/${UPDATE_BRANCH}`, { cwd: projectRoot, stdio: 'pipe' });
        
        // Restore config files
        if (Object.keys(configBackup).length > 0) {
            console.log('[UpdateService] Restoring config files...');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            for (const [file, content] of Object.entries(configBackup)) {
                const filePath = path.join(configDir, file);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`[UpdateService] Restored config: ${file}`);
            }
        }
        
        // Run npm install in case dependencies changed
        console.log('[UpdateService] Installing dependencies...');
        execSync('npm install', { cwd: path.join(projectRoot, 'v3_migration/backend'), stdio: 'pipe' });
        execSync('npm install', { cwd: path.join(projectRoot, 'v3_migration/frontend'), stdio: 'pipe' });
        
        // Build frontend
        console.log('[UpdateService] Building frontend...');
        execSync('npm run build', { cwd: path.join(projectRoot, 'v3_migration/frontend'), stdio: 'pipe' });
        
        // Copy build to backend
        const distPath = path.join(projectRoot, 'v3_migration/frontend/dist');
        const destPath = path.join(projectRoot, 'v3_migration/backend/frontend');
        if (fs.existsSync(distPath)) {
            // Copy files (cross-platform)
            const files = fs.readdirSync(distPath);
            for (const file of files) {
                const src = path.join(distPath, file);
                const dest = path.join(destPath, file);
                if (fs.statSync(src).isDirectory()) {
                    fs.cpSync(src, dest, { recursive: true, force: true });
                } else {
                    fs.copyFileSync(src, dest);
                }
            }
        }
        
        console.log('[UpdateService] Update complete! Restarting...');
        
        // For production: just restart the backend server
        // The frontend is already built and served statically
        const backendDir = path.join(projectRoot, 'v3_migration/backend');
        
        // Create a simple restart script that waits for this process to exit
        const restartScript = path.join(projectRoot, 'restart_backend.bat');
        const scriptContent = `@echo off
timeout /t 3 /nobreak >nul
cd /d "${backendDir}"
start "T2AutoTron Backend" /MIN cmd /k node src/server.js
`;
        fs.writeFileSync(restartScript, scriptContent);
        
        // Spawn the restart script detached
        const child = spawn('cmd', ['/c', restartScript], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        
        // Exit current process after short delay
        setTimeout(() => {
            process.exit(0);
        }, 1000);
        
        return { success: true, message: 'Update applied. Restarting...' };
        
    } catch (err) {
        console.error('[UpdateService] Update failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Check if plugin updates are available
 * Compares local plugins with remote stable branch
 */
async function checkPluginUpdates() {
    try {
        const pluginsDir = path.join(__dirname, '../../plugins');
        
        // Get list of local plugin files with their modification info
        const localPlugins = {};
        if (fs.existsSync(pluginsDir)) {
            const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const filePath = path.join(pluginsDir, file);
                const stats = fs.statSync(filePath);
                localPlugins[file] = {
                    size: stats.size,
                    mtime: stats.mtime.toISOString()
                };
            }
        }
        
        // Fetch the plugin list from GitHub API (get tree of plugins folder)
        const treeUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/v3_migration/backend/plugins?ref=${UPDATE_BRANCH}`;
        
        const remotePlugins = await new Promise((resolve, reject) => {
            https.get(treeUrl, { 
                headers: { 
                    'User-Agent': 'T2AutoTron-UpdateChecker',
                    'Accept': 'application/vnd.github.v3+json'
                } 
            }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`GitHub API returned ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
        
        // Compare counts and sizes
        const remoteFiles = remotePlugins.filter(f => f.name.endsWith('.js'));
        const localCount = Object.keys(localPlugins).length;
        const remoteCount = remoteFiles.length;
        
        // Check for new or modified plugins
        const newPlugins = [];
        const modifiedPlugins = [];
        
        for (const remote of remoteFiles) {
            if (!localPlugins[remote.name]) {
                newPlugins.push(remote.name);
            } else if (localPlugins[remote.name].size !== remote.size) {
                modifiedPlugins.push(remote.name);
            }
        }
        
        const hasUpdates = newPlugins.length > 0 || modifiedPlugins.length > 0;
        
        return {
            success: true,
            hasUpdates,
            localCount,
            remoteCount,
            newPlugins,
            modifiedPlugins,
            message: hasUpdates 
                ? `${newPlugins.length} new, ${modifiedPlugins.length} modified plugins available`
                : 'Plugins are up to date'
        };
        
    } catch (err) {
        console.error('[UpdateService] Plugin check failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Update plugins only (hot update, no restart needed)
 * Downloads updated plugin files from stable branch
 */
async function updatePluginsOnly() {
    try {
        const pluginsDir = path.join(__dirname, '../../plugins');
        
        // Ensure plugins directory exists
        if (!fs.existsSync(pluginsDir)) {
            fs.mkdirSync(pluginsDir, { recursive: true });
        }
        
        // First check what's available
        const checkResult = await checkPluginUpdates();
        if (!checkResult.success) {
            return checkResult;
        }
        
        const toUpdate = [...checkResult.newPlugins, ...checkResult.modifiedPlugins];
        
        if (toUpdate.length === 0) {
            return { 
                success: true, 
                updated: [], 
                message: 'Plugins are already up to date' 
            };
        }
        
        // Download each updated plugin
        const updated = [];
        const failed = [];
        
        for (const pluginName of toUpdate) {
            try {
                const content = await fetchGitHubFile(`v3_migration/backend/plugins/${pluginName}`);
                if (content) {
                    const pluginPath = path.join(pluginsDir, pluginName);
                    fs.writeFileSync(pluginPath, content, 'utf8');
                    updated.push(pluginName);
                    console.log(`[UpdateService] Updated plugin: ${pluginName}`);
                } else {
                    failed.push({ name: pluginName, error: 'File not found' });
                }
            } catch (err) {
                failed.push({ name: pluginName, error: err.message });
                console.error(`[UpdateService] Failed to update ${pluginName}:`, err.message);
            }
        }
        
        return {
            success: true,
            updated,
            failed,
            message: `Updated ${updated.length} plugin(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}. Refresh page to load new plugins.`
        };
        
    } catch (err) {
        console.error('[UpdateService] Plugin update failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get current version info
 */
function getVersionInfo() {
    return {
        version: getLocalVersion(),
        branch: UPDATE_BRANCH
    };
}

module.exports = {
    checkForUpdates,
    applyUpdate,
    getVersionInfo,
    getLocalVersion,
    compareVersions,
    checkPluginUpdates,
    updatePluginsOnly
};
