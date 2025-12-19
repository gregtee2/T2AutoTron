/**
 * AI Bug Analyzer for T2AutoTron
 * 
 * Reads a GitHub issue, analyzes it with Claude, and outputs:
 * 1. A markdown analysis comment
 * 2. Suggested files to check
 * 3. Potential fix approach
 */

const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ISSUE_TITLE = process.env.ISSUE_TITLE || '';
const ISSUE_BODY = process.env.ISSUE_BODY || '';
const ISSUE_NUMBER = process.env.ISSUE_NUMBER || '0';

// Key files to include as context (most likely to contain bugs)
const CONTEXT_FILES = [
  'v3_migration/backend/src/server.js',
  'v3_migration/frontend/src/Editor.jsx',
  'v3_migration/backend/src/engine/BackendEngine.js',
  'v3_migration/backend/src/devices/managers/homeAssistantManager.js',
  '.github/copilot-instructions.md'
];

// Plugin patterns to search for based on issue content
const PLUGIN_PATTERNS = [
  { keywords: ['timeline', 'color', 'spline'], file: 'SplineTimelineColorNode.js' },
  { keywords: ['stock', 'price', 'yahoo'], file: 'StockPriceNode.js' },
  { keywords: ['delay', 'timer', 'debounce'], file: 'DelayNode.js' },
  { keywords: ['ha ', 'home assistant', 'device'], file: 'HAGenericDeviceNode.js' },
  { keywords: ['hue', 'philips'], file: 'HueLightNode.js' },
  { keywords: ['kasa', 'tp-link'], file: 'KasaLightNode.js' },
  { keywords: ['weather'], file: 'WeatherLogicNode.js' },
  { keywords: ['time of day', 'schedule'], file: 'TimeOfDayNode.js' },
];

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Skipping AI analysis.');
    writeResult(createFallbackAnalysis());
    return;
  }

  console.log(`Analyzing issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  // Gather context
  const issueText = `# Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}\n\n${ISSUE_BODY}`;
  const relevantFiles = findRelevantFiles(ISSUE_BODY.toLowerCase() + ' ' + ISSUE_TITLE.toLowerCase());
  const fileContents = await gatherFileContents(relevantFiles);

  // Build prompt
  const prompt = buildPrompt(issueText, fileContents);

  try {
    const analysis = await callClaude(prompt);
    writeResult(analysis);
    console.log('Analysis complete. Result written to analysis-result.md');
  } catch (error) {
    console.error('Claude API error:', error.message);
    writeResult(createErrorAnalysis(error.message));
  }
}

function findRelevantFiles(searchText) {
  const files = [...CONTEXT_FILES];
  
  // Add plugins based on keywords in issue
  for (const pattern of PLUGIN_PATTERNS) {
    if (pattern.keywords.some(kw => searchText.includes(kw))) {
      files.push(`v3_migration/backend/plugins/${pattern.file}`);
    }
  }

  // Check for error patterns that might indicate specific files
  if (searchText.includes('socket') || searchText.includes('websocket')) {
    files.push('v3_migration/frontend/src/socket.js');
    files.push('v3_migration/backend/src/api/socketHandlers.js');
  }
  if (searchText.includes('cors') || searchText.includes('ingress')) {
    files.push('v3_migration/backend/src/config/cors.js');
  }
  if (searchText.includes('engine') || searchText.includes('headless')) {
    files.push('v3_migration/backend/src/engine/nodes/ColorNodes.js');
    files.push('v3_migration/backend/src/engine/nodes/HADeviceNodes.js');
  }

  return [...new Set(files)]; // Dedupe
}

async function gatherFileContents(filePaths) {
  const contents = {};
  
  for (const filePath of filePaths) {
    const fullPath = path.join(process.cwd(), filePath);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Truncate very large files
        contents[filePath] = content.length > 50000 
          ? content.slice(0, 50000) + '\n\n[... truncated ...]'
          : content;
      }
    } catch (e) {
      console.warn(`Could not read ${filePath}: ${e.message}`);
    }
  }
  
  return contents;
}

function buildPrompt(issueText, fileContents) {
  let filesSection = '';
  for (const [path, content] of Object.entries(fileContents)) {
    filesSection += `\n\n### File: ${path}\n\`\`\`javascript\n${content}\n\`\`\``;
  }

  return `You are an expert developer analyzing a bug report for T2AutoTron, a visual node-based smart home automation editor.

## Bug Report
${issueText}

## Relevant Source Files
${filesSection}

## Your Task

Analyze this bug report and provide:

1. **🔍 Analysis**: What the bug likely is and why it's happening
2. **📁 Likely Files**: Which files probably need to be modified
3. **🔧 Suggested Fix**: Specific code changes that would fix the issue
4. **⚠️ Risk Level**: Low/Medium/High - how risky is this fix?
5. **🧪 Test Steps**: How to verify the fix works

Format your response as a GitHub-friendly markdown comment. Start with a header like "## 🤖 AI Bug Analysis".

If you're not confident about the fix, say so. If more information is needed, list what questions should be asked.

Remember: This is a Node.js/React/Rete.js application with a plugin system. Plugins are in \`backend/plugins/\`. The backend engine (for headless mode) mirrors frontend plugins in \`backend/src/engine/nodes/\`.`;
}

async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function createFallbackAnalysis() {
  return `## 🤖 AI Bug Analysis

> ⚠️ **Automated analysis unavailable** - ANTHROPIC_API_KEY not configured.

### Manual Triage Checklist

- [ ] Check browser console for errors
- [ ] Check server logs (\`npm start\` terminal)
- [ ] Identify which node/feature is affected
- [ ] Check if issue is frontend-only or also affects headless mode
- [ ] Look for similar past issues

### Common Bug Locations

| Symptom | Check These Files |
|---------|-------------------|
| Node not working | \`backend/plugins/<NodeName>.js\` |
| Headless mode issue | \`backend/src/engine/nodes/\` |
| HA connection | \`backend/src/devices/managers/homeAssistantManager.js\` |
| Socket/real-time | \`backend/src/api/socketHandlers.js\` |
| CORS/Add-on | \`backend/src/config/cors.js\` |

---
*To enable AI analysis, add \`ANTHROPIC_API_KEY\` to repository secrets.*`;
}

function createErrorAnalysis(errorMessage) {
  return `## 🤖 AI Bug Analysis

> ⚠️ **Analysis failed**: ${errorMessage}

The automated analysis encountered an error. A maintainer will review this issue manually.

---
*This is an automated message.*`;
}

function writeResult(content) {
  const outputPath = path.join(__dirname, 'analysis-result.md');
  fs.writeFileSync(outputPath, content, 'utf8');
}

main().catch(console.error);
