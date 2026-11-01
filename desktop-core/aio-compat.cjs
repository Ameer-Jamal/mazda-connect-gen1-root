'use strict';
/* Re-implementation of the firmware guard in MZD-AIO 2.8.6 (pinned 409c724), app/files/tweaks/00_start.txt
 * compatibility_check(). It records what AIO's own script would decide. It is not qualification:
 * a nonzero group means AIO attempts to run, not that the tweaks are safe or work on a given car.
 * Differential test: test/aio-compat.test.cjs runs the real shell function when AIO_SRC points at a checkout. */

function numeric(text) { return typeof text === 'string' && /^[0-9]+$/.test(text) ? Number(text) : null; }

/* version: the dotted string AIO extracts from /jci/version.ini JCI_SW_VER, e.g. "70.00.352". */
function compatibilityGroup(version) {
  var text = String(version);
  var parts = text.split('.');
  /* cut -f2 / -f3 print the whole line when it has no delimiter */
  if (parts.length === 1) { parts = [text, text, text]; }
  var major = numeric(parts[0]);
  var mid = numeric(parts[1]);
  var ext = numeric(parts[2]);
  /* shell: [ $mid -ne 00 ] errors (is false) on non-numeric text, so only numeric non-zero mids reject */
  if (mid !== null && mid !== 0) { return 0; }
  if (major === 55 || major === 56) { return 1; }
  if (major === 58) { return 2; }
  if (major === 59) { return ext !== null && ext < 400 ? 3 : ext !== null && ext < 500 ? 4 : 5; }
  if (major === 70) { return ext !== null && ext <= 360 ? 6 : 7; }
  return 0;
}

var MEANING = {
  0: 'Unknown to AIO 2.8.6: it logs "not compatible", remounts / read-only and exits without installing.',
  1: 'FW 55-56', 2: 'FW 58', 3: 'FW 59.00.3xx', 4: 'FW 59.00.4xx', 5: 'FW 59.00.5xx (USB Audio Mod excluded)',
  6: 'FW 70.00.<=360 (script text says tested to 352)',
  7: 'FW 70.00.>360: AIO warns "extreme caution" and continues after a confirm dialog'
};

module.exports = { compatibilityGroup: compatibilityGroup, MEANING: MEANING };
