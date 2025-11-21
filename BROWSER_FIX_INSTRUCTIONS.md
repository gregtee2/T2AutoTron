# Browser Compatibility Fix - Manual Instructions

## Problem
The index.html page crashes in browser mode because `window.api.send()` is Electron-only and causes errors when accessed from a regular browser.

**Error:** `Uncaught TypeError: Cannot read properties of undefined (reading 'send')` at main.js:439

## Solution
I've created a browser compatibility shim file that you need to manually add to your HTML files.

## Files Changed

### ✅ Created: `src/frontend/js/browser-compat.js`
This file contains no-op implementations of `window.api` for when running in a browser.

### ⏸️ Needs Manual Edit: `src/frontend/index.html`

**Add this line at line 310** (right before `<script src="js/graph-utils.js"></script>`):
```html
<script src="js/browser-compat.js"></script>
```

**Full context** - your lines 309-312 should look like this after the edit:
```html
<!-- Main Scripts -->
<script src="js/browser-compat.js"></script>
<script src="js/graph-utils.js"></script>
<script src="js/main.js"></script>
```

### ⏸️ Needs Manual Edit:  `src/frontend/index-clean.html` (if you want to use it)

**Add the same line** before the main.js script tag (around line 367):
```html
<!-- Main Scripts -->
<script src="js/browser-compat.js"></script>
<script src="js/graph-utils.js"></script>
<script src="js/main.js"></script>
```

## Testing
1. Make the edits above
2. Refresh your browser on `http://localhost:3000/index.html`
3. The error should be gone now!

## Why This Works
The `browser-compat.js` file checks if `window.api` exists. If not (browser mode), it creates placeholder functions so the code doesn't crash.

**IMPORTANT:** I tried to make these edits automatically but the file editing tool is malfunctioning. Please make these small manual edits and the browser compatibility issue will be fixed!
