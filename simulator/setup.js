(function () {
    'use strict';
    var model = ConnectLabSetup.create();
    var fields = ['generation', 'model', 'year', 'firmware', 'region', 'market'];
    var titles = ['identify-title', 'choose-title', 'review-title', 'save-title', 'remaining-title'];
    var search = document.getElementById('setup-search');
    var category = document.getElementById('setup-category');
    var grid = document.getElementById('setup-features');
    var lastStep = -1;
    function showError(error) { document.getElementById('setup-message').textContent = 'Could not continue: ' + error.message; }
    function readTarget() {
        var target = {};
        fields.forEach(function (field) { target[field] = document.getElementById('setup-' + field).value; });
        return target;
    }
    function choices() {
        var selected = model.snapshot().selected;
        var query = search.value.trim().toLowerCase();
        var visible = ConnectLabAIO.features().filter(function (feature) {
            return (category.value === 'all' || category.value === feature.category) &&
                (feature.name + ' ' + feature.summary + ' ' + feature.note).toLowerCase().indexOf(query) !== -1;
        });
        while (grid.firstChild) { grid.removeChild(grid.firstChild); }
        visible.forEach(function (feature) {
            var card = document.createElement('article');
            var label = document.createElement('label');
            var input = document.createElement('input');
            var title = document.createElement('strong');
            var group = document.createElement('span');
            var description = document.createElement('p');
            var note = document.createElement('p');
            var link = document.createElement('a');
            card.className = 'aio-card';
            group.className = 'eyebrow';
            group.textContent = feature.category;
            input.type = 'checkbox';
            input.checked = selected.indexOf(feature.id) !== -1;
            input.addEventListener('change', function () {
                try { model.select(feature.id, input.checked); render(); }
                catch (error) { showError(error); }
            });
            title.textContent = feature.name;
            description.textContent = feature.summary;
            note.className = 'fine';
            note.textContent = feature.note;
            link.href = ConnectLabAIO.sourceUrl(feature.path);
            link.textContent = 'Read source: ' + feature.name;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            label.appendChild(input); label.appendChild(title);
            card.appendChild(group); card.appendChild(label); card.appendChild(description); card.appendChild(note); card.appendChild(link);
            grid.appendChild(card);
        });
        document.getElementById('setup-results').textContent = visible.length + ' of 24 features shown. Filtering keeps your selections.';
    }
    function review(snapshot) {
        var summary = document.getElementById('setup-summary');
        var list = document.getElementById('setup-selected');
        while (summary.firstChild) { summary.removeChild(summary.firstChild); }
        fields.forEach(function (field) {
            var term = document.createElement('dt');
            var value = document.createElement('dd');
            var names = { generation: 'Generation', model: 'Model / trim', year: 'Year', firmware: 'Full OS version', region: 'Firmware region', market: 'Vehicle market' };
            term.textContent = names[field];
            value.textContent = snapshot.target[field] || 'Unknown';
            if (field === 'generation') { value.textContent = { unknown: 'Not confirmed', gen1: 'Gen 1 / MZD Connect', gen2: 'Gen 2' }[snapshot.target[field]]; }
            summary.appendChild(term); summary.appendChild(value);
        });
        document.getElementById('setup-finding').textContent = snapshot.plan.finding;
        while (list.firstChild) { list.removeChild(list.firstChild); }
        snapshot.plan.features.forEach(function (feature) {
            var item = document.createElement('li');
            var name = document.createElement('strong');
            var note = document.createElement('small');
            name.textContent = feature.name;
            note.textContent = feature.note;
            item.appendChild(name); item.appendChild(note); list.appendChild(item);
        });
        document.getElementById('setup-ack').checked = snapshot.acknowledged;
    }
    function render() {
        var snapshot = model.snapshot();
        var changed = snapshot.step !== lastStep;
        Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (panel) { panel.hidden = Number(panel.getAttribute('data-panel')) !== snapshot.step; });
        Array.prototype.forEach.call(document.querySelectorAll('[data-step]'), function (item) {
            if (Number(item.getAttribute('data-step')) === snapshot.step) { item.setAttribute('aria-current', 'step'); }
            else { item.removeAttribute('aria-current'); }
        });
        document.getElementById('setup-count').textContent = snapshot.selected.length + ' selected · review plan only';
        document.getElementById('setup-message').textContent = snapshot.message;
        document.getElementById('setup-back').disabled = snapshot.step === 0;
        document.getElementById('setup-next').hidden = snapshot.step === 4;
        document.getElementById('setup-next').textContent = snapshot.step === 2 ? 'Continue to plan download' : snapshot.step === 3 ? 'See remaining installation stages' : 'Continue';
        review(snapshot);
        if (changed && snapshot.step === 1) { choices(); }
        if (changed && lastStep !== -1) { document.getElementById(titles[snapshot.step]).focus(); }
        lastStep = snapshot.step;
    }
    document.getElementById('setup-target').addEventListener('submit', function (event) { event.preventDefault(); });
    document.getElementById('setup-next').addEventListener('click', function () {
        try {
            if (model.snapshot().step === 0) { model.setTarget(readTarget()); }
            model.next(); render();
        } catch (error) { showError(error); }
    });
    document.getElementById('setup-back').addEventListener('click', function () { model.back(); render(); });
    search.addEventListener('input', choices);
    category.addEventListener('change', choices);
    document.getElementById('setup-ack').addEventListener('change', function () { model.acknowledge(this.checked); render(); });
    document.getElementById('setup-download').addEventListener('click', function () {
        var url;
        var link;
        try {
            var plan = model.exportPlan();
            if (!window.URL || typeof window.URL.createObjectURL !== 'function' || typeof window.Blob !== 'function') {
                throw new Error('This browser cannot create the plan download. Use a current desktop browser.');
            }
            url = window.URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }));
            link = document.createElement('a');
            link.href = url; link.download = 'mazda-connect-review-plan.json';
            document.body.appendChild(link); link.click();
            model.markDownloadRequested(); render();
        } catch (error) { showError(error); }
        finally {
            if (link && link.parentNode) { link.parentNode.removeChild(link); }
            if (url) { window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000); }
        }
    });
    render();
}());
