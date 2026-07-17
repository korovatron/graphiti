const sqrt3Over3 = Math.sqrt(3) / 3;

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

const tallWideViewport = {
    minX: -30,
    maxX: 240,
    minY: -200,
    maxY: 520,
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
