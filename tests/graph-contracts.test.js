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
        { expression: 'y=2*x+1', expected: 'line' },
        { expression: '(x^2+y^2-4)*(y-x)=0', expected: 'circle + line' },
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
            envelopeContainerVisible: envelopeContainer ? envelopeContainer.classList.contains('visible') : false
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
            savedFunctionKeys: Object.keys(JSON.parse(JSON.stringify(func))).filter(key => key === 'showAsymptotes' || key === 'showEnvelopes')
        };

        return { before, after };
    });

    assert.strictEqual(metadataToggleResult.before.asymptoteVisible, true, 'asymptote overlay should default to visible');
    assert.strictEqual(metadataToggleResult.before.envelopeVisible, true, 'envelope overlay should default to visible');
    assert.strictEqual(metadataToggleResult.before.asymptoteToggleHidden, false, 'asymptote toggle should default to filled');
    assert.strictEqual(metadataToggleResult.before.envelopeToggleHidden, false, 'envelope toggle should default to filled');
    assert.strictEqual(metadataToggleResult.after.asymptoteVisible, false, 'asymptote toggle should hide asymptote overlays');
    assert.strictEqual(metadataToggleResult.after.envelopeVisible, false, 'envelope toggle should hide envelope overlays');
    assert.strictEqual(metadataToggleResult.after.asymptoteToggleHidden, true, 'asymptote toggle should become hollow when hidden');
    assert.strictEqual(metadataToggleResult.after.envelopeToggleHidden, true, 'envelope toggle should become hollow when hidden');
    assert.strictEqual(metadataToggleResult.after.asymptoteContainerVisible, true, 'asymptote metadata should remain visible when overlay hidden');
    assert.strictEqual(metadataToggleResult.after.envelopeContainerVisible, true, 'envelope metadata should remain visible when overlay hidden');

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
        await assertImplicitFastPathTurningPointsStayQuiet(page);
        await assertParameterZeroDenominatorDoesNotHang(page);
        await assertStaleIntersectionMarkersAreDiscarded(page);
        await assertImplicitVerticalComponentsIntersectExplicitCurves(page);
        await assertProductFactorAsymptotesStayVisibleDuringViewportSettle(page);

        console.log(`graph contract tests passed (${fixtures.length} fixtures)`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
