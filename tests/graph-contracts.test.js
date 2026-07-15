const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const fixtures = require('./graph-fixtures');

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch (error) {
    console.error('Playwright is required for graph contract tests. Run: npm install');
    process.exit(1);
}

const rootDir = path.join(__dirname, '..');
const contentTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.svg', 'image/svg+xml; charset=utf-8']
]);

function startStaticServer() {
    const server = http.createServer((request, response) => {
        const requestUrl = new URL(request.url, 'http://127.0.0.1');
        const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
        const filePath = path.normalize(path.join(rootDir, relativePath));

        if (!filePath.startsWith(rootDir)) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (error, content) => {
            if (error) {
                response.writeHead(404);
                response.end('Not found');
                return;
            }

            response.writeHead(200, {
                'content-type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
                'cache-control': 'no-store'
            });
            response.end(content);
        });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${address.port}/`
            });
        });
    });
}

function approxEqual(actual, expected, tolerance) {
    return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function assertApproxSet(actual, expected, tolerance, label) {
    const actualValues = Array.isArray(actual) ? actual.filter(Number.isFinite) : [];
    const expectedValues = Array.isArray(expected) ? expected : [];

    for (const expectedValue of expectedValues) {
        assert(
            actualValues.some(actualValue => approxEqual(actualValue, expectedValue, tolerance)),
            `${label}: expected ${expectedValue}, got [${actualValues.join(', ')}]`
        );
    }

    assert.strictEqual(
        actualValues.length,
        expectedValues.length,
        `${label}: expected exactly [${expectedValues.join(', ')}], got [${actualValues.join(', ')}]`
    );
}

function assertApproxLines(actual, expected, tolerance, label) {
    const actualLines = Array.isArray(actual) ? actual : [];
    const expectedLines = Array.isArray(expected) ? expected : [];

    for (const expectedLine of expectedLines) {
        assert(
            actualLines.some(actualLine =>
                approxEqual(actualLine.m, expectedLine.m, tolerance.m) &&
                approxEqual(actualLine.b || 0, expectedLine.b || 0, tolerance.b)
            ),
            `${label}: expected y=${expectedLine.m}x+${expectedLine.b || 0}, got ${JSON.stringify(actualLines)}`
        );
    }

    assert.strictEqual(
        actualLines.length,
        expectedLines.length,
        `${label}: expected exactly ${JSON.stringify(expectedLines)}, got ${JSON.stringify(actualLines)}`
    );
}

function assertHoles(actual, expected, tolerance, label) {
    const actualHoles = Array.isArray(actual) ? actual : [];
    const expectedHoles = Array.isArray(expected) ? expected : [];

    for (const expectedHole of expectedHoles) {
        assert(
            actualHoles.some(hole =>
                approxEqual(hole.x, expectedHole.x, tolerance.x) &&
                approxEqual(hole.y, expectedHole.y, tolerance.y)
            ),
            `${label}: expected hole at (${expectedHole.x}, ${expectedHole.y}), got ${JSON.stringify(actualHoles)}`
        );
    }

    assert.strictEqual(
        actualHoles.length,
        expectedHoles.length,
        `${label}: expected exactly ${JSON.stringify(expectedHoles)}, got ${JSON.stringify(actualHoles)}`
    );
}

function assertComponentPresence(stats, expectedValues, axis, label) {
    const values = Array.isArray(expectedValues) ? expectedValues : [];
    for (const value of values) {
        const match = stats.find(stat => approxEqual(stat.value, value, 0.04));
        assert(match, `${label}: expected ${axis} component ${value}, got ${JSON.stringify(stats)}`);
        assert(
            match.spread >= 0.55,
            `${label}: expected ${axis} component ${value} to span the viewport, got spread ${match.spread}`
        );
    }
}

function assertPointProbes(actual, expectedProbes, label) {
    const probes = Array.isArray(expectedProbes) ? expectedProbes : [];
    const actualDistances = Array.isArray(actual.pointProbeDistances) ? actual.pointProbeDistances : [];

    for (let index = 0; index < probes.length; index++) {
        const probe = probes[index];
        const actualDistance = actualDistances[index];
        const tolerance = Number.isFinite(probe.tolerance) ? probe.tolerance : 0.1;
        assert(
            Number.isFinite(actualDistance) && actualDistance <= tolerance,
            `${label}: expected point near (${probe.x}, ${probe.y}) for ${probe.label || 'probe'}, nearest distance ${actualDistance}`
        );
    }
}

async function plotFixture(page, fixture) {
    const pointProbes = fixture.expected && Array.isArray(fixture.expected.pointsNear)
        ? fixture.expected.pointsNear
        : [];

    return page.evaluate(async ({ expression, viewport, pointProbes }) => {
        const graphiti = window.graphiti;
        if (!graphiti) {
            throw new Error('Graphiti did not initialise');
        }

        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = false;
        graphiti.showIntercepts = true;
        graphiti.input.persistentBadges = [];
        graphiti.intercepts = [];

        graphiti.canvas.width = viewport.width;
        graphiti.canvas.height = viewport.height;
        Object.assign(graphiti.cartesianViewport, viewport, {
            centerX: viewport.width / 2,
            centerY: viewport.height / 2,
            scale: Math.min(
                viewport.width / Math.max(1e-12, viewport.maxX - viewport.minX),
                viewport.height / Math.max(1e-12, viewport.maxY - viewport.minY)
            )
        });

        const func = {
            id: graphiti.nextFunctionId++,
            expression,
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);

        await graphiti.plotFunction(func);
        graphiti.intercepts = graphiti.findAxisIntercepts();

        const finitePoints = (func.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        );
        const xSpan = Math.max(1e-12, viewport.maxX - viewport.minX);
        const ySpan = Math.max(1e-12, viewport.maxY - viewport.minY);

        const horizontalComponentStats = [];
        for (let y = Math.ceil(viewport.minY); y <= Math.floor(viewport.maxY); y++) {
            const matches = finitePoints.filter(point => Math.abs(point.y - y) <= 0.025);
            if (matches.length < 12) {
                continue;
            }
            const minX = Math.min(...matches.map(point => point.x));
            const maxX = Math.max(...matches.map(point => point.x));
            horizontalComponentStats.push({ value: y, spread: (maxX - minX) / xSpan, count: matches.length });
        }

        const verticalComponentStats = [];
        const metadataVerticalComponents = typeof graphiti.getImplicitVerticalComponents === 'function'
            ? graphiti.getImplicitVerticalComponents(func)
            : [];
        for (const x of metadataVerticalComponents) {
            const matches = finitePoints.filter(point => Math.abs(point.x - x) <= 0.025);
            const minY = matches.length > 0 ? Math.min(...matches.map(point => point.y)) : null;
            const maxY = matches.length > 0 ? Math.max(...matches.map(point => point.y)) : null;
            verticalComponentStats.push({
                value: x,
                spread: matches.length > 0 ? (maxY - minY) / ySpan : 1,
                count: matches.length
            });
        }

        const pointProbeDistances = pointProbes.map(probe => {
            let nearestDistance = Infinity;
            for (const point of finitePoints) {
                const distance = Math.hypot(point.x - probe.x, point.y - probe.y);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                }
            }
            return nearestDistance;
        });

        return {
            expression: func.expression,
            renderMode: func.implicitRenderMode || null,
            explicitImplicitFastPath: typeof graphiti.isExplicitImplicitFastPath === 'function'
                ? graphiti.isExplicitImplicitFastPath(func)
                : false,
            asymptoteData: func.asymptoteData || { vertical: [], horizontal: [], oblique: [] },
            holes: Array.isArray(func.holes) ? func.holes : [],
            verticalComponents: metadataVerticalComponents,
            horizontalComponentStats,
            verticalComponentStats,
            intercepts: graphiti.intercepts.filter(point => point.functionId === func.id),
            finitePointCount: finitePoints.length,
            boundaryContinuationCount: finitePoints.filter(point => point.monomialViewportBoundary === true).length,
            finiteSegmentStarts: finitePoints.filter(point => point.connected === false).length,
            pointProbeDistances
        };
    }, { expression: fixture.expression, viewport: fixture.viewport, pointProbes });
}

async function assertIncompleteExpressionsDoNotPlot(page) {
    const cases = [
        'y^2=1/(x^2-y^)',
        'y^2=1/(x^2-y^{})',
        'y^2=1/(x^2-y^{#?})',
        'y^2=1/(x^2-y^{#0})'
    ];

    const results = await page.evaluate(async (expressions) => {
        const graphiti = window.graphiti;
        const out = [];
        for (const expression of expressions) {
            graphiti.plotMode = 'cartesian';
            graphiti.cartesianFunctions = [];
            graphiti.polarFunctions = [];
            graphiti.nextFunctionId = 1;
            graphiti.showIntersections = false;
            graphiti.showTurningPoints = false;
            graphiti.showIntercepts = false;
            graphiti.input.persistentBadges = [];

            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [{ x: 1, y: 1, connected: false }],
                color: '#4A90E2',
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions.push(func);

            const startedAt = performance.now();
            await Promise.race([
                graphiti.plotFunctionWithValidation(func),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out validating ${expression}`)), 500))
            ]);

            out.push({
                expression,
                elapsed: performance.now() - startedAt,
                pointsLength: Array.isArray(func.points) ? func.points.length : 0,
                hasIncompleteMathLiveInput: graphiti.hasIncompleteMathLiveInput(expression),
                endsWithOperator: graphiti.getCachedRegex('operatorEnd').test(expression.trim())
            });
        }
        return out;
    }, cases);

    for (const result of results) {
        assert(
            result.hasIncompleteMathLiveInput || result.endsWithOperator,
            `${result.expression}: should be recognised as incomplete`
        );
        assert.strictEqual(result.pointsLength, 0, `${result.expression}: should not plot stale or new points`);
        assert(result.elapsed < 500, `${result.expression}: validation should return quickly, took ${result.elapsed}ms`);
    }
}

async function assertEmptyMathLivePlaceholdersAreRestored(page) {
    const cases = [
        { expression: 'y=x^{}', expected: 'y=x^{#?}' },
        { expression: 'y=x_{}', expected: 'y=x_{#?}' },
        { expression: 'y=x^{}+a_{}', expected: 'y=x^{#?}+a_{#?}' }
    ];

    const results = await page.evaluate((cases) => {
        const graphiti = window.graphiti;
        return cases.map(testCase => {
            const restored = graphiti.restoreEmptyMathLivePlaceholders(testCase.expression);
            return {
                expression: testCase.expression,
                expected: testCase.expected,
                restored,
                incomplete: graphiti.hasIncompleteMathLiveInput(restored)
            };
        });
    }, cases);

    for (const result of results) {
        assert.strictEqual(result.restored, result.expected, `${result.expression}: should restore empty placeholder`);
        assert.strictEqual(result.incomplete, true, `${result.restored}: restored placeholder should stay incomplete`);
    }
}

(async () => {
    const { server, baseUrl } = await startStaticServer();
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        page.on('dialog', dialog => dialog.dismiss());
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.graphiti && window.math, null, { timeout: 30000 });

        for (const fixture of fixtures) {
            const actual = await plotFixture(page, fixture);
            const expected = fixture.expected || {};
            const label = fixture.name;

            assert(actual.finitePointCount > 0, `${label}: expected plotted points`);
            if (expected.renderMode) {
                assert.strictEqual(actual.renderMode, expected.renderMode, `${label}: render mode`);
            }
            if (typeof expected.explicitImplicitFastPath === 'boolean') {
                assert.strictEqual(actual.explicitImplicitFastPath, expected.explicitImplicitFastPath, `${label}: draw-path classification`);
            }
            if (Number.isFinite(expected.maxFiniteSegmentStarts)) {
                assert(
                    actual.finiteSegmentStarts <= expected.maxFiniteSegmentStarts,
                    `${label}: expected at most ${expected.maxFiniteSegmentStarts} finite segment starts, got ${actual.finiteSegmentStarts}`
                );
            }
            if (Number.isFinite(expected.minBoundaryContinuations)) {
                assert(
                    actual.boundaryContinuationCount >= expected.minBoundaryContinuations,
                    `${label}: expected at least ${expected.minBoundaryContinuations} boundary continuations, got ${actual.boundaryContinuationCount}`
                );
            }
            assertApproxSet(actual.asymptoteData.vertical, expected.verticalAsymptotes || [], 0.03, `${label} vertical asymptotes`);
            assertApproxSet(actual.asymptoteData.horizontal, expected.horizontalAsymptotes || [], 0.03, `${label} horizontal asymptotes`);
            assertApproxLines(actual.asymptoteData.oblique, expected.obliqueAsymptotes || [], { m: 0.035, b: 0.08 }, `${label} oblique asymptotes`);
            assertHoles(actual.holes, expected.holes || [], { x: 0.04, y: 0.04 }, `${label} holes`);
            assertApproxSet(actual.verticalComponents, expected.verticalComponents || [], 0.04, `${label} vertical component metadata`);
            assertComponentPresence(actual.horizontalComponentStats, expected.horizontalComponents || [], 'horizontal', label);
            assertPointProbes(actual, expected.pointsNear || [], label);

            if (Number.isFinite(expected.maxIntercepts)) {
                assert(
                    actual.intercepts.length <= expected.maxIntercepts,
                    `${label}: expected at most ${expected.maxIntercepts} intercepts, got ${actual.intercepts.length}: ${JSON.stringify(actual.intercepts)}`
                );
            }
        }

        await assertIncompleteExpressionsDoNotPlot(page);
    await assertEmptyMathLivePlaceholdersAreRestored(page);

        console.log(`graph contract tests passed (${fixtures.length} fixtures)`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
