'use strict';
/* In-memory disposable "drive" for tests. Never touches a real device. */
function createImage(info, hooks) {
  hooks = hooks || {};
  const files = new Map();
  const calls = [];
  return {
    files: files,
    calls: calls,
    info: info,
    async describe(id) {
      calls.push('describe');
      if (hooks.onDescribe) { const replaced = hooks.onDescribe(calls.length, info); if (replaced !== undefined) { return replaced; } }
      return id === info.id ? info : null;
    },
    async erase() { calls.push('erase'); files.clear(); },
    async writeFile(id, path, data) {
      calls.push('write:' + path);
      if (hooks.failWrite === path) { throw new Error('simulated I/O error'); }
      files.set(path, hooks.corrupt === path ? Buffer.from('corrupt') : Buffer.from(data));
      if (hooks.afterWrite) { hooks.afterWrite(path); }
    },
    async readFile(id, path) { return files.get(path) || null; },
    async listFiles() { return Array.from(files.keys()); },
    async removeFile(id, path) { calls.push('remove:' + path); if (hooks.noRemove) { return; } files.delete(path); },
    async flush() { calls.push('flush'); }
  };
}
module.exports = { createImage };
