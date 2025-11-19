// frontend/main.js – 5-DAY FORECAST + ALL OTHER FEATURES (WORKING)
// ================================================================
// ---------------------------------------------------------------
// 1. GLOBAL renderForecast – defined **first** so socket can use it
// ---------------------------------------------------------------
let forecastContent = null; // #forecast-list
let forecastSection = null; // #forecast-section

window.renderForecast = (data) => {
  if (!forecastContent) {
    console.warn('renderForecast called before UI ready');
    return;
  }
  console.log('renderForecast →', data);
  if (!data?.length) {
    forecastContent.innerHTML = '<p style="color:#aaa;padding:10px;">No forecast data</p>';
    return;
  }
  let html = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#eee;">
      <tr style="border-bottom:2px solid #555;">
        <th style="text-align:left;padding:8px;">Day</th>
        <th style="text-align:left;padding:8px;">High/Low</th>
        <th style="text-align:left;padding:8px;">Condition</th>
        <th style="text-align:left;padding:8px;">Precip</th>
      </tr>
  `;
  data.slice(0, 5).forEach(day => {
    const date = new Date(day.date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
    html += `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:8px;">${date}</td>
        <td style="padding:8px;">${Math.round(day.high)}°/${Math.round(day.low)}°</td>
        <td style="padding:8px;">${day.condition || '—'}</td>
        <td style="padding:8px;">${day.precip || 0}%</td>
      </tr>
    `;
  });
  forecastContent.innerHTML = html + '</table>';
};

// ---------------------------------------------------------------
// 2. DOM READY – everything else runs here
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  console.log('UI Loaded');
  window.api.log('info', 'UI Loaded');

  const $ = (id) => document.getElementById(id);
  let socket = null;
  let graph = null;
  let editor = null;

  // -----------------------------------------------------------
  // Helper logger
  // -----------------------------------------------------------
  const log = (level, ...args) => {
    window.api.log(level, args.join(' '));
    console[level === 'error' ? 'error' : 'log'](...args);
  };

  // -----------------------------------------------------------
  // 3. FORECAST UI SETUP
  // -----------------------------------------------------------
  const setupForecastUI = () => {
    const header = document.querySelector('#forecast-section .sub-header');
    forecastContent = $('forecast-list');
    forecastSection = $('forecast-section');

    if (!header || !forecastContent || !forecastSection) {
      console.error('Forecast DOM elements missing – check HTML IDs');
      return false;
    }

    // Header + Refresh button
    header.innerHTML = `5-Day Forecast <button id="refresh-forecast-btn" style="float:right;font-size:11px;padding:2px 6px;margin-left:8px;">Refresh</button>`;
    header.style.cursor = 'pointer';

    // Expand / collapse
    header.onclick = (e) => {
      if (e.target.id === 'refresh-forecast-btn') return;
      const expanded = forecastSection.getAttribute('data-expanded') === 'true';
      forecastSection.setAttribute('data-expanded', !expanded);
      forecastContent.style.display = expanded ? 'none' : 'block';
      if (!expanded) {
        forecastContent.innerHTML = '<p style="color:#666;padding:10px;">Loading forecast...</p>';
        socket?.emit('request-forecast');
      }
    };

    // Refresh button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'refresh-forecast-btn') {
        forecastContent.innerHTML = '<p style="color:#666;padding:10px;">Loading forecast...</p>';
        socket?.emit('request-forecast');
      }
    });

    // Auto-open after a short delay
    setTimeout(() => {
      if (forecastSection.getAttribute('data-expanded') !== 'true') {
        forecastSection.setAttribute('data-expanded', 'true');
        forecastContent.style.display = 'block';
      }
      forecastContent.innerHTML = '<p style="color:#666;padding:10px;">Loading forecast...</p>';
      socket?.emit('request-forecast');
    }, 2500);

    return true;
  };

  // -----------------------------------------------------------
  // 4. SOCKET.IO – connect **after** UI is ready
  // -----------------------------------------------------------
  const initSocket = () => {
    if (typeof io === 'undefined') {
      log('error', 'Socket.IO library not loaded');
      return;
    }

    socket = io('http://localhost:3000', {
      reconnection: true,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      log('info', 'Connected to server');
      updateServerStatus(true);
      fetchDevices();

      // HA token
      const haToken = localStorage.getItem('ha_token');
      if (haToken) {
        socket.emit('set-ha-token', haToken);
      } else {
        const token = prompt('Enter Home Assistant Long-Lived Access Token:');
        if (token) {
          localStorage.setItem('ha_token', token);
          socket.emit('set-ha-token', token);
        }
      }

      // REQUEST FORECAST ON CONNECT
      console.log('Requesting forecast...');
      socket.emit('request-forecast');
    });

    socket.on('disconnect', () => {
      log('warn', 'Disconnected from server');
      updateServerStatus(false);
    });

    socket.on('deviceStateChanged', ({ deviceId, on }) => updateDeviceState(deviceId, { on }));
    socket.on('hueLightStateUpdated', ({ id, state }) => updateHueLightState(id, state));
    socket.on('notification', (msg) => log('info', msg));

    // === 5-DAY FORECAST LISTENER ===
    socket.on('forecast-update', (data) => {
      console.log('5-day forecast received:', data);
      if (window.renderForecast) {
        window.renderForecast(data);
      } else {
        console.error('renderForecast not ready');
      }
    });

    // === CURRENT WEATHER LISTENER ===
    socket.on('weather-update', (data) => {
      console.log('Current weather received:', data);
      const banner = $('weather-text');
      if (banner && data) {
        banner.textContent = `${Math.round(data.temp)}°F — ${data.condition}`;
      }
    });
  };

  // -----------------------------------------------------------
  // 5. DEVICE UI
  // -----------------------------------------------------------
  const fetchDevices = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/devices');
      const data = await res.json();
      if (data.success) renderDevices(data.devices);
    } catch (err) {
      log('error', 'Failed to load devices: ' + err.message);
    }
  };

  const renderDevices = (devices) => {
    const list = $('deviceList');
    if (!list) return;
    list.innerHTML = '';
    [...(devices.hue || []), ...(devices.kasa || [])].forEach(dev => {
      const div = document.createElement('div');
      div.className = 'device';
      div.id = `device-${dev.id}`;
      div.innerHTML = `
        <h3>${dev.name || dev.id}</h3>
        <p><strong>State:</strong> <span class="state">${dev.state.on ? 'ON' : 'OFF'}</span></p>
        <p><strong>Brightness:</strong> ${dev.state.brightness ?? '—'}</p>
        <button class="toggle ${dev.state.on ? 'off' : ''}">
          ${dev.state.on ? 'Turn Off' : 'Turn On'}
        </button>
      `;
      div.querySelector('button').onclick = () => toggleDevice(dev.id, dev.state.on, dev.type);
      list.appendChild(div);
    });
  };

  const toggleDevice = async (id, current, type) => {
    const action = current ? 'off' : 'on';
    try {
      const res = await window.api.controlKasaDevice(id, action);
      if (res.success) updateDeviceState(id, { on: !current });
    } catch (err) {
      log('error', `Toggle failed: ${err.message}`);
    }
  };

  const updateDeviceState = (id, state) => {
    const el = $(`device-${id}`);
    if (!el) return;
    const stateEl = el.querySelector('.state');
    const btn = el.querySelector('button');
    if (stateEl) stateEl.textContent = state.on ? 'ON' : 'OFF';
    if (btn) {
      btn.textContent = state.on ? 'Turn Off' : 'Turn On';
      btn.className = `toggle ${state.on ? 'off' : ''}`;
    }
  };

  const updateHueLightState = (id, state) => {
    const el = $(`device-${id}`);
    if (!el) return;
    el.querySelectorAll('p').forEach(p => p.remove());
    el.insertAdjacentHTML('beforeend', `
      <p><strong>State:</strong> ${state.on ? 'ON' : 'OFF'}</p>
      <p><strong>Brightness:</strong> ${state.brightness}</p>
      <p><strong>HHue:</strong> ${state.hue}</p>
      <p><strong>Sat:</strong> ${state.saturation}</p>
      <p><strong>Temp:</strong> ${state.colorTemp}K</p>
    `);
  };

  // -----------------------------------------------------------
  // 6. SERVER STATUS
  // -----------------------------------------------------------
  const updateServerStatus = (connected) => {
    const status = $('server-status');
    if (!status) return;
    status.textContent = connected ? 'Server: Connected' : 'Server: Disconnected';
    status.style.color = connected ? '#4CAF50' : '#f44336';
  };

  // -----------------------------------------------------------
  // 7. CLOCK
  // -----------------------------------------------------------
  const startClock = () => {
    const update = () => {
      const now = new Date();
      $('dateTimeDisplay').textContent = now.toLocaleDateString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      });
    };
    update();
    setInterval(update, 1000);
  };

  // -----------------------------------------------------------
  // 8. LITEGRAPH
  // -----------------------------------------------------------
  const initGraph = () => {
    const canvas = $('graphcanvas');
    if (!canvas) return log('error', 'Canvas missing');
    graph = new LGraph();
    editor = new LGraphCanvas(canvas, graph);
    editor.allow_dragcanvas = true;
    editor.allow_dragnodes = true;
    editor.allow_searchbox = true;
    graph.start();
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 200;
      editor.resize();
    };
    window.addEventListener('resize', resize);
    resize();
  };

  // -----------------------------------------------------------
  // 9. BUTTONS
  // -----------------------------------------------------------
  $('pushToBackendBtn').onclick = () => window.api.send('toBackend', 'Push triggered');
  $('triggerPushButtonBtn').onclick = () => window.api.send('toBackend', 'Push Button');
  $('setLocationBtn').onclick = () => {
    const lat = prompt('Latitude:');
    const lon = prompt('Longitude:');
    if (lat && lon) window.api.send('setLocation', { latitude: +lat, longitude: +lon });
  };
  $('saveGraphBtn').onclick = () => {
    const data = JSON.stringify(graph.serialize(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
  };
  $('loadGraphBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        graph.clear();
        graph.configure(JSON.parse(ev.target.result));
        graph.start();
      } catch (err) {
        log('error', 'Failed to load graph: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // -----------------------------------------------------------
  // 10. START EVERYTHING
  // -----------------------------------------------------------
  if (!setupForecastUI()) {
    log('error', 'Forecast UI could not be initialized – check HTML');
  }

  initSocket(); // renderForecast already exists
  startClock();
  initGraph();
  setTimeout(fetchDevices, 2000);
});