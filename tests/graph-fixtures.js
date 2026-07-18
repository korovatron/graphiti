const sqrt3Over3 = Math.sqrt(3) / 3;
const goldenRatio = (1 + Math.sqrt(5)) / 2;

const defaultViewport = {
    minX: -8,
    maxX: 8,
    minY: -8,
    maxY: 8,
    width: 960,
    height: 720
};

const farZoomViewport = {
    minX: -100,
    maxX: 100,
    minY: -100,
    maxY: 100,
    width: 960,
    height: 720
};

const closeShiftedSincViewport = {
    minX: -1,
    maxX: 7,
    minY: -1,
    maxY: 5,
    width: 960,
    height: 720
};

const tallWideViewport = {
    minX: -30,
    maxX: 240,
    minY: -200,
    maxY: 520,
    width: 960,
    height: 720
};

const exponentialSineViewport = {
    minX: -25.93,
    maxX: 22.12,
    minY: -41.41,
    maxY: 43.34,
    width: 960,
    height: 720
};

const dampedCosineViewport = {
    minX: -13.63,
    maxX: 13.25,
    minY: -6.263,
    maxY: 6.944,
    width: 960,
    height: 720
};

module.exports = [
    {
        name: 'gaussian damped cosine keeps horizontal asymptote when zoomed far out',
        expression: 'y=e^(-x^2/5)*cos(5*x)',
        viewport: farZoomViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: []
        }
    },
    {
        name: 'exponential sine keeps steep finite zero crossing connected',
        expression: 'y=e^(-x)*sin(x)',
        viewport: exponentialSineViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            envelope: { baseline: 0, amplitude: 1, decayRate: 1 },
            noFiniteSegmentBreaksNear: [{ x: -2 * Math.PI, tolerance: 0.08 }]
        }
    },
    {
        name: 'shifted scaled damped cosine reports envelopes',
        expression: 'y=2+3*e^(-0.4*x)*cos(5*x+1)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            envelope: { baseline: 2, amplitude: 3, decayRate: 0.4 }
        }
    },
    {
        name: 'damped cosine reports only structural centreline asymptote',
        expression: 'y=e^(-0.1*x)*cos(2*x)',
        viewport: dampedCosineViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            envelope: { baseline: 0, amplitude: 1, decayRate: 0.1 }
        }
    },
    {
        name: 'growing exponential sine reports envelopes',
        expression: 'y=e^(0.1*x)*sin(x)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            envelope: { baseline: 0, amplitude: 1, decayRate: -0.1 }
        }
    },
    {
        name: 'parameter damped sine cosine sum reports combined envelopes',
        expression: 'y=\gamma+e^{-\alpha x}(3\sin(2x)+4\cos(2x))',
        viewport: defaultViewport,
        parameters: { alpha: 0.5, gamma: 2 },
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            envelope: { baseline: 2, amplitude: 5, decayRate: 0.5 }
        }
    },
    {
        name: 'shifted sinc has removable hole at its shifted limit',
        expression: 'y=sin(x)/x+2',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            holes: [{ x: 0, y: 3 }]
        }
    },
    {
        name: 'horizontally shifted sinc has stable shifted horizontal asymptote',
        expression: 'y=sin(x-pi)/(x-pi)+2',
        viewport: farZoomViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            holes: [{ x: Math.PI, y: 3 }]
        }
    },
    {
        name: 'latex shifted sinc keeps horizontal asymptote at ordinary zoom',
        expression: 'y=\\frac{\\sin\\left(x-\\pi\\right)}{x-\\pi}+2',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            holes: [{ x: Math.PI, y: 3 }]
        }
    },
    {
        name: 'latex shifted sinc keeps horizontal asymptote when zoomed in',
        expression: 'y=\\frac{\\sin\\left(x-\\pi\\right)}{x-\\pi}+2',
        viewport: closeShiftedSincViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [2],
            obliqueAsymptotes: [],
            holes: [{ x: Math.PI, y: 3 }]
        }
    },
    {
        name: 'implicit reciprocal cubic denominator has only horizontal asymptote',
        expression: 'y^2=1/(x^2-y^3)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: []
        }
    },
    {
        name: 'implicit cubic reciprocal renders horizontal and diagonal branches',
        expression: 'y^2=1/(x^3-y^3)',
        viewport: defaultViewport,
        expected: {
            renderMode: 'monomial-x-explicit',
            explicitImplicitFastPath: true,
            minBoundaryContinuations: 2,
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [{ m: 1, b: 0 }],
            pointsNear: [
                { x: 5.78, y: 0.072, tolerance: 0.1, label: 'horizontal branch' },
                { x: 6, y: 6, tolerance: 0.18, label: 'diagonal branch' }
            ]
        }
    },
    {
        name: 'line plus reciprocal branch has asymptotes, hole and horizontal component',
        expression: '(y-1)*(y-1/x)=0',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [0],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            holes: [{ x: 0, y: 1 }],
            horizontalComponents: [1]
        }
    },
    {
        name: 'cancelled implicit cubic keeps true asymptotes and removable hole',
        expression: '((x-4)/(x-1))*y^3-((x+2)/(x-1))=0',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [4],
            horizontalAsymptotes: [1],
            obliqueAsymptotes: [],
            holes: [{ x: 1, y: -1 }]
        }
    },
    {
        name: 'rectangular hyperbola has horizontal and diagonal asymptotes',
        expression: 'y^2-x*y=1',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [{ m: 1, b: 0 }]
        }
    },
    {
        name: 'rational quartic reports polynomial curved asymptote',
        expression: 'y=(x^4+1)/(x^2+1)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            curvedAsymptotes: [{ coefficients: [-1, 0, 1] }]
        }
    },
    {
        name: 'polynomial plus reciprocal reports curved asymptote',
        expression: 'y=x^2+1/x',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [0],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            curvedAsymptotes: [{ coefficients: [0, 0, 1] }]
        }
    },
    {
        name: 'affine implicit cubic over x reports curved asymptote',
        expression: 'x*y=x^3+1',
        viewport: defaultViewport,
        expected: {
            renderMode: 'affine-explicit',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [0],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            curvedAsymptotes: [{ coefficients: [0, 0, 1] }]
        }
    },
    {
        name: 'rotated hyperbola reports golden-ratio oblique asymptotes',
        expression: 'x^2-y^2+x*y=1',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [
                { m: -1 / goldenRatio, b: 0 },
                { m: goldenRatio, b: 0 }
            ]
        }
    },
    {
        name: 'cancelled line has removable hole and no asymptotes',
        expression: '(x^2-y^2)/(x+y)=1',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 0.5, y: -0.5 }]
        }
    },
    {
        name: 'cancelled explicit line has removable hole and no asymptotes',
        expression: 'y=((x-2)*(x+1))/(x-2)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 2, y: 3 }]
        }
    },
    {
        name: 'cancelled LaTeX explicit line has removable hole and no asymptotes',
        expression: 'y=\\frac{\\left(x-2\\right)\\left(x+1\\right)}{\\left(x-2\\right)}',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 2, y: 3 }]
        }
    },
    {
        name: 'cancelled LaTeX explicit line with bare denominator has removable hole and no asymptotes',
        expression: 'y=\\frac{\\left(x-1\\right)\\left(x-2\\right)}{x-1}',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 1, y: -1 }]
        }
    },
    {
        name: 'cancelled bare LaTeX explicit line has removable hole and no asymptotes',
        expression: '\\frac{\\left(x-2\\right)\\left(x+1\\right)}{\\left(x-2\\right)}',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 2, y: 3 }]
        }
    },
    {
        name: 'wide product catenary line parabola uses explicit component renderers',
        expression: '\\left(\\cosh\\left(x\\right)-y\\right)\\left(x-1\\right)\\left(x^2-y\\right)=0',
        viewport: tallWideViewport,
        expected: {
            renderMode: 'product-factors',
            productFactorRenderModes: ['affine-explicit', 'product-direct-components', 'affine-explicit'],
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxTallVerticalSegments: 1,
            verticalComponents: [1]
        }
    },
    {
        name: 'product sine line parabola uses explicit component renderers',
        expression: '\\left(y-\\sin\\left(x\\right)\\right)\\left(y+1-2x\\right)\\left(y^2-2x\\right)=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            productFactorRenderModes: ['affine-explicit', 'affine-explicit', 'monomial-explicit'],
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            pointsNear: [
                { x: Math.PI / 2, y: 1, tolerance: 0.08, label: 'sine component peak' },
                { x: 2, y: 3, tolerance: 0.08, label: 'line component' },
                { x: 2, y: 2, tolerance: 0.08, label: 'upper parabola branch' },
                { x: 2, y: -2, tolerance: 0.08, label: 'lower parabola branch' }
            ]
        }
    },
    {
        name: 'folium-style cubic has three asymptote directions',
        expression: 'x^3-3*x*y^2=1',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [0],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [
                { m: sqrt3Over3, b: 0 },
                { m: -sqrt3Over3, b: 0 }
            ]
        }
    },
    {
        name: 'line plus hyperbola reports unique oblique asymptotes',
        expression: '4*x^3-x*y=50*x+4*x*y^2',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [
                { m: -1, b: 0 },
                { m: 1, b: 0 }
            ],
            verticalComponents: [0]
        }
    },
    {
        name: 'denominator-cleared oblique rational keeps cleared polynomial branches',
        expression: 'x^2-y^2=1/(x+y)',
        viewport: defaultViewport,
        expected: {
            renderMode: 'marching-standard',
            minFinitePointCount: 300,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [
                { m: -1, b: 0 },
                { m: 1, b: 0 }
            ],
            pointsNear: [
                { x: 1, y: 0, tolerance: 0.12, label: 'central branch point' },
                { x: 0, y: -1, tolerance: 0.12, label: 'opposite central branch point' },
                { x: 1.125, y: 0.875, tolerance: 0.12, label: 'positive diagonal branch' },
                { x: -0.875, y: -1.125, tolerance: 0.12, label: 'negative diagonal branch' }
            ]
        }
    },
    {
        name: 'axis component plus reciprocal square-root branches',
        expression: 'x*(y^2+1)=x*(x+2)*y^2',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [-1],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            verticalComponents: [0],
            maxIntercepts: 2
        }
    },
    {
        name: 'implicit reciprocal has horizontal and y equals x asymptotes',
        expression: 'y=1/(x-y)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [{ m: 1, b: 0 }]
        }
    },
    {
        name: 'implicit reciprocal has horizontal and y equals 2x asymptotes',
        expression: 'y=1/(2*x-y)',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [{ m: 2, b: 0 }]
        }
    },
    {
        name: 'cancelled implicit linear factor has one removable hole and no asymptotes',
        expression: '((x+y-1)*(x-2))/(x-2)=0',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [{ x: 2, y: -1 }]
        }
    },
    {
        name: 'denominator-cleared vertical line drops excluded branch metadata',
        expression: 'x^2/x=1',
        viewport: defaultViewport,
        expected: {
            renderMode: 'quadratic-x-explicit',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [],
            pointsNear: [
                { x: 1, y: -6, tolerance: 0.08, label: 'lower vertical line' },
                { x: 1, y: 0, tolerance: 0.08, label: 'middle vertical line' },
                { x: 1, y: 6, tolerance: 0.08, label: 'upper vertical line' }
            ]
        }
    },
    {
        name: 'vertical line plus reciprocal branch keeps components and reciprocal asymptotes',
        expression: '(x-1)*(y-1)*(y-1/x)=0',
        viewport: defaultViewport,
        expected: {
            verticalAsymptotes: [0],
            horizontalAsymptotes: [0],
            obliqueAsymptotes: [],
            holes: [{ x: 0, y: 1 }],
            horizontalComponents: [1],
            verticalComponents: [1]
        }
    },
    {
        name: 'integer coefficient zero product uses direct components',
        expression: '2xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'decimal coefficient zero product uses direct components',
        expression: '0.5xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'negative coefficient zero product uses direct components',
        expression: '-7xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'fraction coefficient zero product has components but no asymptotes',
        expression: '\\frac12xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'parenthesised fraction x coefficient zero product has no asymptotes',
        expression: '\\left(\\frac12x\\right)y^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'parenthesised fraction y coefficient zero product has no asymptotes',
        expression: 'x\\left(\\frac12y^2\\right)=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'braced fraction coefficient zero product has no asymptotes',
        expression: '\\frac{1}{17}xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'two digit fraction coefficient zero product has no asymptotes',
        expression: '\\frac23xy^2=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            maxFinitePointCount: 160,
            horizontalComponents: [0],
            verticalComponents: [0]
        }
    },
    {
        name: 'circle union full diagonal line',
        expression: '(x^2+y^2-4)*(y-x)=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            maxFiniteSegmentStarts: 8,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [],
            pointsNear: [
                { x: 2, y: 0, tolerance: 0.08, label: 'circle right point' },
                { x: -2, y: 0, tolerance: 0.08, label: 'circle left point' },
                { x: 0, y: 2, tolerance: 0.08, label: 'circle top point' },
                { x: 0, y: -2, tolerance: 0.08, label: 'circle bottom point' },
                { x: -6, y: -6, tolerance: 0.12, label: 'diagonal line extends to lower-left viewport' },
                { x: 6, y: 6, tolerance: 0.12, label: 'diagonal line extends to upper-right viewport' }
            ]
        }
    },
    {
        name: 'ellipse union full diagonal line',
        expression: '(x^2/9+y^2/4-1)*(y-x)=0',
        viewport: defaultViewport,
        expected: {
            renderMode: 'product-factors',
            explicitImplicitFastPath: true,
            maxFiniteSegmentStarts: 8,
            verticalAsymptotes: [],
            horizontalAsymptotes: [],
            obliqueAsymptotes: [],
            holes: [],
            pointsNear: [
                { x: 3, y: 0, tolerance: 0.1, label: 'ellipse right point' },
                { x: -3, y: 0, tolerance: 0.1, label: 'ellipse left point' },
                { x: 0, y: 2, tolerance: 0.1, label: 'ellipse top point' },
                { x: 0, y: -2, tolerance: 0.1, label: 'ellipse bottom point' },
                { x: -6, y: -6, tolerance: 0.12, label: 'diagonal line extends to lower-left viewport' },
                { x: 6, y: 6, tolerance: 0.12, label: 'diagonal line extends to upper-right viewport' }
            ]
        }
    }
];
