import { apply, name, inject } from '../src/index.js';
const registered = [];
const ctx = {
  logger: { info: (m) => {}, warn: (m) => console.log('WARN ' + m) },
  tools: { register: (def) => registered.push(def.name) },
  skills: { register: (spec) => { console.log('skill registered: ' + spec.name + ' / ' + spec.description.slice(0, 40) + '...'); return () => {}; } },
  effect: () => {},
};
apply(ctx, {});
console.log('plugin name: ' + name + '  inject: ' + JSON.stringify(inject));
console.log('tools (' + registered.length + '): ' + registered.join(', '));
