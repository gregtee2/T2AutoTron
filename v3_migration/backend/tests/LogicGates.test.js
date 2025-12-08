// LogicGates.test.js - Tests for logic gate functions

const LogicGates = require('./utils/LogicGates');

describe('LogicGates', () => {

    // =========================================================================
    // AND Gate
    // =========================================================================
    describe('and', () => {
        test('returns TRUE when all inputs are true', () => {
            expect(LogicGates.and([true, true])).toBe(true);
            expect(LogicGates.and([true, true, true])).toBe(true);
            expect(LogicGates.and([true])).toBe(true);
        });

        test('returns FALSE when any input is false', () => {
            expect(LogicGates.and([true, false])).toBe(false);
            expect(LogicGates.and([false, true])).toBe(false);
            expect(LogicGates.and([true, true, false])).toBe(false);
        });

        test('returns FALSE when all inputs are false', () => {
            expect(LogicGates.and([false, false])).toBe(false);
            expect(LogicGates.and([false, false, false])).toBe(false);
        });

        test('returns FALSE for empty array', () => {
            expect(LogicGates.and([])).toBe(false);
        });

        test('returns FALSE for null/undefined', () => {
            expect(LogicGates.and(null)).toBe(false);
            expect(LogicGates.and(undefined)).toBe(false);
        });

        test('treats truthy values as true', () => {
            expect(LogicGates.and([1, "yes", true])).toBe(true);
        });

        test('treats falsy values as false', () => {
            expect(LogicGates.and([true, 0])).toBe(false);
            expect(LogicGates.and([true, ""])).toBe(false);
        });
    });

    // =========================================================================
    // OR Gate
    // =========================================================================
    describe('or', () => {
        test('returns TRUE when any input is true', () => {
            expect(LogicGates.or([true, false])).toBe(true);
            expect(LogicGates.or([false, true])).toBe(true);
            expect(LogicGates.or([false, false, true])).toBe(true);
        });

        test('returns TRUE when all inputs are true', () => {
            expect(LogicGates.or([true, true])).toBe(true);
        });

        test('returns FALSE when all inputs are false', () => {
            expect(LogicGates.or([false, false])).toBe(false);
            expect(LogicGates.or([false])).toBe(false);
        });

        test('returns FALSE for empty array', () => {
            expect(LogicGates.or([])).toBe(false);
        });

        test('returns FALSE for null/undefined', () => {
            expect(LogicGates.or(null)).toBe(false);
            expect(LogicGates.or(undefined)).toBe(false);
        });
    });

    // =========================================================================
    // XOR Gate
    // =========================================================================
    describe('xor', () => {
        test('returns TRUE when exactly one input is true', () => {
            expect(LogicGates.xor([true, false])).toBe(true);
            expect(LogicGates.xor([false, true])).toBe(true);
            expect(LogicGates.xor([false, false, true])).toBe(true);
        });

        test('returns FALSE when multiple inputs are true', () => {
            expect(LogicGates.xor([true, true])).toBe(false);
            expect(LogicGates.xor([true, true, false])).toBe(false);
            expect(LogicGates.xor([true, true, true])).toBe(false);
        });

        test('returns FALSE when no inputs are true', () => {
            expect(LogicGates.xor([false, false])).toBe(false);
            expect(LogicGates.xor([false])).toBe(false);
        });

        test('returns FALSE for empty array', () => {
            expect(LogicGates.xor([])).toBe(false);
        });
    });

    // =========================================================================
    // NOT Gate
    // =========================================================================
    describe('not', () => {
        test('inverts true to false', () => {
            expect(LogicGates.not(true)).toBe(false);
        });

        test('inverts false to true', () => {
            expect(LogicGates.not(false)).toBe(true);
        });

        test('inverts truthy values', () => {
            expect(LogicGates.not(1)).toBe(false);
            expect(LogicGates.not("hello")).toBe(false);
        });

        test('inverts falsy values', () => {
            expect(LogicGates.not(0)).toBe(true);
            expect(LogicGates.not("")).toBe(true);
            expect(LogicGates.not(null)).toBe(true);
        });
    });

    // =========================================================================
    // NAND Gate (NOT AND)
    // =========================================================================
    describe('nand', () => {
        test('returns FALSE when all inputs are true', () => {
            expect(LogicGates.nand([true, true])).toBe(false);
        });

        test('returns TRUE when any input is false', () => {
            expect(LogicGates.nand([true, false])).toBe(true);
            expect(LogicGates.nand([false, false])).toBe(true);
        });
    });

    // =========================================================================
    // NOR Gate (NOT OR)
    // =========================================================================
    describe('nor', () => {
        test('returns TRUE when all inputs are false', () => {
            expect(LogicGates.nor([false, false])).toBe(true);
        });

        test('returns FALSE when any input is true', () => {
            expect(LogicGates.nor([true, false])).toBe(false);
            expect(LogicGates.nor([true, true])).toBe(false);
        });
    });

    // =========================================================================
    // Comparison Operations
    // =========================================================================
    describe('compare', () => {
        describe('equal', () => {
            test('returns true for equal values', () => {
                expect(LogicGates.compare.equal(5, 5)).toBe(true);
                expect(LogicGates.compare.equal("a", "a")).toBe(true);
            });

            test('returns false for unequal values', () => {
                expect(LogicGates.compare.equal(5, 6)).toBe(false);
                expect(LogicGates.compare.equal(5, "5")).toBe(false); // strict equality
            });
        });

        describe('notEqual', () => {
            test('returns true for unequal values', () => {
                expect(LogicGates.compare.notEqual(5, 6)).toBe(true);
            });

            test('returns false for equal values', () => {
                expect(LogicGates.compare.notEqual(5, 5)).toBe(false);
            });
        });

        describe('greater', () => {
            test('returns true when a > b', () => {
                expect(LogicGates.compare.greater(10, 5)).toBe(true);
            });

            test('returns false when a <= b', () => {
                expect(LogicGates.compare.greater(5, 5)).toBe(false);
                expect(LogicGates.compare.greater(3, 5)).toBe(false);
            });
        });

        describe('greaterOrEqual', () => {
            test('returns true when a >= b', () => {
                expect(LogicGates.compare.greaterOrEqual(10, 5)).toBe(true);
                expect(LogicGates.compare.greaterOrEqual(5, 5)).toBe(true);
            });

            test('returns false when a < b', () => {
                expect(LogicGates.compare.greaterOrEqual(3, 5)).toBe(false);
            });
        });

        describe('less', () => {
            test('returns true when a < b', () => {
                expect(LogicGates.compare.less(3, 5)).toBe(true);
            });

            test('returns false when a >= b', () => {
                expect(LogicGates.compare.less(5, 5)).toBe(false);
                expect(LogicGates.compare.less(10, 5)).toBe(false);
            });
        });

        describe('lessOrEqual', () => {
            test('returns true when a <= b', () => {
                expect(LogicGates.compare.lessOrEqual(3, 5)).toBe(true);
                expect(LogicGates.compare.lessOrEqual(5, 5)).toBe(true);
            });

            test('returns false when a > b', () => {
                expect(LogicGates.compare.lessOrEqual(10, 5)).toBe(false);
            });
        });
    });
});
