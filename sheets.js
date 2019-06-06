"use strict"

function getNonBlankLines(data) {
    var linesPre = data.replace(/(\r\n|\n|\r)/gm, '\n').split('\n');
    var lines = [];
    for (var i = 0; i < linesPre.length; i++) {
        if (linesPre[i] !== '')
            lines.push(linesPre[i]);
    }
    return lines;
}

function loadSheet(filename, callback) {
    var lineFunc = function(lines, index)
        { return (lines.length <= index) ? '(blank)' : lines[index]; };
    var cuesFunc = function(lines) {
        var cues = [];
        for (var i = 2; i < lines.length; i++) {
            var line = lines[i].trim();
            var space = line.indexOf(' ');
            if (space <= 0)
                continue;

            var timestamp = timestampToSecs(line.substring(0, space));
            var label     = line.substring(space).trim();
            cues.push({
                timestamp: timestamp,
                label:     label
            });
        }
        return cues;
    };
    var movieObjFunc = function(filename, lines, error) {
        var rval = {
            filename: filename,
            lines:    lines,
            title:    lineFunc(lines, 0),
            url:      lineFunc(lines, 1),
            cues:     cuesFunc(lines),
            error:    error
        };
        if (callback != null)
            callback(rval);
    };

    $.ajax({
        url: filename,
        cache: false,
        success: function(data) {
            console.log('   Got sheet: ' + filename);
            var lines = getNonBlankLines(data);
            movieObjFunc(filename, lines, null);
        },
        error: function() {
            console.log('   Couldn\'t get sheet: ' + filename);
            movieObjFunc(filename, [], 'Error');
        }
    });
}

function loadAllSheets(callback) {
    $.ajax({
        url: 'sheets.txt',
        cache: false,
        dataType: 'text',
        success: function(data) {
            var filenames = getNonBlankLines(data);
            var sheetsLeft = filenames.length;
            var rval = new Array(sheetsLeft);

            console.log('Sheet list retrieved. Loading sheets');
            var sheetLoaded = function() {
                sheetsLeft--;
                if (sheetsLeft === 0 && callback != null) {
                    console.log('Done loading sheets');
                    callback(rval);
                }
            };
            var sheetCallbackFunc = function(index) {
                return function(data) {
                    rval[index] = data;
                    sheetLoaded();
                };
            };
            for (var i = 0; i < filenames.length; i++)
                loadSheet(filenames[i], sheetCallbackFunc(i));
        }
    });
}
