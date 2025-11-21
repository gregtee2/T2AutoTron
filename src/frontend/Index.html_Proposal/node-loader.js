export async function loadAllCustomNodes() {
  try {
    const resp = await fetch('./nodes-manifest.json');
    const text = await resp.text();

    // Strip comments (// and /* */) before parsing
    const json = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const files = JSON.parse(json);

    console.log(`📦 Loading ${files.length} custom nodes...`);

    for (const file of files) {
      try {
        // Adjust path to go up one directory since we're in Index.html_Proposal/
        const adjustedPath = file.replace('./', '../');
        await import(adjustedPath);
      } catch (err) {
        console.error(`Failed to load node: ${file}`, err);
      }
    }

    console.log('✅ All custom nodes loaded');
  } catch (err) {
    console.error('Failed to load node manifest:', err);
  }
}