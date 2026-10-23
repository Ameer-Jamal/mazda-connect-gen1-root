(function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.ConnectLabMock = factory(); }
}(this, function () {
    'use strict';
    return {
        create: function () {
            var calls = [];
            function record(name, args) {
                calls.push({ method: name, args: Array.prototype.slice.call(args) });
                if (calls.length > 200) { calls.shift(); }
            }
            return {
                kind: 'in-memory-mock',
                calls: calls,
                sendEvent: function () { record('sendEvent', arguments); },
                showFatalError: function () { record('showFatalError', arguments); },
                restart: function () { record('restart', arguments); },
                setRegion: function () { record('setRegion', arguments); },
                log: {
                    error: function () { record('log.error', arguments); },
                    warn: function () { record('log.warn', arguments); },
                    info: function () { record('log.info', arguments); }
                }
            };
        }
    };
}));
