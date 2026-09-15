const fs = require('fs');
const path = require('path');
const { parse } = require('../../frontend/node_modules/@babel/parser');

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    if (!value || typeof value !== 'object') continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      const match = findNode(child, predicate);
      if (match) return match;
    }
  }
  return null;
}

describe('editor canvas readiness cancellation', () => {
  let waitForStartup;

  beforeAll(() => {
    const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/Editor.jsx'), 'utf8');
    const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const declaration = findNode(tree, node => node.type === 'VariableDeclarator' && node.id?.name === 'createEditor');
    const callback = declaration.init.arguments[0];
    const editorDeclaration = callback.body.body.find(node =>
      node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'editor')
    );
    const startup = source.slice(callback.body.start + 1, editorDeclaration.start);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    waitForStartup = new AsyncFunction('container', 'isCancelled', 'requestAnimationFrame', `${startup}\nreturn 'ready';`);
  });

  test('cancelled startup never proceeds to editor creation even when canvas is sized', async () => {
    const frames = [];
    const container = { getBoundingClientRect: jest.fn(() => ({ width: 800, height: 600 })) };
    const pending = waitForStartup(container, () => true, callback => frames.push(callback));
    frames.shift()();
    expect(await pending).toBeNull();
    expect(container.getBoundingClientRect).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  test('unmount while canvas is zero-sized stops the readiness retry', async () => {
    let cancelled = false;
    const frames = [];
    const container = { getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    const pending = waitForStartup(container, () => cancelled, callback => frames.push(callback));
    frames.shift()();
    expect(frames).toHaveLength(1);
    cancelled = true;
    frames.shift()();
    expect(await pending).toBeNull();
    expect(frames).toHaveLength(0);
  });

  test('cleanup after readiness but before the async continuation cancels creation', async () => {
    let cancelled = false;
    const frames = [];
    const container = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const pending = waitForStartup(container, () => cancelled, callback => frames.push(callback));
    frames.shift()();
    cancelled = true;
    expect(await pending).toBeNull();
  });

  test('active startup proceeds once the canvas becomes visible', async () => {
    let size = 0;
    const frames = [];
    const container = { getBoundingClientRect: () => ({ width: size, height: size }) };
    const pending = waitForStartup(container, () => false, callback => frames.push(callback));
    frames.shift()();
    size = 800;
    frames.shift()();
    expect(await pending).toBe('ready');
    expect(frames).toHaveLength(0);
  });
});