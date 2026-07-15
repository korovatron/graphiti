const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const workerPath = path.join(__dirname, '..', 'intersection-worker.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    importScripts() {},
    self: {}
};

vm.createContext(sandbox);
vm.runInContext(workerCode, sandbox, { filename: workerPath });

const findImplicitIntersections = sandbox.findImplicitIntersections;
assert.strictEqual(typeof findImplicitIntersections, 'function');

function makeCirclePoints(cx, cy, radius, count = 720) {
    const points = [];
    for (let i = 0; i <= count; i++) {
        const angle = (2 * Math.PI * i) / count;
        points.push({
            x: cx + (radius * Math.cos(angle)),
            y: cy + (radius * Math.sin(angle)),
            connected: true
        });
    }
    return points;
}

function makeLinePoints(m, b = 0, minX = -10, maxX = 10) {
    return [
        { x: minX, y: (m * minX) + b, connected: true },
        { x: maxX, y: (m * maxX) + b, connected: true }
    ];
}

function makeVerticalLinePoints(x, minY = -10, maxY = 10) {
    return [
        { x, y: minY, connected: true },
        { x, y: maxY, connected: true }
    ];
}

function withBreaks(pointSets) {
    return pointSets.flatMap((points, index) =>
        index === 0
            ? points
            : [{ x: NaN, y: NaN, connected: false }, ...points]
    );
}

function distance(point, target) {
    return Math.hypot(point.x - target.x, point.y - target.y);
}

function tangentPointForLineThroughOrigin(m, cx = 3, cy = 2) {
    const a = m;
    const b = -1;
    const signedDistanceNumerator = (a * cx) + (b * cy);
    const denominator = (a * a) + (b * b);
    return {
        x: cx - ((a * signedDistanceNumerator) / denominator),
        y: cy - ((b * signedDistanceNumerator) / denominator)
    };
}

function assertContainsPoint(points, target, tolerance, label) {
    assert(
        points.some(point => distance(point, target) <= tolerance),
        `${label}: expected a point near (${target.x.toFixed(3)}, ${target.y.toFixed(3)}), got ${JSON.stringify(points)}`
    );
}

const circle = {
    id: 1,
    enabled: true,
    points: makeCirclePoints(3, 2, 1)
};

const tangentSlopes = [
    (12 - Math.sqrt(48)) / 16,
    (12 + Math.sqrt(48)) / 16
];

const tangentPair = {
    id: 2,
    enabled: true,
    points: withBreaks(tangentSlopes.map(m => makeLinePoints(m)))
};

const tangentHits = findImplicitIntersections(circle, tangentPair);
assert.strictEqual(tangentHits.length, 2, 'line-pair tangent contacts should produce exactly two intersections');
for (const slope of tangentSlopes) {
    assertContainsPoint(tangentHits, tangentPointForLineThroughOrigin(slope), 0.08, 'tangent contact');
}
assert(tangentHits.every(hit => hit.isTangent), 'tangent contacts should be marked as tangent intersections');

const crossingLine = {
    id: 3,
    enabled: true,
    points: makeVerticalLinePoints(3)
};
const crossingHits = findImplicitIntersections(circle, crossingLine);
assert.strictEqual(crossingHits.length, 2, 'normal crossing line should still produce two intersections');
assertContainsPoint(crossingHits, { x: 3, y: 1 }, 0.02, 'lower crossing');
assertContainsPoint(crossingHits, { x: 3, y: 3 }, 0.02, 'upper crossing');

const shiftedAwayLines = tangentSlopes.map(m => {
    const signedDistanceNumerator = (3 * m) - 2;
    const offset = Math.sign(signedDistanceNumerator) * 0.2 * Math.sqrt((m * m) + 1);
    return makeLinePoints(m, offset);
});
const nearMissPair = {
    id: 4,
    enabled: true,
    points: withBreaks(shiftedAwayLines)
};
const nearMissHits = findImplicitIntersections(circle, nearMissPair);
assert.strictEqual(nearMissHits.length, 0, 'nearby shifted non-intersecting lines should not create false intersections');

console.log('intersection-contact regression tests passed');