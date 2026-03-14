/**
 * FrameBuffer - Ring buffer for camera frames
 * 
 * Stores the last N frames in memory for quick access.
 * Used by both UI (latest frame) and ML pipeline (frame history).
 */

class FrameBuffer {
    constructor(maxFrames = 50) {
        this.maxFrames = maxFrames;
        this.frames = [];
        this.frameCount = 0;
        this.lastFrameTime = null;
    }

    /**
     * Add a frame to the buffer
     * @param {Buffer} frameData - JPEG image data
     * @param {Object} metadata - Optional metadata (timestamp, etc.)
     */
    push(frameData, metadata = {}) {
        const frame = {
            data: frameData,
            timestamp: Date.now(),
            index: this.frameCount++,
            ...metadata
        };

        this.frames.push(frame);
        this.lastFrameTime = frame.timestamp;

        // Remove oldest frames if over limit
        while (this.frames.length > this.maxFrames) {
            this.frames.shift();
        }
    }

    /**
     * Get the latest frame
     * @returns {Object|null} Frame object with data and metadata
     */
    getLatest() {
        if (this.frames.length === 0) return null;
        return this.frames[this.frames.length - 1];
    }

    /**
     * Get the latest N frames (for ML context)
     * @param {number} count - Number of frames to retrieve
     * @returns {Array} Array of frame objects, oldest first
     */
    getRecent(count = 10) {
        const start = Math.max(0, this.frames.length - count);
        return this.frames.slice(start);
    }

    /**
     * Get all frames in buffer
     * @returns {Array} All frames
     */
    getAll() {
        return [...this.frames];
    }

    /**
     * Get buffer statistics
     * @returns {Object} Stats about the buffer
     */
    getStats() {
        const now = Date.now();
        const oldestFrame = this.frames[0];
        const newestFrame = this.frames[this.frames.length - 1];
        
        let fps = 0;
        if (oldestFrame && newestFrame && this.frames.length > 1) {
            const timeSpan = newestFrame.timestamp - oldestFrame.timestamp;
            if (timeSpan > 0) {
                fps = ((this.frames.length - 1) / timeSpan) * 1000;
            }
        }

        return {
            frameCount: this.frames.length,
            maxFrames: this.maxFrames,
            totalFramesReceived: this.frameCount,
            lastFrameTime: this.lastFrameTime,
            lastFrameAge: this.lastFrameTime ? now - this.lastFrameTime : null,
            estimatedFps: Math.round(fps * 10) / 10,
            bufferDuration: oldestFrame && newestFrame 
                ? newestFrame.timestamp - oldestFrame.timestamp 
                : 0,
            memoryUsage: this.frames.reduce((sum, f) => sum + (f.data?.length || 0), 0)
        };
    }

    /**
     * Clear all frames
     */
    clear() {
        this.frames = [];
    }
}

module.exports = FrameBuffer;
