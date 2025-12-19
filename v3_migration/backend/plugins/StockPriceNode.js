(function() {
    'use strict';

    // Wait for dependencies
    if (!window.Rete || !window.React) {
        setTimeout(arguments.callee, 100);
        return;
    }

    const { ClassicPreset } = window.Rete;
    const React = window.React;
    const { useState, useEffect, useRef } = React;
    const el = React.createElement;

    // Get sockets
    const sockets = window.sockets || {};
    const numberSocket = sockets.number || new ClassicPreset.Socket('number');
    const boolSocket = sockets.boolean || new ClassicPreset.Socket('boolean');

    // -------------------------------------------------------------------------
    // NODE CLASS
    // -------------------------------------------------------------------------
    class StockPriceNode extends ClassicPreset.Node {
        constructor(changeCallback) {
            super("Stock Price");
            this.changeCallback = changeCallback;

            this.properties = {
                symbol: 'SPY',           // Default to S&P 500 ETF
                refreshInterval: 60,      // Seconds between refreshes
                lastPrice: null,
                priceChange: null,
                changePercent: null,
                isUp: false,
                lastUpdate: null,
                status: 'Idle',
                error: null
            };

            // Outputs
            this.addOutput('price', new ClassicPreset.Output(numberSocket, 'Price'));
            this.addOutput('change', new ClassicPreset.Output(numberSocket, 'Change ($)'));
            this.addOutput('changePercent', new ClassicPreset.Output(numberSocket, 'Change (%)'));
            this.addOutput('isUp', new ClassicPreset.Output(boolSocket, 'Is Up'));

            this._fetchTimer = null;
            this._lastFetch = 0;
        }

        async fetchQuote() {
            const symbol = this.properties.symbol.toUpperCase().trim();
            if (!symbol) {
                this.properties.status = 'No symbol';
                this.properties.error = 'Enter a stock symbol';
                if (this.changeCallback) this.changeCallback();
                return;
            }

            this.properties.status = 'Fetching...';
            if (this.changeCallback) this.changeCallback();

            try {
                // Yahoo Finance v8 API (unofficial but widely used)
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                
                if (data.chart.error) {
                    throw new Error(data.chart.error.description || 'Unknown error');
                }

                const result = data.chart.result?.[0];
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
                this.properties.lastUpdate = new Date().toLocaleTimeString();
                this.properties.status = 'OK';
                this.properties.error = null;

                this._lastFetch = Date.now();

            } catch (error) {
                console.error('[StockPriceNode] Fetch error:', error);
                this.properties.status = 'Error';
                this.properties.error = error.message;
            }

            if (this.changeCallback) this.changeCallback();
        }

        startAutoRefresh() {
            this.stopAutoRefresh();
            
            // Initial fetch
            this.fetchQuote();
            
            // Set up interval
            const intervalMs = (this.properties.refreshInterval || 60) * 1000;
            this._fetchTimer = setInterval(() => {
                this.fetchQuote();
            }, intervalMs);
        }

        stopAutoRefresh() {
            if (this._fetchTimer) {
                clearInterval(this._fetchTimer);
                this._fetchTimer = null;
            }
        }

        data(inputs) {
            // Start auto-refresh on first data() call if not already running
            if (!this._fetchTimer && typeof window !== 'undefined') {
                this.startAutoRefresh();
            }

            return {
                price: this.properties.lastPrice,
                change: this.properties.priceChange,
                changePercent: this.properties.changePercent,
                isUp: this.properties.isUp
            };
        }

        restore(state) {
            if (state.properties) {
                this.properties.symbol = state.properties.symbol || 'SPY';
                this.properties.refreshInterval = state.properties.refreshInterval || 60;
            }
            // Clear stale data on restore
            this.properties.lastPrice = null;
            this.properties.priceChange = null;
            this.properties.changePercent = null;
            this.properties.status = 'Idle';
        }

        serialize() {
            return {
                symbol: this.properties.symbol,
                refreshInterval: this.properties.refreshInterval
            };
        }

        destroy() {
            this.stopAutoRefresh();
        }

        toJSON() {
            return { id: this.id, label: this.label, properties: this.serialize() };
        }
    }

    // -------------------------------------------------------------------------
    // COMPONENT
    // -------------------------------------------------------------------------
    function StockPriceNodeComponent({ data, emit }) {
        const [symbol, setSymbol] = useState(data.properties.symbol || 'SPY');
        const [refreshInterval, setRefreshInterval] = useState(data.properties.refreshInterval || 60);
        const [status, setStatus] = useState(data.properties.status || 'Idle');
        const [lastPrice, setLastPrice] = useState(data.properties.lastPrice);
        const [priceChange, setPriceChange] = useState(data.properties.priceChange);
        const [changePercent, setChangePercent] = useState(data.properties.changePercent);
        const [isUp, setIsUp] = useState(data.properties.isUp);
        const [lastUpdate, setLastUpdate] = useState(data.properties.lastUpdate);
        const [error, setError] = useState(data.properties.error);

        const { RefComponent } = window.ReteReact || {};
        const { NodeHeader, HelpIcon } = window.T2Controls || {};

        // Clean up on unmount
        useEffect(() => {
            return () => {
                if (data.destroy) data.destroy();
            };
        }, [data]);

        // Sync with node state
        useEffect(() => {
            const originalCallback = data.changeCallback;
            data.changeCallback = () => {
                setStatus(data.properties.status);
                setLastPrice(data.properties.lastPrice);
                setPriceChange(data.properties.priceChange);
                setChangePercent(data.properties.changePercent);
                setIsUp(data.properties.isUp);
                setLastUpdate(data.properties.lastUpdate);
                setError(data.properties.error);
                if (originalCallback) originalCallback();
            };
            return () => { data.changeCallback = originalCallback; };
        }, [data]);

        const handleSymbolChange = (e) => {
            const val = e.target.value.toUpperCase();
            setSymbol(val);
            data.properties.symbol = val;
        };

        const handleSymbolBlur = () => {
            // Restart auto-refresh with new symbol
            data.startAutoRefresh();
        };

        const handleIntervalChange = (e) => {
            const val = parseInt(e.target.value) || 60;
            setRefreshInterval(val);
            data.properties.refreshInterval = val;
            data.startAutoRefresh();
        };

        const handleManualRefresh = (e) => {
            e.stopPropagation();
            data.fetchQuote();
        };

        const outputs = Object.entries(data.outputs);

        // Formatting helpers
        const formatPrice = (p) => p !== null ? `$${p.toFixed(2)}` : '--';
        const formatChange = (c) => {
            if (c === null) return '--';
            const sign = c >= 0 ? '+' : '';
            return `${sign}$${c.toFixed(2)}`;
        };
        const formatPercent = (p) => {
            if (p === null) return '--';
            const sign = p >= 0 ? '+' : '';
            return `${sign}${p.toFixed(2)}%`;
        };

        // Status color
        const statusColor = status === 'OK' ? '#4caf50' : 
                           status === 'Error' ? '#f44336' : 
                           status === 'Fetching...' ? '#ff9800' : '#888';

        const priceColor = isUp ? '#4caf50' : '#f44336';

        const tooltips = {
            node: "Fetches real-time stock quotes from Yahoo Finance.\n\nConnect 'Change (%)' to Timeline Color node's input for market-based lighting!",
            symbol: "Stock ticker symbol (e.g., SPY, AAPL, MSFT, ^GSPC for S&P 500, ^DJI for Dow)",
            interval: "Seconds between automatic refreshes (minimum 30 recommended)"
        };

        const inputStyle = {
            background: '#1a1a2e',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            padding: '6px 8px',
            fontSize: '12px',
            width: '100%'
        };

        const rowStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px'
        };

        return el('div', { 
            className: 'stock-price-node',
            style: { 
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '8px',
                padding: '12px',
                minWidth: '220px',
                border: `2px solid ${isUp ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'}`,
                boxShadow: `0 0 10px ${isUp ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}`
            }
        }, [
            // Header
            NodeHeader 
                ? el(NodeHeader, { 
                    key: 'header',
                    icon: '📈', 
                    title: 'Stock Price', 
                    tooltip: tooltips.node,
                    statusDot: true,
                    statusColor: statusColor
                  })
                : el('div', { key: 'header', style: { display: 'flex', alignItems: 'center', marginBottom: '10px' } }, [
                    el('span', { key: 'icon', style: { marginRight: '8px', fontSize: '16px' } }, '📈'),
                    el('span', { key: 'title', style: { fontWeight: 'bold', color: '#fff' } }, 'Stock Price'),
                    el('div', { 
                        key: 'status',
                        style: { 
                            width: '8px', height: '8px', borderRadius: '50%', 
                            backgroundColor: statusColor, marginLeft: 'auto',
                            boxShadow: `0 0 4px ${statusColor}`
                        }
                    })
                  ]),

            // Symbol input
            el('div', { key: 'symbol-row', style: { marginBottom: '8px' } }, [
                el('div', { key: 'label', style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [
                    el('span', { key: 'text', style: { color: '#aaa', fontSize: '11px' } }, 'SYMBOL'),
                    HelpIcon && el(HelpIcon, { key: 'help', text: tooltips.symbol, size: 10 })
                ]),
                el('input', {
                    key: 'input',
                    type: 'text',
                    value: symbol,
                    onChange: handleSymbolChange,
                    onBlur: handleSymbolBlur,
                    onPointerDown: (e) => e.stopPropagation(),
                    placeholder: 'SPY, AAPL, ^GSPC...',
                    style: { ...inputStyle, fontFamily: 'monospace', fontWeight: 'bold' }
                })
            ]),

            // Refresh interval
            el('div', { key: 'interval-row', style: { marginBottom: '12px' } }, [
                el('div', { key: 'label', style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [
                    el('span', { key: 'text', style: { color: '#aaa', fontSize: '11px' } }, 'REFRESH (sec)'),
                    HelpIcon && el(HelpIcon, { key: 'help', text: tooltips.interval, size: 10 })
                ]),
                el('input', {
                    key: 'input',
                    type: 'number',
                    value: refreshInterval,
                    onChange: handleIntervalChange,
                    onPointerDown: (e) => e.stopPropagation(),
                    min: 10,
                    style: { ...inputStyle, width: '80px' }
                })
            ]),

            // Price display
            el('div', { 
                key: 'price-display',
                style: { 
                    background: 'rgba(0,0,0,0.3)', 
                    borderRadius: '6px', 
                    padding: '10px',
                    marginBottom: '10px'
                }
            }, [
                el('div', { key: 'ticker', style: { color: '#888', fontSize: '11px', marginBottom: '4px' } }, symbol),
                el('div', { key: 'price', style: { fontSize: '20px', fontWeight: 'bold', color: '#fff' } }, formatPrice(lastPrice)),
                el('div', { key: 'change', style: { display: 'flex', gap: '10px', marginTop: '4px' } }, [
                    el('span', { key: 'dollars', style: { color: priceColor, fontWeight: 'bold' } }, formatChange(priceChange)),
                    el('span', { key: 'percent', style: { color: priceColor, fontWeight: 'bold' } }, formatPercent(changePercent))
                ]),
                lastUpdate && el('div', { key: 'time', style: { color: '#666', fontSize: '10px', marginTop: '6px' } }, `Updated: ${lastUpdate}`)
            ]),

            // Error display
            error && el('div', { 
                key: 'error',
                style: { 
                    background: 'rgba(244, 67, 54, 0.2)', 
                    color: '#f44336', 
                    padding: '6px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    marginBottom: '10px'
                }
            }, error),

            // Manual refresh button
            el('button', {
                key: 'refresh-btn',
                onClick: handleManualRefresh,
                onPointerDown: (e) => e.stopPropagation(),
                style: {
                    width: '100%',
                    background: '#2a2a4a',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '8px',
                    cursor: 'pointer',
                    marginBottom: '10px',
                    fontSize: '12px'
                }
            }, '🔄 Refresh Now'),

            // Outputs
            el('div', { key: 'outputs', style: { marginTop: '8px' } },
                outputs.map(([key, output]) =>
                    el('div', { 
                        key, 
                        style: { 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'flex-end',
                            marginBottom: '4px'
                        }
                    }, [
                        el('span', { key: 'label', style: { color: '#aaa', fontSize: '11px', marginRight: '8px' } }, output.label),
                        RefComponent && el(RefComponent, {
                            key: 'socket',
                            init: ref => emit({ type: "render", data: { type: "socket", element: ref, payload: output.socket, nodeId: data.id, side: "output", key } }),
                            unmount: ref => emit({ type: "unmount", data: { element: ref } })
                        })
                    ])
                )
            )
        ]);
    }

    // -------------------------------------------------------------------------
    // REGISTER
    // -------------------------------------------------------------------------
    if (window.nodeRegistry) {
        window.nodeRegistry.register('StockPriceNode', {
            label: 'Stock Price',
            category: 'Inputs',
            nodeClass: StockPriceNode,
            component: StockPriceNodeComponent,
            factory: (cb) => new StockPriceNode(cb)
        });
        console.log('[StockPriceNode] Registered');
    }

})();
