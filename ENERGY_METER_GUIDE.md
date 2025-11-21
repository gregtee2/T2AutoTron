# Energy Meter - Quick Integration

## ✅ Component Created

`js/energy-display.js` - Tracks power from Kasa devices and shows total in status bar

## Integration Steps

### 1. Add Script to index.html

Find the component scripts section (around line 275) and add:

```html
<!-- NEW COMPONENT SCRIPTS (as instructed) -->
<script src="js/browser-compat.js"></script>
<script src="js/auth.js"></script>
<script src="js/modals.js"></script>
<script src="js/custom-node-loader.js"></script>
<script src="js/energy-display.js"></script>  ⬅️ ADD THIS LINE
```

### 2. That's It!

The component auto-creates its display element in the status bar. No HTML changes needed!

## What You'll See

Status bar will show:
```
[Server: Connected] [Nodes: 42] [Devices: 8] [⚡ 234.5W (3 devices)] [●]
```

- **Green** when power < 1000W
- **Red** when power ≥ 1000W  
- **Gray** when no devices consuming power

## Features

- ✅ Auto-updates in real-time
- ✅ Tracks per-device power
- ✅ Shows device count
- ✅ Color-coded by usage level
- ✅ Works with existing Kasa power data

## Testing

1. Add the script tag above
2. Refresh browser
3. Check console logs: `✅ Energy display initialized`
4. Turn on a Kasa device with power monitoring
5. Watch the status bar update!

## Debug Console

Open console and type:
```javascript
window.getEnergyStats()
```

This shows detailed power breakdown per device.
