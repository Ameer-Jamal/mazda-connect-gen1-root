/* Research policy only. No hardware-qualified profiles or vehicle execution path. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.ConnectLabCapabilities = factory(); }
}(this, function () {
    'use strict';
    var catalog = [
        { id: 'terminal-navigation', name: 'Terminal entry exploration', category: 'Root research', effect: 'Diagnostic requests; real terminal/root access unverified' },
        { id: 'ui-region-europe', name: 'UI region selection', category: 'Customization', effect: 'Internal UI assignment; persistence and downstream effects unknown' },
        { id: 'reboot', name: 'Infotainment restart', category: 'Session control', effect: 'Disruptive host requests; real recovery unverified' },
        { id: 'ui-logs', name: 'UI log capture', category: 'Troubleshooting', effect: 'Replaces logger methods until cleanup; not a read-only host operation' }
    ];
    var fields = ['generation', 'model', 'year', 'firmware', 'region', 'market', 'hardware'];

    function features() {
        return catalog.map(function (item) {
            return { id: item.id, name: item.name, category: item.category, effect: item.effect };
        });
    }

    function assessTarget(input) {
        var target = {};
        var missing = [];
        var invalid = [];
        input = input || {};
        fields.forEach(function (field) {
            var descriptor = Object.getOwnPropertyDescriptor(input, field);
            var value = descriptor && typeof descriptor.value === 'string' ? descriptor.value.trim() : '';
            if (!value || value === 'unknown') { missing.push(field); target[field] = ''; }
            else if (value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) { invalid.push(field); target[field] = ''; }
            else { target[field] = value; }
        });
        if (target.generation && target.generation !== 'gen1' && target.generation !== 'gen2') { invalid.push('generation'); }
        if (target.year && !/^\d{4}$/.test(target.year)) { invalid.push('year'); }
        var status = invalid.length ? 'invalid' : target.generation === 'gen2' ? 'unsupported' : missing.length ? 'incomplete' : 'unqualified';
        var reason = status === 'invalid' ? 'Correct invalid fields: ' + invalid.join(', ') + '.' :
            status === 'unsupported' ? 'Gen 2 is unsupported by available evidence.' :
            status === 'incomplete' ? 'Missing identification: ' + missing.join(', ') + '.' :
            'Identification recorded. No hardware-qualified configurations exist in this build.';
        return { target: target, status: status, missing: missing, invalid: invalid, vehicleAllowed: false, reason: reason };
    }

    function evaluate(request) {
        var feature;
        var result;
        request = request || {};
        catalog.forEach(function (item) { if (item.id === request.featureId) { feature = item; } });
        if (!feature) { return { allowed: false, code: 'unknown-feature', reason: 'Unknown feature; execution is blocked.' }; }
        if (request.environment === 'desktop-simulation' && request.adapterKind === 'in-memory-mock') {
            return { allowed: true, code: 'mock-only', reason: 'In-memory simulation only. No vehicle qualification is implied.' };
        }
        if (request.environment === 'vehicle') {
            result = assessTarget(request.target);
            return { allowed: false, code: 'vehicle-unavailable', reason: result.reason + ' Vehicle execution is unavailable.' };
        }
        return { allowed: false, code: 'explicit-mock-required', reason: 'Only desktop-simulation with an explicit in-memory-mock adapter is executable.' };
    }

    return { features: features, assessTarget: assessTarget, evaluate: evaluate };
}));
