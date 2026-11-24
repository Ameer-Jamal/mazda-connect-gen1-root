/* Desktop planning flow. No device access, script compilation or vehicle execution. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) { module.exports = factory(require('./aio-catalog.js')); }
    else { root.ConnectLabSetup = factory(root.ConnectLabAIO); }
}(this, function (aio) {
    'use strict';
    var MAX_IMPORT_BYTES = 65536;
    var PLAN_KEYS = ['schemaVersion', 'kind', 'executable', 'vehicleAllowed', 'generation', 'firmware', 'finding', 'provenance', 'features', 'unresolved', 'contents', 'desktopFlow'];
    var FEATURE_KEYS = ['id', 'name', 'category', 'summary', 'path', 'note'];
    var FLOW_KEYS = ['version', 'usbPrepared', 'installationAvailable'];
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function plainObject(value, keys) {
        return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
            Object.keys(value).every(function (key) { return keys.indexOf(key) !== -1; });
    }
    /* Imported files are inert data: only generation, firmware and feature IDs are read; everything else is regenerated. */
    function readPlan(text, features) {
        var data;
        if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) { throw new Error('Plan file is missing or larger than 64 KB.'); }
        try { data = JSON.parse(text); } catch (error) { throw new Error('Plan file is not valid JSON.'); }
        if (!plainObject(data, PLAN_KEYS)) { throw new Error('Plan file contains unexpected fields.'); }
        if (data.schemaVersion !== 1 || data.kind !== 'aio-research-plan') { throw new Error('Unsupported plan schema or version.'); }
        if (data.executable !== false || data.vehicleAllowed !== false) { throw new Error('Plan file claims capabilities this planner does not have.'); }
        if (data.desktopFlow !== undefined && (!plainObject(data.desktopFlow, FLOW_KEYS) || data.desktopFlow.version !== 1 ||
            data.desktopFlow.usbPrepared !== false || data.desktopFlow.installationAvailable !== false)) {
            throw new Error('Unsupported desktop flow version.');
        }
        if (['unknown', 'gen1', 'gen2'].indexOf(data.generation) === -1) { throw new Error('Invalid generation in plan file.'); }
        if (typeof data.firmware !== 'string' || data.firmware.length > 128 || /[\x00-\x1f\x7f]/.test(data.firmware)) { throw new Error('Invalid firmware in plan file.'); }
        if (!Array.isArray(data.features) || !data.features.length || data.features.length > features.length) { throw new Error('Plan file must list between 1 and ' + features.length + ' features.'); }
        var ids = data.features.map(function (entry) {
            if (!plainObject(entry, FEATURE_KEYS) || typeof entry.id !== 'string') { throw new Error('Invalid feature entry in plan file.'); }
            if (!features.some(function (feature) { return feature.id === entry.id; })) { throw new Error('Plan file lists an unknown feature.'); }
            return entry.id;
        });
        if (ids.some(function (id, index) { return ids.indexOf(id) !== index; })) { throw new Error('Plan file lists a feature more than once.'); }
        return { generation: data.generation, firmware: data.firmware.trim(), ids: ids };
    }
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
        function importPlan(text) {
            var imported = readPlan(text, features);
            var nextTarget = { generation: imported.generation, model: '', year: '', firmware: imported.firmware, region: '', market: '' };
            aio.plan(imported.ids, nextTarget.firmware, nextTarget.generation);
            target = nextTarget;
            selected = imported.ids;
            step = 2;
            invalidate();
            message = 'Plan imported with ' + selected.length + ' feature' + (selected.length === 1 ? '' : 's') + '. Findings were regenerated from the local catalog; review and confirm again.';
            return snapshot();
        }
        return { snapshot: snapshot, setTarget: setTarget, select: select, acknowledge: acknowledge, next: next, back: back, exportPlan: exportPlan, markDownloadRequested: markDownloadRequested, importPlan: importPlan };
    }
    return { create: create, maxImportBytes: MAX_IMPORT_BYTES };
}));
