## Quick Setup: Add `/sandbox` Route

To test the refactored index.html without affecting your main application, add this route to your `src/server.js`:

```javascript
// Add this RIGHT AFTER the lines:
// app.use(express.static(path.join(__dirname, 'frontend')));
// app.use('/custom_nodes', express.static(path.join(__dirname, 'frontend/custom_nodes')));

// Sandbox route for testing refactored index.html
app.get('/sandbox', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/Index.html_Proposal/Index.html'));
});
```

**Location**: Around line 103 in `src/server.js`

**After adding, restart your server and navigate to:**
`http://localhost:3000/sandbox`

You'll see an orange banner at the top saying "🧪 REFACTORED SANDBOX VERSION" to confirm you're testing the new version.

The main app at `http://localhost:3000/` remains completely untouched!
