// Modal Management Module  
// Handles all modal interactions and event handlers
console.log('modals.js loaded');

(function () {
    'use strict';

    function initModals() {
        console.log('Initializing modals...');

        // Hue Bridge IP Input Modal
        const ipBackdrop = document.getElementById('ip-input-backdrop');
        const ipModal = document.getElementById('ip-input-modal');
        const ipInput = document.getElementById('hue-ip-input');
        const submitIpBtn = document.getElementById('submit-ip-btn');
        const cancelIpBtn = document.getElementById('cancel-ip-btn');
        const hueBridgeIpInput = document.getElementById('hue-bridge-ip');

        if (submitIpBtn && cancelIpBtn && ipModal && ipBackdrop) {
            // Remove inline onclick handlers by cloning buttons
            const submitClone = submitIpBtn.cloneNode(true);
            submitIpBtn.parentNode.replaceChild(submitClone, submitIpBtn);
            const cancelClone = cancelIpBtn.cloneNode(true);
            cancelIpBtn.parentNode.replaceChild(cancelClone, cancelIpBtn);

            // Add clean event handlers
            submitClone.addEventListener('click', function () {
                const ip = ipInput.value.trim();
                if (ip && ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    if (hueBridgeIpInput) hueBridgeIpInput.value = ip;
                    console.log('Hue Bridge IP set:', ip);
                }
                ipModal.style.display = 'none';
                ipBackdrop.style.display = 'none';
            });

            cancelClone.addEventListener('click', function () {
                ipModal.style.display = 'none';
                ipBackdrop.style.display = 'none';
            });

            console.log('✅ IP input modal initialized');
        }

        // API Config Modal
        const configApiKeysBtn = document.getElementById('configApiKeysBtn');
        const apiConfigModal = document.getElementById('api-config-modal');
        const saveApiBtn = document.getElementById('save-api-btn');
        const cancelApiBtn = document.getElementById('cancel-api-btn');

        if (configApiKeysBtn && apiConfigModal) {
            configApiKeysBtn.addEventListener('click', function () {
                apiConfigModal.style.display = 'block';
            });

            if (cancelApiBtn) {
                cancelApiBtn.addEventListener('click', function () {
                    apiConfigModal.style.display = 'none';
                });
            }

            if (saveApiBtn && window.api && window.api.send) {
                saveApiBtn.addEventListener('click', function () {
                    const keys = {
                        hue: document.getElementById('hue-key')?.value || '',
                        hueBridgeIp: document.getElementById('hue-bridge-ip')?.value || '',
                        telegram: document.getElementById('telegram-key')?.value || '',
                        openweather: document.getElementById('openweather-key')?.value || '',
                        ambientweather: document.getElementById('ambientweather-key')?.value || ''
                    };
                    window.api.send('save-api-keys', keys);
                });
            }

            console.log('✅ API config modal initialized');
        }
    }

    // Make initModals available globally
    window.initModals = initModals;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModals);
    } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
        // DOM already loaded, init immediately
        initModals();
    }
})();
