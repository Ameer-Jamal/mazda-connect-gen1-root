'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repositoryRoot = path.resolve(__dirname, '..');
const UPSTREAM_COMMIT = 'b1f7a7e082cb88c78183dd94cdb87bd4b02dae60';
const UPSTREAM_REPOSITORY = 'https://github.com/mzd-evo/mzd-connect-1-root';
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function check(root = repositoryRoot) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/upstream-baseline.json'), 'utf8'));
  if (baseline.commit !== UPSTREAM_COMMIT || baseline.repository !== UPSTREAM_REPOSITORY || baseline.algorithm !== 'sha256') {
    throw new Error('Unexpected upstream baseline identity');
  }
  // Validate the manifest against Git history, not just editable recorded hashes.
  const inherited = execFileSync('git', ['ls-tree', '-r', '--name-only', UPSTREAM_COMMIT], { cwd: repositoryRoot, encoding: 'utf8' }).trim().split('\n');
  if (JSON.stringify(Object.keys(baseline.files).sort()) !== JSON.stringify(inherited.slice().sort())) {
    throw new Error('Upstream baseline file list changed');
  }
  for (const name of inherited) {
    const original = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${name}`], { cwd: repositoryRoot });
    if (baseline.files[name] !== hash(original)) { throw new Error(`Baseline digest changed: ${name}`); }
    const file = path.join(root, name);
    if (!fs.lstatSync(file).isFile()) { throw new Error(`Inherited file is not a regular file: ${name}`); }
    if (hash(fs.readFileSync(file)) !== baseline.files[name]) { throw new Error(`Inherited file changed: ${name}`); }
  }
  return inherited.length;
}
if (require.main === module) {
  try { console.log(`Verified ${check()} inherited files against ${UPSTREAM_COMMIT}. Integrity is not a safety certification.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { check };
