// Guard for isolated legacy Node helper tests. No production DB, secrets or network.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const originalLoad = Module._load;
const scratch = '/root/.hermes/cache/scratch/';
const wrapped = new WeakMap();
Module._load = function(name, parent, isMain) {
  const value = originalLoad.call(this, name, parent, isMain);
  if (name !== 'better-sqlite3') return value;
  if (!wrapped.has(value)) wrapped.set(value, new Proxy(value, {
    construct(target,args) {
      const file = String(args[0]);
      if(file !== ':memory:' && !path.resolve(file).startsWith(scratch)) throw Error('non_scratch_sqlite_forbidden');
      return Reflect.construct(target,args);
    }
  }));
  return wrapped.get(value);
};
for(const method of ['readFileSync','openSync','createReadStream']) {
  const original=fs[method];
  fs[method]=function(file,...args) {
    if(typeof file==='string' || file instanceof URL) {
      const p=file instanceof URL?file.pathname:path.resolve(file);
      if(p.includes('/secrets/')) throw Error('secret_read_forbidden');
    }
    return original.call(this,file,...args);
  };
}
for(const mod of ['node:net','node:http','node:https']) {
  const obj=require(mod);
  for(const name of ['connect','createConnection','request','get']) if(typeof obj[name]==='function') obj[name]=()=>{throw Error('network_forbidden');};
}
globalThis.fetch=()=>{throw Error('network_forbidden');};
