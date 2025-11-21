## Testing the Refactored Index.html

This folder contains a **sandbox version** of the refactored index.html. It's safe to test without affecting the main application.

### What's Different?

**Architecture Changes:**
- ✅ Cleaner HTML structure with fewer inline scripts
- ✅ CDN libraries loaded as classic `<script>` tags (no module issues)
- ✅ New modular components (auth.js, modals.js) using ES6 modules
- ✅ Custom nodes loaded via manifest instead of 70+ script tags
- ✅ Visual indicator (orange banner) shows you're in sandbox mode

**What Stays the Same:**
- ✅ All existing functionality (LiteGraph, Socket.IO, device control)
- ✅ All button handlers from main.js
- ✅ All custom nodes
- ✅ Zero risk to your production code

---

## How to Test

### Option 1: Add Route to Server (Recommended)

Add this route to your Express server (likely in `src/server.js` or similar):

```javascript
// Sandbox route for testing refactored index.html
app.get('/sandbox', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/Index.html_Proposal/Index.html'));
});
```

Then navigate to: `http://localhost:3000/sandbox`

### Option 2: Direct File Access (Electron Only)

In Electron, you can load the file directly:
```javascript
win.loadFile('src/frontend/Index.html_Proposal/Index.html');
```

### Option 3: Temporarily Replace Main Index

⚠️ **Backup first!**
```bash
# Backup current index.html
cp src/frontend/index.html src/frontend/index.html.backup

# Test the refactored version
cp src/frontend/Index.html_Proposal/Index.html src/frontend/index.html

# Restore when done
cp src/frontend/index.html.backup src/frontend/index.html
```

---

## What to Look For

✅ **Should Work:**
- Socket.IO connection
- All graph load/save buttons
- Device control
- Weather display
- Custom nodes loading
- Theme toggle
- All existing functionality

⚠️ **Potential Issues:**
- Custom node loading timing (check console for errors)
- Module path resolution in different environments
- Any features that depend on script load order

---

## Files in This Sandbox

- **Index.html** - Main file, hybrid approach (classic + ES6 modules)
- **auth.js** - Authentication logic (ES6 module)
- **modals.js** - Modal handlers (ES6 module)
- **node-loader.js** - Dynamic custom node loading (ES6 module)
- **nodes-manifest.json** - List of all custom nodes to load
- **app.js** - (Not used in current hybrid approach)
- **README.md** - This file

---

## Next Steps

Once tested and working:

1. **Keep What Works**: If sandbox works well, we can plan gradual migration
2. **Document Issues**: Note any problems you encounter
3. **Decide on Approach**: 
   - Full conversion (more work, cleaner architecture)
   - Hybrid approach (less risk, still cleaner)
   - Stay with current (if sandbox has issues)

---

## Reverting Changes

To go back to the original setup, just keep using the main `/` route. The sandbox doesn't affect your production code at all.
