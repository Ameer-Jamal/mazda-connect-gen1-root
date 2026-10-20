(function () {
    'use strict';
    var adapter = ConnectLabMock.create();
    var pending = null;
    var trigger = null;
    var dialog = document.getElementById('confirmation');
    var list = document.getElementById('entries');
    var controls = ['terminal', 'region', 'restart', 'logging'];
    var controller = ConnectLabController.create({
        adapter: adapter,
        scheduler: {
            setTimeout: function (callback, delay) { return window.setTimeout(callback, delay); },
            clearTimeout: function (id) { window.clearTimeout(id); }
        },
        onChange: render
    });

    function render(snapshot) {
        var closed = snapshot.state === 'closed';
        document.getElementById('overlay').hidden = closed;
        document.getElementById('closed-panel').hidden = !closed;
        document.getElementById('state').textContent = snapshot.state === 'running' ? 'Running: ' + snapshot.operation : snapshot.state.charAt(0).toUpperCase() + snapshot.state.slice(1);
        controls.forEach(function (id) {
            document.getElementById(id).disabled = closed || snapshot.state === 'running' || (id === 'logging' && snapshot.logging);
        });
        document.getElementById('sample').disabled = closed || !snapshot.logging || snapshot.state === 'running';
        while (list.firstChild) { list.removeChild(list.firstChild); }
        snapshot.entries.forEach(function (entry, index) {
            var item = document.createElement('li');
            var number = document.createElement('span');
            var message = document.createElement('span');
            number.className = 'entry-number';
            number.textContent = ('0' + (index + 1)).slice(-3);
            message.textContent = entry.message;
            item.className = 'entry ' + entry.level;
            item.appendChild(number);
            item.appendChild(message);
            list.appendChild(item);
        });
        list.scrollTop = list.scrollHeight;
        document.getElementById('count').textContent = snapshot.entries.length + ' / 200 entries';
    }

    function confirmAction(id, title, description, action) {
        document.getElementById(id).addEventListener('click', function () {
            trigger = this;
            pending = action;
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-description').textContent = description;
            dialog.returnValue = '';
            dialog.showModal();
        });
    }

    confirmAction('terminal', 'Simulate terminal navigation?', 'Requests SelectDiagnostics, then ActivateJCITest, then ReadDTC test 11. The real diagnostic behavior and its side effects have not been validated.', controller.terminal);
    confirmAction('region', 'Simulate a UI region change?', 'Sets the mock UI region to Europe. This does not model firmware conversion, radio configuration, or persistent changes.', controller.region);
    confirmAction('restart', 'Simulate a reboot?', 'Shows a mock fatal-error request, then a mock restart request after seven seconds. A real restart could interrupt infotainment functions.', controller.restart);
    dialog.addEventListener('keydown', function (event) {
        var first = dialog.querySelector('button[value="cancel"]');
        var last = document.getElementById('confirm-run');
        if (event.key === 'Tab' && !event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        } else if (event.key === 'Tab' && event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
    });
    dialog.addEventListener('close', function () {
        var action = pending;
        pending = null;
        if (dialog.returnValue === 'run' && action) { action(); }
        if (trigger && !trigger.disabled) { trigger.focus(); }
        else { document.getElementById('close').focus(); }
        trigger = null;
    });
    document.getElementById('logging').addEventListener('click', function () { controller.enableLogging(); });
    document.getElementById('sample').addEventListener('click', function () {
        adapter.log.info('Mock log: <sample> is displayed as text, never HTML.');
    });
    document.getElementById('close').addEventListener('click', function () {
        controller.close();
        document.getElementById('reopen').focus();
    });
    document.getElementById('reopen').addEventListener('click', function () {
        controller.open();
        document.getElementById('terminal').focus();
    });
    controller.open();
}());
