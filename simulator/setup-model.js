/* Desktop planning flow. No device access, script compilation or vehicle execution. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) { module.exports = factory(require('./aio-catalog.js')); }
    else { root.ConnectLabSetup = factory(root.ConnectLabAIO); }
}(this, function (aio) {
    'use strict';
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function create() {
        var target = { generation: 'unknown', model: '', year: '', firmware: '', region: '', market: '' };
        var selected = [];
        var step = 0;
        var acknowledged = false;
        var downloadRequested = false;
        var message = '';
        var features = aio.features();
        function invalidate() { acknowledged = false; downloadRequested = false; message = ''; }
        function snapshot() {
            return {
                step: step, target: copy(target), selected: selected.slice(), acknowledged: acknowledged,
                downloadRequested: downloadRequested, message: message, vehicleAllowed: false,
                plan: aio.plan(selected, target.firmware, target.generation)
            };
        }
        function setTarget(input) {
            var next = {};
            Object.keys(target).forEach(function (key) {
                var descriptor = input && Object.getOwnPropertyDescriptor(input, key);
                if (!descriptor || typeof descriptor.value !== 'string' || descriptor.value.length > 128 || /[\x00-\x1f\x7f]/.test(descriptor.value)) {
                    throw new Error('Invalid identification field: ' + key);
                }
                next[key] = descriptor.value.trim();
            });
            if (['unknown', 'gen1', 'gen2'].indexOf(next.generation) === -1) { throw new Error('Invalid generation.'); }
            if (next.year && !/^\d{4}$/.test(next.year)) { throw new Error('Use a four-digit model year or leave it blank.'); }
            target = next;
            invalidate();
            return snapshot();
        }
        function select(id, enabled) {
            if (typeof enabled !== 'boolean' || !features.some(function (feature) { return feature.id === id; })) { throw new Error('Invalid feature selection.'); }
            var index = selected.indexOf(id);
            if (enabled && index === -1) { selected.push(id); }
            if (!enabled && index !== -1) { selected.splice(index, 1); }
            invalidate();
            return snapshot();
        }
        function acknowledge(value) {
            if (typeof value !== 'boolean') { throw new Error('Invalid acknowledgement.'); }
            acknowledged = value;
            downloadRequested = false;
            message = '';
            return snapshot();
        }
        function next() {
            message = '';
            if (step === 1 && !selected.length) { message = 'Choose at least one feature to include in your review plan.'; }
            else if (step === 2 && !acknowledged) { message = 'Confirm that you understand this preview exports a planning file, not USB installation software.'; }
            else if (step === 3 && !downloadRequested) { message = 'Request your plan download before continuing. No USB software will be created.'; }
            else if (step < 4) { step += 1; }
            else { message = 'USB preparation and in-car installation are unavailable in this desktop alpha.'; }
            return snapshot();
        }
        function back() { step = Math.max(0, step - 1); message = ''; return snapshot(); }
        function exportPlan() {
            if (step !== 3 || !selected.length || !acknowledged) { throw new Error('Review the current selections before exporting.'); }
            var plan = aio.plan(selected, target.firmware, target.generation);
            plan.desktopFlow = { version: 1, usbPrepared: false, installationAvailable: false };
            return plan;
        }
        function markDownloadRequested() {
            exportPlan();
            downloadRequested = true;
            message = 'Download requested. Check your Downloads folder for mazda-connect-review-plan.json. Your USB has not been changed.';
            return snapshot();
        }
        return { snapshot: snapshot, setTarget: setTarget, select: select, acknowledge: acknowledge, next: next, back: back, exportPlan: exportPlan, markDownloadRequested: markDownloadRequested };
    }
    return { create: create };
}));
