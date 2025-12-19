/**
 * StockPriceNode.js - Backend implementation
 * 
 * Fetches stock quotes from Yahoo Finance API.
 * Pure Node.js implementation - no React/browser dependencies.
 */

const registry = require('../BackendNodeRegistry');

/**
 * StockPriceNode - Fetches real-time stock quotes
 * 
 * Inputs: none
 * Outputs: price, change, changePercent, isUp
 * 
 * Properties:
 * - symbol: Stock ticker (e.g., SPY, AAPL, ^GSPC)
 * - refreshInterval: Seconds between fetches
 */
class StockPriceNode {
  constructor() {
    this.id = null;
    this.label = 'Stock Price';
    this.properties = {
      symbol: 'SPY',
      refreshInterval: 60,
      lastPrice: null,
      priceChange: null,
      changePercent: null,
      isUp: false,
      lastUpdate: null,
      error: null
    };
    this._lastFetchTime = 0;
    this._fetchPromise = null;
  }

  restore(data) {
    if (data.properties) {
      this.properties.symbol = data.properties.symbol || 'SPY';
      this.properties.refreshInterval = data.properties.refreshInterval || 60;
    }
    // Clear stale data
    this.properties.lastPrice = null;
    this.properties.priceChange = null;
    this.properties.changePercent = null;
    this.properties.isUp = false;
    this._lastFetchTime = 0;
  }

  async fetchQuote() {
    const symbol = (this.properties.symbol || 'SPY').toUpperCase().trim();
    if (!symbol) {
      this.properties.error = 'No symbol';
      return;
    }

    try {
      // Use dynamic import for fetch (Node.js 18+)
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.chart?.error) {
        throw new Error(data.chart.error.description || 'API error');
      }

      const result = data.chart?.result?.[0];
      if (!result) {
        throw new Error('No data returned');
      }

      const meta = result.meta;
      const currentPrice = meta.regularMarketPrice;
      const previousClose = meta.previousClose || meta.chartPreviousClose;
      
      if (currentPrice === undefined || previousClose === undefined) {
        throw new Error('Price data unavailable');
      }

      const priceChange = currentPrice - previousClose;
      const changePercent = (priceChange / previousClose) * 100;

      this.properties.lastPrice = currentPrice;
      this.properties.priceChange = priceChange;
      this.properties.changePercent = changePercent;
      this.properties.isUp = priceChange >= 0;
      this.properties.lastUpdate = new Date().toISOString();
      this.properties.error = null;

      console.log(`[StockPriceNode] ${symbol}: $${currentPrice.toFixed(2)} (${priceChange >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);

    } catch (error) {
      console.error(`[StockPriceNode] Error fetching ${symbol}:`, error.message);
      this.properties.error = error.message;
    }

    this._lastFetchTime = Date.now();
  }

  async data(inputs) {
    const now = Date.now();
    const intervalMs = (this.properties.refreshInterval || 60) * 1000;
    
    // Check if we need to fetch
    if (now - this._lastFetchTime >= intervalMs) {
      // Avoid concurrent fetches
      if (!this._fetchPromise) {
        this._fetchPromise = this.fetchQuote().finally(() => {
          this._fetchPromise = null;
        });
      }
      await this._fetchPromise;
    }

    return {
      price: this.properties.lastPrice,
      change: this.properties.priceChange,
      changePercent: this.properties.changePercent,
      isUp: this.properties.isUp
    };
  }

  destroy() {
    // No persistent resources to clean up
  }
}

// Register
registry.register('StockPriceNode', StockPriceNode);

module.exports = { StockPriceNode };
