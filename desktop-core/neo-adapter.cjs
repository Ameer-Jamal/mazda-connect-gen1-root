'use strict';
/* Boundary between the external Neo-MZD-AIO compiler (GPL-3.0, separate program, never vendored here)
 * and drive preparation. This module never executes generated installers: it only runs the pinned
 * compiler's `build` command and reads the resulting files as untrusted data.
 * Successful assembly says nothing about firmware compatibility or vehicle safety. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const safety = require('./drive-safety.cjs');

const PINNED = { repository: 'https://github.com/yangwenbo99/Neo-MZD-AIO', commit: '9db2bc287e13e67d38b670fa6f62981f62c59184' };
const LIMITS = { maxFiles: 5000, maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024 };

/* Walks a built package directory without following links. Anything that is not a regular file or
 * directory, an unsafe name, or OS metadata rejects the whole package (no silent skipping). */
function loadPackageFromDirectory(root, limits) {
  limits = Object.assign({}, LIMITS, limits);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory()) { throw new Error('Package root is not a real directory.'); }
  const files = [];
  var total = 0;
  (function walk(relative) {
    const dir = relative ? path.join(root, relative) : root;
    fs.readdirSync(dir).sort().forEach(function (name) {
      const rel = relative ? relative + '/' + name : name;
      const stat = fs.lstatSync(path.join(root, rel));
      if (stat.isDirectory()) { return walk(rel); }
      if (!stat.isFile()) { throw new Error('Package contains a link or special file: ' + rel); }
      if (!safety.safePath(rel)) { throw new Error('Unsafe package path: ' + JSON.stringify(rel)); }
      if (safety.isSidecar(rel)) { throw new Error('Package contains OS metadata file: ' + rel); }
      if (stat.size > limits.maxFileBytes) { throw new Error('File too large: ' + rel); }
      total += stat.size;
      if (files.length + 1 > limits.maxFiles || total > limits.maxTotalBytes) { throw new Error('Package exceeds size limits.'); }
      files.push({ path: rel, data: fs.readFileSync(path.join(root, rel)) });
    });
  }(''));
  if (!files.length) { throw new Error('Package is empty.'); }
  return files;
}

/* Runs `node cli/bin/mzd-aio.js build CONFIG --output OUTPUT` from a local checkout whose HEAD is exactly the
 * reviewed commit. The output directory must not exist (the compiler also requires this). Dependencies must
 * already be installed; nothing is fetched. This is not an OS sandbox. */
function buildWithNeo(options) {
  const source = options.source;
  const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 30000 }).trim();
  if (head !== (options.commit || PINNED.commit)) { throw new Error('Neo checkout is not at the reviewed commit: ' + head); }
  if (fs.existsSync(options.output)) { throw new Error('Output directory already exists.'); }
  if (!path.isAbsolute(options.output) || !path.isAbsolute(options.config)) { throw new Error('Use absolute paths.'); }
  execFileSync(process.execPath, [path.join(source, 'cli/bin/mzd-aio.js'), 'build', options.config, '--output', options.output], {
    cwd: source, timeout: options.timeoutMs || 300000, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME }
  });
  return loadPackageFromDirectory(options.output);
}

module.exports = { PINNED, LIMITS, loadPackageFromDirectory, buildWithNeo };
