/**
 * Agent Routes - Serve Local Agent files for download
 * 
 * The Local Agent runs on the user's Windows desktop (where Chatterbox lives)
 * and communicates with T2 running on the Pi via HTTP.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Path to the localAgent folder
const AGENT_DIR = path.join(__dirname, '../../localAgent');
const VERBOSE = process.env.VERBOSE_LOGGING === 'true';

if (VERBOSE) {
    console.log(`[AgentRoutes] AGENT_DIR = ${AGENT_DIR}`);
    console.log(`[AgentRoutes] AGENT_DIR exists = ${fs.existsSync(AGENT_DIR)}`);
    if (fs.existsSync(AGENT_DIR)) {
        console.log(`[AgentRoutes] Files in AGENT_DIR: ${fs.readdirSync(AGENT_DIR).join(', ')}`);
    }
}

/**
 * GET /api/agent/download/:filename
 * Serve agent files for download
 */
router.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    
    // Security: Only allow specific files
    const allowedFiles = ['t2_agent.py', 'start_agent.bat'];
    if (!allowedFiles.includes(filename)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const filePath = path.join(AGENT_DIR, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`[Agent] File not found: ${filePath}`);
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
        console.error(`[Agent] Error streaming file: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Error reading file' });
        }
    });
});

/**
 * GET /api/agent/files
 * List available agent files
 */
router.get('/files', (req, res) => {
    const files = ['t2_agent.py', 'start_agent.bat'];
    const available = files.filter(f => fs.existsSync(path.join(AGENT_DIR, f)));
    
    res.json({
        available,
        agentDir: AGENT_DIR,
        note: 'Download these files to your Windows desktop and run start_agent.bat'
    });
});

module.exports = router;
