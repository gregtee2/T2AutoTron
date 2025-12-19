/**
 * stockRoutes.js - Yahoo Finance proxy for StockPriceNode
 * 
 * Proxies requests to Yahoo Finance API to avoid browser CORS issues.
 */

const express = require('express');
const router = express.Router();
const logger = require('../../logging/logger');

/**
 * GET /api/stock/:symbol
 * Fetch stock quote from Yahoo Finance
 */
router.get('/:symbol', async (req, res) => {
    const symbol = req.params.symbol?.toUpperCase().trim();
    
    if (!symbol) {
        return res.status(400).json({ error: 'Symbol required' });
    }

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'T2AutoTron/2.1'
            }
        });

        if (!response.ok) {
            logger.log(`[Stock] Yahoo API error for ${symbol}: HTTP ${response.status}`, 'error');
            return res.status(response.status).json({ error: `Yahoo API error: ${response.status}` });
        }

        const data = await response.json();

        if (data.chart?.error) {
            const errMsg = data.chart.error.description || 'Unknown API error';
            logger.log(`[Stock] Yahoo API error for ${symbol}: ${errMsg}`, 'error');
            return res.status(400).json({ error: errMsg });
        }

        const result = data.chart?.result?.[0];
        if (!result) {
            return res.status(404).json({ error: 'No data returned' });
        }

        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose || meta.chartPreviousClose;

        if (currentPrice === undefined || previousClose === undefined) {
            return res.status(500).json({ error: 'Price data unavailable' });
        }

        const priceChange = currentPrice - previousClose;
        const changePercent = (priceChange / previousClose) * 100;

        const quote = {
            symbol: symbol,
            price: currentPrice,
            change: priceChange,
            changePercent: changePercent,
            isUp: priceChange >= 0,
            previousClose: previousClose,
            timestamp: new Date().toISOString()
        };

        logger.log(`[Stock] ${symbol}: $${currentPrice.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`, 'info', false, 'stock:quote');

        res.json(quote);

    } catch (error) {
        logger.log(`[Stock] Fetch error for ${symbol}: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
