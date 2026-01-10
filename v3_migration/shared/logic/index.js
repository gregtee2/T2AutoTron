/**
 * index.js
 * 
 * Exports all shared logic modules for backend use.
 * Frontend loads these via a separate loader plugin.
 */

const TimeRangeLogic = require('./TimeRangeLogic');
const AndGateLogic = require('./AndGateLogic');
const DelayLogic = require('./DelayLogic');
const LogicGateLogic = require('./LogicGateLogic');
const ColorLogic = require('./ColorLogic');
const UtilityLogic = require('./UtilityLogic');
const DeviceLogic = require('./DeviceLogic');

module.exports = {
    // Module bundles
    TimeRangeLogic,
    AndGateLogic,
    DelayLogic,
    LogicGateLogic,
    ColorLogic,
    UtilityLogic,
    DeviceLogic,
    
    // Convenience re-exports - Time
    calculateTimeRange: TimeRangeLogic.calculateTimeRange,
    
    // Convenience re-exports - Logic Gates
    calculateAnd: LogicGateLogic.calculateAnd,
    calculateOr: LogicGateLogic.calculateOr,
    calculateNot: LogicGateLogic.calculateNot,
    calculateXor: LogicGateLogic.calculateXor,
    calculateNand: LogicGateLogic.calculateNand,
    calculateNor: LogicGateLogic.calculateNor,
    calculateXnor: LogicGateLogic.calculateXnor,
    calculateImplies: LogicGateLogic.calculateImplies,
    calculateBicond: LogicGateLogic.calculateBicond,
    compare: LogicGateLogic.compare,
    smartCompare: LogicGateLogic.smartCompare,
    checkThreshold: LogicGateLogic.checkThreshold,
    
    // Convenience re-exports - Colors
    hsvToRgb: ColorLogic.hsvToRgb,
    rgbToHsv: ColorLogic.rgbToHsv,
    mixColors: ColorLogic.mixColors,
    
    // Convenience re-exports - Utility
    processCounter: UtilityLogic.processCounter,
    generateRandom: UtilityLogic.generateRandom,
    performMath: UtilityLogic.performMath,
    scaleValue: UtilityLogic.scaleValue,
    processToggle: UtilityLogic.processToggle,
    
    // Convenience re-exports - Delay
    createDelayState: DelayLogic.createDelayState,
    toMilliseconds: DelayLogic.toMilliseconds,
    UNIT_MULTIPLIERS: DelayLogic.UNIT_MULTIPLIERS,
    
    // Convenience re-exports - Device Control
    normalizeHSVInput: DeviceLogic.normalizeHSVInput,
    convertBrightness: DeviceLogic.convertBrightness,
    determineTriggerAction: DeviceLogic.determineTriggerAction,
    buildHAPayload: DeviceLogic.buildHAPayload
};
