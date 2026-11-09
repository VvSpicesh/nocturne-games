/* Worker-compatible local runner for file:// and browsers that block Workers.
 * All generation and validation still use the same production engine modules. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./level-generator.js') : root.TurnBeansGenerator,
    typeof module !== 'undefined' && module.exports ? require('./level-document.js') : root.TurnBeansDocument);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansGeneratorClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (generator, documents) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function createLocalRunner() {
    let stopped = false;
    const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
    const runner = {
      onmessage: null,
      terminate() { stopped = true; },
      postMessage(message) {
        const request = clone(message);
        function emit(result) {
          if (!stopped && runner.onmessage) runner.onmessage({ data: clone({ id: request.id, ...result }) });
        }
        async function run() {
          await yieldControl();
          if (stopped) return;
          try {
            const { type, target, levels, metadata } = request;
            if (type === 'generate') {
              const generated = await generator.generateAllAsync(target, {
                yieldControl,
                isCancelled: () => stopped,
                onProgress: name => emit({ type: 'progress', message: '正在本机验证' + name + '难度…' })
              });
              emit({ type: 'generated', levels: generated });
            } else if (type === 'export') {
              const json = JSON.stringify(documents.create(target, levels, metadata), null, 2);
              await yieldControl();
              if (stopped) return;
              const parsed = documents.validate(JSON.parse(json));
              if (JSON.stringify(parsed) !== JSON.stringify(JSON.parse(json))) throw new Error('JSON 回读不一致');
              emit({ type: 'exported', json });
            } else throw new Error('未知生成器任务');
          } catch (error) { emit({ type: 'error', message: error.message }); }
        }
        void run();
      }
    };
    return runner;
  }
  return { createLocalRunner };
});
