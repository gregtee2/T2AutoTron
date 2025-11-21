document.getElementById('fetchGlobalsButton').addEventListener('click', () => {
    const storedBridgeIp = localStorage.getItem('hueBridgeIp');
    const storedApiKey = localStorage.getItem('hueApiKey');

    if (storedBridgeIp && storedApiKey) {
        alert('Globals already fetched: Using stored IP and API key.');
        displayStoredGlobals(storedBridgeIp, storedApiKey);
    } else {
        document.getElementById('manualIpEntry').style.display = 'block';
    }
});

document.getElementById('submitIpButton').addEventListener('click', () => {
    const bridgeIp = document.getElementById('bridgeIpField').value.trim();
    if (bridgeIp) {
        fetch(`http://${bridgeIp}/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ devicetype: 'my_hue_app#local' }),
        })
        .then(response => response.json())
        .then(data => {
            if (data[0]?.success?.username) {
                const apiKey = data[0].success.username;

                // Store the Bridge IP and API Key
                localStorage.setItem('hueBridgeIp', bridgeIp);
                localStorage.setItem('hueApiKey', apiKey);

                // Update the UI
                displayStoredGlobals(bridgeIp, apiKey);

                // Provide feedback to the user
                document.getElementById('apiKeyButton').innerText = 'API Key Retrieved!';
                document.getElementById('apiKeyButton').disabled = true;
                alert(`API Key obtained: ${apiKey}`);

                // Hide manual IP entry UI
                document.getElementById('manualIpEntry').style.display = 'none';
                document.getElementById('apiKeyRetrieval').style.display = 'none';
            } else {
                alert('Failed to obtain API key. Ensure you press the Hue Bridge button first.');
            }
        })
        .catch(error => {
            console.error('Error obtaining API key:', error);
            alert('Error obtaining API key. Check the console for details.');
        });
    } else {
        alert('Please enter a valid IP address.');
    }
});

document.getElementById('resetGlobalsBtn').addEventListener('click', () => {
    localStorage.removeItem('hueBridgeIp');
    localStorage.removeItem('hueApiKey');
    alert('Globals have been reset. Please fetch again.');
});

function displayStoredGlobals(bridgeIp, apiKey) {
    document.getElementById('bridgeIP').textContent = `Bridge IP: ${bridgeIp}`;
    document.getElementById('apiKey').textContent = `API Key: ${apiKey}`;
}
