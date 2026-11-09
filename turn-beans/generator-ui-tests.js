/* Unit-level DOM/Worker doubles only: no browser, server or network. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const image = require('./image-processing.js');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
function pixelData(width = 32, height = 32) {
  const palette = [[229, 124, 146], [115, 169, 209], [240, 206, 151], [70, 61, 64]];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++)
    data.set(r < height / 8 || c < width / 8 || r >= height * 7 / 8 || c >= width * 7 / 8 ? [255, 255, 255, 255] : [...palette[(r >= height / 2 ? 2 : 0) + (c >= width / 2 ? 1 : 0)], 255], (r * width + c) * 4);
  return { width, height, data };
}
function editor(options = {}) {
  const nodes = new Map(), workers = [], timers = new Map(), revoked = [];
  let nextTimer = 0, nextURL = 0;
  class Element {
    constructor(id = '') {
      this.id = id; this.listeners = {}; this.style = {}; this.children = []; this.hidden = false;
      this.width = 384; this.height = 384; this.checked = ['cleanup', 'beads'].includes(id);
      this.value = ({ zoom: '1', positionX: '0', positionY: '0', size: 'native', imageMode: 'auto', cropAspect: 'auto', centerTolerance: '6', colors: '12', colorMode: 'original', saturationBoost: '8', contrastBoost: '4', subjectMode: 'largest' })[id] || '';
      this.disabled = ['export', 'reset'].includes(id); this.textContent = '';
      const classes = new Set();
      this.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) };
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    removeAttribute(name) { delete this[name]; }
    setAttribute(name, value) { this[name] = value; }
    remove() {}
    click() { if (this.listeners.click) this.listeners.click({}); }
    setPointerCapture() {}
    getBoundingClientRect() { return { left:0,top:0,width:560,height:560 }; }
    getContext() {
      const self = this;
      return { clearRect() {}, drawImage(...args) { self.lastDrawImage=args; }, fillRect() { self.paintCount=(self.paintCount||0)+1; }, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        getImageData: () => options.badSubject ? { width: self.width, height: self.height, data: new Uint8ClampedArray(self.width * self.height * 4).fill(255) } : options.sourcePixels || pixelData(self.width, self.height) };
    }
  }
  class Worker {
    constructor() {
      if (options.workerThrows) throw new Error('Worker blocked for origin null');
      workers.push(this); this.messages = []; this.terminated = false;
    }
    postMessage(message) { this.messages.push(structuredClone(message)); }
    terminate() { this.terminated = true; }
    receive(message) { this.onmessage({ data: message }); }
  }
  class Image {
    constructor() { this.naturalWidth = options.sourcePixels?.width || 800; this.naturalHeight = options.sourcePixels?.height || 600; }
    decode() { return Promise.resolve(); }
  }
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id); },
    createElement: () => new Element(), createDocumentFragment: () => new Element(), body: new Element()
  };
  const sandbox = {
    document, Image, Worker, Blob, console, TurnBeansImage: image, TurnBeansGrid: require('./bead-grid.js'), TurnBeansPreview: require('./preview-renderer.js'),
    location: { protocol: options.protocol || 'http:' },
    TurnBeansGeneratorClient: require('./generator-client.js'),
    URL: { createObjectURL: () => 'blob:unit-' + ++nextURL, revokeObjectURL: url => revoked.push(url) },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), addEventListener() {}
  };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(read('generator-ui.js'), sandbox);
  return { nodes, workers, revoked, setBadSubject: value => { options.badSubject = value; }, get: id => document.getElementById(id),
    flush: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    async upload(file = { type: 'image/png', size: 1000, name: 'subject.png' }) {
      document.getElementById('file').files = [file]; await document.getElementById('file').listeners.change();
    } };
}
function workerModule() {
  const messages = [], sandbox = { console };
  sandbox.self = sandbox; sandbox.postMessage = data => messages.push(structuredClone(data));
  vm.createContext(sandbox);
  sandbox.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name), sandbox, { filename: name }));
  vm.runInContext(read('generator-worker.js'), sandbox);
  return { messages, send: data => sandbox.onmessage({ data }) };
}
test('real classic worker loads local modules, generates verified versions and exports JSON with roundtrip validation', () => {
  const worker = workerModule(), target = image.targetFromPixels(pixelData());
  worker.send({ id: 7, type: 'generate', target });
  assert.equal(worker.messages[0].type, 'progress');
  const generated = worker.messages[1]; assert.equal(generated.type, 'generated');
  assert.ok(generated.levels.every(level => level.playable && level.validation.passed));
  worker.send({ id: 7, type: 'export', target, levels: generated.levels, metadata: { sourceName: 'unit.png' } });
  const exported = worker.messages[2]; assert.equal(exported.type, 'exported');
  const parsed = JSON.parse(exported.json);
  assert.deepEqual(require('./level-document.js').targetOf(parsed).targetBoard, target.targetBoard);
  assert.deepEqual(Object.keys(parsed.variants), ['easy', 'medium', 'hard']);
  worker.send({ id: 8, type: 'generate', target: {} });
  assert.equal(worker.messages.at(-1).type, 'error');
  assert.equal(worker.messages.at(-1).id, 8);
});
test('upload produces a local target, crop and worker request; changing crop invalidates old results immediately', async () => {
  const app = editor(); await app.upload();
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) assert.match(app.get(id).textContent, /准备生成/);
  app.flush();
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) assert.match(app.get(id).textContent, /正在生成/);
  assert.equal(app.get('original').hidden, false); assert.equal(app.get('reset').disabled, false);
  const firstWorker = app.workers[0], request = firstWorker.messages[0];
  assert.equal(request.type, 'generate'); assert.equal(request.target.width, 32);
  app.get('zoom').value = '2'; app.get('zoom').listeners.input();
  assert.equal(firstWorker.terminated, true); assert.equal(app.get('export').disabled, true);
  firstWorker.receive({ id: request.id, type: 'error', message: 'stale error' });
  assert.ok(!app.get('status').textContent.includes('stale error'));
  app.flush(); assert.equal(app.workers.length, 2);
  assert.notEqual(app.workers[1].messages[0].id, request.id);
});
test('worker load failures switch to the local runner and invalid files cannot retain old results', async () => {
  const app = editor(); await app.upload(); app.flush();
  const worker = app.workers[0], request = worker.messages[0];
  worker.onerror(); assert.equal(app.get('export').disabled, true); assert.match(app.get('status').textContent, /正在本机/);
  await app.upload({ type: 'image/svg+xml', size: 100, name: 'bad.svg' });
  assert.equal(app.get('original').hidden, true);
  assert.equal(app.get('export').disabled, true); assert.match(app.get('status').textContent, /图片读取失败/);
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) {
    assert.match(app.get(id).textContent, /生成失败.*图片读取失败/);
    assert.doesNotMatch(app.get(id).textContent, /等待|准备生成|正在生成/);
  }
  assert.equal(app.revoked.length, 1);
  worker.receive({ id: request.id, type: 'generated', levels: [] });
  assert.equal(app.get('export').disabled, true);
});
test('mouse/touch crop pan updates position controls and reset restores center and scale', async () => {
  const app = editor(); await app.upload();
  app.get('zoom').value = '2'; app.get('zoom').listeners.input();
  const crop = app.get('crop');
  crop.listeners.pointerdown({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  crop.listeners.pointermove({ pointerId: 1, clientX: 180, clientY: 140 });
  assert.ok(Number(app.get('positionX').value) < 0);
  assert.ok(Number(app.get('positionY').value) < 0);
  crop.listeners.pointerup({ pointerId: 1 });
  app.get('reset').listeners.click();
  assert.equal(Number(app.get('zoom').value), 1); assert.equal(Number(app.get('positionX').value), 0);
  assert.equal(Number(app.get('positionY').value), 0);
});
test('current worker errors clear playable labels and disable export', async () => {
  const app = editor(); await app.upload(); app.flush();
  const worker = app.workers[0], request = worker.messages[0];
  worker.receive({ id: request.id, type: 'error', message: 'verification failed' });
  assert.equal(app.get('export').disabled, true);
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) assert.match(app.get(id).textContent, /不可玩/);
  assert.match(app.get('status').textContent, /verification failed/);
  assert.equal(worker.terminated, true);
  worker.receive({ id: request.id, type: 'generated', levels: [] });
  assert.equal(app.get('export').disabled, true);
  assert.match(app.get('status').textContent, /verification failed/);
});

test('validated results render all three tiers and export sends the matching target and crop metadata', async () => {
  const app = editor(); await app.upload(); app.flush();
  const worker = app.workers[0], request = worker.messages[0];
  const levels = require('./level-generator.js').generateAll(request.target);
  worker.receive({ id: request.id, type: 'generated', levels });
  assert.equal(app.get('export').disabled, false);
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) {
    assert.equal(app.get(id).children[0].textContent, '回放通过 · 可玩');
  }
  app.get('beads').checked = false; app.get('beads').listeners.change();
  app.get('export').listeners.click();
  const exported = worker.messages.at(-1);
  assert.equal(exported.type, 'export'); assert.deepEqual(exported.target, request.target);
  assert.equal(exported.metadata.sourceName, 'subject.png');
  assert.equal(exported.metadata.crop.zoom, 1); assert.equal(app.get('export').disabled, true);
  worker.receive({ id: request.id, type: 'exported', json: JSON.stringify({ fixture: true }) });
  assert.equal(app.get('export').disabled, false);
  assert.match(app.get('status').textContent, /JSON 已导出/);
});

async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'local runner did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
test('file protocol never constructs a Worker and produces three real verified results with working export', async () => {
  const app = editor({ protocol: 'file:', workerThrows: true }); await app.upload(); app.flush();
  assert.equal(app.workers.length, 0);
  await waitFor(() => !app.get('export').disabled);
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) assert.equal(app.get(id).children[0].textContent, '回放通过 · 可玩');
  app.get('export').listeners.click();
  await waitFor(() => !app.get('export').disabled);
  assert.match(app.get('status').textContent, /JSON 已导出/);
  app.get('reset').listeners.click();
});
test('a synchronous Worker security error automatically uses the same verified local pipeline', async () => {
  const app = editor({ workerThrows: true }); await app.upload(); app.flush();
  await waitFor(() => !app.get('export').disabled);
  assert.match(app.get('status').textContent, /3\/3 档真实引擎回放通过/);
  app.get('reset').listeners.click();
});
test('asynchronous Worker failure falls back and rejects messages from the replaced worker', async () => {
  const app = editor(); await app.upload(); app.flush();
  const worker = app.workers[0], request = worker.messages[0];
  worker.onerror();
  assert.equal(worker.terminated, true);
  worker.receive({ id: request.id, type: 'generated', levels: [] });
  assert.equal(app.get('export').disabled, true);
  await waitFor(() => !app.get('export').disabled);
  assert.match(app.get('status').textContent, /3\/3 档真实引擎回放通过/);
  app.get('reset').listeners.click();
});
test('terminating a local runner during a yield suppresses all subsequent results', async () => {
  const { createLocalRunner } = require('./generator-client.js'), messages = [];
  const runner = createLocalRunner();
  runner.onmessage = event => { messages.push(event.data); runner.terminate(); };
  runner.postMessage({ id: 1, type: 'generate', target: image.targetFromPixels(pixelData()) });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'progress');
});

test('the page loads all fallback dependencies as classic scripts in their actual browser order', async () => {
  const sandbox = { setTimeout, console }, messages = [];
  vm.createContext(sandbox);
  const scripts = [...read('generator.html').matchAll(/<script src="\.\/([^"]+)" defer><\/script>/g)].map(match => match[1]);
  assert.equal(scripts.at(-1), 'generator-ui.js');
  for (const script of scripts.slice(0, -1)) vm.runInContext(read(script), sandbox, { filename: script });
  const runner = sandbox.TurnBeansGeneratorClient.createLocalRunner();
  runner.onmessage = event => messages.push(event.data);
  runner.postMessage({ id: 5, type: 'generate', target: image.targetFromPixels(pixelData()) });
  await waitFor(() => messages.some(message => message.type === 'generated' || message.type === 'error'));
  const result = messages.at(-1);
  assert.equal(result.type, 'generated');
  assert.ok(result.levels.every(level => level.playable && level.validation.passed));
  runner.terminate();
});

test('subject previews use the extracted mask and mode changes invalidate and regenerate the target', async () => {
  const app = editor(); await app.upload(); app.flush();
  const first = app.workers[0], request = first.messages[0], target = request.target;
  assert.equal(target.subject.mode, 'largest');
  assert.equal(target.subject.sourceWidth, 128);
  assert.equal(target.subject.sourceHeight, 96);
  assert.ok(target.subject.outputActiveCells < 1024);
  assert.ok(target.subjectMask.some(value => value === 0));
  assert.match(app.get('subjectInfo').textContent, /已去背景并居中/);
  assert.equal(app.get('subjectMask').width, 32 * 8);
  assert.equal(app.get('subjectExtract').width, 32 * 8);
  app.get('subjectMode').value = 'all'; app.get('subjectMode').listeners.input();
  assert.equal(first.terminated, true); assert.equal(app.get('export').disabled, true);
  app.flush();
  assert.equal(app.workers.at(-1).messages[0].target.subject.mode, 'all');
});
test('failed subject recognition clears old target and previews and cannot launch difficulty generation', async () => {
  const app = editor(); await app.upload(); app.flush();
  const oldWorker = app.workers[0], oldRequest = oldWorker.messages[0];
  app.setBadSubject(true);
  await app.upload(); app.flush();
  assert.equal(oldWorker.terminated, true);
  assert.equal(app.workers.length, 1);
  assert.equal(app.get('export').disabled, true);
  assert.match(app.get('status').textContent, /主体识别失败/);
  assert.match(app.get('subjectInfo').textContent, /没有有效主体/);
  assert.equal(app.get('targetInfo').textContent, '没有有效目标图案');
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) {
    assert.match(app.get(id).textContent, /生成失败.*主体识别失败/);
    assert.doesNotMatch(app.get(id).textContent, /等待|准备生成|正在生成/);
  }
  oldWorker.receive({ id: oldRequest.id, type: 'generated', levels: [] });
  assert.equal(app.get('export').disabled, true);
  assert.match(app.get('status').textContent, /主体识别失败/);
});

test('color controls default to original with light enhancement and invalidate all stale variants', async () => {
  const app=editor();await app.upload();app.flush();
  const first=app.workers[0],source=first.messages[0].target;
  assert.deepEqual(source.colorOptions,{colorMode:'original',saturationBoost:8,contrastBoost:4});
  assert.match(app.get('colorStatus').textContent,/保色指标/);
  app.get('colorMode').value='soft';app.get('colorMode').listeners.input();app.flush();
  const soft=app.workers.at(-1).messages[0].target;
  assert.equal(first.terminated,true);assert.equal(app.get('export').disabled,true);
  assert.equal(soft.colorOptions.colorMode,'soft');assert.deepEqual(soft.subjectMask,source.subjectMask);
  assert.notDeepEqual(soft.palette,source.palette);
  app.get('saturationBoost').value='20';app.get('saturationBoost').listeners.input();
  app.get('contrastBoost').value='12';app.get('contrastBoost').listeners.input();app.flush();
  const latest=app.workers.at(-1).messages[0].target;
  assert.equal(latest.colorOptions.saturationBoost,20);assert.equal(latest.colorOptions.contrastBoost,12);
  assert.equal(app.get('saturationValue').value,'+20%');assert.equal(app.get('contrastValue').value,'+12%');
});
test('color fidelity and playable target consistency are reported independently', async () => {
  const app=editor();await app.upload();
  app.get('colors').value='2';app.get('colors').listeners.input();app.flush();
  const worker=app.workers.at(-1),request=worker.messages[0],target=request.target;
  assert.equal(target.colorQuality.passed,false);assert.match(app.get('colorStatus').textContent,/需调整/);
  const versions=require('./level-generator.js').generateAll(target);
  assert.ok(versions.every(level=>level.playable));
  worker.receive({id:request.id,type:'generated',levels:versions});
  assert.match(app.get('structureStatus').textContent,/三档目标一致：已验证/);
  assert.match(app.get('colorStatus').textContent,/需调整/);
  const before=JSON.stringify(target.targetBoard),count=app.workers.length;
  app.get('beads').checked=false;app.get('beads').listeners.change();
  assert.equal(app.workers.length,count);assert.equal(JSON.stringify(target.targetBoard),before);
});
test('unified JSON records the target color settings without letting a variant override them', async () => {
  const app=editor();await app.upload();app.flush();
  const worker=app.workers[0],request=worker.messages[0];
  const versions=require('./level-generator.js').generateAll(request.target);
  worker.receive({id:request.id,type:'generated',levels:versions});
  app.get('export').listeners.click();
  const message=worker.messages.at(-1),schema=require('./level-document.js');
  const doc=schema.create(message.target,message.levels,message.metadata);
  assert.equal(doc.metadata.source.colorMode,'original');
  assert.equal(doc.metadata.source.saturationBoost,8);assert.equal(doc.metadata.source.contrastBoost,4);
  assert.deepEqual(schema.validate(JSON.parse(JSON.stringify(doc))),doc);
  for(const key of schema.KEYS)assert.deepEqual(schema.toGameLevel(doc,key).targetBoard,request.target.targetBoard);
  const invalid=structuredClone(doc);invalid.metadata.source.saturationBoost=100;
  assert.throws(()=>schema.validate(invalid),/饱和度/);
});

test('auto UI locks a real synthetic bead lattice, disables enhancement and shows measured grid information', async () => {
  const source=require('./bead-grid-fixtures.js').scene({holes:[[3,3],[3,4],[4,3],[4,4]]}).source;
  const app=editor({sourcePixels:source});await app.upload();app.flush();
  const target=app.workers[0].messages[0].target;
  assert.equal(target.locked,true);assert.equal(target.width,8);assert.equal(target.height,8);
  assert.equal(target.recognitionReady,true);assert.equal(target.subject.outputActiveCells,60);
  assert.equal(app.get('saturationBoost').disabled,true);assert.equal(app.get('contrastBoost').disabled,true);
  assert.equal(app.get('manualEditor').hidden,false);assert.equal(app.get('lockedComparison').hidden,false);
  assert.match(app.get('gridInfo').textContent,/8 列 × 8 行/);
  assert.match(app.get('recognitionInfo').textContent,/不是实测准确率/);
  assert.equal(target.colorOptions.saturationBoost,0);assert.equal(target.colorOptions.contrastBoost,0);
  assert.match(app.get('colorStatus').textContent,/相对原图豆子中心色/);
  assert.doesNotMatch(app.get('colorStatus').textContent,/降低增强/);
});
test('palette and individual bead editing regenerate all solutions without modifying the source palette or holes', async () => {
  const source=require('./bead-grid-fixtures.js').scene({holes:[[3,3]]}).source,app=editor({sourcePixels:source});
  await app.upload();app.flush();const original=app.workers[0],first=original.messages[0].target;
  const picker=app.get('editablePalette').children[0].children[0];
  picker.value='#FFC800';picker.listeners.change();app.flush();
  assert.equal(original.terminated,true);
  let target=app.workers.at(-1).messages[0].target;
  assert.ok(target.palette.includes('#FFC800'));assert.deepEqual(target.sourcePalette,first.sourcePalette);
  assert.equal(target.targetBoard[3][3].active,false);
  app.get('target').listeners.click({clientX:35,clientY:35});
  assert.equal(app.get('applyCell').disabled,false);app.get('cellColor').value='#22BBEE';app.get('applyCell').listeners.click();app.flush();
  target=app.workers.at(-1).messages[0].target;
  assert.equal(target.targetBoard[0][0].baseColor,'#22BBEE');assert.equal(target.manualCorrectionCount,2);
  assert.deepEqual(target.subjectMask,first.subjectMask);
  const levels=require('./level-generator.js').generateAll(target),worker=app.workers.at(-1),request=worker.messages[0];
  assert.ok(levels.every(level=>level.playable));worker.receive({id:request.id,type:'generated',levels});
  assert.match(app.get('structureStatus').textContent,/已验证/);
  app.get('export').listeners.click();const message=worker.messages.at(-1),schema=require('./level-document.js');
  const doc=schema.create(message.target,message.levels,message.metadata);
  assert.equal(doc.metadata.source.imageMode,'bead-lock');assert.equal(doc.metadata.source.manualCorrections,2);
});
test('forced lock failure does not pretend ordinary-image processing is a successful original-bead recognition', async () => {
  const app=editor();await app.upload();app.flush();
  const old=app.workers[0];app.get('imageMode').value='bead-lock';app.get('imageMode').listeners.input();app.flush();
  assert.equal(old.terminated,true);assert.equal(app.workers.length,1);
  assert.match(app.get('status').textContent,/拼豆识别失败/);assert.equal(app.get('export').disabled,true);
  for (const id of ['easyInfo', 'normalInfo', 'hardInfo']) assert.match(app.get(id).textContent, /生成失败.*拼豆识别失败/);
  assert.equal(app.get('manualEditor').hidden,true);assert.equal(app.get('centerTolerance').disabled,false);
  app.get('imageMode').value='ordinary';app.get('imageMode').listeners.input();app.flush();
  assert.equal(app.workers.length,2);assert.equal(app.get('saturationBoost').disabled,false);
  assert.equal(app.workers[1].messages[0].target.imageRecognition.mode,'ordinary');
});

test('above 24 colors offers explicit preserve, family merge and recrop actions without pretending verification', async () => {
  const source=coloredScene(32),app=editor({sourcePixels:source});await app.upload();app.flush();
  assert.equal(app.workers.length,0);assert.equal(app.get('export').disabled,true);
  assert.equal(app.get('paletteActions').hidden,false);assert.equal(app.get('manualEditor').hidden,false);
  assert.match(app.get('targetStatus').textContent,/生成成功/);
  assert.match(app.get('paletteStrategy').textContent,/检测色数.*推荐色数：16.*超过 24 色/);
  for(const id of ['easyInfo','normalInfo','hardInfo'])assert.match(app.get(id).textContent,/请选择保留、合并或重新框选/);
  app.get('keepColors').listeners.click();app.flush();
  assert.equal(app.workers.length,1);
  const preserved=app.workers[0].messages[0].target;
  assert.ok(preserved.palette.length>24);assert.equal(preserved.colorStrategy,'preserve');
  app.get('mergeColors').listeners.click();app.flush();
  assert.equal(app.workers.length,2);assert.equal(app.workers[0].terminated,true);
  const merged=app.workers[1].messages[0].target;
  assert.ok(merged.palette.length<=16);assert.equal(merged.colorStrategy,'family-16');
  assert.deepEqual(merged.subjectMask,preserved.subjectMask);
  assert.deepEqual(merged.sourcePalette,preserved.sourcePalette);
  assert.match(app.get('paletteStrategy').textContent,/按色系合并/);
  app.get('returnCrop').listeners.click();
  assert.equal(app.workers[1].terminated,true);assert.equal(app.get('export').disabled,true);
  assert.match(app.get('status').textContent,/拖出主体矩形/);
});
function coloredScene(count){
  const hue=h=>{const x=Math.round(255*(1-Math.abs(h/60%2-1)));return h<60?[255,x,0]:h<120?[x,255,0]:h<180?[0,255,x]:h<240?[0,x,255]:h<300?[x,0,255]:[255,0,x];};
  return require('./bead-grid-fixtures.js').scene({columns:24,rows:24,pitch:10,blockSize:4,palette:Array.from({length:count},(_,i)=>hue(i*360/count))}).source;
}
test('19 colors preserve the target and automatically verify all tiers with working JSON export', async () => {
  const app=editor({sourcePixels:coloredScene(19)});app.get('centerTolerance').value='1';await app.upload();app.flush();
  assert.equal(app.workers.length,1);
  const worker=app.workers[0],request=worker.messages[0],before=JSON.stringify(request.target);
  assert.equal(request.target.palette.length,19);
  assert.match(app.get('targetStatus').textContent,/生成成功/);assert.match(app.get('paletteStrategy').textContent,/超过推荐色数，允许/);
  assert.equal(app.get('paletteActions').hidden,false);
  const levels=require('./level-generator.js').generateAll(request.target);
  worker.receive({id:request.id,type:'generated',levels});
  assert.equal(app.get('export').disabled,false);assert.equal(JSON.stringify(request.target),before);
  app.get('export').listeners.click();const message=worker.messages.at(-1);
  const doc=require('./level-document.js').create(message.target,message.levels,message.metadata);
  assert.equal(Object.keys(doc.palette).length,19);
  assert.ok(Object.values(doc.variants).every(variant=>variant.verified));
});
test('manual rectangle selection crops before extraction and can be cleared without modifying source files', async () => {
  const app=editor();await app.upload();app.flush();const previous=app.workers[0],crop=app.get('crop');
  app.get('selectSubject').listeners.click();
  assert.equal(previous.terminated,true);assert.equal(app.get('export').disabled,true);
  crop.listeners.pointerdown({pointerId:4,pointerType:'mouse',button:0,clientX:56,clientY:112});
  crop.listeners.pointermove({pointerId:4,clientX:448,clientY:504});
  crop.listeners.pointerup({pointerId:4,clientX:448,clientY:504});app.flush();
  assert.equal(app.get('clearSelection').disabled,false);
  const used=crop.lastDrawImage;
  assert.ok(Math.abs(used[1]-80)<1e-8&&Math.abs(used[2]-120)<1e-8);
  assert.ok(Math.abs(used[3]-560)<1e-8&&Math.abs(used[4]-420)<1e-8);
  assert.match(app.get('subjectSelectionInfo').textContent,/仅统计框内提取后的主体颜色/);
  const worker=app.workers.at(-1),request=worker.messages[0],levels=require('./level-generator.js').generateAll(request.target);
  worker.receive({id:request.id,type:'generated',levels});app.get('export').listeners.click();
  assert.ok(worker.messages.at(-1).metadata.subjectRect);
  const doc=require('./level-document.js').create(request.target,levels,worker.messages.at(-1).metadata);
  assert.ok(Math.abs(doc.metadata.source.subjectRect.width-.7)<1e-8);
  app.get('clearSelection').listeners.click();app.flush();assert.equal(app.get('clearSelection').disabled,true);
  assert.equal(crop.lastDrawImage[1],0);assert.equal(crop.lastDrawImage[2],0);
});


test('quality-failed noisy results are never painted or labelled playable even with a false success claim',async()=>{
  const app=editor();await app.upload();app.flush();
  const worker=app.workers[0],request=worker.messages[0],target=structuredClone(request.target);
  target.targetBoard.forEach((row,r)=>row.forEach((cell,c)=>{if(cell.active){cell.baseColor=target.palette[(r+c)%2];cell.beanColor=cell.baseColor;}}));
  target.palette=target.palette.slice(0,2);
  const levels=require('./level-generator.js').generateAll(target);
  assert.ok(levels.every(level=>!level.quality.passed));
  worker.receive({id:request.id,type:'generated',levels:levels.map(level=>({...level,playable:true,validation:{...level.validation,passed:true}}))});
  assert.equal(app.get('export').disabled,true);
  for(const name of ['easy','normal','hard']){
    assert.equal(app.get(name).paintCount||0,0);
    assert.equal(app.get(name+'Info').children[0].textContent,'生成失败 · 不可玩');
  }
  assert.match(app.get('status').textContent,/0\/3 档/);
});
