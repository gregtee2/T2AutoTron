const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('shared logic loader ingress URL handling', () => {
  test('uses the ingress-aware apiUrl builder for shared modules', async () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../plugins/00_SharedLogicLoader.js'),
      'utf8'
    );
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '(function(){ window.T2SharedLogic.testValue = true; })();'
    });
    const apiUrl = jest.fn(value => `/api/hassio/ingress/test-token${value}`);
    const context = {
      window: { apiUrl },
      fetch,
      console: { warn: jest.fn(), log: jest.fn() }
    };

    vm.runInNewContext(source, context);
    await context.window.T2SharedLogic._ready;

    expect(apiUrl).toHaveBeenCalledWith('/api/shared-logic/TimeRangeLogic');
    expect(fetch).toHaveBeenCalledWith(
      '/api/hassio/ingress/test-token/api/shared-logic/TimeRangeLogic'
    );
  });
});