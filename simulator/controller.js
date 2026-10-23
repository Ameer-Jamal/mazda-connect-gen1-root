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
        var wrappers = null;
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

        function printable(message) {
            var value;
            try { value = String(message); } catch (ignored) { value = '[unprintable message]'; }
            return value.length > 4096 ? value.slice(0, 4082) + ' [truncated]' : value;
        }

        function errorText(error) {
            try { return error && error.message ? printable(error.message) : printable(error); }
            catch (ignored) { return '[unprintable error]'; }
        }

        function notify() {
            try { onChange(snapshot()); }
            catch (error) {
                generation += 1;
                cancelTimers();
                if (state !== 'closed') { state = 'error'; }
                operation = null;
                restoreLogging();
                append('error', 'Observer failed; operation stopped: ' + errorText(error));
                // Do not recursively call the failing observer.
            }
        }

        function append(level, message) {
            entries.push({ level: level, message: printable(message) });
            if (entries.length > 200) { entries.shift(); }
        }

        function cancelTimers() {
            var pending = timers;
            timers = [];
            pending.forEach(function (id) {
                try { scheduler.clearTimeout(id); }
                catch (error) { append('warn', 'Timer cancellation failed; session invalidation still blocks its callback: ' + errorText(error)); }
            });
        }

        function fail(error) {
            generation += 1;
            cancelTimers();
            if (state !== 'closed') { state = 'error'; }
            operation = null;
            append('error', errorText(error));
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
                        if (session !== generation || state !== 'running') { return; }
                        timers.push(scheduler.setTimeout(function () { next(index + 1); }, 7000));
                    }
                } catch (error) { fail(error); }
            }
            next(0);
            return state !== 'error';
        }

        function restoreLogging() {
            if (originals) {
                var target = logger;
                var saved = originals;
                var owned = wrappers;
                // Deactivate capture even if an external owner made a method non-writable.
                originals = null;
                logger = null;
                wrappers = null;
                levels.forEach(function (level) {
                    var descriptor;
                    if (!owned[level]) { return; }
                    try {
                        descriptor = Object.getOwnPropertyDescriptor(target, level);
                        if (!descriptor || descriptor.value !== owned[level]) {
                            append('warn', 'Preserved external logging change: ' + level);
                            return;
                        }
                        target[level] = saved[level];
                    } catch (error) {
                        append('warn', 'Could not restore mock logger ' + level + '; capture disabled, original forwarding retained: ' + errorText(error));
                    }
                });
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
                state = 'closed';
                cancelTimers();
                restoreLogging();
                operation = null;
                append('warn', 'Overlay closed; pending steps invalidated. Commands already sent cannot be undone.');
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
                var candidate;
                var saved = {};
                if (state === 'closed' || state === 'running' || originals) { return false; }
                try {
                    candidate = adapter && adapter.log;
                    levels.forEach(function (level) {
                        var descriptor = candidate && Object.getOwnPropertyDescriptor(candidate, level);
                        if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable) {
                            throw new Error('Mock logger unavailable or not an own writable function: ' + level);
                        }
                        saved[level] = descriptor.value;
                    });
                    logger = candidate;
                    originals = saved;
                    wrappers = {};
                    levels.forEach(function (level) {
                        var original = originals[level];
                        var target = logger;
                        var wrapped = function (message) {
                            var descriptor = Object.getOwnPropertyDescriptor(target, level);
                            if (!descriptor || descriptor.value !== wrapped) { return; }
                            if (state !== 'closed' && originals === saved && logger === target) {
                                append(level, message);
                                notify();
                            }
                            // If restoration was externally blocked, forwarding remains usable.
                            return original.apply(target, arguments);
                        };
                        wrappers[level] = wrapped;
                        logger[level] = wrapped;
                    });
                    append('info', 'Mock UI logs enabled. Original functions will be restored on close.');
                    notify();
                    return state !== 'error';
                } catch (error) {
                    restoreLogging();
                    return fail(error);
                }
            }
        };
    }

    return { create: create };
}));
