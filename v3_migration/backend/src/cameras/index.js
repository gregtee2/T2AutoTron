/**
 * Camera Service - Index/Exports
 */

const cameraService = require('./CameraService');
const CameraWorker = require('./CameraWorker');
const FrameBuffer = require('./FrameBuffer');

module.exports = {
    cameraService,
    CameraWorker,
    FrameBuffer
};
