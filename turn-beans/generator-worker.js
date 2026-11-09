/* Dedicated local worker: keeps engine replay away from crop interaction. */
'use strict';
importScripts('./engine.js', './subject-extraction.js', './color-processing.js', './bead-grid.js', './image-processing.js', './region-processing.js', './level-generator.js', './level-document.js');
self.onmessage = event => {
  const { id, type, target, levels, metadata } = event.data;
  try {
    if (type === 'generate') {
      self.postMessage({ id, type: 'progress', message: '正在生成三档难度并进行真实引擎点击回放…' });
      self.postMessage({ id, type: 'generated', levels: self.TurnBeansGenerator.generateAll(target) });
    } else if (type === 'export') {
      const json = JSON.stringify(self.TurnBeansDocument.create(target, levels, metadata), null, 2);
      const parsed = self.TurnBeansDocument.validate(JSON.parse(json));
      if (JSON.stringify(parsed) !== JSON.stringify(JSON.parse(json))) throw new Error('JSON 回读不一致');
      self.postMessage({ id, type: 'exported', json });
    } else throw new Error('未知生成器任务');
  } catch (error) { self.postMessage({ id, type: 'error', message: error.message }); }
};
