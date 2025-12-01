const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../logging/logger');

module.exports = (io, deviceService) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const nodeDir = path.join(__dirname, '../../frontend/js/nodes');
      const files = await fs.readdir(nodeDir);
      const nodeFiles = files.filter(file => file.endsWith('-nodes.js'));
      logger.log(`Fetched ${nodeFiles.length} node files`, 'info', false, 'nodes:fetch');
      res.json({ success: true, nodes: nodeFiles });
    } catch (error) {
      logger.log(`Error fetching node files: ${error.message}`, 'error', false, 'nodes:error');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};