"use strict"

var videoElement = $('#video')[0];

function mainVm() {
    var self = this;
    var positionAuto = 0;
    var timeUpdate   = 0;

    self.sheets       = ko.observableArray([]);
    self.videoUrl     = ko.observable();
    self.currentSheet = ko.observable();
    self.waitTime     = ko.observable(0.00);
    self.waitEvent    = ko.observable(null);

    loadAllSheets(function(sheets) {
        self.sheets(sheets);
    });

    self.currentSheet.subscribe(function(value) {
        var cues = (value != null) ? value.cues : [];
        var time = (cues.length > 0) ? cues[0].timestamp : 0;

        self.playing(false);
        self.videoUrl(value.url);

        videoElement.load();
        videoElement.muted = true;
        postMessageFunc(windowMovie, 'videoUrl', value.url);

        setTimeout(function(t) { return function() {
            self.currentTime(t);
            videoElement.currentTime = self.currentTime();
        }; } (time), 0);
    });

    self.startTime = ko.computed(function() {
        var currentSheet = self.currentSheet();
        if (currentSheet == null || currentSheet.cues == null || currentSheet.cues.length == 0)
            return 0.00;
        var cues = currentSheet.cues;
        return cues[0].timestamp;
    });

    self.stopTime = ko.computed(function() {
        var currentSheet = self.currentSheet();
        if (currentSheet == null || currentSheet.cues == null || currentSheet.cues.length == 1)
            return 0.00;
        var cues = currentSheet.cues;
        return cues[cues.length - 1].timestamp;
    });

    self.syncWithMovie = function(name) {
        self[name].subscribe(function(value) {
            postMessageFunc(windowMovie, 'setObs',
                { name: name, value: value });
        });
    };

    self.playing          = ko.observable(false);
    self.inSession        = ko.observable(false);
    self.currentTime      = ko.observable(0.00);
    self.currentTimeShort = ko.observable(0.00);
    self.lastStartTime    = ko.observable(0.00);

    self.syncWithMovie('playing');
    self.syncWithMovie('inSession');

    self.playing.subscribe(function(value) {
        self.waitKill();
        if (value == true)
            self.focusSync();
    });
    self.currentTime.subscribe(function(value) {
        self.waitKill();

        var area     = $('#cue-container .cue-area');
        var position = $('#cue-container #play-position');
        if (area[0] == null || position[0] == null)
            return;

        var height    = area[0].clientHeight;
        var maxHeight = height / 2 - 10;
        var maxScroll = area[0].scrollHeight - height;

        var scrollTop = 0;
        var scrollPos = value * globalPps + 14;

        if (scrollPos >= maxHeight) {
            scrollTop = scrollPos - maxHeight;
            scrollPos = maxHeight;
        }
        if (scrollTop >= maxScroll) {
            var diff = scrollTop - maxScroll;
            scrollTop = maxScroll;
            scrollPos += diff;
        }

        area.scrollTop(scrollTop);
        position.css('top', scrollPos + 'px');

        if (positionAuto <= 0) {
            postMessageFunc(windowMovie, 'videoPosition', value);
            videoElement.currentTime = value;
        }

        if (timeUpdate == 0) {
            timeUpdate++;
            self.currentTimeShort(value.toFixed(1));
            timeUpdate--;
        }
    });

    self.currentTimeShort.subscribe(function(value) {
        if (timeUpdate != 0)
            return;
        timeUpdate++;
        self.currentTime(value);
        timeUpdate--;
    });

    self.playStart = function() {
        positionAuto++;
        self.currentTime(self.startTime());
        self.lastStartTime(self.startTime());
        positionAuto--;
        self.playing(true);
        self.inSession(true);
        postMessageFunc(windowMovie, 'videoPlay',
            { currentTime: self.startTime() });
        videoElement.currentTime = self.startTime();
        videoElement.play();
    };
    self.playStartWait = function()
        { self.waitStart(3.00, self.playStart); }

    self.playPause = function() {
        self.playing(!self.playing());
        var play = self.playing();
        var ct = parseFloat(self.currentTime());

        postMessageFunc(windowMovie, 'videoPause', {
            playing: play, currentTime: ct
        });
        videoElement.currentTime = ct;
        if (play) {
            videoElement.play();
            if (!self.inSession()) {
                self.lastStartTime(ct);
                self.inSession(true);
            }
        }
        else
            videoElement.pause();
    };
    self.playPauseWait = function()
        { self.waitStart(3.00, self.playPause); }

    self.playStop = function(t) {
        if (t == null)
            t = 0;
        self.playing(false);
        self.inSession(false);
        videoElement.pause();

        positionAuto++;
        var lastTime = self.lastStartTime();
        if (lastTime != null)
            self.currentTime(self.lastStartTime());
        positionAuto--;

        postMessageFunc(windowMovie, 'videoStop', self.currentTime());
    };

    self.focusSync = function() {
        setTimeout(function() {
            $('#sync-button').focus();
        }, 0);
    }

    self.playSync = function(t) {
        var t = self.currentTime();
        videoElement.currentTime = t;
        postMessageFunc(windowMovie, 'videoPosition', t);
    };

    var lastTime = 0;
    var frameFunc = function(now) {
        var t = (now - lastTime) / 1000.00;
        if (self.playing()) {
            self.waitKill();
            var currentSheet = self.currentSheet();
            if (currentSheet == null) {
                self.currentTime(self.startTime());
                self.playing(false);
                self.inSession(false);
            }
            else {
                var maxTime  = self.stopTime();
                var nextTime = parseFloat(self.currentTime()) + t;
                positionAuto++;
                if (nextTime >= maxTime)
                    self.playStop(maxTime);
                else
                    self.currentTime(nextTime);
                positionAuto--;
            }
        }
        else {
            var waitTime = self.waitTime();
            if (waitTime > 0.00) {
                if (waitTime - t <= 0.00) {
                    var e = self.waitEvent();
                    self.waitKill();
                    e();
                }
                else
                    self.waitTime(waitTime - t);
            }
        }

        lastTime = now;
        requestAnimationFrame(frameFunc);
    };
    requestAnimationFrame(frameFunc);

    videoElement.addEventListener('ended', function() {
        self.playing(false);
        self.inSession(false);
    });

    self.pauseButtonText = ko.computed(function() {
        var playing   = self.playing();
        var inSession = self.inSession();
        if (!playing && !inSession)
            return "Start from position";
        else if (playing)
            return "Pause";
        else
            return "Continue";
    }, self);

    self.waitStart = function(time, event) {
        if (self.playing())
            return;
        self.waitKill();
        self.waitTime(time);
        self.waitEvent(event);
    };
    self.waitKill = function() {
        self.waitTime(0.00);
        self.waitEvent(null);
    };
};

window.addEventListener('load', function() {
    vm = new mainVm();
    ko.applyBindings(vm);
    addMessageListener();

    windowMain  = window;
    windowMovie = window.open('movie.html', 'Silent Movie Tracker - Screen',
        'width=640,height=480,resizable=yes,scrollbars=no,status=no,' +
        'menubar=no,toolbar=no,location=no,top=30,left=30');
});

window.addEventListener('unload', function() {
    if (windowMovie != null && !windowMovie.closed)
        windowMovie.close();
});
