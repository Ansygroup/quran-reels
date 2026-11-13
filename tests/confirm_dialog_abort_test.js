'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const overlays = [];
const document = {
  body: { appendChild(node) { overlays.push(node); } },
  createElement() {
    const buttons = { '[data-ok]': {}, '[data-cancel]': {} };
    return { className: '', innerHTML: '', setAttribute() {}, querySelector: s => buttons[s],
      remove() { const i = overlays.indexOf(this); if (i !== -1) overlays.splice(i, 1); } };
  },
};
const env = vm.createContext({ document, console });
vm.runInContext(fs.readFileSync('public/js/core.js', 'utf8'), env);
const confirm = vm.runInContext('confirmDialog', env);
function trackedController() {
  const controller = new AbortController(), signal = controller.signal;
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  let listeners = 0;
  signal.addEventListener = (...args) => { listeners++; return add(...args); };
  signal.removeEventListener = (...args) => { listeners--; return remove(...args); };
  return { controller, signal, get listeners() { return listeners; } };
}
(async () => {
  let c = trackedController(); c.controller.abort();
  assert.equal(await confirm('title', 'message', 'ok', { signal: c.signal }), false);
  assert.equal(overlays.length, 0); assert.equal(c.listeners, 0);
  c = trackedController(); let p = confirm('<title>', 'message', 'ok', { signal: c.signal });
  assert.equal(overlays.length, 1); assert(overlays[0].innerHTML.includes('&lt;title&gt;')); assert.equal(c.listeners, 1);
  c.controller.abort(); assert.equal(await p, false); assert.equal(overlays.length, 0); assert.equal(c.listeners, 0);
  for (const [button, expected] of [['[data-ok]', true], ['[data-cancel]', false]]) {
    c = trackedController(); p = confirm('title', 'message', 'ok', { signal: c.signal });
    const overlay = overlays[0], handler = overlay.querySelector(button).onclick;
    handler(); assert.equal(await p, expected); assert.equal(overlays.length, 0); assert.equal(c.listeners, 0);
    c.controller.abort(); handler(); assert.equal(c.listeners, 0);
  }
  p = confirm('title', 'message'); overlays[0].querySelector('[data-ok]').onclick(); assert.equal(await p, true);
  const a = trackedController(), b = trackedController();
  const one = confirm('one', 'message', 'ok', { signal: a.signal });
  const two = confirm('two', 'message', 'ok', { signal: b.signal });
  assert.equal(overlays.length, 2); a.controller.abort(); assert.equal(await one, false);
  assert.equal(overlays.length, 1); assert(overlays[0].innerHTML.includes('two'));
  overlays[0].querySelector('[data-ok]').onclick(); assert.equal(await two, true);
  assert.equal(a.listeners, 0); assert.equal(b.listeners, 0); assert.equal(overlays.length, 0);
  console.log('Confirm dialog PASS: abort, buttons, listener cleanup, concurrent and legacy calls');
})().catch(error => { console.error(error); process.exitCode = 1; });
