"use strict"

var videoElement = $('#video')[0];

function movieVm() {
    var self = this;
    postMessageFunc(windowMain, 'movieAlive');

    self.playing   = ko.observable(false);
    self.inSession = ko.observable(false);

    self.messageSetObs = function(data, event) {
        self[data.name](data.value);
    };

    self.videoUrl = ko.observable();
    self.messageVideoUrl = function(data, event) {
        self.videoUrl(data);
        videoElement.load();
        videoElement.muted = true;
    }
    self.messageVideoPlay = function(data, event) {
        videoElement.currentTime = data.currentTime;
        videoElement.play();
    }
    self.messageVideoPause = function(data, event) {
        if (data.playing) {
            videoElement.currentTime = data.currentTime;
            videoElement.play();
        }
        else {
            videoElement.pause();
        }
    }
    self.messageVideoStop = function(data, event) {
        videoElement.pause();
        if (data != null)
            videoElement.currentTime = data;
    }
    self.messageVideoPosition = function(data, event) {
        videoElement.currentTime = data;
    };

    videoElement.addEventListener('ended', function() {
        self.playing(false);
        self.inSession(false);
    });
};

window.addEventListener('load', function() {
    windowMain  = window.opener;
    windowMovie = window;

    vm = new movieVm();
    ko.applyBindings(vm);
    addMessageListener();
});
