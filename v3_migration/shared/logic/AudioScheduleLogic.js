/**
 * AudioScheduleLogic.js
 *
 * Shared logic for the Station Schedule ("Audio Schedule") node and Audio Output.
 * Pure calculations only - used by both the frontend plugins and the backend engine.
 *
 * Row format:
 *   { id, days: [0-6] (empty = every day, 0 = Sunday), start: "HH:MM", end: "HH:MM",
 *     speakers: ["media_player.x"], stationIndex, volume (0-100), ttsVolume (0-100 | null) }
 *
 * Program format (what the schedule sends to Audio Output):
 *   { speakers: { "media_player.x": { rowId, occurrence, stationIndex, name, url, volume, ttsVolume, key } } }
 * Speakers not listed should not be playing a scheduled station.
 */

(function(exports) {
    'use strict';

    function parseTime(value) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
    }

    function clampPercent(value, fallback) {
        const number = Number(value);
        if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return fallback;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function runsOnDay(row, day) {
        return !Array.isArray(row.days) || row.days.length === 0 || row.days.includes(day);
    }

    /**
     * Returns the date key of the occurrence that is active now, or null when the row is inactive.
     * Start == end means the row runs all day. Start > end runs overnight into the next day.
     */
    function getActiveOccurrence(row, now = new Date()) {
        if (!row) return null;
        const start = parseTime(row.start);
        const end = parseTime(row.end);
        if (start === null || end === null) return null;

        const minutes = now.getHours() * 60 + now.getMinutes();
        const today = now.getDay();

        if (start === end) return runsOnDay(row, today) ? dateKey(now) : null;
        if (start < end) {
            return minutes >= start && minutes < end && runsOnDay(row, today) ? dateKey(now) : null;
        }
        if (minutes >= start && runsOnDay(row, today)) return dateKey(now);
        if (minutes < end) {
            const yesterday = new Date(now.getTime());
            yesterday.setDate(yesterday.getDate() - 1);
            if (runsOnDay(row, yesterday.getDay())) return dateKey(yesterday);
        }
        return null;
    }

    function isLegacySchedule(entries) {
        return Array.isArray(entries) && entries.some(entry => entry && entry.time !== undefined && entry.start === undefined);
    }

    /**
     * Converts the old "start time only" schedule into rows that end when the next entry starts.
     * Converted rows have no speakers, so they keep driving the legacy Station #/Volume outputs.
     */
    function migrateLegacySchedule(entries) {
        if (!isLegacySchedule(entries)) return Array.isArray(entries) ? entries : [];
        const sorted = entries
            .filter(entry => entry && parseTime(entry.time) !== null)
            .sort((a, b) => parseTime(a.time) - parseTime(b.time));
        return sorted.map((entry, index) => ({
            id: `row_${index + 1}`,
            days: [],
            start: entry.time,
            end: sorted[(index + 1) % sorted.length].time,
            speakers: [],
            stationIndex: entry.stationIndex ?? 0,
            volume: clampPercent(entry.volume, 50),
            ttsVolume: null
        }));
    }

    /**
     * Builds the per-speaker program for the current time. Later (lower) rows win for the same speaker.
     * The key changes when a new occurrence starts or the station changes, but not for volume-only edits.
     */
    function buildAudioProgram(rows, stations, now = new Date()) {
        const speakers = {};
        const stationList = Array.isArray(stations) ? stations : [];

        (Array.isArray(rows) ? rows : []).forEach((row, index) => {
            if (!row || !Array.isArray(row.speakers) || row.speakers.length === 0) return;
            const occurrence = getActiveOccurrence(row, now);
            if (!occurrence) return;
            const station = stationList[row.stationIndex];
            if (!station || !station.url) return;

            const rowId = row.id || `row_${index + 1}`;
            const entry = {
                rowId,
                occurrence,
                stationIndex: row.stationIndex,
                name: station.name || '',
                url: station.url,
                volume: clampPercent(row.volume, 50),
                ttsVolume: clampPercent(row.ttsVolume, null),
                key: `${rowId}@${occurrence}|${station.url}`
            };
            row.speakers.forEach(speakerId => {
                if (speakerId) speakers[speakerId] = { ...entry };
            });
        });

        return { speakers };
    }

    /**
     * Station #/Volume outputs for graphs wired the old way. Prefers the lowest active row
     * without speakers, then the lowest active row of any kind.
     */
    function getLegacyStationOutput(rows, now = new Date()) {
        let active = null;
        let activeUnassigned = null;
        (Array.isArray(rows) ? rows : []).forEach(row => {
            if (!getActiveOccurrence(row, now)) return;
            active = row;
            if (!Array.isArray(row.speakers) || row.speakers.length === 0) activeUnassigned = row;
        });
        const chosen = activeUnassigned || active;
        if (!chosen) return { station: null, volume: null };
        return { station: chosen.stationIndex ?? 0, volume: clampPercent(chosen.volume, 50) };
    }

    // Export for both Node.js and browser
    exports.parseScheduleTime = parseTime;
    exports.getActiveOccurrence = getActiveOccurrence;
    exports.isLegacySchedule = isLegacySchedule;
    exports.migrateLegacySchedule = migrateLegacySchedule;
    exports.buildAudioProgram = buildAudioProgram;
    exports.getLegacyStationOutput = getLegacyStationOutput;

})(typeof exports !== 'undefined' ? exports : (window.T2SharedLogic = window.T2SharedLogic || {}));
