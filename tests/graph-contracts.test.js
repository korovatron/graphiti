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

const unsafeBrowserPorts = new Set([6000, 6665, 6666, 6667, 6668, 6669, 10080]);

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
            if (unsafeBrowserPorts.has(address.port)) {
                server.close(() => {
                    startStaticServer().then(resolve, reject);
                });
                return;
            }

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

function assertApproxPolynomials(actual, expected, tolerance, label) {
    const actualPolynomials = Array.isArray(actual) ? actual : [];
    const expectedPolynomials = Array.isArray(expected) ? expected : [];

    for (const expectedPolynomial of expectedPolynomials) {
        const expectedCoefficients = Array.isArray(expectedPolynomial.coefficients) ? expectedPolynomial.coefficients : [];
        assert(
            actualPolynomials.some(actualPolynomial => {
                const actualCoefficients = Array.isArray(actualPolynomial.coefficients) ? actualPolynomial.coefficients : [];
                return actualCoefficients.length === expectedCoefficients.length &&
                    expectedCoefficients.every((expectedCoefficient, index) => approxEqual(actualCoefficients[index], expectedCoefficient, tolerance));
            }),
            `${label}: expected ${JSON.stringify(expectedPolynomials)}, got ${JSON.stringify(actualPolynomials)}`
        );
    }

    assert.strictEqual(
        actualPolynomials.length,
        expectedPolynomials.length,
        `${label}: expected exactly ${JSON.stringify(expectedPolynomials)}, got ${JSON.stringify(actualPolynomials)}`
    );
}

function assertEnvelope(actual, expected, tolerance, label) {
    if (!expected) {
        assert.strictEqual(actual || null, null, `${label}: expected no envelope, got ${JSON.stringify(actual)}`);
        return;
    }

    assert(actual, `${label}: expected envelope ${JSON.stringify(expected)}, got none`);
    for (const key of ['baseline', 'amplitude', 'decayRate']) {
        assert(
            approxEqual(actual[key], expected[key], tolerance),
            `${label}: expected envelope ${key}=${expected[key]}, got ${actual[key]}`
        );
    }
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

    return page.evaluate(async ({ expression, viewport, pointProbes, parameters }) => {
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
        for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
            if (graphiti.parameters && graphiti.parameters[name]) {
                graphiti.parameters[name].value = parameters && Number.isFinite(parameters[name]) ? parameters[name] : 1;
            }
        }

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
        let tallVerticalSegmentCount = 0;
        let previousFinitePoint = null;
        for (const point of func.points || []) {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                previousFinitePoint = null;
                continue;
            }
            if (previousFinitePoint && point.connected !== false &&
                Math.abs(previousFinitePoint.x - point.x) <= 1e-9 &&
                Math.abs(point.y - previousFinitePoint.y) > (viewport.maxY - viewport.minY) * 0.75) {
                tallVerticalSegmentCount++;
            }
            previousFinitePoint = point;
        }
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
            productFactorRenderModes: Array.isArray(func.productImplicitFactorRenderModes)
                ? func.productImplicitFactorRenderModes.slice()
                : [],
            explicitImplicitFastPath: typeof graphiti.isExplicitImplicitFastPath === 'function'
                ? graphiti.isExplicitImplicitFastPath(func)
                : false,
            hasGridData: !!func.gridData,
            asymptoteData: func.asymptoteData || { vertical: [], horizontal: [], oblique: [] },
            envelopeData: func.envelopeData || null,
            holes: Array.isArray(func.holes) ? func.holes : [],
            verticalComponents: metadataVerticalComponents,
            horizontalComponentStats,
            verticalComponentStats,
            intercepts: graphiti.intercepts.filter(point => point.functionId === func.id),
            finitePointCount: finitePoints.length,
            tallVerticalSegmentCount,
            boundaryContinuationCount: finitePoints.filter(point => point.monomialViewportBoundary === true).length,
            finiteSegmentStarts: finitePoints.filter(point => point.connected === false).length,
            finiteSegmentStartXs: finitePoints
                .filter(point => point.connected === false)
                .map(point => point.x),
            pointProbeDistances
        };
    }, { expression: fixture.expression, viewport: fixture.viewport, pointProbes, parameters: fixture.parameters || null });
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

async function assertLegacyDerivativeCacheEntriesDoNotSuppressTurningPoints(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;

        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = true;
        graphiti.showIntercepts = false;
        graphiti.input.persistentBadges = [];
        graphiti.turningPoints = [];
        graphiti.expressionCache.clear();

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        Object.assign(graphiti.cartesianViewport, {
            minX: -10,
            maxX: 10,
            minY: -10,
            maxY: 10,
            centerX: 480,
            centerY: 360,
            scale: 48
        });

        const sinFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'y=\\sin(x)',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        const parabolaFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'y=x^2',
            points: [],
            color: '#E24A90',
            enabled: true,
            mode: 'cartesian'
        };

        graphiti.cartesianFunctions.push(sinFunc, parabolaFunc);
        await graphiti.plotFunction(sinFunc);
        await graphiti.plotFunction(parabolaFunc);

        // Simulate legacy cache entries that stored only first derivatives as strings.
        graphiti.expressionCache.set(`deriv_${sinFunc.id}_sin(x)`, 'cos(x)');
        graphiti.expressionCache.set(`deriv_${parabolaFunc.id}_x^2`, '2 * x');

        const turningPoints = graphiti.findTurningPoints();
        const sinTurningPoints = turningPoints.filter(point => point.func && point.func.id === sinFunc.id);
        const parabolaTurningPoints = turningPoints.filter(point => point.func && point.func.id === parabolaFunc.id);
        const sinHasPiOver2Maximum = sinTurningPoints.some(point => Math.abs(point.x - Math.PI / 2) < 0.05 && point.type === 'maximum');
        const parabolaHasOriginMinimum = parabolaTurningPoints.some(point => Math.abs(point.x) < 0.05 && Math.abs(point.y) < 0.05 && point.type === 'minimum');

        const upgradedSinCache = graphiti.expressionCache.get(`deriv_${sinFunc.id}_sin(x)`);
        const upgradedParabolaCache = graphiti.expressionCache.get(`deriv_${parabolaFunc.id}_x^2`);

        return {
            totalTurningPoints: turningPoints.length,
            sinCount: sinTurningPoints.length,
            parabolaCount: parabolaTurningPoints.length,
            sinHasPiOver2Maximum,
            parabolaHasOriginMinimum,
            upgradedSinCache,
            upgradedParabolaCache
        };
    });

    assert(result.totalTurningPoints > 0, `legacy derivative cache regression should still find turning points: ${JSON.stringify(result)}`);
    assert(result.sinCount > 0, `legacy derivative cache regression should detect sin turning points: ${JSON.stringify(result)}`);
    assert(result.parabolaCount > 0, `legacy derivative cache regression should detect parabola turning points: ${JSON.stringify(result)}`);
    assert(result.sinHasPiOver2Maximum, `legacy derivative cache regression should detect sin maximum near pi/2: ${JSON.stringify(result)}`);
    assert(result.parabolaHasOriginMinimum, `legacy derivative cache regression should detect parabola minimum at origin: ${JSON.stringify(result)}`);
    assert(
        result.upgradedSinCache && typeof result.upgradedSinCache.first === 'string' && typeof result.upgradedSinCache.second === 'string',
        `legacy derivative cache entry for sin should be upgraded to first/second pair: ${JSON.stringify(result)}`
    );
    assert(
        result.upgradedParabolaCache && typeof result.upgradedParabolaCache.first === 'string' && typeof result.upgradedParabolaCache.second === 'string',
        `legacy derivative cache entry for parabola should be upgraded to first/second pair: ${JSON.stringify(result)}`
    );
}

async function assertShapeClassification(page) {
    const cases = [
        { expression: 'x^2+y^2=1', expected: 'circle' },
        { expression: '2*x^2+2*y^2=2', expected: 'circle' },
        { expression: 'x^2=1-y^2', expected: 'circle' },
        { expression: 'x^2+y^2<16', expected: 'circle' },
        { expression: 'x^2/9+y^2/4=1', expected: 'ellipse' },
        { expression: 'x^2-y^2=1', expected: 'rectangular hyperbola' },
        { expression: 'y=1/x', expected: 'rectangular hyperbola' },
        { expression: 'xy=1', expected: 'rectangular hyperbola' },
        { expression: 'y^2-xy=1', expected: 'hyperbola' },
        { expression: 'y=\\frac{x^2-9}{\\left(x-2\\right)\\left(x+3\\right)}', expected: 'rectangular hyperbola' },
        { expression: '\\frac{\\left(x-2\\right)\\left(x+1\\right)}{\\left(x-2\\right)}', expected: 'line' },
        { expression: 'y=\\frac{\\left(x-1\\right)\\left(x-2\\right)}{x-1}', expected: 'line' },
        { expression: 'x=1/y', expected: 'rectangular hyperbola' },
        { expression: 'x^2/x=1', expected: 'line' },
        { expression: '\\frac{x^2-y^2}{x-y}=1', expected: 'line' },
        { expression: '(x-2)^2=0', expected: 'degenerate conic' },
        { expression: '\\left(x-2\\right)^2=0', expected: 'degenerate conic' },
        { expression: 'x^2-4=0', expected: 'line pair' },
        { expression: 'y=cosh(x)', expected: 'catenary' },
        { expression: 'y=2*cosh(3*x-1)+4', expected: 'catenary' },
        { expression: 'y=(exp(x)+exp(-x))/2', expected: 'catenary' },
        { expression: 'y=3*exp(2*x+1)+4*exp(-2*x+5)-7', expected: 'catenary' },
        { expression: 'y=cosh(2*x+6)-6+cosh(2*x+6)', expected: 'catenary' },
        { expression: 'y=exp(2*x)+exp(-2*x)+exp(2*x)+exp(-2*x)', expected: 'catenary' },
        { expression: 'y=exp(x)', expected: null },
        { expression: 'y=x^2', expected: 'parabola' },
        { expression: 'y^2=x^3', expected: 'semi-cubical parabola' },
        { expression: '(y-2)^2=3*(x+1)^3', expected: 'semi-cubical parabola' },
        { expression: '(x+1)^2=2*(y-3)^3', expected: 'semi-cubical parabola' },
        { expression: 'x^3+y^3=3*x*y', expected: 'folium of Descartes' },
        { expression: 'x^3+y^3-6*x*y=0', expected: 'folium of Descartes' },
        { expression: '(x-1)^3+(y+2)^3=3*(x-1)*(y+2)', expected: 'folium of Descartes' },
        { expression: '2*x^3+3*y^3-3*x*y=0', expected: 'scaled folium of Descartes' },
        { expression: '2*(x-1)^3+3*(y+2)^3=3*(x-1)*(y+2)', expected: 'scaled folium of Descartes' },
        { expression: 'y=2*x+1', expected: 'line' },
        { expression: 'y>=x-3', expected: 'line' },
        { expression: 'y^2<x^3', expected: 'semi-cubical parabola' },
        { expression: 'x^3+y^3<3*x*y', expected: 'folium of Descartes' },
        { expression: '(x^2+y^2-4)*(y-x)=0', expected: 'circle + line' },
        { expression: '(y^2-x^3)*(x-1)=0', expected: 'semi-cubical parabola + line' },
        { expression: '(x^3+y^3-3*x*y)*(x-1)=0', expected: 'folium of Descartes + line' },
        { expression: '(cosh(x)-y)*(x-1)=0', expected: 'catenary + line' },
        { expression: '(y-1/x)*(y-1)=0', expected: 'rectangular hyperbola + line' },
        { expression: 'x*(y^2-x)=0', expected: 'line + parabola' },
        { expression: 'x*y^2-x^2=0', expected: 'line + parabola' },
        { expression: '((x^2-y^2)*(x+y)-1)*(y+1-2*x)*(y^2-2*x)=0', expected: 'line + parabola + implicit curve' },
        { expression: '\\left(y-\\frac{x}{2}\\right)\\left(x-x^3y\\right)=0', expected: 'line + line + reciprocal-square curve' },
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
            { expression: '2*r+cos(t)-1=0', expected: 'cardioid' },
            { expression: 'r<1+cos(theta)', expected: 'cardioid' },
            { expression: '1+cos(theta)', expected: 'cardioid' },
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

    const parametricResults = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.angleMode = 'radians';
        graphiti.parameters.alpha.value = 2;

        const cases = [
            { expression: '(t,2*t+1)', expected: 'line' },
            { expression: '(2,t)', expected: 'line' },
            { expression: '(2*cos(t),2*sin(t))', expected: 'circle' },
            { expression: '(1+3*cos(t),-1+2*sin(t))', expected: 'ellipse' },
            { expression: '(alpha*cos(t),alpha*sin(t))', expected: 'circle' },
            { expression: '(t^2,2*t)', expected: 'parabola' },
            { expression: '\\left(\\left(2t\\right)^2,5t\\right)', expected: 'parabola' },
            { expression: '(2*t+1,t^2-3)', expected: 'parabola' },
            { expression: '(t,1/t)', expected: 'hyperbola' },
            { expression: '(t^2,t^3)', expected: 'semi-cubical parabola' },
            { expression: '(2*t^2+1,3*t^3-4)', expected: 'semi-cubical parabola' },
            { expression: '(3*t^3-4,2*t^2+1)', expected: 'semi-cubical parabola' },
            { expression: '((t-2)^2+1,3*(t-2)^3-4)', expected: 'semi-cubical parabola' },
            { expression: '(3*t/(1+t^3),3*t^2/(1+t^3))', expected: 'folium of Descartes' },
            { expression: '(2*t/(1+t^3),3*t^2/(1+t^3))', expected: 'scaled folium of Descartes' },
            { expression: '(6*t/(2+2*t^3),6*t^2/(2+2*t^3))', expected: 'folium of Descartes' },
            { expression: '(3*t^2/(1+t^3),3*t/(1+t^3))', expected: 'folium of Descartes' },
            { expression: '(1+2*t,-1+3/t)', expected: 'hyperbola' },
            { expression: '(sin(t),sin(t))', expected: 'line' },
            { expression: '(sin(2*t),sin(3*t))', expected: null }
        ];

        return cases.map(testCase => {
            const shape = graphiti.classifyFunctionShape(testCase.expression);
            return {
                expression: testCase.expression,
                expected: testCase.expected,
                actual: shape && shape.label ? shape.label : null
            };
        });
    });

    for (const result of parametricResults) {
        assert.strictEqual(result.actual, result.expected, `${result.expression}: parametric shape classification`);
    }

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
            title: shapeContainer ? shapeContainer.querySelector('.shape-info-title').textContent : null,
            label: shapeContainer ? shapeContainer.querySelector('.shape-info-value').textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false,
            shapeIndex: childClasses.indexOf('shape-info-container visible'),
            asymptoteIndex: childClasses.indexOf('asymptote-info-container'),
            holesIndex: childClasses.indexOf('holes-info-container'),
            hasAsymptoteContainer: !!asymptoteContainer,
            hasHolesContainer: !!holesContainer
        };
    });

    assert.strictEqual(domResult.title, 'Shape', 'equation shape metadata title should remain Shape');
    assert.strictEqual(domResult.label, 'circle', 'shape label should render in function panel');
    assert.strictEqual(domResult.visible, true, 'shape label should be visible');
    assert(domResult.hasAsymptoteContainer, 'shape DOM check should find asymptote container');
    assert(domResult.hasHolesContainer, 'shape DOM check should find holes container');
    assert(domResult.shapeIndex >= 0, 'shape row should exist in function item');
    assert(domResult.shapeIndex < domResult.asymptoteIndex, 'shape row should render before asymptote metadata');
    assert(domResult.shapeIndex < domResult.holesIndex, 'shape row should render before hole metadata');

    const metadataToggleResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('y=e^(-x)*sin(x)');
        const func = graphiti.cartesianFunctions[0];
        await graphiti.plotFunction(func);
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const asymptoteContainer = item ? item.querySelector('.asymptote-info-container') : null;
        const envelopeContainer = item ? item.querySelector('.envelope-info-container') : null;
        const asymptoteToggle = asymptoteContainer ? asymptoteContainer.querySelector('.asymptote-visibility-toggle') : null;
        const envelopeToggle = envelopeContainer ? envelopeContainer.querySelector('.envelope-visibility-toggle') : null;

        const before = {
            asymptoteVisible: func.showAsymptotes !== false,
            envelopeVisible: func.showEnvelopes !== false,
            asymptoteToggleHidden: asymptoteToggle ? asymptoteToggle.classList.contains('is-hidden') : null,
            envelopeToggleHidden: envelopeToggle ? envelopeToggle.classList.contains('is-hidden') : null,
            asymptoteContainerVisible: asymptoteContainer ? asymptoteContainer.classList.contains('visible') : false,
            envelopeContainerVisible: envelopeContainer ? envelopeContainer.classList.contains('visible') : false,
            asymptoteEquationCount: asymptoteContainer ? asymptoteContainer.querySelectorAll('.asymptote-equation-item').length : 0
        };

        asymptoteToggle.click();
        envelopeToggle.click();

        const after = {
            asymptoteVisible: func.showAsymptotes !== false,
            envelopeVisible: func.showEnvelopes !== false,
            asymptoteToggleHidden: asymptoteToggle ? asymptoteToggle.classList.contains('is-hidden') : null,
            envelopeToggleHidden: envelopeToggle ? envelopeToggle.classList.contains('is-hidden') : null,
            asymptoteContainerVisible: asymptoteContainer ? asymptoteContainer.classList.contains('visible') : false,
            envelopeContainerVisible: envelopeContainer ? envelopeContainer.classList.contains('visible') : false,
            asymptoteEquationCount: asymptoteContainer ? asymptoteContainer.querySelectorAll('.asymptote-equation-item').length : 0,
            savedFunctionKeys: Object.keys(JSON.parse(JSON.stringify(func))).filter(key => key === 'showAsymptotes' || key === 'showEnvelopes')
        };

        return { before, after };
    });

    assert.strictEqual(metadataToggleResult.before.asymptoteVisible, true, 'asymptote overlay should default to visible');
    assert.strictEqual(metadataToggleResult.before.envelopeVisible, true, 'envelope overlay should default to visible');
    assert.strictEqual(metadataToggleResult.before.asymptoteToggleHidden, false, 'asymptote toggle should default to filled');
    assert.strictEqual(metadataToggleResult.before.envelopeToggleHidden, false, 'envelope toggle should default to filled');
    assert(metadataToggleResult.before.asymptoteEquationCount > 0, 'asymptote equations should render while asymptotes are visible');
    assert.strictEqual(metadataToggleResult.after.asymptoteVisible, false, 'asymptote toggle should hide asymptote overlays');
    assert.strictEqual(metadataToggleResult.after.envelopeVisible, false, 'envelope toggle should hide envelope overlays');
    assert.strictEqual(metadataToggleResult.after.asymptoteToggleHidden, true, 'asymptote toggle should become hollow when hidden');
    assert.strictEqual(metadataToggleResult.after.envelopeToggleHidden, true, 'envelope toggle should become hollow when hidden');
    assert.strictEqual(metadataToggleResult.after.asymptoteContainerVisible, true, 'asymptote row should remain visible when overlay hidden');
    assert.strictEqual(metadataToggleResult.after.asymptoteEquationCount, 0, 'asymptote equations should hide when overlay hidden');
    assert.strictEqual(metadataToggleResult.after.envelopeContainerVisible, true, 'envelope metadata should remain visible when overlay hidden');

    const parenthesizedReciprocalTrigAsymptoteResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('y=1/((sin(x)-cos(x)))');
        const func = graphiti.cartesianFunctions[0];
        await graphiti.plotFunction(func);

        return graphiti.buildAsymptoteDisplayLatex(func);
    });

    assert.strictEqual(parenthesizedReciprocalTrigAsymptoteResult.length, 1, 'extra denominator parentheses should keep reciprocal trig asymptotes compact');
    assert.strictEqual(parenthesizedReciprocalTrigAsymptoteResult[0], 'x = \\frac{\\pi}{4} + \\pi n', 'extra denominator parentheses should render the same compact asymptote family');

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
    assert.strictEqual(lineDomResult.renderedLabel, 'line', 'single line shape label should render text');
    assert.strictEqual(lineDomResult.visible, true, 'single line shape row should be visible');

    const inequalityBoundaryDomResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('x^2+y^2<16');
        const func = graphiti.cartesianFunctions[0];
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeTitle = shapeContainer ? shapeContainer.querySelector('.shape-info-title') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;

        return {
            title: shapeTitle ? shapeTitle.textContent : null,
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false
        };
    });

    assert.strictEqual(inequalityBoundaryDomResult.title, 'Boundary', 'inequality shape metadata title should render as Boundary');
    assert.strictEqual(inequalityBoundaryDomResult.renderedLabel, 'circle', 'inequality boundary label should render text');
    assert.strictEqual(inequalityBoundaryDomResult.visible, true, 'inequality boundary row should be visible');

    const deferredPanelResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.deferInitialFunctionPanelOpen = true;
        graphiti.changeState(graphiti.states.GRAPHING);

        const functionPanel = document.getElementById('function-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const duringBuild = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        graphiti.deferInitialFunctionPanelOpen = false;
        graphiti.openFunctionPanelForGraphing({ deferSlide: true });
        const afterUnhide = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        return {
            duringBuild,
            afterUnhide,
            afterBuild: {
                panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
                panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
                hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
            }
        };
    });

    assert.strictEqual(deferredPanelResult.duringBuild.panelHidden, true, 'startup build should keep function panel hidden');
    assert.strictEqual(deferredPanelResult.duringBuild.panelOpen, false, 'startup build should not start panel slide-in');
    assert.strictEqual(deferredPanelResult.duringBuild.hamburgerPanelOpen, false, 'startup build should not mark hamburger as panel-open');
    assert.strictEqual(deferredPanelResult.afterUnhide.panelHidden, false, 'startup build completion should unhide function panel before opening it');
    assert.strictEqual(deferredPanelResult.afterUnhide.panelOpen, false, 'startup build completion should leave an offscreen frame before slide-in');
    assert.strictEqual(deferredPanelResult.afterUnhide.hamburgerPanelOpen, false, 'startup build completion should not mark hamburger as panel-open before slide-in');
    assert.strictEqual(deferredPanelResult.afterBuild.panelHidden, false, 'startup build completion should show function panel');
    assert.strictEqual(deferredPanelResult.afterBuild.panelOpen, true, 'startup build completion should start panel slide-in');
    assert.strictEqual(deferredPanelResult.afterBuild.hamburgerPanelOpen, true, 'startup build completion should mark hamburger as panel-open');

    const cancelledDeferredPanelResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const functionPanel = document.getElementById('function-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');

        graphiti.deferInitialFunctionPanelOpen = true;
        graphiti.changeState(graphiti.states.GRAPHING);
        graphiti.changeState(graphiti.states.TITLE);

        const afterTitle = {
            deferredOpen: graphiti.deferInitialFunctionPanelOpen,
            state: graphiti.currentState,
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        graphiti.openFunctionPanelForGraphing({ deferSlide: true });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        return {
            afterTitle,
            afterStaleOpen: {
                state: graphiti.currentState,
                panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
                panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
                hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
            }
        };
    });

    assert.strictEqual(cancelledDeferredPanelResult.afterTitle.deferredOpen, false, 'returning to title should cancel deferred startup panel open');
    assert.strictEqual(cancelledDeferredPanelResult.afterTitle.state, 'title', 'cancelled startup should be on title screen');
    assert.strictEqual(cancelledDeferredPanelResult.afterTitle.panelHidden, true, 'cancelled startup should keep function panel hidden');
    assert.strictEqual(cancelledDeferredPanelResult.afterTitle.panelOpen, false, 'cancelled startup should close function panel');
    assert.strictEqual(cancelledDeferredPanelResult.afterTitle.hamburgerPanelOpen, false, 'cancelled startup should clear hamburger panel-open state');
    assert.strictEqual(cancelledDeferredPanelResult.afterStaleOpen.state, 'title', 'stale deferred panel open should not leave title screen');
    assert.strictEqual(cancelledDeferredPanelResult.afterStaleOpen.panelHidden, true, 'stale deferred panel open should not unhide function panel on title screen');
    assert.strictEqual(cancelledDeferredPanelResult.afterStaleOpen.panelOpen, false, 'stale deferred panel open should not slide panel in on title screen');
    assert.strictEqual(cancelledDeferredPanelResult.afterStaleOpen.hamburgerPanelOpen, false, 'stale deferred panel open should not mark hamburger as panel-open on title screen');

    const titleAnimationRestartResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        const originalRestartTitleAnimations = graphiti.restartTitleAnimations;
        let restartCount = 0;

        graphiti.restartTitleAnimations = () => {
            restartCount++;
        };

        try {
            graphiti.currentState = graphiti.states.TITLE;
            graphiti.titleAnimationTimer = 0;
            graphiti.updateTitleScreen(graphiti.titleAnimationLoopInterval + 1000);
            const afterTitleRestart = {
                restartCount,
                titleAnimationTimer: graphiti.titleAnimationTimer
            };

            graphiti.currentState = graphiti.states.GRAPHING;
            graphiti.update(1000);
            return {
                afterTitleRestart,
                afterGraphingUpdate: {
                    restartCount,
                    titleAnimationTimer: graphiti.titleAnimationTimer
                }
            };
        } finally {
            graphiti.restartTitleAnimations = originalRestartTitleAnimations;
        }
    });

    assert.strictEqual(titleAnimationRestartResult.afterTitleRestart.restartCount, 1, 'idle title screen should restart animations on the title timer');
    assert.strictEqual(titleAnimationRestartResult.afterTitleRestart.titleAnimationTimer, 0, 'title animation timer should reset after restarting animations');
    assert.strictEqual(titleAnimationRestartResult.afterGraphingUpdate.restartCount, 1, 'graphing updates should not restart title animations');

    const repeatedEscapeResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        let prevented = false;

        graphiti.changeState(graphiti.states.GRAPHING);
        graphiti.handleKeyboard({
            key: 'Escape',
            repeat: true,
            preventDefault: () => {
                prevented = true;
            }
        });

        return {
            state: graphiti.currentState,
            prevented
        };
    });

    assert.strictEqual(repeatedEscapeResult.state, 'graphing', 'repeated Escape keydown should not return to title screen');
    assert.strictEqual(repeatedEscapeResult.prevented, false, 'repeated Escape keydown should be ignored before consuming the event');

    const hamburgerHoverCssResult = await page.evaluate(() => {
        const cssText = Array.from(document.styleSheets)
            .flatMap(sheet => Array.from(sheet.cssRules || []))
            .map(rule => rule.cssText)
            .join('\n');

        return {
            finePointerHoverRule: /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[^}]*#hamburger-menu:hover/.test(cssText),
            finePointerPanelHoverRule: /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[^}]*#hamburger-menu\.panel-open:hover/.test(cssText),
            ungatedHoverRule: /(?:^|})\s*#hamburger-menu(?:\.panel-open)?:hover\s*\{/.test(cssText)
        };
    });

    assert.strictEqual(hamburgerHoverCssResult.finePointerHoverRule, true, 'hamburger hover colour should only apply to fine hover pointers');
    assert.strictEqual(hamburgerHoverCssResult.finePointerPanelHoverRule, true, 'hamburger panel-open hover colour should only apply to fine hover pointers');
    assert.strictEqual(hamburgerHoverCssResult.ungatedHoverRule, false, 'hamburger hover colour should not be ungated on touch devices');

    const badgeTextContrastResult = await page.evaluate(() => {
        const graphiti = window.graphiti;
        return {
            greenBadgeText: graphiti.getContrastingTextColor('#00C853'),
            blueBadgeText: graphiti.getContrastingTextColor('#0057FF')
        };
    });

    assert.strictEqual(badgeTextContrastResult.greenBadgeText, '#000000', 'green curve and inflection badges should use black text');
    assert.strictEqual(badgeTextContrastResult.blueBadgeText, '#FFFFFF', 'non-green dark badges should keep white text');

    const sharedLinkDeferredPanelResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const functionPanel = document.getElementById('function-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const sharedFunctions = [{ expression: 'x^2+y^2=1', enabled: true }];

        if (functionPanel) {
            functionPanel.classList.add('hidden');
            functionPanel.classList.remove('mobile-open');
        }
        if (hamburgerMenu) {
            hamburgerMenu.classList.remove('active');
            hamburgerMenu.classList.remove('panel-open');
        }

        graphiti.deferInitialFunctionPanelOpen = graphiti.shouldShowGraphBuildOverlayForFunctions(sharedFunctions);
        graphiti.changeState(graphiti.states.GRAPHING);
        const duringBuild = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        const showBuildOverlay = await graphiti.showGraphBuildOverlayForFunctions(sharedFunctions);
        if (showBuildOverlay) {
            graphiti.hideGraphBuildOverlay();
        }
        if (graphiti.deferInitialFunctionPanelOpen) {
            graphiti.deferInitialFunctionPanelOpen = false;
            graphiti.openFunctionPanelForGraphing({ deferSlide: true });
        }
        const afterUnhide = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const afterBuild = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        const dispatchPanelTouch = (type, touchCount) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'touches', {
                value: Array.from({ length: touchCount }, (_, index) => ({
                    clientX: 120 + index * 40,
                    clientY: 160
                }))
            });
            functionPanel.dispatchEvent(event);
            return event.defaultPrevented;
        };

        const dispatchPanelGesture = (type) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            functionPanel.dispatchEvent(event);
            return event.defaultPrevented;
        };

        const panelPinchPrevention = {
            singleTouchMovePrevented: dispatchPanelTouch('touchmove', 1),
            multiTouchStartPrevented: dispatchPanelTouch('touchstart', 2),
            multiTouchMovePrevented: dispatchPanelTouch('touchmove', 2),
            gestureStartPrevented: dispatchPanelGesture('gesturestart'),
            gestureChangePrevented: dispatchPanelGesture('gesturechange')
        };

        graphiti.input.maxMoveDistance = 42;
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const tapX = canvasRect.left + Math.min(canvasRect.width - 20, 360);
        const tapY = canvasRect.top + 120;

        const originalHandleViewportChange = graphiti.handleViewportChange.bind(graphiti);
        let panViewportChangeCalls = 0;
        const originalViewport = { ...graphiti.viewport };
        const originalCartesianViewport = { ...graphiti.cartesianViewport };
        const initialMinX = graphiti.viewport.minX;
        graphiti.handleViewportChange = () => {
            panViewportChangeCalls++;
        };
        graphiti.handleTouchStart({ touches: [{ clientX: tapX, clientY: tapY }] });
        graphiti.handleTouchMove({ touches: [{ clientX: tapX + 40, clientY: tapY }] });
        graphiti.handleTouchEnd({ touches: [] });
        graphiti.handleViewportChange = originalHandleViewportChange;

        const afterCanvasPan = {
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null,
            viewportMoved: graphiti.viewport.minX !== initialMinX,
            viewportChangeCalls: panViewportChangeCalls
        };

        Object.assign(graphiti.viewport, originalViewport);
        Object.assign(graphiti.cartesianViewport, originalCartesianViewport);
        graphiti.isViewportChanging = false;
        graphiti.frozenInterceptBadges = [];
        graphiti.frozenTurningPointBadges = [];
        graphiti.interceptsPendingViewportRefresh = false;
        graphiti.turningPointsPendingViewportRefresh = false;
        graphiti.draw();

        await new Promise(resolve => setTimeout(resolve, 550));
        graphiti.openMobileMenu();

        graphiti.handleTouchStart({ touches: [{ clientX: tapX, clientY: tapY }] });
        graphiti.handleTouchEnd({ touches: [] });

        const afterFirstCanvasTap = {
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        await new Promise(resolve => setTimeout(resolve, 550));
        graphiti.openMobileMenu();

        let pinchViewportChangeCalls = 0;
        const pinchInitialRange = graphiti.viewport.maxX - graphiti.viewport.minX;
        graphiti.handleViewportChange = () => {
            pinchViewportChangeCalls++;
        };
        graphiti.handleTouchStart({
            touches: [
                { clientX: tapX - 50, clientY: tapY },
                { clientX: tapX + 50, clientY: tapY }
            ]
        });
        graphiti.handleTouchMove({
            touches: [
                { clientX: tapX - 70, clientY: tapY },
                { clientX: tapX + 70, clientY: tapY }
            ]
        });
        graphiti.handleTouchEnd({ touches: [] });
        graphiti.handleViewportChange = originalHandleViewportChange;

        const afterCanvasPinch = {
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null,
            viewportZoomed: graphiti.viewport.maxX - graphiti.viewport.minX !== pinchInitialRange,
            viewportChangeCalls: pinchViewportChangeCalls
        };

        Object.assign(graphiti.viewport, originalViewport);
        Object.assign(graphiti.cartesianViewport, originalCartesianViewport);
        graphiti.input.pinch.active = false;
        graphiti.input.touch.active = false;
        graphiti.input.touch.pendingTapAction = null;
        graphiti.isViewportChanging = false;
        graphiti.frozenInterceptBadges = [];
        graphiti.frozenTurningPointBadges = [];
        graphiti.interceptsPendingViewportRefresh = false;
        graphiti.turningPointsPendingViewportRefresh = false;
        graphiti.draw();

        graphiti.closeMobileMenu();
        graphiti.cartesianFunctions = [{
            id: 9001,
            expression: 'x',
            color: '#0057FF',
            enabled: true,
            mode: 'cartesian',
            points: []
        }];
        graphiti.plotMode = 'cartesian';
        graphiti.input.persistentBadges = [];
        graphiti.input.badgeIdCounter = 0;
        const curveScreen = graphiti.worldToScreen(0, 0);
        const curveTapX = canvasRect.left + curveScreen.x;
        const curveTapY = canvasRect.top + curveScreen.y;

        graphiti.handleTouchStart({ touches: [{ clientX: curveTapX, clientY: curveTapY }] });
        graphiti.handleTouchEnd({ touches: [] });
        const badgesAfterCurveTap = graphiti.input.persistentBadges.length;

        graphiti.input.persistentBadges = [];
        graphiti.input.badgeIdCounter = 0;
        const curvePanInitialMinX = graphiti.viewport.minX;
        let curvePanViewportChangeCalls = 0;
        graphiti.handleViewportChange = () => {
            curvePanViewportChangeCalls++;
        };
        graphiti.handleTouchStart({ touches: [{ clientX: curveTapX, clientY: curveTapY }] });
        graphiti.handleTouchMove({ touches: [{ clientX: curveTapX + 45, clientY: curveTapY }] });
        graphiti.handleTouchEnd({ touches: [] });
        graphiti.handleViewportChange = originalHandleViewportChange;

        const curveTouchTrace = {
            badgesAfterTap: badgesAfterCurveTap,
            badgesAfterPan: graphiti.input.persistentBadges.length,
            viewportMoved: graphiti.viewport.minX !== curvePanInitialMinX,
            viewportChangeCalls: curvePanViewportChangeCalls
        };

        Object.assign(graphiti.viewport, originalViewport);
        Object.assign(graphiti.cartesianViewport, originalCartesianViewport);
        graphiti.input.persistentBadges = [];
        graphiti.input.badgeIdCounter = 0;
        graphiti.input.touch.active = false;
        graphiti.input.touch.pendingTapAction = null;
        graphiti.isViewportChanging = false;
        graphiti.frozenInterceptBadges = [];
        graphiti.frozenTurningPointBadges = [];
        graphiti.interceptsPendingViewportRefresh = false;
        graphiti.turningPointsPendingViewportRefresh = false;
        graphiti.draw();

        graphiti.handlePointerStart(curveTapX, curveTapY);
        graphiti.handlePointerEnd();
        const badgesAfterMouseCurveClick = graphiti.input.persistentBadges.length;

        graphiti.input.persistentBadges = [];
        graphiti.input.badgeIdCounter = 0;
        const curveMousePanInitialMinX = graphiti.viewport.minX;
        let curveMousePanViewportChangeCalls = 0;
        graphiti.handleViewportChange = () => {
            curveMousePanViewportChangeCalls++;
        };
        graphiti.handlePointerStart(curveTapX, curveTapY);
        graphiti.handlePointerMove(curveTapX + 45, curveTapY);
        graphiti.handlePointerEnd();
        graphiti.handleViewportChange = originalHandleViewportChange;

        const curveMouseTrace = {
            badgesAfterClick: badgesAfterMouseCurveClick,
            badgesAfterDrag: graphiti.input.persistentBadges.length,
            viewportMoved: graphiti.viewport.minX !== curveMousePanInitialMinX,
            viewportChangeCalls: curveMousePanViewportChangeCalls
        };

        Object.assign(graphiti.viewport, originalViewport);
        Object.assign(graphiti.cartesianViewport, originalCartesianViewport);
        graphiti.cartesianFunctions = [];
        graphiti.input.persistentBadges = [];
        graphiti.input.pinch.active = false;
        graphiti.input.touch.active = false;
        graphiti.input.touch.pendingTapAction = null;
        graphiti.isViewportChanging = false;
        graphiti.frozenInterceptBadges = [];
        graphiti.frozenTurningPointBadges = [];
        graphiti.interceptsPendingViewportRefresh = false;
        graphiti.turningPointsPendingViewportRefresh = false;
        graphiti.draw();

        await new Promise(resolve => setTimeout(resolve, 550));
        graphiti.openMobileMenu();

        const originalZoomIn = graphiti.zoomIn.bind(graphiti);
        let wheelZoomCalls = 0;
        let wheelPrevented = false;
        graphiti.zoomIn = () => {
            wheelZoomCalls++;
        };
        graphiti.handleWheel({
            deltaY: -1,
            preventDefault: () => {
                wheelPrevented = true;
            }
        });
        graphiti.zoomIn = originalZoomIn;

        const afterCanvasWheel = {
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null,
            wheelZoomCalls,
            wheelPrevented
        };

        graphiti.handleMobileLayout(true);

        const afterForcedMobileLayout = {
            panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        graphiti.closeMobileMenu();

        await new Promise(resolve => setTimeout(resolve, 550));
        graphiti.openMobileMenu();

        const originalAddDemoSet = graphiti.addDemoSet;
        let selectedDemoSetId = null;
        graphiti.addDemoSet = (demoSetId) => {
            selectedDemoSetId = demoSetId;
        };

        const demoSetItem = document.querySelector('.demo-set-item[data-demo-set="explicit-functions"]');
        if (demoSetItem) {
            demoSetItem.click();
        }
        graphiti.addDemoSet = originalAddDemoSet;

        const afterDemoSetMenuClick = {
            selectedDemoSetId,
            panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
            hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
        };

        return {
            showBuildOverlay,
            duringBuild,
            afterUnhide,
            afterBuild,
            panelPinchPrevention,
            afterCanvasPan,
            afterFirstCanvasTap,
            curveTouchTrace,
            curveMouseTrace,
            afterCanvasPinch,
            afterCanvasWheel,
            afterForcedMobileLayout,
            afterDemoSetMenuClick
        };
    });

    assert.strictEqual(sharedLinkDeferredPanelResult.showBuildOverlay, true, 'shared-link implicit graph should show startup build overlay');
    assert.strictEqual(sharedLinkDeferredPanelResult.duringBuild.panelHidden, true, 'shared-link build should keep function panel hidden');
    assert.strictEqual(sharedLinkDeferredPanelResult.duringBuild.panelOpen, false, 'shared-link build should not start panel slide-in');
    assert.strictEqual(sharedLinkDeferredPanelResult.duringBuild.hamburgerPanelOpen, false, 'shared-link build should not mark hamburger as panel-open');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterUnhide.panelHidden, false, 'shared-link build completion should unhide function panel before opening it');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterUnhide.panelOpen, false, 'shared-link build completion should leave an offscreen frame before slide-in');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterUnhide.hamburgerPanelOpen, false, 'shared-link build completion should not mark hamburger as panel-open before slide-in');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterBuild.panelHidden, false, 'shared-link build completion should show function panel');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterBuild.panelOpen, true, 'shared-link build completion should start panel slide-in');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterBuild.hamburgerPanelOpen, true, 'shared-link build completion should mark hamburger as panel-open');
    assert.strictEqual(sharedLinkDeferredPanelResult.panelPinchPrevention.singleTouchMovePrevented, false, 'function panel should keep single-touch scrolling available');
    assert.strictEqual(sharedLinkDeferredPanelResult.panelPinchPrevention.multiTouchStartPrevented, true, 'function panel should prevent two-touch pinch start');
    assert.strictEqual(sharedLinkDeferredPanelResult.panelPinchPrevention.multiTouchMovePrevented, true, 'function panel should prevent two-touch pinch movement');
    assert.strictEqual(sharedLinkDeferredPanelResult.panelPinchPrevention.gestureStartPrevented, true, 'function panel should prevent Safari gesture start');
    assert.strictEqual(sharedLinkDeferredPanelResult.panelPinchPrevention.gestureChangePrevented, true, 'function panel should prevent Safari gesture change');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPan.panelOpen, false, 'shared-link first canvas pan should close function panel');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPan.hamburgerPanelOpen, false, 'shared-link first canvas pan should restore hamburger closed state');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPan.viewportMoved, true, 'shared-link first canvas pan should still move the viewport');
    assert(sharedLinkDeferredPanelResult.afterCanvasPan.viewportChangeCalls > 0, 'shared-link first canvas pan should still request viewport refresh');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterFirstCanvasTap.panelOpen, false, 'shared-link first canvas tap should close function panel even after stale touch movement state');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterFirstCanvasTap.hamburgerPanelOpen, false, 'shared-link first canvas tap should restore hamburger closed state');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveTouchTrace.badgesAfterTap, 1, 'touch tap on a curve should add a trace badge');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveTouchTrace.badgesAfterPan, 0, 'touch pan starting on a curve should not add a trace badge');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveTouchTrace.viewportMoved, true, 'touch pan starting on a curve should pan the viewport');
    assert(sharedLinkDeferredPanelResult.curveTouchTrace.viewportChangeCalls > 0, 'touch pan starting on a curve should request viewport refresh');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveMouseTrace.badgesAfterClick, 1, 'mouse click on a curve should add a trace badge');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveMouseTrace.badgesAfterDrag, 0, 'mouse drag starting on a curve should not add a trace badge');
    assert.strictEqual(sharedLinkDeferredPanelResult.curveMouseTrace.viewportMoved, true, 'mouse drag starting on a curve should pan the viewport');
    assert(sharedLinkDeferredPanelResult.curveMouseTrace.viewportChangeCalls > 0, 'mouse drag starting on a curve should request viewport refresh');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPinch.panelOpen, false, 'shared-link canvas pinch should close function panel on narrow screens');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPinch.hamburgerPanelOpen, false, 'shared-link canvas pinch should restore hamburger closed state');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasPinch.viewportZoomed, true, 'shared-link canvas pinch should still zoom the viewport');
    assert(sharedLinkDeferredPanelResult.afterCanvasPinch.viewportChangeCalls > 0, 'shared-link canvas pinch should still request viewport refresh');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasWheel.panelOpen, true, 'canvas wheel zoom should not close function panel on narrow screens');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasWheel.hamburgerPanelOpen, true, 'canvas wheel zoom should leave hamburger in panel-open state');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasWheel.wheelZoomCalls, 1, 'canvas wheel zoom should still invoke zoom handling');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterCanvasWheel.wheelPrevented, true, 'canvas wheel zoom should prevent browser default zoom');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterForcedMobileLayout.panelHidden, false, 'forced mobile layout update should keep an open function panel visible');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterForcedMobileLayout.panelOpen, true, 'forced mobile layout update should preserve an open function panel');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterForcedMobileLayout.hamburgerPanelOpen, true, 'forced mobile layout update should preserve hamburger panel-open state');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterDemoSetMenuClick.selectedDemoSetId, 'explicit-functions', 'demo set menu click should request the selected demo set');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterDemoSetMenuClick.panelOpen, false, 'demo set menu click should close function panel on narrow screens');
    assert.strictEqual(sharedLinkDeferredPanelResult.afterDemoSetMenuClick.hamburgerPanelOpen, false, 'demo set menu click should restore hamburger closed state on narrow screens');

    const resumePanelResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const functionPanel = document.getElementById('function-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const originalShowGraphBuildOverlayForFunctions = graphiti.showGraphBuildOverlayForFunctions.bind(graphiti);
        const originalUpdateIntegralPairs = graphiti.updateIntegralPairs.bind(graphiti);
        const originalEnsureAnimationLoopRunning = graphiti.ensureAnimationLoopRunning.bind(graphiti);

        graphiti.showGraphBuildOverlayForFunctions = async () => false;
        graphiti.updateIntegralPairs = () => {};
        graphiti.ensureAnimationLoopRunning = () => {};

        const results = [];
        try {
            graphiti.currentState = graphiti.states.GRAPHING;

            for (const mode of ['cartesian', 'polar']) {
                graphiti.plotMode = mode;
                if (functionPanel) {
                    functionPanel.classList.add('hidden');
                    functionPanel.classList.remove('mobile-open');
                }
                if (hamburgerMenu) {
                    hamburgerMenu.classList.remove('active');
                    hamburgerMenu.classList.remove('panel-open');
                }

                await graphiti.handleAppResume();

                results.push({
                    mode,
                    panelHidden: functionPanel ? functionPanel.classList.contains('hidden') : null,
                    panelOpen: functionPanel ? functionPanel.classList.contains('mobile-open') : null,
                    hamburgerPanelOpen: hamburgerMenu ? hamburgerMenu.classList.contains('panel-open') : null
                });
            }
        } finally {
            graphiti.showGraphBuildOverlayForFunctions = originalShowGraphBuildOverlayForFunctions;
            graphiti.updateIntegralPairs = originalUpdateIntegralPairs;
            graphiti.ensureAnimationLoopRunning = originalEnsureAnimationLoopRunning;
        }

        return results;
    });

    for (const result of resumePanelResult) {
        assert.strictEqual(result.panelHidden, false, `${result.mode} app resume should unhide the function panel`);
        assert.strictEqual(result.panelOpen, true, `${result.mode} app resume should open the function panel`);
        assert.strictEqual(result.hamburgerPanelOpen, true, `${result.mode} app resume should mark hamburger panel-open`);
    }

    const sharedHashReplacementResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const makeSharedState = (expression, id) => ({
            v: 1,
            functions: [{ id, expression, color: '#B91C1C', enabled: true }],
            viewport: { minX: -5, maxX: 5, minY: -5, maxY: 5, scale: 80 },
            mode: 'cartesian',
            settings: {
                theme: 'dark',
                angleMode: 'radians',
                showIntersections: false,
                showIntercepts: false,
                showTurningPoints: false
            },
            parameters: { alpha: 1, beta: 1, gamma: 1, delta: 1 }
        });

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        await graphiti.applySharedStateFromUrl(makeSharedState('y=x', 21));
        const initialSharedViewport = {
            minX: graphiti.viewport.minX,
            maxX: graphiti.viewport.maxX,
            minY: graphiti.viewport.minY,
            maxY: graphiti.viewport.maxY,
            scale: graphiti.viewport.scale,
            width: graphiti.viewport.width,
            height: graphiti.viewport.height
        };
        graphiti.input.persistentBadges = [{ id: 99, functionId: 21, worldX: 0, worldY: 0 }];
        graphiti.input.badgeIdCounter = 100;
        graphiti.integralPairs = [{ badge1Id: 99, badge2Id: 100 }];
        graphiti.linkedBadgePairs = [{ pair1: { badge1Id: 99, badge2Id: 100 }, pair2: { badge1Id: 101, badge2Id: 102 } }];

        const nextState = makeSharedState('y=x^2', 22);
        window.location.hash = `#v=${LZString.compressToEncodedURIComponent(JSON.stringify(nextState))}`;

        for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (graphiti.getCurrentFunctions().some(func => func.expression === 'y=x^2')) {
                break;
            }
        }

        return {
            expressions: graphiti.getCurrentFunctions().map(func => func.expression),
            badgeCount: graphiti.input.persistentBadges.length,
            badgeIdCounter: graphiti.input.badgeIdCounter,
            integralPairCount: graphiti.integralPairs.length,
            linkedBadgePairCount: graphiti.linkedBadgePairs.length,
            tempSession: graphiti.tempSession,
            state: graphiti.currentState,
            initialSharedViewport
        };
    });

    assert.deepStrictEqual(sharedHashReplacementResult.expressions, ['y=x^2', ''], 'same-tab shared URL replacement should apply the new hash state');
    assert.strictEqual(sharedHashReplacementResult.badgeCount, 0, 'same-tab shared URL replacement should clear badges omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.badgeIdCounter, 0, 'same-tab shared URL replacement should reset badge IDs when the new state has no badges');
    assert.strictEqual(sharedHashReplacementResult.integralPairCount, 0, 'same-tab shared URL replacement should clear integral pairs omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.linkedBadgePairCount, 0, 'same-tab shared URL replacement should clear linked badge pairs omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.tempSession, true, 'same-tab shared URL replacement should remain in temporary shared-link mode');
    assert.strictEqual(sharedHashReplacementResult.state, 'graphing', 'same-tab shared URL replacement should stay in graphing state');
    assert(Math.abs(sharedHashReplacementResult.initialSharedViewport.scale - 72) < 1e-9, `shared URL square viewport should fit the 960x720 canvas scale: ${JSON.stringify(sharedHashReplacementResult.initialSharedViewport)}`);
    assert(Math.abs(sharedHashReplacementResult.initialSharedViewport.minX + (20 / 3)) < 1e-9, `shared URL square viewport should expand x-min for canvas aspect: ${JSON.stringify(sharedHashReplacementResult.initialSharedViewport)}`);
    assert(Math.abs(sharedHashReplacementResult.initialSharedViewport.maxX - (20 / 3)) < 1e-9, `shared URL square viewport should expand x-max for canvas aspect: ${JSON.stringify(sharedHashReplacementResult.initialSharedViewport)}`);
    assert.strictEqual(sharedHashReplacementResult.initialSharedViewport.minY, -5, 'shared URL square viewport should preserve y-min when height is limiting');
    assert.strictEqual(sharedHashReplacementResult.initialSharedViewport.maxY, 5, 'shared URL square viewport should preserve y-max when height is limiting');

    const manuallyEditedFunctionId = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('');
        const func = graphiti.cartesianFunctions[0];
        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const mathField = item ? item.querySelector('.function-main-row math-field') : null;
        if (mathField && typeof mathField.setValue === 'function') {
            mathField.setValue('x^2+y^2=1');
        } else if (mathField) {
            mathField.value = 'x^2+y^2=1';
        }
        mathField.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        return func.id;
    });

    await page.waitForFunction((functionId) => {
        const item = document.querySelector(`[data-function-id="${functionId}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;
        return !!shapeContainer && shapeContainer.classList.contains('visible') && shapeValue && shapeValue.textContent === 'circle';
    }, manuallyEditedFunctionId, { timeout: 3000 });

    const cancelledRationalFunctionId = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('');
        const func = graphiti.cartesianFunctions[0];
        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const mathField = item ? item.querySelector('.function-main-row math-field') : null;
        const expression = 'y=\\frac{\\left(x-2\\right)\\left(x+1\\right)}{\\left(x-2\\right)}';
        if (mathField && typeof mathField.setValue === 'function') {
            mathField.setValue(expression);
        } else if (mathField) {
            mathField.value = expression;
        }
        mathField.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        return func.id;
    });

    const cancelledRationalDomResult = await page.waitForFunction((functionId) => {
        const graphiti = window.graphiti;
        const func = graphiti.cartesianFunctions.find(candidate => candidate.id === functionId);
        const item = document.querySelector(`[data-function-id="${functionId}"]`);
        const asymptoteContainer = item ? item.querySelector('.asymptote-info-container') : null;
        const holesContainer = item ? item.querySelector('.holes-info-container') : null;
        const holeItems = holesContainer ? Array.from(holesContainer.querySelectorAll('.holes-equation-item, .asymptote-equation-item')) : [];
        const hasHole = Array.isArray(func && func.holes) && func.holes.some(hole => Math.abs(hole.x - 2) < 1e-6 && Math.abs(hole.y - 3) < 1e-6);
        if (!func || !hasHole || !holesContainer || !holesContainer.classList.contains('visible')) {
            return false;
        }
        return {
            obliqueCount: func.asymptoteData && Array.isArray(func.asymptoteData.oblique) ? func.asymptoteData.oblique.length : null,
            asymptotesVisible: asymptoteContainer ? asymptoteContainer.classList.contains('visible') : null,
            holeCount: holeItems.length
        };
    }, cancelledRationalFunctionId, { timeout: 3000 });

    const cancelledRationalMetadata = await cancelledRationalDomResult.jsonValue();
    assert.strictEqual(cancelledRationalMetadata.obliqueCount, 0, 'cancelled explicit rational should not store oblique asymptotes');
    assert.strictEqual(cancelledRationalMetadata.asymptotesVisible, false, 'cancelled explicit rational asymptote row should stay hidden');
    assert(cancelledRationalMetadata.holeCount > 0, 'cancelled explicit rational hole row should render');

    const goldenRatioAsymptoteDomResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('x^2-y^2+x*y=1');
        const func = graphiti.cartesianFunctions[0];
        await graphiti.plotFunction(func);
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const fields = item ? Array.from(item.querySelectorAll('.asymptote-equation-item')) : [];
        return {
            equations: typeof graphiti.buildAsymptoteDisplayLatex === 'function'
                ? graphiti.buildAsymptoteDisplayLatex(func)
                : [],
            renderedText: fields.map(field => field.textContent || ''),
            fieldValues: fields.map(field => field.value || '')
        };
    });

    assert(
        goldenRatioAsymptoteDomResult.equations.some(equation => /\\varphi\s+x/.test(equation)),
        `golden ratio asymptote LaTeX should separate coefficient and x: ${JSON.stringify(goldenRatioAsymptoteDomResult)}`
    );
    assert(
        !goldenRatioAsymptoteDomResult.fieldValues.some(value => value.includes('\\varphix')),
        `golden ratio asymptote should not emit unknown \\varphix command: ${JSON.stringify(goldenRatioAsymptoteDomResult)}`
    );

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
        const shapeTitle = shapeContainer ? shapeContainer.querySelector('.shape-info-title') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;

        return {
            title: shapeTitle ? shapeTitle.textContent : null,
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false
        };
    });

    assert.strictEqual(polarDomResult.title, 'Shape', 'polar equation metadata title should remain Shape');
    assert.strictEqual(polarDomResult.renderedLabel, 'cardioid', 'polar shape label should render in function panel');
    assert.strictEqual(polarDomResult.visible, true, 'polar shape row should be visible');

    const polarInequalityDomResult = await page.evaluate(() => {
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

        graphiti.addFunction('r<1+cos(theta)');
        const func = graphiti.polarFunctions[0];
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeTitle = shapeContainer ? shapeContainer.querySelector('.shape-info-title') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;

        return {
            title: shapeTitle ? shapeTitle.textContent : null,
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false
        };
    });

    assert.strictEqual(polarInequalityDomResult.title, 'Boundary', 'polar inequality metadata title should render as Boundary');
    assert.strictEqual(polarInequalityDomResult.renderedLabel, 'cardioid', 'polar inequality boundary label should render text');
    assert.strictEqual(polarInequalityDomResult.visible, true, 'polar inequality boundary row should be visible');

    const implicitPolarDomResult = await page.evaluate(async () => {
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

        graphiti.addFunction('2*r+cos(t)-1=0');
        const func = graphiti.polarFunctions[0];
        await graphiti.plotFunction(func);
        graphiti.updateFunctionAsymptoteInfo(func);

        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const shapeContainer = item ? item.querySelector('.shape-info-container') : null;
        const shapeTitle = shapeContainer ? shapeContainer.querySelector('.shape-info-title') : null;
        const shapeValue = shapeContainer ? shapeContainer.querySelector('.shape-info-value') : null;

        return {
            title: shapeTitle ? shapeTitle.textContent : null,
            renderedLabel: shapeValue ? shapeValue.textContent : null,
            visible: shapeContainer ? shapeContainer.classList.contains('visible') : false,
            renderMode: func.implicitRenderMode || null
        };
    });

    assert.strictEqual(implicitPolarDomResult.title, 'Shape', 'implicit polar equation metadata title should remain Shape');
    assert.strictEqual(implicitPolarDomResult.renderedLabel, 'cardioid', 'implicit polar shape label should match affine explicit equivalent');
    assert.strictEqual(implicitPolarDomResult.visible, true, 'implicit polar shape row should be visible');
    assert.strictEqual(implicitPolarDomResult.renderMode, 'affine-polar-explicit', 'implicit polar metadata test should hit affine polar fast-path');
}

async function assertStrictImplicitInequalityVerticalComponentsAreDashed(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        Object.assign(graphiti.viewport, {
            minX: -2,
            maxX: 2,
            minY: -2,
            maxY: 2,
            width: 400,
            height: 400
        });

        const createRecordingContext = () => ({
            dashHistory: [],
            save() {},
            restore() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            setLineDash(value) {
                this.dashHistory.push(Array.isArray(value) ? value.slice() : value);
            }
        });

        const strictContext = createRecordingContext();
        graphiti.drawExplicitImplicitVerticalComponents({
            expression: 'x<1',
            color: '#0057FF',
            affineVerticalComponents: [1]
        }, strictContext);

        const nonStrictContext = createRecordingContext();
        graphiti.drawExplicitImplicitVerticalComponents({
            expression: 'x<=1',
            color: '#0057FF',
            affineVerticalComponents: [1]
        }, nonStrictContext);

        const originalCanvas = graphiti.canvas;
        const originalCtx = graphiti.ctx;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d', { alpha: true });
        graphiti.canvas = canvas;
        graphiti.ctx = ctx;

        let verticalOverlayCallCount = 0;
        const originalDrawVerticalComponents = graphiti.drawExplicitImplicitVerticalComponents;
        graphiti.drawExplicitImplicitVerticalComponents = function(...args) {
            verticalOverlayCallCount++;
            return originalDrawVerticalComponents.apply(this, args);
        };

        graphiti.drawFunction({
            id: 9001,
            expression: 'x>1',
            color: '#00C853',
            enabled: true,
            mode: 'cartesian',
            points: [
                { x: NaN, y: NaN, connected: false },
                { x: 1, y: -4, connected: false },
                { x: 1, y: 4, connected: true },
                { x: NaN, y: NaN, connected: false }
            ],
            displayPoints: [
                { x: NaN, y: NaN, connected: false },
                { x: 1, y: -4, connected: false },
                { x: 1, y: 4, connected: true },
                { x: NaN, y: NaN, connected: false }
            ],
            implicitRenderMode: 'single-variable-boundary',
            singleVariableImplicitVerticalComponents: [1]
        });

        graphiti.drawExplicitImplicitVerticalComponents = originalDrawVerticalComponents;

        graphiti.canvas = originalCanvas;
        graphiti.ctx = originalCtx;

        return {
            strictDash: strictContext.dashHistory[strictContext.dashHistory.length - 1],
            nonStrictDash: nonStrictContext.dashHistory[nonStrictContext.dashHistory.length - 1],
            verticalOverlayCallCount
        };
    });

    assert(Array.isArray(result.strictDash) && result.strictDash.length > 0, 'strict implicit inequality vertical component should be dashed');
    assert.deepStrictEqual(result.nonStrictDash, [], 'non-strict implicit inequality vertical component should remain solid');
    assert.strictEqual(result.verticalOverlayCallCount, 0, 'single-variable implicit inequality boundary should not be double-stroked by the vertical component overlay');
}

async function assertPolarThetaRangeErrorRecovery(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.polarSettings.thetaMinLatex = '0';
        graphiti.polarSettings.thetaMaxLatex = '2\\pi';

        const thetaMinInput = document.getElementById('theta-min');
        const thetaMaxInput = document.getElementById('theta-max');
        if (!thetaMinInput || !thetaMaxInput) {
            return { missingInputs: true };
        }

        const waitForUi = async () => {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        };

        graphiti.setRangeValue(thetaMinInput, '0');
        graphiti.setRangeValue(thetaMaxInput, '2\\pi');
        thetaMinInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        thetaMaxInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await waitForUi();

        graphiti.addFunction('r=theta');
        await graphiti.plotFunction(graphiti.polarFunctions[0]);

        // Force invalid equal range.
        graphiti.setRangeValue(thetaMinInput, '2\\pi');
        thetaMinInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await waitForUi();

        const bothErroredWhenEqual =
            thetaMinInput.classList.contains('input-error') &&
            thetaMaxInput.classList.contains('input-error');

        // Correct back to a valid range via the same edited field.
        graphiti.setRangeValue(thetaMinInput, '0');
        thetaMinInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await waitForUi();

        const thetaFunc = graphiti.polarFunctions[0];
        const finitePointCount = (thetaFunc && Array.isArray(thetaFunc.points)
            ? thetaFunc.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).length
            : 0);

        return {
            missingInputs: false,
            bothErroredWhenEqual,
            minErroredAfterFix: thetaMinInput.classList.contains('input-error'),
            maxErroredAfterFix: thetaMaxInput.classList.contains('input-error'),
            thetaMin: graphiti.polarSettings.thetaMin,
            thetaMax: graphiti.polarSettings.thetaMax,
            finitePointCount
        };
    });

    assert.strictEqual(result.missingInputs, false, `polar theta recovery test requires theta range inputs: ${JSON.stringify(result)}`);
    assert.strictEqual(result.bothErroredWhenEqual, true, `equal polar theta range should flag both inputs: ${JSON.stringify(result)}`);
    assert.strictEqual(result.minErroredAfterFix, false, `theta min input error should clear after valid correction: ${JSON.stringify(result)}`);
    assert.strictEqual(result.maxErroredAfterFix, false, `theta max input error should clear after valid correction: ${JSON.stringify(result)}`);
    assert(approxEqual(result.thetaMin, 0, 1e-9), `theta min should recover to 0 after correction: ${JSON.stringify(result)}`);
    assert(approxEqual(result.thetaMax, 2 * Math.PI, 1e-9), `theta max should remain at 2pi after correction: ${JSON.stringify(result)}`);
    assert(result.finitePointCount > 100, `polar replot should recover with substantial finite points after correction: ${JSON.stringify(result)}`);
}

async function assertPolarThetaRangeRestoreUsesSavedMaxUnlessInterrupted(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;

        const staleBounds = {
            thetaMin: '0',
            thetaMax: String(4 * Math.PI),
            thetaMinLatex: '0',
            thetaMaxLatex: '4\\pi',
            angleMode: 'radians',
            storedThetaMax: String(2 * Math.PI)
        };

        localStorage.setItem('graphiti_polar_bounds', JSON.stringify(staleBounds));
        graphiti.loadAndApplyViewportBounds();

        graphiti.addFunction('r=theta');
        await graphiti.plotFunction(graphiti.polarFunctions[0]);

        const staleCaseMaxRadius = graphiti.polarFunctions[0].points
            .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            .reduce((maxRadius, point) => {
                const radius = Math.hypot(point.x, point.y);
                return Number.isFinite(radius) && radius > maxRadius ? radius : maxRadius;
            }, 0);

        const staleCase = {
            thetaMax: graphiti.polarSettings.thetaMax,
            thetaMaxLatex: graphiti.polarSettings.thetaMaxLatex,
            maxRadius: staleCaseMaxRadius
        };

        // Simulate an interrupted animation save where thetaMax is mid-run but
        // storedThetaMax preserves the original larger user range.
        const interruptedBounds = {
            thetaMin: '0',
            thetaMax: String(2 * Math.PI),
            thetaMinLatex: '0',
            thetaMaxLatex: '2\\pi',
            angleMode: 'radians',
            storedThetaMax: String(4 * Math.PI)
        };

        localStorage.setItem('graphiti_polar_bounds', JSON.stringify(interruptedBounds));
        graphiti.loadAndApplyViewportBounds();

        return {
            staleCase,
            interruptedCaseThetaMax: graphiti.polarSettings.thetaMax
        };
    });

    assert(
        approxEqual(result.staleCase.thetaMax, 4 * Math.PI, 1e-9),
        `stale smaller storedThetaMax must not override saved thetaMax: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.staleCase.thetaMaxLatex,
        '4\\pi',
        `theta max latex should remain aligned with restored saved range: ${JSON.stringify(result)}`
    );
    assert(
        result.staleCase.maxRadius > 10,
        `first polar plot after restore should reflect 4pi range (expected max radius > 10): ${JSON.stringify(result)}`
    );
    assert(
        approxEqual(result.interruptedCaseThetaMax, 4 * Math.PI, 1e-9),
        `larger storedThetaMax should still restore interrupted animation range: ${JSON.stringify(result)}`
    );
}

async function assertImplicitPolarAnimationReplotStaysConsistent(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showTurningPoints = true;
        graphiti.polarSettings.plotNegativeR = true;
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.polarSettings.thetaMinLatex = '0';
        graphiti.polarSettings.thetaMaxLatex = '2\\pi';

        const expression = '\\frac{r-2\\cos\\left(\\theta\\right)}{\\theta-\\frac{\\pi}{2}}=1';
        graphiti.addFunction(expression);
        const func = graphiti.polarFunctions[0];
        await graphiti.plotFunction(func);

        const equation = graphiti.parseImplicitEquation(expression);
        const polarEquation = equation ? { ...equation, coordinateSystem: 'polar' } : null;

        const finitePoints = () => (Array.isArray(func.points)
            ? func.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            : []);

        const computeMaxResidual = () => {
            if (!polarEquation) {
                return NaN;
            }

            let maxResidual = 0;
            for (const point of finitePoints()) {
                const value = graphiti.evaluateImplicitEquation(polarEquation, point.x, point.y);
                if (!Number.isFinite(value)) {
                    continue;
                }
                const residual = Math.abs(value);
                if (residual > maxResidual) {
                    maxResidual = residual;
                }
            }
            return maxResidual;
        };

        const nearestDistanceToCurvePixels = (x, y) => {
            const points = Array.isArray(func.displayPoints) && func.displayPoints.length > 0
                ? func.displayPoints
                : (Array.isArray(func.points) ? func.points : []);
            if (points.length < 2) {
                return Infinity;
            }

            const target = graphiti.worldToScreen(x, y);
            let best = Infinity;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
                    continue;
                }
                if (p2.connected === false) {
                    continue;
                }

                const nearest = graphiti.closestPointOnSegment(p1.x, p1.y, p2.x, p2.y, target.x, target.y);
                if (nearest && Number.isFinite(nearest.distance) && nearest.distance < best) {
                    best = nearest.distance;
                }
            }

            return best;
        };

        const collectRadialTurningDistances = () => {
            const points = graphiti.findTurningPoints().filter(point =>
                point && point.func && point.func.id === func.id &&
                (point.type === 'radialMinimum' || point.type === 'radialMaximum' || point.type === 'polarStationary')
            );

            return points.map(point => ({
                type: point.type,
                distancePx: nearestDistanceToCurvePixels(point.x, point.y)
            }));
        };

        const residualBefore = computeMaxResidual();
        const finitePointCountBefore = finitePoints().length;
        const turningDistancesBefore = collectRadialTurningDistances();

        graphiti.replotAllPolarFunctions();

        const residualAfterReplot = computeMaxResidual();
        const finitePointCountAfterReplot = finitePoints().length;
        const turningDistancesAfter = collectRadialTurningDistances();

        return {
            residualBefore,
            residualAfterReplot,
            finitePointCountBefore,
            finitePointCountAfterReplot,
            turningDistancesBefore,
            turningDistancesAfter
        };
    });

    assert(
        Number.isFinite(result.residualAfterReplot),
        `implicit polar replot residual should be finite: ${JSON.stringify(result)}`
    );
    assert(
        result.residualAfterReplot <= 5e-3,
        `implicit polar cached replot should preserve denominator-cleared filtering (residual too large): ${JSON.stringify(result)}`
    );
    assert(
        Math.abs(result.finitePointCountAfterReplot - result.finitePointCountBefore) <= 40,
        `implicit polar cached replot should keep similar visible geometry density: ${JSON.stringify(result)}`
    );

    for (const turningPoint of result.turningDistancesBefore) {
        assert(
            Number.isFinite(turningPoint.distancePx) && turningPoint.distancePx <= 20,
            `polar turning point badge should stay near rendered curve before replot: ${JSON.stringify(result)}`
        );
    }
    for (const turningPoint of result.turningDistancesAfter) {
        assert(
            Number.isFinite(turningPoint.distancePx) && turningPoint.distancePx <= 20,
            `polar turning point badge should stay near rendered curve after replot: ${JSON.stringify(result)}`
        );
    }
}

async function assertExplicitPolarSingularRayAsymptotes(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.polarSettings.thetaMinLatex = '0';
        graphiti.polarSettings.thetaMaxLatex = '2\\pi';

        const asymptoticExpr = 'r=\\frac{1}{\\theta-\\frac{\\pi}{2}}';
        graphiti.addFunction(asymptoticExpr);
        const asymptoticFunc = graphiti.polarFunctions[0];
        await graphiti.plotFunction(asymptoticFunc);

        const asymptoticRays = asymptoticFunc.asymptoteData && Array.isArray(asymptoticFunc.asymptoteData.polarRays)
            ? asymptoticFunc.asymptoteData.polarRays.slice()
            : [];
        const asymptoticDisplay = graphiti.buildAsymptoteDisplayLatex(asymptoticFunc);
        const asymptoticConnectedStraddleCount = (() => {
            const points = Array.isArray(asymptoticFunc.points) ? asymptoticFunc.points : [];
            const rays = asymptoticRays.filter(Number.isFinite);
            let count = 0;

            for (let index = 1; index < points.length; index++) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current || previous.connected === false || current.connected === false) {
                    continue;
                }
                if (!Number.isFinite(previous.x) || !Number.isFinite(previous.y) || !Number.isFinite(current.x) || !Number.isFinite(current.y)) {
                    continue;
                }
                if (!Number.isFinite(previous.theta) || !Number.isFinite(current.theta)) {
                    continue;
                }

                const minTheta = Math.min(previous.theta, current.theta);
                const maxTheta = Math.max(previous.theta, current.theta);
                if (rays.some(theta => {
                    const prevOffset = previous.theta - theta;
                    const currentOffset = current.theta - theta;
                    return (prevOffset === 0 || currentOffset === 0 || (prevOffset * currentOffset) < 0) && maxTheta > minTheta;
                })) {
                    count++;
                }
            }

            return count;
        })();
        const asymptoticBridgeSegments = (() => {
            const points = Array.isArray(asymptoticFunc.points) ? asymptoticFunc.points : [];
            let suspicious = 0;
            const distanceToOriginFromSegment = (x1, y1, x2, y2) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthSq = (dx * dx) + (dy * dy);
                if (!Number.isFinite(lengthSq) || lengthSq <= 1e-12) {
                    return Math.hypot(x1, y1);
                }
                const t = Math.max(0, Math.min(1, -((x1 * dx) + (y1 * dy)) / lengthSq));
                const px = x1 + (t * dx);
                const py = y1 + (t * dy);
                return Math.hypot(px, py);
            };

            for (let index = 1; index < points.length; index++) {
                const previous = points[index - 1];
                const current = points[index];
                if (!previous || !current || current.connected === false || previous.connected === false) {
                    continue;
                }
                if (!Number.isFinite(previous.x) || !Number.isFinite(previous.y) || !Number.isFinite(current.x) || !Number.isFinite(current.y)) {
                    continue;
                }

                const previousRadius = Math.hypot(previous.x, previous.y);
                const currentRadius = Math.hypot(current.x, current.y);
                const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
                if (segmentLength < 3 || Math.min(previousRadius, currentRadius) < 1.5) {
                    continue;
                }

                const nearestToOrigin = distanceToOriginFromSegment(previous.x, previous.y, current.x, current.y);
                if (nearestToOrigin < 0.18) {
                    suspicious++;
                }
            }

            return suspicious;
        })();

        const boundedExpr = 'r=\\frac{\\theta-\\frac{\\pi}{2}}{\\theta-\\frac{\\pi}{2}}';
        graphiti.addFunction(boundedExpr);
        const boundedFunc = graphiti.polarFunctions[1];
        await graphiti.plotFunction(boundedFunc);

        const boundedRays = boundedFunc.asymptoteData && Array.isArray(boundedFunc.asymptoteData.polarRays)
            ? boundedFunc.asymptoteData.polarRays.slice()
            : [];

        graphiti.polarSettings.thetaMax = 8 * Math.PI;
        graphiti.polarSettings.thetaMaxLatex = '8\\pi';
        const periodicExpr = 'r=\\frac{1}{\\cos(\\theta)-\\sin(\\theta)}';
        graphiti.addFunction(periodicExpr);
        const periodicFunc = graphiti.polarFunctions[2];
        await graphiti.plotFunction(periodicFunc);

        const periodicRays = periodicFunc.asymptoteData && Array.isArray(periodicFunc.asymptoteData.polarRays)
            ? periodicFunc.asymptoteData.polarRays.slice()
            : [];
        const periodicDisplay = graphiti.buildAsymptoteDisplayLatex(periodicFunc);
        const periodicThetaEquations = periodicDisplay.filter(equation => /\\theta\s*=/.test(equation));
        const periodicGeneralEquation = periodicThetaEquations.find(equation => /\bn\b/.test(equation)) || null;

        return {
            asymptoticRays,
            asymptoticDisplay,
            asymptoticBridgeSegments,
            asymptoticConnectedStraddleCount,
            boundedRays,
            periodicRays,
            periodicDisplay,
            periodicThetaEquationCount: periodicThetaEquations.length,
            periodicGeneralEquation,
            asymptoticFinitePoints: (asymptoticFunc.points || []).filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).length,
            boundedFinitePoints: (boundedFunc.points || []).filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).length
        };
    });

    assert(
        result.asymptoticRays.some(theta => approxEqual(theta, Math.PI / 2, 0.06)),
        `explicit polar reciprocal should detect singular theta ray near pi/2: ${JSON.stringify(result)}`
    );
    assert(
        result.asymptoticDisplay.some(equation => /\\theta\s*=/.test(equation)),
        `explicit polar singular rays should render theta-based asymptote metadata: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.boundedRays.length,
        0,
        `removable polar singularity should not publish asymptote rays: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.asymptoticBridgeSegments,
        0,
        `polar asymptote rendering should not contain origin-bridging discontinuity segments: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.asymptoticConnectedStraddleCount,
        0,
        `polar asymptote plotting should split any segment that straddles a detected asymptote theta: ${JSON.stringify(result)}`
    );
    assert(
        result.periodicRays.length >= 4,
        `periodic polar reciprocal should detect multiple asymptote rays in extended theta range: ${JSON.stringify(result)}`
    );
    assert(
        typeof result.periodicGeneralEquation === 'string' && /\\theta\s*=/.test(result.periodicGeneralEquation),
        `periodic polar asymptotes should display in general form with n, matching cartesian style: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.periodicThetaEquationCount,
        1,
        `periodic polar asymptote metadata should show one general theta equation instead of enumerating each instance: ${JSON.stringify(result)}`
    );
    assert(
        result.asymptoticFinitePoints > 80,
        `explicit polar asymptotic function should still plot substantial finite segments: ${JSON.stringify(result)}`
    );
    assert(
        result.boundedFinitePoints > 80,
        `bounded polar equivalent should remain well sampled: ${JSON.stringify(result)}`
    );
}

async function assertPolarFullCycleWrapClosure(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.polarSettings.thetaMinLatex = '0';
        graphiti.polarSettings.thetaMaxLatex = '2\\pi';
        graphiti.polarSettings.plotNegativeR = true;

        const expr = 'r^2/(theta-pi/3)=sin(theta)';
        graphiti.addFunction(expr);
        const func = graphiti.polarFunctions[0];
        await graphiti.plotFunction(func);

        const points = Array.isArray(func.points) ? func.points : [];
        const finitePoints = points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
        const firstFinite = finitePoints.length > 0 ? finitePoints[0] : null;
        const lastFinite = finitePoints.length > 0 ? finitePoints[finitePoints.length - 1] : null;
        const wrapDistance = (firstFinite && lastFinite)
            ? Math.hypot(firstFinite.x - lastFinite.x, firstFinite.y - lastFinite.y)
            : Infinity;
        const tail = points.slice(-3);

        return {
            finiteCount: finitePoints.length,
            firstFinite,
            lastFinite,
            wrapDistance,
            tail,
            asymptoticRays: func.asymptoteData && Array.isArray(func.asymptoteData.polarRays)
                ? func.asymptoteData.polarRays.slice()
                : []
        };
    });

    assert(
        result.finiteCount > 120,
        `full-cycle polar closure regression should still produce substantial finite points: ${JSON.stringify(result)}`
    );
    assert(
        result.asymptoticRays.length === 0,
        `full-cycle closure probe should not rely on asymptote rays: ${JSON.stringify(result)}`
    );
    assert(
        Number.isFinite(result.wrapDistance) && result.wrapDistance <= 0.02,
        `full-cycle polar curve should close across theta-range boundary when endpoints are near-equal: ${JSON.stringify(result)}`
    );
    assert(
        result.tail.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)),
        `full-cycle closure should end on finite points rather than a NaN separator: ${JSON.stringify(result)}`
    );
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

async function assertInverseCubeRootImplicitPlotsAsCubic(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = false;
        graphiti.showIntercepts = false;

        Object.assign(graphiti.viewport, {
            minX: -4,
            maxX: 4,
            minY: -4,
            maxY: 4,
            width: 960,
            height: 720
        });
        Object.assign(graphiti.cartesianViewport, graphiti.viewport);

        const cases = [
            { expression: 'x=y^(1/3)', expectedYAtOne: 1 },
            { expression: 'x=(2y)^(1/3)', expectedYAtOne: 0.5 },
            { expression: 'x=2y^(1/3)', expectedYAtOne: 0.125 },
            { expression: 'x=(y/2)^(1/3)', expectedYAtOne: 2 },
            { expression: '2x=y^(1/3)', expectedYAtOne: 8 },
            { expression: '3x=(2y)^(1/3)', expectedYAtOne: 13.5 },
            { expression: '(1/2)x=2y^(1/3)', expectedYAtOne: 1 / 512 },
            { expression: 'pi*x=(y/2)^(1/3)', expectedYAtOne: 2 * Math.PI * Math.PI * Math.PI }
        ];

        const results = [];
        for (const testCase of cases) {
            graphiti.cartesianFunctions = [];
            const func = {
                id: graphiti.nextFunctionId++,
                expression: testCase.expression,
                points: [],
                color: '#00C853',
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions.push(func);
            await graphiti.plotFunction(func);

            const finitePoints = func.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
            const nearestTo = (targetX) => finitePoints.reduce((best, point) => {
                if (!best || Math.abs(point.x - targetX) < Math.abs(best.x - targetX)) {
                    return point;
                }
                return best;
            }, null);

            results.push({
                expression: testCase.expression,
                expectedYAtOne: testCase.expectedYAtOne,
                renderMode: func.implicitRenderMode || null,
                pointCount: finitePoints.length,
                negativeBranch: nearestTo(-1),
                positiveBranch: nearestTo(1)
            });
        }

        return results;
    });

    for (const caseResult of result) {
        assert.strictEqual(caseResult.renderMode, 'affine-explicit', `inverse cube-root implicit should use explicit-equivalent rendering: ${JSON.stringify(caseResult)}`);
        assert(caseResult.pointCount > 100, `inverse cube-root implicit should produce a smooth explicit curve: ${JSON.stringify(caseResult)}`);
        assert(caseResult.negativeBranch && approxEqual(caseResult.negativeBranch.y, -caseResult.expectedYAtOne, 0.08), `inverse cube-root implicit should include the negative cubic branch: ${JSON.stringify(caseResult)}`);
        assert(caseResult.positiveBranch && approxEqual(caseResult.positiveBranch.y, caseResult.expectedYAtOne, 0.08), `inverse cube-root implicit should include the positive cubic branch: ${JSON.stringify(caseResult)}`);
    }
}

async function assertPolarStationaryPointsAreNamedRadialExtrema(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;

        const runCase = async (plotNegativeR) => {
            graphiti.plotMode = 'polar';
            graphiti.angleMode = 'radians';
            graphiti.polarSettings.thetaMin = 0;
            graphiti.polarSettings.thetaMax = 2 * Math.PI;
            graphiti.polarSettings.plotNegativeR = plotNegativeR;
            graphiti.cartesianFunctions = [];
            graphiti.polarFunctions = [];
            graphiti.nextFunctionId = 1;
            graphiti.showTurningPoints = true;
            graphiti.input.persistentBadges = [];

            Object.assign(graphiti.viewport, {
                minX: -4,
                maxX: 4,
                minY: -4,
                maxY: 4,
                width: 960,
                height: 720
            });
            Object.assign(graphiti.polarViewport, graphiti.viewport);

            const func = {
                id: graphiti.nextFunctionId++,
                expression: 'r=2*cos(3*theta)',
                points: [],
                color: '#0057FF',
                enabled: true,
                mode: 'polar'
            };
            graphiti.polarFunctions.push(func);
            await graphiti.plotFunction(func);
            graphiti.turningPoints = graphiti.findTurningPoints();

            const radialMaximum = graphiti.turningPoints.find(point =>
                point.type === 'radialMaximum' && Math.abs(point.x - 2) < 0.05 && Math.abs(point.y) < 0.05
            );

            const labels = [];
            const originalFillText = graphiti.ctx.fillText.bind(graphiti.ctx);
            graphiti.ctx.fillText = (text, ...args) => {
                labels.push(String(text));
                return originalFillText(text, ...args);
            };
            try {
                if (radialMaximum) {
                    graphiti.drawTracingBadge(
                        200,
                        200,
                        '#FFD700',
                        radialMaximum.x,
                        radialMaximum.y,
                        false,
                        false,
                        null,
                        radialMaximum.type,
                        false,
                        false,
                        false,
                        false,
                        null,
                        null,
                        func
                    );
                }
            } finally {
                graphiti.ctx.fillText = originalFillText;
            }

            return {
                plotNegativeR,
                types: graphiti.turningPoints.map(point => point.type),
                radialMaximum,
                radialMinimumCount: graphiti.turningPoints.filter(point => point.type === 'radialMinimum').length,
                radialMaximumLabel: labels.find(label => label.startsWith('Radial Maximum:')) || null
            };
        };

        return {
            negativeRPlotted: await runCase(true),
            negativeRHidden: await runCase(false)
        };
    });

    for (const caseResult of [result.negativeRPlotted, result.negativeRHidden]) {
        assert(caseResult.radialMaximum, `polar dr/dtheta=0 should classify visible petal tip as radial maximum: ${JSON.stringify(caseResult)}`);
        assert.strictEqual(caseResult.radialMinimumCount, 0, `visible duplicate polar extrema should prefer radial maxima: ${JSON.stringify(caseResult)}`);
        assert(caseResult.types.length >= 3, `polar rose should expose the three visible radial extrema: ${JSON.stringify(caseResult)}`);
        assert(caseResult.types.every(type => type === 'radialMaximum'), `visible polar rose petal tips should all be radial maxima: ${JSON.stringify(caseResult)}`);
        assert(caseResult.radialMaximumLabel, `polar radial maximum badge should be named: ${JSON.stringify(caseResult)}`);
    }
}

async function assertImplicitPolarMarchingPlotsAndShades(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;

        graphiti.plotMode = 'polar';
        graphiti.angleMode = 'radians';
        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        graphiti.polarSettings.plotNegativeR = true;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = false;
        graphiti.showIntercepts = false;
        graphiti.input.persistentBadges = [];

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        Object.assign(graphiti.polarViewport, {
            minX: -3,
            maxX: 3,
            minY: -3,
            maxY: 3,
            width: 960,
            height: 720,
            centerX: 480,
            centerY: 360,
            scale: 120
        });
        Object.assign(graphiti.viewport, graphiti.polarViewport);

        const equationFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r-(1+cos(t))=0',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(equationFunc);
        await graphiti.plotFunction(equationFunc);

        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = Math.PI / 2;

        const clippedEquationFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r-(1+cos(t))=0',
            points: [],
            color: '#00C853',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(clippedEquationFunc);
        await graphiti.plotFunction(clippedEquationFunc);

        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;

        const thetaEqualsRFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'theta=r',
            points: [],
            color: '#F5A623',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(thetaEqualsRFunc);
        await graphiti.plotFunction(thetaEqualsRFunc);

        const explicitAssignmentImplicitPolarFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r=2r^2*cos(theta)',
            points: [],
            color: '#5E35B1',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(explicitAssignmentImplicitPolarFunc);
        await graphiti.plotFunctionWithValidation(explicitAssignmentImplicitPolarFunc);

        const radialDenominatorOriginHoleFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r=theta/r',
            points: [],
            color: '#00897B',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(radialDenominatorOriginHoleFunc);
        await graphiti.plotFunctionWithValidation(radialDenominatorOriginHoleFunc);

        const affineFastPathFunc = {
            id: graphiti.nextFunctionId++,
            expression: '2*r+cos(t)-1=0',
            points: [],
            color: '#7B1FA2',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(affineFastPathFunc);
        await graphiti.plotFunction(affineFastPathFunc);

        const quadraticFastPathFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r^2-(2+cos(t))=0',
            points: [],
            color: '#00695C',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(quadraticFastPathFunc);
        await graphiti.plotFunction(quadraticFastPathFunc);

        const monomialCubeFastPathFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r^3-(1+cos(t))=0',
            points: [],
            color: '#5D4037',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(monomialCubeFastPathFunc);
        await graphiti.plotFunction(monomialCubeFastPathFunc);

        const productFactorsFastPathFunc = {
            id: graphiti.nextFunctionId++,
            expression: '(r-(1+cos(t)))*(r^2-(2+cos(t)))=0',
            points: [],
            color: '#AD1457',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(productFactorsFastPathFunc);
        await graphiti.plotFunction(productFactorsFastPathFunc);

        const explicitRoseFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r=2*cos(3*theta)',
            points: [],
            color: '#1565C0',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(explicitRoseFunc);
        await graphiti.plotFunction(explicitRoseFunc);

        const explicitLimaconFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r=4+2*sin(theta)',
            points: [],
            color: '#2E7D32',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(explicitLimaconFunc);
        await graphiti.plotFunction(explicitLimaconFunc);

        const implicitLimaconFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r-2*sin(theta)=4',
            points: [],
            color: '#C62828',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(implicitLimaconFunc);
        await graphiti.plotFunction(implicitLimaconFunc);

        const implicitRoseAffineFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r-2*cos(3*theta)=0',
            points: [],
            color: '#00897B',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(implicitRoseAffineFunc);
        await graphiti.plotFunction(implicitRoseAffineFunc);

        const productRoseCircleFunc = {
            id: graphiti.nextFunctionId++,
            expression: '(r-2*cos(3*theta))*(r-3)=0',
            points: [],
            color: '#6A1B9A',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(productRoseCircleFunc);
        await graphiti.plotFunction(productRoseCircleFunc);

        const rationalHolePolarFunc = {
            id: graphiti.nextFunctionId++,
            expression: '(r-(2+cos(theta)))/(theta-pi/3)=0',
            points: [],
            color: '#3949AB',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(rationalHolePolarFunc);
        await graphiti.plotFunction(rationalHolePolarFunc);

        const rationalThetaOffsetPolarFunc = {
            id: graphiti.nextFunctionId++,
            expression: '(r-2*cos(theta))/(theta-pi/2)=1',
            points: [],
            color: '#8E24AA',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(rationalThetaOffsetPolarFunc);
        await graphiti.plotFunction(rationalThetaOffsetPolarFunc);

        graphiti.polarSettings.thetaMin = -2 * Math.PI;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;
        const nonPeriodicImplicitPolarRange4PiFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r*sin(theta)+sin(theta)/r-theta=0',
            points: [],
            color: '#00897B',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(nonPeriodicImplicitPolarRange4PiFunc);
        await graphiti.plotFunction(nonPeriodicImplicitPolarRange4PiFunc);

        graphiti.polarSettings.thetaMin = -2 * Math.PI;
        graphiti.polarSettings.thetaMax = 3 * Math.PI;
        const nonPeriodicImplicitPolarRange5PiFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r*sin(theta)+sin(theta)/r-theta=0',
            points: [],
            color: '#00796B',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(nonPeriodicImplicitPolarRange5PiFunc);
        await graphiti.plotFunction(nonPeriodicImplicitPolarRange5PiFunc);

        graphiti.polarSettings.thetaMin = 0;
        graphiti.polarSettings.thetaMax = 2 * Math.PI;

        const inequalityFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r-(1+cos(t))<0',
            points: [],
            color: '#D0021B',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(inequalityFunc);
        await graphiti.plotFunction(inequalityFunc);

        const quadraticInequalityFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'r^2/(theta-pi/3)<sin(theta)',
            points: [],
            color: '#1565C0',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(quadraticInequalityFunc);
        await graphiti.plotFunction(quadraticInequalityFunc);

        const quadraticNonStrictInequalityFunc = {
            id: graphiti.nextFunctionId++,
            expression: '\\frac{r^2}{\\theta-\\frac{\\pi}{3}}\\leq\\sin\\left(\\theta\\right)',
            points: [],
            color: '#3949AB',
            enabled: true,
            mode: 'polar'
        };
        graphiti.polarFunctions.push(quadraticNonStrictInequalityFunc);
        await graphiti.plotFunctionWithValidation(quadraticNonStrictInequalityFunc);

        quadraticNonStrictInequalityFunc.enabled = false;
        inequalityFunc.enabled = false;
        graphiti.draw();

        const displayCtx = graphiti.canvas.getContext('2d', { alpha: true });
        const samplePixelRGBA = (worldX, worldY) => {
            const screen = graphiti.worldToScreen(worldX, worldY);
            const sampleX = Math.max(0, Math.min(graphiti.canvas.width - 1, Math.round(screen.x)));
            const sampleY = Math.max(0, Math.min(graphiti.canvas.height - 1, Math.round(screen.y)));
            return Array.from(displayCtx.getImageData(sampleX, sampleY, 1, 1).data);
        };

        quadraticInequalityFunc.enabled = true;
        quadraticNonStrictInequalityFunc.enabled = true;
        graphiti.draw();
        const multiInequalityInsideRGBA = samplePixelRGBA(-0.45, 0.45);
        const multiInequalityOutsideRGBA = samplePixelRGBA(1.6, 1.0);

        quadraticNonStrictInequalityFunc.enabled = false;
        graphiti.draw();

        const equationFinitePointCount = (equationFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const inequalityFinitePointCount = (inequalityFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const quadraticInequalityFinitePointCount = (quadraticInequalityFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const quadraticNonStrictInequalityFinitePointCount = (quadraticNonStrictInequalityFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const clippedEquationFinitePoints = (clippedEquationFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        );
        const thetaEqualsRFinitePointCount = (thetaEqualsRFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const explicitAssignmentImplicitPolarFinitePointCount = (explicitAssignmentImplicitPolarFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const radialDenominatorOriginHoleFinitePointCount = (radialDenominatorOriginHoleFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const thetaEqualsRHasUpperHalf = (thetaEqualsRFunc.points || []).some(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.y > 0.05
        );
        const thetaEqualsRHasLowerHalf = (thetaEqualsRFunc.points || []).some(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.y < -0.05
        );
        const affineFastPathFinitePointCount = (affineFastPathFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const quadraticFastPathFinitePointCount = (quadraticFastPathFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const monomialCubeFastPathFinitePointCount = (monomialCubeFastPathFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const productFactorsFastPathFinitePointCount = (productFactorsFastPathFunc.points || []).filter(point =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y)
        ).length;
        const clippedAngles = clippedEquationFinitePoints.map(point => {
            let theta = Math.atan2(point.y, point.x);
            if (theta < 0) {
                theta += 2 * Math.PI;
            }
            return theta;
        });
        const clippedAnglesRespectRange = clippedAngles.every(theta => theta >= -1e-6 && theta <= (Math.PI / 2) + 1e-6);

        const getAnimationArcCountForFunction = (func, thetaRad) => {
            const originalCtx = graphiti.ctx;
            const originalFunctions = graphiti.polarFunctions;
            const originalTheta = graphiti.polarAnimation.currentTheta;
            const originalIsAnimating = graphiti.polarAnimation.isAnimating;
            const originalIsPaused = graphiti.polarAnimation.isPaused;

            const recordedArcs = [];
            const recordingContext = {
                save() {},
                restore() {},
                beginPath() {},
                fill() {},
                createRadialGradient() {
                    return {
                        addColorStop() {}
                    };
                },
                arc(x, y, r) {
                    recordedArcs.push({ x, y, r });
                },
                set fillStyle(value) {
                    this._fillStyle = value;
                },
                get fillStyle() {
                    return this._fillStyle;
                }
            };

            graphiti.ctx = recordingContext;
            graphiti.polarFunctions = [func];
            graphiti.polarAnimation.currentTheta = thetaRad;
            graphiti.polarAnimation.isAnimating = true;
            graphiti.polarAnimation.isPaused = false;

            try {
                graphiti.drawPolarAnimationPoint();
            } finally {
                graphiti.ctx = originalCtx;
                graphiti.polarFunctions = originalFunctions;
                graphiti.polarAnimation.currentTheta = originalTheta;
                graphiti.polarAnimation.isAnimating = originalIsAnimating;
                graphiti.polarAnimation.isPaused = originalIsPaused;
            }

            return recordedArcs.length;
        };

        const getAnimationArcSummaryForFunction = (func, thetaRad) => {
            const originalCtx = graphiti.ctx;
            const originalFunctions = graphiti.polarFunctions;
            const originalTheta = graphiti.polarAnimation.currentTheta;
            const originalIsAnimating = graphiti.polarAnimation.isAnimating;
            const originalIsPaused = graphiti.polarAnimation.isPaused;

            const recordedArcs = [];
            const recordingContext = {
                save() {},
                restore() {},
                beginPath() {},
                fill() {},
                createRadialGradient() {
                    return {
                        addColorStop() {}
                    };
                },
                arc(x, y, r) {
                    recordedArcs.push({ x, y, r });
                },
                set fillStyle(value) {
                    this._fillStyle = value;
                },
                get fillStyle() {
                    return this._fillStyle;
                }
            };

            graphiti.ctx = recordingContext;
            graphiti.polarFunctions = [func];
            graphiti.polarAnimation.currentTheta = thetaRad;
            graphiti.polarAnimation.isAnimating = true;
            graphiti.polarAnimation.isPaused = false;

            try {
                graphiti.drawPolarAnimationPoint();
            } finally {
                graphiti.ctx = originalCtx;
                graphiti.polarFunctions = originalFunctions;
                graphiti.polarAnimation.currentTheta = originalTheta;
                graphiti.polarAnimation.isAnimating = originalIsAnimating;
                graphiti.polarAnimation.isPaused = originalIsPaused;
            }

            const firstArc = recordedArcs.length > 0 ? recordedArcs[0] : null;
            return {
                arcCount: recordedArcs.length,
                center: firstArc ? { x: firstArc.x, y: firstArc.y } : null
            };
        };

        const implicitEquationAnimationArcCount = getAnimationArcCountForFunction(equationFunc, 0);
        const affineFastPathAnimationArcCount = getAnimationArcCountForFunction(affineFastPathFunc, 0);
        const quadraticFastPathAnimationArcCount = getAnimationArcCountForFunction(quadraticFastPathFunc, 0);
        const monomialCubeFastPathAnimationArcCount = getAnimationArcCountForFunction(monomialCubeFastPathFunc, 0);
        const productFactorsFastPathAnimationArcCount = getAnimationArcCountForFunction(productFactorsFastPathFunc, 0);

        graphiti.showIntercepts = true;
        const polarAxisIntercepts = graphiti.findAxisIntercepts();
        graphiti.showIntercepts = false;

        const countAxisInterceptsForFunction = (functionId) =>
            polarAxisIntercepts.filter(intercept =>
                intercept && intercept.functionId === functionId &&
                (intercept.type === 'x-axis-positive' || intercept.type === 'x-axis-negative' ||
                    intercept.type === 'y-axis-positive' || intercept.type === 'y-axis-negative')
            ).length;

        const implicitLimaconTraceProbe = (() => {
            const probePoint = { x: 4, y: 0 };
            const probeScreen = graphiti.worldToScreen(probePoint.x, probePoint.y);
            const traced = graphiti.findClosestPolarPoint(implicitLimaconFunc, probeScreen.x, probeScreen.y, 24);
            if (!traced) {
                return {
                    hasTheta: false,
                    slopeFinite: false
                };
            }

            const slopeData = graphiti.calculateSlopeAtPoint(
                implicitLimaconFunc,
                traced.worldX,
                traced.worldY,
                traced.theta,
                null
            );

            return {
                hasTheta: Number.isFinite(traced.theta),
                slopeFinite: !!(slopeData && Number.isFinite(slopeData.slope))
            };
        })();

        const implicitPolarDragConstraintProbe = (() => {
            const savedDisplayPoints = implicitLimaconFunc.displayPoints;
            implicitLimaconFunc.displayPoints = [];

            const traced = graphiti.traceFunction(
                implicitLimaconFunc,
                123,
                456,
                0,
                null,
                0
            );

            implicitLimaconFunc.displayPoints = savedDisplayPoints;

            if (!traced || !Number.isFinite(traced.x) || !Number.isFinite(traced.y) || !Number.isFinite(traced.theta)) {
                return { staysOnCurve: false };
            }

            const compiled = graphiti.getPolarInterceptCompiledExpressions(
                implicitLimaconFunc,
                graphiti.detectFunctionType(implicitLimaconFunc.expression)
            );
            if (!Array.isArray(compiled) || compiled.length === 0) {
                return { staysOnCurve: false };
            }

            const expectedPoint = graphiti.evaluatePolarPointAtTheta(compiled[0], traced.theta);
            if (!expectedPoint || !Number.isFinite(expectedPoint.x) || !Number.isFinite(expectedPoint.y)) {
                return { staysOnCurve: false };
            }

            const deviation = Math.hypot(traced.x - expectedPoint.x, traced.y - expectedPoint.y);
            return { staysOnCurve: deviation <= 1e-3 };
        })();
        const explicitRoseAnimationAfterPiA = getAnimationArcSummaryForFunction(explicitRoseFunc, Math.PI + 0.2);
        const explicitRoseAnimationAfterPiB = getAnimationArcSummaryForFunction(explicitRoseFunc, Math.PI + 0.4);
        let explicitRosePostPiMotion = null;
        if (explicitRoseAnimationAfterPiA.center && explicitRoseAnimationAfterPiB.center) {
            explicitRosePostPiMotion = Math.hypot(
                explicitRoseAnimationAfterPiB.center.x - explicitRoseAnimationAfterPiA.center.x,
                explicitRoseAnimationAfterPiB.center.y - explicitRoseAnimationAfterPiA.center.y
            );
        }

        const implicitRoseAnimationAfterPiA = getAnimationArcSummaryForFunction(implicitRoseAffineFunc, Math.PI + 0.2);
        const implicitRoseAnimationAfterPiB = getAnimationArcSummaryForFunction(implicitRoseAffineFunc, Math.PI + 0.4);
        let implicitRosePostPiMotion = null;
        if (implicitRoseAnimationAfterPiA.center && implicitRoseAnimationAfterPiB.center) {
            implicitRosePostPiMotion = Math.hypot(
                implicitRoseAnimationAfterPiB.center.x - implicitRoseAnimationAfterPiA.center.x,
                implicitRoseAnimationAfterPiB.center.y - implicitRoseAnimationAfterPiA.center.y
            );
        }

        return {
            equation: {
                detectedType: graphiti.detectFunctionType(equationFunc.expression),
                renderMode: equationFunc.implicitRenderMode || null,
                finitePointCount: equationFinitePointCount,
                animationArcCount: implicitEquationAnimationArcCount,
                hasGridData: !!equationFunc.gridData
            },
            clippedEquation: {
                detectedType: graphiti.detectFunctionType(clippedEquationFunc.expression),
                renderMode: clippedEquationFunc.implicitRenderMode || null,
                finitePointCount: clippedEquationFinitePoints.length,
                anglesRespectRange: clippedAnglesRespectRange,
                hasGridData: !!clippedEquationFunc.gridData
            },
            thetaEqualsR: {
                detectedType: graphiti.detectFunctionType(thetaEqualsRFunc.expression),
                renderMode: thetaEqualsRFunc.implicitRenderMode || null,
                finitePointCount: thetaEqualsRFinitePointCount,
                hasUpperHalf: thetaEqualsRHasUpperHalf,
                hasLowerHalf: thetaEqualsRHasLowerHalf
            },
            explicitAssignmentImplicitPolar: {
                detectedType: graphiti.detectFunctionType(explicitAssignmentImplicitPolarFunc.expression),
                renderMode: explicitAssignmentImplicitPolarFunc.implicitRenderMode || null,
                finitePointCount: explicitAssignmentImplicitPolarFinitePointCount,
                validationError: explicitAssignmentImplicitPolarFunc.validationError
            },
            radialDenominatorOriginHole: (() => {
                const holes = Array.isArray(radialDenominatorOriginHoleFunc.holes) ? radialDenominatorOriginHoleFunc.holes : [];
                const holeDisplay = graphiti.buildHoleDisplayLatex(radialDenominatorOriginHoleFunc);
                const displayPoints = Array.isArray(radialDenominatorOriginHoleFunc.displayPoints)
                    ? radialDenominatorOriginHoleFunc.displayPoints
                    : (radialDenominatorOriginHoleFunc.points || []);
                const finiteDisplayPoints = displayPoints.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
                const nearestHoleDistance = holes.length > 0
                    ? Math.min(...holes
                        .filter(hole => hole && Number.isFinite(hole.x) && Number.isFinite(hole.y))
                        .map(hole => Math.hypot(hole.x, hole.y)))
                    : Infinity;
                const nearestDisplayRadius = finiteDisplayPoints.length > 0
                    ? Math.min(...finiteDisplayPoints.map(point => Math.hypot(point.x, point.y)))
                    : Infinity;
                return {
                    detectedType: graphiti.detectFunctionType(radialDenominatorOriginHoleFunc.expression),
                    renderMode: radialDenominatorOriginHoleFunc.implicitRenderMode || null,
                    finitePointCount: radialDenominatorOriginHoleFinitePointCount,
                    validationError: radialDenominatorOriginHoleFunc.validationError,
                    holeCount: holes.length,
                    nearestHoleDistance,
                    nearestDisplayRadius,
                    firstHoleDisplay: Array.isArray(holeDisplay) && holeDisplay.length > 0 ? holeDisplay[0] : ''
                };
            })(),
            affineFastPath: {
                detectedType: graphiti.detectFunctionType(affineFastPathFunc.expression),
                renderMode: affineFastPathFunc.implicitRenderMode || null,
                finitePointCount: affineFastPathFinitePointCount,
                animationArcCount: affineFastPathAnimationArcCount,
                axisInterceptCount: countAxisInterceptsForFunction(affineFastPathFunc.id)
            },
            quadraticFastPath: {
                detectedType: graphiti.detectFunctionType(quadraticFastPathFunc.expression),
                renderMode: quadraticFastPathFunc.implicitRenderMode || null,
                finitePointCount: quadraticFastPathFinitePointCount,
                animationArcCount: quadraticFastPathAnimationArcCount,
                axisInterceptCount: countAxisInterceptsForFunction(quadraticFastPathFunc.id),
                branchCount: Array.isArray(quadraticFastPathFunc.quadraticPolarExplicitExpressions)
                    ? quadraticFastPathFunc.quadraticPolarExplicitExpressions.length
                    : 0
            },
            monomialCubeFastPath: {
                detectedType: graphiti.detectFunctionType(monomialCubeFastPathFunc.expression),
                renderMode: monomialCubeFastPathFunc.implicitRenderMode || null,
                finitePointCount: monomialCubeFastPathFinitePointCount,
                animationArcCount: monomialCubeFastPathAnimationArcCount,
                axisInterceptCount: countAxisInterceptsForFunction(monomialCubeFastPathFunc.id),
                branchCount: Array.isArray(monomialCubeFastPathFunc.monomialPolarExplicitExpressions)
                    ? monomialCubeFastPathFunc.monomialPolarExplicitExpressions.length
                    : 0,
                power: monomialCubeFastPathFunc.monomialPolarPower
            },
            productFactorsFastPath: {
                detectedType: graphiti.detectFunctionType(productFactorsFastPathFunc.expression),
                renderMode: productFactorsFastPathFunc.implicitRenderMode || null,
                finitePointCount: productFactorsFastPathFinitePointCount,
                animationArcCount: productFactorsFastPathAnimationArcCount,
                axisInterceptCount: countAxisInterceptsForFunction(productFactorsFastPathFunc.id),
                treatedAsMathematicalImplicit: typeof graphiti.isMathematicallyImplicitFunction === 'function'
                    ? graphiti.isMathematicallyImplicitFunction(productFactorsFastPathFunc)
                    : null,
                factorCount: Array.isArray(productFactorsFastPathFunc.productImplicitFactorExpressions)
                    ? productFactorsFastPathFunc.productImplicitFactorExpressions.length
                    : 0,
                factorRenderModes: Array.isArray(productFactorsFastPathFunc.productImplicitFactorRenderModes)
                    ? productFactorsFastPathFunc.productImplicitFactorRenderModes.slice()
                    : []
            },
            explicitRoseAnimation: {
                arcCountAfterPiA: explicitRoseAnimationAfterPiA.arcCount,
                arcCountAfterPiB: explicitRoseAnimationAfterPiB.arcCount,
                postPiMotion: explicitRosePostPiMotion
            },
            equivalentLimacons: {
                explicitInterceptCount: countAxisInterceptsForFunction(explicitLimaconFunc.id),
                implicitInterceptCount: countAxisInterceptsForFunction(implicitLimaconFunc.id),
                implicitRenderMode: implicitLimaconFunc.implicitRenderMode || null,
                implicitTraceHasTheta: implicitLimaconTraceProbe.hasTheta,
                implicitTraceSlopeFinite: implicitLimaconTraceProbe.slopeFinite,
                implicitDragStaysOnCurve: implicitPolarDragConstraintProbe.staysOnCurve
            },
            equivalentRosesTurningPoints: (() => {
                const originalShowTurningPoints = graphiti.showTurningPoints;
                graphiti.showTurningPoints = true;
                const allTurningPoints = graphiti.findTurningPoints();
                graphiti.showTurningPoints = originalShowTurningPoints;
                const countType = (funcId, type) => allTurningPoints.filter(point =>
                    point && point.func && point.func.id === funcId && point.type === type
                ).length;

                return {
                    explicitRadialMaxima: countType(explicitRoseFunc.id, 'radialMaximum'),
                    implicitRadialMaxima: countType(implicitRoseAffineFunc.id, 'radialMaximum'),
                    productRoseCircleRadialMaxima: countType(productRoseCircleFunc.id, 'radialMaximum')
                };
            })(),
            implicitRoseAffine: {
                detectedType: graphiti.detectFunctionType(implicitRoseAffineFunc.expression),
                renderMode: implicitRoseAffineFunc.implicitRenderMode || null,
                arcCountAfterPiA: implicitRoseAnimationAfterPiA.arcCount,
                arcCountAfterPiB: implicitRoseAnimationAfterPiB.arcCount,
                postPiMotion: implicitRosePostPiMotion
            },
            productRoseCircle: {
                renderMode: productRoseCircleFunc.implicitRenderMode || null,
                factorCount: Array.isArray(productRoseCircleFunc.productImplicitFactorExpressions)
                    ? productRoseCircleFunc.productImplicitFactorExpressions.length
                    : 0,
                shapeLabel: (() => {
                    const shape = graphiti.classifyFunctionShape(productRoseCircleFunc);
                    return shape && shape.label ? shape.label : null;
                })()
            },
            rationalHolePolar: (() => {
                const holes = Array.isArray(rationalHolePolarFunc.holes) ? rationalHolePolarFunc.holes : [];
                const holeDisplay = graphiti.buildHoleDisplayLatex(rationalHolePolarFunc);
                const expectedTheta = Math.PI / 3;
                const expectedR = 2 + Math.cos(expectedTheta);
                const expectedPoint = {
                    x: expectedR * Math.cos(expectedTheta),
                    y: expectedR * Math.sin(expectedTheta)
                };
                const nearestHoleDistance = holes.length > 0
                    ? Math.min(...holes
                        .filter(hole => hole && Number.isFinite(hole.x) && Number.isFinite(hole.y))
                        .map(hole => Math.hypot(hole.x - expectedPoint.x, hole.y - expectedPoint.y)))
                    : Infinity;

                return {
                    renderMode: rationalHolePolarFunc.implicitRenderMode || null,
                    holeCount: holes.length,
                    nearestHoleDistance,
                    firstHoleDisplay: Array.isArray(holeDisplay) && holeDisplay.length > 0 ? holeDisplay[0] : ''
                };
            })(),
            rationalThetaOffsetPolar: (() => {
                const holes = Array.isArray(rationalThetaOffsetPolarFunc.holes) ? rationalThetaOffsetPolarFunc.holes : [];
                const shape = graphiti.classifyFunctionShape(rationalThetaOffsetPolarFunc);
                const expectedPoint = { x: 0, y: 0 };
                const nearestHoleDistance = holes.length > 0
                    ? Math.min(...holes
                        .filter(hole => hole && Number.isFinite(hole.x) && Number.isFinite(hole.y))
                        .map(hole => Math.hypot(hole.x - expectedPoint.x, hole.y - expectedPoint.y)))
                    : Infinity;

                return {
                    renderMode: rationalThetaOffsetPolarFunc.implicitRenderMode || null,
                    holeCount: holes.length,
                    nearestHoleDistance,
                    shapeLabel: shape && shape.label ? shape.label : null
                };
            })(),
            nonPeriodicImplicitPolarRangeCoverage: (() => {
                const summarize = (func) => {
                    const finite = (func.points || []).filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
                    const finiteTheta = finite
                        .map(point => point.theta)
                        .filter(theta => Number.isFinite(theta));
                    return {
                        detectedType: graphiti.detectFunctionType(func.expression),
                        renderMode: func.implicitRenderMode || null,
                        finitePointCount: finite.length,
                        maxTheta: finiteTheta.length > 0 ? Math.max(...finiteTheta) : null,
                        hasUpperBranch: finite.some(point => point.y > 0.75),
                        hasLowerBranch: finite.some(point => point.y < -0.75)
                    };
                };

                return {
                    range4Pi: summarize(nonPeriodicImplicitPolarRange4PiFunc),
                    range5Pi: summarize(nonPeriodicImplicitPolarRange5PiFunc)
                };
            })(),
            inequality: {
                detectedType: graphiti.detectFunctionType(inequalityFunc.expression),
                renderMode: inequalityFunc.implicitRenderMode || null,
                finitePointCount: inequalityFinitePointCount,
                hasGridData: !!inequalityFunc.gridData
            },
            quadraticInequality: {
                detectedType: graphiti.detectFunctionType(quadraticInequalityFunc.expression),
                renderMode: quadraticInequalityFunc.implicitRenderMode || null,
                finitePointCount: quadraticInequalityFinitePointCount,
                hasGridData: !!quadraticInequalityFunc.gridData,
                fillMode: quadraticInequalityFunc.implicitPolarInequalityFastPath
                    ? quadraticInequalityFunc.implicitPolarInequalityFastPath.fillMode
                    : null,
                upperLeftRGBA: samplePixelRGBA(-0.45, 0.45),
                lowerRightRGBA: samplePixelRGBA(0.45, -0.45),
                exteriorRGBA: samplePixelRGBA(1.6, 1.0)
            },
            quadraticNonStrictInequality: {
                detectedType: graphiti.detectFunctionType(quadraticNonStrictInequalityFunc.expression),
                renderMode: quadraticNonStrictInequalityFunc.implicitRenderMode || null,
                finitePointCount: quadraticNonStrictInequalityFinitePointCount,
                hasGridData: !!quadraticNonStrictInequalityFunc.gridData,
                fillMode: quadraticNonStrictInequalityFunc.implicitPolarInequalityFastPath
                    ? quadraticNonStrictInequalityFunc.implicitPolarInequalityFastPath.fillMode
                    : null,
                validationError: quadraticNonStrictInequalityFunc.validationError,
                converted: graphiti.convertFromLatex(quadraticNonStrictInequalityFunc.expression)
            },
            quadraticInequalityIntersection: {
                insideRGBA: multiInequalityInsideRGBA,
                outsideRGBA: multiInequalityOutsideRGBA
            }
        };
    });

    assert.strictEqual(result.equation.detectedType, 'implicit', `implicit polar equation should be detected as implicit: ${JSON.stringify(result.equation)}`);
    assert(
        result.equation.renderMode === 'affine-polar-explicit' ||
        (typeof result.equation.renderMode === 'string' && result.equation.renderMode.startsWith('marching-polar')),
        `implicit polar equation should use affine fast-path or marching fallback: ${JSON.stringify(result.equation)}`
    );
    assert(result.equation.finitePointCount > 50, `implicit polar equation should produce finite points: ${JSON.stringify(result.equation)}`);
    assert(result.equation.animationArcCount >= 3, `implicit polar equation should draw animation marker arcs: ${JSON.stringify(result.equation)}`);

    assert.strictEqual(result.clippedEquation.detectedType, 'implicit', `theta-clipped implicit polar equation should stay implicit: ${JSON.stringify(result.clippedEquation)}`);
    assert(
        result.clippedEquation.renderMode === 'affine-polar-explicit' ||
        (typeof result.clippedEquation.renderMode === 'string' && result.clippedEquation.renderMode.startsWith('marching-polar')),
        `theta-clipped implicit polar equation should use affine fast-path or marching fallback: ${JSON.stringify(result.clippedEquation)}`
    );
    assert(result.clippedEquation.finitePointCount > 10, `theta-clipped implicit polar equation should produce finite points: ${JSON.stringify(result.clippedEquation)}`);
    assert.strictEqual(result.clippedEquation.anglesRespectRange, true, `implicit polar equation should respect theta min/max clipping: ${JSON.stringify(result.clippedEquation)}`);

    assert.strictEqual(result.thetaEqualsR.detectedType, 'implicit', `theta=r should be treated as implicit polar, not a ray: ${JSON.stringify(result.thetaEqualsR)}`);
    assert(
        result.thetaEqualsR.renderMode === 'affine-polar-explicit' ||
        (typeof result.thetaEqualsR.renderMode === 'string' && result.thetaEqualsR.renderMode.startsWith('marching-polar')),
        `theta=r should use affine fast-path or marching fallback: ${JSON.stringify(result.thetaEqualsR)}`
    );
    assert(result.thetaEqualsR.finitePointCount > 10, `theta=r should produce visible implicit polar points: ${JSON.stringify(result.thetaEqualsR)}`);
    assert.strictEqual(result.thetaEqualsR.hasUpperHalf, true, `theta=r should include upper-half points for 0..2pi: ${JSON.stringify(result.thetaEqualsR)}`);
    assert.strictEqual(result.thetaEqualsR.hasLowerHalf, true, `theta=r should include lower-half points for 0..2pi: ${JSON.stringify(result.thetaEqualsR)}`);

    assert.strictEqual(result.explicitAssignmentImplicitPolar.detectedType, 'implicit', `r=<expr containing r> should be treated as implicit polar, not explicit polar: ${JSON.stringify(result.explicitAssignmentImplicitPolar)}`);
    assert.strictEqual(result.explicitAssignmentImplicitPolar.validationError, null, `r=<expr containing r> should validate cleanly on the implicit polar path: ${JSON.stringify(result.explicitAssignmentImplicitPolar)}`);
    assert(
        result.explicitAssignmentImplicitPolar.renderMode === 'monomial-polar-explicit' ||
        result.explicitAssignmentImplicitPolar.renderMode === 'quadratic-polar-explicit' ||
        (typeof result.explicitAssignmentImplicitPolar.renderMode === 'string' && result.explicitAssignmentImplicitPolar.renderMode.startsWith('marching-polar')),
        `r=<expr containing r> should render through the implicit polar pipeline: ${JSON.stringify(result.explicitAssignmentImplicitPolar)}`
    );
    assert(result.explicitAssignmentImplicitPolar.finitePointCount > 10, `r=<expr containing r> should produce visible implicit polar points: ${JSON.stringify(result.explicitAssignmentImplicitPolar)}`);

    assert.strictEqual(result.radialDenominatorOriginHole.detectedType, 'implicit', `r=theta/r should stay implicit in polar classification: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert.strictEqual(result.radialDenominatorOriginHole.validationError, null, `r=theta/r should validate cleanly on the implicit polar path: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert(result.radialDenominatorOriginHole.finitePointCount > 10, `r=theta/r should still produce visible implicit polar points: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert(result.radialDenominatorOriginHole.holeCount >= 1, `r=theta/r should expose a removable origin hole in metadata: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert(result.radialDenominatorOriginHole.nearestHoleDistance < 1e-6, `r=theta/r should place its removable hole at the origin: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert(result.radialDenominatorOriginHole.nearestDisplayRadius < 0.02, `r=theta/r should draw display-only approach points close to the removable origin hole so the visible gap stays tight: ${JSON.stringify(result.radialDenominatorOriginHole)}`);
    assert(result.radialDenominatorOriginHole.firstHoleDisplay.includes('\\left(0') && result.radialDenominatorOriginHole.firstHoleDisplay.includes(', 0\\right)'), `r=theta/r should list the origin hole in the panel metadata: ${JSON.stringify(result.radialDenominatorOriginHole)}`);

    assert.strictEqual(result.affineFastPath.detectedType, 'implicit', `affine implicit polar expression should remain implicit in classification: ${JSON.stringify(result.affineFastPath)}`);
    assert.strictEqual(result.affineFastPath.renderMode, 'affine-polar-explicit', `affine implicit polar expression should activate affine fast-path: ${JSON.stringify(result.affineFastPath)}`);
    assert(result.affineFastPath.finitePointCount > 30, `affine implicit polar fast-path should produce visible points: ${JSON.stringify(result.affineFastPath)}`);
    assert(result.affineFastPath.animationArcCount >= 3, `affine implicit polar fast-path should draw animation marker arcs: ${JSON.stringify(result.affineFastPath)}`);

    assert.strictEqual(result.quadraticFastPath.detectedType, 'implicit', `quadratic implicit polar expression should remain implicit in classification: ${JSON.stringify(result.quadraticFastPath)}`);
    assert.strictEqual(result.quadraticFastPath.renderMode, 'quadratic-polar-explicit', `quadratic implicit polar expression should activate quadratic fast-path: ${JSON.stringify(result.quadraticFastPath)}`);
    assert(result.quadraticFastPath.branchCount >= 2, `quadratic implicit polar fast-path should expose both explicit branches: ${JSON.stringify(result.quadraticFastPath)}`);
    assert(result.quadraticFastPath.finitePointCount > 80, `quadratic implicit polar fast-path should produce substantial finite points: ${JSON.stringify(result.quadraticFastPath)}`);
    assert(result.quadraticFastPath.animationArcCount >= 3, `quadratic implicit polar fast-path should draw animation marker arcs: ${JSON.stringify(result.quadraticFastPath)}`);
    assert(result.quadraticFastPath.axisInterceptCount >= 2, `quadratic implicit polar fast-path should report axis intercepts: ${JSON.stringify(result.quadraticFastPath)}`);

    assert.strictEqual(result.monomialCubeFastPath.detectedType, 'implicit', `monomial cube implicit polar expression should remain implicit in classification: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert.strictEqual(result.monomialCubeFastPath.renderMode, 'monomial-polar-explicit', `monomial cube implicit polar expression should activate monomial fast-path: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert.strictEqual(result.monomialCubeFastPath.power, 3, `monomial cube implicit polar power metadata should be 3: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert.strictEqual(result.monomialCubeFastPath.branchCount, 1, `monomial cube implicit polar fast-path should expose one real explicit branch: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert(result.monomialCubeFastPath.finitePointCount > 80, `monomial cube implicit polar fast-path should produce substantial finite points: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert(result.monomialCubeFastPath.animationArcCount >= 3, `monomial cube implicit polar fast-path should draw animation marker arcs: ${JSON.stringify(result.monomialCubeFastPath)}`);
    assert(result.monomialCubeFastPath.axisInterceptCount >= 2, `monomial cube implicit polar fast-path should report axis intercepts: ${JSON.stringify(result.monomialCubeFastPath)}`);

    assert.strictEqual(result.productFactorsFastPath.detectedType, 'implicit', `product implicit polar expression should remain implicit in classification: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert.strictEqual(result.productFactorsFastPath.renderMode, 'product-factors', `product implicit polar expression should activate product-factors mode: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert.strictEqual(result.productFactorsFastPath.treatedAsMathematicalImplicit, false, `product implicit polar fast-path should be scheduled as explicit for intersections: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.factorCount >= 2, `product implicit polar expression should expose at least two factors: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.factorRenderModes.includes('affine-polar-explicit'), `product implicit polar should include affine factor fast-path: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.factorRenderModes.includes('quadratic-polar-explicit'), `product implicit polar should include quadratic factor fast-path: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.finitePointCount > 120, `product implicit polar factor merge should produce substantial finite points: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.animationArcCount >= 3, `product implicit polar factor merge should draw animation marker arcs: ${JSON.stringify(result.productFactorsFastPath)}`);
    assert(result.productFactorsFastPath.axisInterceptCount >= 1, `product implicit polar factor merge should report axis intercepts: ${JSON.stringify(result.productFactorsFastPath)}`);

    assert(result.explicitRoseAnimation.arcCountAfterPiA >= 3, `explicit rose should still draw marker arcs after pi (first sample): ${JSON.stringify(result.explicitRoseAnimation)}`);
    assert(result.explicitRoseAnimation.arcCountAfterPiB >= 3, `explicit rose should still draw marker arcs after pi (second sample): ${JSON.stringify(result.explicitRoseAnimation)}`);
    assert(
        Number.isFinite(result.explicitRoseAnimation.postPiMotion) && result.explicitRoseAnimation.postPiMotion > 0.5,
        `explicit rose marker should continue moving after pi instead of freezing: ${JSON.stringify(result.explicitRoseAnimation)}`
    );

    assert.strictEqual(result.equivalentLimacons.implicitRenderMode, 'affine-polar-explicit', `rearranged limacon should use affine polar fast-path: ${JSON.stringify(result.equivalentLimacons)}`);
    assert.strictEqual(result.equivalentLimacons.explicitInterceptCount, 4, `explicit limacon should report 4 axis intercepts: ${JSON.stringify(result.equivalentLimacons)}`);
    assert.strictEqual(result.equivalentLimacons.implicitInterceptCount, 4, `rearranged implicit limacon should report the same 4 axis intercepts: ${JSON.stringify(result.equivalentLimacons)}`);
    assert.strictEqual(result.equivalentLimacons.implicitTraceHasTheta, true, `rearranged implicit limacon trace should preserve theta for badge cycling: ${JSON.stringify(result.equivalentLimacons)}`);
    assert.strictEqual(result.equivalentLimacons.implicitTraceSlopeFinite, true, `rearranged implicit limacon trace should produce finite slope for tangent/normal transitions: ${JSON.stringify(result.equivalentLimacons)}`);
    assert.strictEqual(result.equivalentLimacons.implicitDragStaysOnCurve, true, `rearranged implicit limacon drag should remain on-curve even with empty display buffer: ${JSON.stringify(result.equivalentLimacons)}`);

    assert(result.equivalentRosesTurningPoints.explicitRadialMaxima >= 3, `explicit rose should identify radial maxima turning points: ${JSON.stringify(result.equivalentRosesTurningPoints)}`);
    assert.strictEqual(result.equivalentRosesTurningPoints.implicitRadialMaxima, result.equivalentRosesTurningPoints.explicitRadialMaxima, `implicit rose equivalent should match explicit rose radial maxima classification: ${JSON.stringify(result.equivalentRosesTurningPoints)}`);
    assert.strictEqual(result.equivalentRosesTurningPoints.productRoseCircleRadialMaxima, result.equivalentRosesTurningPoints.explicitRadialMaxima, `product-factor rose+circle should preserve rose radial maxima classification: ${JSON.stringify(result.equivalentRosesTurningPoints)}`);

    assert.strictEqual(result.implicitRoseAffine.detectedType, 'implicit', `implicit affine rose should remain implicit in type detection: ${JSON.stringify(result.implicitRoseAffine)}`);
    assert.strictEqual(result.implicitRoseAffine.renderMode, 'affine-polar-explicit', `implicit affine rose should activate affine polar fast-path: ${JSON.stringify(result.implicitRoseAffine)}`);
    assert(result.implicitRoseAffine.arcCountAfterPiA >= 3, `implicit affine rose should still draw marker arcs after pi (first sample): ${JSON.stringify(result.implicitRoseAffine)}`);
    assert(result.implicitRoseAffine.arcCountAfterPiB >= 3, `implicit affine rose should still draw marker arcs after pi (second sample): ${JSON.stringify(result.implicitRoseAffine)}`);
    assert(
        Number.isFinite(result.implicitRoseAffine.postPiMotion) && result.implicitRoseAffine.postPiMotion > 0.5,
        `implicit affine rose marker should continue moving after pi instead of freezing: ${JSON.stringify(result.implicitRoseAffine)}`
    );

    assert.strictEqual(result.productRoseCircle.renderMode, 'product-factors', `product rose+circle should use product-factors render mode: ${JSON.stringify(result.productRoseCircle)}`);
    assert.strictEqual(result.productRoseCircle.factorCount, 2, `product rose+circle should expose both factors: ${JSON.stringify(result.productRoseCircle)}`);
    assert.strictEqual(result.productRoseCircle.shapeLabel, 'rose curve - 3 petals + circle', `product rose+circle should classify both components: ${JSON.stringify(result.productRoseCircle)}`);

    assert.strictEqual(result.rationalHolePolar.renderMode, 'affine-polar-explicit', `implicit polar rational-hole form should stay on affine fast-path: ${JSON.stringify(result.rationalHolePolar)}`);
    assert(result.rationalHolePolar.holeCount >= 1, `implicit polar rational-hole form should expose removable hole metadata: ${JSON.stringify(result.rationalHolePolar)}`);
    assert(result.rationalHolePolar.nearestHoleDistance < 0.25, `implicit polar rational-hole form should place a hole near the expected removable point: ${JSON.stringify(result.rationalHolePolar)}`);
    assert(result.rationalHolePolar.firstHoleDisplay.includes('\\left(') && result.rationalHolePolar.firstHoleDisplay.includes('\\pi'), `implicit polar hole metadata should display polar coordinates and pi fractions: ${JSON.stringify(result.rationalHolePolar)}`);

    assert.strictEqual(result.rationalThetaOffsetPolar.renderMode, 'affine-polar-explicit', `theta-offset rational implicit polar form should stay on affine fast-path: ${JSON.stringify(result.rationalThetaOffsetPolar)}`);
    assert(result.rationalThetaOffsetPolar.holeCount >= 1, `theta-offset rational implicit polar form should expose removable hole metadata at the excluded theta: ${JSON.stringify(result.rationalThetaOffsetPolar)}`);
    assert(result.rationalThetaOffsetPolar.nearestHoleDistance < 0.2, `theta-offset rational implicit polar hole should sit at the expected origin point: ${JSON.stringify(result.rationalThetaOffsetPolar)}`);

    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.detectedType, 'implicit', `non-periodic implicit polar expression should remain implicit at 4pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.detectedType, 'implicit', `non-periodic implicit polar expression should remain implicit at 5pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.renderMode, 'quadratic-polar-explicit', `non-periodic implicit polar expression should use quadratic fast-path at 4pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.renderMode, 'quadratic-polar-explicit', `non-periodic implicit polar expression should use quadratic fast-path at 5pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.finitePointCount > 120, `non-periodic implicit polar expression should produce substantial points at 4pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.finitePointCount > 120, `non-periodic implicit polar expression should produce substantial points at 5pi span: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(Number.isFinite(result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.maxTheta) && result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.maxTheta >= Math.PI - 0.2, `4pi span should preserve expected finite branch coverage: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(Number.isFinite(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.maxTheta) && result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.maxTheta >= (3 * Math.PI) - 0.25, `5pi span should keep sampling through its extended theta max: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(Number.isFinite(result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.maxTheta) && Number.isFinite(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.maxTheta) && result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.maxTheta >= result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.maxTheta + (2 * Math.PI) - 0.35, `extended theta range should materially increase sampled branch coverage: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.finitePointCount >= result.nonPeriodicImplicitPolarRangeCoverage.range4Pi.finitePointCount * 0.55, `5pi span should not collapse to a tiny subset of the 4pi branches: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.hasUpperBranch, true, `5pi span should preserve visible upper branch geometry: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.nonPeriodicImplicitPolarRangeCoverage.range5Pi.hasLowerBranch, true, `5pi span should preserve visible lower branch geometry: ${JSON.stringify(result.nonPeriodicImplicitPolarRangeCoverage)}`);
    assert.strictEqual(result.rationalThetaOffsetPolar.shapeLabel, 'modulated Archimedean spiral', `theta-offset rational implicit polar form should use the precise modulated-spiral label: ${JSON.stringify(result.rationalThetaOffsetPolar)}`);
    assert.notStrictEqual(result.rationalThetaOffsetPolar.shapeLabel, 'limacon - inner loop', `theta-offset rational implicit polar form should not be classified as limacon-inner-loop: ${JSON.stringify(result.rationalThetaOffsetPolar)}`);

    assert.strictEqual(result.inequality.detectedType, 'implicit-inequality', `implicit polar inequality should be detected as implicit-inequality: ${JSON.stringify(result.inequality)}`);
    assert.strictEqual(result.inequality.renderMode, 'marching-polar-adaptive', `implicit polar inequality should use adaptive marching: ${JSON.stringify(result.inequality)}`);
    assert(result.inequality.finitePointCount > 10, `implicit polar inequality boundary should produce finite points: ${JSON.stringify(result.inequality)}`);
    assert.strictEqual(result.inequality.hasGridData, true, `implicit polar inequality should produce grid data for shading: ${JSON.stringify(result.inequality)}`);

    assert.strictEqual(result.quadraticInequality.detectedType, 'implicit-inequality', `quadratic rational polar inequality should stay implicit-inequality in classification: ${JSON.stringify(result.quadraticInequality)}`);
    assert.strictEqual(result.quadraticInequality.renderMode, 'quadratic-polar-inequality-fastpath', `quadratic rational polar inequality should use the explicit even-power fast-path: ${JSON.stringify(result.quadraticInequality)}`);
    assert(result.quadraticInequality.finitePointCount > 80, `quadratic rational polar inequality fast-path should produce a substantial closed boundary: ${JSON.stringify(result.quadraticInequality)}`);
    assert.strictEqual(result.quadraticInequality.hasGridData, false, `quadratic rational polar inequality fast-path should not fall back to adaptive shading grid: ${JSON.stringify(result.quadraticInequality)}`);
    assert.strictEqual(result.quadraticInequality.fillMode, 'inside', `quadratic rational polar inequality should shade inside the paired lobes: ${JSON.stringify(result.quadraticInequality)}`);
    const upperLeftBrightness = result.quadraticInequality.upperLeftRGBA[0] + result.quadraticInequality.upperLeftRGBA[1] + result.quadraticInequality.upperLeftRGBA[2];
    const lowerRightBrightness = result.quadraticInequality.lowerRightRGBA[0] + result.quadraticInequality.lowerRightRGBA[1] + result.quadraticInequality.lowerRightRGBA[2];
    const exteriorBrightness = result.quadraticInequality.exteriorRGBA[0] + result.quadraticInequality.exteriorRGBA[1] + result.quadraticInequality.exteriorRGBA[2];
    assert(upperLeftBrightness > exteriorBrightness, `quadratic rational polar inequality should tint the upper-left lobe more strongly than an exterior point: ${JSON.stringify(result.quadraticInequality)}`);
    assert(lowerRightBrightness > exteriorBrightness, `quadratic rational polar inequality should tint the lower-right lobe more strongly than an exterior point: ${JSON.stringify(result.quadraticInequality)}`);
    assert(result.quadraticInequality.upperLeftRGBA[3] === 255 && result.quadraticInequality.lowerRightRGBA[3] === 255, `quadratic rational polar inequality should render through the visible canvas layer: ${JSON.stringify(result.quadraticInequality)}`);

    assert.strictEqual(result.quadraticNonStrictInequality.detectedType, 'implicit-inequality', `quadratic non-strict polar inequality should stay implicit-inequality in classification: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert.strictEqual(result.quadraticNonStrictInequality.renderMode, 'quadratic-polar-inequality-fastpath', `quadratic non-strict polar inequality should use the explicit even-power fast-path: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert(result.quadraticNonStrictInequality.finitePointCount > 80, `quadratic non-strict polar inequality should produce a substantial closed boundary: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert.strictEqual(result.quadraticNonStrictInequality.hasGridData, false, `quadratic non-strict polar inequality fast-path should not fall back to adaptive shading grid: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert.strictEqual(result.quadraticNonStrictInequality.fillMode, 'inside', `quadratic non-strict polar inequality should shade inside the paired lobes: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert.strictEqual(result.quadraticNonStrictInequality.validationError, null, `quadratic non-strict polar inequality should validate cleanly from MathLive LaTeX: ${JSON.stringify(result.quadraticNonStrictInequality)}`);
    assert(!result.quadraticNonStrictInequality.converted.includes('≤*'), `quadratic non-strict polar inequality conversion should not inject a stray multiplication after ≤: ${JSON.stringify(result.quadraticNonStrictInequality)}`);

    const multiIntersectionInsideBrightness = result.quadraticInequalityIntersection.insideRGBA[0] + result.quadraticInequalityIntersection.insideRGBA[1] + result.quadraticInequalityIntersection.insideRGBA[2];
    const multiIntersectionOutsideBrightness = result.quadraticInequalityIntersection.outsideRGBA[0] + result.quadraticInequalityIntersection.outsideRGBA[1] + result.quadraticInequalityIntersection.outsideRGBA[2];
    assert(multiIntersectionInsideBrightness > multiIntersectionOutsideBrightness, `multiple implicit polar fast-path inequalities should shade their intersection region: ${JSON.stringify(result.quadraticInequalityIntersection)}`);
}

async function assertImplicitVerticalTangentsAreNotTurningMarkers(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;

        const verticalTangentFunc = {
            id: 1,
            expression: 'x-y^2=0',
            points: [
                { x: 0.01, y: -0.1 },
                { x: 0.01, y: 0.1 }
            ],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };

        const horizontalExtremumFunc = {
            id: 2,
            expression: 'x^2+y^2=1',
            points: [
                { x: -0.1, y: 0.9949874371 },
                { x: 0.1, y: 0.9949874371 }
            ],
            color: '#D0021B',
            enabled: true,
            mode: 'cartesian'
        };

        graphiti.turningPointsCache.clear();

        return {
            verticalTangentPoints: graphiti.findImplicitTurningPointsForFunction(verticalTangentFunc),
            horizontalExtremumPoints: graphiti.findImplicitTurningPointsForFunction(horizontalExtremumFunc)
        };
    });

    assert.deepStrictEqual(result.verticalTangentPoints, [], `implicit vertical tangents should not create turning markers: ${JSON.stringify(result)}`);
    assert(
        result.horizontalExtremumPoints.some(point => point.type === 'maximum' && approxEqual(point.x, 0, 0.03) && approxEqual(point.y, 1, 0.03)),
        `implicit horizontal extrema should still create turning markers: ${JSON.stringify(result)}`
    );
}

async function assertImplicitInflectionPointsAreDetected(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showTurningPoints = true;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.turningPointsCache.clear();

        Object.assign(graphiti.viewport, {
            minX: -3,
            maxX: 3,
            minY: -2,
            maxY: 2
        });

        const analyse = async (expression) => {
            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [],
                color: '#4A90E2',
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions = [func];
            graphiti.input.persistentBadges = [];
            graphiti.turningPointsCache.clear();
            await graphiti.plotFunction(func);
            graphiti.turningPoints = graphiti.findTurningPoints();
            return graphiti.turningPoints.map(point => ({ x: point.x, y: point.y, type: point.type }));
        };

        return {
            rationalImplicit: await analyse('y^2=1/(x^2-y^3)'),
            cancelledImplicitCubic: await analyse('((x-4)/(x-1))*y^3-((x+2)/(x-1))=0'),
            circle: await analyse('x^2+y^2=1')
        };
    });

    const rationalInflections = result.rationalImplicit.filter(point => point.type === 'inflection');
    const cancelledCubicInflections = result.cancelledImplicitCubic.filter(point => point.type === 'inflection');
    assert(
        rationalInflections.some(point => approxEqual(point.x, -1.1836363818, 0.08) && approxEqual(point.y, -0.7430407104, 0.08)),
        `implicit rational curve should detect left inflection: ${JSON.stringify(result.rationalImplicit)}`
    );
    assert(
        rationalInflections.some(point => approxEqual(point.x, 1.1836363818, 0.08) && approxEqual(point.y, -0.7430407104, 0.08)),
        `implicit rational curve should detect right inflection: ${JSON.stringify(result.rationalImplicit)}`
    );
    assert(
        !rationalInflections.some(point => point.y > 0),
        `implicit rational curve should not label upper branches as inflections: ${JSON.stringify(result.rationalImplicit)}`
    );
    assert(
        cancelledCubicInflections.some(point => approxEqual(point.x, -2, 0.04)),
        `cancelled implicit cubic should detect cube-root inflection: ${JSON.stringify(result.cancelledImplicitCubic)}`
    );
    assert(
        cancelledCubicInflections.some(point => approxEqual(point.x, 0, 0.04)),
        `cancelled implicit cubic should detect rational branch inflection: ${JSON.stringify(result.cancelledImplicitCubic)}`
    );
    assert(
        !result.circle.some(point => point.type === 'inflection'),
        `circle should not produce implicit inflection markers: ${JSON.stringify(result.circle)}`
    );
}

async function assertExplicitCartesianInflectionPointsAreDetected(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showTurningPoints = true;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.turningPointsCache.clear();

        Object.assign(graphiti.viewport, {
            minX: -4,
            maxX: 4,
            minY: -4,
            maxY: 10
        });

        const evaluate = (expression) => {
            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [],
                color: '#4A90E2',
                enabled: true,
                mode: 'cartesian'
            };
            const convertedExpression = graphiti.convertFromLatex(expression);
            let cleanExpression = convertedExpression.trim();
            if (cleanExpression.toLowerCase().startsWith('y=')) {
                cleanExpression = cleanExpression.substring(2).trim();
            }
            const processedExpression = cleanExpression.toLowerCase();
            const derivativeStr = graphiti.cleanMath.derivative(processedExpression, 'x').toString();
            const secondDerivativeStr = graphiti.cleanMath.derivative(derivativeStr, 'x').toString();
            return graphiti.findTurningPointsForFunction(func, derivativeStr, secondDerivativeStr, processedExpression)
                .map(point => ({
                    x: point.x,
                    y: point.y,
                    type: point.type,
                    isStationaryInflection: point.isStationaryInflection === true
                }));
        };

        return {
            nonStationaryInflection: evaluate('y=x^3+x+5'),
            stationaryInflection: evaluate('y=x^3+5'),
            singularCubeRootInflection: evaluate('y=\\sqrt[3]{x}'),
            noConcavityChange: evaluate('y=x^4'),
            badgeLabels: (() => {
                const func = {
                    id: graphiti.nextFunctionId++,
                    expression: 'y=x^3+x+5',
                    points: [],
                    color: '#4A90E2',
                    enabled: true,
                    mode: 'cartesian'
                };
                graphiti.cartesianFunctions.push(func);
                graphiti.input.persistentBadges = [];
                graphiti.addTurningPointBadge(0, 5, func, 'inflection');
                graphiti.addTurningPointBadge(0, 6, func, 'inflection', null, { isStationaryInflection: true });

                const capturedLabels = [];
                const originalFillText = graphiti.ctx.fillText.bind(graphiti.ctx);
                graphiti.ctx.fillText = (text, ...args) => {
                    capturedLabels.push(String(text));
                    return originalFillText(text, ...args);
                };
                try {
                    graphiti.updateBadgeScreenPositions();
                    graphiti.drawPersistentBadges();
                } finally {
                    graphiti.ctx.fillText = originalFillText;
                }

                const svg = graphiti.buildSVGExport({
                    frameShape: 'original',
                    colorMode: 'colour',
                    textSize: 'medium',
                    strokeWidth: 'small',
                    includeIntersections: true,
                    includeIntercepts: true,
                    includeTurningPoints: true
                });

                return {
                    canvas: capturedLabels,
                    badgeColor: graphiti.input.persistentBadges[0] ? graphiti.input.persistentBadges[0].functionColor : null,
                    svgHasInflectionLabel: svg.includes('Point of Inflection'),
                    svgHasStationaryInflectionLabel: svg.includes('Stationary Inflection')
                };
            })(),
            overlappingHiddenInterceptTap: (() => {
                const func = {
                    id: graphiti.nextFunctionId++,
                    expression: 'y=x^3',
                    points: [],
                    color: '#00C853',
                    enabled: true,
                    mode: 'cartesian'
                };
                graphiti.cartesianFunctions = [func];
                graphiti.input.persistentBadges = [];
                graphiti.showIntersections = false;
                graphiti.showIntercepts = true;
                graphiti.showTurningPoints = true;
                graphiti.currentState = graphiti.states.GRAPHING;

                const processedExpression = 'x^3';
                const derivativeStr = graphiti.cleanMath.derivative(processedExpression, 'x').toString();
                const secondDerivativeStr = graphiti.cleanMath.derivative(derivativeStr, 'x').toString();
                graphiti.turningPoints = graphiti.findTurningPointsForFunction(func, derivativeStr, secondDerivativeStr, processedExpression);
                graphiti.intercepts = [
                    { x: 0, y: 0, type: 'x-intercept', functionId: func.id },
                    { x: 0, y: 0, type: 'y-intercept', functionId: func.id }
                ];
                graphiti.cullInterceptMarkers();

                const screen = graphiti.worldToScreen(0, 0);
                graphiti.showIntercepts = false;

                let tapped = null;
                const originalInterceptTap = graphiti.handleInterceptTap.bind(graphiti);
                const originalTurningPointTap = graphiti.handleTurningPointTap.bind(graphiti);
                graphiti.handleInterceptTap = (intercept, x, y) => {
                    tapped = 'intercept';
                    return originalInterceptTap(intercept, x, y);
                };
                graphiti.handleTurningPointTap = (turningPoint, x, y) => {
                    tapped = turningPoint.type;
                    return originalTurningPointTap(turningPoint, x, y);
                };

                try {
                    const rect = graphiti.canvas.getBoundingClientRect();
                    graphiti.handlePointerStart(rect.left + screen.x, rect.top + screen.y);
                } finally {
                    graphiti.handleInterceptTap = originalInterceptTap;
                    graphiti.handleTurningPointTap = originalTurningPointTap;
                    graphiti.input.mouse.down = false;
                }

                const badge = graphiti.input.persistentBadges[0] || null;
                return {
                    tapped,
                    hiddenInterceptHit: !!graphiti.findInterceptAtScreenPoint(screen.x, screen.y),
                    badgeType: badge ? badge.badgeType : null,
                    significantPointType: badge ? badge.significantPointType : null
                };
            })(),
            overlappingEnabledTapPriority: (() => {
                const func = {
                    id: graphiti.nextFunctionId++,
                    expression: 'y=x^3',
                    points: [],
                    color: '#00C853',
                    enabled: true,
                    mode: 'cartesian'
                };
                graphiti.cartesianFunctions = [func];
                graphiti.input.persistentBadges = [];
                graphiti.currentState = graphiti.states.GRAPHING;

                const processedExpression = 'x^3';
                const derivativeStr = graphiti.cleanMath.derivative(processedExpression, 'x').toString();
                const secondDerivativeStr = graphiti.cleanMath.derivative(derivativeStr, 'x').toString();
                graphiti.turningPoints = graphiti.findTurningPointsForFunction(func, derivativeStr, secondDerivativeStr, processedExpression);
                graphiti.intersections = [{ x: 0, y: 0, func1Id: func.id, func2Id: 'other' }];
                graphiti.intercepts = [
                    { x: 0, y: 0, type: 'x-intercept', functionId: func.id },
                    { x: 0, y: 0, type: 'y-intercept', functionId: func.id }
                ];
                graphiti.cullInterceptMarkers();

                const screen = graphiti.worldToScreen(0, 0);
                const rect = graphiti.canvas.getBoundingClientRect();
                const tapWith = (settings) => {
                    graphiti.input.persistentBadges = [];
                    graphiti.showTurningPoints = settings.turning;
                    graphiti.showIntersections = settings.intersection;
                    graphiti.showIntercepts = settings.intercept;

                    let tapped = null;
                    const originalInterceptTap = graphiti.handleInterceptTap.bind(graphiti);
                    const originalIntersectionTap = graphiti.handleIntersectionTap.bind(graphiti);
                    const originalTurningPointTap = graphiti.handleTurningPointTap.bind(graphiti);
                    graphiti.handleInterceptTap = () => { tapped = 'intercept'; };
                    graphiti.handleIntersectionTap = () => { tapped = 'intersection'; };
                    graphiti.handleTurningPointTap = (turningPoint) => { tapped = turningPoint.type; };

                    try {
                        graphiti.handlePointerStart(rect.left + screen.x, rect.top + screen.y);
                    } finally {
                        graphiti.handleInterceptTap = originalInterceptTap;
                        graphiti.handleIntersectionTap = originalIntersectionTap;
                        graphiti.handleTurningPointTap = originalTurningPointTap;
                        graphiti.input.mouse.down = false;
                    }

                    return tapped;
                };

                return {
                    allEnabled: tapWith({ turning: true, intersection: true, intercept: true }),
                    turningDisabled: tapWith({ turning: false, intersection: true, intercept: true }),
                    turningAndIntersectionDisabled: tapWith({ turning: false, intersection: false, intercept: true })
                };
            })(),
            implicitCubeRootInflection: await (async () => {
                const func = {
                    id: graphiti.nextFunctionId++,
                    expression: 'y^3=x',
                    points: [],
                    color: '#00C853',
                    enabled: true,
                    mode: 'cartesian'
                };
                graphiti.cartesianFunctions = [func];
                graphiti.input.persistentBadges = [];
                graphiti.showTurningPoints = true;

                await graphiti.plotFunction(func);
                graphiti.turningPoints = graphiti.findTurningPoints();
                return {
                    renderMode: func.implicitRenderMode || null,
                    points: graphiti.turningPoints.map(point => ({ x: point.x, y: point.y, type: point.type }))
                };
            })(),
            turningToggleTitle: document.getElementById('turning-points-toggle')?.getAttribute('title') || ''
        };
    });

    assert(
        result.nonStationaryInflection.some(point => point.type === 'inflection' && approxEqual(point.x, 0, 0.02) && approxEqual(point.y, 5, 0.02)),
        `explicit non-stationary inflection should be detected: ${JSON.stringify(result.nonStationaryInflection)}`
    );
    assert(
        result.nonStationaryInflection.some(point => point.type === 'inflection' && point.isStationaryInflection === false),
        `explicit non-stationary inflection should keep the default label classification: ${JSON.stringify(result.nonStationaryInflection)}`
    );
    assert(
        result.stationaryInflection.some(point => point.type === 'inflection' && approxEqual(point.x, 0, 0.02) && approxEqual(point.y, 5, 0.02)),
        `explicit stationary inflection should still be detected: ${JSON.stringify(result.stationaryInflection)}`
    );
    assert(
        result.stationaryInflection.some(point => point.type === 'inflection' && point.isStationaryInflection === true),
        `explicit stationary inflection should carry stationary label metadata: ${JSON.stringify(result.stationaryInflection)}`
    );
    assert(
        result.singularCubeRootInflection.some(point => point.type === 'inflection' && approxEqual(point.x, 0, 0.02) && approxEqual(point.y, 0, 0.02)),
        `explicit cube-root singular inflection should be detected: ${JSON.stringify(result.singularCubeRootInflection)}`
    );
    assert(
        !result.noConcavityChange.some(point => point.type === 'inflection' && approxEqual(point.x, 0, 0.02) && approxEqual(point.y, 0, 0.02)),
        `explicit points without concavity change should not be inflections: ${JSON.stringify(result.noConcavityChange)}`
    );
    assert(
        result.badgeLabels.canvas.some(label => label.includes('Point of Inflection')),
        `inflection badge canvas label should include a description: ${JSON.stringify(result.badgeLabels)}`
    );
    assert(
        result.badgeLabels.canvas.some(label => label.includes('Stationary Inflection')),
        `stationary inflection badge canvas label should be specific: ${JSON.stringify(result.badgeLabels)}`
    );
    assert(
        result.badgeLabels.svgHasInflectionLabel,
        `inflection badge SVG label should include a description: ${JSON.stringify(result.badgeLabels)}`
    );
    assert(
        result.badgeLabels.svgHasStationaryInflectionLabel,
        `stationary inflection badge SVG label should be specific: ${JSON.stringify(result.badgeLabels)}`
    );
    assert.strictEqual(
        result.badgeLabels.badgeColor,
        '#00C853',
        `inflection badge should use the green inflection colour: ${JSON.stringify(result.badgeLabels)}`
    );
    assert.deepStrictEqual(
        result.overlappingHiddenInterceptTap,
        {
            tapped: 'inflection',
            hiddenInterceptHit: false,
            badgeType: 'inflection',
            significantPointType: 'turningPoint'
        },
        `hidden intercepts should not win over overlapping inflections: ${JSON.stringify(result.overlappingHiddenInterceptTap)}`
    );
    assert.deepStrictEqual(
        result.overlappingEnabledTapPriority,
        {
            allEnabled: 'inflection',
            turningDisabled: 'intersection',
            turningAndIntersectionDisabled: 'intercept'
        },
        `overlapping significant point taps should follow enabled priority: ${JSON.stringify(result.overlappingEnabledTapPriority)}`
    );
    assert.strictEqual(
        result.implicitCubeRootInflection.renderMode,
        'monomial-explicit',
        `implicit cube-root form should use monomial explicit rendering: ${JSON.stringify(result.implicitCubeRootInflection)}`
    );
    assert(
        result.implicitCubeRootInflection.points.some(point => point.type === 'inflection' && approxEqual(point.x, 0, 0.02) && approxEqual(point.y, 0, 0.02)),
        `implicit cube-root singular inflection should be detected: ${JSON.stringify(result.implicitCubeRootInflection)}`
    );
    assert(
        /inflection point/i.test(result.turningToggleTitle),
        `turning point toggle title should mention inflection points: ${result.turningToggleTitle}`
    );
}

async function assertParameterZeroDenominatorDoesNotHang(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = true;
        graphiti.showTurningPoints = true;
        graphiti.showIntercepts = true;
        graphiti.input.persistentBadges = [];
        graphiti.clearIntersectionState({ cancelWorker: true });
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('');
        const func = graphiti.cartesianFunctions[0];
        func.expression = '\\frac{x^2}{\\alpha^2}+\\frac{y^2}{\\alpha^2\\left(1-\\beta^2\\right)}=1';
        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        const mathField = item ? item.querySelector('.function-main-row math-field') : null;
        if (mathField) {
            mathField.value = func.expression;
        }

        graphiti.parameters.alpha.value = 1;
        graphiti.parameters.beta.value = 0.5;
        await graphiti.replotAllFunctions();
        const validPointCount = Array.isArray(func.points) ? func.points.length : 0;

        graphiti.parameters.beta.value = 1;
        const start = performance.now();
        const replotResult = await graphiti.replotAllFunctions();
        if (!replotResult || !replotResult.hasValidationErrors) {
            graphiti.updateBadgesAfterParameterChange();
            if (graphiti.showIntersections) {
                graphiti.calculateIntersectionsWithWorker();
            }
            if (graphiti.showIntercepts) {
                graphiti.intercepts = graphiti.findAxisIntercepts();
                graphiti.cullInterceptMarkers();
            }
            if (graphiti.showTurningPoints) {
                graphiti.turningPoints = graphiti.findTurningPoints();
            }
        }
        graphiti.draw();

        return {
            elapsed: performance.now() - start,
            replotHadValidationErrors: !!(replotResult && replotResult.hasValidationErrors),
            validPointCount,
            invalidPointCount: Array.isArray(func.points) ? func.points.length : null,
            validationError: func.validationError || null,
            validationKind: func.validationKind || null,
            hasErrorClass: item ? item.classList.contains('function-error') : false,
            hasWarningClass: item ? item.classList.contains('function-warning') : false,
            activeImplicitCount: graphiti.activeImplicitCalculations ? graphiti.activeImplicitCalculations.size : null
        };
    });

    assert(result.validPointCount > 0, `parameter zero-denominator setup should plot at beta=0.5: ${JSON.stringify(result)}`);
    assert.strictEqual(result.replotHadValidationErrors, true, 'beta=1 zero-denominator replot should report validation error');
    assert.strictEqual(result.invalidPointCount, 0, 'beta=1 zero-denominator equation should clear plotted points');
    assert(result.validationError, 'beta=1 zero-denominator equation should record validation error');
    assert.strictEqual(result.validationKind, 'domain', 'beta=1 zero-denominator equation should be a domain warning');
    assert.strictEqual(result.hasErrorClass, false, 'beta=1 zero-denominator equation should not use syntax error styling');
    assert.strictEqual(result.hasWarningClass, true, 'beta=1 zero-denominator equation should show warning styling');
    assert.strictEqual(result.activeImplicitCount, 0, 'beta=1 zero-denominator equation should leave no active implicit calculations');
    assert(result.elapsed < 1000, `beta=1 zero-denominator replot should return promptly, took ${result.elapsed}ms`);

    const staleSliderResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const betaSlider = document.getElementById('beta-slider');
        if (!betaSlider) {
            return { skipped: true };
        }

        const originalReplotAllFunctions = graphiti.replotAllFunctions.bind(graphiti);
        const originalUpdateBadgesAfterParameterChange = graphiti.updateBadgesAfterParameterChange.bind(graphiti);
        let replotCalls = 0;
        let badgeUpdateCalls = 0;
        let resolveFirstReplot = null;

        graphiti.replotAllFunctions = () => {
            replotCalls++;
            if (replotCalls === 1) {
                return new Promise(resolve => {
                    resolveFirstReplot = () => resolve({ hasValidationErrors: false });
                });
            }
            return Promise.resolve({ hasValidationErrors: true });
        };
        graphiti.updateBadgesAfterParameterChange = () => {
            badgeUpdateCalls++;
        };

        try {
            betaSlider.value = '0.5';
            betaSlider.dispatchEvent(new Event('input', { bubbles: true }));

            const waitStart = performance.now();
            while (replotCalls < 1 && performance.now() - waitStart < 500) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            betaSlider.value = '1';
            betaSlider.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 30));

            if (resolveFirstReplot) {
                resolveFirstReplot();
            }

            await new Promise(resolve => setTimeout(resolve, 80));
            return { skipped: false, replotCalls, badgeUpdateCalls };
        } finally {
            graphiti.replotAllFunctions = originalReplotAllFunctions;
            graphiti.updateBadgesAfterParameterChange = originalUpdateBadgesAfterParameterChange;
        }
    });

    assert.strictEqual(staleSliderResult.skipped, false, 'stale slider regression should find beta slider');
    assert(staleSliderResult.replotCalls >= 2, `stale slider regression should execute both replots: ${JSON.stringify(staleSliderResult)}`);
    assert.strictEqual(staleSliderResult.badgeUpdateCalls, 0, 'stale slider replot should not run post-analysis after newer parameter input');

    const viewportResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const func = graphiti.cartesianFunctions[0];
        graphiti.parameters.alpha.value = 1;
        graphiti.parameters.beta.value = 1;
        await graphiti.replotAllFunctions();

        const originalReplotImplicitFunctions = graphiti.replotImplicitFunctions.bind(graphiti);
        let implicitReplotCalls = 0;
        graphiti.replotImplicitFunctions = (...args) => {
            implicitReplotCalls++;
            return originalReplotImplicitFunctions(...args);
        };

        try {
            const start = performance.now();
            graphiti.handleViewportChange({ skipCoverageRefresh: false });
            await new Promise(resolve => setTimeout(resolve, 120));
            return {
                elapsed: performance.now() - start,
                implicitReplotCalls,
                validationError: func.validationError || null,
                pointCount: Array.isArray(func.points) ? func.points.length : null,
                activeImplicitCount: graphiti.activeImplicitCalculations ? graphiti.activeImplicitCalculations.size : null
            };
        } finally {
            graphiti.replotImplicitFunctions = originalReplotImplicitFunctions;
        }
    });

    assert(viewportResult.validationError, 'viewport regression should keep zero-denominator validation error');
    assert.strictEqual(viewportResult.pointCount, 0, 'viewport regression should not revive invalid function points');
    assert.strictEqual(viewportResult.implicitReplotCalls, 0, 'viewport change should not replot invalid implicit functions');
    assert.strictEqual(viewportResult.activeImplicitCount, 0, 'viewport change should leave no active implicit calculations for invalid functions');
    assert(viewportResult.elapsed < 500, `viewport change with invalid denominator should return promptly, took ${viewportResult.elapsed}ms`);

    const syntaxErrorResult = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        const container = document.getElementById('functions-container');
        container.innerHTML = '';

        graphiti.addFunction('');
        const func = graphiti.cartesianFunctions[0];
        func.expression = 'y=x+';
        const item = document.querySelector(`[data-function-id="${func.id}"]`);
        await graphiti.replotAllFunctions();

        return {
            validationKind: func.validationKind || null,
            hasErrorClass: item ? item.classList.contains('function-error') : false,
            hasWarningClass: item ? item.classList.contains('function-warning') : false
        };
    });

    assert.strictEqual(syntaxErrorResult.validationKind, 'syntax', 'malformed expressions should stay syntax errors');
    assert.strictEqual(syntaxErrorResult.hasErrorClass, true, 'malformed expressions should use red error styling');
    assert.strictEqual(syntaxErrorResult.hasWarningClass, false, 'malformed expressions should not use warning styling');
}

async function assertSquareRootEquivalentExpressionsAnchorAtOrigin(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        Object.assign(graphiti.viewport, {
            minX: -0.2,
            maxX: 3.1,
            minY: -0.5,
            maxY: 2.5,
            width: 960,
            height: 720,
            centerX: 480,
            centerY: 360,
            scale: 960 / 3.3
        });
        Object.assign(graphiti.cartesianViewport, graphiti.viewport);

        const expressions = [
            'y=\\sqrt{x}',
            'y=x^{\\frac12}',
            'y=x^{0.5}',
            'y=x^(1/2)',
            'y=x^0.5'
        ];

        const outputs = [];
        for (const expression of expressions) {
            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [],
                color: '#4A90E2',
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions = [func];
            await graphiti.plotFunction(func);

            const finitePoints = Array.isArray(func.points)
                ? func.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
                : [];
            const originPoint = finitePoints.find(point => Math.abs(point.x) <= 1e-12 && Math.abs(point.y) <= 1e-12) || null;
            const firstFinitePoint = finitePoints[0] || null;

            outputs.push({
                expression,
                hasOriginPoint: !!originPoint,
                firstFinitePoint
            });
        }

        return outputs;
    });

    for (const entry of result) {
        assert.strictEqual(
            entry.hasOriginPoint,
            true,
            `${entry.expression} should include an exact origin sample: ${JSON.stringify(entry)}`
        );
        assert(
            entry.firstFinitePoint && approxEqual(entry.firstFinitePoint.x, 0, 1e-12) && approxEqual(entry.firstFinitePoint.y, 0, 1e-12),
            `${entry.expression} should start its finite samples at the origin: ${JSON.stringify(entry)}`
        );
    }
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

async function assertDraggedLineIntersectionCachesArePruned(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'y=x', points: [{ x: 0, y: 0 }, { x: 2, y: 2 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=0', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], enabled: true, mode: 'cartesian', color: '#D0021B' }
        ];
        graphiti.polarFunctions = [];

        const staleTangent = { x: 1, y: 1, func1Id: 'tangent_7', func2Id: 1 };
        const staleNormal = { x: 2, y: 2, func1Id: 'normal_8', func2Id: 2 };
        const currentMarker = { x: 0, y: 0, func1Id: 1, func2Id: 2 };

        graphiti.intersections = [staleTangent, staleNormal, currentMarker];
        graphiti.explicitIntersections = [staleTangent, currentMarker];
        graphiti.implicitIntersections = [staleNormal, currentMarker];
        graphiti.tangentIntersections = [staleTangent];
        graphiti.normalIntersections = [staleNormal];
        graphiti.combinedIntersections = [staleTangent, staleNormal, currentMarker];
        graphiti.frozenIntersectionBadges = [staleTangent, staleNormal, currentMarker];
        graphiti.lastIntersectionMarkerSnapshot = [staleTangent, staleNormal, currentMarker];

        graphiti.removeTangentIntersectionBadgesForBadge(7);
        graphiti.removeNormalIntersectionBadgesForBadge(8);

        const snapshot = array => array.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id }));
        return {
            intersections: snapshot(graphiti.intersections),
            explicitIntersections: snapshot(graphiti.explicitIntersections),
            implicitIntersections: snapshot(graphiti.implicitIntersections),
            tangentIntersections: snapshot(graphiti.tangentIntersections),
            normalIntersections: snapshot(graphiti.normalIntersections),
            combinedIntersections: snapshot(graphiti.combinedIntersections),
            frozenIntersectionBadges: snapshot(graphiti.frozenIntersectionBadges),
            lastIntersectionMarkerSnapshot: snapshot(graphiti.lastIntersectionMarkerSnapshot)
        };
    });

    const currentMarker = [{ x: 0, y: 0, func1Id: 1, func2Id: 2 }];
    assert.deepStrictEqual(result.intersections, currentMarker, `dragged tangent/normal markers should be pruned from intersections: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.explicitIntersections, currentMarker, `dragged tangent markers should be pruned from explicit cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.implicitIntersections, currentMarker, `dragged normal markers should be pruned from implicit cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.tangentIntersections, [], `dragged tangent markers should be pruned from tangent cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.normalIntersections, [], `dragged normal markers should be pruned from normal cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.combinedIntersections, currentMarker, `dragged line markers should be pruned from combined cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.frozenIntersectionBadges, currentMarker, `dragged line markers should be pruned from frozen cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.lastIntersectionMarkerSnapshot, currentMarker, `dragged line markers should be pruned from last snapshot: ${JSON.stringify(result)}`);
}

async function assertNearAxisExplicitIntersectionsAreNotSnappedToAxis(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = true;
        graphiti.clearIntersectionState({ cancelWorker: true });

        Object.assign(graphiti.viewport, {
            minX: -0.3,
            maxX: -0.22,
            minY: -0.05,
            maxY: 0.02,
            width: 960,
            height: 720
        });
        Object.assign(graphiti.cartesianViewport, graphiti.viewport);

        const makeFunction = async (expression, color) => {
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

        const shiftedCubic = await makeFunction('y=(x-1)^3+2', '#0057FF');
        const cubic = await makeFunction('y=x^3', '#00C853');
        const intersections = graphiti.findIntersectionsExplicit(shiftedCubic, cubic);
        const first = intersections[0] || null;

        return first ? { x: first.x, y: first.y } : null;
    });

    assert(result, 'near-axis cubic intersection should be found');
    assert(approxEqual(result.x, -0.2638, 0.01), `near-axis cubic intersection x should be near the true crossing: ${JSON.stringify(result)}`);
    assert(approxEqual(result.y, -0.01835, 0.01), `near-axis cubic intersection y should be near the true crossing: ${JSON.stringify(result)}`);
    assert(Math.abs(result.y) > 0.005, `near-axis cubic intersection marker should not be snapped to y=0: ${JSON.stringify(result)}`);
}

async function assertIntersectionHitTestChoosesNearestMarker(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showIntersections = true;
        graphiti.input.touch.active = false;

        const viewport = {
            minX: 0,
            maxX: 10,
            minY: 0,
            maxY: 10,
            width: 1000,
            height: 1000,
            centerX: 500,
            centerY: 500,
            scale: 100
        };
        Object.assign(graphiti.viewport, viewport);
        Object.assign(graphiti.cartesianViewport, viewport);

        graphiti.intersections = [
            { x: 1, y: 1, marker: 'first' },
            { x: 1.05, y: 1, marker: 'nearest' }
        ];

        const screen = graphiti.worldToScreen(1.05, 1);
        const hit = graphiti.findIntersectionAtScreenPoint(screen.x, screen.y, 10);
        return hit ? hit.marker : null;
    });

    assert.strictEqual(result, 'nearest', `intersection hit-test should choose nearest marker, got ${JSON.stringify(result)}`);
}

async function assertAsymptoticNearMissIntersectionBadgesAreRejected(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showIntersections = true;
        graphiti.input.touch.active = false;
        graphiti.input.persistentBadges = [];

        const viewport = {
            minX: -3.76,
            maxX: 4.681,
            minY: -1.768,
            maxY: 2.399,
            width: 1576,
            height: 768,
            centerX: 788,
            centerY: 384,
            scale: 1576 / (4.681 + 3.76)
        };
        Object.assign(graphiti.viewport, viewport);
        Object.assign(graphiti.cartesianViewport, viewport);

        const implicitCurve = {
            id: 1,
            expression: 'y^2=1/(x^2-y^3)',
            points: [],
            enabled: true,
            mode: 'cartesian',
            color: '#0057FF'
        };
        const productCurve = {
            id: 2,
            expression: '(y-1)*(y-1/x)=0',
            points: [],
            enabled: true,
            mode: 'cartesian',
            color: '#00C853'
        };
        graphiti.cartesianFunctions = [implicitCurve, productCurve];
        graphiti.polarFunctions = [];

        graphiti.explicitIntersections = [];
        graphiti.implicitIntersections = [
            { x: 2.1, y: 1 / 2.1, func1Id: implicitCurve.id, func2Id: productCurve.id },
            { x: Math.SQRT2, y: 1, func1Id: implicitCurve.id, func2Id: productCurve.id }
        ];
        graphiti.tangentIntersections = [];
        graphiti.normalIntersections = [];
        graphiti.implicitIntersectionsPending = false;
        graphiti.isViewportChanging = false;
        graphiti.updateCombinedIntersections();
        const displayedIntersections = graphiti.intersections.map(point => ({ x: point.x, y: point.y }));
        graphiti.freezeCurrentIntersectionMarkersForViewportChange();
        const frozenIntersections = graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y }));
        graphiti.input.persistentBadges = [];

        const nearMiss = {
            x: 2.1,
            y: 1 / 2.1,
            func1: implicitCurve,
            func2: productCurve
        };
        graphiti.handleIntersectionTap(nearMiss, 0, 0);
        const rejectedNearMissBadgeCount = graphiti.input.persistentBadges.length;
        const nearMissAfterTap = { x: nearMiss.x, y: nearMiss.y };

        const trueIntersection = {
            x: Math.SQRT2,
            y: 1,
            func1: implicitCurve,
            func2: productCurve
        };
        graphiti.handleIntersectionTap(trueIntersection, 0, 0);
        const badge = graphiti.input.persistentBadges[0] || null;

        return {
            displayedIntersections,
            frozenIntersections,
            rejectedNearMissBadgeCount,
            nearMissAfterTap,
            acceptedBadgeCount: graphiti.input.persistentBadges.length,
            acceptedBadge: badge ? { x: badge.worldX, y: badge.worldY } : null
        };
    });

    assert.strictEqual(result.displayedIntersections.length, 1, `asymptotic near-miss should be culled from displayed markers: ${JSON.stringify(result)}`);
    assert(approxEqual(result.displayedIntersections[0].x, Math.SQRT2, 1e-5), `remaining displayed marker should be the true intersection: ${JSON.stringify(result)}`);
    assert(approxEqual(result.displayedIntersections[0].y, 1, 1e-5), `remaining displayed marker should have y=1: ${JSON.stringify(result)}`);
    assert.strictEqual(result.frozenIntersections.length, 1, `pan/zoom snapshot should not restore the asymptotic near-miss: ${JSON.stringify(result)}`);
    assert(approxEqual(result.frozenIntersections[0].x, Math.SQRT2, 1e-5), `frozen marker should be the true intersection: ${JSON.stringify(result)}`);
    assert(approxEqual(result.frozenIntersections[0].y, 1, 1e-5), `frozen marker should have y=1: ${JSON.stringify(result)}`);
    assert.strictEqual(result.rejectedNearMissBadgeCount, 0, `asymptotic near-miss should not create a badge: ${JSON.stringify(result)}`);
    assert(approxEqual(result.nearMissAfterTap.x, 2.1, 1e-12), `rejected near-miss marker should not be moved: ${JSON.stringify(result)}`);
    assert.strictEqual(result.acceptedBadgeCount, 1, `true intersection should still create a badge: ${JSON.stringify(result)}`);
    assert(result.acceptedBadge, `true intersection badge should exist: ${JSON.stringify(result)}`);
    assert(approxEqual(result.acceptedBadge.x, Math.SQRT2, 1e-5), `true intersection badge x should be sqrt(2): ${JSON.stringify(result)}`);
    assert(approxEqual(result.acceptedBadge.y, 1, 1e-5), `true intersection badge y should be 1: ${JSON.stringify(result)}`);
}

async function assertParametricIntersectionTapCreatesBadge(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showIntersections = true;
        graphiti.input.touch.active = false;
        graphiti.input.persistentBadges = [];
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;

        const parametricFunc = {
            id: graphiti.nextFunctionId++,
            expression: '(cos(t), sin(t))',
            points: [],
            enabled: true,
            mode: 'cartesian',
            color: '#0057FF'
        };

        const explicitFunc = {
            id: graphiti.nextFunctionId++,
            expression: 'y=0',
            points: [],
            enabled: true,
            mode: 'cartesian',
            color: '#00C853'
        };

        graphiti.cartesianFunctions.push(parametricFunc, explicitFunc);

        const tappedIntersection = {
            x: 1,
            y: 0,
            func1: parametricFunc,
            func2: explicitFunc,
            func1Id: parametricFunc.id,
            func2Id: explicitFunc.id
        };

        graphiti.handleIntersectionTap(tappedIntersection, 0, 0);

        const badge = graphiti.input.persistentBadges[0] || null;
        return {
            badgeCount: graphiti.input.persistentBadges.length,
            badgeType: badge ? badge.badgeType : null,
            badgeX: badge ? badge.worldX : null,
            badgeY: badge ? badge.worldY : null,
            func1Id: badge ? badge.func1Id : null,
            func2Id: badge ? badge.func2Id : null
        };
    });

    assert.strictEqual(result.badgeCount, 1, `parametric intersection tap should create a badge: ${JSON.stringify(result)}`);
    assert.strictEqual(result.badgeType, 'intersection', `parametric intersection badge should be typed as intersection: ${JSON.stringify(result)}`);
    assert(approxEqual(result.badgeX, 1, 1e-9), `parametric intersection badge should stay at tapped x: ${JSON.stringify(result)}`);
    assert(approxEqual(result.badgeY, 0, 1e-9), `parametric intersection badge should stay at tapped y: ${JSON.stringify(result)}`);
    assert.strictEqual(result.func1Id, 1, `parametric intersection badge should keep func1 id: ${JSON.stringify(result)}`);
    assert.strictEqual(result.func2Id, 2, `parametric intersection badge should keep func2 id: ${JSON.stringify(result)}`);
}

async function assertMixedIntersectionFreezeWaitsForImplicitRefresh(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'x=1', points: [{ x: 1, y: -1 }, { x: 1, y: 2 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=1', points: [{ x: -1, y: 1 }, { x: 3, y: 1 }], enabled: true, mode: 'cartesian', color: '#D0021B' },
            { id: 3, expression: 'y=(x^2-1)/(x+1)', points: [{ x: 0, y: -1 }, { x: 2, y: 1 }], enabled: true, mode: 'cartesian', color: '#7ED321' }
        ];
        graphiti.polarFunctions = [];
        graphiti.explicitIntersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.implicitIntersections = [
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 1, y: 0, func1Id: 1, func2Id: 3 }
        ];
        graphiti.implicitIntersectionsPending = false;
        graphiti.updateCombinedIntersections();

        const snapshot = graphiti.getCurrentIntersectionMarkerSnapshot()
            .map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id }));

        graphiti.frozenIntersectionBadges = snapshot.slice();
        graphiti.implicitIntersections = [];
        graphiti.intersections = graphiti.explicitIntersections.slice();
        graphiti.implicitIntersectionsPending = false;
        const readyWithExplicitOnly = graphiti.hasFreshIntersectionMarkersForFrozenBadges();

        graphiti.implicitIntersections = [
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 1, y: 0, func1Id: 1, func2Id: 3 }
        ];
        graphiti.updateCombinedIntersections();
        const readyWithImplicitRefresh = graphiti.hasFreshIntersectionMarkersForFrozenBadges();

        return { snapshot, readyWithExplicitOnly, readyWithImplicitRefresh };
    });

    assert.deepStrictEqual(result.snapshot, [
        { x: 2, y: 1, func1Id: 2, func2Id: 3 },
        { x: 1, y: 1, func1Id: 1, func2Id: 2 },
        { x: 1, y: 0, func1Id: 1, func2Id: 3 }
    ], `mixed intersection freeze should snapshot all buckets: ${JSON.stringify(result.snapshot)}`);
    assert.strictEqual(result.readyWithExplicitOnly, false, 'frozen mixed intersections should not be released after explicit-only refresh');
    assert.strictEqual(result.readyWithImplicitRefresh, true, 'frozen mixed intersections should release once implicit intersections are refreshed');
}

async function assertSecondPanPreservesFrozenImplicitMarkers(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'x=1', points: [{ x: 1, y: -1 }, { x: 1, y: 2 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=1', points: [{ x: -1, y: 1 }, { x: 3, y: 1 }], enabled: true, mode: 'cartesian', color: '#D0021B' },
            { id: 3, expression: 'y=(x^2-1)/(x+1)', points: [{ x: 0, y: -1 }, { x: 2, y: 1 }], enabled: true, mode: 'cartesian', color: '#7ED321' }
        ];
        graphiti.polarFunctions = [];
        graphiti.intersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.explicitIntersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.implicitIntersections = [];
        graphiti.frozenIntersectionBadges = [
            { x: 2, y: 1, func1Id: 2, func2Id: 3 },
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 1, y: 0, func1Id: 1, func2Id: 3 }
        ];
        graphiti.isViewportChanging = false;
        graphiti.implicitIntersectionsPending = true;

        const originalRefreshExplicitCoverageForViewport = graphiti.refreshExplicitCoverageForViewport.bind(graphiti);
        const originalScheduleImplicitIntersectionCalculation = graphiti.scheduleImplicitIntersectionCalculation.bind(graphiti);
        const originalCancelAllImplicitCalculations = graphiti.cancelAllImplicitCalculations.bind(graphiti);
        const originalSaveViewportBounds = graphiti.saveViewportBounds.bind(graphiti);
        const originalShouldShowViewportWorkIndicator = graphiti.shouldShowViewportWorkIndicator.bind(graphiti);
        graphiti.refreshExplicitCoverageForViewport = () => {};
        graphiti.scheduleImplicitIntersectionCalculation = () => { graphiti.implicitIntersectionsPending = true; };
        graphiti.cancelAllImplicitCalculations = () => {};
        graphiti.saveViewportBounds = () => {};
        graphiti.shouldShowViewportWorkIndicator = () => false;

        try {
            graphiti.handleViewportChange({ skipCoverageRefresh: true });
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
            return graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id }));
        } finally {
            graphiti.refreshExplicitCoverageForViewport = originalRefreshExplicitCoverageForViewport;
            graphiti.scheduleImplicitIntersectionCalculation = originalScheduleImplicitIntersectionCalculation;
            graphiti.cancelAllImplicitCalculations = originalCancelAllImplicitCalculations;
            graphiti.saveViewportBounds = originalSaveViewportBounds;
            graphiti.shouldShowViewportWorkIndicator = originalShouldShowViewportWorkIndicator;
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
            graphiti.frozenIntersectionBadges = [];
        }
    });

    assert.deepStrictEqual(result, [
        { x: 2, y: 1, func1Id: 2, func2Id: 3 },
        { x: 1, y: 1, func1Id: 1, func2Id: 2 },
        { x: 1, y: 0, func1Id: 1, func2Id: 3 }
    ], `second pan during pending implicit refresh should preserve frozen markers: ${JSON.stringify(result)}`);
}

async function assertPanRedrawBeforeSettleKeepsFrozenImplicitMarkers(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'x=1', points: [{ x: 1, y: -1 }, { x: 1, y: 2 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=1', points: [{ x: -1, y: 1 }, { x: 3, y: 1 }], enabled: true, mode: 'cartesian', color: '#D0021B' },
            { id: 3, expression: 'y=(x^2-1)/(x+1)', points: [{ x: 0, y: -1 }, { x: 2, y: 1 }], enabled: true, mode: 'cartesian', color: '#7ED321' }
        ];
        graphiti.polarFunctions = [];
        graphiti.intersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.explicitIntersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.implicitIntersections = [];
        graphiti.frozenIntersectionBadges = [
            { x: 2, y: 1, func1Id: 2, func2Id: 3 },
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 1, y: 0, func1Id: 1, func2Id: 3 }
        ];
        graphiti.isViewportChanging = false;
        graphiti.implicitIntersectionsPending = true;

        const drawCalls = [];
        const originalDrawFrozenIntersectionBadges = graphiti.drawFrozenIntersectionBadges.bind(graphiti);
        graphiti.drawFrozenIntersectionBadges = () => {
            drawCalls.push(graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id })));
            return originalDrawFrozenIntersectionBadges();
        };

        try {
            graphiti.viewport.minX += 0.25;
            graphiti.viewport.maxX += 0.25;
            graphiti.freezeCurrentIntersectionMarkersForViewportChange();
            graphiti.draw();
            return {
                frozenAfterDraw: graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id })),
                drawnFrozen: drawCalls[0] || []
            };
        } finally {
            graphiti.drawFrozenIntersectionBadges = originalDrawFrozenIntersectionBadges;
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
            graphiti.frozenIntersectionBadges = [];
        }
    });

    const expectedMarkers = [
        { x: 2, y: 1, func1Id: 2, func2Id: 3 },
        { x: 1, y: 1, func1Id: 1, func2Id: 2 },
        { x: 1, y: 0, func1Id: 1, func2Id: 3 }
    ];
    assert.deepStrictEqual(result.frozenAfterDraw, expectedMarkers, `pan redraw should keep complete frozen marker cache: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.drawnFrozen, expectedMarkers, `pan redraw should draw complete frozen marker cache: ${JSON.stringify(result)}`);
}

async function assertActiveZoomDrawKeepsFrozenSignificantMarkers(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        const originalVisibility = {
            showIntersections: graphiti.showIntersections,
            showTurningPoints: graphiti.showTurningPoints,
            showIntercepts: graphiti.showIntercepts
        };
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = true;
        graphiti.showIntercepts = true;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        Object.assign(graphiti.cartesianViewport, {
            minX: -8,
            maxX: 8,
            minY: -6,
            maxY: 6,
            width: 960,
            height: 720,
            centerX: 480,
            centerY: 360,
            scale: 60
        });

        const func = {
            id: graphiti.nextFunctionId++,
            expression: 'y=x^2',
            points: [{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);

        graphiti.intercepts = [{ x: 0, y: 0, type: 'x-intercept', functionId: func.id }];
        graphiti.turningPoints = [{ x: 0, y: 0, type: 'minimum', func }];
        graphiti.frozenInterceptBadges = [];
        graphiti.frozenTurningPointBadges = [];
        graphiti.interceptsPendingViewportRefresh = false;
        graphiti.turningPointsPendingViewportRefresh = false;
        graphiti.isViewportChanging = false;

        const drawCalls = {
            frozenIntercept: 0,
            liveIntercept: 0,
            frozenTurning: 0,
            liveTurning: 0
        };

        const originals = {
            drawFrozenInterceptBadges: graphiti.drawFrozenInterceptBadges.bind(graphiti),
            drawInterceptMarkers: graphiti.drawInterceptMarkers.bind(graphiti),
            drawFrozenTurningPointBadges: graphiti.drawFrozenTurningPointBadges.bind(graphiti),
            drawTurningPointMarkers: graphiti.drawTurningPointMarkers.bind(graphiti),
            scheduleZoomViewportSettle: graphiti.scheduleZoomViewportSettle.bind(graphiti)
        };

        graphiti.drawFrozenInterceptBadges = () => { drawCalls.frozenIntercept++; };
        graphiti.drawInterceptMarkers = () => { drawCalls.liveIntercept++; };
        graphiti.drawFrozenTurningPointBadges = () => { drawCalls.frozenTurning++; };
        graphiti.drawTurningPointMarkers = () => { drawCalls.liveTurning++; };
        graphiti.scheduleZoomViewportSettle = () => {};

        try {
            graphiti.zoomIn({ skipCoverageRefresh: true });
            return {
                isViewportChanging: graphiti.isViewportChanging,
                frozenIntercepts: graphiti.frozenInterceptBadges.map(point => ({ x: point.x, y: point.y, type: point.type })),
                frozenTurningPoints: graphiti.frozenTurningPointBadges.map(point => ({ x: point.x, y: point.y, type: point.type })),
                drawCalls
            };
        } finally {
            Object.assign(graphiti, originals);
            graphiti.showIntersections = originalVisibility.showIntersections;
            graphiti.showTurningPoints = originalVisibility.showTurningPoints;
            graphiti.showIntercepts = originalVisibility.showIntercepts;
            graphiti.isViewportChanging = false;
            if (graphiti.zoomSettleTimer) {
                clearTimeout(graphiti.zoomSettleTimer);
                graphiti.zoomSettleTimer = null;
            }
        }
    });

    assert.strictEqual(result.isViewportChanging, true, `zoom interaction should mark viewport changing on active frame: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.frozenIntercepts, [{ x: 0, y: 0, type: 'x-intercept' }], `active zoom should freeze intercept markers before settle: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.frozenTurningPoints, [{ x: 0, y: 0, type: 'minimum' }], `active zoom should freeze turning-point markers before settle: ${JSON.stringify(result)}`);
    assert(result.drawCalls.frozenIntercept > 0, `active zoom frame should draw frozen intercept markers: ${JSON.stringify(result)}`);
    assert(result.drawCalls.frozenTurning > 0, `active zoom frame should draw frozen turning-point markers: ${JSON.stringify(result)}`);
    assert.strictEqual(result.drawCalls.liveIntercept, 0, `active zoom frame should not draw live intercept markers: ${JSON.stringify(result)}`);
    assert.strictEqual(result.drawCalls.liveTurning, 0, `active zoom frame should not draw live turning-point markers: ${JSON.stringify(result)}`);
}

async function assertPanDuringRefreshRestoresLastIntersectionSnapshot(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.showIntersections = true;
        graphiti.cartesianFunctions = [
            { id: 1, expression: 'x=1', points: [{ x: 1, y: -1 }, { x: 1, y: 2 }], enabled: true, mode: 'cartesian', color: '#4A90E2' },
            { id: 2, expression: 'y=1', points: [{ x: -1, y: 1 }, { x: 3, y: 1 }], enabled: true, mode: 'cartesian', color: '#D0021B' },
            { id: 3, expression: 'y=(x^2-1)/(x+1)', points: [{ x: 0, y: -1 }, { x: 2, y: 1 }], enabled: true, mode: 'cartesian', color: '#7ED321' }
        ];
        graphiti.polarFunctions = [];
        graphiti.intersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.explicitIntersections = [{ x: 2, y: 1, func1Id: 2, func2Id: 3 }];
        graphiti.implicitIntersections = [];
        graphiti.frozenIntersectionBadges = [];
        graphiti.lastIntersectionMarkerSnapshot = [
            { x: 2, y: 1, func1Id: 2, func2Id: 3 },
            { x: 1, y: 1, func1Id: 1, func2Id: 2 },
            { x: 1, y: 0, func1Id: 1, func2Id: 3 }
        ];
        graphiti.isViewportChanging = false;
        graphiti.implicitIntersectionsPending = false;
        graphiti.intersectionMarkersPendingViewportRefresh = true;

        try {
            graphiti.freezeCurrentIntersectionMarkersForViewportChange();
            return graphiti.frozenIntersectionBadges.map(point => ({ x: point.x, y: point.y, func1Id: point.func1Id, func2Id: point.func2Id }));
        } finally {
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
            graphiti.intersectionMarkersPendingViewportRefresh = false;
            graphiti.frozenIntersectionBadges = [];
            graphiti.lastIntersectionMarkerSnapshot = [];
        }
    });

    assert.deepStrictEqual(result, [
        { x: 2, y: 1, func1Id: 2, func2Id: 3 },
        { x: 1, y: 1, func1Id: 1, func2Id: 2 },
        { x: 1, y: 0, func1Id: 1, func2Id: 3 }
    ], `pan during pending viewport refresh should restore last complete marker snapshot: ${JSON.stringify(result)}`);
}

async function assertViewportChangeSkipsImplicitIntersectionWorkWhenIntersectionsHidden(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const originalShowIntersections = graphiti.showIntersections;
        const originalShowTurningPoints = graphiti.showTurningPoints;
        const originalShowIntercepts = graphiti.showIntercepts;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
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

        await addFunction('x^2-y^2=1', '#4A90E2');
        await addFunction('x^2-y^2=1', '#D0021B');

        const originalCalculateImplicitIntersections = graphiti.calculateImplicitIntersections.bind(graphiti);
        let implicitIntersectionCalls = 0;
        graphiti.calculateImplicitIntersections = () => {
            implicitIntersectionCalls++;
            return Promise.resolve();
        };

        try {
            graphiti.handleViewportChange({ skipCoverageRefresh: true });
            await new Promise(resolve => setTimeout(resolve, 260));

            return {
                implicitIntersectionCalls,
                pending: graphiti.implicitIntersectionsPending
            };
        } finally {
            graphiti.calculateImplicitIntersections = originalCalculateImplicitIntersections;
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
            if (graphiti.implicitIntersectionTimer) {
                clearTimeout(graphiti.implicitIntersectionTimer);
                graphiti.implicitIntersectionTimer = null;
            }
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
            graphiti.showIntersections = originalShowIntersections;
            graphiti.showTurningPoints = originalShowTurningPoints;
            graphiti.showIntercepts = originalShowIntercepts;
        }
    });

    assert.strictEqual(result.implicitIntersectionCalls, 0, `hidden intersections should skip implicit intersection viewport work: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pending, false, `hidden intersections should not stay pending after viewport change: ${JSON.stringify(result)}`);
}

async function assertIdenticalImplicitEquationsReuseGeometry(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const originalShowIntersections = graphiti.showIntersections;
        const originalShowTurningPoints = graphiti.showTurningPoints;
        const originalShowIntercepts = graphiti.showIntercepts;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
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

        const func1 = {
            id: graphiti.nextFunctionId++,
            expression: 'x^2-y^2=1',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        const func2 = {
            id: graphiti.nextFunctionId++,
            expression: 'x^2-y^2=1',
            points: [],
            color: '#D0021B',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func1, func2);

        const originalPlotImplicitFunction = graphiti.plotImplicitFunction.bind(graphiti);
        let implicitPlotCalls = 0;
        graphiti.plotImplicitFunction = async (...args) => {
            implicitPlotCalls++;
            return originalPlotImplicitFunction(...args);
        };

        try {
            await graphiti.plotFunction(func1);
            await graphiti.plotFunction(func2);

            return {
                implicitPlotCalls,
                func1PointCount: func1.points.length,
                func2PointCount: func2.points.length,
                func2RenderMode: func2.implicitRenderMode || null
            };
        } finally {
            graphiti.plotImplicitFunction = originalPlotImplicitFunction;
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
            if (graphiti.implicitIntersectionTimer) {
                clearTimeout(graphiti.implicitIntersectionTimer);
                graphiti.implicitIntersectionTimer = null;
            }
            graphiti.showIntersections = originalShowIntersections;
            graphiti.showTurningPoints = originalShowTurningPoints;
            graphiti.showIntercepts = originalShowIntercepts;
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
        }
    });

    assert.strictEqual(result.implicitPlotCalls, 1, `identical implicit equations should reuse geometry instead of replotting: ${JSON.stringify(result)}`);
    assert(result.func1PointCount > 0, `first implicit equation should still plot points: ${JSON.stringify(result)}`);
    assert(result.func2PointCount > 0, `reused implicit equation should receive plotted points: ${JSON.stringify(result)}`);
    assert(result.func2RenderMode, `reused implicit equation should preserve render mode metadata: ${JSON.stringify(result)}`);
}

async function assertViewportChangingImplicitIntersectionsKeepVerticalBoundaries(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = true;
        graphiti.showTurningPoints = false;
        graphiti.showIntercepts = false;
        graphiti.input.persistentBadges = [];
        graphiti.clearIntersectionState({ cancelWorker: true });

        Object.assign(graphiti.cartesianViewport, {
            minX: 0,
            maxX: 10,
            minY: 0,
            maxY: 8,
            width: 960,
            height: 720,
            centerX: 480,
            centerY: 360,
            scale: 90
        });

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

        const vertical = await addFunction('x=6', '#4A90E2');
        await addFunction('y=3', '#D0021B');
        await addFunction('y=(x^2-1)/(x+1)', '#7ED321');
        delete vertical.cachedPoints;
        graphiti.isViewportChanging = true;
        graphiti.implicitIntersectionsPending = true;

        try {
            await graphiti.calculateImplicitIntersections();

            const startTime = Date.now();
            while ((graphiti.implicitIntersectionsPending || graphiti.isWorkerCalculating) && Date.now() - startTime < 3000) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            return graphiti.implicitIntersections.map(point => ({
                x: point.x,
                y: point.y,
                func1Id: point.func1Id,
                func2Id: point.func2Id
            }));
        } finally {
            graphiti.isViewportChanging = false;
            graphiti.implicitIntersectionsPending = false;
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
        }
    });

    assert(
        result.some(point => approxEqual(point.x, 6, 0.04) && approxEqual(point.y, 3, 0.04)),
        `viewport-changing implicit intersections should keep vertical/horizontal point (6, 3), got ${JSON.stringify(result)}`
    );
    assert(
        result.some(point => approxEqual(point.x, 6, 0.04) && approxEqual(point.y, 5, 0.04)),
        `viewport-changing implicit intersections should keep vertical/rational point (6, 5), got ${JSON.stringify(result)}`
    );
}

async function assertIdenticalImplicitPairsAreSkippedForIntersections(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const originalPlotImplicitFunction = graphiti.plotImplicitFunction.bind(graphiti);
        const originalWorkerPostMessage = graphiti.intersectionWorker && graphiti.intersectionWorker.postMessage
            ? graphiti.intersectionWorker.postMessage.bind(graphiti.intersectionWorker)
            : null;
        let highResPlotCalls = 0;
        let implicitWorkerFunctionCount = null;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
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

        await addFunction('x^2-y^2=1', '#4A90E2');
        await addFunction('x^2-y^2=1', '#D0021B');

        graphiti.plotImplicitFunction = async (...args) => {
            if (args[1] === true) {
                highResPlotCalls++;
            }
            return originalPlotImplicitFunction(...args);
        };

        if (graphiti.intersectionWorker && originalWorkerPostMessage) {
            graphiti.intersectionWorker.postMessage = message => {
                if (message && message.type === 'CALCULATE_INTERSECTIONS' && message.data && message.data.calculationType === 'implicit') {
                    implicitWorkerFunctionCount = Array.isArray(message.data.functions) ? message.data.functions.length : null;
                }
                return originalWorkerPostMessage(message);
            };
        }

        try {
            graphiti.calculateIntersectionsWithWorker(true);

            const startTime = Date.now();
            while ((graphiti.implicitIntersectionsPending || graphiti.isWorkerCalculating) && Date.now() - startTime < 3000) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }

            return {
                intersectionCount: graphiti.intersections.length,
                implicitCount: graphiti.implicitIntersections.length,
                explicitCount: graphiti.explicitIntersections.length,
                highResPlotCalls,
                implicitWorkerFunctionCount
            };
        } finally {
            graphiti.plotImplicitFunction = originalPlotImplicitFunction;
            if (graphiti.intersectionWorker && originalWorkerPostMessage) {
                graphiti.intersectionWorker.postMessage = originalWorkerPostMessage;
            }
            if (graphiti.implicitIntersectionTimer) {
                clearTimeout(graphiti.implicitIntersectionTimer);
                graphiti.implicitIntersectionTimer = null;
            }
            if (graphiti.intersectionDebounceTimer) {
                clearTimeout(graphiti.intersectionDebounceTimer);
                graphiti.intersectionDebounceTimer = null;
            }
            graphiti.implicitIntersectionsPending = false;
        }
    });

    assert.strictEqual(result.explicitCount, 0, `identical implicit expressions should not add explicit intersections: ${JSON.stringify(result)}`);
    assert.strictEqual(result.implicitCount, 0, `identical implicit expressions should not add implicit intersections: ${JSON.stringify(result)}`);
    assert.strictEqual(result.intersectionCount, 0, `identical implicit expressions should not create visible intersection markers: ${JSON.stringify(result)}`);
    assert.strictEqual(result.highResPlotCalls, 0, `identical implicit expressions should be skipped before high-resolution intersection plotting: ${JSON.stringify(result)}`);
    assert.strictEqual(result.implicitWorkerFunctionCount, null, `identical implicit expressions should short-circuit implicit worker processing after deduplication: ${JSON.stringify(result)}`);
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

async function assertProductFactorAsymptotesStayVisibleDuringViewportSettle(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = false;
        graphiti.showIntercepts = false;
        graphiti.input.persistentBadges = [];

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

        const func = {
            id: graphiti.nextFunctionId++,
            expression: '((x^2-y^2)*(x+y)-1)*(y+1-2*x)*(y^2-2*x)=0',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);
        await graphiti.plotFunction(func);

        const before = {
            renderMode: func.implicitRenderMode || null,
            obliqueCount: func.asymptoteData && Array.isArray(func.asymptoteData.oblique)
                ? func.asymptoteData.oblique.length
                : 0
        };

        const originalProductPlot = graphiti.plotImplicitProductFactorsAsComponents.bind(graphiti);
        const originalSaveViewportBounds = graphiti.saveViewportBounds.bind(graphiti);
        const originalShouldShowViewportWorkIndicator = graphiti.shouldShowViewportWorkIndicator.bind(graphiti);
        let observedAtProductReplot = null;

        graphiti.saveViewportBounds = () => {};
        graphiti.shouldShowViewportWorkIndicator = () => false;
        graphiti.plotImplicitProductFactorsAsComponents = async (...args) => {
            const targetFunc = args[0];
            if (targetFunc && targetFunc.id === func.id && observedAtProductReplot === null) {
                observedAtProductReplot = {
                    hasAsymptoteData: !!targetFunc.asymptoteData,
                    obliqueCount: targetFunc.asymptoteData && Array.isArray(targetFunc.asymptoteData.oblique)
                        ? targetFunc.asymptoteData.oblique.length
                        : 0,
                    preserveFlag: !!targetFunc._preserveFastPathMetadataDuringViewportRefresh
                };
            }
            return originalProductPlot(...args);
        };

        try {
            graphiti.cartesianViewport.minX = -9;
            graphiti.cartesianViewport.maxX = 7;
            graphiti.handleViewportChange({ skipCoverageRefresh: true });

            const start = performance.now();
            while (observedAtProductReplot === null && performance.now() - start < 1000) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            await new Promise(resolve => setTimeout(resolve, 80));
            return {
                before,
                observedAtProductReplot,
                after: {
                    obliqueCount: func.asymptoteData && Array.isArray(func.asymptoteData.oblique)
                        ? func.asymptoteData.oblique.length
                        : 0
                }
            };
        } finally {
            graphiti.plotImplicitProductFactorsAsComponents = originalProductPlot;
            graphiti.saveViewportBounds = originalSaveViewportBounds;
            graphiti.shouldShowViewportWorkIndicator = originalShouldShowViewportWorkIndicator;
        }
    });

    assert.strictEqual(result.before.renderMode, 'product-factors', 'regression setup should use product-factor rendering');
    assert(result.before.obliqueCount > 0, `regression setup should start with product asymptotes: ${JSON.stringify(result)}`);
    assert(result.observedAtProductReplot, `viewport settle should replot product factors: ${JSON.stringify(result)}`);
    assert.strictEqual(result.observedAtProductReplot.preserveFlag, true, 'viewport settle product replot should preserve fast-path metadata');
    assert.strictEqual(result.observedAtProductReplot.hasAsymptoteData, true, 'product asymptotes should stay present while factor replot starts');
    assert(result.observedAtProductReplot.obliqueCount > 0, `product oblique asymptotes should not disappear during replot: ${JSON.stringify(result)}`);
    assert(result.after.obliqueCount > 0, `product oblique asymptotes should still exist after replot: ${JSON.stringify(result)}`);
}

async function assertStressFastPathPanZoomStartsImmediately(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
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

        const expression = '\\frac{x-4}{x-1}y^3-\\frac{x+2}{x-1}=0';
        for (let index = 0; index < 4; index++) {
            const func = {
                id: graphiti.nextFunctionId++,
                expression,
                points: [],
                color: ['#4A90E2', '#D0021B', '#00C853', '#F5A623'][index],
                enabled: true,
                mode: 'cartesian'
            };
            graphiti.cartesianFunctions.push(func);
            await graphiti.plotFunction(func);
        }

        const fastPathCount = graphiti.cartesianFunctions.filter(func => graphiti.isExplicitImplicitFastPath(func)).length;
        const pointCounts = graphiti.cartesianFunctions.map(func => func.points.length);
        const denseFastPathCount = graphiti.cartesianFunctions.filter(func => graphiti.isExplicitImplicitFastPath(func) && func.points.length > 600).length;

        const originalDraw = graphiti.draw.bind(graphiti);
        const originalHandleViewportChange = graphiti.handleViewportChange.bind(graphiti);
        let pointerStartDrawCalls = 0;
        let zoomDrawSawViewportChanging = null;
        let pinchDrawSawViewportChanging = null;

        graphiti.handleViewportChange = () => {};
        graphiti.draw = () => {
            pointerStartDrawCalls++;
        };
        graphiti.handlePointerStart(400, 300);

        graphiti.draw = () => {
            zoomDrawSawViewportChanging = graphiti.isViewportChanging;
        };

        try {
            graphiti.zoomIn();

            graphiti.isViewportChanging = false;
            graphiti.input.pinch.active = false;
            graphiti.handleTouchStart({
                touches: [
                    { clientX: 300, clientY: 300 },
                    { clientX: 500, clientY: 300 }
                ]
            });
            graphiti.draw = () => {
                pinchDrawSawViewportChanging = graphiti.isViewportChanging;
            };
            graphiti.handleTouchMove({
                touches: [
                    { clientX: 280, clientY: 300 },
                    { clientX: 520, clientY: 300 }
                ]
            });
        } finally {
            graphiti.draw = originalDraw;
            graphiti.handleViewportChange = originalHandleViewportChange;
            graphiti.isViewportChanging = false;
            graphiti.input.mouse.down = false;
            graphiti.input.pinch.active = false;
            graphiti.input.touch.active = false;
        }

        return {
            functionCount: graphiti.cartesianFunctions.length,
            fastPathCount,
            pointCounts,
            denseFastPathCount,
            pointerStartDrawCalls,
            zoomDrawSawViewportChanging,
            pinchDrawSawViewportChanging
        };
    });

    assert.strictEqual(result.functionCount, 4, `stress setup should create four functions: ${JSON.stringify(result)}`);
    assert.strictEqual(result.fastPathCount, 4, `stress functions should use explicit fast-path rendering: ${JSON.stringify(result)}`);
    assert.strictEqual(result.denseFastPathCount, 4, `stress functions should be dense enough to exercise interactive decimation: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pointerStartDrawCalls, 0, `background pan pointer-down should not redraw before movement: ${JSON.stringify(result)}`);
    assert.strictEqual(result.zoomDrawSawViewportChanging, true, `zoom draw should use viewport-changing fast path immediately: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pinchDrawSawViewportChanging, true, `pinch draw should use viewport-changing fast path immediately: ${JSON.stringify(result)}`);
}

async function assertQuadraticImplicitEndpointsSurviveViewportDecimation(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
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

        const func = {
            id: graphiti.nextFunctionId++,
            expression: '\\left(x+y-1\\right)\\left(x-y+2\\right)=1',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);
        await graphiti.plotFunction(func);

        const decimationStep = Math.max(1, Math.ceil(func.points.length / 500));
        const endpoints = func.points
            .map((point, index) => ({
                index,
                x: point.x,
                y: point.y,
                tagged: point.quadraticBranchEndpoint === true,
                retainedByModulo: index % decimationStep === 0
            }))
            .filter(point => point.tagged);

        return {
            renderMode: func.implicitRenderMode || null,
            explicitImplicitFastPath: graphiti.isExplicitImplicitFastPath(func),
            decimationStep,
            endpoints,
            untaggedEndpointsSkippedByModulo: func.points.some((point, index) =>
                Number.isFinite(point.x) &&
                Number.isFinite(point.y) &&
                Math.abs(point.x + 1.5) <= 1e-9 &&
                Math.abs(point.y - 1.5) <= 1e-9 &&
                point.quadraticBranchEndpoint !== true &&
                index % decimationStep !== 0
            )
        };
    });

    assert.strictEqual(result.renderMode, 'quadratic-explicit', `test equation should use quadratic fast path: ${JSON.stringify(result)}`);
    assert.strictEqual(result.explicitImplicitFastPath, true, `test equation should be an explicit implicit fast path: ${JSON.stringify(result)}`);
    assert(result.decimationStep > 1, `test equation should exercise viewport decimation: ${JSON.stringify(result)}`);
    assert(
        result.endpoints.some(point => approxEqual(point.x, -1.5, 1e-9) && approxEqual(point.y, 1.5, 1e-9) && !point.retainedByModulo),
        `left branch endpoint should cover a point skipped by modulo decimation: ${JSON.stringify(result)}`
    );
    assert.strictEqual(result.untaggedEndpointsSkippedByModulo, false, `quadratic branch endpoints skipped by modulo must be tagged: ${JSON.stringify(result)}`);
}

async function assertMonomialImplicitEndpointsSurviveViewportDecimation(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
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

        const func = {
            id: graphiti.nextFunctionId++,
            expression: 'x^2-y^2=9',
            points: [],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);
        await graphiti.plotFunction(func);

        const decimationStep = Math.max(1, Math.ceil(func.points.length / 500));
        const endpoints = func.points
            .map((point, index) => ({
                index,
                x: point.x,
                y: point.y,
                tagged: point.monomialBranchEndpoint === true,
                retainedByModulo: index % decimationStep === 0
            }))
            .filter(point => point.tagged);

        return {
            renderMode: func.implicitRenderMode || null,
            explicitImplicitFastPath: graphiti.isExplicitImplicitFastPath(func),
            decimationStep,
            endpoints,
            untaggedEndpointsSkippedByModulo: func.points.some((point, index) =>
                Number.isFinite(point.x) &&
                Number.isFinite(point.y) &&
                Math.abs(Math.abs(point.x) - 3) <= 1e-9 &&
                Math.abs(point.y) <= 1e-9 &&
                point.monomialBranchEndpoint !== true &&
                index % decimationStep !== 0
            )
        };
    });

    assert.strictEqual(result.renderMode, 'monomial-explicit', `test equation should use monomial fast path: ${JSON.stringify(result)}`);
    assert.strictEqual(result.explicitImplicitFastPath, true, `test equation should be an explicit implicit fast path: ${JSON.stringify(result)}`);
    assert(result.decimationStep > 1, `test equation should exercise viewport decimation: ${JSON.stringify(result)}`);
    assert(
        result.endpoints.some(point => approxEqual(point.x, -3, 1e-9) && approxEqual(point.y, 0, 1e-9) && !point.retainedByModulo),
        `left branch endpoint should cover a point skipped by modulo decimation: ${JSON.stringify(result)}`
    );
    assert.strictEqual(result.untaggedEndpointsSkippedByModulo, false, `monomial branch endpoints skipped by modulo must be tagged: ${JSON.stringify(result)}`);
}

async function assertQuadraticImplicitViewportDrawBreaksDiscriminantGap(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.canvas.width = 1576;
        graphiti.canvas.height = 768;
        Object.assign(graphiti.cartesianViewport, {
            minX: -4.798,
            maxX: -1.327,
            minY: -2.989,
            maxY: 5.38,
            width: 1576,
            height: 768,
            centerX: 788,
            centerY: 384,
            scale: 1576 / (-1.327 + 4.798)
        });

        const func = {
            id: 1,
            expression: '\\left(x+y-1\\right)\\left(x-y+2\\right)=1',
            points: [
                { x: -1.5, y: 1.5, connected: false, quadraticBranchEndpoint: true },
                { x: 0.5, y: 1.5, connected: true, quadraticBranchEndpoint: true }
            ],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian',
            implicitRenderMode: 'quadratic-explicit',
            quadraticDiscriminantRoots: [-1.5, 0.5]
        };

        const calls = [];
        const originalLineTo = graphiti.ctx.lineTo.bind(graphiti.ctx);
        const originalMoveTo = graphiti.ctx.moveTo.bind(graphiti.ctx);
        const originalStroke = graphiti.ctx.stroke.bind(graphiti.ctx);
        graphiti.ctx.lineTo = (x, y) => {
            calls.push({ type: 'lineTo', x, y });
            return originalLineTo(x, y);
        };
        graphiti.ctx.moveTo = (x, y) => {
            calls.push({ type: 'moveTo', x, y });
            return originalMoveTo(x, y);
        };
        graphiti.ctx.stroke = () => {
            calls.push({ type: 'stroke' });
            return originalStroke();
        };

        try {
            graphiti.isViewportChanging = true;
            graphiti.drawFunction(func);
        } finally {
            graphiti.ctx.lineTo = originalLineTo;
            graphiti.ctx.moveTo = originalMoveTo;
            graphiti.ctx.stroke = originalStroke;
            graphiti.isViewportChanging = false;
        }

        return {
            calls,
            lineToCount: calls.filter(call => call.type === 'lineTo').length
        };
    });

    assert.strictEqual(result.lineToCount, 0, `viewport-changing draw should not connect quadratic endpoints across discriminant gap: ${JSON.stringify(result)}`);
}

async function assertViewportSettleKeepsFrozenSignificantMarkers(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = true;
        graphiti.showIntercepts = true;
        graphiti.input.persistentBadges = [];
        graphiti.clearIntersectionState({ cancelWorker: true });

        const func = {
            id: graphiti.nextFunctionId++,
            expression: 'y=x^2',
            points: [{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);
        graphiti.intercepts = [{ x: 0, y: 0, type: 'x', functionId: func.id }];
        graphiti.turningPoints = [{ x: 0, y: 0, type: 'minimum', func }];

        const originals = {
            plotFunction: graphiti.plotFunction.bind(graphiti),
            findAxisIntercepts: graphiti.findAxisIntercepts.bind(graphiti),
            findTurningPoints: graphiti.findTurningPoints.bind(graphiti),
            cullInterceptMarkers: graphiti.cullInterceptMarkers.bind(graphiti),
            updateIntegralPairs: graphiti.updateIntegralPairs.bind(graphiti),
            updateBadgesFromSignificantPoints: graphiti.updateBadgesFromSignificantPoints.bind(graphiti),
            drawFrozenInterceptBadges: graphiti.drawFrozenInterceptBadges.bind(graphiti),
            drawInterceptMarkers: graphiti.drawInterceptMarkers.bind(graphiti),
            drawFrozenTurningPointBadges: graphiti.drawFrozenTurningPointBadges.bind(graphiti),
            drawTurningPointMarkers: graphiti.drawTurningPointMarkers.bind(graphiti)
        };

        let resolvePlot = null;
        let frozenInterceptDraws = 0;
        let staleInterceptDraws = 0;
        let frozenTurningDraws = 0;
        let staleTurningDraws = 0;

        graphiti.plotFunction = () => new Promise(resolve => {
            resolvePlot = resolve;
        });
        graphiti.findAxisIntercepts = () => [{ x: 1, y: 0, type: 'x', functionId: func.id }];
        graphiti.findTurningPoints = () => [{ x: 1, y: 1, type: 'minimum', func }];
        graphiti.cullInterceptMarkers = () => {};
        graphiti.updateIntegralPairs = () => {};
        graphiti.updateBadgesFromSignificantPoints = () => {};
        graphiti.drawFrozenInterceptBadges = () => { frozenInterceptDraws++; };
        graphiti.drawInterceptMarkers = () => { staleInterceptDraws++; };
        graphiti.drawFrozenTurningPointBadges = () => { frozenTurningDraws++; };
        graphiti.drawTurningPointMarkers = () => { staleTurningDraws++; };

        try {
            graphiti.isViewportChanging = true;
            graphiti.viewport.minX += 1;
            graphiti.viewport.maxX += 1;
            graphiti.handleViewportChange({ skipCoverageRefresh: true });

            await new Promise(resolve => setTimeout(resolve, 80));
            const pendingState = {
                isViewportChanging: graphiti.isViewportChanging,
                interceptsPending: graphiti.interceptsPendingViewportRefresh,
                turningPointsPending: graphiti.turningPointsPendingViewportRefresh,
                frozenInterceptCount: graphiti.frozenInterceptBadges.length,
                frozenTurningCount: graphiti.frozenTurningPointBadges.length
            };

            graphiti.draw();
            const duringPendingDraw = {
                frozenInterceptDraws,
                staleInterceptDraws,
                frozenTurningDraws,
                staleTurningDraws
            };

            if (resolvePlot) {
                resolvePlot();
            }
            await new Promise(resolve => setTimeout(resolve, 30));

            return {
                pendingState,
                duringPendingDraw,
                afterRefresh: {
                    interceptsPending: graphiti.interceptsPendingViewportRefresh,
                    turningPointsPending: graphiti.turningPointsPendingViewportRefresh,
                    frozenInterceptCount: graphiti.frozenInterceptBadges.length,
                    frozenTurningCount: graphiti.frozenTurningPointBadges.length,
                    interceptX: graphiti.intercepts[0] ? graphiti.intercepts[0].x : null,
                    turningX: graphiti.turningPoints[0] ? graphiti.turningPoints[0].x : null
                }
            };
        } finally {
            Object.assign(graphiti, originals);
            graphiti.isViewportChanging = false;
        }
    });

    assert.strictEqual(result.pendingState.isViewportChanging, false, `settle timer should mark viewport stable while refresh is pending: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.interceptsPending, true, `intercepts should stay pending during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.turningPointsPending, true, `turning points should stay pending during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.frozenInterceptCount, 1, `frozen intercept should be retained during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.frozenTurningCount, 1, `frozen turning point should be retained during delayed refresh: ${JSON.stringify(result)}`);
    assert(result.duringPendingDraw.frozenInterceptDraws > 0, `pending refresh should draw frozen intercepts: ${JSON.stringify(result)}`);
    assert.strictEqual(result.duringPendingDraw.staleInterceptDraws, 0, `pending refresh should not draw stale intercepts: ${JSON.stringify(result)}`);
    assert(result.duringPendingDraw.frozenTurningDraws > 0, `pending refresh should draw frozen turning points: ${JSON.stringify(result)}`);
    assert.strictEqual(result.duringPendingDraw.staleTurningDraws, 0, `pending refresh should not draw stale turning points: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.interceptsPending, false, `intercepts should clear pending state after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.turningPointsPending, false, `turning points should clear pending state after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.frozenInterceptCount, 0, `frozen intercepts should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.frozenTurningCount, 0, `frozen turning points should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.interceptX, 1, `fresh intercept should replace frozen marker after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.turningX, 1, `fresh turning point should replace frozen marker after refresh: ${JSON.stringify(result)}`);
}

async function assertRectangleZoomKeepsFrozenSignificantMarkers(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;
        graphiti.showIntersections = false;
        graphiti.showTurningPoints = true;
        graphiti.showIntercepts = true;
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

        const func = {
            id: graphiti.nextFunctionId++,
            expression: 'y=x^2',
            points: [{ x: -1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);
        graphiti.intercepts = [{ x: 0, y: 0, type: 'x', functionId: func.id }];
        graphiti.turningPoints = [{ x: 0, y: 0, type: 'minimum', func }];

        const originals = {
            plotFunction: graphiti.plotFunction.bind(graphiti),
            findAxisIntercepts: graphiti.findAxisIntercepts.bind(graphiti),
            findTurningPoints: graphiti.findTurningPoints.bind(graphiti),
            cullInterceptMarkers: graphiti.cullInterceptMarkers.bind(graphiti),
            updateIntegralPairs: graphiti.updateIntegralPairs.bind(graphiti),
            updateBadgesFromSignificantPoints: graphiti.updateBadgesFromSignificantPoints.bind(graphiti),
            drawFrozenInterceptBadges: graphiti.drawFrozenInterceptBadges.bind(graphiti),
            drawInterceptMarkers: graphiti.drawInterceptMarkers.bind(graphiti),
            drawFrozenTurningPointBadges: graphiti.drawFrozenTurningPointBadges.bind(graphiti),
            drawTurningPointMarkers: graphiti.drawTurningPointMarkers.bind(graphiti)
        };

        let resolvePlot = null;
        let frozenInterceptDraws = 0;
        let staleInterceptDraws = 0;
        let frozenTurningDraws = 0;
        let staleTurningDraws = 0;

        graphiti.plotFunction = () => new Promise(resolve => {
            resolvePlot = resolve;
        });
        graphiti.findAxisIntercepts = () => [{ x: 1, y: 0, type: 'x', functionId: func.id }];
        graphiti.findTurningPoints = () => [{ x: 1, y: 1, type: 'minimum', func }];
        graphiti.cullInterceptMarkers = () => {};
        graphiti.updateIntegralPairs = () => {};
        graphiti.updateBadgesFromSignificantPoints = () => {};
        graphiti.drawFrozenInterceptBadges = () => { frozenInterceptDraws++; };
        graphiti.drawInterceptMarkers = () => { staleInterceptDraws++; };
        graphiti.drawFrozenTurningPointBadges = () => { frozenTurningDraws++; };
        graphiti.drawTurningPointMarkers = () => { staleTurningDraws++; };

        try {
            graphiti.input.zoomRect.active = true;
            graphiti.input.zoomRect.startX = 240;
            graphiti.input.zoomRect.startY = 180;
            graphiti.input.zoomRect.endX = 720;
            graphiti.input.zoomRect.endY = 540;
            graphiti.isViewportChanging = true;

            graphiti.handleRightClickEnd();

            await new Promise(resolve => setTimeout(resolve, 80));
            const pendingState = {
                isViewportChanging: graphiti.isViewportChanging,
                interceptsPending: graphiti.interceptsPendingViewportRefresh,
                turningPointsPending: graphiti.turningPointsPendingViewportRefresh,
                frozenInterceptCount: graphiti.frozenInterceptBadges.length,
                frozenTurningCount: graphiti.frozenTurningPointBadges.length
            };

            graphiti.draw();
            const duringPendingDraw = {
                frozenInterceptDraws,
                staleInterceptDraws,
                frozenTurningDraws,
                staleTurningDraws
            };

            if (resolvePlot) {
                resolvePlot();
            }
            await new Promise(resolve => setTimeout(resolve, 30));

            return {
                pendingState,
                duringPendingDraw,
                afterRefresh: {
                    interceptsPending: graphiti.interceptsPendingViewportRefresh,
                    turningPointsPending: graphiti.turningPointsPendingViewportRefresh,
                    frozenInterceptCount: graphiti.frozenInterceptBadges.length,
                    frozenTurningCount: graphiti.frozenTurningPointBadges.length,
                    interceptX: graphiti.intercepts[0] ? graphiti.intercepts[0].x : null,
                    turningX: graphiti.turningPoints[0] ? graphiti.turningPoints[0].x : null
                }
            };
        } finally {
            Object.assign(graphiti, originals);
            graphiti.isViewportChanging = false;
            graphiti.input.zoomRect.active = false;
        }
    });

    assert.strictEqual(result.pendingState.isViewportChanging, false, `rectangle zoom settle should mark viewport stable while refresh is pending: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.interceptsPending, true, `rectangle zoom should keep intercepts pending during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.turningPointsPending, true, `rectangle zoom should keep turning points pending during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.frozenInterceptCount, 1, `rectangle zoom should retain frozen intercept during delayed refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.pendingState.frozenTurningCount, 1, `rectangle zoom should retain frozen turning point during delayed refresh: ${JSON.stringify(result)}`);
    assert(result.duringPendingDraw.frozenInterceptDraws > 0, `rectangle zoom pending refresh should draw frozen intercepts: ${JSON.stringify(result)}`);
    assert.strictEqual(result.duringPendingDraw.staleInterceptDraws, 0, `rectangle zoom pending refresh should not draw stale intercepts: ${JSON.stringify(result)}`);
    assert(result.duringPendingDraw.frozenTurningDraws > 0, `rectangle zoom pending refresh should draw frozen turning points: ${JSON.stringify(result)}`);
    assert.strictEqual(result.duringPendingDraw.staleTurningDraws, 0, `rectangle zoom pending refresh should not draw stale turning points: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.interceptsPending, false, `rectangle zoom intercept pending state should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.turningPointsPending, false, `rectangle zoom turning point pending state should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.frozenInterceptCount, 0, `rectangle zoom frozen intercepts should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.frozenTurningCount, 0, `rectangle zoom frozen turning points should clear after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.interceptX, 1, `rectangle zoom fresh intercept should replace frozen marker after refresh: ${JSON.stringify(result)}`);
    assert.strictEqual(result.afterRefresh.turningX, 1, `rectangle zoom fresh turning point should replace frozen marker after refresh: ${JSON.stringify(result)}`);
}

async function assertTurningPointBadgesDoNotRelinkToDistantCandidates(page) {
    const result = await page.evaluate(() => {
        const graphiti = window.graphiti;
        graphiti.plotMode = 'cartesian';
        graphiti.currentState = graphiti.states.GRAPHING;
        graphiti.showTurningPoints = true;
        graphiti.input.persistentBadges = [];
        graphiti.turningPoints = [];
        graphiti.cartesianFunctions = [];
        graphiti.polarFunctions = [];
        graphiti.nextFunctionId = 1;

        graphiti.canvas.width = 960;
        graphiti.canvas.height = 720;
        Object.assign(graphiti.cartesianViewport, {
            minX: -8,
            maxX: 8,
            minY: -6,
            maxY: 6,
            width: 960,
            height: 720,
            centerX: 480,
            centerY: 360,
            scale: 60
        });

        const func = {
            id: graphiti.nextFunctionId++,
            expression: 'y=sin(x)',
            points: [{ x: -1, y: -0.84 }, { x: 0, y: 0 }, { x: 1, y: 0.84 }],
            color: '#4A90E2',
            enabled: true,
            mode: 'cartesian'
        };
        graphiti.cartesianFunctions.push(func);

        const badgeId = graphiti.addTurningPointBadge(0, 0, func, 'minimum');
        const badge = graphiti.input.persistentBadges.find(candidate => candidate.id === badgeId);
        badge.snapRefX = 0;
        badge.snapRefY = 0;
        badge.significantPointType = 'turningPoint';
        badge.badgeType = 'minimum';

        graphiti.turningPoints = [
            { x: 4, y: -1, type: 'minimum', func, id: 'tp_far_min' },
            { x: 2, y: 1, type: 'maximum', func, id: 'tp_far_max' },
            { x: 3, y: 0, type: 'inflection', func, id: 'tp_far_infl' }
        ];
        graphiti.updateBadgesFromSignificantPoints();

        const afterFarCandidates = {
            x: badge.worldX,
            y: badge.worldY,
            significantPointId: badge.significantPointId || null
        };

        graphiti.turningPoints = [
            { x: 0.01, y: -0.01, type: 'minimum', func, id: 'tp_near_min' }
        ];
        graphiti.updateBadgesFromSignificantPoints();

        return {
            afterFarCandidates,
            afterNearCandidate: {
                x: badge.worldX,
                y: badge.worldY,
                significantPointId: badge.significantPointId || null
            }
        };
    });

    assert(
        approxEqual(result.afterFarCandidates.x, 0, 1e-9) && approxEqual(result.afterFarCandidates.y, 0, 1e-9),
        `turning badge should stay anchored when only distant turning-point candidates are available: ${JSON.stringify(result)}`
    );
    assert(
        approxEqual(result.afterNearCandidate.x, 0.01, 0.001) && approxEqual(result.afterNearCandidate.y, -0.01, 0.001),
        `turning badge should relink when a nearby same-type turning point candidate appears: ${JSON.stringify(result)}`
    );
    assert.strictEqual(
        result.afterNearCandidate.significantPointId,
        'tp_near_min',
        `turning badge should store the matched significant-point id after relink: ${JSON.stringify(result)}`
    );
}

async function assertTouchPngExportPreviewFrameAlignsOnFirstOpen(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
        const result = await page.evaluate(async () => {
            const graphiti = window.graphiti;
            graphiti.currentState = graphiti.states.GRAPHING;
            graphiti.canvas.width = 390;
            graphiti.canvas.height = 844;
            Object.assign(graphiti.cartesianViewport, {
                minX: -8,
                maxX: 8,
                minY: -17.31282051282051,
                maxY: 17.31282051282051,
                width: 390,
                height: 844,
                centerX: 195,
                centerY: 422,
                scale: 24.375
            });

            const originalIsTouchExportDevice = graphiti.isTouchExportDevice.bind(graphiti);
            graphiti.isTouchExportDevice = () => true;
            try {
                graphiti.toggleExportOverlay(true);
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const format = document.querySelector('input[name="export-format"]:checked');
                const canvas = document.getElementById('export-preview-canvas');
                const frame = document.getElementById('export-preview-frame');
                const canvasRect = canvas.getBoundingClientRect();
                const frameRect = frame.getBoundingClientRect();

                graphiti.toggleExportOverlay(false);
                return {
                    format: format ? format.value : null,
                    canvas: {
                        left: canvasRect.left,
                        top: canvasRect.top,
                        width: canvasRect.width,
                        height: canvasRect.height
                    },
                    frame: {
                        left: frameRect.left,
                        top: frameRect.top,
                        width: frameRect.width,
                        height: frameRect.height
                    }
                };
            } finally {
                graphiti.isTouchExportDevice = originalIsTouchExportDevice;
                graphiti.toggleExportOverlay(false);
            }
        });

        assert.strictEqual(result.format, 'png', `touch export should default to PNG: ${JSON.stringify(result)}`);
        assert(approxEqual(result.canvas.top, result.frame.top, 0.75), `PNG preview frame top should align on first portrait open: ${JSON.stringify(result)}`);
        assert(approxEqual(result.canvas.height, result.frame.height, 0.75), `PNG preview frame height should align on first portrait open: ${JSON.stringify(result)}`);
        assert(approxEqual(result.canvas.left, result.frame.left, 0.75), `PNG preview frame left should align on first portrait open: ${JSON.stringify(result)}`);
        assert(approxEqual(result.canvas.width, result.frame.width, 0.75), `PNG preview frame width should align on first portrait open: ${JSON.stringify(result)}`);
    } finally {
        await page.setViewportSize({ width: 960, height: 720 });
    }
}

async function assertDemoSetLoadsTrackGoatCounterEvent(page) {
    const result = await page.evaluate(async () => {
        const graphiti = window.graphiti;
        const originalGoatCounter = window.goatcounter;
        const originals = {
            addExampleFunction: graphiti.addExampleFunction,
            draw: graphiti.draw,
            getCurrentFunctions: graphiti.getCurrentFunctions,
            saveFunctionsToLocalStorage: graphiti.saveFunctionsToLocalStorage,
            updateRangeInputs: graphiti.updateRangeInputs,
            viewport: { ...graphiti.viewport }
        };

        const events = [];
        const loadedExpressions = [];
        let drawCalls = 0;
        let saveCalls = 0;

        try {
            window.goatcounter = {
                count: event => events.push(event)
            };
            graphiti.addExampleFunction = async expression => {
                loadedExpressions.push(expression);
            };
            graphiti.draw = () => {
                drawCalls++;
            };
            graphiti.getCurrentFunctions = () => [];
            graphiti.saveFunctionsToLocalStorage = () => {
                saveCalls++;
            };
            graphiti.updateRangeInputs = () => {};

            await graphiti.addDemoSet('better-than-desmos');
            await graphiti.addDemoSet('not-a-demo-set');

            return { events, loadedExpressions, drawCalls, saveCalls };
        } finally {
            window.goatcounter = originalGoatCounter;
            graphiti.addExampleFunction = originals.addExampleFunction;
            graphiti.draw = originals.draw;
            graphiti.getCurrentFunctions = originals.getCurrentFunctions;
            graphiti.saveFunctionsToLocalStorage = originals.saveFunctionsToLocalStorage;
            graphiti.updateRangeInputs = originals.updateRangeInputs;
            Object.assign(graphiti.viewport, originals.viewport);
        }
    });

    assert.deepStrictEqual(result.loadedExpressions, [
        'y^2=\\frac{1}{x^2-y^3}',
        '\\left(y-1\\right)\\left(y-\\frac{1}{x}\\right)=0'
    ], `demo set analytics test should load the selected demo expressions: ${JSON.stringify(result)}`);
    assert.strictEqual(result.drawCalls, 1, `valid demo set should finish drawing once: ${JSON.stringify(result)}`);
    assert.strictEqual(result.saveCalls, 1, `valid demo set should save once: ${JSON.stringify(result)}`);
    assert.deepStrictEqual(result.events, [{
        path: '/event/graphiti-better-than-desmos-demo-loaded',
        title: 'Graphiti-better-than-desmos-demo loaded',
        event: true
    }], `valid demo set should track one GoatCounter load event: ${JSON.stringify(result)}`);
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
            if (Array.isArray(expected.productFactorRenderModes)) {
                assert.deepStrictEqual(actual.productFactorRenderModes, expected.productFactorRenderModes, `${label}: product factor render modes`);
            }
            if (typeof expected.explicitImplicitFastPath === 'boolean') {
                assert.strictEqual(actual.explicitImplicitFastPath, expected.explicitImplicitFastPath, `${label}: draw-path classification`);
            }
            if (typeof expected.hasGridData === 'boolean') {
                assert.strictEqual(actual.hasGridData, expected.hasGridData, `${label}: inequality grid data`);
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
            if (Number.isFinite(expected.minFinitePointCount)) {
                assert(
                    actual.finitePointCount >= expected.minFinitePointCount,
                    `${label}: expected at least ${expected.minFinitePointCount} finite points, got ${actual.finitePointCount}`
                );
            }
            if (Number.isFinite(expected.maxTallVerticalSegments)) {
                assert(
                    actual.tallVerticalSegmentCount <= expected.maxTallVerticalSegments,
                    `${label}: expected at most ${expected.maxTallVerticalSegments} tall vertical segments, got ${actual.tallVerticalSegmentCount}`
                );
            }
            for (const breakProbe of expected.noFiniteSegmentBreaksNear || []) {
                const tolerance = Number.isFinite(breakProbe.tolerance) ? breakProbe.tolerance : 0.1;
                const nearbyBreaks = (actual.finiteSegmentStartXs || []).filter(x => Math.abs(x - breakProbe.x) <= tolerance);
                assert.strictEqual(
                    nearbyBreaks.length,
                    0,
                    `${label}: expected no finite segment break near x=${breakProbe.x}, got ${JSON.stringify(nearbyBreaks)}`
                );
            }
            assertApproxSet(actual.asymptoteData.vertical, expected.verticalAsymptotes || [], 0.03, `${label} vertical asymptotes`);
            assertApproxSet(actual.asymptoteData.horizontal, expected.horizontalAsymptotes || [], 0.03, `${label} horizontal asymptotes`);
            assertApproxLines(actual.asymptoteData.oblique, expected.obliqueAsymptotes || [], { m: 0.035, b: 0.08 }, `${label} oblique asymptotes`);
            assertApproxPolynomials(actual.asymptoteData.curved, expected.curvedAsymptotes || [], 1e-8, `${label} curved asymptotes`);
            assertEnvelope(actual.envelopeData, expected.envelope || null, 1e-8, `${label} envelope`);
            assertHoles(actual.holes, expected.holes || [], { x: 0.04, y: 0.04 }, `${label} holes`);
            if (!expected.skipVerticalComponents) {
                assertApproxSet(actual.verticalComponents, expected.verticalComponents || [], 0.04, `${label} vertical component metadata`);
            }
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
        await assertLegacyDerivativeCacheEntriesDoNotSuppressTurningPoints(page);
        await assertShapeClassification(page);
        await assertPolarThetaRangeErrorRecovery(page);
        await assertPolarThetaRangeRestoreUsesSavedMaxUnlessInterrupted(page);
        await assertImplicitPolarAnimationReplotStaysConsistent(page);
        await assertExplicitPolarSingularRayAsymptotes(page);
        await assertPolarFullCycleWrapClosure(page);
        await assertStrictImplicitInequalityVerticalComponentsAreDashed(page);
        await assertImplicitFastPathTurningPointsStayQuiet(page);
        await assertInverseCubeRootImplicitPlotsAsCubic(page);
        await assertPolarStationaryPointsAreNamedRadialExtrema(page);
        await assertImplicitPolarMarchingPlotsAndShades(page);
        await assertImplicitVerticalTangentsAreNotTurningMarkers(page);
        await assertImplicitInflectionPointsAreDetected(page);
        await assertExplicitCartesianInflectionPointsAreDetected(page);
        await assertParameterZeroDenominatorDoesNotHang(page);
        await assertSquareRootEquivalentExpressionsAnchorAtOrigin(page);
        await assertStaleIntersectionMarkersAreDiscarded(page);
        await assertDraggedLineIntersectionCachesArePruned(page);
        await assertNearAxisExplicitIntersectionsAreNotSnappedToAxis(page);
        await assertIntersectionHitTestChoosesNearestMarker(page);
        await assertAsymptoticNearMissIntersectionBadgesAreRejected(page);
        await assertParametricIntersectionTapCreatesBadge(page);
        await assertMixedIntersectionFreezeWaitsForImplicitRefresh(page);
        await assertSecondPanPreservesFrozenImplicitMarkers(page);
        await assertPanRedrawBeforeSettleKeepsFrozenImplicitMarkers(page);
        await assertActiveZoomDrawKeepsFrozenSignificantMarkers(page);
        await assertViewportChangeSkipsImplicitIntersectionWorkWhenIntersectionsHidden(page);
        await assertIdenticalImplicitEquationsReuseGeometry(page);
        await assertPanDuringRefreshRestoresLastIntersectionSnapshot(page);
        await assertViewportChangingImplicitIntersectionsKeepVerticalBoundaries(page);
        await assertIdenticalImplicitPairsAreSkippedForIntersections(page);
        await assertImplicitVerticalComponentsIntersectExplicitCurves(page);
        await assertProductFactorAsymptotesStayVisibleDuringViewportSettle(page);
        await assertStressFastPathPanZoomStartsImmediately(page);
        await assertQuadraticImplicitEndpointsSurviveViewportDecimation(page);
        await assertMonomialImplicitEndpointsSurviveViewportDecimation(page);
        await assertQuadraticImplicitViewportDrawBreaksDiscriminantGap(page);
        await assertViewportSettleKeepsFrozenSignificantMarkers(page);
        await assertRectangleZoomKeepsFrozenSignificantMarkers(page);
        await assertTurningPointBadgesDoNotRelinkToDistantCandidates(page);
        await assertTouchPngExportPreviewFrameAlignsOnFirstOpen(page);
        await assertDemoSetLoadsTrackGoatCounterEvent(page);

        console.log(`graph contract tests passed (${fixtures.length} fixtures)`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
