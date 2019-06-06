"use strict"

var vm             = null;
var audioInputIds  = null;
var audioOutputIds = null;
var videoInputIds  = null;
var videoOutputIds = null;
var settings       = {};
var storage        = null;
var windowMain     = null;
var windowMovie    = null;
var globalPps      = 15.00;

function pad(n, width, z) {
    z = z || '0';
    n = parseInt(n) + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function dateForFilename(date) {
    var str =
        pad(date.getFullYear(),  4) + "-" +
        pad(date.getMonth() + 1, 2) + "-" +
        pad(date.getDate(),      2) + "-" +
        pad(date.getHours(),     2) + "-" +
        pad(date.getMinutes(),   2) + "-" +
        pad(date.getSeconds(),   2);
    return str;
}

function addMessageListener() {
    window.addEventListener('message', function(event) {
        if (event.origin != location.origin && event.origin != 'null')
            return;
        var data = JSON.parse(event.data);
        var func = 'message' +
            data.func.charAt(0).toUpperCase() +
            data.func.slice(1);
        if (func in vm && typeof(vm[func]) == 'function')
            vm[func](data.data, event);
    }, false);
};

function postMessageFunc(win, func, data) {
    if (win == null)
        return;
    var origin = (location.origin === 'file://') ? '*' : location.origin;
    win.postMessage(
        JSON.stringify({ func: func, data: data }), origin);
}

function deviceIdArray(devices, kind) {
    return devices.filter(x => x.kind == kind).map(x => ({
        label:   x.label,
        id:      x.deviceId,
        labelId: x.label + ' (' + x.deviceId + ')'
    }));
};

var blankDevice = {
    label:   null,
    id:      'default',
    labelId: 'default'
};
function getDeviceIdByLabel(list, label) {
    if (list == null)
        return blankDevice;
    if (label == null)
        return blankDevice;

    var needleShort = label.toLowerCase();
    for (var i = 0; i < list.length; i++) {
        var device = list[i];
        var labelShort = device.label.toLowerCase();
        if (labelShort.indexOf(needleShort) == 0)
            return device;
    }
    console.log("Label '" + label + "' not found - returning 'default'.");
    return blankDevice;
}

function deviceIdObs(listName, obsName) {
    if (!(listName in settings))
        settings[listName] = {};
    var settingsList = settings[listName];
    var saved  = (obsName in settingsList) ? settingsList[obsName] : null;
    var list   = (listName in window) ? window[listName] : null;
    var device = getDeviceIdByLabel(list, saved);
    var obs    = ko.observable(device.id);

    settingsList[obsName] = device.label;
    obs.subscribe(function(newValue) {
        var oldValue = obs();
        var oldLabel = settingsList[obsName];
        var newLabel = null;
        for (var key in list)
            if (list[key].id == newValue) {
                newLabel = list[key].label;
                break;
            }
        if (oldLabel == newLabel)
            return;
        settingsList[obsName] = newLabel;
    });
    return obs;
}

function saveSettings() {
    if (storage == null)
        return false;
    console.log("Saving settings.");
    localStorage.setItem("settings", JSON.stringify(settings));
    return true;
}

function loadSettings() {
    if (storage == null)
        return false;
    console.log("Loading settings.");
    var newSettings = localStorage.getItem("settings");
    if (newSettings == null) {
        console.log("No settings - using default.");
        return false;
    }
    settings = JSON.parse(newSettings);

    // TODO: do something with settings!
    return true;
}

function secsToTimestamp(totalSecs) {
    var hours = Math.floor(totalSecs / 3600.00);
    totalSecs %= 3600.00;
    var minutes = Math.floor(totalSecs / 60.00);
    totalSecs %= 60.00;
    var secs = Math.floor(totalSecs);
    totalSecs = (totalSecs % 1.00) * 1000;
    var msecs = Math.round(totalSecs);
    if (msecs >= 1000)
        msecs = 999;

    return pad(hours,   2, '0') + ':'
         + pad(minutes, 2, '0') + ':'
         + pad(secs,    2, '0') + '.'
         + pad(msecs,   3, '0');
}

function timestampToSecs(str) {
    var colons = (str.match(/:/g) || []).length;

    var secs = 0.00;
    while (colons >= 0 && str != null) {
        var segment = null;
        var nextStr = null;
        var nextColon = str.indexOf(':');

        if (nextColon >= 0) {
            nextStr = str.substring(nextColon + 1);
            segment = str.substring(0, nextColon).trim();
        }
        else
            segment = str.trim();

        var num = (colons == 0) ? parseFloat(segment) : parseInt(segment);
        var mult = 0.00;
        switch (colons) {
            case 3: mult = 3600.00 * 24; break;
            case 2: mult = 3600.00; break;
            case 1: mult = 60.00;   break;
            case 0: mult = 1.00;    break;
        }
        secs += num * mult;

        str = nextStr;
        colons--;
    }
    return secs;
}

function CueArea(elementIn, cuesIn) {
    var self = this;
    self.element = elementIn;
    self.cues    = cuesIn;
    self.pps     = globalPps;

    self.lastCue = function() {
        var cues = ko.unwrap(self.cues);
        if (cues.length == 0)
            return null;
        return cues[cues.length - 1];
    };

    self.draw = function() {
        var svg     = d3.select(self.element).select('.cue-svg');
        var lastCue = self.lastCue();
        var width   = self.element.clientWidth;
        var height  = lastCue.timestamp * self.pps + 40;
        svg.style('height', height + 'px');

        var h = function(y) { return y * self.pps + 15; };

        var cues = self.cues;
        var p = svg
            .selectAll('rect.cueline').data(cues, d => d.timestamp);
        p.enter()
            .append('rect')
            .attr('class', 'cueline')
            .style('stroke', '#333')
            .attr('x', 0)
            .attr('y', d => h(d.timestamp) - 6)
            .attr('width', width)
            .attr('height', 1)
            .merge(p);
        p.exit()
            .remove();

        var p = svg
            .selectAll('text.cuetime').data(cues, d=> d.timestamp);
        p.enter()
            .append('text')
            .attr('class', 'cuetime')
            .text(d => secsToTimestamp(d.timestamp))
            .attr('x', 5)
            .attr('y', d => h(d.timestamp))
            .attr('font-family', 'sans-serif')
            .attr('font-size', '16px')
            .style('fill', '#888')
            .merge(p);

        var p = svg
            .selectAll('text.cuelabel').data(cues, d=> d.timestamp);
        p.enter()
            .append('text')
            .attr('class', 'cuelabel')
            .text(d => d.label)
            .attr('x', 120)
            .attr('y', d => h(d.timestamp))
            .attr('font-family', 'sans-serif')
            .attr('font-size', '16px')
            .style('fill', '#fff')
            .merge(p);
    }
    self.queueDraw = function()
        { return setTimeout(function() { self.draw(); }, 0); };
    self.queueDraw();
}

ko.bindingHandlers.cuearea = {
    init: function(element, valueAccessor, allBindings, vm, context) {
        var value = ko.unwrap(valueAccessor());
        var cuearea = new CueArea(element, value);

        var innerContext = context.extend({ '_cue': cuearea });
        ko.applyBindingsToDescendants(innerContext, element);

        var resizeEvent = function() { cuearea.queueDraw(); };
        window.addEventListener('resize', resizeEvent);

        ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
            window.removeEventListener('resize', resizeEvent);
        });
        return { controlsDescendantBindings: true };
    }
}
