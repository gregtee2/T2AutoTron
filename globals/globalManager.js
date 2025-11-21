let globals = {
    apiKey: null,
    bridgeIp: null
};

// Function to reset globals
function resetGlobals() {
    globals.apiKey = null;
    globals.bridgeIp = null;

    // Clear stored globals in local storage
    localStorage.removeItem('apiKey');
    localStorage.removeItem('bridgeIp');

    console.log("Globals have been reset.");

    // Update the UI to reflect that globals have been reset
    displayGlobals();
}

// Function to initialize and fetch globals
function initializeGlobals() {
    loadGlobals(); // Load any saved globals first

    if (globals.apiKey && globals.bridgeIp) {
        alert("Globals already fetched: API Key and Bridge IP are available.");
        displayGlobals(); // Show the globals on the UI
        return;
    }

    const userIp = prompt("Enter the Hue Bridge IP Address (if known), or press Cancel to search automatically:");

    if (userIp) {
        globals.bridgeIp = userIp;
        alert("IP Address manually set. Now press the Hue Bridge button to fetch the API key.");
        fetchApiKeyFromBridge(); // Proceed to fetch API key using the manual IP
    } else {
        alert("Searching for Hue Bridge...");
        discoverHueBridge((ip) => {
            if (ip) {
                globals.bridgeIp = ip;
                alert(`Hue Bridge found at IP: ${ip}. Now press the Hue Bridge button to fetch the API key.`);
                fetchApiKeyFromBridge(); // Proceed to fetch API key using the discovered IP
            } else {
                alert("Could not find Hue Bridge. Please enter IP manually.");
            }
        });
    }
}

function fetchApiKeyFromBridge() {
    const bridgeIp = globals.bridgeIp;
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
                globals.apiKey = data[0].success.username;
                saveGlobals();
                displayGlobals();
                alert("API Key retrieved and stored successfully!");
            } else {
                alert('Failed to obtain API key. Ensure you press the Hue Bridge button first.');
            }
        })
        .catch(error => {
            console.error('Error obtaining API key:', error);
            alert('Error obtaining API key. Check the console for details.');
        });
    } else {
        alert('Bridge IP is not set. Please enter it first.');
    }
}

// Function to display the stored globals on the UI
function displayGlobals() {
    const ipElement = document.getElementById("bridgeIP");
    const apiKeyElement = document.getElementById("apiKey");

    if (globals.apiKey && globals.bridgeIp) {
        ipElement.textContent = `Bridge IP: ${globals.bridgeIp}`;
        apiKeyElement.textContent = `API Key: ${globals.apiKey}`;
    } else {
        ipElement.textContent = "Bridge IP: Not Set";
        apiKeyElement.textContent = "API Key: Not Set";
    }
}

// Function to save the globals
function saveGlobals() {
    localStorage.setItem('apiKey', globals.apiKey);
    localStorage.setItem('bridgeIp', globals.bridgeIp);
}

// Function to load globals from storage
function loadGlobals() {
    globals.apiKey = localStorage.getItem('apiKey');
    globals.bridgeIp = localStorage.getItem('bridgeIp');
    displayGlobals(); // Display the loaded globals
}

// Ensure globals are loaded and displayed when the page loads
window.addEventListener("load", loadGlobals);
