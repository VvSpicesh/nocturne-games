/* No dependency UI integration contract checks. Real touch testing: phone only. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const html = read('index.html');
const js = read('game.js');
const css = read('style.css');
const checks = [
  ['home and thumbnail grid', () => {assert.match(html, /id="levelHome"/); assert.match(html, /id="levelCards"/); assert.match(js, /function makeThumbnail/);} ],
  ['separate play screen', () => {assert.match(html, /id="playScreen" hidden/); assert.match(js, /function showHome/);} ],
  ['three circular trays and 20 slots', () => {assert.match(css, /\.tray-circle\s*\{/); assert.match(js, /for\s*\(let i = 0; i < 3; i\+\+\)/); assert.match(js, /for\s*\(let j = 0; j < 20; j\+\+\)/);} ],
  ['animated take and swap', () => {assert.match(js, /function makeFlights/); assert.match(js, /result\.type === 'take'/); assert.match(js, /bead\.animate/);} ],
  ['inline completion action, no win dialog', () => {assert.match(html, /id="completePanel"/); assert.match(html, /id="completeHome"/); assert.match(html, /id="nextBtn"/); assert.doesNotMatch(html, /winDialog|showModal/);} ],
  ['reduced motion fallback', () => {assert.match(js, /prefersReducedMotion\.matches/); assert.match(css, /prefers-reduced-motion/);} ],
  ['same save version for previous phase', () => assert.match(js, /nocturne-turn-beans-progress-v1/)],
  ['one-second preview', () => assert.match(js, /}, 1000\)/)]
];
for (const [name,check] of checks) {check();console.log('PASS',name);}
console.log(`${checks.length} UI static tests passed`);
