(function () {
    'use strict';
    var selected = [];
    var features = ConnectLabAIO.features();
    var grid = document.getElementById('aio-features');
    var search = document.getElementById('aio-search');
    var category = document.getElementById('aio-category');
    var exportButton = document.getElementById('aio-export');
    var clearButton = document.getElementById('aio-clear');
    var provenance = ConnectLabAIO.provenance();
    document.getElementById('aio-provenance').textContent = 'Source snapshot: ' + provenance.commit.slice(0, 12) + ' (' + provenance.sourceDate + '). Latest published release reviewed: ' + provenance.release + ' (' + provenance.releaseDate + '). Trevor Martin / Trevelopment and the AIO community. Project notice: ' + provenance.license + '. This index is not a port of the installer.';
    function currentPlan() {
        return ConnectLabAIO.plan(selected, document.getElementById('target-firmware').value, document.getElementById('target-generation').value);
    }
    function review() {
        var plan = currentPlan();
        var list = document.getElementById('aio-selected');
        document.getElementById('aio-selection').textContent = selected.length + ' selected · vehicle execution unavailable';
        document.getElementById('aio-firmware').textContent = plan.finding;
        exportButton.disabled = selected.length === 0;
        clearButton.disabled = selected.length === 0;
        while (list.firstChild) { list.removeChild(list.firstChild); }
        plan.features.forEach(function (feature) {
            var item = document.createElement('li');
            item.textContent = feature.name + ' — ' + feature.note;
            list.appendChild(item);
        });
    }
    function render() {
        var query = search.value.toLowerCase().trim();
        var visible = features.filter(function (feature) {
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
            var summary = document.createElement('p');
            var note = document.createElement('p');
            var link = document.createElement('a');
            card.className = 'aio-card';
            input.type = 'checkbox';
            input.checked = selected.indexOf(feature.id) !== -1;
            input.addEventListener('change', function () {
                var index = selected.indexOf(feature.id);
                if (input.checked && index === -1) { selected.push(feature.id); }
                if (!input.checked && index !== -1) { selected.splice(index, 1); }
                review();
            });
            title.textContent = feature.name;
            group.className = 'eyebrow';
            group.textContent = feature.category;
            summary.textContent = feature.summary;
            note.className = 'fine';
            note.textContent = feature.note;
            link.href = ConnectLabAIO.sourceUrl(feature.path);
            link.textContent = 'Read source: ' + feature.name;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            label.appendChild(input);
            label.appendChild(title);
            card.appendChild(group);
            card.appendChild(label);
            card.appendChild(summary);
            card.appendChild(note);
            card.appendChild(link);
            grid.appendChild(card);
        });
        document.getElementById('aio-results').textContent = visible.length + ' of ' + features.length + ' features shown. Selections are retained when filtering.';
    }
    search.addEventListener('input', render);
    category.addEventListener('change', render);
    document.getElementById('target-form').addEventListener('input', review);
    document.getElementById('target-form').addEventListener('change', review);
    clearButton.addEventListener('click', function () { selected = []; render(); review(); search.focus(); });
    exportButton.addEventListener('click', function () {
        var url = URL.createObjectURL(new Blob([JSON.stringify(currentPlan(), null, 2) + '\n'], { type: 'application/json' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = 'aio-research-plan.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    render();
    review();
}());
