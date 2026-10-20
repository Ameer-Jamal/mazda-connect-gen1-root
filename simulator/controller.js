/* Desktop research logic only. No vehicle adapter is supplied. ES5 syntax. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ConnectLabController = factory();
    }
}(this, function () {
    'use strict';

    function create(options) {
        var adapter = options.adapter;
        var scheduler = options.scheduler;
        var onChange = options.onChange || function () {};
        var state = 'closed';
        var operation = null;
        var entries = [];
        var timers = [];
        var generation = 0;
        var originals = null;
        var logger = null;
        var levels = ['error', 'warn', 'info'];

        function snapshot() {
            return {
                state: state,
                operation: operation,
                logging: originals !== null,
                entries: entries.map(function (entry) {
                    return { level: entry.level, message: entry.message };
                })
            };
        }

        function notify() { onChange(snapshot()); }

        function append(level, message) {
            entries.push({ level: level, message: String(message) });
            if (entries.length > 200) { entries.shift(); }
        }

        function cancelTimers() {
            var pending = timers;
            timers = [];
            pending.forEach(function (id) { scheduler.clearTimeout(id); });
        }

        function fail(error) {
            generation += 1;
            cancelTimers();
            state = 'error';
            operation = null;
            append('error', error && error.message ? error.message : String(error));
            notify();
            return false;
        }

        function requireMethods(names) {
            names.forEach(function (name) {
                if (!adapter || typeof adapter[name] !== 'function') {
                    throw new Error('Mock capability unavailable: ' + name);
                }
            });
        }

        function run(name, methods, steps) {
            var session;
            if (state === 'closed' || state === 'running') { return false; }
            try { requireMethods(methods); } catch (error) { return fail(error); }
            generation += 1;
            session = generation;
            state = 'running';
            operation = name;
            append('info', 'Simulation started: ' + name);
            notify();

            function next(index) {
                if (session !== generation || state !== 'running') { return; }
                try {
                    steps[index].call();
                    if (session !== generation || state !== 'running') { return; }
                    if (index + 1 === steps.length) {
                        timers = [];
                        state = 'complete';
                        operation = null;
                        append('info', 'Simulation complete: ' + name + '. No vehicle outcome was tested.');
                        notify();
                    } else {
                        notify();
                        timers.push(scheduler.setTimeout(function () { next(index + 1); }, 7000));
                    }
                } catch (error) { fail(error); }
            }
            next(0);
            return state !== 'error';
        }

        function restoreLogging() {
            if (originals) {
                levels.forEach(function (level) { logger[level] = originals[level]; });
                originals = null;
                logger = null;
            }
        }

        return {
            snapshot: snapshot,
            open: function () {
                if (state !== 'closed') { return false; }
                generation += 1;
                state = 'idle';
                append('info', 'Offline mock session opened. No vehicle is connected.');
                notify();
                return true;
            },
            close: function () {
                if (state === 'closed') { return false; }
                generation += 1;
                cancelTimers();
                restoreLogging();
                operation = null;
                state = 'closed';
                append('warn', 'Overlay closed; pending steps cancelled. Commands already sent cannot be undone.');
                notify();
                return true;
            },
            terminal: function () {
                return run('Terminal navigation', ['sendEvent'], [
                    { call: function () {
                        adapter.sendEvent('syssettings', 'SelectDiagnostics');
                        append('info', 'Mock event: syssettings / SelectDiagnostics');
                    } },
                    { call: function () {
                        adapter.sendEvent('diag', 'ActivateJCITest');
                        append('info', 'Mock event: diag / ActivateJCITest');
                    } },
                    { call: function () {
                        adapter.sendEvent('diag', 'ReadDTC', { payload: { testId: 11 } });
                        append('info', 'Mock event: diag / ReadDTC, testId 11');
                    } }
                ]);
            },
            restart: function () {
                return run('Reboot', ['showFatalError', 'restart'], [
                    { call: function () { adapter.showFatalError('reboot', 'xss'); } },
                    { call: function () { adapter.restart('XSS'); } }
                ]);
            },
            region: function () {
                return run('UI region selection', ['setRegion'], [
                    { call: function () { adapter.setRegion('Region_Europe'); } }
                ]);
            },
            enableLogging: function () {
                if (state === 'closed' || state === 'running' || originals) { return false; }
                try {
                    logger = adapter && adapter.log;
                    levels.forEach(function (level) {
                        if (!logger || typeof logger[level] !== 'function') {
                            throw new Error('Mock logger unavailable: ' + level);
                        }
                    });
                    originals = { error: logger.error, warn: logger.warn, info: logger.info };
                    levels.forEach(function (level) {
                        var original = originals[level];
                        var target = logger;
                        var wrapped = function (message) {
                            if (state === 'closed' || !originals || logger !== target || target[level] !== wrapped) { return; }
                            append(level, message);
                            notify();
                            return original.apply(target, arguments);
                        };
                        logger[level] = wrapped;
                    });
                    append('info', 'Mock UI logs enabled. Original functions will be restored on close.');
                    notify();
                    return true;
                } catch (error) {
                    restoreLogging();
                    return fail(error);
                }
            }
        };
    }

    return { create: create };
}));
