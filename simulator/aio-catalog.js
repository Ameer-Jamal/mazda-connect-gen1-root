/* Independently written source index; no AIO executable code or assets are included. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.ConnectLabAIO = factory(); }
}(this, function () {
    'use strict';
    var provenance = {
    "repository": "https://github.com/Trevelopment/MZD-AIO",
    "commit": "409c724ed860497b2a34f9367cb4a019287846ea",
    "release": "v2.8.6",
    "releaseDate": "2020-04-08",
    "sourceDate": "2024-01-22",
    "license": "GPL-3.0-or-later (project LICENSE notice; component review pending)"
};
    var catalog = [
    {
        "id": "background",
        "name": "Background image",
        "category": "Appearance",
        "summary": "Replace the infotainment background.",
        "path": "app/files/tweaks/00_background.txt",
        "note": "Asset formats and resolution need review."
    },
    {
        "id": "background-rotator",
        "name": "Rotating backgrounds",
        "category": "Appearance",
        "summary": "Rotate a collection of background images.",
        "path": "app/files/tweaks/00_bgrotator-i.txt",
        "note": "Adds background rotation code; resource use needs review."
    },
    {
        "id": "album-art",
        "name": "Album art layout / hide art",
        "category": "Appearance",
        "summary": "Change album-art layout, with an option to hide artwork.",
        "path": "app/files/tweaks/14_bgart-i.txt",
        "note": "Hiding art changes presentation; it does not stop Gracenote."
    },
    {
        "id": "album-frame",
        "name": "Blank album-art frame",
        "category": "Appearance",
        "summary": "Change the empty artwork frame.",
        "path": "app/files/tweaks/16_blnkframe-i.txt",
        "note": "Separate from disabling album-art lookup."
    },
    {
        "id": "gracenote",
        "name": "Disable Gracenote process",
        "category": "Audio",
        "summary": "Stop the Gracenote server using a polling script.",
        "path": "app/files/tweaks/config/disable_gracenote/kill_gn.sh",
        "note": "Process-level change. This script alone is not an installer; startup and restoration need review."
    },
    {
        "id": "boot-animation",
        "name": "Boot animation",
        "category": "Appearance",
        "summary": "Replace the startup animation.",
        "path": "app/files/tweaks/13_boot-i.txt",
        "note": "Startup assets and available storage need review."
    },
    {
        "id": "status-date",
        "name": "Status-bar date",
        "category": "Appearance",
        "summary": "Add date information to the status bar.",
        "path": "app/files/tweaks/20_date-iv3.3.txt",
        "note": "Date format and target layout need review."
    },
    {
        "id": "menu-loop",
        "name": "Main menu loop",
        "category": "Navigation",
        "summary": "Wrap main-menu navigation at the ends.",
        "path": "app/files/tweaks/05_mainloop-i.txt",
        "note": "Changes navigation code."
    },
    {
        "id": "list-loop",
        "name": "List navigation loop",
        "category": "Navigation",
        "summary": "Change list wrapping behavior.",
        "path": "app/files/tweaks/06_listloop-i.txt",
        "note": "List controls vary with firmware."
    },
    {
        "id": "shorter-delay",
        "name": "Shorter transition delay",
        "category": "Navigation",
        "summary": "Shorten interface transition delays.",
        "path": "app/files/tweaks/07_shorterdelay-i.txt",
        "note": "Timing changes need interaction testing."
    },
    {
        "id": "audio-order",
        "name": "Audio source order",
        "category": "Audio",
        "summary": "Reorder the audio source list.",
        "path": "app/files/tweaks/09_audioorder-i.txt",
        "note": "Source availability and existing integration need review."
    },
    {
        "id": "pause-mute",
        "name": "Pause on mute",
        "category": "Audio",
        "summary": "Change playback behavior when muting.",
        "path": "app/files/tweaks/10_pausemute-i.txt",
        "note": "Playback and call interactions need review."
    },
    {
        "id": "message-replies",
        "name": "Remove message replies",
        "category": "Navigation",
        "summary": "Modify the predefined message reply list.",
        "path": "app/files/tweaks/11_msgreplies-i.txt",
        "note": "The supplied video reports using a factory reset; a reset can erase settings."
    },
    {
        "id": "speedometer",
        "name": "Speedometer / telemetry",
        "category": "Apps",
        "summary": "Add an infotainment speedometer with configurable readings.",
        "path": "app/files/tweaks/19_speedo-i1.txt",
        "note": "A software display, not a replacement for the vehicle instruments. Signal availability and units need validation."
    },
    {
        "id": "video-player",
        "name": "Video player",
        "category": "Apps",
        "summary": "Add a local video player.",
        "path": "app/files/tweaks/17_videoplayer-i.txt",
        "note": "Distraction-sensitive feature; playback restrictions need review."
    },
    {
        "id": "castscreen",
        "name": "Screen casting",
        "category": "Apps",
        "summary": "Add a phone screen-casting receiver.",
        "path": "app/files/tweaks/24_castscreen-i.txt",
        "note": "Requires a separate phone setup; distraction and resource use need review."
    },
    {
        "id": "android-auto",
        "name": "Community Android Auto",
        "category": "Apps",
        "summary": "Install the community headunit app.",
        "path": "app/files/tweaks/25_androidauto-i.txt",
        "note": "Separate from Mazda factory Android Auto / CarPlay. Existing integration, startup scripts, audio, calls, and GPS need review."
    },
    {
        "id": "usb-audio",
        "name": "USB Audio Mod",
        "category": "Audio",
        "summary": "Replace parts of USB audio behavior and presentation.",
        "path": "app/files/tweaks/26_usbaudiomod-i.txt",
        "note": "The source skips compatibility groups 5 and above; its messages describe v59.00.502+ as incompatible."
    },
    {
        "id": "swapfile",
        "name": "USB swapfile",
        "category": "System",
        "summary": "Add swap backed by a USB drive.",
        "path": "app/files/tweaks/18_swapfile-i.txt",
        "note": "Depends on external storage remaining available; this is not extra physical RAM."
    },
    {
        "id": "touchscreen",
        "name": "Touchscreen while moving",
        "category": "Restrictions",
        "summary": "Change the touchscreen motion restriction.",
        "path": "app/files/tweaks/01_touchscreen-i.txt",
        "note": "Changes a driving restriction; separate review required."
    },
    {
        "id": "disclaimer",
        "name": "Startup disclaimer",
        "category": "Restrictions",
        "summary": "Change startup disclaimer presentation.",
        "path": "app/files/tweaks/02_disclaimer-i.txt",
        "note": "Changes safety messaging; separate review required."
    },
    {
        "id": "camera-warning",
        "name": "Reverse-camera warning",
        "category": "Restrictions",
        "summary": "Change the reverse-camera warning overlay.",
        "path": "app/files/tweaks/03_warning-i.txt",
        "note": "Changes camera safety messaging; separate review required."
    },
    {
        "id": "parking-graphics",
        "name": "Parking sensor graphics",
        "category": "Restrictions",
        "summary": "Change parking sensor graphics presentation.",
        "path": "app/files/tweaks/04_sensor-i.txt",
        "note": "Parking assistance presentation needs separate validation."
    },
    {
        "id": "diagnostic-shortcut",
        "name": "Diagnostic menu shortcut",
        "category": "System",
        "summary": "Shorten the diagnostic-menu activation gesture.",
        "path": "app/files/tweaks/12_diag-i.txt",
        "note": "Access does not establish the safety of downstream diagnostic commands."
    }
];
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function features() { return copy(catalog); }
    function sourceUrl(path) { return provenance.repository + '/blob/' + provenance.commit + '/' + path; }
    function firmwareFinding(value) {
        if (typeof value !== 'string' || value.length > 128) { return 'Full firmware string is missing or invalid. No compatibility conclusion.'; }
        var match = /^(\d{2})\.(\d{2})\.(\d{3})(?:[A-Z])?(?:[ -][A-Z0-9 -]+)?$/i.exec(value.trim());
        if (!match) { return 'Full firmware string is missing or not recognized. No compatibility conclusion.'; }
        var major = Number(match[1]);
        var middle = Number(match[2]);
        var patch = Number(match[3]);
        if (middle !== 0) { return 'Nonstandard firmware numbering. Upstream rejects nonzero middle groups; no compatibility conclusion.'; }
        if (major === 74) { return 'Firmware 74 is not recognized by the pinned AIO compatibility function. The supplied video edits its firmware guard; that is a bypass, not qualification.'; }
        if (major === 70) { return 'Firmware 70 has upstream compatibility branches, not qualification here. The code uses patch 360 as a boundary while its warning says testing only through 352. Exact build review is required.'; }
        if (major === 55 || major === 56 || major === 58 || major === 59) {
            return 'This firmware family appears in the upstream compatibility function. Individual features still have exclusions; no target is qualified here.' + (major === 59 && patch >= 500 ? ' USB Audio Mod is skipped by its source gate for this branch.' : '');
        }
        return 'This firmware family is not recognized by the pinned AIO compatibility function. No target is qualified here.';
    }
    function plan(ids, firmware, generation) {
        if (!Array.isArray(ids) || ids.length > catalog.length) { throw new Error('Invalid feature selection.'); }
        if (typeof firmware !== 'string' || firmware.length > 128) { throw new Error('Invalid firmware field.'); }
        if (['unknown', 'gen1', 'gen2'].indexOf(generation) === -1) { throw new Error('Invalid generation.'); }
        var selected = [];
        var seen = [];
        ids.forEach(function (id) {
            var found = catalog.filter(function (feature) { return feature.id === id; })[0];
            if (!found) { throw new Error('Unknown feature.'); }
            if (seen.indexOf(id) === -1) { selected.push(copy(found)); seen.push(id); }
        });
        return {
            schemaVersion: 1,
            kind: 'aio-research-plan',
            executable: false,
            vehicleAllowed: false,
            generation: generation,
            firmware: firmware,
            finding: generation === 'gen2' ? 'Gen 2 is unsupported by available evidence.' : firmwareFinding(firmware),
            provenance: copy(provenance),
            features: selected,
            unresolved: ['Per-feature firmware and hardware qualification', 'Factory integration and cross-feature conflicts', 'Backups, restoration and power-loss recovery', 'Component licenses and redistribution review'],
            contents: 'Metadata only. No scripts, binaries, vehicle commands, or installation payload.'
        };
    }
    return { features: features, provenance: function () { return copy(provenance); }, sourceUrl: sourceUrl, firmwareFinding: firmwareFinding, plan: plan };
}));
