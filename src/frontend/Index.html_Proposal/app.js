// src/frontend/app.js  ← REPLACE WITH THIS EXACT CODE (copy-paste, no changes)

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded — now loading everything safely');

  // 1. Global libraries (must be global)
  await import('https://code.jquery.com/jquery-3.6.0.min.js');
  await import('https://cdn.socket.io/4.4.1/socket.io.min.js');
  await import('https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js');
  await import('https://cdnjs.cloudflare.com/ajax/libs/luxon/3.3.0/luxon.min.js');
  await import('https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js');

  // 2. LiteGraph core
  await import('./lightgraph/litegraph.js');
  await import('./lightgraph/litegraph-editor.js');
  await import('./lightgraph/defaults.js');

  // 3. YOUR ORIGINAL SCRIPTS — these contain ALL button logic
  await import('./js/event-scheduler.js');
  await import('./js/socket-handler.js');
  await import('./js/deviceControl.js');
  await import('./js/graph-utils.js');
  await import('./js/main.js');   // ← THIS IS THE ONE WITH ALL YOUR BUTTONS

  // 4. Our clean new stuff
  const { initAuth } = await import('./auth.js');
  const { initModals } = await import('./modals.js');
  const { loadAllCustomNodes } = await import('./node-loader.js');

  initAuth();
  initModals();
  await loadAllCustomNodes();

  console.log('T2Auto fully loaded — buttons should now work!');
});