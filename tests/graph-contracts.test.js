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

        await graphiti.applySharedStateFromUrl(makeSharedState('y=x', 21));
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
            state: graphiti.currentState
        };
    });

    assert.deepStrictEqual(sharedHashReplacementResult.expressions, ['y=x^2', ''], 'same-tab shared URL replacement should apply the new hash state');
    assert.strictEqual(sharedHashReplacementResult.badgeCount, 0, 'same-tab shared URL replacement should clear badges omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.badgeIdCounter, 0, 'same-tab shared URL replacement should reset badge IDs when the new state has no badges');
    assert.strictEqual(sharedHashReplacementResult.integralPairCount, 0, 'same-tab shared URL replacement should clear integral pairs omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.linkedBadgePairCount, 0, 'same-tab shared URL replacement should clear linked badge pairs omitted by the new state');
    assert.strictEqual(sharedHashReplacementResult.tempSession, true, 'same-tab shared URL replacement should remain in temporary shared-link mode');
    assert.strictEqual(sharedHashReplacementResult.state, 'graphing', 'same-tab shared URL replacement should stay in graphing state');

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
            circle: await analyse('x^2+y^2=1')
        };
    });

    const rationalInflections = result.rationalImplicit.filter(point => point.type === 'inflection');
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
        graphiti.intersections = graphiti.explicitIntersections.slice();

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

async function assertPanDuringRefreshRestoresLastIntersectionSnapshot(page) {
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
        await assertShapeClassification(page);
        await assertStrictImplicitInequalityVerticalComponentsAreDashed(page);
        await assertImplicitFastPathTurningPointsStayQuiet(page);
        await assertInverseCubeRootImplicitPlotsAsCubic(page);
        await assertPolarStationaryPointsAreNamedRadialExtrema(page);
        await assertImplicitVerticalTangentsAreNotTurningMarkers(page);
        await assertImplicitInflectionPointsAreDetected(page);
        await assertExplicitCartesianInflectionPointsAreDetected(page);
        await assertParameterZeroDenominatorDoesNotHang(page);
        await assertStaleIntersectionMarkersAreDiscarded(page);
        await assertDraggedLineIntersectionCachesArePruned(page);
        await assertNearAxisExplicitIntersectionsAreNotSnappedToAxis(page);
        await assertMixedIntersectionFreezeWaitsForImplicitRefresh(page);
        await assertSecondPanPreservesFrozenImplicitMarkers(page);
        await assertPanRedrawBeforeSettleKeepsFrozenImplicitMarkers(page);
        await assertPanDuringRefreshRestoresLastIntersectionSnapshot(page);
        await assertViewportChangingImplicitIntersectionsKeepVerticalBoundaries(page);
        await assertImplicitVerticalComponentsIntersectExplicitCurves(page);
        await assertProductFactorAsymptotesStayVisibleDuringViewportSettle(page);
        await assertStressFastPathPanZoomStartsImmediately(page);
        await assertQuadraticImplicitEndpointsSurviveViewportDecimation(page);
        await assertMonomialImplicitEndpointsSurviveViewportDecimation(page);
        await assertQuadraticImplicitViewportDrawBreaksDiscriminantGap(page);
        await assertViewportSettleKeepsFrozenSignificantMarkers(page);
        await assertRectangleZoomKeepsFrozenSignificantMarkers(page);
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
