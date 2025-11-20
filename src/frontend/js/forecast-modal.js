// forecast-modal.js - Standalone forecast detail modal
// This script adds a clickable modal to forecast items

(function () {
    'use strict';

    // Store forecast data
    let forecastData = [];

    // Helper function to get weather icon SVG (reused from socket-handler.js)
    function getWeatherIconSVG(condition) {
        const lowerCondition = (condition || '').toLowerCase();

        if (lowerCondition.includes('clear') || lowerCondition.includes('sun')) {
            return '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
        }

        if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle') || lowerCondition.includes('shower')) {
            return '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path><line x1="8" y1="19" x2="8" y2="21"></line><line x1="8" y1="13" x2="8" y2="15"></line><line x1="16" y1="19" x2="16" y2="21"></line><line x1="16" y1="13" x2="16" y2="15"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="12" y1="15" x2="12" y2="17"></line></svg>';
        }

        if (lowerCondition.includes('partly') || lowerCondition.includes('partial') || lowerCondition.includes('few')) {
            return '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2v2"></path><path d="M3 13h2"></path><path d="M20 13h2"></path><path d="M5.6 5.6l1.4 1.4"></path><path d="M18.4 5.6l-1.4 1.4"></path><path d="M13 22a5 5 0 0 0 5-5H8a5 5 0 0 0 5 5z" stroke="#B0C4DE"></path><path d="M13 17a5 5 0 0 0 0-10 5.5 5.5 0 0 0-5.5 5.5" stroke="#B0C4DE"></path></svg>';
        }

        if (lowerCondition.includes('cloud') || lowerCondition.includes('overcast')) {
            return '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#B0C4DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';
        }

        return '<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#B0C4DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>';
    }

    // Create and inject modal HTML
    function createModal() {
        const modalHTML = `
            <div id="forecast-detail-modal" class="forecast-modal-overlay" style="display: none;">
                <div class="forecast-modal-content">
                    <div class="forecast-modal-header">
                        <h3 id="forecast-detail-date"></h3>
                        <button class="forecast-modal-close">&times;</button>
                    </div>
                    <div class="forecast-modal-body">
                        <div class="forecast-detail-main">
                            <div class="forecast-detail-icon" id="forecast-detail-icon"></div>
                            <div class="forecast-detail-temps">
                                <div class="forecast-detail-high">
                                    <span class="temp-label">High</span>
                                    <span class="temp-value" id="forecast-detail-high"></span>
                                </div>
                                <div class="forecast-detail-low">
                                    <span class="temp-label">Low</span>
                                    <span class="temp-value" id="forecast-detail-low"></span>
                                </div>
                            </div>
                        </div>
                        <div class="forecast-detail-info">
                            <div class="forecast-info-item">
                                <span class="info-label">Condition:</span>
                                <span class="info-value" id="forecast-detail-condition"></span>
                            </div>
                            <div class="forecast-info-item">
                                <span class="info-label">Precipitation:</span>
                                <span class="info-value" id="forecast-detail-precip"></span>
                            </div>
                            <div class="forecast-info-item">
                                <span class="info-label">Description:</span>
                                <span class="info-value" id="forecast-detail-description"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const styleHTML = `
            <style id="forecast-modal-styles">
                .forecast-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .forecast-modal-content {
                    background: #1e1e1e;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    animation: slideUp 0.3s ease;
                }

                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .forecast-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid #333;
                }

                .forecast-modal-header h3 {
                    margin: 0;
                    color: #fff;
                    font-size: 1.5em;
                }

                .forecast-modal-close {
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 2em;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.2s;
                }

                .forecast-modal-close:hover {
                    color: #fff;
                }

                .forecast-modal-body {
                    padding: 20px;
                }

                .forecast-detail-main {
                    display: flex;
                    align-items: center;
                    gap: 30px;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid #333;
                }

                .forecast-detail-icon {
                    font-size: 4em;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .forecast-detail-temps {
                    display: flex;
                    gap: 30px;
                }

                .forecast-detail-high,
                .forecast-detail-low {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .temp-label {
                    color: #888;
                    font-size: 0.9em;
                    margin-bottom: 5px;
                }

                .temp-value {
                    color: #fff;
                    font-size: 2.5em;
                    font-weight: bold;
                }

                .forecast-detail-high .temp-value {
                    color: #ff6b6b;
                }

                .forecast-detail-low .temp-value {
                    color: #4facfe;
                }

                .forecast-detail-info {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }

                .forecast-info-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px;
                    background: #252525;
                    border-radius: 8px;
                }

                .info-label {
                    color: #888;
                    font-weight: 500;
                }

                .info-value {
                    color: #fff;
                    font-weight: 600;
                }

                /* Make forecast items clickable */
                .forecast-item {
                    cursor: pointer;
                    transition: background-color 0.2s, transform 0.1s;
                }

                .forecast-item:hover {
                    background-color: rgba(255, 255, 255, 0.05);
                    transform: translateX(2px);
                }
            </style>
        `;

        // Inject modal and styles
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.head.insertAdjacentHTML('beforeend', styleHTML);

        // Setup close handlers
        const modal = document.getElementById('forecast-detail-modal');
        const closeBtn = modal.querySelector('.forecast-modal-close');

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Show modal with forecast details
    function showForecastDetail(dayData) {
        const modal = document.getElementById('forecast-detail-modal');
        const dateStr = new Date(dayData.date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        document.getElementById('forecast-detail-date').textContent = dateStr;
        document.getElementById('forecast-detail-icon').innerHTML = getWeatherIconSVG(dayData.condition);
        document.getElementById('forecast-detail-high').textContent = `${Math.round(dayData.high)}°`;
        document.getElementById('forecast-detail-low').textContent = `${Math.round(dayData.low)}°`;
        document.getElementById('forecast-detail-condition').textContent = dayData.condition || 'Unknown';
        document.getElementById('forecast-detail-precip').textContent = `${dayData.precip || 0}%`;
        document.getElementById('forecast-detail-description').textContent = dayData.description || 'No description available';

        modal.style.display = 'flex';
    }

    // Intercept forecast updates and add click handlers
    function setupForecastClickHandlers() {
        // Wait for forecast list to exist
        const checkInterval = setInterval(() => {
            const forecastList = document.getElementById('forecast-list');
            if (forecastList) {
                clearInterval(checkInterval);

                // Use MutationObserver to detect when forecast items are added
                const observer = new MutationObserver(() => {
                    const items = forecastList.querySelectorAll('.forecast-item');
                    items.forEach((item, index) => {
                        if (!item.dataset.clickHandlerAdded) {
                            item.dataset.clickHandlerAdded = 'true';
                            item.addEventListener('click', () => {
                                if (forecastData[index]) {
                                    showForecastDetail(forecastData[index]);
                                }
                            });
                        }
                    });
                });

                observer.observe(forecastList, { childList: true, subtree: true });
            }
        }, 100);
    }

    // Intercept Socket.IO forecast updates to store data
    function interceptForecastData() {
        // Wait for socket to be available
        const checkSocket = setInterval(() => {
            if (window.setupSocket) {
                clearInterval(checkSocket);

                // Override the original setupSocket to intercept forecast data
                const originalSetupSocket = window.setupSocket;
                window.setupSocket = function (...args) {
                    const socket = originalSetupSocket.apply(this, args);

                    // Intercept forecast-update event
                    const originalOn = socket.on.bind(socket);
                    socket.on = function (event, handler) {
                        if (event === 'forecast-update') {
                            return originalOn(event, (forecast) => {
                                forecastData = forecast;
                                handler(forecast);
                            });
                        }
                        return originalOn(event, handler);
                    };

                    return socket;
                };
            }
        }, 100);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createModal();
            setupForecastClickHandlers();
            interceptForecastData();
        });
    } else {
        createModal();
        setupForecastClickHandlers();
        interceptForecastData();
    }

    console.log('Forecast modal script loaded');
})();
