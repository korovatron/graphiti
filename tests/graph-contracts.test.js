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

async function assertShapeClassification(page) {
    const cases = [
        { expression: 'x^2+y^2=1', expected: 'circle' },
        { expression: '2*x^2+2*y^2=2', expected: 'circle' },
        { expression: 'x^2=1-y^2', expected: 'circle' },
        { expression: 'x^2/9+y^2/4=1', expected: 'ellipse' },
        { expression: 'x^2-y^2=1', expected: 'hyperbola' },
        { expression: 'y=1/x', expected: 'hyperbola' },
        { expression: 'x=1/y', expected: 'hyperbola' },
        { expression: 'x^2/x=1', expected: 'line' },
        { expression: 'y=x^2', expected: 'parabola' },
        { expression: 'y=2*x+1', expected: 'line' },
        { expression: '(x^2+y^2-4)*(y-x)=0', expected: 'circle + line' },
        { expression: '(y-1/x)*(y-1)=0', expected: 'hyperbola + line' },
        { expression: 'x*(y^2-x)=0', expected: 'line + parabola' },
        { expression: 'x*y^2-x^2=0', expected: 'line + parabola' },
        { expression: 'x*y=0', expected: 'line pair' },
        { expression: 'x^2+y^2+1=0', expected: null }
    ];

    const results = await page.evaluate((cases) => {
        const graphiti = window.graphiti;
        return cases.map(testCase => {
            const shape = graphiti.classifyFunctionShape(testCase.expression);
            return {
                expression: testCase.expression,
                expected: testCase.expected,
                actual: shape && shape.label ? shape.label : null
            };
        });
    }, cases);

    for (const result of results) {
        assert.strictEqual(result.actual, result.expected, `${result.expression}: shape classification`);
    }

    const polarResults = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.parameters.alpha.value = 1;
        graphiti.parameters.beta.value = 1;

        const cases = [
            { expression: 'r=2', expected: 'circle' },
            { expression: 'theta=pi/2', expected: 'polar ray' },
            { expression: 'r=2*cos(theta)', expected: 'circle' },
            { expression: 'r=1+cos(theta)', expected: 'cardioid' },
            { expression: 'r=1+alpha*cos(theta+1)', expected: 'cardioid' },
            { expression: 'r=1+2*cos(theta)', expected: 'limacon - inner loop' },
            { expression: 'r=3+cos(theta)', expected: 'limacon - convex' },
            { expression: 'r=2*cos(3*theta)', expected: 'rose curve - 3 petals' },
            { expression: 'r=sin(4*theta)', expected: 'rose curve - 8 petals' },
            { expression: 'r=theta', expected: 'Archimedean spiral' },
            { expression: 'r=1+theta', expected: 'Archimedean spiral' }
        ];

        const fullRange = cases.map(testCase => {
            const shape = graphiti.classifyFunctionShape(testCase.expression);
            return {
                expression: testCase.expression,
                expected: testCase.expected,
                actual: shape && shape.label ? shape.label : null
            };
        });

        graphiti.polarSettings.thetaMax = Math.PI / 6;
        const partialRose = graphiti.classifyFunctionShape('r=2*cos(3*theta)');
        graphiti.parameters.beta.value = 0;
        const betaZeroCircle = graphiti.classifyFunctionShape('r=alpha*cos(beta*theta)');
        graphiti.parameters.beta.value = 3;
        const betaThreeRose = graphiti.classifyFunctionShape('r=alpha*cos(beta*theta)');

        return {
            fullRange,
            partialRose: partialRose && partialRose.label ? partialRose.label : null,
            betaZeroCircle: betaZeroCircle && betaZeroCircle.label ? betaZeroCircle.label : null,
            betaThreeRose: betaThreeRose && betaThreeRose.label ? betaThreeRose.label : null
        };
    });

    for (const result of polarResults.fullRange) {
        assert.strictEqual(result.actual, result.expected, `${result.expression}: polar shape classification`);
    }
    assert.strictEqual(polarResults.partialRose, 'rose curve', 'partial polar range should not claim visible rose petal count');
    assert.strictEqual(polarResults.betaZeroCircle, 'circle', 'polar trig with zero frequency should classify as circle');
    assert.strictEqual(polarResults.betaThreeRose, 'rose curve', 'non-zero parameter frequency should not collapse to circle');

    const domResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('x^2+y^2=1');
        const func = graphiti.cartesianFunctions[0];
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const asymptoteContainer = item ? item.querySelector('.asymptote-info-container') : null;
        const holesContainer = item ? item.querySelector('.holes-info-container') : null;
        const childClasses = item ? Array.from(item.children).map(child => child.className) : [];

        return {
            label: shapeContainer ? shapeContainer.querySelector('.shape-info-value').textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false,
            shapeIndex: childClasses.indexOf('shape-info-container visible'),
            asymptoteIndex: childClasses.indexOf('asymptote-info-container'),
            holesIndex: childClasses.indexOf('holes-info-container'),
            hasAsymptoteContainer: !!asymptoteContainer,
            hasHolesContainer: !!holesContainer
        };
    });

    assert.strictEqual(domResult.label, 'circle', 'shape label should render in function panel');
    assert.strictEqual(domResult.visible, true, 'shape label should be visible');
    assert(domResult.hasAsymptoteContainer, 'shape DOM check should find asymptote container');
    assert(domResult.hasHolesContainer, 'shape DOM check should find holes container');
    assert(domResult.shapeIndex >= 0, 'shape row should exist in function item');
    assert(domResult.shapeIndex < domResult.asymptoteIndex, 'shape row should render before asymptote metadata');
    assert(domResult.shapeIndex < domResult.holesIndex, 'shape row should render before hole metadata');

    const lineDomResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('y=2*x+1');
        const func = graphiti.cartesianFunctions[0];
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;
        const shape = graphiti.classifyFunctionShape(func);

        return {
            classifiedLabel: shape && shape.label ? shape.label : null,
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false
        };
    });

    assert.strictEqual(lineDomResult.classifiedLabel, 'line', 'single line should still classify as line');
    assert.strictEqual(lineDomResult.renderedLabel, '', 'single line shape label should not render text');
    assert.strictEqual(lineDomResult.visible, false, 'single line shape row should stay hidden');

    const polarDomResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('r=1+cos(theta)');
        const func = graphiti.polarFunctions[0];
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;

        return {
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false
        };
    });

    assert.strictEqual(polarDomResult.renderedLabel, 'cardioid', 'polar shape label should render in function panel');
    assert.strictEqual(polarDomResult.visible, true, 'polar shape row should be visible');
}

async function assertImplicitFastPathTurningPointsStayQuiet(page) {
    const cases = [
        '\\frac13y^2x=0',
        'x^2-y^2=4',
        'xy=1',
        '\\left(y-2\\right)\\left(x^2+y^2-7\\right)=0'
    ];

    const result = await page.evaluate(async (cases) => {
        const graphiti = window.graphiti;
        const messages = [];
        const originalWarn = console.warn;
        const originalError = console.error;
        console.warn = (...args) => {
            messages.push(args.map(String).join(' '));
        };
        console.error = (...args) => {
            messages.push(args.map(String).join(' '));
        };

        try {
            graphiti.plotMode = 'cartesian';
            graphiti.cartesianFunctions = [];
            graphiti.polarFunctions = [];
            graphiti.nextFunctionId = 1;
            graphiti.showIntersections = false;
            graphiti.showTurningPoints = true;
            graphiti.showIntercepts = false;

            for (const expression of cases) {
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
            }

            graphiti.findTurningPoints();
        } finally {
            console.warn = originalWarn;
            console.error = originalError;
        }

        return messages.filter(message =>
            message.includes('Skipping turning points') ||
            message.includes('Could not find turning points') ||
            message.includes('Error finding implicit turning points')
        );
    }, cases);

    assert.deepStrictEqual(result, [], `implicit fast-path turning point warnings: ${JSON.stringify(result)}`);
}

async function assertStaleIntersectionMarkersAreDiscarded(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'x=0', points: [{ x: 0, y: 0 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=0', points: [{ x: 0, y: 0 }], enabled: true, mode: 'cartesian', color: '#D0021B' }
        ];
        graphiti.polarFunctions = [];
        graphiti.explicitIntersections = [{ x: 0, y: 0, func1Id: 1, func2Id: 2 }];
        graphiti.implicitIntersections = [{ x: 1, y: 1, func1Id: 1, func2Id: 2 }];
        graphiti.intersections = [...graphiti.explicitIntersections, ...graphiti.implicitIntersections];
        graphiti.frozenIntersectionBadges = [{ x: 0, y: 0, func1Id: 1, func2Id: 2 }];

        graphiti.clearIntersectionState({ cancelWorker: false });
        const generationAfterClear = graphiti.intersectionGeneration;
        graphiti.handleWorkerMessage({
            type: 'INTERSECTIONS_COMPLETE',
            data: {
                calculationType: 'implicit',
                generation: generationAfterClear - 1,
                intersections: [{ x: 9, y: 9, func1Id: 1, func2Id: 2 }]
            }
        });

        const staleWorkerIgnored = graphiti.implicitIntersections.length === 0 && graphiti.intersections.length === 0;

        graphiti.cartesianFunctions = [
            { id: 2, expression: 'y=0', points: [{ x: 0, y: 0 }], enabled: true, mode: 'cartesian', color: '#D0021B' }
        ];
        graphiti.handleWorkerMessage({
            type: 'INTERSECTIONS_COMPLETE',
            data: {
                calculationType: 'implicit',
                generation: graphiti.intersectionGeneration,
                intersections: [
                    { x: 1, y: 1, func1Id: 1, func2Id: 2 },
                    { x: 2, y: 2, func1Id: 2, func2Id: 2 },
                    { x: 3, y: 3, func1Id: 'tangent_a', func2Id: 2 }
                ]
            }
        });

        graphiti.frozenIntersectionBadges = [
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 2, y: 2, func1Id: 2, func2Id: 2 },
            { x: 3, y: 3, func1Id: 'tangent_a', func2Id: 2 }
        ];
        graphiti.drawFrozenIntersectionBadges();

        return {
            staleWorkerIgnored,
            combined: graphiti.intersections.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id })),
            frozen: graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id }))
        };
    });

    assert.strictEqual(result.staleWorkerIgnored, true, 'stale worker result should not repopulate intersections');
    assert.deepStrictEqual(result.combined, [
        { x: 2, y: 2, func1Id: 2, func2Id: 2 },
        { x: 3, y: 3, func1Id: 'tangent_a', func2Id: 2 }
    ], `current intersections should be filtered: ${JSON.stringify(result.combined)}`);
    assert.deepStrictEqual(result.frozen, [
        { x: 2, y: 2, func1Id: 2, func2Id: 2 },
        { x: 3, y: 3, func1Id: 'tangent_a', func2Id: 2 }
    ], `frozen intersections should be filtered: ${JSON.stringify(result.frozen)}`);
}

async function assertImplicitVerticalComponentsIntersectExplicitCurves(page) {
    const results = await page.evaluate(async () => {
        const graphiti = window.graphiti;

        const runPair = async (expressions) => {
            graphiti.plotMode = 'cartesian';
            graphiti.cartesianFunctions = [];
            graphiti.polarFunctions = [];
            graphiti.nextFunctionId = 1;
            graphiti.showIntersections = true;
            graphiti.showTurningPoints = false;
            graphiti.showIntercepts = false;
            graphiti.input.persistentBadges = [];
            graphiti.clearIntersectionState({ cancelWorker: true });

            graphiti.canvas.width = 960;
            graphiti.canvas.height = 720;
            Object.assign(graphiti.cartesianViewport, {
                minX: -8,
                maxX: 8,
                minY: -8,
                maxY: 8,
                width: 960,
                height: 720,
                centerX: 480,
                centerY: 360,
                scale: 60
            });

            const functions = [];
            for (let index = 0; index < expressions.length; index++) {
                functions.push(await addFunction(expressions[index], index === 0 ? '#4A90E2' : '#D0021B'));
            }

            graphiti.calculateIntersectionsWithWorker(true);

            const startTime = Date.now();
            while ((graphiti.implicitIntersectionsPending || graphiti.isWorkerCalculating) && Date.now() - startTime < 3000) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            return {
                verticalComponents: functions.flatMap(func => graphiti.getImplicitVerticalComponents(func)),
                intersections: graphiti.intersections.map(point => ({ x: point.x, y: point.y }))
            };
        };

        const addFunction = async (expression, color) => {
            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [],
                color,
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions.push(func);
            await graphiti.plotFunction(func);
            return func;
        };

        return {
            expandedProduct: await runPair(['y=1', 'x*y^2-x^2=0']),
            affineImplicit: await runPair(['y=5', 'y*(x-1)=x^2+1'])
        };
    });

    const expandedProduct = results.expandedProduct;
    assertApproxSet(expandedProduct.verticalComponents, [0], 0.04, 'expanded line/parabola vertical component metadata');
    assert(
        expandedProduct.intersections.some(point => approxEqual(point.x, 0, 0.04) && approxEqual(point.y, 1, 0.04)),
        `expected y=1 to intersect vertical component at (0, 1), got ${JSON.stringify(expandedProduct.intersections)}`
    );
    assert(
        expandedProduct.intersections.some(point => approxEqual(point.x, 1, 0.04) && approxEqual(point.y, 1, 0.04)),
        `expected y=1 to intersect parabola at (1, 1), got ${JSON.stringify(expandedProduct.intersections)}`
    );

    const affineImplicit = results.affineImplicit;
    assert(
        affineImplicit.intersections.some(point => approxEqual(point.x, 2, 0.04) && approxEqual(point.y, 5, 0.04)),
        `expected y=5 to intersect affine implicit curve at (2, 5), got ${JSON.stringify(affineImplicit.intersections)}`
    );
    assert(
        affineImplicit.intersections.some(point => approxEqual(point.x, 3, 0.04) && approxEqual(point.y, 5, 0.04)),
        `expected y=5 to intersect affine implicit curve at (3, 5), got ${JSON.stringify(affineImplicit.intersections)}`
    );
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
            if (Number.isFinite(expected.maxFinitePointCount)) {
                assert(
                    actual.finitePointCount <= expected.maxFinitePointCount,
                    `${label}: expected at most ${expected.maxFinitePointCount} finite points, got ${actual.finitePointCount}`
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
        await assertShapeClassification(page);
        await assertImplicitFastPathTurningPointsStayQuiet(page);
        await assertStaleIntersectionMarkersAreDiscarded(page);
        await assertImplicitVerticalComponentsIntersectExplicitCurves(page);

        console.log(`graph contract tests passed (${fixtures.length} fixtures)`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
