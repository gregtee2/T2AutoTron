function discoverHueBridge(callback) {
    const upnpRequest = new XMLHttpRequest();
    upnpRequest.open("M-SEARCH", "ssdp:discover", true);
    upnpRequest.setRequestHeader("ST", "urn:schemas-upnp-org:device:basic:1");
    upnpRequest.setRequestHeader("MAN", "ssdp:discover");
    upnpRequest.setRequestHeader("MX", "3"); // Wait 3 seconds for a response

    upnpRequest.onreadystatechange = function () {
        if (upnpRequest.readyState === 4 && upnpRequest.status === 200) {
            const responseText = upnpRequest.responseText;
            const ipMatch = responseText.match(/LOCATION:.*:\/\/([0-9.]+)/);
            if (ipMatch) {
                const ipAddress = ipMatch[1];
                callback(null, ipAddress);
            } else {
                callback(new Error("Hue Bridge not found"));
            }
        }
    };

    upnpRequest.onerror = function () {
        callback(new Error("Network error during discovery"));
    };

    upnpRequest.send();
}
