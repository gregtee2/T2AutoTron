/**
 * sharedLogicRoutes.js
 * 
 * Serves shared logic files to the frontend.
 * Frontend can load these and use the same calculation functions as the backend.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Get the shared logic directory
const logicDir = path.join(__dirname, '../../../../shared/logic');

/**
 * GET /api/shared-logic
 * Returns list of available shared logic modules
 */
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(logicDir)) {
            return res.json({ modules: [], error: 'Shared logic directory not found' });
        }
        
        const files = fs.readdirSync(logicDir)
            .filter(f => f.endsWith('Logic.js'))
            .map(f => f.replace('.js', ''));
        
        res.json({ modules: files });
    } catch (err) {
        console.error('[SharedLogic] Error listing modules:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/shared-logic/:name
 * Returns a specific shared logic module as JavaScript
 */
router.get('/:name', (req, res) => {
    try {
        const name = req.params.name;
        const filePath = path.join(logicDir, `${name}.js`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Module '${name}' not found` });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        res.type('application/javascript').send(content);
    } catch (err) {
        console.error('[SharedLogic] Error loading module:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
