// Graphiti - Mathematical Function Explorer
// Main application logic with animation loop and state management

class Graphiti {
    constructor() {
        // Fix iOS PWA 9-pixel viewport bug
        this.fixIOSViewportBug();
        
        // Configure MathLive virtual keyboard globally
        this.configureMathLive();
        
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // State management
        this.states = {
            TITLE: 'title',
            GRAPHING: 'graphing',
            MENU: 'menu'
        };
        this.currentState = this.states.TITLE;
        this.previousState = null;
        
        // Flag to track if app has been initialized (prevents duplicate function loading)
        this.hasInitialized = false;
        
        // Startup state tracking for immediate implicit function rendering
        this.isStartup = false;
        
        // Flag to prevent saving bounds while loading from localStorage
        this.isLoadingBounds = false;
        
        // Flag to prevent saving bounds during initial setup (before loadAndApplyViewportBounds runs)
        this.isInitialSetup = true;
        
        // Angle mode for trigonometric functions
        this.angleMode = 'radians'; // 'degrees' or 'radians'
        this.cartesianAngleMode = 'radians'; // Remember user's angle preference for cartesian mode
        
        // Plotting mode
        this.plotMode = 'cartesian'; // 'cartesian' or 'polar'
        this.polarSettings = {
            thetaMin: 0,
            thetaMax: 2 * Math.PI,
            plotNegativeR: true,  // Default to plotting negative r (matches checkbox default)
            step: 0.01 // theta increment
        };
        
        // Polar animation state
        this.polarAnimation = {
            isAnimating: false,
            isPaused: false, // Track pause state separately
            animationSpeed: 1.0, // 1x speed by default
            shouldLoop: false,
            currentTheta: 0, // Current animation theta position
            animationFrameId: null, // requestAnimationFrame ID
            storedThetaMax: 2 * Math.PI, // Store original thetaMax
            lastTimestamp: 0 // For smooth animation timing
        };
        
        // Parameter system for alpha, beta, gamma, delta
        this.parameters = {
            alpha: { value: 1, min: -10, max: 10, inUse: false },
            beta: { value: 1, min: -10, max: 10, inUse: false },
            gamma: { value: 1, min: -10, max: 10, inUse: false },
            delta: { value: 1, min: -10, max: 10, inUse: false }
        };
        
        // Canvas and viewport properties - separate for each mode
        this.cartesianViewport = {
            width: 0,
            height: 0,
            centerX: 0,
            centerY: 0,
            scale: 50, // pixels per unit
            minX: -10,
            maxX: 10,
            minY: -10,
            maxY: 10
        };

        this.polarViewport = {
            width: 0,
            height: 0,
            centerX: 0,
            centerY: 0,
            scale: 80, // pixels per unit - higher for polar
            minX: -3,
            maxX: 3,
            minY: -3,
            maxY: 3
        };
        
        // Expression compilation cache for performance optimization
        this.expressionCache = new Map(); // Map<string, CompiledExpression>
        this.parsedImplicitEquations = new Map(); // Map<string, {leftExpression, rightExpression}>
        
        // Regex pattern cache for performance optimization
        this.regexCache = new Map(); // Map<string, RegExp>
        this.initializeRegexCache();
        
        // Input handling
        this.input = {
            mouse: { x: 0, y: 0, down: false },
            touch: { x: 0, y: 0, active: false },
            keys: new Set(),
            dragging: false,
            lastX: 0,
            lastY: 0,
            // Tap detection for closing hamburger menu
            tap: {
                startX: 0,
                startY: 0,
                startTime: 0,
                maxMoveDistance: 10, // pixels
                maxTapDuration: 300 // milliseconds
            },
            // Curve tracing mode
            tracing: {
                active: false,
                functionId: null,
                worldX: 0,
                worldY: 0,
                tolerance: {
                    mouse: 10, // pixels
                    touch: 20  // pixels (larger for touch)
                }
            },
            // Multi-badge persistent tracing system for educational use
            persistentBadges: [], // Array of trace badges: { id, functionId, worldX, worldY, functionColor, screenX, screenY }
            badgeIdCounter: 0, // For generating unique badge IDs
            // Badge interaction timing for tap vs hold behavior
            badgeInteraction: {
                targetBadge: null, // Badge being interacted with
                startTime: 0, // When interaction started
                startX: 0, // Starting X position
                startY: 0, // Starting Y position
                holdThreshold: 250, // milliseconds - time to distinguish tap vs hold (shorter for better UX)
                moveThreshold: 15, // pixels - movement that cancels badge interaction
                isHolding: false // Whether we're in hold mode
            },
            // Pinch gesture tracking
            pinch: {
                active: false,
                initialDistance: 0,
                initialScale: 1,
                centerX: 0,
                centerY: 0,
                // For directional zoom
                initialDx: 0,
                initialDy: 0,
                direction: 'uniform', // 'horizontal', 'vertical', or 'uniform'
                initialMinX: 0,
                initialMaxX: 0,
                initialMinY: 0,
                initialMaxY: 0,
                // Fixed center points for directional zoom
                fixedCenterWorldX: 0,
                fixedCenterWorldY: 0
            }
        };
        
        // Mathematical functions - separate collections for each mode
        this.cartesianFunctions = [];
        this.polarFunctions = [];
        this.nextFunctionId = 1;
        
        // Track when user intentionally clears all functions (don't auto-repopulate)
        this.cartesianFunctionsCleared = false;
        this.polarFunctionsCleared = false;
        this.functionColors = [
            '#4A90E2', '#27AE60', '#F39C12', 
            '#E91E63', '#1ABC9C', '#E67E22', '#34495E',
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#E74C3C'
        ];
        this.plotTimers = new Map(); // For debouncing auto-plot
        this.rangeTimer = null; // For debouncing range updates
        
        // Axis intercepts detection
        this.intercepts = []; // Store detected axis intercept points
        this.showIntercepts = false; // Toggle for intercept display (off by default)
        
        // Intersection detection
        this.intersections = []; // Store detected intersection points
        
        // Separate intersection systems for better performance
        this.explicitIntersections = []; // Fast explicit/explicit intersections  
        this.implicitIntersections = []; // High-resolution implicit intersections
        this.combinedIntersections = []; // Combined for display
        
        // Implicit intersection timing control
        this.implicitIntersectionTimer = null;
        this.implicitIntersectionDelay = 500; // ms after pan/zoom stops
        this.implicitIntersectionsPending = false; // Track if implicit calculation is expected
        this.lastViewportState = null; // Track viewport changes
        
        // Implicit function viewport caching for smooth pan/zoom performance
        this.implicitFunctionCache = new Map(); // Cache: functionId -> { viewport, points, timestamp }
        this.viewportChangeThreshold = 0.1; // Relative threshold for cache invalidation
        
        // Legacy manual intersection storage (keeping for compatibility)
        this.manualImplicitIntersections = []; // Store manually calculated implicit intersections
        this.showIntersections = false; // Toggle for intersection display (off by default)
        this.tangentIntersections = []; // Store intersections between tangent lines and functions
        this.normalIntersections = []; // Store intersections between normal lines and functions
        this.intersectionDebounceTimer = null; // Timer for debounced intersection updates
        this.isViewportChanging = false; // Flag to track active pan/zoom operations
        
        // Integration system
        this.integralPairs = []; // Store pairs of integral badges for area calculation
        this.selectedBadgeForLinking = null; // Badge selected for linking to another integral badge
        this.linkedBadgePairs = []; // Store linked badge pairs for area-between-curves calculation
        this.pendingLabelClick = null; // Store pending click to check after next draw
        this.integralPanelCheckboxes = []; // Track which integral pairs have checkboxes checked
        
        // Implicit function calculation cancellation system
        this.implicitCalculationId = 0; // Counter for tracking calculation sessions
        this.currentImplicitCalculations = new Map(); // Track active calculations per function
        
        // Turning point detection
        this.turningPoints = []; // Store detected turning points (maxima/minima)
        this.showTurningPoints = false; // Toggle for turning point display (off by default to reduce clutter)
        this.showTurningPointsCartesian = true; // User's preference for Cartesian mode
        this.frozenTurningPointBadges = []; // Store turning point badges during viewport changes
        this.frozenIntersectionBadges = []; // Store intersection badges during viewport changes
        this.frozenInterceptBadges = []; // Store intercept badges during viewport changes
        this.culledInterceptMarkers = []; // Cache culled intercept markers for performance
        
        // Web Worker for intersection calculations
        this.intersectionWorker = null;
        this.isWorkerCalculating = false;
        this.initializeIntersectionWorker();
        
        // Debug overlay for calculation status (toggle with TAB key)
        // Track active implicit function calculations (for calculation indicator)
        this.activeImplicitCalculations = new Set();
        
        // Performance monitoring
        this.performance = {
            enabled: false, // Toggle with Ctrl+Shift+P
            fps: 0,
            frameCount: 0,
            lastFpsUpdate: 0,
            plotTimes: new Map(), // functionId -> milliseconds
            intersectionTime: 0,
            lastFrameTime: 0
        };
        
        // Animation
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.animationId = null;
        
        // Badge tooltip system for user guidance
        this.badgeTooltip = {
            active: false,
            text: '',
            x: 0,
            y: 0,
            opacity: 1.0,
            startTime: 0,
            fadeDuration: 2000, // 2 seconds to fade out
            displayDuration: 3000 // Total display time (including fade)
        };
        
        this.init();
    }
    
    configureMathLive() {
        // Wait for both DOMContentLoaded and MathLive to be available
        const setupKeyboard = () => {
            // Wait a bit more to ensure MathLive is fully loaded
            setTimeout(() => {
                if (window.mathVirtualKeyboard) {
                    try {
                        // Configure MathLive to recognize inverse trig functions as function names (not variables)
                        if (window.MathfieldElement) {
                            // Define inverse trig and hyperbolic functions as proper LaTeX macros
                            // This prevents MathLive from mangling them
                            const inverseTrigMacros = {
                                '\\arcsin': '\\operatorname{arcsin}',
                                '\\arccos': '\\operatorname{arccos}',
                                '\\arctan': '\\operatorname{arctan}',
                                '\\arcsec': '\\operatorname{arcsec}',
                                '\\arccsc': '\\operatorname{arccsc}',
                                '\\arccot': '\\operatorname{arccot}',
                                '\\arcsinh': '\\operatorname{arcsinh}',
                                '\\arccosh': '\\operatorname{arccosh}',
                                '\\arctanh': '\\operatorname{arctanh}',
                                '\\arcsech': '\\operatorname{arcsech}',
                                '\\arccsch': '\\operatorname{arccsch}',
                                '\\arccoth': '\\operatorname{arccoth}',
                                '\\asinh': '\\operatorname{asinh}',
                                '\\acosh': '\\operatorname{acosh}',
                                '\\atanh': '\\operatorname{atanh}',
                                '\\asech': '\\operatorname{asech}',
                                '\\acsch': '\\operatorname{acsch}',
                                '\\acoth': '\\operatorname{acoth}'
                            };
                            
                            // Inline shortcuts to recognize typed function names
                            const functionShortcuts = {
                                // Explicitly disable "a" prefix shortcuts to prevent conflicts with "alphasin"
                                'asin': false,
                                'acos': false,
                                'atan': false,
                                'asec': false,
                                'acsc': false,
                                'acot': false,
                                'asinh': false,
                                'acosh': false,
                                'atanh': false,
                                'asech': false,
                                'acsch': false,
                                'acoth': false,
                                // Inverse trig (arc notation only - no "asin" shortcuts to avoid conflicts with "alphasin")
                                'arcsin': '\\operatorname{arcsin}',
                                'arccos': '\\operatorname{arccos}',
                                'arctan': '\\operatorname{arctan}',
                                'arcsec': '\\operatorname{arcsec}',
                                'arccsc': '\\operatorname{arccsc}',
                                'arccot': '\\operatorname{arccot}',
                                // Inverse hyperbolic (arc notation only)
                                'arcsinh': '\\operatorname{arcsinh}',
                                'arccosh': '\\operatorname{arccosh}',
                                'arctanh': '\\operatorname{arctanh}',
                                'arcsech': '\\operatorname{arcsech}',
                                'arccsch': '\\operatorname{arccsch}',
                                'arccoth': '\\operatorname{arccoth}',
                                // Hyperbolic
                                'sinh': '\\sinh',
                                'cosh': '\\cosh',
                                'tanh': '\\tanh',
                                'sech': '\\operatorname{sech}',
                                'csch': '\\operatorname{csch}',
                                'coth': '\\operatorname{coth}',
                                // Regular trig
                                'sin': '\\sin',
                                'cos': '\\cos',
                                'tan': '\\tan',
                                'sec': '\\operatorname{sec}',
                                'csc': '\\operatorname{csc}',
                                'cot': '\\operatorname{cot}',
                                // Logarithms - simple base-10 and natural log
                                'log': '\\log',
                                'log(': '\\log(#0)',
                                'ln': '\\ln',
                                'ln(': '\\ln(#0)'
                            };
                            
                            // Set default options for all mathfields
                            window.MathfieldElement.options = {
                                ...window.MathfieldElement.options,
                                macros: {
                                    ...window.MathfieldElement.options?.macros,
                                    ...inverseTrigMacros
                                },
                                inlineShortcuts: {
                                    ...window.MathfieldElement.options?.inlineShortcuts,
                                    ...functionShortcuts
                                },
                                // Accept alpha, beta, gamma as valid variables
                                mathModeSpace: '\\:',
                                smartFence: true,
                                smartMode: false,
                                keybindings: [
                                    ...window.MathfieldElement.options?.keybindings || [],
                                    {
                                        key: 'g',
                                        ifMode: 'math',
                                        ifPreviousCharacter: 'lo',
                                        command: ['insert', '\\log_{#?}#0'],
                                    }
                                ]
                            };
                        }
                        
                        // Create a custom numeric layout (replacing the default)
                        const customNumericLayout = {
                            label: '123',
                            labelClass: 'MLK__tex-math',
                            tooltip: 'Numbers & Basic Operations',
                            rows: [
                                [
                                    // Variables and parentheses - reorganized
                                    { latex: 'x', variants: ['y', 'r', '\\theta', 't', 'a', 'b', 'c'], class: 'variable-key' },
                                    { latex: '\\theta', class: 'variable-key' },
                                    { latex: '(', label: '(' },
                                    { latex: ')', label: ')' },
                                    '[separator]',
                                    { latex: '7', label: '7' },
                                    { latex: '8', label: '8' },
                                    { latex: '9', label: '9' },
                                    { insert: '\\frac{#@}{#?}', label: '/' }
                                ],
                                [
                                    // Powers and roots
                                    { latex: '#@^2', label: 'x²' },
                                    { latex: '\\sqrt{#?}', label: '√' },
                                    { 
                                        latex: '#@^3', 
                                        label: 'x³',
                                        shift: { latex: '\\sqrt[3]{#?}', label: '∛' }
                                    },
                                    { 
                                        latex: '#@^{#?}', 
                                        label: 'xⁿ',
                                        shift: { latex: '\\sqrt[#?]{#@}', label: 'ⁿ√' }
                                    },
                                    '[separator]',
                                    { latex: '4', label: '4' },
                                    { latex: '5', label: '5' },
                                    { latex: '6', label: '6' },
                                    { latex: '\\cdot', label: '×' }
                                ],
                                [
                                    // Constants and operations
                                    { latex: '\\pi', label: 'π' },
                                    { latex: 'e', label: 'e' },
                                    { latex: '\\left|#?\\right|', label: '|x|' },
                                    { insert: '!', label: 'n!' },
                                    '[separator]',
                                    { latex: '1', label: '1' },
                                    { latex: '2', label: '2' },
                                    { latex: '3', label: '3' },
                                    { latex: '+', label: '+' }
                                ],
                                [
                                    // Bottom row with 0, operations, and navigation
                                    '[left]', '[right]',
                                    { latex: '=', label: '=' },
                                    { label: '[backspace]', width: 1 },
                                    '[separator]',
                                    { latex: '0', label: '0' }, 
                                    { latex: '.', label: '.' },
                                    { label: '[shift]', width: 1 },
                                    { latex: '-', label: '-' }
                                ]
                            ]
                        };

                        // Create function layout matching numeric keyboard structure
                        const functionsLayout = {
                            label: 'f(x)',
                            labelClass: 'MLK__tex-math',
                            tooltip: 'Trigonometric Functions',
                            rows: [
                                [
                                    // Variables and parentheses - same as numeric keyboard
                                    { latex: 'x', variants: ['y', 'r', '\\theta', 't', 'a', 'b', 'c'], class: 'variable-key' },
                                    { latex: '\\theta', label: 'θ', class: 'variable-key' },
                                    { latex: '(', label: '(' },
                                    { latex: ')', label: ')' },
                                    '[separator]',
                                    { latex: '7', label: '7' },
                                    { latex: '8', label: '8' },
                                    { latex: '9', label: '9' },
                                    { insert: '\\frac{#@}{#?}', label: '/' }
                                ],
                                [
                                    // Trigonometric functions (primary)
                                    { 
                                        insert: '\\sin(#?)', 
                                        label: 'sin', 
                                        shift: { insert: '\\arcsin(#?)', label: 'sin⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\cos(#?)', 
                                        label: 'cos', 
                                        shift: { insert: '\\arccos(#?)', label: 'cos⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\tan(#?)', 
                                        label: 'tan', 
                                        shift: { insert: '\\arctan(#?)', label: 'tan⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\ln(#?)', 
                                        label: 'ln', 
                                        shift: { insert: 'e^{#?}', label: 'eˣ' }
                                    },
                                    '[separator]',
                                    { latex: '4', label: '4' },
                                    { latex: '5', label: '5' },
                                    { latex: '6', label: '6' },
                                    { latex: '\\cdot', label: '×' }
                                ],
                                [
                                    // Trigonometric reciprocal functions and log
                                    { 
                                        insert: '\\csc(#?)', 
                                        label: 'csc', 
                                        shift: { insert: '\\operatorname{arccsc}(#?)', label: 'csc⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\sec(#?)', 
                                        label: 'sec', 
                                        shift: { insert: '\\operatorname{arcsec}(#?)', label: 'sec⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\cot(#?)', 
                                        label: 'cot', 
                                        shift: { insert: '\\operatorname{arccot}(#?)', label: 'cot⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\log(#?)', 
                                        label: 'log', 
                                        shift: { insert: '10^{#?}', label: '10ˣ' }
                                    },
                                    '[separator]',
                                    { latex: '1', label: '1' },
                                    { latex: '2', label: '2' },
                                    { latex: '3', label: '3' },
                                    { latex: '+', label: '+' }
                                ],
                                [
                                    // Bottom row with navigation, shift key between . and -
                                    '[left]', '[right]',
                                    { latex: '=', label: '=' },
                                    { label: '[backspace]', width: 1 },
                                    '[separator]',
                                    { latex: '0', label: '0' }, 
                                    { latex: '.', label: '.' },
                                    { label: '[shift]', width: 1 },
                                    { latex: '-', label: '-' }
                                ]
                            ]
                        };

                        // Set custom layouts: only our custom numeric and functions layouts
                        // Create hyperbolic layout matching numeric keyboard structure
                        const hyperbolicLayout = {
                            label: 'hyp',
                            labelClass: 'MLK__tex-math',
                            tooltip: 'Hyperbolic Functions',
                            rows: [
                                [
                                    // Variables and parentheses - same as numeric keyboard
                                    { latex: 'x', variants: ['y', 'r', '\\theta', 't', 'a', 'b', 'c'], class: 'variable-key' },
                                    { latex: '\\theta', class: 'variable-key' },
                                    { latex: '(', label: '(' },
                                    { latex: ')', label: ')' },
                                    '[separator]',
                                    { latex: '7', label: '7' },
                                    { latex: '8', label: '8' },
                                    { latex: '9', label: '9' },
                                    { insert: '\\frac{#@}{#?}', label: '/' }
                                ],
                                [
                                    // Hyperbolic functions (primary)
                                    { 
                                        insert: '\\sinh(#?)', 
                                        label: 'sinh',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{asinh}(#?)', label: 'sinh⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\cosh(#?)', 
                                        label: 'cosh',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{acosh}(#?)', label: 'cosh⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\tanh(#?)', 
                                        label: 'tanh',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{atanh}(#?)', label: 'tanh⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: 'e^{#?}', 
                                        label: 'eˣ', 
                                        shift: { insert: '\\ln(#?)', label: 'ln' }
                                    },
                                    '[separator]',
                                    { latex: '4', label: '4' },
                                    { latex: '5', label: '5' },
                                    { latex: '6', label: '6' },
                                    { latex: '\\cdot', label: '×' }
                                ],
                                [
                                    // Hyperbolic reciprocal functions and root
                                    { 
                                        insert: '\\operatorname{csch}(#?)', 
                                        label: 'csch',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{acsch}(#?)', label: 'csch⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\operatorname{sech}(#?)', 
                                        label: 'sech',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{asech}(#?)', label: 'sech⁻¹', class: 'small' }
                                    },
                                    { 
                                        insert: '\\operatorname{coth}(#?)', 
                                        label: 'coth',
                                        class: 'small',
                                        shift: { insert: '\\operatorname{acoth}(#?)', label: 'coth⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\sqrt{#?}', 
                                        label: '√', 
                                        shift: { latex: '#@^2', label: 'x²' }
                                    },
                                    '[separator]',
                                    { latex: '1', label: '1' },
                                    { latex: '2', label: '2' },
                                    { latex: '3', label: '3' },
                                    { latex: '+', label: '+' }
                                ],
                                [
                                    // Bottom row with navigation, shift key between . and -
                                    '[left]', '[right]',
                                    { latex: '=', label: '=' },
                                    { label: '[backspace]', width: 1 },
                                    '[separator]',
                                    { latex: '0', label: '0' }, 
                                    { latex: '.', label: '.' },
                                    { label: '[shift]', width: 1 },
                                    { latex: '-', label: '-' }
                                ]
                            ]
                        };

                        // Create variables layout for easy access to all variables and parameters
                        const variablesLayout = {
                            label: 'αβγ',
                            labelClass: 'MLK__tex-math',
                            tooltip: 'Variables & Parameters',
                            rows: [
                                [
                                    // All variables in one row
                                    { latex: 'x', class: 'variable-key' },
                                    { latex: 'y', class: 'variable-key' },
                                    { latex: 'r', class: 'variable-key' },
                                    { latex: '\\theta', class: 'variable-key' },
                                    '[separator]',
                                    { latex: '7', label: '7' },
                                    { latex: '8', label: '8' },
                                    { latex: '9', label: '9' },
                                    { insert: '\\frac{#@}{#?}', label: '/' }
                                ],
                                [
                                    // All parameters in one row
                                    { latex: '\\alpha', label: 'α', class: 'variable-key' },
                                    { latex: '\\beta', label: 'β', class: 'variable-key' },
                                    { latex: '\\gamma', label: 'γ', class: 'variable-key' },
                                    { latex: '\\delta', label: 'δ', class: 'variable-key' },
                                    '[separator]',
                                    { latex: '4', label: '4' },
                                    { latex: '5', label: '5' },
                                    { latex: '6', label: '6' },
                                    { latex: '\\cdot', label: '×' }
                                ],
                                [
                                    // Constants
                                    { latex: '\\pi', label: 'π', variants: ['e'] },
                                    { latex: 'e', label: 'e' },
                                    { latex: '(', label: '(' },
                                    { latex: ')', label: ')' },
                                    '[separator]',
                                    { latex: '1', label: '1' },
                                    { latex: '2', label: '2' },
                                    { latex: '3', label: '3' },
                                    { latex: '+', label: '+' }
                                ],
                                [
                                    // Bottom row with navigation
                                    '[left]', '[right]',
                                    { latex: '=', label: '=' },
                                    { label: '[backspace]', width: 1 },
                                    '[separator]',
                                    { latex: '0', label: '0' }, 
                                    { latex: '.', label: '.' },
                                    { label: '[shift]', width: 1 },
                                    { latex: '-', label: '-' }
                                ]
                            ]
                        };

                        window.mathVirtualKeyboard.layouts = [customNumericLayout, functionsLayout, hyperbolicLayout, variablesLayout];
                        
                        // Store layout references for mode-aware updates
                        this.customNumericLayout = customNumericLayout;
                        this.functionsLayout = functionsLayout;
                        this.hyperbolicLayout = hyperbolicLayout;
                        this.variablesLayout = variablesLayout;
                        this.hyperbolicLayout = hyperbolicLayout;
                        
                        // Update keyboards for initial mode
                        this.updateVirtualKeyboardsForMode();
                        
                        // Force dark mode on all math fields
                        this.updateMathFieldColorSchemes();
                        
                        // Monitor for layout tab clicks to reset shift state on numeric layout
                        const observer = new MutationObserver(() => {
                            // Check if we're on the numeric layout
                            const activeTab = document.querySelector('.ML__tab--active');
                            if (activeTab && activeTab.textContent === '123') {
                                // We're on the numeric layout, ensure no shift state
                                const shiftButtons = document.querySelectorAll('.ML__keycap[data-command="toggleShift"]');
                                shiftButtons.forEach(button => {
                                    button.classList.remove('ML__keycap--pressed', 'ML__keycap--active');
                                });
                                
                                // Also clear any shift-related styling on other buttons
                                const allButtons = document.querySelectorAll('.ML__keycap');
                                allButtons.forEach(button => {
                                    button.classList.remove('ML__keycap--shifted');
                                });
                            }
                        });
                        
                        // Start observing when keyboard is available
                        setTimeout(() => {
                            const keyboardElement = document.querySelector('.ML__keyboard');
                            if (keyboardElement) {
                                observer.observe(keyboardElement, {
                                    childList: true,
                                    subtree: true,
                                    attributes: true,
                                    attributeFilter: ['class']
                                });
                            }
                        }, 1000);
                        
                        // Configure virtual keyboard behavior for mobile
                        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                        if (isMobile) {
                            window.mathVirtualKeyboard.container = document.body;
                            
                            // Close virtual keyboard on orientation change to prevent corruption
                            let lastOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
                            
                            const closeKeyboardOnOrientationChange = () => {
                                setTimeout(() => {
                                    const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
                                    
                                    // Only act if orientation actually changed
                                    if (currentOrientation !== lastOrientation) {
                                        lastOrientation = currentOrientation;
                                        
                                        if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                                            window.mathVirtualKeyboard.hide();
                                            // Also blur any focused mathfields
                                            const focused = document.querySelector('math-field:focus');
                                            if (focused) {
                                                focused.blur();
                                            }
                                        }
                                        
                                        // Clean up any lingering MathLive backdrop elements
                                        // This fixes the phantom overlay issue in mobile browser mode
                                        setTimeout(() => {
                                            const backdrops = document.querySelectorAll('.MLK__backdrop');
                                            backdrops.forEach(backdrop => {
                                                if (backdrop.parentNode) {
                                                    backdrop.parentNode.removeChild(backdrop);
                                                }
                                            });
                                            
                                            // Also clean up any virtual keyboard containers that might be stuck
                                            const keyboards = document.querySelectorAll('.ML__virtual-keyboard');
                                            keyboards.forEach(keyboard => {
                                                if (keyboard.style.display !== 'none' && !window.mathVirtualKeyboard.visible) {
                                                    keyboard.style.display = 'none';
                                                }
                                            });
                                        }, 100);
                                    }
                                }, 150);
                            };
                            
                            // Detect if running as PWA
                            const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                                         window.matchMedia('(display-mode: fullscreen)').matches ||
                                         window.navigator.standalone === true;
                            
                            // Try multiple events for better compatibility
                            window.addEventListener('orientationchange', closeKeyboardOnOrientationChange);
                            window.addEventListener('resize', closeKeyboardOnOrientationChange);
                            
                            // For PWA mode, use additional detection methods
                            if (isPWA) {
                                
                                // More frequent checking in PWA mode
                                let resizeTimeout;
                                window.addEventListener('resize', () => {
                                    clearTimeout(resizeTimeout);
                                    resizeTimeout = setTimeout(closeKeyboardOnOrientationChange, 50);
                                });
                                
                                // Visual viewport API for PWA
                                if (window.visualViewport) {
                                    window.visualViewport.addEventListener('resize', closeKeyboardOnOrientationChange);
                                }
                            }
                            
                            // For modern browsers with screen.orientation API
                            if (screen.orientation) {
                                screen.orientation.addEventListener('change', closeKeyboardOnOrientationChange);
                            }
                        }
                        
                        // Force dark mode on the virtual keyboard after everything is set up
                        setTimeout(() => {
                            // Use MathLive's configuration API to force dark mode
                            if (window.MathfieldElement) {
                                // Set default options for all mathfields
                                window.MathfieldElement.options = {
                                    ...window.MathfieldElement.options,
                                    colorScheme: 'dark'
                                };
                            }
                            
                            // Force all existing math fields to dark mode
                            document.querySelectorAll('math-field').forEach(field => {
                                field.setAttribute('color-scheme', 'dark');
                            });
                        }, 100);
                        
                        // Add HYP toggle functionality
                        
                    } catch (error) {
                        console.error('Error configuring custom virtual keyboard layouts:', error);
                    }
                } else {
                    // Retry after another delay
                    setTimeout(setupKeyboard, 500);
                }
            }, 100);
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupKeyboard);
        } else {
            setupKeyboard();
        }
    }
    
    // Initialize polar range MathLive fields with proper styling
    initializePolarRangeFields() {
        const thetaMin = document.getElementById('theta-min');
        const thetaMax = document.getElementById('theta-max');
        
        if (thetaMin && thetaMax) {
            // Get computed CSS variable values to match exactly
            const computedStyle = getComputedStyle(document.documentElement);
            const accentColor = computedStyle.getPropertyValue('--accent-color').trim() || '#4A90E2';
            const inputBg = computedStyle.getPropertyValue('--input-bg').trim() || '#3A4F6A';
            const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#E8F4FD';
            const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
            
            // Force style properties directly on the element
            const fields = [thetaMin, thetaMax];
            fields.forEach(field => {
                // Set via style attribute for direct properties
                field.style.setProperty('background', inputBg, 'important');
                field.style.setProperty('color', textPrimary, 'important');
                field.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                field.style.setProperty('outline', 'none', 'important');
                
                // Set CSS custom properties for MathLive shadow DOM
                field.style.setProperty('--background', inputBg, 'important');
                field.style.setProperty('--text-color', textPrimary, 'important');
                field.style.setProperty('--border', `1px solid ${borderColor}`, 'important');
                
                // Add focus event listeners to set focus border (using focusin for better shadow DOM support)
                field.addEventListener('focusin', () => {
                    // Check for landscape editing restriction first
                    if (this.shouldRestrictLandscapeEditing()) {
                        field.blur();
                        this.showLandscapeEditingRestriction();
                        return;
                    }
                    
                    // Check if field has error - preserve error styling if present
                    if (field.classList.contains('input-error')) {
                        field.style.setProperty('border', '2px solid #E74C3C', 'important');
                        field.style.setProperty('box-shadow', '0 0 0 2px rgba(231, 76, 60, 0.3)', 'important');
                    } else {
                        field.style.setProperty('--border', `1px solid ${accentColor}`, 'important');
                        field.style.setProperty('border', `1px solid ${accentColor}`, 'important');
                        field.style.setProperty('box-shadow', '0 0 0 2px rgba(74, 144, 226, 0.2)', 'important');
                    }
                    field.style.setProperty('outline', 'none', 'important');
                });
                
                field.addEventListener('focusout', () => {
                    // Check if field has error - preserve error styling if present
                    if (field.classList.contains('input-error')) {
                        field.style.setProperty('border', '2px solid #E74C3C', 'important');
                        field.style.setProperty('box-shadow', 'none', 'important');
                    } else {
                        field.style.setProperty('--border', `1px solid ${borderColor}`, 'important');
                        field.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                        field.style.setProperty('box-shadow', 'none', 'important');
                    }
                    field.style.setProperty('outline', 'none', 'important');
                });
                
                // Auto-focus field when virtual keyboard toggle is clicked
                field.addEventListener('click', (e) => {
                    const path = e.composedPath();
                    const toggleClicked = path.some(el => {
                        return el.getAttribute && (
                            el.getAttribute('part') === 'virtual-keyboard-toggle' ||
                            el.classList?.contains('ML__virtual-keyboard-toggle')
                        );
                    });
                    
                    if (toggleClicked && !field.hasFocus()) {
                        field.focus();
                        if (field.getValue()) {
                            setTimeout(() => {
                                field.selection = { ranges: [[Infinity, Infinity]] };
                            }, 10);
                        }
                    }
                });
            });
        }
    }
    
    initializeCartesianRangeFields() {
        const xMin = document.getElementById('x-min');
        const xMax = document.getElementById('x-max');
        const yMin = document.getElementById('y-min');
        const yMax = document.getElementById('y-max');
        
        if (xMin && xMax && yMin && yMax) {
            // Get computed CSS variable values to match exactly
            const computedStyle = getComputedStyle(document.documentElement);
            const accentColor = computedStyle.getPropertyValue('--accent-color').trim() || '#4A90E2';
            const inputBg = computedStyle.getPropertyValue('--input-bg').trim() || '#3A4F6A';
            const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#E8F4FD';
            const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
            
            // Force style properties directly on the element
            const fields = [xMin, xMax, yMin, yMax];
            fields.forEach(field => {
                // Set via style attribute for direct properties
                field.style.setProperty('background', inputBg, 'important');
                field.style.setProperty('color', textPrimary, 'important');
                field.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                field.style.setProperty('outline', 'none', 'important');
                
                // Set CSS custom properties for MathLive shadow DOM
                field.style.setProperty('--background', inputBg, 'important');
                field.style.setProperty('--text-color', textPrimary, 'important');
                field.style.setProperty('--border', `1px solid ${borderColor}`, 'important');
                
                // Add focus event listeners to set focus border (using focusin for better shadow DOM support)
                field.addEventListener('focusin', () => {
                    // Check for landscape editing restriction first
                    if (this.shouldRestrictLandscapeEditing()) {
                        field.blur();
                        this.showLandscapeEditingRestriction();
                        return;
                    }
                    
                    // Check if field has error - preserve error styling if present
                    if (field.classList.contains('input-error')) {
                        field.style.setProperty('border', '2px solid #E74C3C', 'important');
                        field.style.setProperty('box-shadow', '0 0 0 2px rgba(231, 76, 60, 0.3)', 'important');
                    } else {
                        field.style.setProperty('--border', `1px solid ${accentColor}`, 'important');
                        field.style.setProperty('border', `1px solid ${accentColor}`, 'important');
                        field.style.setProperty('box-shadow', '0 0 0 2px rgba(74, 144, 226, 0.2)', 'important');
                    }
                    field.style.setProperty('outline', 'none', 'important');
                });
                
                field.addEventListener('focusout', () => {
                    // Check if field has error - preserve error styling if present
                    if (field.classList.contains('input-error')) {
                        field.style.setProperty('border', '2px solid #E74C3C', 'important');
                        field.style.setProperty('box-shadow', 'none', 'important');
                    } else {
                        field.style.setProperty('--border', `1px solid ${borderColor}`, 'important');
                        field.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                        field.style.setProperty('box-shadow', 'none', 'important');
                    }
                    field.style.setProperty('outline', 'none', 'important');
                });
                
                // Auto-focus field when virtual keyboard toggle is clicked
                field.addEventListener('click', (e) => {
                    const path = e.composedPath();
                    const toggleClicked = path.some(el => {
                        return el.getAttribute && (
                            el.getAttribute('part') === 'virtual-keyboard-toggle' ||
                            el.classList?.contains('ML__virtual-keyboard-toggle')
                        );
                    });
                    
                    if (toggleClicked && !field.hasFocus()) {
                        field.focus();
                        if (field.getValue()) {
                            setTimeout(() => {
                                field.selection = { ranges: [[Infinity, Infinity]] };
                            }, 10);
                        }
                    }
                });
                
                // Add input event listener to capture LaTeX and validate
                field.addEventListener('input', () => {
                    // Capture LaTeX for localStorage
                    if (field.id === 'x-min') {
                        this.viewport.xMinLatex = field.getValue();
                    } else if (field.id === 'x-max') {
                        this.viewport.xMaxLatex = field.getValue();
                    } else if (field.id === 'y-min') {
                        this.viewport.yMinLatex = field.getValue();
                    } else if (field.id === 'y-max') {
                        this.viewport.yMaxLatex = field.getValue();
                    }
                    
                    // Validate and update viewport
                    this.validateAndSetRange();
                });
            });
        }
    }
    
    // ================================
    // LANDSCAPE EDITING RESTRICTION
    // ================================
    
    shouldRestrictLandscapeEditing() {
        // Restrict on mobile phones AND tablets in landscape mode
        // Virtual keyboard often obscures the input field in landscape
        const isMobileDevice = this.isMobileDevice();
        const isLandscape = window.innerWidth > window.innerHeight;
        
        return isMobileDevice && isLandscape;
    }
    
    isMobileDevice() {
        // Detect mobile phones and tablets (exclude desktop)
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroidPhone = this.getCachedRegex('android').test(userAgent) && this.getCachedRegex('mobile').test(userAgent);
        const isAndroidTablet = this.getCachedRegex('android').test(userAgent) && !this.getCachedRegex('mobile').test(userAgent);
        const isIPhone = this.getCachedRegex('iPhone').test(userAgent);
        const isIPad = this.getCachedRegex('iPad').test(userAgent) || (this.getCachedRegex('Macintosh').test(userAgent) && navigator.maxTouchPoints > 1);
        const isWindowsPhone = this.getCachedRegex('windowsPhone').test(userAgent);
        
        return isAndroidPhone || isAndroidTablet || isIPhone || isIPad || isWindowsPhone;
    }
    
    showLandscapeEditingRestriction() {
        // Remove any existing overlay
        const existingOverlay = document.querySelector('.landscape-edit-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'landscape-edit-overlay';
        overlay.innerHTML = `
            <div class="landscape-edit-message">
                <h3>Editing Restricted in Landscape</h3>
                <div class="rotate-icon">📱 ↻</div>
                <p>Please rotate to portrait mode to edit functions and ranges.</p>
                <p>The virtual keyboard often obscures input fields in landscape orientation.</p>
                <button class="landscape-dismiss-btn">Got it</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add dismiss functionality with a slight delay to prevent immediate dismissal
        setTimeout(() => {
            const dismissBtn = overlay.querySelector('.landscape-dismiss-btn');
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
            });
            
            // Also dismiss on overlay background click (not the message)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            });
        }, 200);
    }


    // ================================
    // FUNCTION MANAGEMENT METHODS
    // ================================
    // FUNCTION MANAGEMENT
    // ================================
    
    // Helper method to get current function array based on plot mode
    getCurrentFunctions() {
        return this.plotMode === 'polar' ? this.polarFunctions : this.cartesianFunctions;
    }

    get viewport() {
        const current = this.plotMode === 'polar' ? this.polarViewport : this.cartesianViewport;
        
        // Ensure viewport has current canvas dimensions
        if (this.canvas) {
            current.width = this.canvas.width;
            current.height = this.canvas.height;
            current.centerX = current.width / 2;
            current.centerY = current.height / 2;
        }
        
        return current;
    }
    
    // Helper method to get current function array length for color selection
    getCurrentFunctionCount() {
        return this.getCurrentFunctions().length;
    }
    
    // Helper method to find a function by ID across all arrays
    findFunctionById(id) {
        return this.cartesianFunctions.find(f => f.id === id) || 
               this.polarFunctions.find(f => f.id === id);
    }
    
    // Helper method to get all functions across both modes
    getAllFunctions() {
        return [...this.cartesianFunctions, ...this.polarFunctions];
    }
    
    addFunction(expression = '') {
        const id = this.nextFunctionId++;
        const color = this.functionColors[this.getCurrentFunctionCount() % this.functionColors.length];
        
        const func = {
            id: id,
            expression: expression,
            points: [],
            color: color,
            enabled: true,
            mode: this.plotMode // Store which mode this function belongs to
        };
        
        this.getCurrentFunctions().push(func);
        
        // Reset cleared flag when user adds functions back
        if (this.plotMode === 'cartesian') {
            this.cartesianFunctionsCleared = false;
        } else {
            this.polarFunctionsCleared = false;
            // Stop animation when adding a new function in polar mode
            if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
                this.stopPolarAnimation();
                // Update UI to show stopped state
                const playIcon = document.getElementById('play-icon');
                const pauseIcon = document.getElementById('pause-icon');
                const playPauseText = document.getElementById('play-pause-text');
                const polarStopButton = document.getElementById('polar-stop-animation');
                if (playIcon && pauseIcon && playPauseText) {
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                    playPauseText.textContent = 'Play';
                }
                if (polarStopButton) {
                    polarStopButton.style.opacity = '0.6';
                    polarStopButton.style.background = '#1a2a3f';
                }
            }
        }
        
        this.createFunctionUI(func);
        
        // If expression is provided, plot it immediately
        if (expression) {
            this.plotFunction(func);
            
            // Skip badge calculations during polar animation or pause
            if (!this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
                // Update intersections after adding this function (immediate calculation)
                if (this.showIntersections) {
                    this.calculateIntersectionsWithWorker(true); // true = immediate
                }
                
                // Update turning points after adding this function
                if (this.showTurningPoints) {
                    this.turningPoints = this.findTurningPoints();
                }
                
                // Update intercepts after adding this function
                if (this.showIntercepts) {
                    this.intercepts = this.findAxisIntercepts();
                }
            }
        }
        
        // Save functions to localStorage
        this.saveFunctionsToLocalStorage();
    }

    // Find the first empty function in the current mode's array
    findFirstEmptyFunction() {
        const functions = this.getCurrentFunctions();
        return functions.find(func => !func.expression || func.expression.trim() === '');
    }

    // Add an example function - fills empty slot if available, otherwise adds new
    addExampleFunction(expression) {
        const emptyFunc = this.findFirstEmptyFunction();
        
        if (emptyFunc) {
            // Fill the empty function slot
            emptyFunc.expression = expression;
            
            // Update the UI for this function
            const funcDiv = document.querySelector(`[data-function-id="${emptyFunc.id}"]`);
            if (funcDiv) {
                const mathField = funcDiv.querySelector('math-field');
                if (mathField) {
                    mathField.value = expression;
                }
            }
            
            // Plot the function
            this.plotFunction(emptyFunc);
            
            // Skip badge calculations during polar animation or pause
            if (!this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
                // Update analysis features if enabled
                if (this.showIntersections) {
                    this.calculateIntersectionsWithWorker(true); // true = immediate
                }
                if (this.showTurningPoints) {
                    this.turningPoints = this.findTurningPoints();
                }
                if (this.showIntercepts) {
                    this.intercepts = this.findAxisIntercepts();
                }
            }
        } else {
            // No empty slot found, add as new function
            this.addFunction(expression);
        }
        
        // Ensure there's always an empty function available after adding
        this.ensureEmptyFunction();
        
        // Save to localStorage
        this.saveFunctionsToLocalStorage();
    }

    // Ensure there's at least one empty function in the current mode
    ensureEmptyFunction() {
        const functions = this.getCurrentFunctions();
        const hasEmpty = functions.some(func => !func.expression || func.expression.trim() === '');
        
        if (!hasEmpty) {
            // No empty function exists, add one
            this.addFunction('');
        }
    }
    
    createFunctionUI(func) {
        const container = document.getElementById('functions-container');
        const funcDiv = document.createElement('div');
        funcDiv.className = 'function-item';
        funcDiv.style.borderLeftColor = func.color;
        funcDiv.setAttribute('data-function-id', func.id);

        // Set placeholder based on the function's mode
        const placeholder = (func.mode === 'polar') 
            ? '\\text{Enter f(θ)}' 
            : '\\text{Enter f(x) or f(x,y)}';

        funcDiv.innerHTML = `
            <math-field 
                class="mathlive-input" 
                placeholder="${placeholder}"
                default-mode="math"
                smart-fence="true"
                smart-superscript="true"
                virtual-keyboard-mode="auto"
                virtual-keyboards="numeric functions symbols greek"
                color-scheme="dark"
                style="
                    width: 100%;
                    padding: 8px;
                    font-size: 14px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--input-bg);
                    color: var(--text-primary);
                    outline: none;
                    box-sizing: border-box;
                    --hue: 220;
                    --accent-color: var(--accent-color);
                    --background: var(--input-bg);
                    --text-color: var(--text-primary);
                    --selection-background-color: var(--accent-color);
                    --selection-color: #fff;
                    --contains-highlight-background-color: var(--accent-color);
                ">${func.expression}</math-field>
            <div class="function-controls">
                <div class="color-indicator" style="background-color: ${func.color}; opacity: ${func.enabled ? '1' : '0.3'}; filter: ${func.enabled ? 'none' : 'grayscale(100%)'}" title="Click to ${func.enabled ? 'hide' : 'show'} function"></div>
                <button class="remove-btn" title="Delete function">×</button>
            </div>
        `;
        
        // Get the MathLive element
        const mathField = funcDiv.querySelector('math-field');
        
        // Set inline shortcuts for this field after it's mounted
        if (mathField) {
            // Wait for the mathfield to be fully mounted
            setTimeout(() => {
                try {
                    mathField.inlineShortcuts = {
                        ...window.MathfieldElement.options?.inlineShortcuts, // Preserve defaults
                        // Common Greek letters
                        'pi': '\\pi',
                        'alpha': '\\alpha',
                        'beta': '\\beta',
                        'gamma': '\\gamma',
                        'delta': '\\delta',
                        'epsilon': '\\epsilon',
                        'theta': '\\theta',
                        'lambda': '\\lambda',
                        'mu': '\\mu',
                        'sigma': '\\sigma',
                        'omega': '\\omega',
                        // Square root
                        'sqrt': '\\sqrt{#0}',
                        'sqrt(': '\\sqrt{#0}',
                        // Disable "a" prefix shortcuts to prevent "alphasin" conflicts
                        'asin': false,
                        'acos': false,
                        'atan': false,
                        'asec': false,
                        'acsc': false,
                        'acot': false,
                        'asinh': false,
                        'acosh': false,
                        'atanh': false,
                        'asech': false,
                        'acsch': false,
                        'acoth': false,
                        // Inverse trig (arc notation only)
                        'arcsin': '\\operatorname{arcsin}',
                        'arccos': '\\operatorname{arccos}',
                        'arctan': '\\operatorname{arctan}',
                        'arcsec': '\\operatorname{arcsec}',
                        'arccsc': '\\operatorname{arccsc}',
                        'arccot': '\\operatorname{arccot}',
                        // Inverse hyperbolic (arc notation only)
                        'arcsinh': '\\operatorname{arcsinh}',
                        'arccosh': '\\operatorname{arccosh}',
                        'arctanh': '\\operatorname{arctanh}',
                        'arcsech': '\\operatorname{arcsech}',
                        'arccsch': '\\operatorname{arccsch}',
                        'arccoth': '\\operatorname{arccoth}',
                        // Hyperbolic
                        'sinh': '\\sinh',
                        'cosh': '\\cosh',
                        'tanh': '\\tanh',
                        'sech': '\\operatorname{sech}',
                        'csch': '\\operatorname{csch}',
                        'coth': '\\operatorname{coth}',
                        // Regular trig
                        'sin': '\\sin',
                        'cos': '\\cos',
                        'tan': '\\tan',
                        'sec': '\\operatorname{sec}',
                        'csc': '\\operatorname{csc}',
                        'cot': '\\operatorname{cot}',
                        // Logarithms - simple base-10 and natural log
                        'log': '\\log',
                        'log(': '\\log(#0)',
                        'ln': '\\ln',
                        'ln(': '\\ln(#0)'
                    };
                } catch (error) {
                    // Silently handle if mathfield not ready
                }
            }, 100);
        }
        
        // Set initial opacity based on enabled state
        if (mathField) mathField.style.opacity = func.enabled ? '1' : '0.6';
        
        // Add disabled class if needed
        if (!func.enabled) {
            funcDiv.classList.add('disabled');
        }
        
        // Ensure dark mode for this specific field
        mathField.setAttribute('color-scheme', 'dark');
        
        // Configure this specific mathfield's virtual keyboard
        setTimeout(() => {
            try {
                // Virtual keyboard layouts are configured globally in configureMathLive()
                // Menu toggle is hidden via CSS to save space on all devices
            } catch (error) {
                // Silently handle keyboard setup errors
            }
        }, 100);
        
        // Add keyboard event listener for smart power key
        mathField.addEventListener('keydown', (event) => {
            // Smart power key: ^ behaves like the power buttons
            if (event.key === '^' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault(); // Prevent default ^ insertion
                
                // Use the same smart behavior as the power buttons: #@^{#?}
                // This will use selection/preceding content as base, or create placeholder if none
                mathField.executeCommand(['insert', '#@^{#?}']);
            }
        });
        
        // Add event listeners
        const colorIndicator = funcDiv.querySelector('.color-indicator');
        const removeBtn = funcDiv.querySelector('.remove-btn');
        
        // Get computed CSS variable values to match polar range fields exactly
        const computedStyle = getComputedStyle(document.documentElement);
        const accentColor = computedStyle.getPropertyValue('--accent-color').trim() || '#4A90E2';
        const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
        
        // Add focus/blur listeners to apply consistent styling with polar range fields
        mathField.addEventListener('focusin', () => {
            // Check for landscape editing restriction first
            if (this.shouldRestrictLandscapeEditing()) {
                mathField.blur();
                this.showLandscapeEditingRestriction();
                return;
            }
            
            // Prevent immediate refocus on tablets after closing mobile menu
            if (mathField.getAttribute('data-blur-protected') === 'true') {
                mathField.blur();
                return;
            }
            
            // Check if parent has error - preserve error styling if present
            const funcDiv = mathField.closest('.function-item');
            if (funcDiv && funcDiv.classList.contains('function-error')) {
                mathField.style.setProperty('border', '2px solid #E74C3C', 'important');
                mathField.style.setProperty('box-shadow', '0 0 0 2px rgba(231, 76, 60, 0.3)', 'important');
            } else {
                // Apply focus styling to match polar range fields
                mathField.style.setProperty('--border', `1px solid ${accentColor}`, 'important');
                mathField.style.setProperty('border', `1px solid ${accentColor}`, 'important');
                mathField.style.setProperty('box-shadow', '0 0 0 2px rgba(74, 144, 226, 0.2)', 'important');
            }
            mathField.style.setProperty('outline', 'none', 'important');
        });
        
        mathField.addEventListener('focusout', () => {
            // Check if parent has error - preserve error styling if present
            const funcDiv = mathField.closest('.function-item');
            if (funcDiv && funcDiv.classList.contains('function-error')) {
                mathField.style.setProperty('border', '2px solid #E74C3C', 'important');
                mathField.style.setProperty('box-shadow', 'none', 'important');
            } else {
                // Remove focus styling
                mathField.style.setProperty('--border', `1px solid ${borderColor}`, 'important');
                mathField.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                mathField.style.setProperty('box-shadow', 'none', 'important');
            }
            mathField.style.setProperty('outline', 'none', 'important');
        });
        
        // Keep old focus listener for backwards compatibility
        mathField.addEventListener('focus', (e) => {
            if (this.shouldRestrictLandscapeEditing()) {
                e.preventDefault();
                mathField.blur(); // Remove focus
                this.showLandscapeEditingRestriction();
                return;
            }
            
            // Prevent immediate refocus on tablets after closing mobile menu
            if (mathField.getAttribute('data-blur-protected') === 'true') {
                e.preventDefault();
                mathField.blur();
                return;
            }
        });
        
        // Auto-focus field when virtual keyboard toggle is clicked
        // The toggle opens the keyboard but doesn't focus the field by default,
        // making the keyboard non-functional until the field is clicked separately
        mathField.addEventListener('click', (e) => {
            // Check if the click was on the virtual keyboard toggle button
            const path = e.composedPath(); // Get full event path including shadow DOM
            const toggleClicked = path.some(el => {
                // Check for the toggle button in shadow DOM
                return el.getAttribute && (
                    el.getAttribute('part') === 'virtual-keyboard-toggle' ||
                    el.classList?.contains('ML__virtual-keyboard-toggle')
                );
            });
            
            if (toggleClicked && !mathField.hasFocus()) {
                // Focus the field when toggle is clicked
                mathField.focus();
                // Move cursor to the end if field has content
                if (mathField.getValue()) {
                    // Use a small delay to ensure focus is complete
                    setTimeout(() => {
                        mathField.selection = { ranges: [[Infinity, Infinity]] };
                    }, 10);
                }
            }
        });

        mathField.addEventListener('input', () => {
            // Store LaTeX directly instead of converting
            try {
                const latex = mathField.getValue();
                func.expression = latex; // Store LaTeX format
                
                // Clear expression cache when function expression changes
                this.clearExpressionCache();
                
                // Remove badges for this function since expression changed
                this.removeBadgesForFunction(func.id);
                this.removeIntersectionBadgesForFunction(func.id);
                
                // Update parameter sliders when function expression changes
                this.updateParameterSliders();
                
                // Stop animation when editing a function in polar mode
                if (this.plotMode === 'polar' && (this.polarAnimation.isAnimating || this.polarAnimation.isPaused)) {
                    this.stopPolarAnimation();
                    // Update UI to show stopped state
                    const playIcon = document.getElementById('play-icon');
                    const pauseIcon = document.getElementById('pause-icon');
                    const playPauseText = document.getElementById('play-pause-text');
                    const polarStopButton = document.getElementById('polar-stop-animation');
                    if (playIcon && pauseIcon && playPauseText) {
                        playIcon.style.display = 'block';
                        pauseIcon.style.display = 'none';
                        playPauseText.textContent = 'Play';
                    }
                    if (polarStopButton) {
                        polarStopButton.style.opacity = '0.6';
                        polarStopButton.style.background = '#1a2a3f';
                    }
                }
                
                // Debounced plotting
                this.debouncePlot(func);
                
                // Save functions to localStorage after expression changes
                this.saveFunctionsToLocalStorage();
            } catch (error) {
                console.warn('Error getting mathfield value:', error);
            }
        });
        
        mathField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Force immediate plotting on Enter, bypassing debounce
                try {
                    const latex = mathField.getValue();
                    func.expression = latex; // Store LaTeX format
                    
                    // Clear expression cache when function expression changes
                    this.clearExpressionCache();
                    
                    // Remove badges for this function since expression changed
                    this.removeBadgesForFunction(func.id);
                    this.removeIntersectionBadgesForFunction(func.id);
                    
                    this.replotAllFunctions(); // Replot all functions for consistent badge behavior
                } catch (error) {
                    console.warn('Error getting mathfield value on Enter:', error);
                }
            }
        });
        
        colorIndicator.addEventListener('click', () => {
            // Clear badges for this function when toggling visibility
            this.removeBadgesForFunction(func.id);
            // Clear intersection badges that involve this function only
            this.removeIntersectionBadgesForFunction(func.id);
            func.enabled = !func.enabled;
            this.updateFunctionVisualState(func, funcDiv);
            
            // Save the updated enabled state to localStorage
            this.saveFunctionsToLocalStorage();
            
            // Replot all functions to ensure proper display with new state
            this.replotAllFunctions();
            
            // Clear intersection arrays before recalculating to prevent stale data
            this.intersections = [];
            this.explicitIntersections = [];
            this.implicitIntersections = [];
            this.frozenIntersectionBadges = [];
            
            // Recalculate intersections and turning points with the new function state
            if (this.showIntersections) {
                this.calculateIntersectionsWithWorker();
            }
            if (this.showTurningPoints) {
                this.turningPoints = this.findTurningPoints();
                this.draw();
            }
            if (this.showIntercepts) {
                this.intercepts = this.findAxisIntercepts();
                this.draw();
            }
        });
        
        removeBtn.addEventListener('click', () => {
            // Clear badges for this function when removing
            this.removeBadgesForFunction(func.id);
            // Clear intersection badges that involve this function
            this.removeIntersectionBadgesForFunction(func.id);
            this.removeFunction(func.id);
        });
        
        container.appendChild(funcDiv);
        
        // Set initial visual state
        this.updateFunctionVisualState(func, funcDiv);
    }
    
    updateFunctionVisualState(func, funcDiv) {
        const colorIndicator = funcDiv.querySelector('.color-indicator');
        const mathField = funcDiv.querySelector('math-field');
        
        if (func.enabled) {
            // Function is visible
            colorIndicator.style.opacity = '1';
            colorIndicator.style.filter = 'none';
            colorIndicator.title = 'Click to hide function';
            if (mathField) mathField.style.opacity = '1';
            funcDiv.classList.remove('disabled');
        } else {
            // Function is hidden
            colorIndicator.style.opacity = '0.3';
            colorIndicator.style.filter = 'grayscale(100%)';
            colorIndicator.title = 'Click to show function';
            if (mathField) mathField.style.opacity = '0.6';
            funcDiv.classList.add('disabled');
        }
    }
    
    updateIntersectionToggleButton() {
        const intersectionToggleButton = document.getElementById('intersection-toggle');
        if (intersectionToggleButton) {
            intersectionToggleButton.style.background = this.showIntersections ? '#2A3F5A' : '#1a2a3f';
            intersectionToggleButton.style.opacity = this.showIntersections ? '1' : '0.6';
            intersectionToggleButton.title = this.showIntersections 
                ? 'Intersection detection enabled (click to disable)' 
                : 'Intersection detection disabled (click to enable)';
        }
    }
    
    debouncePlot(func) {
        // Clear existing timer for this function
        if (this.plotTimers.has(func.id)) {
            clearTimeout(this.plotTimers.get(func.id));
        }
        
        // Set new timer for delayed plotting - replot all functions for consistent badge behavior
        const timerId = setTimeout(() => {
            this.replotAllFunctions(); // Replot all functions to ensure badges are properly updated
            this.plotTimers.delete(func.id);
        }, 500); // Balanced delay for responsiveness and performance
        
        this.plotTimers.set(func.id, timerId);
    }
    
    // Expression compilation cache helpers for performance optimization
    getCompiledExpression(expression) {
        // Check if expression is already in cache
        if (this.expressionCache.has(expression)) {
            return this.expressionCache.get(expression);
        }
        
        // Compile and cache the expression
        try {
            const compiledExpression = math.compile(expression);
            this.expressionCache.set(expression, compiledExpression);
            return compiledExpression;
        } catch (error) {
            // Don't cache failed compilations
            throw error;
        }
    }
    
    clearExpressionCache() {
        // Clear the entire cache when functions are modified
        this.expressionCache.clear();
    }
    
    // Regex pattern cache helpers for performance optimization
    initializeRegexCache() {
        // Cache commonly used regex patterns
        this.regexCache.set('regularTrigWithX', /\b(sin|cos|tan)\s*\(\s*[^)]*x[^)]*\)/i);
        this.regexCache.set('inverseTrigWithX', /\b(asin|acos|atan)\s*\(\s*[^)]*x[^)]*\)/i);
        this.regexCache.set('inverseTrig', /\b(asin|acos|atan)\s*\(/i);
        this.regexCache.set('regularTrig', /\b(sin|cos|tan)\s*\(/i);
        this.regexCache.set('operatorEnd', /[+\-*/^]$/);
        this.regexCache.set('android', /android/i);
        this.regexCache.set('mobile', /mobile/i);
        this.regexCache.set('iPhone', /iphone/i);
        this.regexCache.set('iPad', /ipad/i);
        this.regexCache.set('Macintosh', /macintosh/i);
        this.regexCache.set('windowsPhone', /windows phone/i);
        this.regexCache.set('iOS', /iPad|iPhone|iPod/);
        this.regexCache.set('safari', /Safari/);
        this.regexCache.set('notChromeEdge', /CriOS|FxiOS|EdgiOS/);
        
        // LaTeX conversion patterns
        this.regexCache.set('sinFunction', /\bsin\(/g);
        this.regexCache.set('cosFunction', /\bcos\(/g);
        this.regexCache.set('tanFunction', /\btan\(/g);
        this.regexCache.set('asinFunction', /\basin\(/g);
        this.regexCache.set('acosFunction', /\bacos\(/g);
        this.regexCache.set('atanFunction', /\batan\(/g);
    }
    
    getCachedRegex(patternName) {
        return this.regexCache.get(patternName);
    }
    
    async plotFunctionWithValidation(func) {
        try {
            // Don't plot empty expressions, but ensure error state is cleared
            if (!func.expression.trim()) {
                func.points = [];
                
                // Remove error styling for empty expressions (they're valid)
                const funcDiv = document.querySelector(`[data-function-id="${func.id}"]`);
                if (funcDiv) {
                    funcDiv.classList.remove('function-error');
                    
                    // Restore normal styling to math-field
                    const mathField = funcDiv.querySelector('math-field');
                    if (mathField) {
                        const computedStyle = getComputedStyle(document.documentElement);
                        const inputBg = computedStyle.getPropertyValue('--input-bg').trim() || '#3A4F6A';
                        const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
                        mathField.style.setProperty('background', inputBg, 'important');
                        mathField.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                        mathField.style.setProperty('border-radius', '4px', 'important');
                    }
                }
                return;
            }
            
            // Check for incomplete expressions (ending with operators)
            if (this.getCachedRegex('operatorEnd').test(func.expression.trim())) {
                throw new Error('Incomplete expression ending with operator');
            }
            
            // Check if math.js is available
            if (typeof math === 'undefined') {
                console.error('Math.js library not loaded!');
                return;
            }
            
            // Try a simple test evaluation to catch syntax errors early
            let processedExpression = ''; // Declare outside try block for error logging
            try {
                if (this.plotMode === 'polar') {
                    // Skip validation for theta-constant rays (they're assignments, not evaluable expressions)
                    const functionType = this.detectFunctionType(func.expression);
                    if (functionType !== 'theta-constant') {
                        // For polar mode, test with theta/t variable - remove "r=" prefix if present
                        processedExpression = this.convertFromLatex(func.expression);
                        processedExpression = processedExpression.trim();
                        if (processedExpression.toLowerCase().startsWith('r=')) {
                            processedExpression = processedExpression.substring(2).trim();
                        }
                        math.evaluate(processedExpression, this.getEvaluationScope({ t: 1, theta: 1 }));
                    }
                } else {
                    // For cartesian mode, check function type first
                    const functionType = this.detectFunctionType(func.expression);
                    
                    if (functionType === 'implicit') {
                        // Test implicit function with x,y variables
                        const equation = this.parseImplicitEquation(func.expression);
                        if (!equation) {
                            throw new Error('Invalid implicit equation format');
                        }
                        // Test evaluation at a sample point
                        const testValue = this.evaluateImplicitEquation(equation, 1, 1);
                        if (testValue === null) {
                            throw new Error('Cannot evaluate implicit equation');
                        }
                    } else {
                        // For explicit functions, test with x variable
                        processedExpression = this.convertFromLatex(func.expression);
                        // Strip y= prefix if present (since we store full equations now)
                        if (processedExpression.toLowerCase().startsWith('y=')) {
                            processedExpression = processedExpression.substring(2).trim();
                        }
                        math.evaluate(processedExpression, this.getEvaluationScope({ x: 1 }));
                        
                        // Additional validation: try to evaluate at x=0 for explicit functions only
                        const testResult = this.evaluateFunction(func.expression, 0);
                    }
                }
            } catch (evalError) {
                throw new Error('Invalid mathematical expression: ' + evalError.message);
            }
            
            // If we get here without throwing, the expression is syntactically valid
            await this.plotFunction(func);
            
            // Update intersections after plotting this function
            if (this.showIntersections) {
                this.intersections = this.calculateIntersectionsWithWorker();
            }
            
            // Update turning points after plotting this function
            if (this.showTurningPoints) {
                this.turningPoints = this.findTurningPoints();
            }
            
            // Update intercepts after plotting this function
            if (this.showIntercepts) {
                this.intercepts = this.findAxisIntercepts();
            }
            
            // Update UI to show success (remove any error styling)
            const funcDiv = document.querySelector(`[data-function-id="${func.id}"]`);
            if (funcDiv) {
                // Remove error class instead of trying to manipulate styles directly
                funcDiv.classList.remove('function-error');
                
                // Restore normal styling to math-field
                const mathField = funcDiv.querySelector('math-field');
                if (mathField) {
                    const computedStyle = getComputedStyle(document.documentElement);
                    const inputBg = computedStyle.getPropertyValue('--input-bg').trim() || '#3A4F6A';
                    const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
                    mathField.style.setProperty('background', inputBg, 'important');
                    mathField.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                    mathField.style.setProperty('border-radius', '4px', 'important');
                }
            }
            
        } catch (error) {
            // Expression is invalid, clear points and show visual feedback
            func.points = [];
            
            // Clear badges for this invalid function
            this.removeBadgesForFunction(func.id);
            // Clear intersection badges that involve this function
            this.removeIntersectionBadgesForFunction(func.id);
            
            // Don't immediately recalculate intersections here - let the normal debounce handle it
            // This prevents race conditions with badge cleanup
            // if (this.showIntersections) {
            //     this.intersections = this.findIntersections();
            // }
            if (this.showTurningPoints) {
                this.turningPoints = this.findTurningPoints();
            }
            if (this.showIntercepts) {
                this.intercepts = this.findAxisIntercepts();
            }
            
            // Update UI to show error (subtle visual feedback)
            const funcDiv = document.querySelector(`[data-function-id="${func.id}"]`);
            if (funcDiv) {
                // Add error class instead of trying to manipulate styles directly
                funcDiv.classList.add('function-error');
                
                // Also apply direct styling to the math-field for immediate visual feedback
                const mathField = funcDiv.querySelector('math-field');
                if (mathField) {
                    mathField.style.setProperty('background', 'rgba(231, 76, 60, 0.1)', 'important');
                    mathField.style.setProperty('border', '2px solid #E74C3C', 'important');
                    mathField.style.setProperty('border-radius', '4px', 'important');
                }
            }
        }
    }
    
    removeFunction(id) {
        // Clear any pending plot timer for this function
        if (this.plotTimers.has(id)) {
            clearTimeout(this.plotTimers.get(id));
            this.plotTimers.delete(id);
        }
        
        // Clear expression cache when functions are removed
        this.clearExpressionCache();
        
        // Remove from the appropriate function array
        this.cartesianFunctions = this.cartesianFunctions.filter(f => f.id !== id);
        this.polarFunctions = this.polarFunctions.filter(f => f.id !== id);
        
        // Track when user intentionally clears all functions in current mode
        if (this.getCurrentFunctions().length === 0) {
            if (this.plotMode === 'cartesian') {
                this.cartesianFunctionsCleared = true;
            } else {
                this.polarFunctionsCleared = true;
            }
        }
        
        const funcDiv = document.querySelector(`[data-function-id="${id}"]`);
        if (funcDiv) {
            funcDiv.remove();
        }
        
        // Recalculate intersections and turning points for remaining functions
        this.handleViewportChange();
        
        // Update parameter sliders when function is removed
        this.updateParameterSliders();
        
        // Redraw to update the display immediately
        this.draw();
        
        // Save functions to localStorage
        this.saveFunctionsToLocalStorage();
    }
    
    // Save functions to localStorage
    saveFunctionsToLocalStorage() {
        try {
            // Save cartesian functions (filter out empty ones)
            const cartesianData = this.cartesianFunctions
                .filter(func => func.expression && func.expression.trim() !== '')
                .map(func => ({
                    expression: func.expression,
                    enabled: func.enabled
                }));
            localStorage.setItem('graphiti_cartesian_functions', JSON.stringify(cartesianData));
            
            // Save polar functions (filter out empty ones)
            const polarData = this.polarFunctions
                .filter(func => func.expression && func.expression.trim() !== '')
                .map(func => ({
                    expression: func.expression,
                    enabled: func.enabled
                }));
            localStorage.setItem('graphiti_polar_functions', JSON.stringify(polarData));
        } catch (error) {
            // Silently handle localStorage errors (e.g., quota exceeded, private browsing)
            console.warn('Could not save functions to localStorage:', error);
        }
    }
    
    // Load functions from localStorage
    loadFunctionsFromLocalStorage() {
        try {
            let cartesianResult = null;
            let hasSavedCartesian = false;
            let polarResult = null;
            let hasSavedPolar = false;
            
            // Load cartesian functions if available
            const cartesianData = localStorage.getItem('graphiti_cartesian_functions');
            if (cartesianData) {
                const parsedCartesian = JSON.parse(cartesianData);
                if (Array.isArray(parsedCartesian) && parsedCartesian.length > 0) {
                    cartesianResult = parsedCartesian;
                    hasSavedCartesian = true;
                }
            }
            
            // Load polar functions if available
            const polarData = localStorage.getItem('graphiti_polar_functions');
            if (polarData) {
                const parsedPolar = JSON.parse(polarData);
                if (Array.isArray(parsedPolar) && parsedPolar.length > 0) {
                    polarResult = parsedPolar;
                    hasSavedPolar = true;
                }
            }
            
            return { 
                cartesian: cartesianResult, 
                polar: polarResult, 
                hasSavedCartesian: hasSavedCartesian, 
                hasSavedPolar: hasSavedPolar 
            };
        } catch (error) {
            console.warn('Could not load functions from localStorage:', error);
            return { cartesian: null, polar: null, hasSavedCartesian: false, hasSavedPolar: false };
        }
    }

    // Save viewport bounds to localStorage
    saveViewportBounds() {
        // Don't save if we're currently loading bounds from localStorage
        if (this.isLoadingBounds) {
            return;
        }
        
        // Don't save during initial setup (before loadAndApplyViewportBounds runs)
        if (this.isInitialSetup) {
            return;
        }
        
        try {
            // Save current plot mode
            localStorage.setItem('graphiti_plot_mode', this.plotMode);
            
            // Always save cartesian viewport bounds (from viewport object, not inputs)
            const cartesianBounds = {
                xMin: this.cartesianViewport.minX.toString(),
                xMax: this.cartesianViewport.maxX.toString(),
                yMin: this.cartesianViewport.minY.toString(),
                yMax: this.cartesianViewport.maxY.toString(),
                // Store LaTeX strings to preserve symbolic forms (e.g., "2\pi" instead of "6.283...")
                xMinLatex: this.viewport.xMinLatex || this.cartesianViewport.minX.toString(),
                xMaxLatex: this.viewport.xMaxLatex || this.cartesianViewport.maxX.toString(),
                yMinLatex: this.viewport.yMinLatex || this.cartesianViewport.minY.toString(),
                yMaxLatex: this.viewport.yMaxLatex || this.cartesianViewport.maxY.toString(),
                scale: this.cartesianViewport.scale
            };
            localStorage.setItem('graphiti_cartesian_bounds', JSON.stringify(cartesianBounds));

            // Always save polar viewport bounds (from viewport object and polarSettings)
            const polarBounds = {
                thetaMin: this.polarSettings.thetaMin.toString(),
                thetaMax: this.polarSettings.thetaMax.toString(),
                // Store LaTeX strings to preserve symbolic forms (e.g., "2\pi" instead of "6.283...")
                thetaMinLatex: this.polarSettings.thetaMinLatex || this.polarSettings.thetaMin.toString(),
                thetaMaxLatex: this.polarSettings.thetaMaxLatex || this.polarSettings.thetaMax.toString(),
                angleMode: this.angleMode, // Save angle mode to prevent unit mismatch on reload
                viewportMinX: this.polarViewport.minX,
                viewportMaxX: this.polarViewport.maxX,
                viewportMinY: this.polarViewport.minY,
                viewportMaxY: this.polarViewport.maxY,
                scale: this.polarViewport.scale
            };
            localStorage.setItem('graphiti_polar_bounds', JSON.stringify(polarBounds));
        } catch (error) {
            console.warn('Could not save viewport bounds to localStorage:', error);
        }
    }

    // Load and apply viewport bounds from localStorage
    // Returns true if bounds were loaded and applied, false otherwise
    loadAndApplyViewportBounds() {
        try {
            let boundsApplied = false;
            
            // Always load cartesian bounds (regardless of current mode)
            const cartesianData = localStorage.getItem('graphiti_cartesian_bounds');
            if (cartesianData) {
                const bounds = JSON.parse(cartesianData);
                
                // Validate that all required fields exist
                if (bounds.xMin !== undefined && bounds.xMax !== undefined && 
                    bounds.yMin !== undefined && bounds.yMax !== undefined) {
                    
                    const xMin = parseFloat(bounds.xMin);
                    const xMax = parseFloat(bounds.xMax);
                    const yMin = parseFloat(bounds.yMin);
                    const yMax = parseFloat(bounds.yMax);
                    
                    // Validate the values are valid numbers and make sense
                    if (!isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax) &&
                        xMin < xMax && yMin < yMax) {
                        
                        // Apply to cartesian viewport
                        this.cartesianViewport.minX = xMin;
                        this.cartesianViewport.maxX = xMax;
                        this.cartesianViewport.minY = yMin;
                        this.cartesianViewport.maxY = yMax;
                        
                        // Restore scale if saved, otherwise calculate it
                        if (bounds.scale !== undefined) {
                            const scale = parseFloat(bounds.scale);
                            if (!isNaN(scale) && scale > 0) {
                                this.cartesianViewport.scale = scale;
                            }
                        }
                        
                        // Update inputs only if in cartesian mode
                        if (this.plotMode === 'cartesian') {
                            const xMinInput = document.getElementById('x-min');
                            const xMaxInput = document.getElementById('x-max');
                            const yMinInput = document.getElementById('y-min');
                            const yMaxInput = document.getElementById('y-max');
                            
                            // Temporarily disable saving while we load (to prevent input events from saving)
                            this.isLoadingBounds = true;
                            
                            // Restore LaTeX strings if available (preserves symbolic form like "2\pi")
                            // Otherwise fall back to numeric values for backward compatibility
                            if (xMinInput) {
                                const xMinValue = bounds.xMinLatex || bounds.xMin;
                                xMinInput.setValue(xMinValue);
                                this.viewport.xMinLatex = xMinValue;
                            }
                            if (xMaxInput) {
                                const xMaxValue = bounds.xMaxLatex || bounds.xMax;
                                xMaxInput.setValue(xMaxValue);
                                this.viewport.xMaxLatex = xMaxValue;
                            }
                            if (yMinInput) {
                                const yMinValue = bounds.yMinLatex || bounds.yMin;
                                yMinInput.setValue(yMinValue);
                                this.viewport.yMinLatex = yMinValue;
                            }
                            if (yMaxInput) {
                                const yMaxValue = bounds.yMaxLatex || bounds.yMax;
                                yMaxInput.setValue(yMaxValue);
                                this.viewport.yMaxLatex = yMaxValue;
                            }
                            
                            this.isLoadingBounds = false;
                            
                            boundsApplied = true;
                        }
                    }
                }
            }

            // Always load polar bounds (regardless of current mode)
            const polarData = localStorage.getItem('graphiti_polar_bounds');
            if (polarData) {
                const bounds = JSON.parse(polarData);
                
                // Restore angle mode first if it was saved
                if (bounds.angleMode !== undefined) {
                    this.angleMode = bounds.angleMode;
                    // Update UI to match restored angle mode
                    const degreesIcon = document.getElementById('degrees-icon');
                    const radiansIcon = document.getElementById('radians-icon');
                    if (degreesIcon && radiansIcon) {
                        if (this.angleMode === 'degrees') {
                            degreesIcon.style.opacity = '1';
                            radiansIcon.style.opacity = '0.3';
                        } else {
                            degreesIcon.style.opacity = '0.3';
                            radiansIcon.style.opacity = '1';
                        }
                    }
                }
                
                if (bounds.thetaMin !== undefined && bounds.thetaMax !== undefined) {
                    const thetaMin = parseFloat(bounds.thetaMin);
                    const thetaMax = parseFloat(bounds.thetaMax);
                    
                    if (!isNaN(thetaMin) && !isNaN(thetaMax) && thetaMin < thetaMax) {
                        this.polarSettings.thetaMin = thetaMin;
                        this.polarSettings.thetaMax = thetaMax;
                        
                        // Also restore polar viewport ranges if they exist
                        if (bounds.viewportMinX !== undefined && bounds.viewportMaxX !== undefined &&
                            bounds.viewportMinY !== undefined && bounds.viewportMaxY !== undefined) {
                            
                            const vMinX = parseFloat(bounds.viewportMinX);
                            const vMaxX = parseFloat(bounds.viewportMaxX);
                            const vMinY = parseFloat(bounds.viewportMinY);
                            const vMaxY = parseFloat(bounds.viewportMaxY);
                            
                            if (!isNaN(vMinX) && !isNaN(vMaxX) && !isNaN(vMinY) && !isNaN(vMaxY) &&
                                vMinX < vMaxX && vMinY < vMaxY) {
                                
                                this.polarViewport.minX = vMinX;
                                this.polarViewport.maxX = vMaxX;
                                this.polarViewport.minY = vMinY;
                                this.polarViewport.maxY = vMaxY;
                                
                                // Restore scale if saved
                                if (bounds.scale !== undefined) {
                                    const scale = parseFloat(bounds.scale);
                                    if (!isNaN(scale) && scale > 0) {
                                        this.polarViewport.scale = scale;
                                    }
                                }
                            }
                        }
                        
                        // Update inputs only if in polar mode
                        if (this.plotMode === 'polar') {
                            const thetaMinInput = document.getElementById('theta-min');
                            const thetaMaxInput = document.getElementById('theta-max');
                            
                            // Temporarily disable saving while we load
                            this.isLoadingBounds = true;
                            
                        // Restore LaTeX strings if available (preserves symbolic form like "2\pi")
                        // Otherwise fall back to numeric values for backward compatibility
                        if (thetaMinInput) {
                            const thetaMinValue = bounds.thetaMinLatex || bounds.thetaMin;
                            thetaMinInput.setValue(thetaMinValue);
                            this.polarSettings.thetaMinLatex = thetaMinValue;
                        }
                        if (thetaMaxInput) {
                            const thetaMaxValue = bounds.thetaMaxLatex || bounds.thetaMax;
                            thetaMaxInput.setValue(thetaMaxValue);
                            this.polarSettings.thetaMaxLatex = thetaMaxValue;
                        }                            this.isLoadingBounds = false;
                            
                            boundsApplied = true;
                        }
                    }
                }
            }
            
            return boundsApplied;
        } catch (error) {
            console.warn('Could not load viewport bounds from localStorage:', error);
            return false;
        }
    }
    
    clearAllFunctions() {
        // Clear all pending plot timers
        this.plotTimers.forEach((timerId) => {
            clearTimeout(timerId);
        });
        this.plotTimers.clear();
        
        this.getCurrentFunctions().length = 0; // Clear current mode functions
        const container = document.getElementById('functions-container');
        container.innerHTML = '';
    }
    
    async plotFunction(func) {
        const startTime = performance.now();
        
        // Check if math.js is available
        if (typeof math === 'undefined') {
            console.error('Math.js library not loaded!');
            alert('Math library not loaded. Please refresh the page.');
            return;
        }
        
        if (!func.expression.trim()) {
            func.points = [];
            if (this.performance.enabled) {
                this.performance.plotTimes.set(func.id, 0);
            }
            return;
        }
        
        // Route to appropriate plotting method based on mode and function type
        if (this.plotMode === 'polar') {
            this.plotPolarFunction(func);
            if (this.performance.enabled) {
                const elapsed = performance.now() - startTime;
                this.performance.plotTimes.set(func.id, elapsed);
            }
            return;
        }
        
        // Detect function type for cartesian mode
        const functionType = this.detectFunctionType(func.expression);
        
        if (functionType === 'implicit') {
            await this.plotImplicitFunction(func, false, this.isStartup);
            return;
        }
        
        // Cartesian plotting (existing code)
        try {
            // Pre-process expression ONCE instead of 2000 times
            let processedExpression = this.convertFromLatex(func.expression);
            if (processedExpression.toLowerCase().startsWith('y=')) {
                processedExpression = processedExpression.substring(2);
            }
            processedExpression = processedExpression.toLowerCase();
            
            // Handle degree mode preprocessing
            if (this.angleMode === 'degrees') {
                const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedExpression);
                if (hasRegularTrigWithX) {
                    processedExpression = this.convertTrigToDegreeMode(processedExpression);
                }
            }
            
            // Compile expression ONCE
            const compiledExpression = this.getCompiledExpression(processedExpression);
            const hasInverseTrig = this.angleMode === 'degrees' && this.getCachedRegex('inverseTrig').test(func.expression.toLowerCase());
            const scope = this.getEvaluationScope({});
            
            // Calculate points for the current viewport
            const points = [];
            // Apply adaptive resolution based on function count (balanced for quality and performance)
            const functionCount = this.getCurrentFunctions().filter(f => f.enabled).length;
            const adaptiveResolution = functionCount > 10 ? 800 : functionCount > 6 ? 1200 : 2000;
            const maxPlotResolution = adaptiveResolution; // Dynamic resolution based on complexity
            
            // Add buffer zone for smooth panning - calculate extra points beyond visible viewport
            // Buffer is 50% of viewport width on each side, giving smooth panning until you exceed it
            const viewportWidth = this.viewport.maxX - this.viewport.minX;
            const bufferSize = viewportWidth * 0.5;
            const bufferedMinX = this.viewport.minX - bufferSize;
            const bufferedMaxX = this.viewport.maxX + bufferSize;
            
            const step = (bufferedMaxX - bufferedMinX) / maxPlotResolution;
            
            // Use a more precise approach to ensure we include the endpoint
            const numSteps = Math.ceil((bufferedMaxX - bufferedMinX) / step);
            
            // Collect critical points that must be included (domain boundaries)
            const criticalPoints = [];
            if (func.expression.toLowerCase().includes('asin') || func.expression.toLowerCase().includes('acos')) {
                // For inverse trig functions, ensure we include x = ±1 if they're in buffered range
                if (bufferedMinX <= 1 && bufferedMaxX >= 1) criticalPoints.push(1);
                if (bufferedMinX <= -1 && bufferedMaxX >= -1) criticalPoints.push(-1);
            }
            
            for (let i = 0; i <= numSteps; i++) {
                let x = bufferedMinX + (i * step);
                
                // Ensure we hit the exact endpoint on the last iteration
                if (i === numSteps) {
                    x = bufferedMaxX;
                }
                
                try {
                    scope.x = x;
                    const result = compiledExpression.evaluate(scope);
                    const y = hasInverseTrig ? result * 180 / Math.PI : result;
                    
                    if (isFinite(y)) {
                        points.push({ x, y, connected: true });
                    } else {
                        // Add a break point for discontinuities
                        if (points.length > 0) {
                            points.push({ x, y: NaN, connected: false });
                        }
                    }
                } catch (e) {
                    // Add a break point for evaluation errors
                    if (points.length > 0) {
                        points.push({ x, y: NaN, connected: false });
                    }
                }
            }
            
            // Add critical points that might have been missed due to step size
            for (const criticalX of criticalPoints) {
                // Check if this critical point is already very close to an existing point
                const existsAlready = points.some(p => Math.abs(p.x - criticalX) < step * 0.1);
                if (!existsAlready) {
                    try {
                        scope.x = criticalX;
                        const result = compiledExpression.evaluate(scope);
                        const y = hasInverseTrig ? result * 180 / Math.PI : result;
                        if (isFinite(y)) {
                            points.push({ x: criticalX, y, connected: true });
                        }
                    } catch (e) {
                        // Critical point evaluation failed, skip it
                    }
                }
            }
            
            // Sort points by x-coordinate to maintain proper order
            points.sort((a, b) => a.x - b.x);
            
            // Post-process to detect sudden jumps (asymptotes)
            const processedPoints = [];
            const viewportHeight = this.viewport.maxY - this.viewport.minY;
            const jumpThreshold = viewportHeight * 2; // If jump is larger than 2x viewport height
            
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                
                if (i === 0 || !isFinite(point.y)) {
                    processedPoints.push(point);
                    continue;
                }
                
                const prevPoint = points[i - 1];
                if (isFinite(prevPoint.y) && isFinite(point.y)) {
                    const yDiff = Math.abs(point.y - prevPoint.y);
                    
                    // If there's a sudden large jump, insert a break
                    if (yDiff > jumpThreshold) {
                        processedPoints.push({ x: prevPoint.x, y: NaN, connected: false });
                        processedPoints.push({ x: point.x, y: point.y, connected: false });
                    } else {
                        processedPoints.push(point);
                    }
                } else {
                    processedPoints.push(point);
                }
            }
            
            func.points = processedPoints;
        } catch (error) {
            console.error('Error parsing function:', error);
            // Silent error for better UX during typing - no alert popup
            func.points = [];
        }
        
        // Track plotting time for performance monitoring
        if (this.performance.enabled) {
            const elapsed = performance.now() - startTime;
            this.performance.plotTimes.set(func.id, elapsed);
        }
    }
    
    plotPolarFunction(func) {
        // Check if this is a theta = constant ray
        const functionType = this.detectFunctionType(func.expression);
        if (functionType === 'theta-constant') {
            this.plotPolarRay(func);
            return;
        }
        
        try {
            // Convert from LaTeX first, then prepare the expression for evaluation
            let processedExpression = this.convertFromLatex(func.expression).trim();
            if (processedExpression.toLowerCase().startsWith('r=')) {
                processedExpression = processedExpression.substring(2).trim();
            }
            processedExpression = processedExpression.toLowerCase();
            
            // Add implicit multiplication: 2theta -> 2*theta, 3cos -> 3*cos
            processedExpression = processedExpression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
            processedExpression = processedExpression.replace(/(\))([a-zA-Z])/g, '$1*$2');
            
            // Note: In polar mode, theta is already in the correct units (degrees or radians)
            // We don't need convertTrigToDegreeMode because math.js trig functions work with radians
            // and we'll convert theta to radians when needed for Math.cos/sin
            
            // Use cached compiled expression for better performance
            const compiledExpression = this.getCompiledExpression(processedExpression);
            
            const points = [];
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            // Calculate dynamic step size to prevent system hangs
            const thetaStep = this.calculateDynamicPolarStep(thetaMin, thetaMax);
            
            // Create scope once and reuse it for performance
            const scope = this.getEvaluationScope({ 
                theta: 0, 
                t: 0,
                pi: Math.PI,
                e: Math.E
            });
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    // Convert theta to radians if in degree mode, since math.js trig functions expect radians
                    let thetaForEval = this.angleMode === 'degrees' ? theta * Math.PI / 180 : theta;
                    
                    // Update scope values instead of creating new scope object
                    scope.theta = thetaForEval;
                    scope.t = thetaForEval;
                    
                    let r = compiledExpression.evaluate(scope);
                    
                    // Handle negative r values based on setting
                    let adjustedThetaForEval = thetaForEval; // Use separate variable to avoid modifying loop counter
                    if (r < 0) {
                        if (this.polarSettings.plotNegativeR) {
                            // Plot negative r at opposite angle (add π radians)
                            r = Math.abs(r);
                            adjustedThetaForEval = thetaForEval + Math.PI;
                        } else {
                            // Skip negative r values
                            continue;
                        }
                    }
                    
                    // Convert polar to cartesian
                    // Use adjustedThetaForEval which accounts for negative r values
                    const x = r * Math.cos(adjustedThetaForEval);
                    const y = r * Math.sin(adjustedThetaForEval);
                    
                    // Check if point is within reasonable bounds
                    if (isFinite(x) && isFinite(y)) {
                        points.push({ x, y, connected: true });
                    } else {
                        points.push({ x: NaN, y: NaN, connected: false });
                    }
                } catch (e) {
                    // Skip points that can't be evaluated
                    points.push({ x: NaN, y: NaN, connected: false });
                }
            }
            
            func.points = points;
        } catch (error) {
            console.error('Error parsing polar function:', error);
            // Silent error for better UX during typing - no alert popup
            func.points = [];
        }
    }
    
    plotPolarRay(func) {
        try {
            // Convert from LaTeX first since we now store LaTeX format
            const convertedExpression = this.convertFromLatex(func.expression).trim();
            
            // Extract the theta value from "theta = <expression>" or "θ = <expression>" or "t = <expression>"
            const thetaMatch = convertedExpression.match(/^(θ|theta|t)\s*=\s*(.+)$/i);
            if (!thetaMatch) {
                func.points = [];
                return;
            }
            
            const thetaExpression = thetaMatch[2].trim();
            
            // Evaluate the constant expression
            let thetaValue;
            try {
                const scope = { pi: Math.PI, e: Math.E };
                thetaValue = math.evaluate(thetaExpression, scope);
            } catch (e) {
                console.error('Error evaluating theta expression:', e);
                func.points = [];
                return;
            }
            
            // Convert to radians if in degree mode
            const thetaRad = this.angleMode === 'degrees' ? thetaValue * Math.PI / 180 : thetaValue;
            
            // Calculate the maximum radius needed to reach the edge of the viewport
            // Get the distance to the farthest corner of the viewport
            const maxViewportRadius = Math.max(
                Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.minY * this.viewport.minY),
                Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.minY * this.viewport.minY),
                Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.maxY * this.viewport.maxY),
                Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.maxY * this.viewport.maxY)
            ) * 2; // Double it to ensure it extends well beyond viewport
            
            // Create points from origin to edge along the ray
            const points = [];
            const numPoints = 100; // Use more points to ensure proper rendering
            
            for (let i = 0; i < numPoints; i++) {
                const r = (i / (numPoints - 1)) * maxViewportRadius;
                const x = r * Math.cos(thetaRad);
                const y = r * Math.sin(thetaRad);
                points.push({ x, y, connected: true });
            }
            
            func.points = points;
        } catch (error) {
            console.error('Error plotting polar ray:', error);
            func.points = [];
        }
    }

    // ================================
    // POLAR ANIMATION METHODS
    // ================================

    startPolarAnimation() {
        if (this.polarAnimation.isAnimating) return;
        
        this.polarAnimation.isAnimating = true;
        this.polarAnimation.isPaused = false;
        
        // Make Stop button fully visible since it's now functional
        const polarStopButton = document.getElementById('polar-stop-animation');
        if (polarStopButton) {
            polarStopButton.style.opacity = '1';
            polarStopButton.style.background = '#2A3F5A';
        }
        
        // Disable step buttons when animating
        const stepBackBtn = document.getElementById('polar-step-back');
        const stepForwardBtn = document.getElementById('polar-step-forward');
        if (stepBackBtn) {
            stepBackBtn.disabled = true;
            stepBackBtn.style.opacity = '0.6';
            stepBackBtn.style.background = '#1a2a3f';
        }
        if (stepForwardBtn) {
            stepForwardBtn.disabled = true;
            stepForwardBtn.style.opacity = '0.6';
            stepForwardBtn.style.background = '#1a2a3f';
        }
        
        // Disable angle mode toggle during animation
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            angleModeToggle.disabled = true;
            angleModeToggle.style.opacity = '0.6';
            angleModeToggle.style.background = '#1a2a3f';
            angleModeToggle.style.cursor = 'not-allowed';
        }
        
        // Only initialize if starting fresh (not resuming from pause)
        if (this.polarAnimation.currentTheta === 0 || this.polarAnimation.currentTheta >= this.polarAnimation.storedThetaMax) {
            this.polarAnimation.storedThetaMax = this.polarSettings.thetaMax;
            
            // Start currentTheta slightly ahead of thetaMin to show initial curve
            const thetaRange = this.polarSettings.thetaMax - this.polarSettings.thetaMin;
            const initialOffset = Math.min(thetaRange * 0.01, 0.1); // 1% of range or 0.1, whichever is smaller
            this.polarAnimation.currentTheta = this.polarSettings.thetaMin + initialOffset;
            
            // Set initial thetaMax for first render
            this.polarSettings.thetaMax = this.polarAnimation.currentTheta;
            
            // Do initial plot to show starting position
            this.replotAllPolarFunctions();
        }
        // If resuming from pause, currentTheta and thetaMax are already set correctly
        
        this.polarAnimation.lastTimestamp = 0; // Reset timestamp for smooth resumption
        
        // Start the animation loop with requestAnimationFrame
        this.polarAnimation.animationFrameId = requestAnimationFrame((ts) => this.animatePolarFunctions(ts));
    }

    pausePolarAnimation() {
        if (!this.polarAnimation.isAnimating) return;
        
        this.polarAnimation.isAnimating = false;
        this.polarAnimation.isPaused = true;
        
        // Keep Stop button fully visible since it's still functional when paused
        const polarStopButton = document.getElementById('polar-stop-animation');
        if (polarStopButton) {
            polarStopButton.style.opacity = '1';
            polarStopButton.style.background = '#2A3F5A';
        }
        
        // Enable step buttons when paused
        const stepBackBtn = document.getElementById('polar-step-back');
        const stepForwardBtn = document.getElementById('polar-step-forward');
        if (stepBackBtn) {
            stepBackBtn.disabled = false;
            stepBackBtn.style.opacity = '1';
            stepBackBtn.style.background = '#2A3F5A';
        }
        if (stepForwardBtn) {
            stepForwardBtn.disabled = false;
            stepForwardBtn.style.opacity = '1';
            stepForwardBtn.style.background = '#2A3F5A';
        }
        
        // Keep angle mode toggle disabled when paused (stays darkened)
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            angleModeToggle.disabled = true;
            angleModeToggle.style.opacity = '0.6';
            angleModeToggle.style.background = '#1a2a3f';
            angleModeToggle.style.cursor = 'not-allowed';
        }
        
        // Cancel animation frame if active
        if (this.polarAnimation.animationFrameId) {
            cancelAnimationFrame(this.polarAnimation.animationFrameId);
            this.polarAnimation.animationFrameId = null;
        }
        
        // Keep currentTheta where it is - don't restore full range
        // This allows resuming from the paused position
    }

    stopPolarAnimation() {
        // Allow stopping from both animating and paused states
        if (!this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) return;
        
        this.polarAnimation.isAnimating = false;
        this.polarAnimation.isPaused = false;
        
        // Update play/pause button to show Play state
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const playPauseText = document.getElementById('play-pause-text');
        if (playIcon && pauseIcon && playPauseText) {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            playPauseText.textContent = 'Play';
        }
        
        // Dim Stop button (inactive state)
        const stopBtn = document.getElementById('polar-stop-animation');
        if (stopBtn) {
            stopBtn.style.opacity = '0.6';
            stopBtn.style.background = '#1a2a3f';
        }
        
        // Disable step buttons when stopped
        const stepBackBtn = document.getElementById('polar-step-back');
        const stepForwardBtn = document.getElementById('polar-step-forward');
        if (stepBackBtn) {
            stepBackBtn.disabled = true;
            stepBackBtn.style.opacity = '0.6';
            stepBackBtn.style.background = '#1a2a3f';
        }
        if (stepForwardBtn) {
            stepForwardBtn.disabled = true;
            stepForwardBtn.style.opacity = '0.6';
            stepForwardBtn.style.background = '#1a2a3f';
        }
        
        // Re-enable angle mode toggle only if in cartesian mode (polar mode always keeps it disabled)
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            if (this.plotMode === 'cartesian') {
                angleModeToggle.disabled = false;
                angleModeToggle.style.opacity = '1';
                angleModeToggle.style.background = '#2A3F5A';
                angleModeToggle.style.cursor = 'pointer';
            } else {
                // Keep disabled in polar mode
                angleModeToggle.disabled = true;
                angleModeToggle.style.opacity = '0.6';
                angleModeToggle.style.background = '#1a2a3f';
                angleModeToggle.style.cursor = 'not-allowed';
            }
        }
        
        // Cancel animation frame if active
        if (this.polarAnimation.animationFrameId) {
            cancelAnimationFrame(this.polarAnimation.animationFrameId);
            this.polarAnimation.animationFrameId = null;
        }
        
        // Restore original thetaMax
        this.polarSettings.thetaMax = this.polarAnimation.storedThetaMax;
        
        // Update UI inputs to show the restored original value (prevents accumulated error display)
        const thetaMaxInput = document.getElementById('theta-max');
        if (thetaMaxInput && this.polarAnimation.storedThetaMax !== 0) {
            // Use the stored LaTeX value if available, otherwise format the numeric value
            if (this.polarSettings.thetaMaxLatex) {
                this.setRangeValue(thetaMaxInput, this.polarSettings.thetaMaxLatex);
            } else {
                // Format based on angle mode
                if (this.angleMode === 'degrees') {
                    this.setRangeValue(thetaMaxInput, this.polarSettings.thetaMax.toFixed(2));
                } else {
                    // Check for common pi multiples
                    if (Math.abs(this.polarSettings.thetaMax - 2 * Math.PI) < 0.0001) {
                        this.setRangeValue(thetaMaxInput, '2\\pi');
                    } else {
                        this.setRangeValue(thetaMaxInput, this.polarSettings.thetaMax.toFixed(6));
                    }
                }
            }
        }
        
        // Reset animation state so next play starts fresh
        this.polarAnimation.currentTheta = 0;
        this.polarAnimation.storedThetaMax = 0;
        
        // Replot all functions with full range and re-enable badge calculations
        this.replotAllPolarFunctions();
    }

    stepPolarAnimationForward() {
        // Only allow stepping when paused
        if (!this.polarAnimation.isPaused) return;
        
        // Calculate step size based on the full theta range
        const thetaRange = this.polarAnimation.storedThetaMax - this.polarSettings.thetaMin;
        const stepSize = thetaRange * 0.02; // 2% of total range per step
        
        // Move forward one step
        this.polarAnimation.currentTheta = Math.min(
            this.polarAnimation.currentTheta + stepSize,
            this.polarAnimation.storedThetaMax
        );
        
        // Update thetaMax for plotting
        this.polarSettings.thetaMax = this.polarAnimation.currentTheta;
        
        // Replot with new position
        this.replotAllPolarFunctions();
    }

    stepPolarAnimationBackward() {
        // Only allow stepping when paused
        if (!this.polarAnimation.isPaused) return;
        
        // Calculate step size based on the full theta range
        const thetaRange = this.polarAnimation.storedThetaMax - this.polarSettings.thetaMin;
        const stepSize = thetaRange * 0.02; // 2% of total range per step
        
        // Move backward one step, but not before thetaMin
        this.polarAnimation.currentTheta = Math.max(
            this.polarAnimation.currentTheta - stepSize,
            this.polarSettings.thetaMin
        );
        
        // Update thetaMax for plotting
        this.polarSettings.thetaMax = this.polarAnimation.currentTheta;
        
        // Replot with new position
        this.replotAllPolarFunctions();
    }

    resetPolarAnimation() {
        const wasAnimating = this.polarAnimation.isAnimating;
        
        // Stop animation if running (clears both isAnimating and isPaused)
        if (wasAnimating || this.polarAnimation.isPaused) {
            this.stopPolarAnimation();
        }
        
        // Reset to start position with small initial offset for visibility
        const thetaRange = this.polarAnimation.storedThetaMax - this.polarSettings.thetaMin;
        const initialOffset = Math.min(thetaRange * 0.01, 0.1);
        this.polarAnimation.currentTheta = this.polarSettings.thetaMin + initialOffset;
        this.polarSettings.thetaMax = this.polarAnimation.currentTheta;
        
        // Replot to show reset state
        this.replotAllPolarFunctions();
        
        // Restart if was animating
        if (wasAnimating) {
            this.startPolarAnimation();
        }
    }

    animatePolarFunctions(timestamp) {
        if (!this.polarAnimation.isAnimating) return;
        
        // Initialize timestamp on first frame
        if (this.polarAnimation.lastTimestamp === 0) {
            this.polarAnimation.lastTimestamp = timestamp;
            // Request next frame to start actual animation
            this.polarAnimation.animationFrameId = requestAnimationFrame((ts) => this.animatePolarFunctions(ts));
            return;
        }
        
        // Calculate time delta for smooth animation
        const deltaTime = timestamp - this.polarAnimation.lastTimestamp;
        this.polarAnimation.lastTimestamp = timestamp;
        
        // Calculate theta increment based on speed and time
        // Base speed: complete animation in ~3 seconds at 1x speed
        // Normalize to degrees for consistent speed across angle modes
        const thetaRange = this.polarAnimation.storedThetaMax - this.polarSettings.thetaMin;
        const normalizedRange = this.angleMode === 'radians' ? thetaRange * (180 / Math.PI) : thetaRange;
        const baseIncrement = (normalizedRange / 3000) * deltaTime; // theta per millisecond (normalized to degrees)
        const normalizedIncrement = baseIncrement * this.polarAnimation.animationSpeed;
        // Convert back to radians if needed
        const increment = this.angleMode === 'radians' ? normalizedIncrement * (Math.PI / 180) : normalizedIncrement;
        
        // Update current theta
        this.polarAnimation.currentTheta += increment;
        
        // Clamp to prevent overshoot beyond storedThetaMax (prevents floating-point accumulation)
        if (this.polarAnimation.currentTheta > this.polarAnimation.storedThetaMax) {
            this.polarAnimation.currentTheta = this.polarAnimation.storedThetaMax;
        }
        
        // Check if animation is complete
        if (this.polarAnimation.currentTheta >= this.polarAnimation.storedThetaMax) {
            if (this.polarAnimation.shouldLoop) {
                // Loop: reset to start - use EXACT thetaMin value to prevent drift
                this.polarAnimation.currentTheta = this.polarSettings.thetaMin;
                // Don't update storedThetaMax - keep it at the original value
            } else {
                // Stop at end - ensure we're at exact storedThetaMax
                this.polarAnimation.currentTheta = this.polarAnimation.storedThetaMax;
                this.polarSettings.thetaMax = this.polarAnimation.storedThetaMax; // Restore original value
                this.stopPolarAnimation();
                
                // Update UI to show play state
                const playIcon = document.getElementById('play-icon');
                const pauseIcon = document.getElementById('pause-icon');
                const playPauseText = document.getElementById('play-pause-text');
                const polarStopButton = document.getElementById('polar-stop-animation');
                if (playIcon && pauseIcon && playPauseText) {
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                    playPauseText.textContent = 'Play';
                }
                // Dim Stop button since animation is now stopped
                if (polarStopButton) {
                    polarStopButton.style.opacity = '0.6';
                    polarStopButton.style.background = '#1a2a3f';
                }
                return;
            }
        }
        
        // Update thetaMax for plotting
        this.polarSettings.thetaMax = this.polarAnimation.currentTheta;
        
        // Replot all polar functions with current animated thetaMax
        this.replotAllPolarFunctions();
        
        // Continue animation
        this.polarAnimation.animationFrameId = requestAnimationFrame((ts) => this.animatePolarFunctions(ts));
    }

    replotAllPolarFunctions() {
        // Replot only polar functions
        const polarFunctions = this.polarFunctions.filter(func => func.enabled);
        
        polarFunctions.forEach(func => {
            this.plotFunction(func);
        });
        
        // Redraw canvas
        this.draw();
    }

    // ================================
    // FUNCTION TYPE DETECTION METHODS
    // ================================

    detectFunctionType(expression) {
        // Convert from LaTeX first since we now store LaTeX format
        const clean = this.convertFromLatex(expression).trim();
        
        // Check for equals sign first
        if (!clean.includes('=')) {
            return 'explicit'; // f(x) format - assume explicit
        }
        
        // Check for theta = constant (polar ray) in polar mode
        if (this.plotMode === 'polar') {
            // Match t= or theta= or θ=
            const thetaMatch = clean.match(/^(θ|theta|t)\s*=\s*(.+)$/i);
            if (thetaMatch) {
                // Check if right side is a constant expression (no theta or t variable)
                const rightSide = thetaMatch[2].trim().toLowerCase();
                
                // Check if there's 'theta' in the right side
                const hasTheta = /theta/.test(rightSide);
                
                // Check if there's a standalone 't' (not part of another word)
                // First remove 'theta' to avoid matching 't' inside it
                const withoutTheta = rightSide.replace(/theta/g, '');
                const hasT = /\bt\b/.test(withoutTheta);
                
                if (!hasT && !hasTheta) {
                    return 'theta-constant';
                }
            }
        }
        
        // Has equals sign - analyze the equation
        if (clean.toLowerCase().startsWith('y=')) {
            // For y= expressions, check if y appears on the right side too
            const rightSide = clean.substring(2).trim(); // Remove 'y=' prefix
            if (/y/.test(rightSide)) {
                return 'implicit'; // y=f(x,y) format - implicit relationship
            } else {
                return 'explicit'; // y=f(x) format - explicit function
            }
        }
        
        // General case: check for variables
        const hasY = /y/.test(clean); // Contains 'y' variable anywhere
        const hasX = /x/.test(clean); // Contains 'x' variable anywhere
        
        if (hasX && hasY) {
            return 'implicit'; // f(x,y) = g(x,y) format
        }
        
        // Special cases: equations with only x or only y should also be implicit
        if (hasX || hasY) {
            return 'implicit'; // Examples: x=1, y^2=1, x^2=4, etc.
        }
        
        return 'explicit'; // Default fallback (could be parametric or other)
    }

    // ================================
    // IMPLICIT FUNCTION PLOTTING METHODS
    // ================================

    async plotImplicitFunction(func, highResForIntersections = false, immediate = false) {
        try {
            // Register this calculation and update debug overlay
            const calculationId = ++this.implicitCalculationId;
            this.currentImplicitCalculations.set(func.id, calculationId);
            this.activeImplicitCalculations.add(func.id);
            
            let points = [];
            
            // Parse the implicit equation f(x,y) = g(x,y) into f(x,y) - g(x,y) = 0
            const equation = this.parseImplicitEquation(func.expression);
            
            if (!equation) {
                console.warn('Could not parse implicit equation:', func.expression);
                // Don't clear existing points - keep them visible
                this.activeImplicitCalculations.delete(func.id);
                return;
            }
            
            // Check if calculation was cancelled before starting heavy computation
            if (this.isCalculationCancelled(func.id, calculationId)) {
                this.activeImplicitCalculations.delete(func.id);
                // Don't clear existing points - keep them visible during cancellation
                return;
            }
            
            if (highResForIntersections) {
                points = await this.marchingSquaresHighResAsync(equation, immediate, func.id, calculationId);
            } else {
                points = await this.marchingSquaresAsync(equation, immediate, func.id, calculationId);
            }
            
            // Final cancellation check before setting results
            if (this.isCalculationCancelled(func.id, calculationId)) {
                this.activeImplicitCalculations.delete(func.id);
                // Don't clear existing points - keep them visible during cancellation
                return;
            }
            
            // Double-buffering: Calculate into working buffer, then atomically swap to display buffer
            // This eliminates race conditions and ensures stable display during viewport changes
            const oldCount = func.displayPoints?.length || 0;
            func.calculatingPoints = points;
            func.displayPoints = func.calculatingPoints;
            func.calculatingPoints = null;
            
            // Also update func.points for backward compatibility (intersections, etc.)
            func.points = points;
            
            this.activeImplicitCalculations.delete(func.id);
            
            // Track plotting time for performance monitoring
            if (this.performance.enabled) {
                const elapsed = performance.now() - startTime;
                this.performance.plotTimes.set(func.id, elapsed);
            }
            
        } catch (error) {
            console.error('Error plotting implicit function:', error);
            // Don't clear existing points on error - keep them visible
            this.activeImplicitCalculations.delete(func.id);
        }
    }

    isCircleEquation(expr) {
        // Check for patterns like x^2+y^2=r^2 or (x-h)^2+(y-k)^2=r^2
        return /x\^?2\+y\^?2=/.test(expr) || /\(x[-+]/.test(expr) && /\(y[-+]/.test(expr);
    }
    
    isEllipseEquation(expr) {
        // Check for patterns like x^2/a^2+y^2/b^2=1 or (x^2)/(4)+(y^2)/(9)=1
        // Handle both simple fractions and parenthesized forms
        const patterns = [
            /x\^?2\/\d+(\.\d+)?\+y\^?2\/\d+(\.\d+)?\s*=\s*1/, // x^2/4+y^2/9=1
            /\(x\^?2\)\/\(\d+(\.\d+)?\)\+\(y\^?2\)\/\(\d+(\.\d+)?\)\s*=\s*1/ // (x^2)/(4)+(y^2)/(9)=1
        ];
        return patterns.some(p => p.test(expr));
    }
    
    isParabolaEquation(expr) {
        // Check for patterns like y=ax^2+bx+c, x=ay^2+by+c, y^2=4px, x^2=4py
        const patterns = [
            /y\^?2\s*=.*x/, // y^2 = ...x
            /x\^?2\s*=.*y/  // x^2 = ...y
        ];
        return patterns.some(p => p.test(expr));
    }
    
    isHyperbolaEquation(expr) {
        // Check for patterns like x^2/a^2-y^2/b^2=1 or y^2/b^2-x^2/a^2=1
        // Handle both simple fractions and parenthesized forms
        const patterns = [
            /x\^?2\/\d+(\.\d+)?[-−]y\^?2\/\d+(\.\d+)?\s*=\s*1/, // x^2/4-y^2/9=1
            /y\^?2\/\d+(\.\d+)?[-−]x\^?2\/\d+(\.\d+)?\s*=\s*1/, // y^2/9-x^2/4=1
            /\(x\^?2\)\/\(\d+(\.\d+)?\)[-−]\(y\^?2\)\/\(\d+(\.\d+)?\)\s*=\s*1/, // (x^2)/(4)-(y^2)/(9)=1
            /\(y\^?2\)\/\(\d+(\.\d+)?\)[-−]\(x\^?2\)\/\(\d+(\.\d+)?\)\s*=\s*1/  // (y^2)/(9)-(x^2)/(4)=1
        ];
        return patterns.some(p => p.test(expr));
    }
    
    plotCircle(expr) {
        const points = [];
        
        // Extract radius from expressions like x^2+y^2=4 (radius = 2)
        let radius = 1;
        let centerX = 0;
        let centerY = 0;
        
        const match = expr.match(/x\^?2\+y\^?2=(\d+(?:\.\d+)?)/);
        if (match) {
            radius = Math.sqrt(parseFloat(match[1]));
        }
        
        // Use parametric equations for perfect circle
        const numPoints = 360; // One point per degree for smooth circle
        for (let i = 0; i < numPoints; i++) {
            const angle = (i * 2 * Math.PI) / numPoints;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            // Only include points within viewport
            if (x >= this.viewport.minX && x <= this.viewport.maxX &&
                y >= this.viewport.minY && y <= this.viewport.maxY) {
                points.push({ x: x, y: y, connected: true });
            }
        }
        
        return points;
    }
    
    plotEllipse(expr) {
        const points = [];
        
        // Extract a and b from expressions like x^2/4+y^2/9=1 or (x^2)/(4)+(y^2)/(9)=1
        let a = 1; // semi-major axis
        let b = 1; // semi-minor axis
        let centerX = 0;
        let centerY = 0;
        
        // Try both simple and parenthesized patterns
        let match = expr.match(/x\^?2\/(\d+(?:\.\d+)?)\+y\^?2\/(\d+(?:\.\d+)?)\s*=\s*1/);
        if (!match) {
            match = expr.match(/\(x\^?2\)\/\((\d+(?:\.\d+)?)\)\+\(y\^?2\)\/\((\d+(?:\.\d+)?)\)\s*=\s*1/);
        }
        
        if (match) {
            a = Math.sqrt(parseFloat(match[1]));
            b = Math.sqrt(parseFloat(match[2]));
        }
        
        // Use parametric equations for perfect ellipse: x = a*cos(t), y = b*sin(t)
        const numPoints = 360;
        for (let i = 0; i < numPoints; i++) {
            const t = (i * 2 * Math.PI) / numPoints;
            const x = centerX + a * Math.cos(t);
            const y = centerY + b * Math.sin(t);
            
            // Only include points within viewport
            if (x >= this.viewport.minX && x <= this.viewport.maxX &&
                y >= this.viewport.minY && y <= this.viewport.maxY) {
                points.push({ x: x, y: y, connected: true });
            }
        }
        
        return points;
    }
    
    plotParabola(expr) {
        const points = [];
        
        // Determine orientation and parameters
        if (/y\^?2=/.test(expr)) {
            // Horizontal parabola: y^2 = 4px or y^2 = ax
            let p = 1;
            const match = expr.match(/y\^?2\s*=\s*(\d+(?:\.\d+)?)\*?x/);
            if (match) {
                p = parseFloat(match[1]) / 4; // Convert from y^2=4px to parameter p
            }
            
            // Parametric: x = pt^2, y = 2pt
            const tRange = 6; // Range of parameter t
            const numPoints = 200;
            for (let i = -numPoints; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const x = p * t * t;
                const y = 2 * p * t;
                
                if (x >= this.viewport.minX && x <= this.viewport.maxX &&
                    y >= this.viewport.minY && y <= this.viewport.maxY) {
                    points.push({ x: x, y: y, connected: true });
                }
            }
        } else if (/x\^?2=/.test(expr)) {
            // Vertical parabola: x^2 = 4py or x^2 = ay
            let p = 1;
            const match = expr.match(/x\^?2\s*=\s*(\d+(?:\.\d+)?)\*?y/);
            if (match) {
                p = parseFloat(match[1]) / 4;
            }
            
            // Parametric: x = 2pt, y = pt^2
            const tRange = 6;
            const numPoints = 200;
            for (let i = -numPoints; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const x = 2 * p * t;
                const y = p * t * t;
                
                if (x >= this.viewport.minX && x <= this.viewport.maxX &&
                    y >= this.viewport.minY && y <= this.viewport.maxY) {
                    points.push({ x: x, y: y, connected: true });
                }
            }
        }
        
        return points;
    }
    
    plotHyperbola(expr) {
        const points = [];
        
        // Extract a and b from expressions like x^2/4-y^2/9=1 or y^2/9-x^2/4=1
        let a = 1;
        let b = 1;
        let xHyperbola = true; // true for x^2/a^2-y^2/b^2=1, false for y^2/b^2-x^2/a^2=1
        
        const xMatch = expr.match(/x\^?2\/(\d+(?:\.\d+)?)[-−]y\^?2\/(\d+(?:\.\d+)?)\s*=\s*1/) ||
                       expr.match(/\(x\^?2\)\/\((\d+(?:\.\d+)?)\)[-−]\(y\^?2\)\/\((\d+(?:\.\d+)?)\)\s*=\s*1/);
        const yMatch = expr.match(/y\^?2\/(\d+(?:\.\d+)?)[-−]x\^?2\/(\d+(?:\.\d+)?)\s*=\s*1/) ||
                       expr.match(/\(y\^?2\)\/\((\d+(?:\.\d+)?)\)[-−]\(x\^?2\)\/\((\d+(?:\.\d+)?)\)\s*=\s*1/);
        
        if (xMatch) {
            a = Math.sqrt(parseFloat(xMatch[1]));
            b = Math.sqrt(parseFloat(xMatch[2]));
            xHyperbola = true;
        } else if (yMatch) {
            b = Math.sqrt(parseFloat(yMatch[1]));
            a = Math.sqrt(parseFloat(yMatch[2]));
            xHyperbola = false;
        }
        
        const numPoints = 150;
        const tRange = 3; // Range for hyperbolic parameter
        
        if (xHyperbola) {
            // x^2/a^2 - y^2/b^2 = 1: x = ±a*cosh(t), y = b*sinh(t)
            
            // Right branch (positive x)
            for (let i = 0; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const x = a * Math.cosh(t);
                const yPos = b * Math.sinh(t);
                const yNeg = -b * Math.sinh(t);
                
                if (x >= this.viewport.minX && x <= this.viewport.maxX) {
                    if (yPos >= this.viewport.minY && yPos <= this.viewport.maxY) {
                        points.push({ x: x, y: yPos, connected: true, branch: 'right-pos' });
                    }
                    if (yNeg >= this.viewport.minY && yNeg <= this.viewport.maxY) {
                        points.push({ x: x, y: yNeg, connected: true, branch: 'right-neg' });
                    }
                }
            }
            
            // Left branch (negative x)
            for (let i = 0; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const x = -a * Math.cosh(t);
                const yPos = b * Math.sinh(t);
                const yNeg = -b * Math.sinh(t);
                
                if (x >= this.viewport.minX && x <= this.viewport.maxX) {
                    if (yPos >= this.viewport.minY && yPos <= this.viewport.maxY) {
                        points.push({ x: x, y: yPos, connected: true, branch: 'left-pos' });
                    }
                    if (yNeg >= this.viewport.minY && yNeg <= this.viewport.maxY) {
                        points.push({ x: x, y: yNeg, connected: true, branch: 'left-neg' });
                    }
                }
            }
        } else {
            // y^2/b^2 - x^2/a^2 = 1: y = ±b*cosh(t), x = a*sinh(t)
            
            // Top branch (positive y)
            for (let i = 0; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const y = b * Math.cosh(t);
                const xPos = a * Math.sinh(t);
                const xNeg = -a * Math.sinh(t);
                
                if (y >= this.viewport.minY && y <= this.viewport.maxY) {
                    if (xPos >= this.viewport.minX && xPos <= this.viewport.maxX) {
                        points.push({ x: xPos, y: y, connected: true, branch: 'top-pos' });
                    }
                    if (xNeg >= this.viewport.minX && xNeg <= this.viewport.maxX) {
                        points.push({ x: xNeg, y: y, connected: true, branch: 'top-neg' });
                    }
                }
            }
            
            // Bottom branch (negative y)
            for (let i = 0; i <= numPoints; i++) {
                const t = (i * tRange) / numPoints;
                const y = -b * Math.cosh(t);
                const xPos = a * Math.sinh(t);
                const xNeg = -a * Math.sinh(t);
                
                if (y >= this.viewport.minY && y <= this.viewport.maxY) {
                    if (xPos >= this.viewport.minX && xPos <= this.viewport.maxX) {
                        points.push({ x: xPos, y: y, connected: true, branch: 'bottom-pos' });
                    }
                    if (xNeg >= this.viewport.minX && xNeg <= this.viewport.maxX) {
                        points.push({ x: xNeg, y: y, connected: true, branch: 'bottom-neg' });
                    }
                }
            }
        }
        
        return points;
    }
    
    plotGeneralImplicit(equation) {
        // Use marching squares algorithm for better curve detection
        return this.marchingSquares(equation);
    }
    
    marchingSquares(equation) {
        const segments = [];
        const viewportWidth = this.viewport.maxX - this.viewport.minX;
        const viewportHeight = this.viewport.maxY - this.viewport.minY;
        
        // Balanced resolution scaling - performance vs quality
        const viewportSize = Math.max(viewportWidth, viewportHeight);
        
        // Improved resolution scaling for smoother curves - matching async version
        // Higher minimum resolution to ensure curves don't disappear at any zoom level
        let resolution;
        if (viewportSize > 100) {
            // Extremely zoomed out - good base quality
            resolution = 120;
        } else if (viewportSize > 50) {
            // Very zoomed out - high base quality
            resolution = 140;
        } else if (viewportSize > 20) {
            // Normal zoom - very high quality
            resolution = 160;
        } else if (viewportSize > 10) {
            // Zoomed in - higher detail
            resolution = 180;
        } else if (viewportSize > 5) {
            // Very zoomed in - excellent detail
            resolution = 200;
        } else if (viewportSize > 2) {
            // Extremely zoomed in - high detail for busy regions
            resolution = 240;
        } else if (viewportSize > 1) {
            // Very close - very high detail
            resolution = 300;
        } else if (viewportSize > 0.5) {
            // Ultra close - maximum detail for sharp features
            resolution = 360;
        } else {
            // Extreme magnification - ultra-high detail
            resolution = 420;
        }
        
        const stepX = viewportWidth / resolution;
        const stepY = viewportHeight / resolution;
        
        return this.marchingSquaresAtResolution(equation, resolution, stepX, stepY);
    }

    async marchingSquaresAsync(equation, immediate = false, functionId = null, calculationId = null) {
        const segments = [];
        const viewportWidth = this.viewport.maxX - this.viewport.minX;
        const viewportHeight = this.viewport.maxY - this.viewport.minY;
        
        // Optimized resolution scaling - constant grid density regardless of zoom
        // Use a fixed resolution that provides good quality without performance penalty
        const viewportSize = Math.max(viewportWidth, viewportHeight);
        
        // Fixed resolution for better performance - marching squares quality doesn't need
        // to increase when zoomed in since we're looking at the same level of detail
        let resolution;
        if (viewportSize > 100) {
            // Extremely zoomed out - use moderate resolution
            resolution = 100;
        } else if (viewportSize > 50) {
            // Very zoomed out
            resolution = 110;
        } else if (viewportSize > 20) {
            // Normal zoom - balanced quality/performance
            resolution = 120;
        } else {
            // Zoomed in - maintain same resolution for consistent performance
            // The physical grid density increases naturally as viewport shrinks
            resolution = 120;
        }
        
        const stepX = viewportWidth / resolution;
        const stepY = viewportHeight / resolution;
        
        return await this.marchingSquaresAtResolutionAsync(equation, resolution, stepX, stepY, immediate, functionId, calculationId);
    }

    marchingSquaresHighRes(equation) {
        // Fixed high resolution for intersection detection - ignores zoom level
        const viewportWidth = this.viewport.maxX - this.viewport.minX;
        const viewportHeight = this.viewport.maxY - this.viewport.minY;
        
        // Use fixed high resolution for consistent intersection detection
        const resolution = 150; // High resolution regardless of zoom
        const stepX = viewportWidth / resolution;
        const stepY = viewportHeight / resolution;
        
        return this.marchingSquaresAtResolution(equation, resolution, stepX, stepY);
    }

    async marchingSquaresHighResAsync(equation, immediate = false, functionId = null, calculationId = null) {
        // Fixed high resolution for intersection detection - ignores zoom level
        const viewportWidth = this.viewport.maxX - this.viewport.minX;
        const viewportHeight = this.viewport.maxY - this.viewport.minY;
        
        // Use fixed high resolution for consistent intersection detection
        const resolution = 150; // High resolution regardless of zoom
        const stepX = viewportWidth / resolution;
        const stepY = viewportHeight / resolution;
        
        return await this.marchingSquaresAtResolutionAsync(equation, resolution, stepX, stepY, immediate, functionId, calculationId);
    }

    marchingSquaresAtResolution(equation, resolution, stepX, stepY) {
        const segments = [];
        
        // Compile expressions once for performance
        // Expressions are already processed by parseImplicitEquation
        const leftCompiled = this.getCompiledExpression(equation.leftExpression);
        const rightCompiled = this.getCompiledExpression(equation.rightExpression);
        
        // Create scope once and reuse it
        const scope = this.getEvaluationScope({ x: 0, y: 0, pi: Math.PI, e: Math.E });
        
        // Create grid of function values
        const grid = [];
        for (let i = 0; i <= resolution; i++) {
            grid[i] = [];
            for (let j = 0; j <= resolution; j++) {
                const x = this.viewport.minX + i * stepX;
                const y = this.viewport.minY + j * stepY;
                
                // Update scope and evaluate using compiled expressions
                scope.x = x;
                scope.y = y;
                try {
                    const leftValue = leftCompiled.evaluate(scope);
                    const rightValue = rightCompiled.evaluate(scope);
                    grid[i][j] = (leftValue !== null && rightValue !== null) ? (leftValue - rightValue) : 0;
                } catch (error) {
                    grid[i][j] = 0;
                }
            }
        }
        
        // Process each cell for marching squares
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const x = this.viewport.minX + i * stepX;
                const y = this.viewport.minY + j * stepY;
                
                // Get the four corner values
                const corners = [
                    grid[i][j],     // bottom-left
                    grid[i+1][j],   // bottom-right
                    grid[i+1][j+1], // top-right
                    grid[i][j+1]    // top-left
                ];
                
                // Create binary configuration (1 if positive, 0 if negative)
                let config = 0;
                for (let k = 0; k < 4; k++) {
                    if (corners[k] > 0) config |= (1 << k);
                }
                
                // Get line segments for this configuration
                const cellSegments = this.getMarchingSquaresSegments(config, corners, x, y, stepX, stepY);
                segments.push(...cellSegments);
            }
        }
        
        // Convert segments to points format
        const points = [];
        for (const segment of segments) {
            points.push({ x: segment.start.x, y: segment.start.y, connected: true });
            points.push({ x: segment.end.x, y: segment.end.y, connected: true });
            // Add break between segments to prevent unwanted connections
            points.push({ x: NaN, y: NaN, connected: false });
        }
        
        return points;
    }
    
    getMarchingSquaresSegments(config, corners, x, y, stepX, stepY) {
        const segments = [];
        
        // Edge interpolation points (linear interpolation for zero crossings)
        const getEdgePoint = (edge, v1, v2) => {
            const t = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2));
            switch(edge) {
                case 0: return { x: x + t * stepX, y: y }; // bottom edge
                case 1: return { x: x + stepX, y: y + t * stepY }; // right edge  
                case 2: return { x: x + (1-t) * stepX, y: y + stepY }; // top edge
                case 3: return { x: x, y: y + (1-t) * stepY }; // left edge
            }
        };
        
        // Marching squares lookup table - defines which edges to connect for each configuration
        const marchingSquaresTable = {
            0: [], // no contour
            1: [[3, 0]], // bottom-left corner
            2: [[0, 1]], // bottom-right corner
            3: [[3, 1]], // bottom edge
            4: [[1, 2]], // top-right corner
            5: [[3, 0], [1, 2]], // saddle case
            6: [[0, 2]], // right edge
            7: [[3, 2]], // everything except top-left
            8: [[2, 3]], // top-left corner
            9: [[0, 2]], // left edge
            10: [[0, 1], [2, 3]], // saddle case
            11: [[1, 2]], // everything except top-right
            12: [[1, 3]], // top edge
            13: [[0, 1]], // everything except bottom-right
            14: [[0, 3]], // everything except bottom-left
            15: [] // full contour (no line)
        };
        
        const edgeConnections = marchingSquaresTable[config] || [];
        
        for (const [edge1, edge2] of edgeConnections) {
            // Only create segment if there's actually a zero crossing on both edges
            const v1_1 = corners[edge1];
            const v1_2 = corners[(edge1 + 1) % 4];
            const v2_1 = corners[edge2];
            const v2_2 = corners[(edge2 + 1) % 4];
            
            if (v1_1 * v1_2 <= 0 && v2_1 * v2_2 <= 0) {
                const start = getEdgePoint(edge1, v1_1, v1_2);
                const end = getEdgePoint(edge2, v2_1, v2_2);
                segments.push({ start, end });
            }
        }
        
        return segments;
    }

    async marchingSquaresAtResolutionAsync(equation, resolution, stepX, stepY, immediate = false, functionId = null, calculationId = null) {
        const startTime = performance.now();
        const segments = [];
        
        // Compile expressions once for performance - avoid recompiling for each grid point
        // Expressions are already processed by parseImplicitEquation
        const leftCompiled = this.getCompiledExpression(equation.leftExpression);
        const rightCompiled = this.getCompiledExpression(equation.rightExpression);
        
        // Create scope once and reuse it
        const scope = this.getEvaluationScope({ x: 0, y: 0, pi: Math.PI, e: Math.E });
        
        // Create grid of function values
        const grid = [];
        
        // Process grid creation in chunks to prevent blocking
        const chunkSize = 5; // Process 5 rows at a time for better responsiveness
        
        for (let chunkStart = 0; chunkStart <= resolution; chunkStart += chunkSize) {
            // Check for cancellation before each chunk
            if (functionId && calculationId && this.isCalculationCancelled(functionId, calculationId)) {
                return []; // Return empty array if cancelled
            }
            
            const chunkEnd = Math.min(chunkStart + chunkSize, resolution + 1);
            
            for (let i = chunkStart; i < chunkEnd; i++) {
                grid[i] = [];
                for (let j = 0; j <= resolution; j++) {
                    const x = this.viewport.minX + i * stepX;
                    const y = this.viewport.minY + j * stepY;
                    
                    // Update scope and evaluate using compiled expressions
                    scope.x = x;
                    scope.y = y;
                    try {
                        const leftValue = leftCompiled.evaluate(scope);
                        const rightValue = rightCompiled.evaluate(scope);
                        grid[i][j] = (leftValue !== null && rightValue !== null) ? (leftValue - rightValue) : 0;
                    } catch (error) {
                        grid[i][j] = 0;
                    }
                }
            }
            
            // No setTimeout needed - fast enough without yielding
        }
        
        // Process each cell for marching squares in chunks
        for (let chunkStart = 0; chunkStart < resolution; chunkStart += chunkSize) {
            // Check for cancellation before each chunk
            if (functionId && calculationId && this.isCalculationCancelled(functionId, calculationId)) {
                return []; // Return empty array if cancelled
            }
            
            const chunkEnd = Math.min(chunkStart + chunkSize, resolution);
            
            for (let i = chunkStart; i < chunkEnd; i++) {
                for (let j = 0; j < resolution; j++) {
                    const x = this.viewport.minX + i * stepX;
                    const y = this.viewport.minY + j * stepY;
                    
                    // Get the four corner values
                    const corners = [
                        grid[i][j],     // bottom-left
                        grid[i+1][j],   // bottom-right
                        grid[i+1][j+1], // top-right
                        grid[i][j+1]    // top-left
                    ];
                    
                    // Create binary configuration (1 if positive, 0 if negative)
                    let config = 0;
                    for (let k = 0; k < 4; k++) {
                        if (corners[k] > 0) config |= (1 << k);
                    }
                    
                    // Get line segments for this configuration
                    const cellSegments = this.getMarchingSquaresSegments(config, corners, x, y, stepX, stepY);
                    segments.push(...cellSegments);
                }
            }
            
            // No setTimeout needed - fast enough without yielding
        }
        
        // Convert segments to points format
        const points = [];
        for (const segment of segments) {
            points.push({ x: segment.start.x, y: segment.start.y, connected: true });
            points.push({ x: segment.end.x, y: segment.end.y, connected: true });
            // Add break between segments to prevent unwanted connections
            points.push({ x: NaN, y: NaN, connected: false });
        }
        
        return points;
    }
    
    findZeroCrossings(corners, x, y, stepX, stepY) {
        const edges = [];
        
        // Define edge positions: bottom, right, top, left
        const edgePos = [
            {start: {x: x, y: y}, end: {x: x + stepX, y: y}},           // bottom
            {start: {x: x + stepX, y: y}, end: {x: x + stepX, y: y + stepY}}, // right
            {start: {x: x + stepX, y: y + stepY}, end: {x: x, y: y + stepY}}, // top
            {start: {x: x, y: y + stepY}, end: {x: x, y: y}}            // left
        ];
        
        // Check each edge for zero crossing
        for (let i = 0; i < 4; i++) {
            const v1 = corners[i];
            const v2 = corners[(i + 1) % 4];
            
            // Zero crossing occurs when values have opposite signs
            if (v1 * v2 < 0) {
                // Use linear interpolation to find crossing point
                const t = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2));
                const edge = edgePos[i];
                const crossingX = edge.start.x + t * (edge.end.x - edge.start.x);
                const crossingY = edge.start.y + t * (edge.end.y - edge.start.y);
                
                edges.push({ x: crossingX, y: crossingY });
            }
        }
        
        return edges;
    }
    
    connectImplicitPoints(candidatePoints) {
        const curves = [];
        const used = new Set();
        const maxDistance = Math.min(
            (this.viewport.maxX - this.viewport.minX) / 30,
            (this.viewport.maxY - this.viewport.minY) / 30
        );
        
        for (let i = 0; i < candidatePoints.length; i++) {
            if (used.has(i)) continue;
            
            const curve = this.traceCurve(candidatePoints, i, used, maxDistance);
            
            if (curve.length >= 3) {
                curve.id = curves.length;
                curves.push(curve);
            } else {
                // For small clusters, mark individual points as disconnected
                curve.forEach(() => {
                    curves.push([candidatePoints[i]]);
                });
            }
        }
        
        return curves;
    }
    
    traceCurve(points, startIdx, used, maxDistance) {
        const curve = [];
        const visited = new Set();
        
        // Start from the given point
        let currentIdx = startIdx;
        used.add(currentIdx);
        visited.add(currentIdx);
        curve.push(points[currentIdx]);
        
        // Trace the curve by following nearest neighbors
        while (true) {
            let nearestIdx = -1;
            let nearestDistance = Infinity;
            
            const currentPoint = points[currentIdx];
            
            // Find the nearest unvisited point
            for (let i = 0; i < points.length; i++) {
                if (used.has(i) || visited.has(i)) continue;
                
                const distance = Math.sqrt(
                    Math.pow(currentPoint.x - points[i].x, 2) + 
                    Math.pow(currentPoint.y - points[i].y, 2)
                );
                
                if (distance <= maxDistance && distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIdx = i;
                }
            }
            
            // If no nearby point found, try to extend in the opposite direction
            if (nearestIdx === -1 && curve.length === 1) {
                // Try going backwards from the start point
                const backwardCurve = this.traceBackward(points, startIdx, used, visited, maxDistance);
                if (backwardCurve.length > 0) {
                    // Prepend backward points to curve
                    curve.unshift(...backwardCurve.reverse());
                }
                break;
            } else if (nearestIdx === -1) {
                break; // End of curve
            }
            
            // Add the nearest point to the curve
            used.add(nearestIdx);
            visited.add(nearestIdx);
            curve.push(points[nearestIdx]);
            currentIdx = nearestIdx;
        }
        
        return curve;
    }
    
    traceBackward(points, startIdx, used, visited, maxDistance) {
        const backwardCurve = [];
        let currentIdx = startIdx;
        
        while (true) {
            let nearestIdx = -1;
            let nearestDistance = Infinity;
            
            const currentPoint = points[currentIdx];
            
            // Find the nearest unvisited point
            for (let i = 0; i < points.length; i++) {
                if (used.has(i) || visited.has(i)) continue;
                
                const distance = Math.sqrt(
                    Math.pow(currentPoint.x - points[i].x, 2) + 
                    Math.pow(currentPoint.y - points[i].y, 2)
                );
                
                if (distance <= maxDistance && distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIdx = i;
                }
            }
            
            if (nearestIdx === -1) break;
            
            used.add(nearestIdx);
            visited.add(nearestIdx);
            backwardCurve.push(points[nearestIdx]);
            currentIdx = nearestIdx;
        }
        
        return backwardCurve;
    }
    
    findYValuesForImplicitFunction(equation, x) {
        const yValues = [];
        const viewportHeight = this.viewport.maxY - this.viewport.minY;
        const yMin = this.viewport.minY;
        const yMax = this.viewport.maxY;
        const tolerance = 0.001;
        const maxIterations = 50;
        
        // Use a combination of bisection and scanning to find y values
        const scanResolution = 100;
        const stepY = viewportHeight / scanResolution;
        
        let lastValue = null;
        let lastY = null;
        let zerosFound = 0;
        
        for (let y = yMin; y <= yMax; y += stepY) {
            const currentValue = this.evaluateImplicitEquation(equation, x, y);
            
            if (currentValue !== null) {
                // Check for sign change (zero crossing)
                if (lastValue !== null && 
                    ((lastValue > 0 && currentValue < 0) || (lastValue < 0 && currentValue > 0))) {
                    
                    // Use bisection method to find more accurate zero
                    const accurateY = this.bisectionMethod(equation, x, lastY, y, tolerance, maxIterations);
                    if (accurateY !== null) {
                        yValues.push(accurateY);
                        zerosFound++;
                    }
                }
                
                // Also check if current value is very close to zero
                if (Math.abs(currentValue) < tolerance) {
                    yValues.push(y);
                    zerosFound++;
                }
                
                lastValue = currentValue;
                lastY = y;
            }
        }
        
        return yValues;
    }
    
    bisectionMethod(equation, x, y1, y2, tolerance, maxIterations) {
        let a = y1;
        let b = y2;
        
        for (let i = 0; i < maxIterations; i++) {
            const c = (a + b) / 2;
            const fc = this.evaluateImplicitEquation(equation, x, c);
            
            if (fc === null || Math.abs(fc) < tolerance) {
                return c;
            }
            
            const fa = this.evaluateImplicitEquation(equation, x, a);
            if (fa === null) return null;
            
            if ((fa > 0 && fc > 0) || (fa < 0 && fc < 0)) {
                a = c;
            } else {
                b = c;
            }
            
            if (Math.abs(b - a) < tolerance) {
                return (a + b) / 2;
            }
        }
        
        return null;
    }

    parseImplicitEquation(expression) {
        // Check cache first
        if (this.parsedImplicitEquations.has(expression)) {
            return this.parsedImplicitEquations.get(expression);
        }
        
        try {
            // Convert from LaTeX first since we now store LaTeX format
            const convertedExpression = this.convertFromLatex(expression);
            
            // Split on equals sign
            const parts = convertedExpression.split('=');
            if (parts.length !== 2) {
                return null;
            }
            
            const leftSide = parts[0].trim();
            const rightSide = parts[1].trim();
            
            // Process expressions for math.js (handle implicit multiplication, etc.)
            const leftProcessed = this.processImplicitExpression(leftSide);
            const rightProcessed = this.processImplicitExpression(rightSide);
            
            // Return the difference: left - right (so we solve for = 0)
            const result = {
                leftExpression: leftProcessed,
                rightExpression: rightProcessed
            };
            
            // Cache the result
            this.parsedImplicitEquations.set(expression, result);
            
            return result;
            
        } catch (error) {
            console.error('Error parsing implicit equation:', error);
            return null;
        }
    }
    
    processImplicitExpression(expression) {
        let processedExpression = expression.toLowerCase();
        
        // Handle implicit multiplication for adjacent variables and numbers
        // BUT avoid breaking function names that are already properly formatted
        // AND avoid breaking parameter names (alpha, beta, gamma)
        if (!this.containsProperFunctions(processedExpression)) {
            // Protect parameter names from being split
            const hasAlpha = processedExpression.includes('alpha');
            const hasBeta = processedExpression.includes('beta');
            const hasGamma = processedExpression.includes('gamma');
            const hasDelta = processedExpression.includes('delta');
            
            // Replace parameter names with placeholders
            if (hasAlpha) processedExpression = processedExpression.replace(/alpha/g, '__ALPHA__');
            if (hasBeta) processedExpression = processedExpression.replace(/beta/g, '__BETA__');
            if (hasGamma) processedExpression = processedExpression.replace(/gamma/g, '__GAMMA__');
            if (hasDelta) processedExpression = processedExpression.replace(/delta/g, '__DELTA__');
            
            // xy -> x*y, 2x -> 2*x, x2 -> x*2, etc.
            processedExpression = processedExpression.replace(/([a-z])([a-z])/g, '$1*$2'); // variable*variable
            processedExpression = processedExpression.replace(/(\d)([a-z])/g, '$1*$2'); // number*variable
            processedExpression = processedExpression.replace(/([a-z])(\d)/g, '$1*$2'); // variable*number
            processedExpression = processedExpression.replace(/(\))([a-z\d])/g, '$1*$2'); // )*variable/number
            processedExpression = processedExpression.replace(/([a-z\d])(\()/g, '$1*$2'); // variable/number*(
            
            // Restore parameter names
            if (hasAlpha) processedExpression = processedExpression.replace(/__ALPHA__/g, 'alpha');
            if (hasBeta) processedExpression = processedExpression.replace(/__BETA__/g, 'beta');
            if (hasGamma) processedExpression = processedExpression.replace(/__GAMMA__/g, 'gamma');
            if (hasDelta) processedExpression = processedExpression.replace(/__DELTA__/g, 'delta');
        }
        
        // Basic math.js compatible conversions
        processedExpression = processedExpression.replace(/\^/g, '^'); // Keep power notation
        processedExpression = processedExpression.replace(/\bpi\b/g, 'pi');
        processedExpression = processedExpression.replace(/\be\b/g, 'e');
        
        return processedExpression;
    }

    evaluateImplicitEquation(equation, x, y) {
        try {
            // Evaluate left side - right side
            const scope = this.getEvaluationScope({ x: x, y: y, pi: Math.PI, e: Math.E });
            
            // Use existing infrastructure but with x,y scope
            const leftValue = this.evaluateMathExpression(equation.leftExpression, scope);
            const rightValue = this.evaluateMathExpression(equation.rightExpression, scope);
            
            if (leftValue === null || rightValue === null) {
                return null;
            }
            
            return leftValue - rightValue; // We want this to be ≈ 0
            
        } catch (error) {
            return null;
        }
    }

    evaluateMathExpression(expression, scope) {
        try {
            // Process expression for math.js directly without convertFromLatex to avoid recursion
            let processedExpression = expression.toLowerCase();
            
            // Handle implicit multiplication for adjacent variables and numbers
            // BUT avoid breaking function names that are already properly formatted
            // AND avoid breaking parameter names (alpha, beta, gamma)
            if (!this.containsProperFunctions(processedExpression)) {
                // Protect parameter names from being split
                const hasAlpha = processedExpression.includes('alpha');
                const hasBeta = processedExpression.includes('beta');
                const hasGamma = processedExpression.includes('gamma');
                const hasDelta = processedExpression.includes('delta');
                
                // Replace parameter names with placeholders
                if (hasAlpha) processedExpression = processedExpression.replace(/alpha/g, '__ALPHA__');
                if (hasBeta) processedExpression = processedExpression.replace(/beta/g, '__BETA__');
                if (hasGamma) processedExpression = processedExpression.replace(/gamma/g, '__GAMMA__');
                if (hasDelta) processedExpression = processedExpression.replace(/delta/g, '__DELTA__');
                
                // xy -> x*y, 2x -> 2*x, x2 -> x*2, etc.
                processedExpression = processedExpression.replace(/([a-z])([a-z])/g, '$1*$2'); // variable*variable
                processedExpression = processedExpression.replace(/(\d)([a-z])/g, '$1*$2'); // number*variable
                processedExpression = processedExpression.replace(/([a-z])(\d)/g, '$1*$2'); // variable*number
                processedExpression = processedExpression.replace(/(\))([a-z\d])/g, '$1*$2'); // )*variable/number
                processedExpression = processedExpression.replace(/([a-z\d])(\()/g, '$1*$2'); // variable/number*(
                
                // Restore parameter names
                if (hasAlpha) processedExpression = processedExpression.replace(/__ALPHA__/g, 'alpha');
                if (hasBeta) processedExpression = processedExpression.replace(/__BETA__/g, 'beta');
                if (hasGamma) processedExpression = processedExpression.replace(/__GAMMA__/g, 'gamma');
                if (hasDelta) processedExpression = processedExpression.replace(/__DELTA__/g, 'delta');
            }
            
            // Basic math.js compatible conversions
            processedExpression = processedExpression.replace(/\^/g, '^'); // Keep power notation
            processedExpression = processedExpression.replace(/\bpi\b/g, 'pi');
            processedExpression = processedExpression.replace(/\be\b/g, 'e');
            
            // Use math.js directly without compiled expression cache to avoid recursion
            const result = math.evaluate(processedExpression, scope);
            
            if (typeof result === 'number' && isFinite(result)) {
                return result;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    containsProperFunctions(expression) {
        // Check if expression contains properly formatted function calls
        // This helps avoid breaking function names with the variable*variable regex
        const functionPattern = /\b(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|log|log10|exp|sqrt|cbrt|abs)\s*\(/;
        return functionPattern.test(expression);
    }
    
    calculateDynamicPolarStep(thetaMin, thetaMax) {
        // Prevent system hangs by limiting total number of calculation points
        const MAX_POINTS = 800; // Safe maximum for mobile devices
        const MIN_STEP = 0.001; // Minimum step for visual quality
        const DEFAULT_STEP = this.polarSettings.step; // Original step size (0.01)
        
        const thetaRange = Math.abs(thetaMax - thetaMin);
        
        // Calculate how many points the default step would create
        const defaultPointCount = thetaRange / DEFAULT_STEP;
        
        // If default step creates too many points, increase step size
        if (defaultPointCount > MAX_POINTS) {
            const dynamicStep = thetaRange / MAX_POINTS;
            // Use the larger of dynamic step or minimum step
            return Math.max(dynamicStep, MIN_STEP);
        }
        
        // For reasonable ranges, use the default step size
        return DEFAULT_STEP;
    }
    
    resetPolarRange() {
        // Reset theta range to appropriate defaults based on angle mode
        const thetaMinInput = document.getElementById('theta-min');
        const thetaMaxInput = document.getElementById('theta-max');
        
        // Stop any running animation to prevent state inconsistencies
        if (this.polarAnimation.isAnimating) {
            this.stopPolarAnimation();
        }
        
        if (this.angleMode === 'degrees') {
            // Reset to 0 to 360 degrees
            this.polarSettings.thetaMin = 0;
            this.polarSettings.thetaMax = 360;
            
            if (thetaMinInput) {
                this.setRangeValue(thetaMinInput, '0');
            }
            if (thetaMaxInput) {
                this.setRangeValue(thetaMaxInput, '360');
            }
            
            // Reset animation state to match
            this.polarAnimation.storedThetaMax = 360;
            this.polarAnimation.currentTheta = 0;
        } else {
            // Reset to 0 to 2π radians (default)
            this.polarSettings.thetaMin = 0;
            this.polarSettings.thetaMax = 2 * Math.PI;
            
            if (thetaMinInput) {
                this.setRangeValue(thetaMinInput, '0');
                this.polarSettings.thetaMinLatex = '0';
            }
            if (thetaMaxInput) {
                this.setRangeValue(thetaMaxInput, '2\\pi');
                this.polarSettings.thetaMaxLatex = '2\\pi';
            }
            
            // Reset animation state to match
            this.polarAnimation.storedThetaMax = 2 * Math.PI;
            this.polarAnimation.currentTheta = 0;
        }
    }
    
    // Debounced intersection updates for smooth pan/zoom performance
    handleViewportChange() {
        // Capture current intercepts as frozen badges ONLY if viewport wasn't already changing
        if (!this.isViewportChanging && this.showIntercepts && this.intercepts.length > 0) {
            this.frozenInterceptBadges = this.intercepts.map(intercept => ({
                x: intercept.x,
                y: intercept.y,
                type: intercept.type,
                functionColor: '#808080' // Neutral gray color for intercepts
            }));
        }
        
        // Capture current turning points as frozen badges ONLY if viewport wasn't already changing
        if (!this.isViewportChanging && this.showTurningPoints && this.turningPoints.length > 0) {
            this.frozenTurningPointBadges = this.turningPoints.map(turningPoint => ({
                x: turningPoint.x,
                y: turningPoint.y,
                type: turningPoint.type,
                func: turningPoint.func
            }));
        }
        
        // Create frozen intersection badges for visual continuity during viewport changes
        if (!this.isViewportChanging && this.intersections.length > 0) {
            this.frozenIntersectionBadges = this.intersections.map(intersection => ({
                x: intersection.x,
                y: intersection.y
            }));
        }
        
        this.isViewportChanging = true;
        
        // Schedule implicit intersection recalculation after viewport changes settle
        this.scheduleImplicitIntersectionCalculation();
        
        // Cancel any ongoing implicit function calculations
        this.cancelAllImplicitCalculations();
        
        // Clear existing timer to restart the debounce period
        if (this.intersectionDebounceTimer) {
            clearTimeout(this.intersectionDebounceTimer);
        }
        
        // Set new timer to recalculate intersections and turning points after user stops pan/zoom
        this.intersectionDebounceTimer = setTimeout(() => {
            this.isViewportChanging = false;
            this.frozenTurningPointBadges = []; // Clear frozen turning point badges
            // Don't clear frozen intersection badges yet - wait until all intersection calculations complete
            
            // Replot explicit functions with updated viewport
            this.getCurrentFunctions().forEach(func => {
                if (func.expression && func.enabled) {
                    const functionType = this.detectFunctionType(func.expression);
                    if (functionType === 'explicit' || functionType === 'theta-constant') {
                        this.plotFunction(func);
                    }
                }
            });
            
            // Replot implicit functions (now fast enough for immediate execution)
            this.replotImplicitFunctions(true);
            
            // Skip badge calculations during polar animation or pause
            if (!this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
                if (this.showIntersections) {
                    this.calculateIntersectionsWithWorker();
                }
                if (this.showTurningPoints) {
                    this.turningPoints = this.findTurningPoints();
                }
                if (this.showIntercepts) {
                    this.intercepts = this.findAxisIntercepts();
                    this.cullInterceptMarkers(); // Pre-calculate culled markers for performance
                }
            }
        }, 50); // Short delay optimized for fast implicit plotting
    }
    
    findIntersections() {
        // Early exit if intersection detection is disabled
        if (!this.showIntersections) {
            return [];
        }
        
        // Find intersection points between all pairs of enabled functions
        const intersections = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => f.enabled && f.points.length > 0);
        
        // Check all pairs of functions
        for (let i = 0; i < enabledFunctions.length; i++) {
            for (let j = i + 1; j < enabledFunctions.length; j++) {
                const func1 = enabledFunctions[i];
                const func2 = enabledFunctions[j];
                
                const pairIntersections = this.findIntersectionsBetweenFunctions(func1, func2);
                intersections.push(...pairIntersections);
            }
        }
        
        return intersections;
    }
    
    findTangentIntersections() {
        // Early exit if intersection detection is disabled
        if (!this.showIntersections) {
            return [];
        }
        
        const tangentIntersections = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => f.enabled && f.points.length > 0);
        
        // Get all badges with tangent lines
        const tangentBadges = this.input.persistentBadges.filter(b => b.hasTangent && b.tangentSlope !== null);
        
        // Check tangent-function intersections
        for (const badge of tangentBadges) {
            // Tangent line equation: y = m*x + b
            const m = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            const b = badge.worldY - m * badge.worldX;
            
            // Find intersections with each function
            for (const func of enabledFunctions) {
                if (func.points.length === 0) continue;
                
                // Find intersections between tangent line and function
                const intersections = this.findTangentFunctionIntersections(badge, func, m, b);
                tangentIntersections.push(...intersections);
            }
        }
        
        // Check tangent-tangent intersections
        for (let i = 0; i < tangentBadges.length; i++) {
            for (let j = i + 1; j < tangentBadges.length; j++) {
                const badge1 = tangentBadges[i];
                const badge2 = tangentBadges[j];
                
                // Find intersection between two tangent lines
                const intersection = this.findTangentTangentIntersection(badge1, badge2);
                if (intersection) {
                    tangentIntersections.push(intersection);
                }
            }
        }
        
        return tangentIntersections;
    }
    
    findTangentTangentIntersection(badge1, badge2) {
        // Tangent line equations: y = m1*x + b1 and y = m2*x + b2
        const m1 = badge1.tangentSlope.slope !== undefined ? badge1.tangentSlope.slope : badge1.tangentSlope;
        const b1 = badge1.worldY - m1 * badge1.worldX;
        
        const m2 = badge2.tangentSlope.slope !== undefined ? badge2.tangentSlope.slope : badge2.tangentSlope;
        const b2 = badge2.worldY - m2 * badge2.worldX;
        
        // Check if lines are parallel (or nearly parallel)
        if (Math.abs(m1 - m2) < 1e-10) {
            return null; // Parallel lines don't intersect (or are coincident)
        }
        
        // Solve for intersection: m1*x + b1 = m2*x + b2
        // (m1 - m2)*x = b2 - b1
        // x = (b2 - b1) / (m1 - m2)
        const intersectionX = (b2 - b1) / (m1 - m2);
        const intersectionY = m1 * intersectionX + b1;
        
        // Skip if intersection is at either tangent point itself (within tolerance)
        const distToBadge1 = Math.sqrt(
            Math.pow(intersectionX - badge1.worldX, 2) + 
            Math.pow(intersectionY - badge1.worldY, 2)
        );
        const distToBadge2 = Math.sqrt(
            Math.pow(intersectionX - badge2.worldX, 2) + 
            Math.pow(intersectionY - badge2.worldY, 2)
        );
        
        if (distToBadge1 < 0.05 || distToBadge2 < 0.05) {
            return null; // Too close to tangent points
        }
        
        // Check if intersection is within reasonable viewport bounds
        const viewportMargin = 10; // Allow some margin outside viewport
        const minX = this.viewport.minX - viewportMargin;
        const maxX = this.viewport.maxX + viewportMargin;
        const minY = this.viewport.minY - viewportMargin;
        const maxY = this.viewport.maxY + viewportMargin;
        
        if (intersectionX < minX || intersectionX > maxX || 
            intersectionY < minY || intersectionY > maxY) {
            return null; // Intersection outside viewport
        }
        
        return {
            x: intersectionX,
            y: intersectionY,
            func1Id: `tangent_${badge1.id}`,
            func2Id: `tangent_${badge2.id}`,
            color1: badge1.functionColor,
            color2: badge2.functionColor,
            isTangentTangentIntersection: true
        };
    }
    
    findTangentFunctionIntersections(badge, func, slope, intercept) {
        const intersections = [];
        const points = func.points;
        const tolerance = 0.01; // Screen pixel tolerance for intersection detection
        
        // Sample function points and check for intersections with tangent line
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) continue;
            
            // Calculate tangent line y-values at these x positions
            const tangentY1 = slope * p1.x + intercept;
            const tangentY2 = slope * p2.x + intercept;
            
            // Check if function segment crosses tangent line
            const func1Above = p1.y > tangentY1;
            const func2Above = p2.y > tangentY2;
            
            if (func1Above !== func2Above) {
                // Crossing detected - interpolate to find exact intersection point
                const t = Math.abs(p1.y - tangentY1) / (Math.abs(p1.y - tangentY1) + Math.abs(p2.y - tangentY2));
                const intersectionX = p1.x + t * (p2.x - p1.x);
                const intersectionY = slope * intersectionX + intercept;
                
                // Skip if intersection is at the tangent point itself (within tolerance)
                const distToBadge = Math.sqrt(
                    Math.pow(intersectionX - badge.worldX, 2) + 
                    Math.pow(intersectionY - badge.worldY, 2)
                );
                
                if (distToBadge > 0.05) { // Only show intersections away from tangent point
                    intersections.push({
                        x: intersectionX,
                        y: intersectionY,
                        func1Id: `tangent_${badge.id}`,
                        func2Id: func.id,
                        color1: badge.functionColor,
                        color2: func.color,
                        isTangentIntersection: true
                    });
                }
            }
        }
        
        // Remove duplicate intersections (within small tolerance)
        const uniqueIntersections = [];
        for (const intersection of intersections) {
            const isDuplicate = uniqueIntersections.some(existing => 
                Math.abs(existing.x - intersection.x) < 0.01 && 
                Math.abs(existing.y - intersection.y) < 0.01
            );
            if (!isDuplicate) {
                uniqueIntersections.push(intersection);
            }
        }
        
        return uniqueIntersections;
    }
    
    findNormalIntersections() {
        // Early exit if intersection detection is disabled
        if (!this.showIntersections) {
            return [];
        }
        
        const normalIntersections = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => f.enabled && f.points.length > 0);
        
        // Get all badges with normal lines
        const normalBadges = this.input.persistentBadges.filter(b => b.hasNormal && b.tangentSlope !== null);
        
        // Check normal-function intersections
        for (const badge of normalBadges) {
            // Calculate normal line slope (perpendicular to tangent)
            const tangentSlope = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            let normalSlope;
            
            if (Math.abs(tangentSlope) < 1e-10) {
                normalSlope = Infinity; // Vertical normal
            } else if (Math.abs(tangentSlope) > 1e10) {
                normalSlope = 0; // Horizontal normal
            } else {
                normalSlope = -1 / tangentSlope;
            }
            
            // Normal line equation: y = m*x + b
            const m = normalSlope;
            const b = badge.worldY - m * badge.worldX;
            
            // Find intersections with each function
            for (const func of enabledFunctions) {
                if (func.points.length === 0) continue;
                
                // Find intersections between normal line and function
                const intersections = this.findNormalFunctionIntersections(badge, func, m, b);
                normalIntersections.push(...intersections);
            }
        }
        
        // Check normal-normal intersections
        for (let i = 0; i < normalBadges.length; i++) {
            for (let j = i + 1; j < normalBadges.length; j++) {
                const badge1 = normalBadges[i];
                const badge2 = normalBadges[j];
                
                // Find intersection between two normal lines
                const intersection = this.findNormalNormalIntersection(badge1, badge2);
                if (intersection) {
                    normalIntersections.push(intersection);
                }
            }
        }
        
        // Check normal-tangent intersections
        const tangentBadges = this.input.persistentBadges.filter(b => b.hasTangent && b.tangentSlope !== null);
        for (const normalBadge of normalBadges) {
            for (const tangentBadge of tangentBadges) {
                const intersection = this.findNormalTangentIntersection(normalBadge, tangentBadge);
                if (intersection) {
                    normalIntersections.push(intersection);
                }
            }
        }
        
        return normalIntersections;
    }
    
    findNormalNormalIntersection(badge1, badge2) {
        // Calculate normal slopes
        const tangentSlope1 = badge1.tangentSlope.slope !== undefined ? badge1.tangentSlope.slope : badge1.tangentSlope;
        const tangentSlope2 = badge2.tangentSlope.slope !== undefined ? badge2.tangentSlope.slope : badge2.tangentSlope;
        
        const m1 = Math.abs(tangentSlope1) < 1e-10 ? Infinity : (Math.abs(tangentSlope1) > 1e10 ? 0 : -1 / tangentSlope1);
        const m2 = Math.abs(tangentSlope2) < 1e-10 ? Infinity : (Math.abs(tangentSlope2) > 1e10 ? 0 : -1 / tangentSlope2);
        
        // Handle vertical lines
        if (m1 === Infinity && m2 === Infinity) return null; // Both vertical
        if (m1 === Infinity) {
            const intersectionX = badge1.worldX;
            const b2 = badge2.worldY - m2 * badge2.worldX;
            const intersectionY = m2 * intersectionX + b2;
            return this.createNormalIntersection(intersectionX, intersectionY, badge1, badge2);
        }
        if (m2 === Infinity) {
            const intersectionX = badge2.worldX;
            const b1 = badge1.worldY - m1 * badge1.worldX;
            const intersectionY = m1 * intersectionX + b1;
            return this.createNormalIntersection(intersectionX, intersectionY, badge1, badge2);
        }
        
        const b1 = badge1.worldY - m1 * badge1.worldX;
        const b2 = badge2.worldY - m2 * badge2.worldX;
        
        // Check if lines are parallel
        if (Math.abs(m1 - m2) < 1e-10) {
            return null;
        }
        
        const intersectionX = (b2 - b1) / (m1 - m2);
        const intersectionY = m1 * intersectionX + b1;
        
        return this.createNormalIntersection(intersectionX, intersectionY, badge1, badge2);
    }
    
    findNormalTangentIntersection(normalBadge, tangentBadge) {
        // Calculate normal slope
        const tangentSlopeVal = normalBadge.tangentSlope.slope !== undefined ? normalBadge.tangentSlope.slope : normalBadge.tangentSlope;
        const normalSlope = Math.abs(tangentSlopeVal) < 1e-10 ? Infinity : (Math.abs(tangentSlopeVal) > 1e10 ? 0 : -1 / tangentSlopeVal);
        
        // Calculate tangent slope
        const tangentSlope = tangentBadge.tangentSlope.slope !== undefined ? tangentBadge.tangentSlope.slope : tangentBadge.tangentSlope;
        
        // Handle vertical normal
        if (normalSlope === Infinity) {
            const intersectionX = normalBadge.worldX;
            const b2 = tangentBadge.worldY - tangentSlope * tangentBadge.worldX;
            const intersectionY = tangentSlope * intersectionX + b2;
            return this.createMixedIntersection(intersectionX, intersectionY, normalBadge, tangentBadge);
        }
        
        // Handle vertical tangent
        if (Math.abs(tangentSlope) > 1e10) {
            const intersectionX = tangentBadge.worldX;
            const b1 = normalBadge.worldY - normalSlope * normalBadge.worldX;
            const intersectionY = normalSlope * intersectionX + b1;
            return this.createMixedIntersection(intersectionX, intersectionY, normalBadge, tangentBadge);
        }
        
        const b1 = normalBadge.worldY - normalSlope * normalBadge.worldX;
        const b2 = tangentBadge.worldY - tangentSlope * tangentBadge.worldX;
        
        // Check if lines are parallel
        if (Math.abs(normalSlope - tangentSlope) < 1e-10) {
            return null;
        }
        
        const intersectionX = (b2 - b1) / (normalSlope - tangentSlope);
        const intersectionY = normalSlope * intersectionX + b1;
        
        return this.createMixedIntersection(intersectionX, intersectionY, normalBadge, tangentBadge);
    }
    
    createNormalIntersection(intersectionX, intersectionY, badge1, badge2) {
        // Skip if intersection is at either normal point itself
        const distToBadge1 = Math.sqrt(
            Math.pow(intersectionX - badge1.worldX, 2) + 
            Math.pow(intersectionY - badge1.worldY, 2)
        );
        const distToBadge2 = Math.sqrt(
            Math.pow(intersectionX - badge2.worldX, 2) + 
            Math.pow(intersectionY - badge2.worldY, 2)
        );
        
        if (distToBadge1 < 0.05 || distToBadge2 < 0.05) {
            return null;
        }
        
        // Check viewport bounds
        const viewportMargin = 10;
        const minX = this.viewport.minX - viewportMargin;
        const maxX = this.viewport.maxX + viewportMargin;
        const minY = this.viewport.minY - viewportMargin;
        const maxY = this.viewport.maxY + viewportMargin;
        
        if (intersectionX < minX || intersectionX > maxX || 
            intersectionY < minY || intersectionY > maxY) {
            return null;
        }
        
        return {
            x: intersectionX,
            y: intersectionY,
            func1Id: `normal_${badge1.id}`,
            func2Id: `normal_${badge2.id}`,
            color1: badge1.functionColor,
            color2: badge2.functionColor,
            isNormalNormalIntersection: true
        };
    }
    
    createMixedIntersection(intersectionX, intersectionY, normalBadge, tangentBadge) {
        // Skip if intersection is at either point itself
        const distToNormal = Math.sqrt(
            Math.pow(intersectionX - normalBadge.worldX, 2) + 
            Math.pow(intersectionY - normalBadge.worldY, 2)
        );
        const distToTangent = Math.sqrt(
            Math.pow(intersectionX - tangentBadge.worldX, 2) + 
            Math.pow(intersectionY - tangentBadge.worldY, 2)
        );
        
        if (distToNormal < 0.05 || distToTangent < 0.05) {
            return null;
        }
        
        // Check viewport bounds
        const viewportMargin = 10;
        const minX = this.viewport.minX - viewportMargin;
        const maxX = this.viewport.maxX + viewportMargin;
        const minY = this.viewport.minY - viewportMargin;
        const maxY = this.viewport.maxY + viewportMargin;
        
        if (intersectionX < minX || intersectionX > maxX || 
            intersectionY < minY || intersectionY > maxY) {
            return null;
        }
        
        return {
            x: intersectionX,
            y: intersectionY,
            func1Id: `normal_${normalBadge.id}`,
            func2Id: `tangent_${tangentBadge.id}`,
            color1: normalBadge.functionColor,
            color2: tangentBadge.functionColor,
            isNormalTangentIntersection: true
        };
    }
    
    findNormalFunctionIntersections(badge, func, slope, intercept) {
        const intersections = [];
        const points = func.points;
        
        // Sample function points and check for intersections with normal line
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            if (!p1.connected) continue; // Skip disconnected segments
            
            // Normal line value at these x coordinates
            const normalY1 = slope === Infinity ? (p1.x === badge.worldX ? p1.y : null) : slope * p1.x + intercept;
            const normalY2 = slope === Infinity ? (p2.x === badge.worldX ? p2.y : null) : slope * p2.x + intercept;
            
            if (normalY1 === null || normalY2 === null) continue;
            
            // Check if normal line crosses the function segment
            const diff1 = p1.y - normalY1;
            const diff2 = p2.y - normalY2;
            
            if (diff1 * diff2 <= 0) { // Sign change indicates crossing
                // Linear interpolation to find intersection point
                const t = Math.abs(diff1) / (Math.abs(diff1) + Math.abs(diff2));
                const intersectionX = p1.x + t * (p2.x - p1.x);
                const intersectionY = p1.y + t * (p2.y - p1.y);
                
                // Skip if intersection is at the normal point itself (within tolerance)
                const distToBadge = Math.sqrt(
                    Math.pow(intersectionX - badge.worldX, 2) + 
                    Math.pow(intersectionY - badge.worldY, 2)
                );
                
                if (distToBadge > 0.05) { // Only show intersections away from normal point
                    intersections.push({
                        x: intersectionX,
                        y: intersectionY,
                        func1Id: `normal_${badge.id}`,
                        func2Id: func.id,
                        color1: badge.functionColor,
                        color2: func.color,
                        isNormalIntersection: true
                    });
                }
            }
        }
        
        // Remove duplicate intersections (within small tolerance)
        const uniqueIntersections = [];
        for (const intersection of intersections) {
            const isDuplicate = uniqueIntersections.some(existing => 
                Math.abs(existing.x - intersection.x) < 0.01 && 
                Math.abs(existing.y - intersection.y) < 0.01
            );
            if (!isDuplicate) {
                uniqueIntersections.push(intersection);
            }
        }
        
        return uniqueIntersections;
    }
    
    // ================================
    // INTEGRATION DETECTION AND CALCULATION
    // ================================
    
    updateIntegralPairs() {
        // Find all integral badges grouped by function
        const integralBadgesByFunction = new Map();
        
        for (const badge of this.input.persistentBadges) {
            if (badge.hasIntegral && badge.functionId) {
                if (!integralBadgesByFunction.has(badge.functionId)) {
                    integralBadgesByFunction.set(badge.functionId, []);
                }
                integralBadgesByFunction.get(badge.functionId).push(badge);
            }
        }
        
        // If actively dragging an integral badge, include it as a virtual badge
        if (this.input.tracing.active && 
            this.input.badgeInteraction.originalBadgeState && 
            this.input.badgeInteraction.originalBadgeState.hasIntegral) {
            
            const virtualBadge = {
                id: this.input.badgeInteraction.originalBadgeId, // Use original badge ID, not 'dragging'
                functionId: this.input.tracing.functionId,
                worldX: this.input.tracing.worldX,
                worldY: this.input.tracing.worldY,
                theta: this.input.tracing.theta,
                hasIntegral: true,
                neonIntegral: this.input.badgeInteraction.originalBadgeState.neonIntegral
            };
            
            if (!integralBadgesByFunction.has(virtualBadge.functionId)) {
                integralBadgesByFunction.set(virtualBadge.functionId, []);
            }
            integralBadgesByFunction.get(virtualBadge.functionId).push(virtualBadge);
        }
        
        // Clear existing pairs but preserve labelBounds for existing pairs
        const oldPairs = this.integralPairs;
        this.integralPairs = [];
        
        // Create pairs for each function (max 2 badges per function)
        for (const [functionId, badges] of integralBadgesByFunction) {
            if (badges.length >= 2) {
                // Sort badges by x-coordinate (or theta for polar)
                badges.sort((a, b) => {
                    if (this.plotMode === 'polar' && a.theta !== null && b.theta !== null) {
                        return a.theta - b.theta;
                    }
                    return a.worldX - b.worldX;
                });
                
                // Only take first 2 badges (enforce max 2 per function)
                const badge1 = badges[0];
                const badge2 = badges[1];
                
                // Get the function
                const func = this.findFunctionById(functionId);
                if (!func || !func.points || func.points.length === 0) {
                    continue;
                }
                
                // Calculate the integral
                let area, start, end;
                if (this.plotMode === 'polar') {
                    start = badge1.theta;
                    end = badge2.theta;
                    area = this.calculatePolarIntegral(func, start, end);
                } else {
                    start = badge1.worldX;
                    end = badge2.worldX;
                    area = this.calculateCartesianIntegral(func, start, end);
                }
                
                // Find if this pair existed before to preserve labelBounds
                const oldPair = oldPairs.find(p => 
                    p.badge1Id === badge1.id && p.badge2Id === badge2.id
                );
                
                // Create pair object
                const newPair = {
                    badge1Id: badge1.id,
                    badge2Id: badge2.id,
                    functionId: functionId,
                    func: func,
                    start: start,
                    end: end,
                    area: area,
                    color: func.color,
                    neon: badge1.neonIntegral || badge2.neonIntegral
                };
                
                // Preserve labelBounds if it existed
                if (oldPair && oldPair.labelBounds) {
                    newPair.labelBounds = oldPair.labelBounds;
                }
                
                this.integralPairs.push(newPair);
            }
        }
        
        // Update linked pairs to reference new pair objects
        for (const linkedPair of this.linkedBadgePairs) {
            // Find the new pairs that correspond to the old ones
            const oldPair1 = linkedPair.pair1;
            const oldPair2 = linkedPair.pair2;
            
            // Match by badge IDs since those don't change
            const newPair1 = this.integralPairs.find(p => 
                p.badge1Id === oldPair1.badge1Id && p.badge2Id === oldPair1.badge2Id
            );
            const newPair2 = this.integralPairs.find(p => 
                p.badge1Id === oldPair2.badge1Id && p.badge2Id === oldPair2.badge2Id
            );
            
            // Update references if both pairs still exist
            if (newPair1 && newPair2) {
                linkedPair.pair1 = newPair1;
                linkedPair.pair2 = newPair2;
            } else {
                // One of the pairs no longer exists - mark for removal
                linkedPair._remove = true;
            }
        }
        
        // Remove any linked pairs that are no longer valid
        this.linkedBadgePairs = this.linkedBadgePairs.filter(lp => !lp._remove);
        
        // Update checkbox references to point to new pair objects
        for (let i = 0; i < this.integralPanelCheckboxes.length; i++) {
            const oldCheckedPair = this.integralPanelCheckboxes[i];
            const newCheckedPair = this.integralPairs.find(p =>
                p.badge1Id === oldCheckedPair.badge1Id && p.badge2Id === oldCheckedPair.badge2Id
            );
            
            if (newCheckedPair) {
                this.integralPanelCheckboxes[i] = newCheckedPair;
            } else {
                // Pair no longer exists - mark for removal
                this.integralPanelCheckboxes[i] = null;
            }
        }
        
        // Remove any null checkboxes
        this.integralPanelCheckboxes = this.integralPanelCheckboxes.filter(p => p !== null);
    }
    
    calculateCartesianIntegral(func, x1, x2) {
        // Use trapezoidal rule on function points
        const points = func.points;
        if (points.length === 0) return 0;
        
        // Ensure x1 < x2
        if (x1 > x2) [x1, x2] = [x2, x1];
        
        // Filter points within integration range (exclude NaN)
        const relevantPoints = points.filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x >= x1 && p.x <= x2);
        
        if (relevantPoints.length < 2) return 0;
        
        // Check if function is implicit using expression type
        const functionType = this.detectFunctionType(func.expression);
        const isImplicit = (functionType === 'implicit');
        
        if (isImplicit) {
            // For implicit functions, use the connected property to separate segments
            const segments = [];
            let currentSegment = [];
            
            // Process points in order from the original array
            for (let i = 0; i < relevantPoints.length; i++) {
                const point = relevantPoints[i];
                
                // Check if previous point in original array exists and is connected
                const prevIndex = func.points.indexOf(point) - 1;
                const prevPoint = prevIndex >= 0 ? func.points[prevIndex] : null;
                const isConnectedToPrev = prevPoint && !isNaN(prevPoint.y);
                
                if (currentSegment.length === 0 || !isConnectedToPrev) {
                    // Start new segment
                    if (currentSegment.length > 1) {
                        segments.push(currentSegment);
                    }
                    currentSegment = [point];
                } else {
                    // Continue current segment
                    currentSegment.push(point);
                }
            }
            
            if (currentSegment.length > 1) {
                segments.push(currentSegment);
            }
            
            // Find which segments contain the badge positions
            const badge1 = this.input.persistentBadges.find(b => b.id === func.id); // This won't work, need different approach
            
            // For now, integrate all segments (this will give combined area of all branches)
            // TODO: Could filter segments based on badge positions in the future
            
            // Integrate each segment separately
            let totalArea = 0;
            for (const segment of segments) {
                if (segment.length < 2) continue;
                
                // Sort segment by x for proper integration
                const sortedSegment = [...segment].sort((a, b) => a.x - b.x);
                
                for (let i = 0; i < sortedSegment.length - 1; i++) {
                    const dx = sortedSegment[i + 1].x - sortedSegment[i].x;
                    const avgHeight = (sortedSegment[i].y + sortedSegment[i + 1].y) / 2;
                    totalArea += dx * avgHeight;
                }
            }
            
            return totalArea;
        } else {
            // Simple explicit function - original behavior
            // Sort by x coordinate
            relevantPoints.sort((a, b) => a.x - b.x);
            
            // Trapezoidal integration
            let area = 0;
            for (let i = 0; i < relevantPoints.length - 1; i++) {
                const dx = relevantPoints[i + 1].x - relevantPoints[i].x;
                const avgHeight = (relevantPoints[i].y + relevantPoints[i + 1].y) / 2;
                area += dx * avgHeight;
            }
            
            return area;
        }
    }
    
    calculatePolarIntegral(func, theta1, theta2) {
        // Area in polar: (1/2) ∫ r² dθ from theta1 to theta2
        const points = func.points;
        if (points.length === 0) return 0;
        
        // Ensure theta1 < theta2
        if (theta1 > theta2) [theta1, theta2] = [theta2, theta1];
        
        // Filter points within integration range
        // In polar, points have worldX and worldY (cartesian), need to find corresponding theta
        const relevantPoints = [];
        for (const p of points) {
            let theta = Math.atan2(p.y, p.x);
            // Normalize theta to [0, 2π] range to match user's input
            if (theta < 0) theta += 2 * Math.PI;
            
            if (theta >= theta1 && theta <= theta2) {
                const r = Math.sqrt(p.x * p.x + p.y * p.y);
                relevantPoints.push({ theta, r });
            }
        }
        
        if (relevantPoints.length < 2) return 0;
        
        // Sort by theta
        relevantPoints.sort((a, b) => a.theta - b.theta);
        
        // Trapezoidal integration of (1/2) r²
        let area = 0;
        for (let i = 0; i < relevantPoints.length - 1; i++) {
            const dtheta = relevantPoints[i + 1].theta - relevantPoints[i].theta;
            const avgRSquared = (relevantPoints[i].r * relevantPoints[i].r + relevantPoints[i + 1].r * relevantPoints[i + 1].r) / 2;
            area += 0.5 * avgRSquared * dtheta;
        }
        
        return area;
    }
    
    findIntersectionsBetweenFunctions(func1, func2) {
        const intersections = [];
        const points1 = func1.points;
        const points2 = func2.points;
        
        if (points1.length === 0 || points2.length === 0) {
            return intersections;
        }
        
        // Check if either function is implicit (has connected segments)
        const func1IsImplicit = points1.some(p => p.connected);
        const func2IsImplicit = points2.some(p => p.connected);
        
        if (func1IsImplicit || func2IsImplicit) {
            // Use geometric intersection detection for implicit curves
            return this.findIntersectionsGeometric(func1, func2);
        }
        
        // Original method for explicit functions
        return this.findIntersectionsExplicit(func1, func2);
    }
    
    findIntersectionsGeometric(func1, func2) {
        const intersections = [];
        const points1 = func1.points;
        const points2 = func2.points;
        const tolerance = 0.05; // Intersection proximity threshold
        
        // Extract line segments from both functions
        const segments1 = this.extractLineSegments(points1);
        const segments2 = this.extractLineSegments(points2);
        
        // Check each segment from func1 against each segment from func2
        for (const seg1 of segments1) {
            for (const seg2 of segments2) {
                const intersection = this.findSegmentIntersection(seg1, seg2);
                if (intersection) {
                    // Avoid duplicate intersections by checking proximity
                    const isDuplicate = intersections.some(existing => 
                        Math.abs(existing.x - intersection.x) < tolerance &&
                        Math.abs(existing.y - intersection.y) < tolerance
                    );
                    
                    if (!isDuplicate) {
                        intersections.push({
                            x: intersection.x,
                            y: intersection.y,
                            func1: func1,
                            func2: func2,
                            isApproximate: false
                        });
                    }
                }
            }
        }
        
        return intersections;
    }
    
    extractLineSegments(points) {
        const segments = [];
        
        for (let i = 0; i < points.length - 1; i += 3) { // Skip by 3 (start, end, NaN)
            const start = points[i];
            const end = points[i + 1];
            
            if (start && end && 
                isFinite(start.x) && isFinite(start.y) &&
                isFinite(end.x) && isFinite(end.y)) {
                segments.push({ start, end });
            }
        }
        
        return segments;
    }
    
    findSegmentIntersection(seg1, seg2) {
        const { start: p1, end: p2 } = seg1;
        const { start: p3, end: p4 } = seg2;
        
        // Calculate line intersection using parametric form
        const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        
        if (Math.abs(denom) < 1e-10) {
            return null; // Lines are parallel
        }
        
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
        
        // Check if intersection point lies within both line segments
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: p1.x + t * (p2.x - p1.x),
                y: p1.y + t * (p2.y - p1.y)
            };
        }
        
        return null;
    }
    
    findIntersectionsExplicit(func1, func2) {
        const intersections = [];
        const points1 = func1.points;
        const points2 = func2.points;
        
        if (points1.length === 0 || points2.length === 0) {
            return intersections;
        }
        
        // Find intersections by checking sign changes and close points
        // Works for both cartesian and polar since polar points are stored as cartesian coordinates
        
        if (this.plotMode === 'cartesian') {
            // For cartesian functions, check consecutive points in both functions
            // Use the existing function points for efficiency
            for (let i = 0; i < points1.length - 1; i++) {
                const p1_current = points1[i];
                const p1_next = points1[i + 1];
                
                if (!p1_current || !p1_next) continue;
                if (!isFinite(p1_current.x) || !isFinite(p1_current.y)) continue;
                if (!isFinite(p1_next.x) || !isFinite(p1_next.y)) continue;
                
                const x1 = p1_current.x;
                const x2 = p1_next.x;
                
                // Interpolate y values for func2 at these x points
                const y1_at_x1 = p1_current.y;
                const y1_at_x2 = p1_next.y;
                const y2_at_x1 = this.interpolateYAtX(func2, x1);
                const y2_at_x2 = this.interpolateYAtX(func2, x2);
                
                if (y2_at_x1 !== null && y2_at_x2 !== null) {
                    // Check for sign change in (func1 - func2)
                    const diff1 = y1_at_x1 - y2_at_x1;
                    const diff2 = y1_at_x2 - y2_at_x2;
                    
                    if (diff1 * diff2 < 0) { // Sign change detected (crossing intersection)
                        // Linear interpolation to estimate intersection point
                        const ratio = Math.abs(diff1) / (Math.abs(diff1) + Math.abs(diff2));
                        const intersectionX = x1 + ratio * (x2 - x1);
                        const intersectionY = y1_at_x1 + ratio * (y1_at_x2 - y1_at_x1);
                        
                        intersections.push({
                            x: intersectionX,
                            y: intersectionY,
                            func1: func1,
                            func2: func2,
                            isApproximate: true
                        });
                    }
                }
            }
        } else if (this.plotMode === 'polar') {
            // For polar functions, use line segment intersection method
            // This works better for curves that loop back or have multiple y values per x
            for (let i = 0; i < points1.length - 1; i++) {
                const p1_current = points1[i];
                const p1_next = points1[i + 1];
                
                if (!p1_current.connected || !p1_next.connected) continue;
                
                for (let j = 0; j < points2.length - 1; j++) {
                    const p2_current = points2[j];
                    const p2_next = points2[j + 1];
                    
                    if (!p2_current.connected || !p2_next.connected) continue;
                    
                    // Check if line segments intersect
                    const intersection = this.findLineSegmentIntersection(
                        p1_current, p1_next, p2_current, p2_next
                    );
                    
                    if (intersection) {
                        intersections.push({
                            x: intersection.x,
                            y: intersection.y,
                            func1: func1,
                            func2: func2,
                            isApproximate: true
                        });
                    }
                }
            }
        }
        
        return intersections;
    }
    
    findLineSegmentIntersection(p1, p2, p3, p4) {
        // Find intersection between line segments (p1,p2) and (p3,p4)
        // Using parametric line intersection algorithm
        
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        
        // Lines are parallel or coincident
        if (Math.abs(denom) < 1e-10) {
            return null;
        }
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        // Check if intersection is within both line segments
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        
        return null;
    }
    
    interpolateYAtX(func, targetX) {
        const points = func.points;
        if (points.length === 0) return null;
        
        // Find the two points that bracket targetX
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            // Check if targetX is between these points
            if (p1.x <= targetX && targetX <= p2.x) {
                // Check if both points are finite (not NaN)
                if (!isFinite(p1.y) || !isFinite(p2.y)) {
                    return null; // Can't interpolate across discontinuity
                }
                
                // Check for large jumps (asymptotes) using viewport-relative threshold
                const viewportHeight = this.viewport.maxY - this.viewport.minY;
                const jumpThreshold = viewportHeight * 2;
                const yDiff = Math.abs(p2.y - p1.y);
                
                if (yDiff > jumpThreshold) {
                    return null; // Don't interpolate across asymptote
                }
                
                // Linear interpolation
                const ratio = (targetX - p1.x) / (p2.x - p1.x);
                return p1.y + ratio * (p2.y - p1.y);
            }
        }
        
        return null; // targetX is outside the function's domain
    }
    
    parseAndGraphFunction(functionString) {
        // Legacy method - redirect to new system
        if (this.functions.length === 0) {
            this.addFunction(functionString);
        } else {
            this.functions[0].expression = functionString;
            this.plotFunction(this.functions[0]);
        }
    }
    
    // ================================
    // INITIALIZATION AND SETUP
    // ================================
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.initializeTheme();
        this.initializeAngleMode();
        this.initializePolarRangeFields(); // Initialize polar range field styling
        this.initializeCartesianRangeFields(); // Initialize Cartesian range field styling
        this.handleMobileLayout(true); // Force initial layout
        this.startAnimationLoop();
        
        // Apply initial state to ensure UI elements are properly shown/hidden
        this.changeState(this.states.TITLE);
        
        // Capture the actual initial viewport state after setup
        this.initialViewport = {
            scale: this.viewport.scale,
            minX: this.viewport.minX,
            maxX: this.viewport.maxX,
            minY: this.viewport.minY,
            maxY: this.viewport.maxY
        };
    }
    
    setupCanvas() {
        const resizeCanvas = () => {
            const container = document.getElementById('app-container');
            const rect = container.getBoundingClientRect();
            
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;

            // Update both viewports with new canvas dimensions
            this.cartesianViewport.width = rect.width;
            this.cartesianViewport.height = rect.height;
            this.cartesianViewport.centerX = rect.width / 2;
            this.cartesianViewport.centerY = rect.height / 2;

            this.polarViewport.width = rect.width;
            this.polarViewport.height = rect.height;
            this.polarViewport.centerX = rect.width / 2;
            this.polarViewport.centerY = rect.height / 2;

            this.updateViewport();
        };
        
        // Initial resize
        resizeCanvas();
        
        // Handle window resize (desktop) and orientation change (mobile)
        window.addEventListener('resize', () => {
            resizeCanvas();
            this.handleMobileLayout(false); // Don't force layout changes on simple resize
        });
        window.addEventListener('orientationchange', () => {
            // Add a small delay for orientation change to complete
            setTimeout(() => {
                resizeCanvas();
                this.handleMobileLayout(true); // Force layout re-evaluation on orientation change
            }, 100);
            
            // iOS Safari browser bug fix: Run after handleMobileLayout to avoid conflicts
            // Affects both iPhone and iPad in Safari browser mode, but not PWA mode
            if (this.isIOSSafari() && !this.isStandalonePWA()) {
                setTimeout(() => {
                    this.fixIOSSafariElementsVisibility();
                }, 150); // Run after handleMobileLayout
            }
        });
        
        // Additional mobile-specific resize handling
        if ('screen' in window && 'orientation' in window.screen) {
            window.screen.orientation.addEventListener('change', () => {
                setTimeout(() => {
                    resizeCanvas();
                    this.handleMobileLayout(true); // Force layout re-evaluation on screen orientation change
                }, 100);
                
                // iOS Safari browser bug fix: Run after handleMobileLayout to avoid conflicts
                // Affects both iPhone and iPad in Safari browser mode, but not PWA mode
                if (this.isIOSSafari() && !this.isStandalonePWA()) {
                    setTimeout(() => {
                        this.fixIOSSafariElementsVisibility();
                    }, 150); // Run after handleMobileLayout
                }
            });
        }
        
        // Handle visual viewport changes (mobile keyboard, etc.)
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', resizeCanvas);
        }
    }
    
    setupEventListeners() {
        // Wait for elements to be available
        const addFunctionButton = document.getElementById('add-function');
        const resetViewButton = document.getElementById('reset-view');
        const intersectionToggleButton = document.getElementById('intersection-toggle');
        const turningPointsToggleButton = document.getElementById('turning-points-toggle');
        const xMinInput = document.getElementById('x-min');
        const xMaxInput = document.getElementById('x-max');
        const yMinInput = document.getElementById('y-min');
        const yMaxInput = document.getElementById('y-max');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const functionPanel = document.getElementById('function-panel');
        const titleScreen = document.getElementById('title-screen');
        
        // Title screen start listeners - click, touch, or keyboard
        if (titleScreen) {
            // Mouse click to start
            titleScreen.addEventListener('click', (e) => {
                if (this.currentState === this.states.TITLE) {
                    // Don't trigger on link clicks
                    if (e.target.tagName !== 'A') {
                        this.startGraphing();
                    }
                }
            });
            
            // Touch tap to start (separate from click to avoid double triggering)
            titleScreen.addEventListener('touchend', (e) => {
                if (this.currentState === this.states.TITLE) {
                    // Don't trigger on link taps
                    if (e.target.tagName !== 'A') {
                        e.preventDefault(); // Prevent click event
                        e.stopPropagation(); // Prevent event bubbling to document handlers
                        this.startGraphing();
                    }
                }
            });
        }
        
        // Keyboard listeners for Space and Enter
        document.addEventListener('keydown', (e) => {
            if (this.currentState === this.states.TITLE) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    this.startGraphing();
                }
            }
        });

        // UI Button Events
        
        if (addFunctionButton) {
            addFunctionButton.addEventListener('click', () => {
                // Clear intersection badges since adding a function changes the intersection landscape
                this.clearIntersections();
                // Note: Don't clear function badges when adding functions - preserve existing trace points
                this.addFunction('');
            });
        }

        // Examples dropdown toggle
        const examplesToggle = document.getElementById('examples-toggle');
        const examplesDropdown = document.getElementById('examples-dropdown');
        
        if (examplesToggle && examplesDropdown && functionPanel) {
            examplesToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Position the dropdown to match the function panel width
                const panelRect = functionPanel.getBoundingClientRect();
                const toggleRect = examplesToggle.getBoundingClientRect();
                
                // Set dropdown width to match panel content width (minus padding)
                const panelPadding = 40; // 20px padding on each side
                examplesDropdown.style.width = `${panelRect.width - panelPadding}px`;
                examplesDropdown.style.left = `${panelRect.left + 20}px`; // 20px padding
                examplesDropdown.style.top = `${toggleRect.bottom + 4}px`;
                
                examplesDropdown.classList.toggle('show');
                
                // Update examples based on current mode
                this.updateExamplesForMode();
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!examplesDropdown.contains(e.target) && e.target !== examplesToggle) {
                    examplesDropdown.classList.remove('show');
                }
            });
            
            // Handle example item clicks
            examplesDropdown.addEventListener('click', (e) => {
                const exampleItem = e.target.closest('.example-item, .blank-function-item');
                if (exampleItem) {
                    const expression = exampleItem.dataset.expression;
                    
                    // Clear intersections when adding a function
                    this.clearIntersections();
                    
                    if (expression) {
                        // Add example function using smart slot-filling logic
                        this.addExampleFunction(expression);
                    } else {
                        // Add blank function
                        this.addFunction('');
                    }
                    
                    // Close dropdown
                    examplesDropdown.classList.remove('show');
                }
            });
        }

        // Mode toggle button
        const modeToggle = document.getElementById('mode-toggle');
        if (modeToggle) {
            modeToggle.addEventListener('click', () => {
                this.togglePlotMode();
            });
        }

        // Polar range inputs
        const thetaMinInput = document.getElementById('theta-min');
        const thetaMaxInput = document.getElementById('theta-max');
        const negativeRToggle = document.getElementById('negative-r-toggle');
        
        if (thetaMinInput) {
            thetaMinInput.addEventListener('input', () => {
                // Stop animation when changing theta range
                if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
                    this.stopPolarAnimation();
                    // Update UI to show stopped state
                    const playIcon = document.getElementById('play-icon');
                    const pauseIcon = document.getElementById('pause-icon');
                    const playPauseText = document.getElementById('play-pause-text');
                    const polarStopButton = document.getElementById('polar-stop-animation');
                    if (playIcon && pauseIcon && playPauseText) {
                        playIcon.style.display = 'block';
                        pauseIcon.style.display = 'none';
                        playPauseText.textContent = 'Play';
                    }
                    if (polarStopButton) {
                        polarStopButton.style.opacity = '0.6';
                        polarStopButton.style.background = '#1a2a3f';
                    }
                    // Reset stored animation state so new range is used on next play
                    this.polarAnimation.storedThetaMax = 0;
                    this.polarAnimation.currentTheta = 0;
                }
                
                // Validate theta ranges
                const thetaMin = this.getRangeValue(thetaMinInput);
                const thetaMax = this.getRangeValue(thetaMaxInput);
                
                console.log('[ThetaMin] Input event - thetaMin:', thetaMin, 'thetaMax:', thetaMax, 'latex:', thetaMinInput.getValue());
                
                // Check for NaN
                if (isNaN(thetaMin)) {
                    console.log('[ThetaMin] Setting error (NaN)');
                    this.setInputError(thetaMinInput, true);
                } else {
                    // Store both the LaTeX string (for display) and numeric value (for calculations)
                    this.polarSettings.thetaMinLatex = thetaMinInput.getValue();
                    this.polarSettings.thetaMin = thetaMin;
                    
                    // Only clear thetaMin error if it's valid AND logical constraints pass
                    if (isNaN(thetaMax) || thetaMin < thetaMax) {
                        console.log('[ThetaMin] Clearing error (valid)');
                        this.setInputError(thetaMinInput, false);
                    } else {
                        console.log('[ThetaMin] NOT clearing error (logical constraint)');
                    }
                }
                
                // Check logical constraint: min >= max
                if (!isNaN(thetaMin) && !isNaN(thetaMax) && thetaMin >= thetaMax) {
                    console.log('[ThetaMin] Setting errors (min >= max)');
                    this.setInputError(thetaMinInput, true);
                    this.setInputError(thetaMaxInput, true);
                }
                
                this.saveViewportBounds();
                this.replotAllFunctions();
            });
        }
        
        if (thetaMaxInput) {
            thetaMaxInput.addEventListener('input', () => {
                // Stop animation when changing theta range
                if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
                    this.stopPolarAnimation();
                    // Update UI to show stopped state
                    const playIcon = document.getElementById('play-icon');
                    const pauseIcon = document.getElementById('pause-icon');
                    const playPauseText = document.getElementById('play-pause-text');
                    const polarStopButton = document.getElementById('polar-stop-animation');
                    if (playIcon && pauseIcon && playPauseText) {
                        playIcon.style.display = 'block';
                        pauseIcon.style.display = 'none';
                        playPauseText.textContent = 'Play';
                    }
                    if (polarStopButton) {
                        polarStopButton.style.opacity = '0.6';
                        polarStopButton.style.background = '#1a2a3f';
                    }
                    // Reset stored animation state so new range is used on next play
                    this.polarAnimation.storedThetaMax = 0;
                    this.polarAnimation.currentTheta = 0;
                }
                
                // Validate theta ranges
                const thetaMin = this.getRangeValue(thetaMinInput);
                const thetaMax = this.getRangeValue(thetaMaxInput);
                
                console.log('[ThetaMax] Input event - thetaMin:', thetaMin, 'thetaMax:', thetaMax, 'latex:', thetaMaxInput.getValue());
                
                // Check for NaN
                if (isNaN(thetaMax)) {
                    console.log('[ThetaMax] Setting error (NaN)');
                    this.setInputError(thetaMaxInput, true);
                } else {
                    // Store both the LaTeX string (for display) and numeric value (for calculations)
                    this.polarSettings.thetaMaxLatex = thetaMaxInput.getValue();
                    this.polarSettings.thetaMax = thetaMax;
                    
                    // Only clear thetaMax error if it's valid AND logical constraints pass
                    if (isNaN(thetaMin) || thetaMin < thetaMax) {
                        console.log('[ThetaMax] Clearing error (valid)');
                        this.setInputError(thetaMaxInput, false);
                    } else {
                        console.log('[ThetaMax] NOT clearing error (logical constraint)');
                    }
                }
                
                // Check logical constraint: min >= max
                if (!isNaN(thetaMin) && !isNaN(thetaMax) && thetaMin >= thetaMax) {
                    console.log('[ThetaMax] Setting errors (min >= max)');
                    this.setInputError(thetaMinInput, true);
                    this.setInputError(thetaMaxInput, true);
                }
                
                this.saveViewportBounds();
                this.replotAllFunctions();
            });
        }
        


        if (negativeRToggle) {
            negativeRToggle.addEventListener('change', () => {
                this.polarSettings.plotNegativeR = negativeRToggle.checked;  // Checkbox checked = plot negative r
                this.replotAllFunctions();
            });
        }

        // Polar animation controls
        const polarPlayPauseButton = document.getElementById('polar-play-pause');
        const polarStopButton = document.getElementById('polar-stop-animation');
        const polarStepBackButton = document.getElementById('polar-step-back');
        const polarStepForwardButton = document.getElementById('polar-step-forward');
        const polarSpeedSlider = document.getElementById('polar-speed-slider');
        const polarLoopToggle = document.getElementById('polar-loop-toggle');
        const speedDisplay = document.getElementById('speed-display');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const playPauseText = document.getElementById('play-pause-text');
        
        // Initialize Stop button and step buttons as dimmed (inactive state)
        if (polarStopButton) {
            polarStopButton.style.opacity = '0.6';
            polarStopButton.style.background = '#1a2a3f';
        }
        if (polarStepBackButton) {
            polarStepBackButton.style.opacity = '0.6';
            polarStepBackButton.style.background = '#1a2a3f';
            polarStepBackButton.disabled = true;
        }
        if (polarStepForwardButton) {
            polarStepForwardButton.style.opacity = '0.6';
            polarStepForwardButton.style.background = '#1a2a3f';
            polarStepForwardButton.disabled = true;
        }
        
        if (polarPlayPauseButton) {
            polarPlayPauseButton.addEventListener('click', () => {
                if (this.polarAnimation.isAnimating) {
                    // Pause animation (keeps current position)
                    this.pausePolarAnimation();
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                    playPauseText.textContent = 'Play';
                } else {
                    // Start or resume animation
                    this.startPolarAnimation();
                    playIcon.style.display = 'none';
                    pauseIcon.style.display = 'block';
                    playPauseText.textContent = 'Pause';
                }
            });
        }
        
        if (polarStopButton) {
            polarStopButton.addEventListener('click', () => {
                this.stopPolarAnimation();
                // Update UI to show stopped state
                if (playIcon && pauseIcon && playPauseText) {
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                    playPauseText.textContent = 'Play';
                }
                // Dim Stop button since it's now inactive
                polarStopButton.style.opacity = '0.6';
                polarStopButton.style.background = '#1a2a3f';
            });
        }
        
        if (polarStepBackButton) {
            polarStepBackButton.addEventListener('click', () => {
                this.stepPolarAnimationBackward();
            });
        }
        
        if (polarStepForwardButton) {
            polarStepForwardButton.addEventListener('click', () => {
                this.stepPolarAnimationForward();
            });
        }
        
        if (polarSpeedSlider && speedDisplay) {
            polarSpeedSlider.addEventListener('input', () => {
                this.polarAnimation.animationSpeed = parseFloat(polarSpeedSlider.value);
                speedDisplay.textContent = `${this.polarAnimation.animationSpeed.toFixed(2)}x`;
            });
        }
        
        if (polarLoopToggle) {
            polarLoopToggle.addEventListener('change', () => {
                this.polarAnimation.shouldLoop = polarLoopToggle.checked;
            });
        }

        if (resetViewButton) {
            resetViewButton.addEventListener('click', () => {
                // Note: Don't clear badges when resetting view - preserve tracing state
                
                // Close the function panel only on mobile devices
                if (this.isTrueMobile()) {
                    this.closeMobileMenu();
                }
                
                // In polar mode, also reset theta range to appropriate defaults
                if (this.plotMode === 'polar') {
                    this.resetPolarRange();
                }
                
                // Use smart reset based on current functions
                const smartViewport = this.getSmartResetViewport();
                
                // Set scale only if provided (cartesian mode), polar mode will calculate it
                if (smartViewport.scale !== undefined) {
                    this.viewport.scale = smartViewport.scale;
                }
                this.viewport.minX = smartViewport.minX;
                this.viewport.maxX = smartViewport.maxX;
                this.viewport.minY = smartViewport.minY;
                this.viewport.maxY = smartViewport.maxY;

                // Force recalculation of scale based on current viewport dimensions
                this.updateViewportScale();
                
                // For polar mode, enforce 1:1 aspect ratio for proper circular display
                this.enforcePolarAspectRatio();
                
                // Update range inputs to reflect the reset
                this.updateRangeInputs();

                // Force a complete redraw to ensure viewport is current
                this.draw();
                
                // Re-plot all functions with the reset viewport
                this.replotAllFunctions();
            });
        }
        
        // Axis Intercepts Toggle
        const interceptsToggleButton = document.getElementById('intercepts-toggle');
        if (interceptsToggleButton) {
            interceptsToggleButton.addEventListener('click', () => {
                // Toggle intercept detection
                this.showIntercepts = !this.showIntercepts;
                
                // Update button visual state
                this.updateInterceptsToggleButton();
                
                if (this.showIntercepts) {
                    // Recalculate and show intercepts
                    this.intercepts = this.findAxisIntercepts();
                    this.cullInterceptMarkers(); // Pre-calculate culled markers for performance
                } else {
                    // Clear intercepts
                    this.clearIntercepts();
                }
                
                // Redraw to show/hide intercept markers
                this.draw();
            });
        }
        
        // Intersection Toggle
        if (intersectionToggleButton) {
            intersectionToggleButton.addEventListener('click', () => {
                // Toggle intersection detection
                this.showIntersections = !this.showIntersections;
                
                // Update button visual state
                this.updateIntersectionToggleButton();
                
                if (this.showIntersections) {
                    // Recalculate and show intersections using Web Worker
                    this.intersections = this.calculateIntersectionsWithWorker();
                } else {
                    // Clear intersections
                    this.clearIntersections();
                }
                
                // Redraw to show/hide intersection markers
                this.draw();
            });
        }
        
        // Turning Points Toggle
        if (turningPointsToggleButton) {
            turningPointsToggleButton.addEventListener('click', () => {
                // Toggle turning point detection (now works in both modes)
                this.showTurningPoints = !this.showTurningPoints;
                
                // Update button visual state
                this.updateTurningPointsToggleButton();
                
                if (this.showTurningPoints) {
                    // Recalculate and show turning points (works for both Cartesian and polar)
                    this.turningPoints = this.findTurningPoints();
                } else {
                    // Clear turning points and badges
                    this.clearTurningPoints();
                }
                
                // Redraw to show/hide turning point markers
                this.draw();
            });
        }
        
        // Theme Toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                // Note: Don't clear badges when changing theme - preserve tracing state
                this.toggleTheme();
            });
        }
        
        // Keyboard Shortcuts Overlay
        const shortcutsOverlay = document.getElementById('shortcuts-overlay');
        if (shortcutsOverlay) {
            // Close overlay when clicking outside the content
            shortcutsOverlay.addEventListener('click', (e) => {
                if (e.target === shortcutsOverlay) {
                    this.toggleShortcutsOverlay();
                }
            });
        }
        
        // Angle Mode Toggle
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            angleModeToggle.addEventListener('click', () => {
                // Don't allow angle mode change during animation
                if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
                    return;
                }
                
                // Clear all badges when changing angle mode (coordinate system change)
                this.clearAllBadges();
                this.toggleAngleMode();
            });
        }
        
        // Parameter Sliders
        this.initializeParameterSliders();
        
        // Mobile Menu Events
        if (hamburgerMenu) {
            hamburgerMenu.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                this.closeMobileMenu();
            });
        }
        
        // Function Panel Touch Events - prevent touch events from bubbling to canvas
        if (functionPanel) {
            functionPanel.addEventListener('touchstart', (e) => {
                e.stopPropagation(); // Prevent bubbling to document/canvas handlers
            }, { passive: true });
            
            functionPanel.addEventListener('touchmove', (e) => {
                e.stopPropagation(); // Prevent bubbling to document/canvas handlers
            }, { passive: true });
            
            functionPanel.addEventListener('touchend', (e) => {
                e.stopPropagation(); // Prevent bubbling to document/canvas handlers
            }, { passive: true });
        }
        
        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerStart(e.clientX, e.clientY));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e.clientX, e.clientY));
        this.canvas.addEventListener('mouseup', () => this.handlePointerEnd());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Global mouse events to handle mouse release outside canvas (fixes sticky panning)
        document.addEventListener('mouseup', () => this.handlePointerEnd());
        document.addEventListener('mousemove', (e) => {
            // Only handle if mouse is down and cursor is outside canvas
            if (this.input.mouse.down) {
                this.handlePointerMove(e.clientX, e.clientY);
            }
        });
        
        // Click on canvas to close hamburger menu (mobile and tablet)
        this.canvas.addEventListener('click', (e) => {
            // Close keyboard when clicking canvas (for mouse/desktop usage)
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                // FIRST: Blur all math-fields so MathLive won't reopen keyboard
                const allMathFields = document.querySelectorAll('math-field');
                allMathFields.forEach(mf => {
                    if (mf.hasFocus()) {
                        mf.blur();
                    }
                    mf.setAttribute('data-blur-protected', 'true');
                });
                // THEN: Hide keyboard after blur
                window.mathVirtualKeyboard.hide();
                // Remove protection after a delay
                setTimeout(() => {
                    allMathFields.forEach(mf => mf.removeAttribute('data-blur-protected'));
                }, 500);
            }
            
            // Close function panel on narrow screens when clicking the graph area
            const isNarrowScreen = window.innerWidth < 1024;
            if (isNarrowScreen) {
                const functionPanel = document.getElementById('function-panel');
                // Close panel if it's open
                if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                    this.closeMobileMenu();
                }
            }
        });
        
        // Additional touchend handler for narrow screens that might not trigger the canvas click properly
        this.canvas.addEventListener('touchend', (e) => {
            // On narrow screens, also check if we should close the function panel
            // This is a backup for cases where click might not work properly on touch devices
            const isNarrowScreen = window.innerWidth < 1024;
            if (isNarrowScreen && e.touches.length === 0) {
                const functionPanel = document.getElementById('function-panel');
                if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                    // Simple tap detection - if the touch was quick and didn't move much
                    setTimeout(() => {
                        // Use a small delay to avoid conflicts with the existing touch handler
                        if (functionPanel.classList.contains('mobile-open')) {
                            this.closeMobileMenu();
                        }
                    }, 50);
                }
            }
        }, { passive: true });
        
        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchMove(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            // Close keyboard when tapping canvas on touch devices
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                // FIRST: Blur all math-fields so MathLive won't reopen keyboard
                const allMathFields = document.querySelectorAll('math-field');
                allMathFields.forEach(mf => {
                    if (mf.hasFocus()) {
                        mf.blur();
                    }
                    mf.setAttribute('data-blur-protected', 'true');
                });
                // THEN: Hide keyboard after blur
                window.mathVirtualKeyboard.hide();
                // Remove protection after a delay
                setTimeout(() => {
                    allMathFields.forEach(mf => mf.removeAttribute('data-blur-protected'));
                }, 500);
            }
            
            this.handleTouchEnd(e);
        }, { passive: false });
        
        // Keyboard Events
        document.addEventListener('keydown', (e) => {
            this.input.keys.add(e.key.toLowerCase());
            this.handleKeyboard(e);
        });
        
        document.addEventListener('keyup', (e) => {
            this.input.keys.delete(e.key.toLowerCase());
        });
        
        // Document-level touch events for hamburger menu closure
        document.addEventListener('touchstart', (e) => {
            // Don't handle if interaction is with MathLive virtual keyboard
            if (e.target.closest('.ML__keyboard') || e.target.closest('math-field')) {
                return;
            }
            
            // Additional iOS-specific check: if MathLive virtual keyboard is visible, ignore all touch events
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                return;
            }
            
            // Only handle if not on canvas, hamburger menu, or function panel (they have their own handlers)
            const hamburgerMenu = document.getElementById('hamburger-menu');
            const functionPanel = document.getElementById('function-panel');
            if (e.target !== this.canvas && 
                e.target !== hamburgerMenu && !hamburgerMenu?.contains(e.target) &&
                e.target !== functionPanel && !functionPanel?.contains(e.target)) {
                const touch = e.touches[0];
                this.input.startX = touch.clientX;
                this.input.startY = touch.clientY;
                this.input.startTime = Date.now();
                this.input.maxMoveDistance = 0;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            // Don't handle if interaction is with MathLive virtual keyboard
            if (e.target.closest('.ML__keyboard') || e.target.closest('math-field')) {
                return;
            }
            
            // Only handle if not on canvas, hamburger menu, or function panel and we have start coordinates
            const hamburgerMenu = document.getElementById('hamburger-menu');
            const functionPanel = document.getElementById('function-panel');
            if (e.target !== this.canvas && 
                e.target !== hamburgerMenu && !hamburgerMenu?.contains(e.target) &&
                e.target !== functionPanel && !functionPanel?.contains(e.target) && 
                this.input.startX !== null && this.input.startY !== null) {
                const touch = e.touches[0];
                const moveDistance = Math.sqrt(
                    Math.pow(touch.clientX - this.input.startX, 2) + 
                    Math.pow(touch.clientY - this.input.startY, 2)
                );
                this.input.maxMoveDistance = Math.max(this.input.maxMoveDistance, moveDistance);
            }
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            // Only handle mobile menu closing on mobile devices
            if (!this.isTrueMobile()) return;
            
            // Don't handle if interaction is with MathLive virtual keyboard
            if (e.target.closest('.ML__keyboard') || e.target.closest('math-field')) {
                return;
            }
            
            // Additional iOS-specific check: if MathLive virtual keyboard is visible, ignore all touch events
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                return;
            }
            
            // Only handle if not on canvas, hamburger menu, or function panel and we have start coordinates
            const hamburgerMenu = document.getElementById('hamburger-menu');
            const functionPanel = document.getElementById('function-panel');
            if (e.target !== this.canvas && 
                e.target !== hamburgerMenu && !hamburgerMenu?.contains(e.target) &&
                e.target !== functionPanel && !functionPanel?.contains(e.target) && 
                this.input.startX !== null && this.input.startY !== null) {
                const tapDuration = Date.now() - this.input.startTime;
                const isTap = this.input.maxMoveDistance <= 10 && tapDuration <= 300;
                
                if (isTap) {
                    // Close function panel on narrow screens when tapping outside it
                    const isNarrowScreen = window.innerWidth < 1024;
                    if (isNarrowScreen) {
                        const functionPanel = document.getElementById('function-panel');
                        if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                            const rect = functionPanel.getBoundingClientRect();
                            const tapX = this.input.startX;
                            const tapY = this.input.startY;
                            
                            // If tap is outside the function panel, close it
                            if (tapX < rect.left || tapX > rect.right || 
                                tapY < rect.top || tapY > rect.bottom) {
                                this.closeMobileMenu();
                            }
                        }
                    }
                }
                
                // Reset tap tracking
                this.input.startX = null;
                this.input.startY = null;
                this.input.startTime = null;
                this.input.maxMoveDistance = 0;
            }
        }, { passive: true });
        
        // Range inputs real-time updates
        [xMinInput, xMaxInput, yMinInput, yMaxInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    this.clearAllBadges(); // Clear badges when viewport changes
                    
                    // Validation handled by validateAndSetRange() which is called via debounce
                    // and also from the input listeners in initializeCartesianRangeFields()
                    
                    this.debounceRangeUpdate();
                });
                
                input.addEventListener('keydown', (e) => {
                    this.clearAllBadges(); // Clear badges when viewport changes
                    if (e.key === 'Enter') {
                        // Force immediate update on Enter, bypassing debounce
                        this.validateAndSetRange();
                    }
                    // Removed custom minus key handling - let browser handle it naturally
                });
            }
        });
    }
    
    handlePointerStart(x, y) {
        // Convert client coordinates to canvas coordinates
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        
        this.input.mouse.x = canvasX;
        this.input.mouse.y = canvasY;
        this.input.mouse.down = true;
        this.input.lastX = canvasX;
        this.input.lastY = canvasY;
        this.input.dragging = false;
        
        // Check if we should enter tracing mode
        if (this.currentState === this.states.GRAPHING) {
            // Update badge positions for accurate click detection
            this.updateBadgeScreenPositions();
            
            // Force a draw to update panel bounds, then check for checkbox click
            this.draw();
            
            const clickedCheckbox = this.findIntegralLabelAtPoint(canvasX, canvasY);
            if (clickedCheckbox) {
                this.handleIntegralLabelClick(clickedCheckbox);
                return; // Exit early
            }
            
            // Check if user clicked on an existing badge marker
            const targetBadge = this.findBadgeAtScreenPosition(canvasX, canvasY, 25);
            if (targetBadge) {
                // Store badge state for cycling behavior: no tangent → tangent → neon tangent → normal → neon normal → integral → neon integral → remove
                this.input.badgeInteraction.originalBadgeState = {
                    hasTangent: targetBadge.hasTangent,
                    hasNormal: targetBadge.hasNormal,
                    hasIntegral: targetBadge.hasIntegral,
                    neonNormal: targetBadge.neonNormal,
                    neonIntegral: targetBadge.neonIntegral,
                    tangentSlope: targetBadge.tangentSlope,
                    tangentExpression: targetBadge.tangentExpression,
                    neonTangent: targetBadge.neonTangent || false
                };
                
                // Store badge ID for integral pair removal if needed
                this.input.badgeInteraction.originalBadgeId = targetBadge.id;
                
                // If this is an integral badge, find and store its pair badge ID
                if (targetBadge.hasIntegral) {
                    const pair = this.integralPairs.find(p => 
                        p.badge1Id === targetBadge.id || p.badge2Id === targetBadge.id
                    );
                    if (pair) {
                        this.input.badgeInteraction.integralPairBadgeId = 
                            pair.badge1Id === targetBadge.id ? pair.badge2Id : pair.badge1Id;
                    }
                }
                
                // If badge has tangent, initialize currentSlope for live updates during drag
                if (targetBadge.hasTangent && targetBadge.tangentSlope !== null) {
                    this.input.tracing.currentSlope = targetBadge.tangentSlope;
                    this.input.tracing.neonTangent = targetBadge.neonTangent || false;
                    this.input.tracing.hasNormal = false;
                    this.input.tracing.neonNormal = false;
                } else if (targetBadge.hasNormal && targetBadge.tangentSlope !== null) {
                    this.input.tracing.currentSlope = targetBadge.tangentSlope;
                    this.input.tracing.neonTangent = false;
                    this.input.tracing.hasNormal = true;
                    this.input.tracing.neonNormal = targetBadge.neonNormal || false;
                } else {
                    this.input.tracing.currentSlope = null;
                    this.input.tracing.neonTangent = false;
                    this.input.tracing.hasNormal = false;
                    this.input.tracing.neonNormal = false;
                }
                
                // Immediately enter badge interaction mode with visual feedback
                this.input.badgeInteraction.targetBadge = targetBadge;
                this.input.badgeInteraction.startTime = Date.now();
                this.input.badgeInteraction.startX = x;
                this.input.badgeInteraction.startY = y;
                this.input.badgeInteraction.isHolding = true; // Start in hold mode immediately
                
                // If badge has tangent or normal, clear frozen intercepts
                if ((targetBadge.hasTangent || targetBadge.hasNormal) && this.showIntercepts) {
                    this.frozenInterceptBadges = [];
                }
                
                // Remove tangent and normal intersection badges that reference this badge
                this.removeTangentIntersectionBadgesForBadge(targetBadge.id);
                this.removeNormalIntersectionBadgesForBadge(targetBadge.id);
                
                // Note: Don't remove the integral pair here during drag - just remove the single badge
                // The pair will be automatically re-established by updateIntegralPairs() after the new badge is created
                // We pass 'true' to indicate this is a reposition, not a deletion
                
                // Remove the original badge right away (but not its integral pair if repositioning)
                const badge = this.input.persistentBadges.find(b => b.id === targetBadge.id);
                this.input.persistentBadges = this.input.persistentBadges.filter(b => b.id !== targetBadge.id);
                
                // Recalculate intercepts immediately if the badge had a tangent or normal
                // And set viewport changing to false AFTER recalculation
                if ((targetBadge.hasTangent || targetBadge.hasNormal) && this.showIntercepts) {
                    this.isViewportChanging = false;
                    this.intercepts = this.findAxisIntercepts();
                    this.cullInterceptMarkers(); // Update culled marker cache
                    this.draw(); // Force redraw to clear old intercept markers
                }
                
                // Start tracing mode for immediate responsiveness
                const targetFunction = this.findFunctionById(targetBadge.functionId);
                if (targetFunction) {
                    this.startTracingAtWorldPosition(targetBadge.worldX, targetBadge.worldY, targetFunction);
                    // Preserve theta for polar functions
                    if (targetBadge.theta !== null && targetBadge.theta !== undefined) {
                        this.input.tracing.theta = targetBadge.theta;
                    }
                }
                return; // Exit early - don't process other input logic
            }
            
            // Third, check for intersection marker tap (only if no badge/label was clicked)
            const tappedIntersection = this.findIntersectionAtScreenPoint(x, y);
            if (tappedIntersection) {
                // Handle intersection tap and exit early
                this.handleIntersectionTap(tappedIntersection, x, y);
                return; // Don't process any other input logic
            }
            
            // Fourth, check for intercept marker tap (only if no intersection was clicked)
            const tappedIntercept = this.findInterceptAtScreenPoint(x, y);
            if (tappedIntercept) {
                // Handle intercept tap and exit early
                this.handleInterceptTap(tappedIntercept, x, y);
                return; // Don't process any other input logic
            }
            
            // Fifth, check for turning point marker tap (only if no intersection/intercept was clicked)
            const tappedTurningPoint = this.findTurningPointAtScreenPoint(x, y);
            if (tappedTurningPoint) {
                // Handle turning point tap and exit early
                this.handleTurningPointTap(tappedTurningPoint, x, y);
                return; // Don't process any other input logic
            }
            
            // If no badge, label, intersection, intercept, or turning point was clicked, check for function curve tracing
            // Clear any previous badge interaction state
            this.input.badgeInteraction.targetBadge = null;
            this.input.badgeInteraction.startTime = 0;
            this.input.badgeInteraction.startX = 0;
            this.input.badgeInteraction.startY = 0;
            this.input.badgeInteraction.isHolding = false;
            this.input.badgeInteraction.originalBadgeState = null; // Clear badge state for new trace points
            
            // Determine tolerance based on input type (mouse vs touch)
            const tolerance = this.input.touch.active ? 
                this.input.tracing.tolerance.touch : 
                this.input.tracing.tolerance.mouse;
            
            const curvePoint = this.findClosestCurvePoint(x, y, tolerance);
            
            // Don't allow tracing during polar animation or pause
            if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
                this.input.tracing.active = false;
                return;
            }
            
            if (curvePoint) {
                // Enter tracing mode (don't clear existing badges)
                this.input.tracing.active = true;
                this.input.tracing.functionId = curvePoint.function.id;
                this.input.tracing.worldX = curvePoint.worldX;
                this.input.tracing.worldY = curvePoint.worldY;
                this.input.tracing.theta = curvePoint.theta; // Store theta for polar parametric tracing
            } else {
                // Normal panning mode
                this.input.tracing.active = false;
            }
        }
    }
    
    handlePointerMove(x, y) {
        // Convert client coordinates to canvas coordinates
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        
        if (this.input.mouse.down && this.currentState === this.states.GRAPHING) {
            const deltaX = canvasX - this.input.lastX;
            const deltaY = canvasY - this.input.lastY;
            
            // Badge interaction is now handled immediately in handlePointerStart
            // All badge interactions start in tracing mode right away
            
            if (this.input.tracing.active) {
                // Tracing mode - update on every movement for smooth tracing
                const currentWorldPos = this.screenToWorld(canvasX, canvasY);
                const tracingFunction = this.findFunctionById(this.input.tracing.functionId);
                
                if (tracingFunction) {
                    // Trace the function at the new position
                    // Pass theta for polar functions, x/y for implicit, x for explicit
                    const tracePoint = this.traceFunction(
                        tracingFunction, 
                        currentWorldPos.x, 
                        currentWorldPos.y,
                        this.input.tracing.theta, // Pass current theta for polar parametric tracing
                        deltaX // Pass actual mouse movement for polar functions
                    );
                    
                    if (tracePoint) {
                        this.input.tracing.worldX = tracePoint.x;
                        this.input.tracing.worldY = tracePoint.y;
                        
                        // Update theta if returned (for polar functions)
                        if (tracePoint.theta !== undefined) {
                            this.input.tracing.theta = tracePoint.theta;
                        }
                        
                        // If original badge had a tangent or normal, recalculate slope at new position
                        if (this.input.badgeInteraction.originalBadgeState && 
                            (this.input.badgeInteraction.originalBadgeState.hasTangent || 
                             this.input.badgeInteraction.originalBadgeState.hasNormal)) {
                            // Pass both x and y for implicit functions, theta for polar functions
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, tracePoint.x, tracePoint.y, this.input.tracing.theta);
                            if (slopeData) {
                                this.input.tracing.currentSlope = slopeData;
                                this.input.tracing.currentSecondDerivative = slopeData.secondDerivative;
                            }
                        } else {
                            this.input.tracing.currentSlope = null;
                            this.input.tracing.currentSecondDerivative = null;
                        }
                        
                        // If original badge was an integral badge, update integral pairs in real-time
                        if (this.input.badgeInteraction.originalBadgeState && 
                            this.input.badgeInteraction.originalBadgeState.hasIntegral) {
                            this.updateIntegralPairs();
                        }
                    }
                }
                
                // Mark as dragging for any movement in tracing mode
                if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                    this.input.dragging = true;
                }
            } else {
                // Normal panning mode - use threshold to prevent jittery panning
                if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                    this.input.dragging = true;
                    
                    // Convert screen delta to world delta
                    const worldRange = this.viewport.maxX - this.viewport.minX;
                    const worldDeltaX = -(deltaX / this.viewport.width) * worldRange;
                    const worldDeltaY = (deltaY / this.viewport.height) * (this.viewport.maxY - this.viewport.minY);
                    
                    // Pan the viewport
                    this.viewport.minX += worldDeltaX;
                    this.viewport.maxX += worldDeltaX;
                    this.viewport.minY += worldDeltaY;
                    this.viewport.maxY += worldDeltaY;
                    
                    // Update range inputs to reflect the pan (immediate for responsiveness)
                    this.updateRangeInputs();
                    
                    // During panning, just redraw existing points without recalculating
                    // This dramatically improves performance (75fps instead of <20fps with 5 functions)
                    // Functions will be recalculated when panning stops via handleViewportChange()
                    
                    // Redraw the entire canvas to ensure proper clearing and avoid ghost artifacts
                    this.draw();
                    
                    // Debounce the expensive intersection/turning point calculations and implicit function replotting
                    this.handleViewportChange();
                }
            }
            
            this.input.lastX = canvasX;
            this.input.lastY = canvasY;
        }
        
        this.input.mouse.x = canvasX;
        this.input.mouse.y = canvasY;
    }
    
    handlePointerEnd() {
        // Safety check: prevent duplicate handling if already processed
        if (!this.input.mouse.down) {
            return;
        }
        
        // Handle badge interaction (tap vs hold based on movement, not time)
        if (this.input.badgeInteraction.targetBadge) {
            const totalMovement = Math.sqrt(
                Math.pow(this.input.mouse.x - this.input.badgeInteraction.startX, 2) + 
                Math.pow(this.input.mouse.y - this.input.badgeInteraction.startY, 2)
            );
            
            // Determine if this was a tap (for cycling) or a drag (for repositioning)
            const wasTap = totalMovement < this.input.badgeInteraction.moveThreshold;
            const holdDuration = Date.now() - this.input.badgeInteraction.startTime;
            const wasQuickTap = wasTap && holdDuration < this.input.badgeInteraction.holdThreshold;
            
            // Store whether this was a tap for later use
            this.input.badgeInteraction.wasTap = wasQuickTap;
            
            // If user didn't move much and released quickly, it was a tap - cycle badge state
            if (wasQuickTap) {
                // Quick tap with minimal movement - cycle through states
                // State cycle: no line → tangent → neon tangent → normal → neon normal → integral → neon integral → removed
                const originalState = this.input.badgeInteraction.originalBadgeState;
                
                if (!originalState.hasTangent && !originalState.hasNormal && !originalState.hasIntegral) {
                    // Badge had no line → add tangent, keep badge
                    // Don't cancel tracing, let it add the badge with tangent below
                } else if (originalState.hasTangent && !originalState.neonTangent) {
                    // Badge had tangent → switch to neon tangent, keep badge
                    // Don't cancel tracing, let it add the badge with neon tangent below
                } else if (originalState.hasTangent && originalState.neonTangent) {
                    // Badge had neon tangent → switch to normal, keep badge
                    // Don't cancel tracing, let it add the badge with normal below
                } else if (originalState.hasNormal && !originalState.neonNormal) {
                    // Badge had normal → switch to neon normal, keep badge
                    // Don't cancel tracing, let it add the badge with neon normal below
                } else if (originalState.hasNormal && originalState.neonNormal) {
                    // Badge had neon normal → check if we can add integral
                    // Count existing integral badges on this function
                    const targetBadge = this.input.badgeInteraction.targetBadge;
                    const existingIntegralCount = this.input.persistentBadges.filter(b => 
                        b.hasIntegral && b.functionId === targetBadge.functionId
                    ).length;
                    
                    if (existingIntegralCount >= 2) {
                        // Already have 2 integral badges, skip to delete
                        this.input.tracing.active = false; // Cancel tracing so no new badge is added
                    } else {
                        // Can add integral, keep badge
                        // Don't cancel tracing, let it add the badge with integral below
                    }
                } else if (originalState.hasIntegral && !originalState.neonIntegral) {
                    // Badge had integral → switch to neon integral, keep badge
                    // Don't cancel tracing, let it add the badge with neon integral below
                } else {
                    // Badge already had neon integral → remove completely (and its pair)
                    // Remove the other badge in the integral pair if it exists
                    if (this.input.badgeInteraction.integralPairBadgeId) {
                        this.input.persistentBadges = this.input.persistentBadges.filter(
                            badge => badge.id !== this.input.badgeInteraction.integralPairBadgeId
                        );
                        // Remove only the specific integral pair, not all pairs
                        const originalBadgeId = this.input.badgeInteraction.originalBadgeId;
                        this.integralPairs = this.integralPairs.filter(pair => 
                            pair.badge1Id !== originalBadgeId && pair.badge2Id !== originalBadgeId
                        );
                    }
                    this.input.tracing.active = false; // Cancel tracing so no new badge is added
                }
            }
            // If significant movement occurred, treat as hold/drag and add new badge at final position
            
            // Clear badge interaction state
            this.input.badgeInteraction.targetBadge = null;
            this.input.badgeInteraction.startTime = 0;
            this.input.badgeInteraction.startX = 0;
            this.input.badgeInteraction.startY = 0;
            this.input.badgeInteraction.isHolding = false;
        }
        
        // Don't replot on pointer end - the debounced timer in handleViewportChange already handles
        // implicit function replotting after panning stops. Calling replotAllFunctions here would
        // cause duplicate calculations when you release the mouse/finger.
        
        // Exit tracing mode - add new badge for persistent display
        if (this.input.tracing.active) {
            // Get function color for the badge
            const tracingFunction = this.findFunctionById(this.input.tracing.functionId);
            const functionColor = tracingFunction ? tracingFunction.color : '#4A90E2';
            
            // Add new badge to the collection (reuse original ID only if dragging existing badge)
            const reuseId = (this.input.badgeInteraction.originalBadgeState && this.input.badgeInteraction.originalBadgeId) ? 
                this.input.badgeInteraction.originalBadgeId : null;
            const badgeId = this.addTraceBadge(
                this.input.tracing.functionId,
                this.input.tracing.worldX,
                this.input.tracing.worldY,
                functionColor,
                null,
                null,
                reuseId
            );
            
            // Store theta for polar functions
            if (this.input.tracing.theta !== null && this.input.tracing.theta !== undefined) {
                const newBadge = this.input.persistentBadges.find(b => b.id === badgeId);
                if (newBadge) {
                    newBadge.theta = this.input.tracing.theta;
                }
            }
            
            // Handle tangent based on original badge state
            const originalState = this.input.badgeInteraction.originalBadgeState;
            const wasTap = this.input.badgeInteraction.wasTap;
            
            // Show initial tooltip if this is a brand new badge (no original state)
            if (!originalState) {
                const newBadge = this.input.persistentBadges.find(b => b.id === badgeId);
                if (newBadge) {
                    const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                    this.showBadgeTooltip('Coordinates - drag to change - tap for more tools', screenPos.x, screenPos.y);
                }
            }
            
            if (originalState) {
                const newBadge = this.input.persistentBadges.find(b => b.id === badgeId);
                if (newBadge && tracingFunction) {
                    // If it was a tap, cycle to the next state
                    // If it was a drag, keep the same state as original
                    if (wasTap) {
                        // TAP: Cycle to next state
                        if (!originalState.hasTangent && !originalState.hasNormal && !originalState.hasIntegral) {
                            // State 1: No line → tangent
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, newBadge.worldX, newBadge.worldY, newBadge.theta);
                            if (slopeData) {
                                newBadge.hasTangent = true;
                                newBadge.tangentSlope = slopeData;
                                newBadge.tangentExpression = slopeData.expression;
                                newBadge.secondDerivative = slopeData.secondDerivative;
                                newBadge.neonTangent = false;
                                newBadge.hasNormal = false;
                                newBadge.neonNormal = false;
                                newBadge.hasIntegral = false;
                                newBadge.neonIntegral = false;
                                
                                // Show tooltip
                                const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                this.showBadgeTooltip('Tangent line', screenPos.x, screenPos.y);
                            }
                        } else if (originalState.hasTangent && !originalState.neonTangent && !originalState.hasNormal && !originalState.hasIntegral) {
                            // State 2: Tangent → neon tangent
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, newBadge.worldX, newBadge.worldY, newBadge.theta);
                            if (slopeData) {
                                newBadge.hasTangent = true;
                                newBadge.tangentSlope = slopeData;
                                newBadge.tangentExpression = slopeData.expression;
                                newBadge.secondDerivative = slopeData.secondDerivative;
                                newBadge.neonTangent = true;
                                newBadge.hasNormal = false;
                                newBadge.neonNormal = false;
                                newBadge.hasIntegral = false;
                                newBadge.neonIntegral = false;
                                
                                // Show tooltip
                                const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                this.showBadgeTooltip('Neon tangent', screenPos.x, screenPos.y);
                            }
                        } else if (originalState.hasTangent && originalState.neonTangent && !originalState.hasNormal && !originalState.hasIntegral) {
                            // State 3: Neon tangent → normal
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, newBadge.worldX, newBadge.worldY, newBadge.theta);
                            if (slopeData) {
                                newBadge.hasTangent = false;
                                newBadge.neonTangent = false;
                                newBadge.hasNormal = true;
                                newBadge.tangentSlope = slopeData; // Still needed for calculating perpendicular
                                newBadge.tangentExpression = slopeData.expression;
                                newBadge.secondDerivative = slopeData.secondDerivative;
                                newBadge.neonNormal = false;
                                newBadge.hasIntegral = false;
                                newBadge.neonIntegral = false;
                                
                                // Show tooltip
                                const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                this.showBadgeTooltip('Normal line', screenPos.x, screenPos.y);
                            }
                        } else if (originalState.hasNormal && !originalState.neonNormal && !originalState.hasIntegral) {
                            // State 4: Normal → neon normal
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, newBadge.worldX, newBadge.worldY, newBadge.theta);
                            if (slopeData) {
                                newBadge.hasTangent = false;
                                newBadge.neonTangent = false;
                                newBadge.hasNormal = true;
                                newBadge.tangentSlope = slopeData;
                                newBadge.tangentExpression = slopeData.expression;
                                newBadge.secondDerivative = slopeData.secondDerivative;
                                newBadge.neonNormal = true;
                                newBadge.hasIntegral = false;
                                newBadge.neonIntegral = false;
                                
                                // Show tooltip
                                const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                this.showBadgeTooltip('Neon normal', screenPos.x, screenPos.y);
                            }
                        } else if (originalState.hasNormal && originalState.neonNormal && !originalState.hasIntegral) {
                            // State 5: Neon normal → integral (only if less than 2 integral badges exist on this function)
                            // Skip integral for implicit functions (not well-defined)
                            const functionType = this.detectFunctionType(tracingFunction.expression);
                            const isImplicit = (functionType === 'implicit');
                            
                            if (isImplicit) {
                                // For implicit functions, go directly to delete (cancel tracing)
                                this.input.tracing.active = false;
                                this.input.tracing.functionId = null;
                                
                                // Remove the badge we just created
                                this.input.persistentBadges = this.input.persistentBadges.filter(b => b.id !== badgeId);
                                
                                // Show tooltip explaining why
                                const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                this.showBadgeTooltip('Integration not supported for implicit functions', screenPos.x, screenPos.y);
                            } else {
                                // Explicit function - allow integral
                                const existingIntegralCount = this.input.persistentBadges.filter(b => 
                                    b.hasIntegral && b.functionId === newBadge.functionId
                                ).length;
                                
                                if (existingIntegralCount < 2) {
                                    // Allow transition to integral
                                    newBadge.hasTangent = false;
                                    newBadge.neonTangent = false;
                                    newBadge.hasNormal = false;
                                    newBadge.neonNormal = false;
                                    newBadge.hasIntegral = true;
                                    newBadge.neonIntegral = false;
                                    
                                    // Show tooltip
                                    const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                                    this.showBadgeTooltip('Integral - add second to calculate', screenPos.x, screenPos.y);
                                }
                            }
                            // Note: If existingIntegralCount >= 2, the badge was already deleted by canceling tracing above
                        } else if (originalState.hasIntegral && !originalState.neonIntegral) {
                            // State 6: Integral → neon integral
                            newBadge.hasTangent = false;
                            newBadge.neonTangent = false;
                            newBadge.hasNormal = false;
                            newBadge.neonNormal = false;
                            newBadge.hasIntegral = true;
                            newBadge.neonIntegral = true;
                            
                            // Show tooltip
                            const screenPos = this.worldToScreen(newBadge.worldX, newBadge.worldY);
                            this.showBadgeTooltip('Neon integral', screenPos.x, screenPos.y);
                        }
                        // State 7: Neon integral → delete (handled above by canceling tracing)
                    } else {
                        // DRAG: Keep same state, just recalculate at new position
                        if (originalState.hasTangent || originalState.hasNormal) {
                            const slopeData = this.calculateSlopeAtPoint(tracingFunction, newBadge.worldX, newBadge.worldY, newBadge.theta);
                            if (slopeData) {
                                newBadge.hasTangent = originalState.hasTangent;
                                newBadge.hasNormal = originalState.hasNormal;
                                newBadge.tangentSlope = slopeData;
                                newBadge.tangentExpression = slopeData.expression;
                                newBadge.secondDerivative = slopeData.secondDerivative;
                                newBadge.neonTangent = originalState.neonTangent;
                                newBadge.neonNormal = originalState.neonNormal;
                                newBadge.hasIntegral = false;
                                newBadge.neonIntegral = false;
                            }
                        } else if (originalState.hasIntegral) {
                            // Keep integral state
                            newBadge.hasTangent = false;
                            newBadge.hasNormal = false;
                            newBadge.neonTangent = false;
                            newBadge.neonNormal = false;
                            newBadge.hasIntegral = true;
                            newBadge.neonIntegral = originalState.neonIntegral;
                        }
                        // If original had no tangent/normal/integral, new badge also has none (default)
                    }
                }
            }
            
            // Clear badge state temp storage
            this.input.badgeInteraction.wasTap = false;
            this.input.badgeInteraction.originalBadgeState = null;
            
            // Clear frozen intercept badges and set viewport stable BEFORE any calculations
            // This ensures that updateCombinedIntersections will call draw()
            this.frozenInterceptBadges = [];
            this.isViewportChanging = false;
            
            // Recalculate tangent intercepts
            if (this.showIntercepts) {
                this.intercepts = this.findAxisIntercepts();
                this.cullInterceptMarkers(); // Update culled marker cache
            }
            
            // Recalculate tangent intersections since badge state changed
            // This will call draw() since isViewportChanging is now false
            if (this.showIntersections) {
                this.updateCombinedIntersections();
            }
            
            // Detect and calculate integral pairs
            this.updateIntegralPairs();
            
            // Always draw to ensure intercepts are displayed
            this.draw();
        }
        
        this.input.tracing.active = false;
        this.input.tracing.functionId = null;
        this.input.tracing.currentSlope = null;
        this.input.tracing.neonTangent = false;
        this.input.tracing.hasNormal = false;
        this.input.tracing.neonNormal = false;
        
        // Don't trigger viewport change on pointer end - it's already handled by debounced timer
        // The timer in handleViewportChange triggers when movement stops (even before pointer release)
        // Calling it again here would cause duplicate calculations
        
        this.input.mouse.down = false;
        this.input.dragging = false;
    }
    
    // Touch handling methods for pinch-to-zoom
    handleTouchStart(e) {
        // Set touch flag for tolerance detection
        this.input.touch.active = true;
        
        if (e.touches.length === 1) {
            // Single touch - handle as pan and track potential tap
            const touch = e.touches[0];
            this.handlePointerStart(touch.clientX, touch.clientY);
            this.input.pinch.active = false;
            
            // Record tap start information
            this.input.startX = touch.clientX;
            this.input.startY = touch.clientY;
            this.input.startTime = Date.now();
        } else if (e.touches.length === 2) {
            // Two touches - start pinch gesture
            this.input.pinch.active = true;
            this.input.mouse.down = false; // Disable panning during pinch
            
            // Reset tap tracking since this is now a pinch gesture
            this.input.startX = null;
            this.input.startY = null;
            this.input.startTime = null;
            this.input.maxMoveDistance = 0;
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            // Calculate initial distance and direction between touches
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            this.input.pinch.initialDistance = Math.sqrt(dx * dx + dy * dy);
            this.input.pinch.initialScale = this.viewport.scale;
            this.input.pinch.initialDx = Math.abs(dx);
            this.input.pinch.initialDy = Math.abs(dy);
            
            // Determine pinch direction based on initial touch vector
            const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
            const verticalThreshold = 65; // degrees from horizontal
            const horizontalThreshold = 25; // degrees from horizontal
            
            if (angle > verticalThreshold) {
                this.input.pinch.direction = 'vertical';
            } else if (angle < horizontalThreshold) {
                this.input.pinch.direction = 'horizontal';
            } else {
                this.input.pinch.direction = 'uniform';
            }
            
            // Store initial viewport bounds for directional zoom
            this.input.pinch.initialMinX = this.viewport.minX;
            this.input.pinch.initialMaxX = this.viewport.maxX;
            this.input.pinch.initialMinY = this.viewport.minY;
            this.input.pinch.initialMaxY = this.viewport.maxY;
            
            // Calculate and store fixed center points to prevent panning during directional zoom
            this.input.pinch.fixedCenterWorldX = (this.viewport.minX + this.viewport.maxX) / 2;
            this.input.pinch.fixedCenterWorldY = (this.viewport.minY + this.viewport.maxY) / 2;
            
            // Calculate center point between touches
            this.input.pinch.centerX = (touch1.clientX + touch2.clientX) / 2;
            this.input.pinch.centerY = (touch1.clientY + touch2.clientY) / 2;
        }
    }
    
    handleTouchMove(e) {
        if (e.touches.length === 1 && !this.input.pinch.active) {
            // Single touch - handle as pan and track movement
            const touch = e.touches[0];
            
            // Update maximum movement distance for tap detection
            if (this.input.startX !== null && this.input.startY !== null) {
                const moveDistance = Math.sqrt(
                    Math.pow(touch.clientX - this.input.startX, 2) + 
                    Math.pow(touch.clientY - this.input.startY, 2)
                );
                this.input.maxMoveDistance = Math.max(this.input.maxMoveDistance, moveDistance);
            }
            
            this.handlePointerMove(touch.clientX, touch.clientY);
        } else if (e.touches.length === 2 && this.input.pinch.active) {
            // Two touches - handle directional pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            // Calculate current distances
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const currentDx = Math.abs(dx);
            const currentDy = Math.abs(dy);
            
            // Apply scale limits
            const minScale = 0.001;
            const maxScale = 10000;
            
            // In polar mode, force uniform zoom to maintain equal x/y scaling (square pixels)
            const effectiveDirection = this.plotMode === 'polar' ? 'uniform' : this.input.pinch.direction;
            
            if (effectiveDirection === 'horizontal') {
                // Horizontal pinch - zoom X axis only, keep Y axis unchanged
                const xZoomFactor = currentDx / this.input.pinch.initialDx;
                
                const newXRange = (this.input.pinch.initialMaxX - this.input.pinch.initialMinX) / xZoomFactor;
                const newMinX = this.input.pinch.fixedCenterWorldX - (newXRange / 2);
                const newMaxX = this.input.pinch.fixedCenterWorldX + (newXRange / 2);
                
                // Check reasonable bounds
                if (newXRange > 0.0001 && newXRange < 100000) {
                    this.viewport.minX = newMinX;
                    this.viewport.maxX = newMaxX;
                    // Keep Y bounds exactly the same to prevent any shift
                    this.viewport.minY = this.input.pinch.initialMinY;
                    this.viewport.maxY = this.input.pinch.initialMaxY;
                    
                    // Update viewport scale based on new X range for proper grid/label spacing
                    this.updateViewportScale();
                    this.updateRangeInputs();
                    
                    // Don't recalculate functions during pinch for performance - just redraw existing points
                    // The buffered points provide coverage, and functions recalculate when pinch stops
                    this.draw();
                    this.handleViewportChange(); // Debounced recalculation
                }
                
            } else if (effectiveDirection === 'vertical') {
                // Vertical pinch - zoom Y axis only, keep X axis unchanged
                const yZoomFactor = currentDy / this.input.pinch.initialDy;
                
                const newYRange = (this.input.pinch.initialMaxY - this.input.pinch.initialMinY) / yZoomFactor;
                const newMinY = this.input.pinch.fixedCenterWorldY - (newYRange / 2);
                const newMaxY = this.input.pinch.fixedCenterWorldY + (newYRange / 2);
                
                // Check reasonable bounds
                if (newYRange > 0.0001 && newYRange < 100000) {
                    this.viewport.minY = newMinY;
                    this.viewport.maxY = newMaxY;
                    // Keep X bounds exactly the same to prevent any shift
                    this.viewport.minX = this.input.pinch.initialMinX;
                    this.viewport.maxX = this.input.pinch.initialMaxX;
                    
                    // Update viewport scale based on new Y range for proper grid/label spacing
                    this.updateViewportScale();
                    this.updateRangeInputs();
                    
                    // Don't recalculate functions during pinch for performance - just redraw existing points
                    // The buffered points provide coverage, and functions recalculate when pinch stops
                    this.draw();
                    this.handleViewportChange(); // Debounced recalculation
                }
                
            } else {
                // Uniform pinch - zoom both axes using original logic that worked perfectly
                const zoomFactor = currentDistance / this.input.pinch.initialDistance;
                
                // Use initial bounds like the original working version
                const initialXRange = this.input.pinch.initialMaxX - this.input.pinch.initialMinX;
                const initialYRange = this.input.pinch.initialMaxY - this.input.pinch.initialMinY;
                
                const newXRange = initialXRange / zoomFactor;
                const newYRange = initialYRange / zoomFactor;
                
                // Use fixed world center like the directional pinches (restores original behavior)
                const newMinX = this.input.pinch.fixedCenterWorldX - (newXRange / 2);
                const newMaxX = this.input.pinch.fixedCenterWorldX + (newXRange / 2);
                const newMinY = this.input.pinch.fixedCenterWorldY - (newYRange / 2);
                const newMaxY = this.input.pinch.fixedCenterWorldY + (newYRange / 2);
                
                // Check reasonable bounds
                if (newXRange > 0.0001 && newXRange < 100000 && newYRange > 0.0001 && newYRange < 100000) {
                    this.viewport.minX = newMinX;
                    this.viewport.maxX = newMaxX;
                    this.viewport.minY = newMinY;
                    this.viewport.maxY = newMaxY;
                    
                    this.updateViewportScale();
                    this.updateRangeInputs();
                    
                    // Don't recalculate functions during pinch for performance - just redraw existing points
                    // The buffered points provide coverage, and functions recalculate when pinch stops
                    this.draw();
                    this.handleViewportChange(); // Debounced recalculation
                }
            }
        }
    }
    
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            // All touches ended - check for tap
            const tapDuration = Date.now() - this.input.startTime;
            const isTap = this.input.maxMoveDistance <= 10 && tapDuration <= 300;
            
            if (isTap) {
                // Close function panel on narrow screens when tapping the canvas
                const isNarrowScreen = window.innerWidth < 1024;
                if (isNarrowScreen) {
                    const functionPanel = document.getElementById('function-panel');
                    if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                        this.closeMobileMenu();
                    }
                }
            }
            
            // Reset tap tracking
            this.input.startX = null;
            this.input.startY = null;
            this.input.startTime = null;
            this.input.maxMoveDistance = 0;
            
            // Reset touch flag
            this.input.touch.active = false;
            
            this.handlePointerEnd();
            this.input.pinch.active = false;
        } else if (e.touches.length === 1 && this.input.pinch.active) {
            // Went from pinch to single touch
            this.input.pinch.active = false;
            const touch = e.touches[0];
            this.handlePointerStart(touch.clientX, touch.clientY);
        }
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        if (e.deltaY > 0) {
            // Zoom out
            this.zoomOut();
        } else {
            // Zoom in
            this.zoomIn();
        }
    }
    
    handleKeyboard(e) {
        // Performance overlay toggle (Ctrl+Shift+P) - works even when input is focused
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            this.performance.enabled = !this.performance.enabled;
            if (this.performance.enabled) {
                this.performance.lastFpsUpdate = performance.now();
                this.performance.frameCount = 0;
            }
            return;
        }
        
        // Check if any input field is currently focused, including MathLive fields
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'MATH-FIELD' ||  // Add MathLive support
            activeElement.isContentEditable ||
            activeElement.closest('math-field') ||     // Check if inside a MathLive field
            activeElement.closest('.ML__keyboard')     // Check if inside MathLive virtual keyboard
        );
        
        // If an input is focused, don't handle any keyboard shortcuts at all
        if (isInputFocused) {
            return; // Let the input field handle all keys when focused
        }
        
        switch(e.key.toLowerCase()) {
            case 'escape':
                // Close shortcuts overlay if open, otherwise go to title screen
                const shortcutsOverlay = document.getElementById('shortcuts-overlay');
                if (shortcutsOverlay && shortcutsOverlay.classList.contains('show')) {
                    this.toggleShortcutsOverlay();
                } else {
                    this.changeState(this.states.TITLE);
                }
                break;
            case '?':
            case '/':  // The key that produces ? when shift is pressed
                e.preventDefault();
                this.toggleShortcutsOverlay();
                break;
            case '=':  // Plus key (without needing Shift)
            case '+':  // Plus key (with Shift or numpad)
                e.preventDefault(); // Prevent browser zoom
                this.zoomIn();
                break;
            case '-':  // Minus key (both main keyboard and numpad)
            case '_':  // Underscore (Shift + minus, just in case)
                e.preventDefault(); // Prevent browser zoom
                this.zoomOut();
                break;
        }
    }
    
    showKeyboardHint() {
        // Only show on non-touch devices
        const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
        if (isTouchDevice) {
            return;
        }
        
        const hint = document.getElementById('keyboard-hint');
        if (!hint) return;
        
        // Show hint after a short delay
        setTimeout(() => {
            hint.classList.add('show');
            
            // Fade out after 4 seconds
            setTimeout(() => {
                hint.classList.remove('show');
            }, 4000);
        }, 500);
    }
    
    toggleShortcutsOverlay() {
        const overlay = document.getElementById('shortcuts-overlay');
        if (!overlay) return;
        
        if (overlay.classList.contains('show')) {
            overlay.classList.remove('show');
        } else {
            overlay.classList.add('show');
        }
    }
    
    updateViewport() {
        // When called from zoom operations, we need to maintain the center point
        // and adjust the bounds based on the scale
        if (this.viewport.scale) {
            const halfWidth = this.viewport.width / (2 * this.viewport.scale);
            const halfHeight = this.viewport.height / (2 * this.viewport.scale);
            
            // Calculate current center
            const centerX = (this.viewport.minX + this.viewport.maxX) / 2;
            const centerY = (this.viewport.minY + this.viewport.maxY) / 2;
            
            // Update bounds around center
            this.viewport.minX = centerX - halfWidth;
            this.viewport.maxX = centerX + halfWidth;
            this.viewport.minY = centerY - halfHeight;
            this.viewport.maxY = centerY + halfHeight;
        }
        
        // Update the range input fields to reflect current viewport
        this.updateRangeInputs();
        
        // Re-plot explicit functions and theta-constant rays when viewport changes for smooth performance
        this.getCurrentFunctions().forEach(func => {
            if (func.expression && func.enabled) {
                const functionType = this.detectFunctionType(func.expression);
                if (functionType === 'explicit' || functionType === 'theta-constant') {
                    this.plotFunction(func);
                }
            }
        });
        this.draw();
        this.handleViewportChange();
    }
    
    updateViewportScale() {
        // Calculate appropriate scale based on current viewport ranges
        // This ensures grid and label spacing work correctly after directional zoom
        const xRange = this.viewport.maxX - this.viewport.minX;
        const yRange = this.viewport.maxY - this.viewport.minY;
        const xScale = this.viewport.width / xRange;
        const yScale = this.viewport.height / yRange;
        
        // Use the smaller scale to ensure both axes fit properly
        // This gives priority to the axis that needs more space
        this.viewport.scale = Math.min(xScale, yScale);
    }

    enforcePolarAspectRatio() {
        // Force 1:1 aspect ratio for polar mode during initial setup only
        // This keeps circles circular for reset/mode switch but allows user zoom flexibility
        if (this.plotMode === 'polar') {
            const centerX = (this.viewport.minX + this.viewport.maxX) / 2;
            const centerY = (this.viewport.minY + this.viewport.maxY) / 2;
            
            // Calculate what the ranges should be for 1:1 aspect ratio
            const xRange = this.viewport.maxX - this.viewport.minX;
            const yRange = this.viewport.maxY - this.viewport.minY;
            const xScale = this.viewport.width / xRange;
            const yScale = this.viewport.height / yRange;
            const targetScale = Math.min(xScale, yScale);
            
            const halfRangeX = this.viewport.width / (2 * targetScale);
            const halfRangeY = this.viewport.height / (2 * targetScale);
            
            this.viewport.minX = centerX - halfRangeX;
            this.viewport.maxX = centerX + halfRangeX;
            this.viewport.minY = centerY - halfRangeY;
            this.viewport.maxY = centerY + halfRangeY;
            this.viewport.scale = targetScale;
        }
    }
    
    zoomIn() {
        // Zoom in by shrinking the ranges around the center
        const centerX = (this.viewport.minX + this.viewport.maxX) / 2;
        const centerY = (this.viewport.minY + this.viewport.maxY) / 2;
        
        const xRange = this.viewport.maxX - this.viewport.minX;
        const yRange = this.viewport.maxY - this.viewport.minY;
        
        const zoomFactor = 1.2;
        const newXRange = xRange / zoomFactor;
        const newYRange = yRange / zoomFactor;
        
        // Check reasonable bounds
        if (newXRange > 0.0001 && newYRange > 0.0001) {
            this.viewport.minX = centerX - newXRange / 2;
            this.viewport.maxX = centerX + newXRange / 2;
            this.viewport.minY = centerY - newYRange / 2;
            this.viewport.maxY = centerY + newYRange / 2;
            
            // Update scale for consistent grid/label spacing
            this.updateViewportScale();
            this.updateRangeInputs();
            
            // Don't recalculate functions during zoom for performance - just redraw existing points
            // The buffered points provide coverage, and functions recalculate when zooming stops
            this.draw();
            this.handleViewportChange(); // Debounced recalculation
        }
    }
    
    zoomOut() {
        // Zoom out by expanding the ranges around the center
        const centerX = (this.viewport.minX + this.viewport.maxX) / 2;
        const centerY = (this.viewport.minY + this.viewport.maxY) / 2;
        
        const xRange = this.viewport.maxX - this.viewport.minX;
        const yRange = this.viewport.maxY - this.viewport.minY;
        
        const zoomFactor = 1.2;
        const newXRange = xRange * zoomFactor;
        const newYRange = yRange * zoomFactor;
        
        // Check reasonable bounds
        if (newXRange < 100000 && newYRange < 100000) {
            this.viewport.minX = centerX - newXRange / 2;
            this.viewport.maxX = centerX + newXRange / 2;
            this.viewport.minY = centerY - newYRange / 2;
            this.viewport.maxY = centerY + newYRange / 2;
            
            // Update scale for consistent grid/label spacing
            this.updateViewportScale();
            this.updateRangeInputs();
            
            // Don't recalculate functions during zoom for performance - just redraw existing points
            // The buffered points provide coverage, and functions recalculate when zooming stops
            this.draw();
            this.handleViewportChange(); // Debounced recalculation
        }
    }
    
    debounceRangeUpdate() {
        // Clear existing timer
        if (this.rangeTimer) {
            clearTimeout(this.rangeTimer);
        }
        
        // Set new timer for delayed range update
        this.rangeTimer = setTimeout(() => {
            this.validateAndSetRange();
            this.rangeTimer = null;
        }, 400); // Slightly longer delay for range (400ms)
    }
    
    validateAndSetRange() {
        const xMinInput = document.getElementById('x-min');
        const xMaxInput = document.getElementById('x-max');
        const yMinInput = document.getElementById('y-min');
        const yMaxInput = document.getElementById('y-max');
        
        if (!xMinInput || !xMaxInput || !yMinInput || !yMaxInput) return;
        
        // Parse values
        const xMin = this.getRangeValue(xMinInput);
        const xMax = this.getRangeValue(xMaxInput);
        const yMin = this.getRangeValue(yMinInput);
        const yMax = this.getRangeValue(yMaxInput);
        
        // Validate all inputs
        const inputs = [
            { input: xMinInput, value: xMin, name: 'X min' },
            { input: xMaxInput, value: xMax, name: 'X max' },
            { input: yMinInput, value: yMin, name: 'Y min' },
            { input: yMaxInput, value: yMax, name: 'Y max' }
        ];
        
        let allValid = true;
        
        // Check for NaN values
        inputs.forEach(({ input, value }) => {
            if (isNaN(value)) {
                this.setInputError(input, true);
                allValid = false;
            } else {
                this.setInputError(input, false);
            }
        });
        
        // Check logical constraints if all numbers are valid
        if (allValid) {
            if (xMin >= xMax) {
                this.setInputError(xMinInput, true);
                this.setInputError(xMaxInput, true);
                allValid = false;
            }
            
            if (yMin >= yMax) {
                this.setInputError(yMinInput, true);
                this.setInputError(yMaxInput, true);
                allValid = false;
            }
        }
        
        // If all valid, apply the range
        if (allValid) {
            this.applyCustomRange(xMin, xMax, yMin, yMax);
        }
    }
    
    setInputError(input, hasError) {
        if (!input) return;
        
        if (hasError) {
            input.classList.add('input-error');
            // For MathLive fields, apply direct styling to penetrate shadow DOM
            if (input.tagName.toLowerCase() === 'math-field') {
                input.style.setProperty('background', 'rgba(231, 76, 60, 0.1)', 'important');
                input.style.setProperty('border', '2px solid #E74C3C', 'important');
                input.style.setProperty('border-radius', '4px', 'important');
            } else {
                // Fallback for regular input elements
                input.style.borderColor = '#E74C3C';
                input.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
                input.style.boxShadow = '0 0 0 1px rgba(231, 76, 60, 0.3)';
            }
        } else {
            input.classList.remove('input-error');
            // Restore normal styling for MathLive fields
            if (input.tagName.toLowerCase() === 'math-field') {
                // Get computed CSS variable values to restore dark theme
                const computedStyle = getComputedStyle(document.documentElement);
                const inputBg = computedStyle.getPropertyValue('--input-bg').trim() || '#3A4F6A';
                const borderColor = computedStyle.getPropertyValue('--border-color').trim() || '#555';
                
                // Restore dark background and border
                input.style.setProperty('background', inputBg, 'important');
                input.style.setProperty('border', `1px solid ${borderColor}`, 'important');
                input.style.setProperty('border-radius', '4px', 'important');
                input.style.setProperty('--background', inputBg, 'important');
            } else {
                // Clear fallback styles for regular input elements
                input.style.borderColor = '';
                input.style.backgroundColor = '';
                input.style.boxShadow = '';
            }
        }
    }
    
    applyCustomRange(xMin, xMax, yMin, yMax) {
        // Set the viewport ranges
        this.viewport.minX = xMin;
        this.viewport.maxX = xMax;
        this.viewport.minY = yMin;
        this.viewport.maxY = yMax;
        
        // Calculate the appropriate scale to fit the range
        const xRange = xMax - xMin;
        const yRange = yMax - yMin;
        const xScale = this.viewport.width / xRange;
        const yScale = this.viewport.height / yRange;
        
        // Use the smaller scale to ensure both axes fit
        this.viewport.scale = Math.min(xScale, yScale);
        
        // Save viewport bounds to localStorage
        this.saveViewportBounds();
        
        // Re-plot all functions with new range
        this.replotAllFunctions();
    }
    
    setCustomRange() {
        // Legacy method - redirect to new validation system
        this.validateAndSetRange();
    }
    
    updateRangeInputs(skipSave = false) {
        const xMinInput = document.getElementById('x-min');
        const xMaxInput = document.getElementById('x-max');
        const yMinInput = document.getElementById('y-min');
        const yMaxInput = document.getElementById('y-max');
        
        // Helper function to convert numeric values to symbolic LaTeX when appropriate
        const toSymbolicOrNumeric = (value) => {
            // Check for common multiples of π
            const piRatio = value / Math.PI;
            const tolerance = 0.0001;
            
            // Check for common fractions of π
            if (Math.abs(piRatio - 2) < tolerance) return '2\\pi';
            if (Math.abs(piRatio - 1) < tolerance) return '\\pi';
            if (Math.abs(piRatio - 0.5) < tolerance) return '\\frac{\\pi}{2}';
            if (Math.abs(piRatio - (-0.5)) < tolerance) return '-\\frac{\\pi}{2}';
            if (Math.abs(piRatio - (-1)) < tolerance) return '-\\pi';
            if (Math.abs(piRatio - (-2)) < tolerance) return '-2\\pi';
            if (Math.abs(piRatio - 1.5) < tolerance) return '\\frac{3\\pi}{2}';
            if (Math.abs(piRatio - (-1.5)) < tolerance) return '-\\frac{3\\pi}{2}';
            
            // Otherwise return numeric value
            return value.toFixed(2);
        };
        
        if (xMinInput) {
            const xMinValue = toSymbolicOrNumeric(this.viewport.minX);
            this.setRangeValue(xMinInput, xMinValue);
            this.viewport.xMinLatex = xMinValue;
            this.setInputError(xMinInput, false);
        }
        if (xMaxInput) {
            const xMaxValue = toSymbolicOrNumeric(this.viewport.maxX);
            this.setRangeValue(xMaxInput, xMaxValue);
            this.viewport.xMaxLatex = xMaxValue;
            this.setInputError(xMaxInput, false);
        }
        if (yMinInput) {
            const yMinValue = toSymbolicOrNumeric(this.viewport.minY);
            this.setRangeValue(yMinInput, yMinValue);
            this.viewport.yMinLatex = yMinValue;
            this.setInputError(yMinInput, false);
        }
        if (yMaxInput) {
            const yMaxValue = toSymbolicOrNumeric(this.viewport.maxY);
            this.setRangeValue(yMaxInput, yMaxValue);
            this.viewport.yMaxLatex = yMaxValue;
            this.setInputError(yMaxInput, false);
        }
        
        // Save the updated bounds to localStorage (unless we're loading initial state)
        if (!skipSave) {
            this.saveViewportBounds();
        }
    }
    
    togglePlotMode() {
        // Always stop and fully reset polar animation when switching modes (from either direction)
        // This ensures clean state whether switching from polar or back to polar
        if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
            this.stopPolarAnimation();
        }
        
        // Additionally reset animation button states to ensure consistency
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const playPauseText = document.getElementById('play-pause-text');
        if (playIcon && pauseIcon && playPauseText) {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            playPauseText.textContent = 'Play';
        }
        
        const stopBtn = document.getElementById('polar-stop-animation');
        if (stopBtn) {
            stopBtn.style.opacity = '0.6';
            stopBtn.style.background = '#1a2a3f';
        }
        
        const stepBackBtn = document.getElementById('polar-step-back');
        const stepForwardBtn = document.getElementById('polar-step-forward');
        if (stepBackBtn) {
            stepBackBtn.disabled = true;
            stepBackBtn.style.opacity = '0.6';
            stepBackBtn.style.background = '#1a2a3f';
        }
        if (stepForwardBtn) {
            stepForwardBtn.disabled = true;
            stepForwardBtn.style.opacity = '0.6';
            stepForwardBtn.style.background = '#1a2a3f';
        }
        
        // Reset animation position to start
        this.polarAnimation.currentTheta = 0;
        this.polarAnimation.storedThetaMax = this.polarSettings.thetaMax;
        
        // Clear all badges when switching modes since coordinate systems are different
        this.clearAllBadges();
        
        // Clear integral pairs and linked pairs when switching modes
        this.integralPairs = [];
        this.linkedBadgePairs = [];
        this.selectedBadgeForLinking = null;
        
        // Clear turning points when switching modes (will be recalculated in new mode)
        this.turningPoints = [];
        
        this.plotMode = this.plotMode === 'cartesian' ? 'polar' : 'cartesian';
        
        // Handle angle mode: polar always uses radians, cartesian restores user preference
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        const degreesIcon = document.getElementById('degrees-icon');
        const radiansIcon = document.getElementById('radians-icon');
        
        if (this.plotMode === 'polar') {
            // Save current angle mode for cartesian
            this.cartesianAngleMode = this.angleMode;
            
            // Force radians in polar mode
            this.angleMode = 'radians';
            if (degreesIcon && radiansIcon) {
                degreesIcon.style.opacity = '0.3';
                radiansIcon.style.opacity = '1';
            }
            
            // Disable angle toggle in polar mode
            if (angleModeToggle) {
                angleModeToggle.disabled = true;
                angleModeToggle.style.opacity = '0.6';
                angleModeToggle.style.background = '#1a2a3f';
                angleModeToggle.style.cursor = 'not-allowed';
            }
        } else {
            // Restore cartesian angle mode preference
            this.angleMode = this.cartesianAngleMode;
            if (degreesIcon && radiansIcon) {
                if (this.angleMode === 'degrees') {
                    degreesIcon.style.opacity = '1';
                    radiansIcon.style.opacity = '0.3';
                } else {
                    degreesIcon.style.opacity = '0.3';
                    radiansIcon.style.opacity = '1';
                }
            }
            
            // Enable angle toggle in cartesian mode
            if (angleModeToggle) {
                angleModeToggle.disabled = false;
                angleModeToggle.style.opacity = '1';
                angleModeToggle.style.background = '#2A3F5A';
                angleModeToggle.style.cursor = 'pointer';
            }
        }
        
        // Update UI
        const modeToggle = document.getElementById('mode-toggle');
        const cartesianRanges = document.getElementById('cartesian-ranges');
        const cartesianRangesY = document.getElementById('cartesian-ranges-y');
        const polarRanges = document.getElementById('polar-ranges');
        const polarOptions = document.getElementById('polar-options');
        
        if (modeToggle) {
            // Update icon opacity instead of text
            const cartesianIcon = document.getElementById('cartesian-icon');
            const polarIcon = document.getElementById('polar-icon');

            if (cartesianIcon && polarIcon) {
                if (this.plotMode === 'cartesian') {
                    cartesianIcon.style.opacity = '1';        // Bright
                    polarIcon.style.opacity = '0.3';         // Dim
                } else {
                    cartesianIcon.style.opacity = '0.3';     // Dim
                    polarIcon.style.opacity = '1';           // Bright
                }
            }

            // Keep button background consistent - don't change color
        }
        
        // Update turning points toggle icon based on plot mode
        const cartesianTurningIcon = document.getElementById('turning-points-icon-cartesian');
        const polarTurningIcon = document.getElementById('turning-points-icon-polar');
        const cartesianNotation = document.getElementById('turning-points-notation-cartesian');
        const polarNotation = document.getElementById('turning-points-notation-polar');
        
        if (cartesianTurningIcon && polarTurningIcon && cartesianNotation && polarNotation) {
            if (this.plotMode === 'cartesian') {
                cartesianTurningIcon.style.display = 'block';
                polarTurningIcon.style.display = 'none';
                cartesianNotation.style.display = 'inline-flex';
                polarNotation.style.display = 'none';
            } else {
                cartesianTurningIcon.style.display = 'none';
                polarTurningIcon.style.display = 'block';
                cartesianNotation.style.display = 'none';
                polarNotation.style.display = 'inline-flex';
            }
        }
        
        // Update Add Function button text based on coordinate system
        const addFunctionBtn = document.getElementById('add-function');
        if (addFunctionBtn) {
            if (this.plotMode === 'cartesian') {
                addFunctionBtn.innerHTML = '+&nbsp;<span class="math-italic">f</span>&nbsp;(<span class="math-italic">x</span>)';
            } else {
                addFunctionBtn.innerHTML = '+&nbsp;<span class="math-italic">f</span>&nbsp;(<span class="math-italic">θ</span>)';
            }
        }
        
        if (cartesianRanges && cartesianRangesY) {
            cartesianRanges.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
            cartesianRangesY.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
        }
        
        if (polarRanges && polarOptions) {
            polarRanges.style.display = this.plotMode === 'polar' ? 'flex' : 'none';
            polarOptions.style.display = this.plotMode === 'polar' ? 'block' : 'none';
        }
        
        // Update turning points button state
        this.updateTurningPointsToggleButton();
        
        // Update intercepts button state (only enabled in Cartesian mode)
        this.updateInterceptsToggleButton();
        
        // Clear existing function UI and recreate for current mode
        this.refreshFunctionUI();

        // Add functions if the current mode has no functions
        // Try to load from localStorage first, then use defaults if needed
        const isCartesian = this.plotMode === 'cartesian';
        const wasCleared = isCartesian ? this.cartesianFunctionsCleared : this.polarFunctionsCleared;
        
        if (this.getCurrentFunctions().length === 0 && !wasCleared) {
            // Try to load saved functions from localStorage
            const savedData = this.loadFunctionsFromLocalStorage();
            let functionsToLoad = [];
            
            if (this.plotMode === 'cartesian' && savedData.hasSavedCartesian) {
                // Load saved cartesian functions
                functionsToLoad = savedData.cartesian;
            } else if (this.plotMode === 'polar' && savedData.hasSavedPolar) {
                // Load saved polar functions
                functionsToLoad = savedData.polar;
            } else {
                // No saved functions - start with empty array
                functionsToLoad = [];
            }
            
            // Add all saved functions without triggering save (to avoid overwriting on mode switch)
            functionsToLoad.forEach(funcData => {
                const id = this.nextFunctionId++;
                const color = this.functionColors[this.getCurrentFunctions().length % this.functionColors.length];
                
                const func = {
                    id: id,
                    expression: funcData.expression,
                    points: [],
                    color: color,
                    enabled: funcData.enabled,
                    mode: this.plotMode
                };
                
                this.getCurrentFunctions().push(func);
                this.createFunctionUI(func);
            });
            
            // Update parameter sliders after loading functions
            this.updateParameterSliders();
        }
        
        // Always ensure there's at least one blank function at the end
        const currentFunctions = this.getCurrentFunctions();
        const hasBlankFunction = currentFunctions.some(func => !func.expression || func.expression.trim() === '');
        if (!hasBlankFunction) {
            this.addFunction('');
        }
        
        // Update virtual keyboards for the new mode
        this.updateVirtualKeyboardsForMode();
        
        // Update function placeholders
        this.updateFunctionPlaceholders();

        // Synchronize canvas dimensions between viewports
        if (this.plotMode === 'polar') {
            // Switching TO polar mode
            this.polarViewport.width = this.cartesianViewport.width;
            this.polarViewport.height = this.cartesianViewport.height;
            this.polarViewport.centerX = this.cartesianViewport.centerX;
            this.polarViewport.centerY = this.cartesianViewport.centerY;

            // Initialize polar viewport ranges if not set up (first time switching to polar)
            if (this.polarViewport.scale === 80 && this.polarViewport.minX === -3) {
                const polarReset = this.getPolarResetViewport();
                this.polarViewport.minX = polarReset.minX;
                this.polarViewport.maxX = polarReset.maxX;
                this.polarViewport.minY = polarReset.minY;
                this.polarViewport.maxY = polarReset.maxY;

                // Force 1:1 aspect ratio for proper polar display
                this.enforcePolarAspectRatio();
            }
        } else {
            // Switching TO cartesian mode
            this.cartesianViewport.width = this.polarViewport.width;
            this.cartesianViewport.height = this.polarViewport.height;
            this.cartesianViewport.centerX = this.polarViewport.centerX;
            this.cartesianViewport.centerY = this.polarViewport.centerY;
            
            // Don't modify cartesian ranges - they should remain as they were
        }
        
        // Clear all function points since we're switching coordinate systems
        this.cartesianFunctions.forEach(func => func.points = []);
        this.polarFunctions.forEach(func => func.points = []);
        
        // Update range inputs to reflect the current viewport values (no recalculation)
        this.updateRangeInputs();

        // Force a complete redraw to ensure viewport is current
        this.draw();
        
        // Replot all functions in current mode
        this.replotAllFunctions();
        
        // Update parameter sliders for the current mode
        this.updateParameterSliders();
        
        // Save functions to localStorage after mode switch
        this.saveFunctionsToLocalStorage();
    }
    
    updateExamplesForMode() {
        const examplesHeader = document.getElementById('examples-mode-header');
        const cartesianExamples = document.querySelector('.cartesian-examples');
        const polarExamples = document.querySelector('.polar-examples');
        
        if (!examplesHeader || !cartesianExamples || !polarExamples) return;
        
        if (this.plotMode === 'cartesian') {
            examplesHeader.textContent = 'Cartesian Examples';
            cartesianExamples.style.display = 'block';
            polarExamples.style.display = 'none';
        } else {
            examplesHeader.textContent = 'Polar Examples';
            cartesianExamples.style.display = 'none';
            polarExamples.style.display = 'block';
        }
    }
    
    refreshFunctionUI() {
        // Clear all function UI elements
        const container = document.getElementById('functions-container');
        if (container) {
            container.innerHTML = '';
        }
        
        // Recreate UI for current mode functions
        const currentFunctions = this.getCurrentFunctions();
        currentFunctions.forEach(func => {
            this.createFunctionUI(func);
        });
    }
    
    updateVirtualKeyboardsForMode() {
        // Skip if virtual keyboard isn't initialized yet
        if (!window.mathVirtualKeyboard || !this.customNumericLayout) {
            return;
        }
        
        // Update the variable keys based on current mode
        const isCartesian = this.plotMode === 'cartesian';
        
        // Update only the first three keyboard layouts (not the variables layout which shows all variables)
        const layouts = [this.customNumericLayout, this.functionsLayout, this.hyperbolicLayout];
        
        layouts.forEach(layout => {
            layout.rows.forEach(row => {
                row.forEach((key, index) => {
                    // Find and update the 'x' key (which has variants)
                    if (key.latex === 'x' && key.variants) {
                        if (isCartesian) {
                            // Cartesian mode: x stays as x, variants include y and theta
                            key.variants = ['y', 'r', '\\theta', 't', 'a', 'b', 'c'];
                        } else {
                            // Polar mode: change x to r, variants include x and theta
                            row[index] = { latex: 'r', variants: ['x', 'y', '\\theta', 't', 'a', 'b', 'c'], class: 'variable-key' };
                        }
                    }
                    
                    // Find and update the r key (when switching back from polar to cartesian)
                    if (key.latex === 'r' && key.variants) {
                        if (isCartesian) {
                            // Cartesian mode: change r back to x
                            row[index] = { latex: 'x', variants: ['y', 'r', '\\theta', 't', 'a', 'b', 'c'], class: 'variable-key' };
                        }
                        // Polar mode: r stays as r (already handled above)
                    }
                    
                    // Find and update the second variable key (y/theta)
                    if (key.latex === 'y' || key.latex === '\\theta') {
                        if (isCartesian) {
                            // In Cartesian mode, show y
                            row[index] = { latex: 'y', class: 'variable-key' };
                        } else {
                            // In polar mode, show theta
                            row[index] = { latex: '\\theta', class: 'variable-key' };
                        }
                    }
                });
            });
        });
        
        // Update the virtual keyboard with new layouts
        window.mathVirtualKeyboard.layouts = [this.customNumericLayout, this.functionsLayout, this.hyperbolicLayout, this.variablesLayout];
    }
    
    updateFunctionPlaceholders() {
        const mathFields = document.querySelectorAll('.function-item math-field');
        mathFields.forEach(mathField => {
            if (this.plotMode === 'polar') {
                mathField.setAttribute('placeholder', '\\text{Enter f(θ)}');
            } else {
                mathField.setAttribute('placeholder', '\\text{Enter f(x) or f(x,y)}');
            }
        });
    }
    
    // Update math field color schemes based on current theme
    updateMathFieldColorSchemes() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const mathFields = document.querySelectorAll('math-field');
        
        mathFields.forEach(mathField => {
            // Set basic theme variables only - let MathLive handle the rest
            if (currentTheme === 'light') {
                mathField.style.setProperty('--background', '#FDFDFD');
                mathField.style.setProperty('--text-color', '#2C3E50');
            } else {
                mathField.style.setProperty('--background', '#3A4F6A');
                mathField.style.setProperty('--text-color', '#E8F4FD');
            }
        });
    }

    
    async replotAllFunctions(onlyExplicit = false) {
        const plotPromises = [];
        
        this.getCurrentFunctions().forEach(func => {
            if (func.enabled) {
                // Check if this is an implicit function
                const isImplicit = func.expression && this.detectFunctionType(func.expression) === 'implicit';
                
                // Skip implicit functions if onlyExplicit is true
                if (onlyExplicit && isImplicit) {
                    return;
                }
                
                // Collect all plot promises to await them together
                plotPromises.push(
                    this.plotFunctionWithValidation(func).then(() => {
                        // If function has no points after validation, clear its badges
                        if (!func.points || func.points.length === 0) {
                            this.removeBadgesForFunction(func.id);
                            this.removeIntersectionBadgesForFunction(func.id);
                        }
                    })
                );
            }
        });
        
        // Wait for all functions to complete before drawing
        await Promise.all(plotPromises);
        
        // Update intersections after replotting (debounced for viewport changes)
        this.handleViewportChange();
        
        this.draw();
    }

    replotImplicitFunctions(immediate = false) {
        // Cancel any ongoing implicit calculations
        this.cancelAllImplicitCalculations();
        
        // Get implicit functions to replot
        const implicitFunctions = this.getCurrentFunctions().filter(func => 
            func.expression && func.enabled && this.detectFunctionType(func.expression) === 'implicit'
        );
        
        if (implicitFunctions.length === 0) {
            this.draw();
            return;
        }
        
        // Process implicit functions asynchronously to prevent UI blocking
        const replotNextFunction = async (index) => {
            if (index >= implicitFunctions.length) {
                // All functions processed - snap badges back to curves before redrawing
                this.snapBadgesToImplicitCurves();
                this.draw();
                return;
            }
            
            const func = implicitFunctions[index];
            
            // Plot this function asynchronously
            await this.plotFunctionWithValidation(func);
            
            // If function has no points after validation, clear its badges
            if (!func.points || func.points.length === 0) {
                this.removeBadgesForFunction(func.id);
                this.removeIntersectionBadgesForFunction(func.id);
            }
            
            // Process next function - immediate during startup, delayed during viewport changes
            if (immediate) {
                await replotNextFunction(index + 1);
            } else {
                setTimeout(() => replotNextFunction(index + 1), 0);
            }
        };
        
        // Start processing the first function
        replotNextFunction(0);
    }
    
    snapBadgesToImplicitCurves() {
        // After implicit functions are replotted, snap badges back to the curve
        // This prevents badges from disappearing when the marching squares generates slightly different points
        this.input.persistentBadges.forEach(badge => {
            const func = this.findFunctionById(badge.functionId);
            if (!func) return;
            
            const functionType = this.detectFunctionType(func.expression);
            if (functionType !== 'implicit') return;
            
            // Find the closest point on the newly calculated curve
            const snapped = this.traceImplicitFunction(func, badge.worldX, badge.worldY);
            if (snapped) {
                badge.worldX = snapped.x;
                badge.worldY = snapped.y;
                
                // Recalculate tangent slope if badge has a tangent
                if (badge.hasTangent) {
                    const slopeData = this.calculateSlopeAtPoint(func, snapped.x, snapped.y);
                    if (slopeData) {
                        badge.tangentSlope = slopeData;
                        badge.tangentExpression = slopeData.expression;
                        badge.secondDerivative = slopeData.secondDerivative;
                    }
                }
            }
        });
    }
    
    // Cancel all ongoing implicit function calculations
    cancelAllImplicitCalculations() {
        this.implicitCalculationId++;
        this.currentImplicitCalculations.clear();
        
        // Only clear points if NOT during viewport changes - otherwise keep them visible
        if (!this.isViewportChanging) {
            this.getCurrentFunctions().forEach(func => {
                if (func.expression && this.detectFunctionType(func.expression) === 'implicit') {
                    func.points = [];
                    if (func.cachedPoints) {
                        delete func.cachedPoints;
                    }
                }
            });
        }
    }
    
    // Check if a calculation should be cancelled
    isCalculationCancelled(functionId, calculationId) {
        const currentId = this.currentImplicitCalculations.get(functionId);
        return currentId !== calculationId;
    }
    
    async startGraphing() {
        // If already initialized, just change state and return
        if (this.hasInitialized) {
            this.changeState(this.states.GRAPHING);
            return;
        }
        
        // Mark as initialized to prevent duplicate function loading
        this.hasInitialized = true;
        
        this.changeState(this.states.GRAPHING);
        
        // Load saved plot mode from localStorage
        const savedMode = localStorage.getItem('graphiti_plot_mode');
        if (savedMode && (savedMode === 'cartesian' || savedMode === 'polar')) {
            this.plotMode = savedMode;
            
            // Update UI to reflect loaded mode
            const modeToggle = document.getElementById('mode-toggle');
            const cartesianRanges = document.getElementById('cartesian-ranges');
            const cartesianRangesY = document.getElementById('cartesian-ranges-y');
            const polarRanges = document.getElementById('polar-ranges');
            const polarOptions = document.getElementById('polar-options');
            
            if (modeToggle) {
                const cartesianIcon = document.getElementById('cartesian-icon');
                const polarIcon = document.getElementById('polar-icon');
                
                if (cartesianIcon && polarIcon) {
                    if (this.plotMode === 'cartesian') {
                        cartesianIcon.style.opacity = '1';
                        polarIcon.style.opacity = '0.3';
                    } else {
                        cartesianIcon.style.opacity = '0.3';
                        polarIcon.style.opacity = '1';
                    }
                }
            }
            
            if (cartesianRanges && cartesianRangesY) {
                cartesianRanges.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
                cartesianRangesY.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
            }
            
            if (polarRanges && polarOptions) {
                polarRanges.style.display = this.plotMode === 'polar' ? 'flex' : 'none';
                polarOptions.style.display = this.plotMode === 'polar' ? 'block' : 'none';
            }
            
            // Update Add Function button text
            const addFunctionBtn = document.getElementById('add-function');
            if (addFunctionBtn) {
                if (this.plotMode === 'cartesian') {
                    addFunctionBtn.innerHTML = '+&nbsp;<span class="math-italic">f</span>&nbsp;(<span class="math-italic">x</span>)';
                } else {
                    addFunctionBtn.innerHTML = '+&nbsp;<span class="math-italic">f</span>&nbsp;(<span class="math-italic">θ</span>)';
                }
            }
            
            // Update angle mode toggle button based on loaded mode
            const angleModeToggle = document.getElementById('angle-mode-toggle');
            if (angleModeToggle) {
                if (this.plotMode === 'polar') {
                    // Disable and darken in polar mode
                    angleModeToggle.disabled = true;
                    angleModeToggle.style.opacity = '0.6';
                    angleModeToggle.style.background = '#1a2a3f';
                    angleModeToggle.style.cursor = 'not-allowed';
                } else {
                    // Enable in cartesian mode
                    angleModeToggle.disabled = false;
                    angleModeToggle.style.opacity = '1';
                    angleModeToggle.style.background = '#2A3F5A';
                    angleModeToggle.style.cursor = 'pointer';
                }
            }
            
            // Update virtual keyboards to match the loaded mode
            this.updateVirtualKeyboardsForMode();
        }
        
        // Try to load saved functions from localStorage
        const savedData = this.loadFunctionsFromLocalStorage();
        
        // ALWAYS load both Cartesian and Polar functions from localStorage on startup
        // This ensures both arrays are populated, even if we're only showing one mode
        if (savedData.hasSavedCartesian) {
            savedData.cartesian.forEach(funcData => {
                const id = this.nextFunctionId++;
                const color = this.functionColors[this.cartesianFunctions.length % this.functionColors.length];
                
                const func = {
                    id: id,
                    expression: funcData.expression,
                    points: [],
                    color: color,
                    enabled: funcData.enabled,
                    mode: 'cartesian'
                };
                
                this.cartesianFunctions.push(func);
                // Only create UI for current mode
                if (this.plotMode === 'cartesian') {
                    this.createFunctionUI(func);
                }
            });
        }
        
        if (savedData.hasSavedPolar) {
            savedData.polar.forEach(funcData => {
                const id = this.nextFunctionId++;
                const color = this.functionColors[this.polarFunctions.length % this.functionColors.length];
                
                const func = {
                    id: id,
                    expression: funcData.expression,
                    points: [],
                    color: color,
                    enabled: funcData.enabled,
                    mode: 'polar'
                };
                
                this.polarFunctions.push(func);
                // Only create UI for current mode
                if (this.plotMode === 'polar') {
                    this.createFunctionUI(func);
                }
            });
        }
        
        // Set startup flag for immediate implicit function rendering
        this.isStartup = true;
        
        // Update parameter sliders after loading functions from localStorage
        this.updateParameterSliders();
        
        // Always ensure there's at least one blank function at the end
        const currentFunctions = this.getCurrentFunctions();
        const hasBlankFunction = currentFunctions.some(func => !func.expression || func.expression.trim() === '');
        if (!hasBlankFunction) {
            this.addFunction('');
        }
        
        // Try to load saved viewport bounds from localStorage
        const hasSavedBounds = this.loadAndApplyViewportBounds();
        
        // Only use smart reset viewport if no saved bounds were found
        if (!hasSavedBounds) {
            const smartViewport = this.getSmartResetViewport();
            this.viewport.minX = smartViewport.minX;
            this.viewport.maxX = smartViewport.maxX;
            this.viewport.minY = smartViewport.minY;
            this.viewport.maxY = smartViewport.maxY;
            this.viewport.scale = smartViewport.scale;
        }
        
        // Initial setup is complete - now allow viewport bounds to be saved
        this.isInitialSetup = false;
        
        // Update range inputs to reflect the viewport (skip saving during startup)
        this.updateRangeInputs(true);
        
        // Draw immediately to show empty graph paper
        this.draw();
        
        // Plot functions asynchronously in the background without blocking navigation
        const allFunctions = this.getCurrentFunctions().filter(func => func.expression && func.enabled);
        
        // Separate explicit and implicit functions
        const explicitFunctions = allFunctions.filter(func => this.detectFunctionType(func.expression) !== 'implicit');
        const implicitFunctions = allFunctions.filter(func => this.detectFunctionType(func.expression) === 'implicit');
        
        // Start explicit functions immediately in parallel (they're fast)
        setTimeout(() => {
            explicitFunctions.forEach(func => {
                this.plotFunctionWithValidation(func).then(() => this.draw());
            });
            
            // If there are no implicit functions, we need to calculate intercepts/intersections/turning points here
            if (implicitFunctions.length === 0) {
                // All functions done (only explicit ones)
                this.isStartup = false;
                
                // Calculate initial intersections after all functions are plotted
                if (this.showIntersections) {
                    this.intersections = this.calculateIntersectionsWithWorker();
                }
                
                // Calculate initial turning points
                if (this.showTurningPoints) {
                    this.turningPoints = this.findTurningPoints();
                }
                
                // Calculate initial intercepts
                if (this.showIntercepts) {
                    this.intercepts = this.findAxisIntercepts();
                    this.cullInterceptMarkers(); // Pre-calculate culled markers for performance
                }
                
                // Final draw to show everything
                this.draw();
            }
        }, 0);
        
        // Plot implicit functions sequentially with progressive appearance
        const plotNextImplicit = async (index) => {
            if (index >= implicitFunctions.length) {
                // All implicit functions done
                this.isStartup = false;
                
                // Calculate initial intersections after all functions are plotted
                if (this.showIntersections) {
                    this.intersections = this.calculateIntersectionsWithWorker();
                }
                
                // Calculate initial turning points
                if (this.showTurningPoints) {
                    this.turningPoints = this.findTurningPoints();
                }
                
                // Calculate initial intercepts
                if (this.showIntercepts) {
                    this.intercepts = this.findAxisIntercepts();
                    this.cullInterceptMarkers(); // Pre-calculate culled markers for performance
                }
                
                // Final draw to show everything
                this.draw();
                return;
            }
            
            const func = implicitFunctions[index];
            await this.plotFunctionWithValidation(func);
            this.draw(); // Show this implicit function
            
            // Schedule next implicit function with longer delay to reduce stuttering
            setTimeout(() => plotNextImplicit(index + 1), 16);
        };
        
        // Start plotting implicit functions after panel transition completes (300ms)
        if (implicitFunctions.length > 0) {
            setTimeout(() => plotNextImplicit(0), 350);
        }
        
        // Initialize intercepts toggle button state
        this.updateInterceptsToggleButton();
        
        // Initialize intercepts toggle button state
        this.updateInterceptsToggleButton();
        
        // Initialize intersection toggle button state
        this.updateIntersectionToggleButton();
        
        // Initialize turning points toggle button state
        this.updateTurningPointsToggleButton();
        
        // Panel opens automatically via changeState() - no need to call openMobileMenu()
        // It adds mobile-open class which triggers the CSS slide-in animation
        
        // Show keyboard shortcuts hint after a short delay (only on non-touch devices)
        this.showKeyboardHint();
    }
    
    changeState(newState) {
        this.previousState = this.currentState;
        this.currentState = newState;
        
        // Show/hide UI elements based on state
        const titleScreen = document.getElementById('title-screen');
        const functionPanel = document.getElementById('function-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        
        switch(newState) {
            case this.states.TITLE:
                if (titleScreen) titleScreen.classList.remove('hidden');
                if (functionPanel) functionPanel.classList.add('hidden');
                if (hamburgerMenu) hamburgerMenu.style.display = 'none';
                this.closeMobileMenu();
                break;
            case this.states.GRAPHING:
                if (titleScreen) titleScreen.classList.add('hidden');
                if (functionPanel) {
                    functionPanel.classList.remove('hidden');
                    // Force a reflow to ensure the element is visible before starting transition
                    functionPanel.offsetHeight;
                    functionPanel.classList.add('mobile-open');
                }
                // Always show hamburger in GRAPHING state (mobile and desktop)
                if (hamburgerMenu) {
                    hamburgerMenu.style.display = 'flex';
                    // Set hamburger to show red close cross when panel opens
                    hamburgerMenu.classList.add('active');
                    hamburgerMenu.classList.add('panel-open');
                }
                break;
        }
    }
    
    // Mobile Menu Methods
    toggleMobileMenu() {
        // Note: Don't clear badges when menu is toggled - preserve tracing state
        
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        // Both mobile and desktop now use the same sliding animation
        if (functionPanel && functionPanel.classList.contains('mobile-open')) {
            this.closeMobileMenu();
        } else {
            this.openMobileMenu();
        }
    }
    
    openMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        if (hamburgerMenu) {
            hamburgerMenu.classList.add('active');
            hamburgerMenu.classList.add('panel-open'); // Move hamburger to avoid title overlap
        }
        if (functionPanel) {
            // Always remove hidden class and add mobile-open for smooth transition
            functionPanel.classList.remove('hidden');
            // Force a reflow to ensure the element is visible before starting transition
            functionPanel.offsetHeight;
            functionPanel.classList.add('mobile-open');
        }
        
        // Overlay disabled - no dimming of graph area
        // if (this.isTrueMobile() && mobileOverlay) {
        //     mobileOverlay.style.display = 'block';
        // }
    }
    
    closeMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        if (hamburgerMenu) {
            hamburgerMenu.classList.remove('active');
            hamburgerMenu.classList.remove('panel-open'); // Return hamburger to original position
        }
        if (functionPanel) {
            functionPanel.classList.remove('mobile-open');
            
            // On mobile, wait for the transition to complete before hiding
            if (this.isTrueMobile()) {
                // Wait for CSS transition to complete (0.3s) before hiding
                setTimeout(() => {
                    if (!functionPanel.classList.contains('mobile-open')) {
                        functionPanel.classList.add('hidden');
                    }
                }, 300);
            }
        }
        
        // FIRST: Blur ALL mathfields so MathLive won't try to reopen keyboard
        const allMathFields = document.querySelectorAll('math-field');
        allMathFields.forEach(mf => {
            if (mf.hasFocus()) {
                mf.blur();
            }
            // Prevent any math-field from being focused during panel close animation
            mf.setAttribute('data-blur-protected', 'true');
        });
        
        // THEN: Close keyboard after fields are blurred
        if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
            window.mathVirtualKeyboard.hide();
        }
        
        // Remove protection after panel animation completes (300ms) plus buffer
        setTimeout(() => {
            allMathFields.forEach(mf => mf.removeAttribute('data-blur-protected'));
        }, 500);
        
        // Overlay disabled - no dimming management needed
        // if (mobileOverlay) mobileOverlay.style.display = 'none';
    }
    
    toggleTheme() {
        const html = document.documentElement;
        const lightIcon = document.getElementById('light-icon');
        const darkIcon = document.getElementById('dark-icon');
        const currentTheme = html.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Switch to dark mode
            html.removeAttribute('data-theme');
            if (lightIcon && darkIcon) {
                lightIcon.style.opacity = '0.3';  // Dim light icon
                darkIcon.style.opacity = '1';     // Bright dark icon
            }
            localStorage.setItem('graphiti-theme', 'dark');
        } else {
            // Switch to light mode
            html.setAttribute('data-theme', 'light');
            if (lightIcon && darkIcon) {
                lightIcon.style.opacity = '1';    // Bright light icon
                darkIcon.style.opacity = '0.3';   // Dim dark icon
            }
            localStorage.setItem('graphiti-theme', 'light');
        }
        
        // Update canvas background color
        this.updateCanvasBackground();
        
        // Force a redraw after a small delay to ensure CSS has updated
        setTimeout(() => {
            this.draw();
        }, 50);
    }
    
    updateCanvasBackground() {
        // Get computed CSS variable value
        const canvasBg = getComputedStyle(document.documentElement)
            .getPropertyValue('--canvas-bg').trim();
        this.canvas.style.background = canvasBg;
    }
    
    initializeTheme() {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('graphiti-theme');
        const lightIcon = document.getElementById('light-icon');
        const darkIcon = document.getElementById('dark-icon');
        
        if (savedTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (lightIcon && darkIcon) {
                lightIcon.style.opacity = '1';    // Bright light icon
                darkIcon.style.opacity = '0.3';   // Dim dark icon
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (lightIcon && darkIcon) {
                lightIcon.style.opacity = '0.3';  // Dim light icon
                darkIcon.style.opacity = '1';     // Bright dark icon
            }
        }
        
        this.updateCanvasBackground();
    }
    
    // ================================
    // PARAMETER SYSTEM (Alpha, Beta, Gamma)
    // ================================
    
    getEvaluationScope(baseScope = {}) {
        // Create scope with parameter values for expression evaluation
        return {
            ...baseScope,
            alpha: this.parameters.alpha.value,
            beta: this.parameters.beta.value,
            gamma: this.parameters.gamma.value,
            delta: this.parameters.delta.value
        };
    }
    
    initializeParameterSliders() {
        const sliders = ['alpha', 'beta', 'gamma', 'delta'];
        
        sliders.forEach(param => {
            const slider = document.getElementById(`${param}-slider`);
            const valueDisplay = document.getElementById(`${param}-value`);
            
            if (slider && valueDisplay) {
                let plotTimer = null;
                
                // Update parameter value and replot
                const updateParameter = async (value) => {
                    this.parameters[param].value = value;
                    valueDisplay.textContent = value.toFixed(2);
                    slider.value = value;
                    
                    // Debounce the replotting for smoother slider dragging
                    if (plotTimer) {
                        clearTimeout(plotTimer);
                    }
                    
                    plotTimer = setTimeout(async () => {
                        await this.replotAllFunctions();
                        this.updateBadgesAfterParameterChange(); // Update badges to new curve positions
                        this.updateIntegralPairs(); // Recalculate integrals with new parameter values
                        plotTimer = null;
                    }, 16); // ~60fps update rate for smooth animation
                };
                
                // Slider input event
                slider.addEventListener('input', (e) => {
                    updateParameter(parseFloat(e.target.value));
                });
            }
        });
        
        // Arrow button event handlers
        document.querySelectorAll('.arrow-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const param = e.currentTarget.dataset.param;
                const dir = parseFloat(e.currentTarget.dataset.dir);
                const slider = document.getElementById(`${param}-slider`);
                
                if (slider) {
                    const currentValue = parseFloat(slider.value);
                    let newValue;
                    
                    // If current value is not a whole number, go to nearest whole number in the direction
                    if (currentValue !== Math.floor(currentValue)) {
                        if (dir > 0) {
                            // Going right: round up
                            newValue = Math.ceil(currentValue);
                        } else {
                            // Going left: round down
                            newValue = Math.floor(currentValue);
                        }
                    } else {
                        // Already on whole number, add/subtract 1
                        newValue = currentValue + dir;
                    }
                    
                    // Clamp to range
                    newValue = Math.max(-10, Math.min(10, newValue));
                    
                    this.parameters[param].value = newValue;
                    slider.value = newValue;
                    document.getElementById(`${param}-value`).textContent = newValue.toFixed(2);
                    
                    this.replotAllFunctions();
                    this.updateBadgesAfterParameterChange(); // Update badges to new curve positions
                    this.updateIntegralPairs(); // Recalculate integrals with new parameter values
                }
            });
        });
    }
    
    updateParameterSliders() {
        // Scan all functions to see which parameters are in use
        const usedParams = { alpha: false, beta: false, gamma: false, delta: false };
        
        // Get all functions from current mode
        const allFunctions = this.getCurrentFunctions();
        
        // Only scan if there are functions in the current mode
        if (allFunctions && allFunctions.length > 0) {
            allFunctions.forEach(func => {
                if (func.expression) {
                    // Check for Greek letters in LaTeX
                    if (func.expression.includes('\\alpha')) usedParams.alpha = true;
                    if (func.expression.includes('\\beta')) usedParams.beta = true;
                    if (func.expression.includes('\\gamma')) usedParams.gamma = true;
                    if (func.expression.includes('\\delta')) usedParams.delta = true;
                }
            });
        }
        
        // Update parameter tracking
        this.parameters.alpha.inUse = usedParams.alpha;
        this.parameters.beta.inUse = usedParams.beta;
        this.parameters.gamma.inUse = usedParams.gamma;
        this.parameters.delta.inUse = usedParams.delta;
        
        // Show/hide sliders based on usage
        const sliderContainer = document.getElementById('parameter-sliders');
        const alphaContainer = document.getElementById('alpha-slider-container');
        const betaContainer = document.getElementById('beta-slider-container');
        const gammaContainer = document.getElementById('gamma-slider-container');
        const deltaContainer = document.getElementById('delta-slider-container');
        
        // Show main container if any parameter is in use
        const anyInUse = usedParams.alpha || usedParams.beta || usedParams.gamma || usedParams.delta;
        if (sliderContainer) {
            sliderContainer.style.display = anyInUse ? 'block' : 'none';
        }
        
        // Show/hide individual sliders
        if (alphaContainer) alphaContainer.style.display = usedParams.alpha ? 'flex' : 'none';
        if (betaContainer) betaContainer.style.display = usedParams.beta ? 'flex' : 'none';
        if (gammaContainer) gammaContainer.style.display = usedParams.gamma ? 'flex' : 'none';
        if (deltaContainer) deltaContainer.style.display = usedParams.delta ? 'flex' : 'none';
    }
    
    toggleAngleMode() {
        // Don't allow toggling in polar mode (radians only)
        if (this.plotMode === 'polar') {
            return;
        }
        
        const degreesIcon = document.getElementById('degrees-icon');
        const radiansIcon = document.getElementById('radians-icon');
        
        // Store old mode for conversion
        const oldMode = this.angleMode;
        
        // Stop animation before switching modes to prevent mixed unit states
        const wasAnimating = this.polarAnimation.isAnimating;
        if (wasAnimating) {
            this.stopPolarAnimation();
        }
        
        if (this.angleMode === 'degrees') {
            this.angleMode = 'radians';
            this.cartesianAngleMode = 'radians';
            if (degreesIcon && radiansIcon) {
                degreesIcon.style.opacity = '0.3';  // Dim degrees icon
                radiansIcon.style.opacity = '1';    // Bright radians icon
            }
        } else {
            this.angleMode = 'degrees';
            this.cartesianAngleMode = 'degrees';
            if (degreesIcon && radiansIcon) {
                degreesIcon.style.opacity = '1';    // Bright degrees icon
                radiansIcon.style.opacity = '0.3';  // Dim radians icon
            }
        }
        
        // Update polar theta range if in polar mode - convert values instead of resetting
        if (this.plotMode === 'polar') {
            const thetaMinInput = document.getElementById('theta-min');
            const thetaMaxInput = document.getElementById('theta-max');
            
            if (oldMode === 'degrees' && this.angleMode === 'radians') {
                // Convert degrees to radians
                const oldMin = this.polarSettings.thetaMin;
                const oldMax = this.polarSettings.thetaMax;
                this.polarSettings.thetaMin = oldMin * Math.PI / 180;
                this.polarSettings.thetaMax = oldMax * Math.PI / 180;
                
                if (thetaMinInput) {
                    // Use symbolic form for common values (multiples of 15 degrees = π/12)
                    let minValue;
                    if (oldMin === 0) minValue = '0';
                    else if (oldMin === 15) minValue = '\\frac{\\pi}{12}';
                    else if (oldMin === 30) minValue = '\\frac{\\pi}{6}';
                    else if (oldMin === 45) minValue = '\\frac{\\pi}{4}';
                    else if (oldMin === 60) minValue = '\\frac{\\pi}{3}';
                    else if (oldMin === 75) minValue = '\\frac{5\\pi}{12}';
                    else if (oldMin === 90) minValue = '\\frac{\\pi}{2}';
                    else if (oldMin === 105) minValue = '\\frac{7\\pi}{12}';
                    else if (oldMin === 120) minValue = '\\frac{2\\pi}{3}';
                    else if (oldMin === 135) minValue = '\\frac{3\\pi}{4}';
                    else if (oldMin === 150) minValue = '\\frac{5\\pi}{6}';
                    else if (oldMin === 165) minValue = '\\frac{11\\pi}{12}';
                    else if (oldMin === 180) minValue = '\\pi';
                    else if (oldMin === 195) minValue = '\\frac{13\\pi}{12}';
                    else if (oldMin === 210) minValue = '\\frac{7\\pi}{6}';
                    else if (oldMin === 225) minValue = '\\frac{5\\pi}{4}';
                    else if (oldMin === 240) minValue = '\\frac{4\\pi}{3}';
                    else if (oldMin === 255) minValue = '\\frac{17\\pi}{12}';
                    else if (oldMin === 270) minValue = '\\frac{3\\pi}{2}';
                    else if (oldMin === 285) minValue = '\\frac{19\\pi}{12}';
                    else if (oldMin === 300) minValue = '\\frac{5\\pi}{3}';
                    else if (oldMin === 315) minValue = '\\frac{7\\pi}{4}';
                    else if (oldMin === 330) minValue = '\\frac{11\\pi}{6}';
                    else if (oldMin === 345) minValue = '\\frac{23\\pi}{12}';
                    // Negative values
                    else if (oldMin === -15) minValue = '-\\frac{\\pi}{12}';
                    else if (oldMin === -30) minValue = '-\\frac{\\pi}{6}';
                    else if (oldMin === -45) minValue = '-\\frac{\\pi}{4}';
                    else if (oldMin === -60) minValue = '-\\frac{\\pi}{3}';
                    else if (oldMin === -75) minValue = '-\\frac{5\\pi}{12}';
                    else if (oldMin === -90) minValue = '-\\frac{\\pi}{2}';
                    else if (oldMin === -105) minValue = '-\\frac{7\\pi}{12}';
                    else if (oldMin === -120) minValue = '-\\frac{2\\pi}{3}';
                    else if (oldMin === -135) minValue = '-\\frac{3\\pi}{4}';
                    else if (oldMin === -150) minValue = '-\\frac{5\\pi}{6}';
                    else if (oldMin === -165) minValue = '-\\frac{11\\pi}{12}';
                    else if (oldMin === -180) minValue = '-\\pi';
                    else if (oldMin === -195) minValue = '-\\frac{13\\pi}{12}';
                    else if (oldMin === -210) minValue = '-\\frac{7\\pi}{6}';
                    else if (oldMin === -225) minValue = '-\\frac{5\\pi}{4}';
                    else if (oldMin === -240) minValue = '-\\frac{4\\pi}{3}';
                    else if (oldMin === -255) minValue = '-\\frac{17\\pi}{12}';
                    else if (oldMin === -270) minValue = '-\\frac{3\\pi}{2}';
                    else if (oldMin === -285) minValue = '-\\frac{19\\pi}{12}';
                    else if (oldMin === -300) minValue = '-\\frac{5\\pi}{3}';
                    else if (oldMin === -315) minValue = '-\\frac{7\\pi}{4}';
                    else if (oldMin === -330) minValue = '-\\frac{11\\pi}{6}';
                    else if (oldMin === -345) minValue = '-\\frac{23\\pi}{12}';
                    else if (oldMin === -360) minValue = '-2\\pi';
                    else if (oldMin === -540) minValue = '-3\\pi';
                    else if (oldMin === -720) minValue = '-4\\pi';
                    else if (oldMin === 375) minValue = '\\frac{25\\pi}{12}';
                    else if (oldMin === 390) minValue = '\\frac{13\\pi}{6}';
                    else if (oldMin === 405) minValue = '\\frac{9\\pi}{4}';
                    else if (oldMin === 420) minValue = '\\frac{7\\pi}{3}';
                    else if (oldMin === 435) minValue = '\\frac{29\\pi}{12}';
                    else if (oldMin === 450) minValue = '\\frac{5\\pi}{2}';
                    else if (oldMin === 540) minValue = '3\\pi';
                    else if (oldMin === 720) minValue = '4\\pi';
                    else minValue = this.polarSettings.thetaMin.toFixed(6);
                    this.setRangeValue(thetaMinInput, minValue);
                    this.polarSettings.thetaMinLatex = minValue;
                }
                if (thetaMaxInput) {
                    // Use symbolic form for common values (multiples of 15 degrees = π/12)
                    let maxValue;
                    if (oldMax === 0) maxValue = '0';
                    else if (oldMax === 15) maxValue = '\\frac{\\pi}{12}';
                    else if (oldMax === 30) maxValue = '\\frac{\\pi}{6}';
                    else if (oldMax === 45) maxValue = '\\frac{\\pi}{4}';
                    else if (oldMax === 60) maxValue = '\\frac{\\pi}{3}';
                    else if (oldMax === 75) maxValue = '\\frac{5\\pi}{12}';
                    else if (oldMax === 90) maxValue = '\\frac{\\pi}{2}';
                    else if (oldMax === 105) maxValue = '\\frac{7\\pi}{12}';
                    else if (oldMax === 120) maxValue = '\\frac{2\\pi}{3}';
                    else if (oldMax === 135) maxValue = '\\frac{3\\pi}{4}';
                    else if (oldMax === 150) maxValue = '\\frac{5\\pi}{6}';
                    else if (oldMax === 165) maxValue = '\\frac{11\\pi}{12}';
                    else if (oldMax === 180) maxValue = '\\pi';
                    else if (oldMax === 195) maxValue = '\\frac{13\\pi}{12}';
                    else if (oldMax === 210) maxValue = '\\frac{7\\pi}{6}';
                    else if (oldMax === 225) maxValue = '\\frac{5\\pi}{4}';
                    else if (oldMax === 240) maxValue = '\\frac{4\\pi}{3}';
                    else if (oldMax === 255) maxValue = '\\frac{17\\pi}{12}';
                    else if (oldMax === 270) maxValue = '\\frac{3\\pi}{2}';
                    else if (oldMax === 285) maxValue = '\\frac{19\\pi}{12}';
                    else if (oldMax === 300) maxValue = '\\frac{5\\pi}{3}';
                    else if (oldMax === 315) maxValue = '\\frac{7\\pi}{4}';
                    else if (oldMax === 330) maxValue = '\\frac{11\\pi}{6}';
                    else if (oldMax === 345) maxValue = '\\frac{23\\pi}{12}';
                    else if (oldMax === 360) maxValue = '2\\pi';
                    // Negative values
                    else if (oldMax === -15) maxValue = '-\\frac{\\pi}{12}';
                    else if (oldMax === -30) maxValue = '-\\frac{\\pi}{6}';
                    else if (oldMax === -45) maxValue = '-\\frac{\\pi}{4}';
                    else if (oldMax === -60) maxValue = '-\\frac{\\pi}{3}';
                    else if (oldMax === -75) maxValue = '-\\frac{5\\pi}{12}';
                    else if (oldMax === -90) maxValue = '-\\frac{\\pi}{2}';
                    else if (oldMax === -105) maxValue = '-\\frac{7\\pi}{12}';
                    else if (oldMax === -120) maxValue = '-\\frac{2\\pi}{3}';
                    else if (oldMax === -135) maxValue = '-\\frac{3\\pi}{4}';
                    else if (oldMax === -150) maxValue = '-\\frac{5\\pi}{6}';
                    else if (oldMax === -165) maxValue = '-\\frac{11\\pi}{12}';
                    else if (oldMax === -180) maxValue = '-\\pi';
                    else if (oldMax === -195) maxValue = '-\\frac{13\\pi}{12}';
                    else if (oldMax === -210) maxValue = '-\\frac{7\\pi}{6}';
                    else if (oldMax === -225) maxValue = '-\\frac{5\\pi}{4}';
                    else if (oldMax === -240) maxValue = '-\\frac{4\\pi}{3}';
                    else if (oldMax === -255) maxValue = '-\\frac{17\\pi}{12}';
                    else if (oldMax === -270) maxValue = '-\\frac{3\\pi}{2}';
                    else if (oldMax === -285) maxValue = '-\\frac{19\\pi}{12}';
                    else if (oldMax === -300) maxValue = '-\\frac{5\\pi}{3}';
                    else if (oldMax === -315) maxValue = '-\\frac{7\\pi}{4}';
                    else if (oldMax === -330) maxValue = '-\\frac{11\\pi}{6}';
                    else if (oldMax === -345) maxValue = '-\\frac{23\\pi}{12}';
                    else if (oldMax === -360) maxValue = '-2\\pi';
                    else if (oldMax === -540) maxValue = '-3\\pi';
                    else if (oldMax === -720) maxValue = '-4\\pi';
                    else if (oldMax === 375) maxValue = '\\frac{25\\pi}{12}';
                    else if (oldMax === 390) maxValue = '\\frac{13\\pi}{6}';
                    else if (oldMax === 405) maxValue = '\\frac{9\\pi}{4}';
                    else if (oldMax === 420) maxValue = '\\frac{7\\pi}{3}';
                    else if (oldMax === 435) maxValue = '\\frac{29\\pi}{12}';
                    else if (oldMax === 450) maxValue = '\\frac{5\\pi}{2}';
                    else if (oldMax === 540) maxValue = '3\\pi';
                    else if (oldMax === 720) maxValue = '4\\pi';
                    else maxValue = this.polarSettings.thetaMax.toFixed(6);
                    this.setRangeValue(thetaMaxInput, maxValue);
                    this.polarSettings.thetaMaxLatex = maxValue;
                }
                
                // Also convert animation state if it was initialized
                if (this.polarAnimation.storedThetaMax !== undefined && this.polarAnimation.storedThetaMax !== 0) {
                    this.polarAnimation.storedThetaMax = this.polarAnimation.storedThetaMax * Math.PI / 180;
                }
                if (this.polarAnimation.currentTheta !== undefined && this.polarAnimation.currentTheta !== 0) {
                    this.polarAnimation.currentTheta = this.polarAnimation.currentTheta * Math.PI / 180;
                }
            } else if (oldMode === 'radians' && this.angleMode === 'degrees') {
                // Convert radians to degrees
                this.polarSettings.thetaMin = this.polarSettings.thetaMin * 180 / Math.PI;
                this.polarSettings.thetaMax = this.polarSettings.thetaMax * 180 / Math.PI;
                
                if (thetaMinInput) {
                    // Round to nearest degree for cleaner display and to handle floating-point errors
                    const minDegrees = Math.round(this.polarSettings.thetaMin);
                    this.polarSettings.thetaMin = minDegrees; // Use rounded value
                    const minValue = minDegrees.toFixed(0);
                    this.setRangeValue(thetaMinInput, minValue);
                    this.polarSettings.thetaMinLatex = minValue;
                }
                if (thetaMaxInput) {
                    // Round to nearest degree for cleaner display and to handle floating-point errors
                    const maxDegrees = Math.round(this.polarSettings.thetaMax);
                    this.polarSettings.thetaMax = maxDegrees; // Use rounded value
                    const maxValue = maxDegrees.toFixed(0);
                    this.setRangeValue(thetaMaxInput, maxValue);
                    this.polarSettings.thetaMaxLatex = maxValue;
                }
                
                // Also convert animation state if it was initialized
                if (this.polarAnimation.storedThetaMax !== undefined && this.polarAnimation.storedThetaMax !== 0) {
                    this.polarAnimation.storedThetaMax = Math.round(this.polarAnimation.storedThetaMax * 180 / Math.PI);
                }
                if (this.polarAnimation.currentTheta !== undefined && this.polarAnimation.currentTheta !== 0) {
                    this.polarAnimation.currentTheta = this.polarAnimation.currentTheta * 180 / Math.PI;
                }
            }
        }
        
        // Only adjust viewport if there are trig functions that would be affected
        // BUT: Don't adjust viewport in polar mode - must maintain equal aspect ratio
        if (this.plotMode !== 'polar' && this.containsTrigFunctions()) {
            // Use the same smart viewport logic as the reset button for consistency
            const smartViewport = this.getSmartResetViewport();
            this.viewport.minX = smartViewport.minX;
            this.viewport.maxX = smartViewport.maxX;
            this.viewport.minY = smartViewport.minY;
            this.viewport.maxY = smartViewport.maxY;
            
            // Update scale for consistent grid/label spacing
            this.updateViewportScale();
            
            // Update range inputs to reflect the new ranges
            this.updateRangeInputs();
        }
        
        // Always replot functions since angle mode affects trig function evaluation
        // But axis labels will only change if trig functions are present
        this.replotAllFunctions();
        
        // Save viewport bounds to persist angle mode change
        // This is especially important for polar mode where updateRangeInputs() wasn't called
        this.saveViewportBounds();
    }
    
    initializeAngleMode() {
        // Check if there's a saved angle mode in localStorage (from polar bounds)
        let savedAngleMode = 'radians'; // Default to radians
        try {
            const polarData = localStorage.getItem('graphiti_polar_bounds');
            if (polarData) {
                const bounds = JSON.parse(polarData);
                if (bounds.angleMode !== undefined) {
                    savedAngleMode = bounds.angleMode;
                }
            }
        } catch (error) {
            console.warn('Could not load angle mode from localStorage:', error);
        }
        
        const degreesIcon = document.getElementById('degrees-icon');
        const radiansIcon = document.getElementById('radians-icon');
        
        this.angleMode = savedAngleMode;
        if (degreesIcon && radiansIcon) {
            if (this.angleMode === 'degrees') {
                degreesIcon.style.opacity = '1';    // Bright degrees icon
                radiansIcon.style.opacity = '0.3';  // Dim radians icon
            } else {
                degreesIcon.style.opacity = '0.3';  // Dim degrees icon
                radiansIcon.style.opacity = '1';    // Bright radians icon
            }
        }
    }
    
    evaluateFunction(expression, x) {
        try {
            // Convert from LaTeX format first (since we now store LaTeX)
            let processedExpression = this.convertFromLatex(expression);
            
            // Remove y= prefix if present (since we store full equations now)
            if (processedExpression.toLowerCase().startsWith('y=')) {
                processedExpression = processedExpression.substring(2);
            }
            
            // Make function names case-insensitive for mobile compatibility
            // Simply convert the entire expression to lowercase
            processedExpression = processedExpression.toLowerCase();
            
            // Handle degree mode by preprocessing the expression
            if (this.angleMode === 'degrees') {
                // Check if THIS specific expression contains regular trig functions
                const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedExpression);
                
                if (hasRegularTrigWithX) {
                    // Preprocess the expression to wrap trig function arguments with degree conversion
                    // Transform sin(xxx) to sin((xxx)*pi/180), cos(xxx) to cos((xxx)*pi/180), etc.
                    processedExpression = this.convertTrigToDegreeMode(processedExpression);
                }
            }
            
            // Use cached compiled expression for better performance
            const compiledExpression = this.getCompiledExpression(processedExpression);
            const result = compiledExpression.evaluate(this.getEvaluationScope({ x: x })); // Use x directly, no conversion needed
            
            // Ensure the result is a finite number
            if (typeof result === 'number' && isFinite(result)) {
                // Convert result for inverse trig functions if in degree mode
                if (this.angleMode === 'degrees') {
                    const hasInverseTrig = this.getCachedRegex('inverseTrig').test(expression.toLowerCase());
                    if (hasInverseTrig) {
                        const convertedResult = result * 180 / Math.PI; // Convert radians to degrees
                        return convertedResult;
                    }
                }
                return result;
            } else {
                return NaN;
            }
        } catch (error) {
            // Return NaN for invalid expressions or points
            // This allows the graphing to skip invalid points gracefully
            return NaN;
        }
    }

    convertTrigToDegreeMode(expression) {
        // Convert trigonometric functions to work with degrees
        // Transform sin(xxx) to sin((xxx)*pi/180), cos(xxx) to cos((xxx)*pi/180), etc.
        
        // Regular trig functions that need degree conversion
        const trigFunctions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cosec', 'cot'];
        
        let result = expression;
        
        for (const func of trigFunctions) {
            // Use a simpler approach to avoid infinite loops
            // Match the pattern: func(anything) where anything doesn't contain the same func
            const pattern = new RegExp(`\\b${func}\\s*\\(([^()]+|\\([^()]*\\))\\)`, 'g');
            
            result = result.replace(pattern, (match, argument) => {
                // Only wrap if not already wrapped with degree conversion
                if (argument.includes('*pi/180')) {
                    return match; // Already converted
                }
                return `${func}((${argument})*pi/180)`;
            });
        }
        
        return result;
    }
    
    worldToScreen(worldX, worldY) {
        // Calculate position based on viewport bounds
        const xRatio = (worldX - this.viewport.minX) / (this.viewport.maxX - this.viewport.minX);
        const yRatio = (worldY - this.viewport.minY) / (this.viewport.maxY - this.viewport.minY);
        
        const screenX = xRatio * this.viewport.width;
        const screenY = this.viewport.height - (yRatio * this.viewport.height); // Flip Y axis
        
        return { x: screenX, y: screenY };
    }
    
    screenToWorld(screenX, screenY) {
        const xRatio = screenX / this.viewport.width;
        const yRatio = (this.viewport.height - screenY) / this.viewport.height; // Flip Y axis
        
        const worldX = this.viewport.minX + (xRatio * (this.viewport.maxX - this.viewport.minX));
        const worldY = this.viewport.minY + (yRatio * (this.viewport.maxY - this.viewport.minY));
        
        return { x: worldX, y: worldY };
    }
    
    // ================================
    // CURVE TRACING UTILITIES
    // ================================
    
    findClosestImplicitPoint(func, screenX, screenY, tolerance) {
        // Find the closest point on an implicit function's curve (line segments)
        // Uses the points from marching squares output
        const pointsToUse = func.displayPoints || func.points;
        if (!pointsToUse || pointsToUse.length < 2) {
            return null;
        }
        
        let closestDistance = Infinity;
        let closestWorldX = null;
        let closestWorldY = null;
        
        // Check all line segments (stored as start, end, NaN triplets)
        for (let i = 0; i < pointsToUse.length - 1; i += 3) {
            const startPoint = pointsToUse[i];
            const endPoint = pointsToUse[i + 1];
            
            if (!startPoint || !endPoint || 
                !isFinite(startPoint.x) || !isFinite(startPoint.y) ||
                !isFinite(endPoint.x) || !isFinite(endPoint.y)) {
                continue;
            }
            
            // Find closest point on this line segment
            const result = this.closestPointOnSegment(
                startPoint.x, startPoint.y,
                endPoint.x, endPoint.y,
                screenX, screenY
            );
            
            if (result.distance < closestDistance) {
                closestDistance = result.distance;
                closestWorldX = result.worldX;
                closestWorldY = result.worldY;
            }
        }
        
        if (closestDistance < tolerance) {
            return {
                worldX: closestWorldX,
                worldY: closestWorldY,
                distance: closestDistance
            };
        }
        
        return null;
    }
    
    closestPointOnSegment(x1, y1, x2, y2, screenX, screenY) {
        // Find closest point on line segment (x1,y1)-(x2,y2) to screen point (screenX, screenY)
        // Convert segment endpoints to screen coordinates
        const screen1 = this.worldToScreen(x1, y1);
        const screen2 = this.worldToScreen(x2, y2);
        
        // Vector from point 1 to point 2
        const dx = screen2.x - screen1.x;
        const dy = screen2.y - screen1.y;
        
        // Vector from point 1 to click point
        const px = screenX - screen1.x;
        const py = screenY - screen1.y;
        
        // Project click point onto line segment
        const segmentLengthSquared = dx * dx + dy * dy;
        
        if (segmentLengthSquared === 0) {
            // Degenerate segment (point)
            const distance = Math.sqrt(px * px + py * py);
            return { worldX: x1, worldY: y1, distance };
        }
        
        // Parameter t represents position along segment (0 = start, 1 = end)
        let t = (px * dx + py * dy) / segmentLengthSquared;
        
        // Clamp t to [0, 1] to stay on segment
        t = Math.max(0, Math.min(1, t));
        
        // Interpolate world coordinates
        const worldX = x1 + t * (x2 - x1);
        const worldY = y1 + t * (y2 - y1);
        
        // Calculate distance in screen space
        const closestScreen = this.worldToScreen(worldX, worldY);
        const distance = Math.sqrt(
            Math.pow(closestScreen.x - screenX, 2) + 
            Math.pow(closestScreen.y - screenY, 2)
        );
        
        return { worldX, worldY, distance };
    }
    
    findClosestCurvePoint(screenX, screenY, tolerance) {
        const worldPos = this.screenToWorld(screenX, screenY);
        let closestFunction = null;
        let closestDistance = Infinity;
        let closestWorldX = worldPos.x;
        let closestWorldY = worldPos.y;
        let closestTheta = null; // For polar functions
        
        // Check each active function in current mode
        for (const func of this.getCurrentFunctions()) {
            if (!func.enabled || !func.expression.trim()) continue;
            
            const functionType = this.detectFunctionType(func.expression);
            
            // Handle implicit functions separately with segment-based detection
            if (functionType === 'implicit') {
                const result = this.findClosestImplicitPoint(func, screenX, screenY, tolerance);
                if (result && result.distance < closestDistance) {
                    closestDistance = result.distance;
                    closestFunction = func;
                    closestWorldX = result.worldX;
                    closestWorldY = result.worldY;
                }
                continue;
            }
            
            try {
                if (func.mode === 'polar') {
                    // Special handling for polar functions
                    const result = this.findClosestPolarPoint(func, screenX, screenY, tolerance);
                    if (result && result.distance < closestDistance) {
                        closestDistance = result.distance;
                        closestFunction = func;
                        closestWorldX = result.worldX;
                        closestWorldY = result.worldY;
                        closestTheta = result.theta; // Store theta for parametric tracing
                    }
                } else {
                    // Cartesian function detection (existing logic)
                    // Sample points around the click position
                    // Use a minimum sample range to ensure we don't miss curves in narrow viewports
                    const viewportRange = this.viewport.maxX - this.viewport.minX;
                    const baseSampleRange = viewportRange * 0.01; // 1% of viewport width
                    const minSampleRange = 0.1; // Minimum absolute range
                    const sampleRange = Math.max(baseSampleRange, minSampleRange);
                    const samples = 20;
                    
                    for (let i = 0; i < samples; i++) {
                        const testX = worldPos.x + (i - samples/2) * (sampleRange / samples);
                        
                        // Skip if outside viewport
                        if (testX < this.viewport.minX || testX > this.viewport.maxX) continue;
                        
                        // Evaluate function at this X position
                        const scope = { x: testX };
                        const testY = this.evaluateFunction(func.expression, testX);
                        
                        if (isNaN(testY) || !isFinite(testY)) continue;
                        
                        // Convert to screen coordinates to check distance
                        const testScreenPos = this.worldToScreen(testX, testY);
                        const distance = Math.sqrt(
                            Math.pow(testScreenPos.x - screenX, 2) + 
                            Math.pow(testScreenPos.y - screenY, 2)
                        );
                        
                        if (distance < tolerance && distance < closestDistance) {
                            closestDistance = distance;
                            closestFunction = func;
                            closestWorldX = testX;
                            closestWorldY = testY;
                        }
                    }
                }
            } catch (error) {
                // Skip functions that can't be evaluated
                continue;
            }
        }
        
        if (closestFunction) {
            return {
                function: closestFunction,
                worldX: closestWorldX,
                worldY: closestWorldY,
                distance: closestDistance,
                theta: closestTheta // Include theta for polar functions
            };
        }
        
        return null;
    }
    
    // Badge management methods for multi-badge tracing system
    addTraceBadge(functionId, worldX, worldY, functionColor, customText = null, badgeType = null, reuseId = null) {
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // If reusing an ID, ensure counter stays ahead
        const badgeId = reuseId !== null ? reuseId : this.input.badgeIdCounter++;
        if (reuseId !== null && reuseId >= this.input.badgeIdCounter) {
            this.input.badgeIdCounter = reuseId + 1;
        }
        
        const badge = {
            id: badgeId,
            functionId: functionId,
            worldX: snappedX,
            worldY: snappedY,
            functionColor: functionColor,
            customText: customText, // For intersection badges
            badgeType: badgeType, // For turning point badges (maximum, minimum, etc.)
            screenX: 0, // Will be updated during rendering
            screenY: 0, // Will be updated during rendering
            theta: null, // For polar functions - parametric position on curve
            // Tangent line properties
            hasTangent: false, // Whether to show tangent line at this point
            tangentSlope: null, // Slope of tangent line (dy/dx)
            tangentExpression: null, // Derivative expression (for display)
            secondDerivative: null, // Second derivative (d²y/dx²)
            neonTangent: false, // Whether to use pulsating neon colors for tangent
            // Normal line properties
            hasNormal: false, // Whether to show normal line at this point
            neonNormal: false // Whether to use pulsating neon colors for normal
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    removeBadgeById(badgeId) {
        // Check if this badge is part of an integral pair before removing
        const badge = this.input.persistentBadges.find(b => b.id === badgeId);
        const isIntegralBadge = badge && badge.hasIntegral;
        
        // Remove tangent and normal intersection badges that reference this badge
        this.removeTangentIntersectionBadgesForBadge(badgeId);
        this.removeNormalIntersectionBadgesForBadge(badgeId);
        
        // Remove integral pair if this badge is part of one
        if (isIntegralBadge) {
            this.removeIntegralPairForBadge(badgeId);
        } else {
            // Only remove this specific badge if it's not an integral badge
            // (integral badges are removed by removeIntegralPairForBadge which removes both)
            this.input.persistentBadges = this.input.persistentBadges.filter(badge => badge.id !== badgeId);
        }
        
        // Recalculate tangent intersections since badges changed
        if (this.showIntersections) {
            this.updateCombinedIntersections();
        }
        
        // Recalculate tangent intercepts since badges changed
        // Note: Don't call draw() here - let the caller handle it
        if (this.showIntercepts) {
            this.intercepts = this.findAxisIntercepts();
        }
    }
    
    removeBadgesForFunction(functionId) {
        const beforeCount = this.input.persistentBadges.length;
        
        // First, remove tangent and normal intersection badges for badges that belong to this function
        const badgesToRemove = this.input.persistentBadges.filter(badge => badge.functionId === functionId);
        badgesToRemove.forEach(badge => {
            if (badge.hasTangent) {
                this.removeTangentIntersectionBadgesForBadge(badge.id);
            }
            if (badge.hasNormal) {
                this.removeNormalIntersectionBadgesForBadge(badge.id);
            }
        });
        
        // Remove integral pairs for this function
        this.integralPairs = this.integralPairs.filter(pair => pair.functionId !== functionId);
        
        // Then remove the badges themselves
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => badge.functionId !== functionId);
        
        // Recalculate tangent intersections if any badges were removed
        if (beforeCount !== this.input.persistentBadges.length && this.showIntersections) {
            this.updateCombinedIntersections();
        }
    }

    removeIntersectionBadgesForFunction(functionId) {
        // Remove intersection badges (including tangent intersections) that involve the specified function
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !((badge.badgeType === 'intersection' || 
               badge.badgeType === 'tangent-intersection' || 
               badge.badgeType === 'tangent-tangent-intersection') && 
              (badge.func1Id === functionId || badge.func2Id === functionId))
        );
    }
    
    removeTangentIntersectionBadgesForBadge(badgeId) {
        // Remove tangent intersection badges that reference the specified badge
        const tangentBadgeIdString = `tangent_${badgeId}`;
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !((badge.badgeType === 'tangent-intersection' || badge.badgeType === 'tangent-tangent-intersection') && 
              (badge.func1Id === tangentBadgeIdString || badge.func2Id === tangentBadgeIdString))
        );
        
        // Also remove tangent intercept badges (x-intercept and y-intercept badges for tangent lines)
        this.input.persistentBadges = this.input.persistentBadges.filter(badge =>
            !(badge.badgeType === 'tangent-intercept' && badge.tangentBadgeId === badgeId)
        );
    }
    
    removeNormalIntersectionBadgesForBadge(badgeId) {
        // Remove normal intersection badges that reference the specified badge
        const normalBadgeIdString = `normal_${badgeId}`;
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !((badge.badgeType === 'normal-intersection' || badge.badgeType === 'normal-normal-intersection' || badge.badgeType === 'normal-tangent-intersection') && 
              (badge.func1Id === normalBadgeIdString || badge.func2Id === normalBadgeIdString))
        );
        
        // Also remove normal intercept badges (x-intercept and y-intercept badges for normal lines)
        this.input.persistentBadges = this.input.persistentBadges.filter(badge =>
            !(badge.badgeType === 'normal-intercept' && badge.normalBadgeId === badgeId)
        );
    }
    
    removeIntegralPairForBadge(badgeId) {
        // Find if this badge is part of an integral pair
        const pairIndex = this.integralPairs.findIndex(pair => 
            pair.badge1Id === badgeId || pair.badge2Id === badgeId
        );
        
        if (pairIndex !== -1) {
            const pair = this.integralPairs[pairIndex];
            
            // Remove both badges in the pair
            this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
                badge.id !== pair.badge1Id && badge.id !== pair.badge2Id
            );
            
            // Remove the pair
            this.integralPairs.splice(pairIndex, 1);
        }
    }

    clearIntersections() {
        // Remove all intersection badges (including tangent and normal intersections)
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            badge.functionId !== null && 
            badge.badgeType !== 'intersection' && 
            badge.badgeType !== 'tangent-intersection' && 
            badge.badgeType !== 'tangent-tangent-intersection' &&
            badge.badgeType !== 'normal-intersection' &&
            badge.badgeType !== 'normal-normal-intersection' &&
            badge.badgeType !== 'normal-tangent-intersection'
        );
        
        // Clear the intersection arrays
        this.intersections = [];
        this.explicitIntersections = [];
        this.implicitIntersections = [];
        this.tangentIntersections = [];
        this.normalIntersections = [];
    }

    // ================================
    // WEB WORKER INTERSECTION METHODS
    // ================================

    initializeIntersectionWorker() {
        try {
            this.intersectionWorker = new Worker('intersection-worker.js');
            
            // Handle messages from worker
            this.intersectionWorker.onmessage = (event) => {
                this.handleWorkerMessage(event.data);
            };
            
            // Handle worker errors
            this.intersectionWorker.onerror = (error) => {
                console.error('Intersection worker error:', error);
                this.isWorkerCalculating = false;
                // Fallback to main thread calculation
                this.intersections = this.findIntersections();
                this.draw();
            };
            
            // Test worker communication
            this.testWorkerCommunication();
            
        } catch (error) {
            console.warn('Web Workers not supported or failed to initialize:', error);
            this.intersectionWorker = null;
        }
    }

    testWorkerCommunication() {
        if (this.intersectionWorker) {
            this.intersectionWorker.postMessage({
                type: 'TEST_COMMUNICATION',
                data: { message: 'Hello from main thread' }
            });
        }
    }

    handleWorkerMessage(message) {
        const { type, data } = message;
        
        switch (type) {
            case 'TEST_RESPONSE':
                // Worker communication successful
                break;
                
            case 'INTERSECTIONS_COMPLETE':
                // Track intersection calculation time for performance monitoring
                if (this.performance.enabled && data.calculationTime) {
                    this.performance.intersectionTime = data.calculationTime;
                }
                
                // Handle different calculation types
                if (data.calculationType === 'explicit') {
                    this.explicitIntersections = data.intersections;
                } else if (data.calculationType === 'implicit') {
                    this.implicitIntersections = data.intersections;
                    this.implicitIntersectionsPending = false; // Clear pending flag
                } else {
                    // Legacy fallback
                    this.intersections = data.intersections;
                }
                
                // Update combined intersections and trigger redraw
                if (data.calculationType === 'explicit' || data.calculationType === 'implicit') {
                    this.updateCombinedIntersections();
                }
                
                this.isWorkerCalculating = false;
                
                // After intersection calculation completes, clean up any intersection badges for invalid functions
                if (this.plotMode === 'polar') {
                    this.getCurrentFunctions().forEach(func => {
                        if (!func.points || func.points.length === 0) {
                            this.removeIntersectionBadgesForFunction(func.id);
                        }
                    });
                }
                
                // Use chunked rendering to avoid blocking UI
                this.scheduleChunkedDraw();
                break;
                
            case 'INTERSECTIONS_ERROR':
                console.error('Worker intersection calculation error:', data.error);
                this.isWorkerCalculating = false;
                // Fallback to main thread calculation
                this.intersections = this.findIntersections();
                this.draw();
                break;
                
            case 'WORKER_ERROR':
                console.error('Worker error:', data.error);
                this.isWorkerCalculating = false;
                break;
                
            case 'CALCULATION_CANCELLED':
                this.isWorkerCalculating = false;
                break;
                
            default:
                console.warn('Unknown worker message type:', type);
        }
    }

    calculateIntersectionsWithWorker(immediate = false) {
        
        if (!this.intersectionWorker) {
            // Fallback to main thread if worker not available
            return this.calculateExplicitIntersections();
        }

        // Always calculate explicit intersections immediately (fast)
        this.calculateExplicitIntersections();
        
        // Schedule implicit intersection calculation with immediate flag
        this.scheduleImplicitIntersectionCalculation(immediate);

        // Return empty array for now - results will come via message handlers
        return [];
    }

    calculateExplicitIntersections() {
        // Cancel any previous calculation
        if (this.isWorkerCalculating) {
            this.intersectionWorker.postMessage({ type: 'CANCEL_CALCULATION' });
        }

        this.isWorkerCalculating = true;

        // Process explicit functions and theta-constant rays for fast intersection detection
        const explicitFunctions = this.getCurrentFunctions().filter(f => {
            if (!f.enabled || f.points.length === 0) return false;
            const functionType = this.detectFunctionType(f.expression);
            return functionType === 'explicit' || functionType === 'theta-constant';
        });

        if (explicitFunctions.length < 2) {
            this.explicitIntersections = [];
            this.updateCombinedIntersections();
            this.isWorkerCalculating = false;
            return [];
        }

        const workerData = {
            functions: explicitFunctions.map(func => ({
                id: func.id,
                expression: func.expression,
                points: func.points,
                color: func.color,
                enabled: func.enabled
            })),
            viewport: {
                minX: this.viewport.minX,
                maxX: this.viewport.maxX,
                minY: this.viewport.minY,
                maxY: this.viewport.maxY,
                width: this.viewport.width,
                height: this.viewport.height
            },
            plotMode: this.plotMode,
            maxResolution: 1000,
            calculationType: 'explicit' // Flag for explicit intersections
        };

        // Send calculation request to worker
        this.intersectionWorker.postMessage({
            type: 'CALCULATE_INTERSECTIONS',
            data: workerData
        });

        return [];
    }

    scheduleImplicitIntersectionCalculation(immediate = false) {
        // Clear any existing timer
        if (this.implicitIntersectionTimer) {
            clearTimeout(this.implicitIntersectionTimer);
        }

        const allFunctions = this.getCurrentFunctions().filter(f => f.enabled && f.points.length > 0);
        const hasImplicitFunctions = allFunctions.some(f => this.detectFunctionType(f.expression) === 'implicit');
        
        if (!hasImplicitFunctions) {
            this.implicitIntersections = [];
            this.implicitIntersectionsPending = false;
            this.updateCombinedIntersections();
            return;
        }

        // Mark that implicit intersections are pending
        this.implicitIntersectionsPending = true;
        
        // Calculate immediately or after delay based on flag
        const delay = immediate ? 0 : this.implicitIntersectionDelay;
        this.implicitIntersectionTimer = setTimeout(() => {
            this.calculateImplicitIntersections();
        }, delay);
    }

    async calculateImplicitIntersections() {
        // During viewport changes, use cached points; otherwise use current points
        const allFunctions = this.getCurrentFunctions().filter(f => {
            if (!f.enabled) return false;
            const points = this.isViewportChanging ? (f.cachedPoints || []) : (f.points || []);
            return points.length > 0;
        });
        const implicitFunctions = allFunctions.filter(f => this.detectFunctionType(f.expression) === 'implicit');
        
        // Need at least one implicit function and another function
        if (implicitFunctions.length === 0 || allFunctions.length < 2) {
            this.implicitIntersections = [];
            this.updateCombinedIntersections();
            return;
        }

        // Replot implicit functions at high resolution for intersection detection
        const highResFunctions = [];
        
        for (const func of allFunctions) {
            if (this.detectFunctionType(func.expression) === 'implicit') {
                // Create a copy and replot at high resolution
                const highResFunc = {
                    ...func,
                    points: [] // Will be filled by high-res plotting
                };
                await this.plotImplicitFunction(highResFunc, true, false); // true = high resolution, false = not startup
                highResFunctions.push(highResFunc);
            } else {
                // Use existing points for explicit functions (cached if viewport changing)
                const funcPoints = this.isViewportChanging ? (func.cachedPoints || func.points || []) : (func.points || []);
                highResFunctions.push({
                    ...func,
                    points: funcPoints
                });
            }
        }

        // Use worker for intersection calculation with high-res data
        const workerData = {
            functions: highResFunctions.map(func => ({
                id: func.id,
                expression: func.expression,
                points: func.points,
                color: func.color,
                enabled: func.enabled,
                isImplicit: this.detectFunctionType(func.expression) === 'implicit'
            })),
            viewport: {
                minX: this.viewport.minX,
                maxX: this.viewport.maxX,
                minY: this.viewport.minY,
                maxY: this.viewport.maxY,
                width: this.viewport.width,
                height: this.viewport.height
            },
            plotMode: this.plotMode,
            maxResolution: 1000,
            calculationType: 'implicit' // Flag for implicit intersections
        };

        this.intersectionWorker.postMessage({
            type: 'CALCULATE_INTERSECTIONS',
            data: workerData
        });
    }

    updateCombinedIntersections() {
        // Calculate tangent and normal intersections
        this.tangentIntersections = this.findTangentIntersections();
        this.normalIntersections = this.findNormalIntersections();
        
        // Combine explicit, implicit, tangent, and normal intersections for display
        this.intersections = [...this.explicitIntersections, ...this.implicitIntersections, ...this.tangentIntersections, ...this.normalIntersections];
        
        // Only trigger redraw if viewport is not changing AND no implicit intersections are pending
        // During viewport changes, we use frozen cache for visual continuity
        // When implicit intersections are pending, wait for them to complete to avoid premature redraw
        if (!this.isViewportChanging && !this.implicitIntersectionsPending) {
            // Clear frozen intersection badges now that all intersection calculations are complete
            this.frozenIntersectionBadges = [];
            this.draw();
        }
    }

    // ================================
    // INTERSECTION CACHING METHODS
    // ================================

    updateFunctionChangeTracking(functions) {
        // Check each function for changes
        for (const func of functions) {
            // For implicit functions, only track expression changes, not point changes
            // since points change with zoom but intersections remain the same
            const isImplicit = this.detectFunctionType(func.expression) === 'implicit';
            
            let currentState;
            if (isImplicit) {
                // Only track expression for implicit functions
                currentState = func.expression;
            } else {
                // Track both expression and points for explicit functions
                currentState = `${func.expression}|${JSON.stringify(func.points.slice(0, 10))}`; // Sample of points
            }
            
            const lastState = this.lastFunctionStates.get(func.id);
            
            if (lastState !== currentState) {
                this.functionChangeFlags.set(func.id, true);
                this.lastFunctionStates.set(func.id, currentState);
                
                // Only invalidate cache for actual expression changes
                if (!lastState || lastState.split('|')[0] !== func.expression) {
                    this.invalidateCacheForFunction(func.id);
                }
            }
        }
    }

    invalidateCacheForFunction(functionId) {
        // Remove all cached intersections involving this function
        const keysToDelete = [];
        for (const [key] of this.cachedIntersections) {
            const [id1, id2] = key.split(',');
            if (id1 === functionId.toString() || id2 === functionId.toString()) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.cachedIntersections.delete(key);
        }
    }

    getCachedIntersections(functions) {
        const cached = [];
        
        // Collect all valid cached intersections
        for (let i = 0; i < functions.length; i++) {
            for (let j = i + 1; j < functions.length; j++) {
                const func1 = functions[i];
                const func2 = functions[j];
                const key1 = `${func1.id},${func2.id}`;
                const key2 = `${func2.id},${func1.id}`;
                
                const cachedIntersection = this.cachedIntersections.get(key1) || this.cachedIntersections.get(key2);
                if (cachedIntersection) {
                    // Add current function references to cached intersections
                    cached.push(...cachedIntersection.map(intersection => ({
                        ...intersection,
                        func1: func1,
                        func2: func2
                    })));
                }
            }
        }
        
        return cached;
    }

    getFunctionsNeedingRecalculation(functions) {
        // Check if any functions have actually changed expressions (not just zoom/resolution)
        const actuallyChanged = [];
        
        for (const func of functions) {
            if (this.functionChangeFlags.get(func.id)) {
                const isImplicit = this.detectFunctionType(func.expression) === 'implicit';
                
                // For implicit functions, check if we have any cached intersections
                // If not, we need to calculate
                if (isImplicit) {
                    const hasCachedIntersections = this.hasCachedIntersectionsForFunction(func.id, functions);
                    if (!hasCachedIntersections) {
                        actuallyChanged.push(func);
                    }
                } else {
                    // For explicit functions, always recalculate if changed
                    actuallyChanged.push(func);
                }
            }
        }
        
        // Clear change flags after processing
        for (const func of functions) {
            this.functionChangeFlags.set(func.id, false);
        }
        
        // Return all functions if any need recalculation, or empty array if all cached
        return actuallyChanged.length > 0 ? functions : [];
    }

    hasCachedIntersectionsForFunction(functionId, allFunctions) {
        // Check if this function has cached intersections with any other enabled function
        for (const otherFunc of allFunctions) {
            if (otherFunc.id !== functionId) {
                const key1 = `${functionId},${otherFunc.id}`;
                const key2 = `${otherFunc.id},${functionId}`;
                
                if (this.cachedIntersections.has(key1) || this.cachedIntersections.has(key2)) {
                    return true;
                }
            }
        }
        return false;
    }

    updateIntersectionCache(intersections) {
        // Cache new intersection results by function pair
        const functionPairs = new Set();
        
        for (const intersection of intersections) {
            const id1 = intersection.func1.id;
            const id2 = intersection.func2.id;
            const key = id1 < id2 ? `${id1},${id2}` : `${id2},${id1}`;
            
            if (!functionPairs.has(key)) {
                functionPairs.add(key);
                // Find all intersections for this pair
                const pairIntersections = intersections.filter(int => 
                    (int.func1.id === id1 && int.func2.id === id2) ||
                    (int.func1.id === id2 && int.func2.id === id1)
                );
                
                // Check if we should update existing cache (higher resolution might be more accurate)
                const existingCache = this.cachedIntersections.get(key);
                let shouldUpdate = true;
                
                if (existingCache && existingCache.length > 0) {
                    // Keep existing cache if it has more intersections (might be from higher resolution)
                    // Unless new calculation has significantly different results
                    const newCount = pairIntersections.length;
                    const existingCount = existingCache.length;
                    
                    // Update if new calculation finds more intersections or similar count with better precision
                    shouldUpdate = newCount > existingCount || Math.abs(newCount - existingCount) <= 2;
                }
                
                if (shouldUpdate) {
                    // Store in cache (without function references to avoid memory leaks)
                    this.cachedIntersections.set(key, pairIntersections.map(int => ({
                        x: int.x,
                        y: int.y,
                        isApproximate: int.isApproximate,
                        isTangent: int.isTangent
                    })));
                }
            }
        }
    }
    
    // ================================
    // AXIS INTERCEPT DETECTION METHODS
    // ================================
    
    findAxisIntercepts() {
        // Early exit if intercept detection is disabled
        if (!this.showIntercepts) {
            return [];
        }
        
        if (this.plotMode === 'cartesian') {
            return this.findCartesianAxisIntercepts();
        } else if (this.plotMode === 'polar') {
            return this.findPolarAxisIntercepts();
        }
        
        return [];
    }
    
    findCartesianAxisIntercepts() {
        const intercepts = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => {
            // Filter for enabled functions with valid expressions and points
            // Use displayPoints (stable buffer) if available, otherwise fall back to points
            const pointsToCheck = f.displayPoints || f.points;
            if (!f.enabled || !pointsToCheck || pointsToCheck.length === 0) {
                return false;
            }
            
            // Check that the expression is valid
            if (!f.expression || !f.expression.trim() || this.getCachedRegex('operatorEnd').test(f.expression.trim())) {
                return false;
            }
            
            return true;
        });
        
        // Find intercepts for each enabled function
        for (const func of enabledFunctions) {
            // Find x-intercepts (where y = 0)
            const xIntercepts = this.findXInterceptsForFunction(func);
            intercepts.push(...xIntercepts);
            
            // Find y-intercepts (where x = 0)
            const yIntercepts = this.findYInterceptsForFunction(func);
            intercepts.push(...yIntercepts);
        }
        
        // Find intercepts for tangent lines
        const tangentIntercepts = this.findTangentAxisIntercepts();
        intercepts.push(...tangentIntercepts);
        
        // Find intercepts for normal lines
        const normalIntercepts = this.findNormalAxisIntercepts();
        intercepts.push(...normalIntercepts);
        
        return intercepts;
    }
    
    findTangentAxisIntercepts() {
        const intercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts
        
        // Get all badges with tangent lines
        const tangentBadges = this.input.persistentBadges.filter(b => b.hasTangent && b.tangentSlope !== null);
        
        for (const badge of tangentBadges) {
            // Tangent line equation: y = m*x + b
            const m = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            const b = badge.worldY - m * badge.worldX;
            
            // X-intercept: where y = 0
            // 0 = m*x + b  →  x = -b/m
            if (Math.abs(m) > 1e-10) { // Avoid division by near-zero (horizontal lines)
                const xIntercept = -b / m;
                
                // Check if within reasonable viewport bounds
                const viewportMargin = 10;
                if (xIntercept >= this.viewport.minX - viewportMargin && 
                    xIntercept <= this.viewport.maxX + viewportMargin) {
                    
                    // Check if far enough from origin and other intercepts
                    const tooCloseToOrigin = Math.abs(xIntercept) < 0.15;
                    const isDuplicate = intercepts.some(existing => 
                        existing.type === 'x-intercept' && 
                        Math.abs(existing.x - xIntercept) < minDistance
                    );
                    
                    if (!tooCloseToOrigin && !isDuplicate) {
                        intercepts.push({
                            x: xIntercept,
                            y: 0,
                            type: 'x-intercept',
                            functionId: null,
                            tangentBadgeId: badge.id,
                            color: badge.functionColor,
                            isTangentIntercept: true
                        });
                    }
                }
            }
            
            // Y-intercept: where x = 0
            // y = m*0 + b  →  y = b
            const yIntercept = b;
            
            // Check if within reasonable viewport bounds
            const viewportMargin = 10;
            if (yIntercept >= this.viewport.minY - viewportMargin && 
                yIntercept <= this.viewport.maxY + viewportMargin) {
                
                // Check if far enough from origin and other intercepts
                const tooCloseToOrigin = Math.abs(yIntercept) < 0.15;
                const isDuplicate = intercepts.some(existing => 
                    existing.type === 'y-intercept' && 
                    Math.abs(existing.y - yIntercept) < minDistance
                );
                
                if (!tooCloseToOrigin && !isDuplicate) {
                    intercepts.push({
                        x: 0,
                        y: yIntercept,
                        type: 'y-intercept',
                        functionId: null,
                        tangentBadgeId: badge.id,
                        color: badge.functionColor,
                        isTangentIntercept: true
                    });
                }
            }
        }
        
        return intercepts;
    }
    
    findNormalAxisIntercepts() {
        const intercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts
        
        // Get all badges with normal lines
        const normalBadges = this.input.persistentBadges.filter(b => b.hasNormal && b.tangentSlope !== null);
        
        for (const badge of normalBadges) {
            // Calculate normal slope from tangent slope
            const tangentSlope = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            let m;
            if (Math.abs(tangentSlope) < 1e-10) {
                m = Infinity; // Vertical normal
            } else if (Math.abs(tangentSlope) > 1e10) {
                m = 0; // Horizontal normal
            } else {
                m = -1 / tangentSlope;
            }
            
            // Skip vertical normals for intercept calculation (they don't have y-intercepts in the traditional sense)
            if (m === Infinity || m === -Infinity) {
                continue;
            }
            
            // Normal line equation: y = m*x + b
            const b = badge.worldY - m * badge.worldX;
            
            // X-intercept: where y = 0
            // 0 = m*x + b  →  x = -b/m
            if (Math.abs(m) > 1e-10) { // Avoid division by near-zero (horizontal lines)
                const xIntercept = -b / m;
                
                // Check if within reasonable viewport bounds
                const viewportMargin = 10;
                if (xIntercept >= this.viewport.minX - viewportMargin && 
                    xIntercept <= this.viewport.maxX + viewportMargin) {
                    
                    // Check if far enough from origin and other intercepts
                    const tooCloseToOrigin = Math.abs(xIntercept) < 0.15;
                    const isDuplicate = intercepts.some(existing => 
                        existing.type === 'x-intercept' && 
                        Math.abs(existing.x - xIntercept) < minDistance
                    );
                    
                    if (!tooCloseToOrigin && !isDuplicate) {
                        intercepts.push({
                            x: xIntercept,
                            y: 0,
                            type: 'x-intercept',
                            functionId: null,
                            normalBadgeId: badge.id,
                            color: badge.functionColor,
                            isNormalIntercept: true
                        });
                    }
                }
            }
            
            // Y-intercept: where x = 0
            // y = m*0 + b  →  y = b
            const yIntercept = b;
            
            // Check if within reasonable viewport bounds
            const viewportMargin = 10;
            if (yIntercept >= this.viewport.minY - viewportMargin && 
                yIntercept <= this.viewport.maxY + viewportMargin) {
                
                // Check if far enough from origin and other intercepts
                const tooCloseToOrigin = Math.abs(yIntercept) < 0.15;
                const isDuplicate = intercepts.some(existing => 
                    existing.type === 'y-intercept' && 
                    Math.abs(existing.y - yIntercept) < minDistance
                );
                
                if (!tooCloseToOrigin && !isDuplicate) {
                    intercepts.push({
                        x: 0,
                        y: yIntercept,
                        type: 'y-intercept',
                        functionId: null,
                        normalBadgeId: badge.id,
                        color: badge.functionColor,
                        isNormalIntercept: true
                    });
                }
            }
        }
        
        return intercepts;
    }
    
    findXInterceptsForFunction(func) {
        const xIntercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts (in world coordinates)
        
        // Use displayPoints for implicit functions (double-buffering), fall back to points
        const points = func.displayPoints || func.points;
        
        // Check if it's an implicit function
        const isImplicit = this.detectFunctionType(func.expression) === 'implicit';
        
        if (isImplicit) {
            // For implicit functions, find points where y is closest to 0
            // Strategy: Find regions where curve crosses x-axis, then pick closest point in each region
            const candidates = [];
            
            for (let i = 0; i < points.length - 1; i++) {
                const x1 = points[i].x;
                const y1 = points[i].y;
                const x2 = points[i + 1].x;
                const y2 = points[i + 1].y;
                
                // Look for sign changes or points very close to zero
                if ((y1 * y2 <= 0) || Math.abs(y1) < 0.1 || Math.abs(y2) < 0.1) {
                    // This segment crosses or approaches the x-axis
                    // Pick the point closest to y=0
                    if (Math.abs(y1) < Math.abs(y2)) {
                        candidates.push({ x: x1, y: Math.abs(y1) });
                    } else {
                        candidates.push({ x: x2, y: Math.abs(y2) });
                    }
                }
            }
            
            // Filter out invalid candidates (NaN or infinite values)
            // Also exclude candidates very close to origin (edge case, visually obvious)
            const validCandidates = candidates.filter(c => 
                isFinite(c.x) && isFinite(c.y) && 
                !(Math.abs(c.x) < 0.15 && c.y < 0.15)  // Exclude origin region
            );
            
            // Sort candidates by x position
            validCandidates.sort((a, b) => a.x - b.x);
            
            // Group candidates and pick the best from each group
            for (const candidate of validCandidates) {
                const xValue = candidate.x;
                
                const isDuplicate = xIntercepts.some(existing => 
                    Math.abs(existing.x - xValue) < minDistance
                );
                
                if (!isDuplicate) {
                    xIntercepts.push({
                        x: xValue,
                        y: 0,
                        type: 'x-intercept',
                        functionId: func.id,
                        color: func.color
                    });
                }
            }
        } else {
            // For explicit functions (y = f(x)), find where y crosses zero
            for (let i = 0; i < points.length - 1; i++) {
                const x1 = points[i].x;
                const y1 = points[i].y;
                const x2 = points[i + 1].x;
                const y2 = points[i + 1].y;
                
                // Check for valid points
                if (!isFinite(y1) || !isFinite(y2)) continue;
                
                // Check for sign change (zero crossing) or exact zero
                // Use <= to catch cases where one point is exactly zero
                if ((y1 * y2 <= 0) && !(y1 === 0 && y2 === 0)) {
                    // Extract just the right-hand side for bisection (e.g., "y=..." -> "...")
                    let exprForBisection = func.expression;
                    if (exprForBisection.includes('=')) {
                        exprForBisection = exprForBisection.split('=')[1];
                    }
                    
                    // Use bisection method to find more accurate zero
                    let xIntercept;
                    try {
                        xIntercept = y1 === 0 ? x1 : (y2 === 0 ? x2 : this.bisectionMethod(exprForBisection, x1, x2, 'y'));
                    } catch (error) {
                        xIntercept = null;
                    }
                    
                    if (xIntercept !== null) {
                        // Check if this intercept is far enough from existing ones
                        const isDuplicate = xIntercepts.some(existing => 
                            Math.abs(existing.x - xIntercept) < minDistance
                        );
                        
                        if (!isDuplicate) {
                            xIntercepts.push({
                                x: xIntercept,
                                y: 0,
                                type: 'x-intercept',
                                functionId: func.id,
                                color: func.color
                            });
                        }
                    }
                }
            }
        }
        
        return xIntercepts;
    }
    
    findYInterceptsForFunction(func) {
        const yIntercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts (in world coordinates)
        
        // Use displayPoints for implicit functions (double-buffering), fall back to points
        const points = func.displayPoints || func.points;
        const isImplicit = this.detectFunctionType(func.expression) === 'implicit';
        
        if (isImplicit) {
            // For implicit functions, find points where x is closest to 0
            // Strategy: Find regions where curve crosses y-axis, then pick closest point in each region
            const candidates = [];
            
            for (let i = 0; i < points.length - 1; i++) {
                const x1 = points[i].x;
                const y1 = points[i].y;
                const x2 = points[i + 1].x;
                const y2 = points[i + 1].y;
                
                // Check for sign change (actual axis crossing)
                const hasSignChange = x1 * x2 <= 0;
                
                // Look for sign changes or points very close to zero
                if (hasSignChange || Math.abs(x1) < 0.1 || Math.abs(x2) < 0.1) {
                    // This segment crosses or approaches the y-axis
                    // Pick the point closest to x=0
                    if (Math.abs(x1) < Math.abs(x2)) {
                        candidates.push({ x: Math.abs(x1), y: y1, signChange: hasSignChange });
                    } else {
                        candidates.push({ x: Math.abs(x2), y: y2, signChange: hasSignChange });
                    }
                }
            }
            
            // Filter out invalid candidates (NaN or infinite values)
            // Also exclude candidates very close to origin (edge case, visually obvious)
            const validCandidates = candidates.filter(c => 
                isFinite(c.x) && isFinite(c.y) &&
                !(c.x < 0.15 && Math.abs(c.y) < 0.15)  // Exclude origin region
            );
            
            // Sort candidates by y position
            validCandidates.sort((a, b) => a.y - b.y);
            
            // Group candidates and pick the best from each group
            for (const candidate of validCandidates) {
                const yValue = candidate.y;
                
                const isDuplicate = yIntercepts.some(existing => 
                    Math.abs(existing.y - yValue) < minDistance
                );
                
                if (!isDuplicate) {
                    yIntercepts.push({
                        x: 0,
                        y: yValue,
                        type: 'y-intercept',
                        functionId: func.id,
                        color: func.color
                    });
                }
            }
        } else {
            // Y-intercept occurs where x = 0
            // Evaluate the explicit function at x = 0
            try {
                // Convert from LaTeX first since we now store LaTeX format
                const expr = this.convertFromLatex(func.expression);
                const scope = this.getEvaluationScope({ x: 0 });
                const y = math.evaluate(expr, scope);
                
                if (isFinite(y) && Math.abs(y) < 1000) { // Reasonable bounds check
                    yIntercepts.push({
                        x: 0,
                        y: y,
                        type: 'y-intercept',
                        functionId: func.id,
                        color: func.color
                    });
                }
            } catch (error) {
                // If evaluation fails, no y-intercept
            }
        }
        
        return yIntercepts;
    }
    
    bisectionMethod(expression, x1, x2, variable = 'y') {
        // Convert from LaTeX first since expression might be in LaTeX format
        const convertedExpression = this.convertFromLatex(expression);
        
        // Use bisection to find where the function crosses zero
        const maxIterations = 50;
        const tolerance = 0.0001;
        
        for (let i = 0; i < maxIterations; i++) {
            const xMid = (x1 + x2) / 2;
            
            try {
                const scope = this.getEvaluationScope({ x: xMid });
                const yMid = math.evaluate(convertedExpression, scope);
                
                if (!isFinite(yMid)) {
                    return null;
                }
                
                if (Math.abs(yMid) < tolerance) {
                    return xMid;
                }
                
                const scope1 = this.getEvaluationScope({ x: x1 });
                const y1 = math.evaluate(convertedExpression, scope1);
                
                if (y1 * yMid < 0) {
                    x2 = xMid;
                } else {
                    x1 = xMid;
                }
            } catch (error) {
                return null;
            }
        }
        
        return (x1 + x2) / 2;
    }
    
    findPolarAxisIntercepts() {
        const intercepts = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => {
            if (!f.enabled || !f.points || f.points.length === 0) {
                return false;
            }
            if (!f.expression || !f.expression.trim() || this.getCachedRegex('operatorEnd').test(f.expression.trim())) {
                return false;
            }
            // Skip theta-constant rays (they always pass through origin and don't have meaningful axis intercepts)
            const functionType = this.detectFunctionType(f.expression);
            if (functionType === 'theta-constant') {
                return false;
            }
            return true;
        });
        
        // For each function, find where it crosses the Cartesian axes
        // (positive x-axis at θ=0°, positive y-axis at θ=90°, negative x-axis at θ=180°, negative y-axis at θ=270°)
        for (const func of enabledFunctions) {
            const points = func.points;
            
            // Look for crossings near each axis angle
            // We check where the curve crosses horizontal line (y=0) and vertical line (x=0) in Cartesian coords
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                
                // Skip invalid points or discontinuities
                if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
                    continue;
                }
                
                // Check for x-axis crossing (y changes sign or is very close to zero)
                const yTolerance = 0.001;
                if (p1.y * p2.y <= 0 && !(p1.y === 0 && p2.y === 0)) {
                    let x, y;
                    
                    // Check if either point is already on the axis
                    if (Math.abs(p1.y) < yTolerance) {
                        x = p1.x;
                        y = 0;
                    } else if (Math.abs(p2.y) < yTolerance) {
                        x = p2.x;
                        y = 0;
                    } else {
                        // Linear interpolation to find crossing point
                        const t = -p1.y / (p2.y - p1.y);
                        x = p1.x + t * (p2.x - p1.x);
                        y = 0;
                    }
                    
                    // Determine which side of x-axis (positive or negative x)
                    const type = x > 0 ? 'x-axis-positive' : 'x-axis-negative';
                    
                    intercepts.push({
                        x: x,
                        y: y,
                        type: type,
                        functionId: func.id,
                        color: func.color
                    });
                }
                
                // Check for y-axis crossing (x changes sign or is very close to zero)
                const xTolerance = 0.001;
                if (p1.x * p2.x <= 0 && !(p1.x === 0 && p2.x === 0)) {
                    let x, y;
                    
                    // Check if either point is already on the axis
                    if (Math.abs(p1.x) < xTolerance) {
                        x = 0;
                        y = p1.y;
                    } else if (Math.abs(p2.x) < xTolerance) {
                        x = 0;
                        y = p2.y;
                    } else {
                        // Linear interpolation to find crossing point
                        const t = -p1.x / (p2.x - p1.x);
                        x = 0;
                        y = p1.y + t * (p2.y - p1.y);
                    }
                    
                    // Determine which side of y-axis (positive or negative y)
                    const type = y > 0 ? 'y-axis-positive' : 'y-axis-negative';
                    
                    intercepts.push({
                        x: x,
                        y: y,
                        type: type,
                        functionId: func.id,
                        color: func.color
                    });
                }
            }
        }
        
        // Find intercepts for tangent lines in polar mode
        const tangentIntercepts = this.findPolarTangentAxisIntercepts();
        intercepts.push(...tangentIntercepts);
        
        // Find intercepts for normal lines in polar mode
        const normalIntercepts = this.findPolarNormalAxisIntercepts();
        intercepts.push(...normalIntercepts);
        
        return intercepts;
    }
    
    findPolarTangentAxisIntercepts() {
        const intercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts
        
        // Get all badges with tangent lines
        const tangentBadges = this.input.persistentBadges.filter(b => b.hasTangent && b.tangentSlope !== null);
        
        for (const badge of tangentBadges) {
            // Tangent line equation: y = m*x + b
            const m = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            const b = badge.worldY - m * badge.worldX;
            
            // X-axis crossings (where y = 0)
            // 0 = m*x + b  →  x = -b/m
            if (Math.abs(m) > 1e-10) { // Avoid division by near-zero (horizontal lines)
                const xIntercept = -b / m;
                
                // Check if within reasonable viewport bounds
                const viewportMargin = 10;
                if (xIntercept >= this.viewport.minX - viewportMargin && 
                    xIntercept <= this.viewport.maxX + viewportMargin) {
                    
                    // Check if far enough from origin and other intercepts
                    const tooCloseToOrigin = Math.abs(xIntercept) < 0.15;
                    const isDuplicate = intercepts.some(existing => 
                        (existing.type === 'x-axis-positive' || existing.type === 'x-axis-negative') && 
                        Math.abs(existing.x - xIntercept) < minDistance
                    );
                    
                    if (!tooCloseToOrigin && !isDuplicate) {
                        const type = xIntercept > 0 ? 'x-axis-positive' : 'x-axis-negative';
                        intercepts.push({
                            x: xIntercept,
                            y: 0,
                            type: type,
                            functionId: null,
                            tangentBadgeId: badge.id,
                            color: badge.functionColor,
                            isTangentIntercept: true
                        });
                    }
                }
            }
            
            // Y-axis crossings (where x = 0)
            // y = m*0 + b  →  y = b
            const yIntercept = b;
            
            // Check if within reasonable viewport bounds
            const viewportMargin = 10;
            if (yIntercept >= this.viewport.minY - viewportMargin && 
                yIntercept <= this.viewport.maxY + viewportMargin) {
                
                // Check if far enough from origin and other intercepts
                const tooCloseToOrigin = Math.abs(yIntercept) < 0.15;
                const isDuplicate = intercepts.some(existing => 
                    (existing.type === 'y-axis-positive' || existing.type === 'y-axis-negative') && 
                    Math.abs(existing.y - yIntercept) < minDistance
                );
                
                if (!tooCloseToOrigin && !isDuplicate) {
                    const type = yIntercept > 0 ? 'y-axis-positive' : 'y-axis-negative';
                    intercepts.push({
                        x: 0,
                        y: yIntercept,
                        type: type,
                        functionId: null,
                        tangentBadgeId: badge.id,
                        color: badge.functionColor,
                        isTangentIntercept: true
                    });
                }
            }
        }
        
        return intercepts;
    }
    
    findPolarNormalAxisIntercepts() {
        const intercepts = [];
        const minDistance = 0.5; // Minimum distance between distinct intercepts
        
        // Get all badges with normal lines
        const normalBadges = this.input.persistentBadges.filter(b => b.hasNormal && b.tangentSlope !== null);
        
        for (const badge of normalBadges) {
            // Calculate normal slope from tangent slope
            const tangentSlope = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
            let m;
            if (Math.abs(tangentSlope) < 1e-10) {
                m = Infinity; // Vertical normal
            } else if (Math.abs(tangentSlope) > 1e10) {
                m = 0; // Horizontal normal
            } else {
                m = -1 / tangentSlope;
            }
            
            // Skip vertical normals for intercept calculation
            if (m === Infinity || m === -Infinity) {
                continue;
            }
            
            // Normal line equation: y = m*x + b
            const b = badge.worldY - m * badge.worldX;
            
            // X-axis crossings (where y = 0)
            // 0 = m*x + b  →  x = -b/m
            if (Math.abs(m) > 1e-10) { // Avoid division by near-zero (horizontal lines)
                const xIntercept = -b / m;
                
                // Check if within reasonable viewport bounds
                const viewportMargin = 10;
                if (xIntercept >= this.viewport.minX - viewportMargin && 
                    xIntercept <= this.viewport.maxX + viewportMargin) {
                    
                    // Check if far enough from origin and other intercepts
                    const tooCloseToOrigin = Math.abs(xIntercept) < 0.15;
                    const isDuplicate = intercepts.some(existing => 
                        (existing.type === 'x-axis-positive' || existing.type === 'x-axis-negative') && 
                        Math.abs(existing.x - xIntercept) < minDistance
                    );
                    
                    if (!tooCloseToOrigin && !isDuplicate) {
                        const type = xIntercept > 0 ? 'x-axis-positive' : 'x-axis-negative';
                        intercepts.push({
                            x: xIntercept,
                            y: 0,
                            type: type,
                            functionId: null,
                            normalBadgeId: badge.id,
                            color: badge.functionColor,
                            isNormalIntercept: true
                        });
                    }
                }
            }
            
            // Y-axis crossings (where x = 0)
            // y = m*0 + b  →  y = b
            const yIntercept = b;
            
            // Check if within reasonable viewport bounds
            const viewportMargin = 10;
            if (yIntercept >= this.viewport.minY - viewportMargin && 
                yIntercept <= this.viewport.maxY + viewportMargin) {
                
                // Check if far enough from origin and other intercepts
                const tooCloseToOrigin = Math.abs(yIntercept) < 0.15;
                const isDuplicate = intercepts.some(existing => 
                    (existing.type === 'y-axis-positive' || existing.type === 'y-axis-negative') && 
                    Math.abs(existing.y - yIntercept) < minDistance
                );
                
                if (!tooCloseToOrigin && !isDuplicate) {
                    const type = yIntercept > 0 ? 'y-axis-positive' : 'y-axis-negative';
                    intercepts.push({
                        x: 0,
                        y: yIntercept,
                        type: type,
                        functionId: null,
                        normalBadgeId: badge.id,
                        color: badge.functionColor,
                        isNormalIntercept: true
                    });
                }
            }
        }
        
        return intercepts;
    }
    
    // ================================
    // TURNING POINT DETECTION METHODS
    // ================================
    
    findTurningPoints() {
        // Early exit if turning point detection is disabled
        if (!this.showTurningPoints) {
            return [];
        }
        
        // Route to appropriate method based on plot mode
        if (this.plotMode === 'polar') {
            return this.findPolarTurningPoints();
        } else {
            return this.findCartesianTurningPoints();
        }
    }
    
    findCartesianTurningPoints() {
        const turningPoints = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => {
            // Filter for enabled functions with valid expressions and points
            if (!f.enabled || !f.points || f.points.length === 0) {
                return false;
            }
            
            // Also check that the expression doesn't end with operators (invalid)
            if (!f.expression || !f.expression.trim() || this.getCachedRegex('operatorEnd').test(f.expression.trim())) {
                return false;
            }
            
            return true;
        });
        
        for (const func of enabledFunctions) {
            try {
                // Skip implicit functions - use proper function type detection
                const functionType = this.detectFunctionType(func.expression);
                if (functionType === 'implicit') {
                    continue; // Implicit functions don't have simple turning points
                }
                
                // Convert from LaTeX first since we now store LaTeX format
                const convertedExpression = this.convertFromLatex(func.expression);
                
                // Clean the expression - remove "y=" prefix if present
                let cleanExpression = convertedExpression.trim();
                if (cleanExpression.toLowerCase().startsWith('y=')) {
                    cleanExpression = cleanExpression.substring(2).trim();
                }
                
                // Validate that the expression can be parsed before attempting derivatives
                try {
                    math.parse(cleanExpression);
                } catch (parseError) {
                    console.warn(`Skipping turning points for invalid expression "${func.expression}":`, parseError.message);
                    continue;
                }
                
                // Make function names case-insensitive for derivative calculation (same as evaluateFunction)
                const processedExpression = cleanExpression.toLowerCase();
                
                // Get symbolic derivative using math.js
                const derivative = math.derivative(processedExpression, 'x');
                const derivativeStr = derivative.toString();
                
                // Also get second derivative for classification
                const secondDerivative = math.derivative(derivative, 'x');
                const secondDerivativeStr = secondDerivative.toString();
                
                // Find turning points by finding roots of f'(x) = 0
                const functionTurningPoints = this.findTurningPointsForFunction(func, derivativeStr, secondDerivativeStr);
                turningPoints.push(...functionTurningPoints);
                
            } catch (error) {
                console.warn(`Could not find turning points for function ${func.expression}:`, error);
                // Skip this function if derivative calculation fails
                continue;
            }
        }
        
        return turningPoints;
    }
    
    findPolarTurningPoints() {
        const turningPoints = [];
        const enabledFunctions = this.getCurrentFunctions().filter(f => {
            // Filter for enabled functions with valid expressions and points
            if (!f.enabled || !f.points || f.points.length === 0) {
                return false;
            }
            
            // Skip theta-constant rays (they don't have turning points)
            const functionType = this.detectFunctionType(f.expression);
            if (functionType === 'theta-constant') {
                return false;
            }
            
            // Also check that the expression doesn't end with operators (invalid)
            if (!f.expression || !f.expression.trim() || this.getCachedRegex('operatorEnd').test(f.expression.trim())) {
                return false;
            }
            
            return true;
        });
        
        for (const func of enabledFunctions) {
            try {
                // Convert from LaTeX first since we now store LaTeX format
                const convertedExpression = this.convertFromLatex(func.expression);
                
                // Clean the expression - remove "r=" prefix if present
                let cleanExpression = convertedExpression.trim();
                if (cleanExpression.toLowerCase().startsWith('r=')) {
                    cleanExpression = cleanExpression.substring(2).trim();
                }
                
                // Validate that the expression can be parsed before attempting derivatives
                try {
                    math.parse(cleanExpression);
                } catch (parseError) {
                    console.warn(`Skipping polar turning points for invalid expression "${func.expression}":`, parseError.message);
                    continue;
                }
                
                // Make function names case-insensitive for derivative calculation
                let processedExpression = cleanExpression.toLowerCase();
                
                // Add implicit multiplication: 2theta -> 2*theta, 3cos -> 3*cos
                processedExpression = processedExpression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
                processedExpression = processedExpression.replace(/(\))([a-zA-Z])/g, '$1*$2');
                
                // Get symbolic derivative dr/dtheta using math.js
                // Try both theta and t as variable names
                let derivative;
                let derivativeStr;
                try {
                    // Try theta first
                    derivative = math.derivative(processedExpression, 'theta');
                    derivativeStr = derivative.toString();
                    
                    // If derivative is just "0", try with 't' instead
                    if (derivativeStr === '0') {
                        derivative = math.derivative(processedExpression, 't');
                        derivativeStr = derivative.toString();
                    }
                    
                    // If still "0", it's probably a constant function
                    if (derivativeStr === '0') {
                        continue;
                    }
                } catch (e) {
                    console.warn(`Could not compute derivative for polar function ${func.expression}:`, e);
                    continue;
                }
                
                // Find turning points by finding roots of dr/dtheta = 0
                const functionTurningPoints = this.findPolarTurningPointsForFunction(func, derivativeStr);
                turningPoints.push(...functionTurningPoints);
                
            } catch (error) {
                console.warn(`Could not find polar turning points for function ${func.expression}:`, error);
                // Skip this function if derivative calculation fails
                continue;
            }
        }
        
        return turningPoints;
    }
    
    findTurningPointsForFunction(func, derivativeStr, secondDerivativeStr) {
        const turningPoints = [];
        
        // Get current viewport bounds for searching
        const xMin = this.plotMode === 'polar' ? -10 : this.viewport.minX;
        const xMax = this.plotMode === 'polar' ? 10 : this.viewport.maxX;
        
        // Use numerical method to find roots of f'(x) = 0
        const roots = this.findRootsInRange(derivativeStr, xMin, xMax);
        
        for (const x of roots) {
            try {
                // Calculate y value at this x using same approach as evaluateFunction
                const y = this.evaluateFunction(func.expression, x);
                
                // Classify using second derivative test (also needs degree handling)
                let secondDerivValue;
                if (this.angleMode === 'degrees') {
                    // Apply same preprocessing as evaluateFunction for degree mode
                    let processedSecondDerivExpr = secondDerivativeStr.toLowerCase();
                    const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedSecondDerivExpr);
                    
                    if (hasRegularTrigWithX) {
                        processedSecondDerivExpr = this.convertTrigToDegreeMode(processedSecondDerivExpr);
                    }
                    
                    const compiledSecondDeriv = this.getCompiledExpression(processedSecondDerivExpr);
                    secondDerivValue = compiledSecondDeriv.evaluate(this.getEvaluationScope({x: x}));
                } else {
                    const compiledSecondDeriv = this.getCompiledExpression(secondDerivativeStr);
                    secondDerivValue = compiledSecondDeriv.evaluate(this.getEvaluationScope({x: x}));
                }
                
                let type = 'inflection'; // fallback
                
                if (Math.abs(secondDerivValue) > 1e-10) { // avoid numerical noise
                    type = secondDerivValue > 0 ? 'minimum' : 'maximum';
                }
                
                // Only add if point is reasonable (not NaN, finite, etc.)
                if (isFinite(x) && isFinite(y)) {
                    turningPoints.push({
                        x: x,
                        y: y,
                        func: func,
                        type: type, // 'minimum', 'maximum', or 'inflection'
                        derivative: derivativeStr,
                        secondDerivative: secondDerivativeStr
                    });
                }
            } catch (error) {
                // Skip this root if evaluation fails
                continue;
            }
        }
        
        return turningPoints;
    }
    
    // Calculate the slope (derivative) at a specific point for a function
    // Uses both symbolic and numerical methods for robustness
    calculateSlopeAtPoint(func, worldX, worldY = null, theta = null) {
        if (!func || !func.expression) {
            return null;
        }
        
        // Check if this is a polar function
        if (this.plotMode === 'polar' && theta !== null && theta !== undefined) {
            return this.calculatePolarSlope(func, theta, worldX, worldY);
        }
        
        // Check if this is an implicit function
        const functionType = this.detectFunctionType(func.expression);
        if (functionType === 'implicit') {
            // For implicit functions, we need both x and y coordinates
            if (worldY === null) {
                console.warn('Implicit function requires both x and y coordinates');
                return null;
            }
            return this.calculateImplicitTangent(func, worldX, worldY);
        }
        
        try {
            // Convert from LaTeX first
            const convertedExpression = this.convertFromLatex(func.expression);
            
            // Clean the expression - remove "y=" prefix if present
            let cleanExpression = convertedExpression.trim();
            if (cleanExpression.toLowerCase().startsWith('y=')) {
                cleanExpression = cleanExpression.substring(2).trim();
            }
            
            // Try symbolic derivative first (more accurate)
            try {
                let processedExpression = cleanExpression.toLowerCase();
                
                // Handle degree mode for trig functions - convert BEFORE taking derivative
                let degreeConversionApplied = false;
                if (this.angleMode === 'degrees') {
                    const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedExpression);
                    if (hasRegularTrigWithX) {
                        processedExpression = this.convertTrigToDegreeMode(processedExpression);
                        degreeConversionApplied = true;
                    }
                }
                
                const derivative = math.derivative(processedExpression, 'x');
                const derivativeStr = derivative.toString();
                
                // Evaluate the first derivative at the given x value
                const compiledDeriv = this.getCompiledExpression(derivativeStr.toLowerCase());
                const slope = compiledDeriv.evaluate(this.getEvaluationScope({x: worldX, pi: Math.PI, e: Math.E}));
                
                // Try to get second derivative, but don't fail if it's too complex
                let secondDerivValue = null;
                try {
                    const secondDerivative = math.derivative(derivative, 'x');
                    const secondDerivativeStr = secondDerivative.toString();
                    const compiledSecondDeriv = this.getCompiledExpression(secondDerivativeStr.toLowerCase());
                    secondDerivValue = compiledSecondDeriv.evaluate(this.getEvaluationScope({x: worldX, pi: Math.PI, e: Math.E}));
                    
                    // Validate second derivative
                    if (!isFinite(secondDerivValue)) {
                        secondDerivValue = null;
                    }
                } catch (secondDerivError) {
                    // Second derivative too complex or failed - that's okay
                    secondDerivValue = null;
                }
                
                if (isFinite(slope)) {
                    return {
                        slope: slope,
                        expression: derivativeStr,
                        secondDerivative: secondDerivValue,
                        method: 'symbolic',
                        degreeConversionApplied: degreeConversionApplied
                    };
                }
            } catch (symbolicError) {
                // Fall through to numerical method
                console.log('Symbolic derivative failed, using numerical method');
            }
            
            // Fallback to numerical differentiation (central difference method)
            const h = 0.0001; // Small step size
            const compiledExpr = this.getCompiledExpression(cleanExpression.toLowerCase());
            
            // Central difference: f'(x) ≈ (f(x+h) - f(x-h)) / (2h)
            let yPlus, yMinus, yPlusPlus, yMinusMinus;
            
            try {
                if (this.angleMode === 'degrees') {
                    const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(cleanExpression.toLowerCase());
                    if (hasRegularTrigWithX) {
                        const processedExpr = this.convertTrigToDegreeMode(cleanExpression.toLowerCase());
                        const compiled = this.getCompiledExpression(processedExpr);
                        const scope = this.getEvaluationScope({x: worldX + h});
                        yPlus = compiled.evaluate(scope);
                        scope.x = worldX - h;
                        yMinus = compiled.evaluate(scope);
                        scope.x = worldX + 2*h;
                        yPlusPlus = compiled.evaluate(scope);
                        scope.x = worldX - 2*h;
                        yMinusMinus = compiled.evaluate(scope);
                    } else {
                        const scope = this.getEvaluationScope({x: worldX + h});
                        yPlus = compiledExpr.evaluate(scope);
                        scope.x = worldX - h;
                        yMinus = compiledExpr.evaluate(scope);
                        scope.x = worldX + 2*h;
                        yPlusPlus = compiledExpr.evaluate(scope);
                        scope.x = worldX - 2*h;
                        yMinusMinus = compiledExpr.evaluate(scope);
                    }
                } else {
                    const scope = this.getEvaluationScope({x: worldX + h});
                    yPlus = compiledExpr.evaluate(scope);
                    scope.x = worldX - h;
                    yMinus = compiledExpr.evaluate(scope);
                    scope.x = worldX + 2*h;
                    yPlusPlus = compiledExpr.evaluate(scope);
                    scope.x = worldX - 2*h;
                    yMinusMinus = compiledExpr.evaluate(scope);
                }
                
                const slope = (yPlus - yMinus) / (2 * h);
                // Second derivative using five-point stencil: f''(x) ≈ (-f(x+2h) + 16f(x+h) - 30f(x) + 16f(x-h) - f(x-2h)) / (12h²)
                const yCurrent = compiledExpr.evaluate(this.getEvaluationScope({x: worldX}));
                const secondDeriv = (-yPlusPlus + 16*yPlus - 30*yCurrent + 16*yMinus - yMinusMinus) / (12 * h * h);
                
                if (isFinite(slope) && isFinite(secondDeriv)) {
                    return {
                        slope: slope,
                        expression: "f'(x)", // Generic notation for numerical derivative
                        secondDerivative: secondDeriv,
                        method: 'numerical'
                    };
                }
            } catch (numericalError) {
                console.warn('Numerical derivative failed:', numericalError);
            }
            
        } catch (error) {
            console.warn('Could not calculate slope:', error);
        }
        
        return null;
    }
    
    calculatePolarSlope(func, theta, worldX, worldY) {
        // Calculate slope for polar function r = f(θ)
        // In Cartesian coordinates: dy/dx = [f'(θ)sin(θ) + f(θ)cos(θ)] / [f'(θ)cos(θ) - f(θ)sin(θ)]
        if (!func || !func.expression || theta === null || theta === undefined) {
            return null;
        }
        
        try {
            // Convert from LaTeX first
            const convertedExpression = this.convertFromLatex(func.expression);
            
            // Clean the expression - remove "r=" prefix if present
            let cleanExpression = convertedExpression.trim();
            if (cleanExpression.toLowerCase().startsWith('r=')) {
                cleanExpression = cleanExpression.substring(2).trim();
            }
            
            // Add implicit multiplication
            let processedExpression = cleanExpression.toLowerCase();
            processedExpression = processedExpression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
            processedExpression = processedExpression.replace(/(\))([a-zA-Z])/g, '$1*$2');
            
            // Use numerical derivative to avoid angle unit issues with symbolic differentiation
            const h = 0.0001;
            const compiledR = this.getCompiledExpression(processedExpression);
            
            // Convert theta to radians if in degree mode
            const thetaForEval = this.angleMode === 'degrees' ? theta * Math.PI / 180 : theta;
            const hForEval = this.angleMode === 'degrees' ? h * Math.PI / 180 : h;
            
            const scope0 = this.getEvaluationScope({ 
                theta: thetaForEval, 
                t: thetaForEval,
                pi: Math.PI,
                e: Math.E
            });
            const scopePlus = this.getEvaluationScope({ 
                theta: thetaForEval + hForEval, 
                t: thetaForEval + hForEval,
                pi: Math.PI,
                e: Math.E
            });
            const scopeMinus = this.getEvaluationScope({ 
                theta: thetaForEval - hForEval, 
                t: thetaForEval - hForEval,
                pi: Math.PI,
                e: Math.E
            });
            
            const r = compiledR.evaluate(scope0);
            const rPlus = compiledR.evaluate(scopePlus);
            const rMinus = compiledR.evaluate(scopeMinus);
            
            if (!isFinite(r) || !isFinite(rPlus) || !isFinite(rMinus)) {
                return null;
            }
            
            // Calculate dr/dθ using central difference
            const drdt = (rPlus - rMinus) / (2 * h);
            
            if (!isFinite(drdt)) {
                return null;
            }
            
            // For polar functions, return dr/dθ directly (more intuitive than Cartesian dy/dx)
            // Note: We still need to calculate the Cartesian slope for drawing the tangent line
            const thetaRad = this.angleMode === 'degrees' ? theta * Math.PI / 180 : theta;
            
            const sinTheta = Math.sin(thetaRad);
            const cosTheta = Math.cos(thetaRad);
            
            // Calculate dy/dx for tangent line drawing: [f'(θ)sin(θ) + f(θ)cos(θ)] / [f'(θ)cos(θ) - f(θ)sin(θ)]
            const numerator = drdt * sinTheta + r * cosTheta;
            const denominator = drdt * cosTheta - r * sinTheta;
            
            // Check for division by zero (vertical tangent)
            if (Math.abs(denominator) < 1e-10) {
                return {
                    slope: denominator >= 0 ? 1e10 : -1e10,
                    polarDerivative: drdt,
                    expression: this.angleMode === 'degrees' ? "dr/dθ" : "dr/dθ",
                    secondDerivative: 0,
                    method: 'polar'
                };
            }
            
            const slope = numerator / denominator;
            
            if (isFinite(slope)) {
                return {
                    slope: slope,
                    polarDerivative: drdt,
                    expression: this.angleMode === 'degrees' ? "dr/dθ" : "dr/dθ",
                    secondDerivative: 0, // Second derivative for polar is complex, skip for now
                    method: 'polar'
                };
            }
            
        } catch (error) {
            console.warn('Could not calculate polar slope:', error);
        }
        
        return null;
    }
    
    calculateImplicitTangent(func, worldX, worldY) {
        // Calculate tangent for implicit function F(x,y) = 0
        // Using implicit differentiation: dy/dx = -∂F/∂x / ∂F/∂y
        if (!func || !func.expression) {
            return null;
        }
        
        const startTime = performance.now();
        
        try {
            // Parse the implicit equation to get F(x,y)
            const equation = this.parseImplicitEquation(func.expression);
            if (!equation) {
                return null;
            }
            
            // Get compiled expressions once (already cached via parseImplicitEquation)
            const leftCompiled = this.getCompiledExpression(equation.leftExpression);
            const rightCompiled = this.getCompiledExpression(equation.rightExpression);
            
            // Create scope once and reuse it for all 8 evaluations
            const scope = this.getEvaluationScope({ x: 0, y: 0, pi: Math.PI, e: Math.E });
            
            // Helper to evaluate F(x,y) = left - right using reused scope
            const evalF = (x, y) => {
                scope.x = x;
                scope.y = y;
                try {
                    const leftValue = leftCompiled.evaluate(scope);
                    const rightValue = rightCompiled.evaluate(scope);
                    return (leftValue !== null && rightValue !== null) ? (leftValue - rightValue) : null;
                } catch (error) {
                    return null;
                }
            };
            
            // Numerical partial derivatives using central difference
            const h = 0.0001;
            
            // ∂F/∂x ≈ (F(x+h, y) - F(x-h, y)) / (2h)
            const fxPlus = evalF(worldX + h, worldY);
            const fxMinus = evalF(worldX - h, worldY);
            
            // ∂F/∂y ≈ (F(x, y+h) - F(x, y-h)) / (2h)
            const fyPlus = evalF(worldX, worldY + h);
            const fyMinus = evalF(worldX, worldY - h);
            
            if (fxPlus === null || fxMinus === null || fyPlus === null || fyMinus === null) {
                return null;
            }
            
            const dFdx = (fxPlus - fxMinus) / (2 * h);
            const dFdy = (fyPlus - fyMinus) / (2 * h);
            
            // Avoid division by zero
            if (Math.abs(dFdy) < 1e-10) {
                // Vertical tangent - return very large slope
                return {
                    slope: dFdy >= 0 ? 1e10 : -1e10,
                    expression: "dy/dx",
                    secondDerivative: 0, // Second derivative calculation would be complex
                    method: 'implicit-numerical'
                };
            }
            
            const slope = -dFdx / dFdy;
            
            // For second derivative of implicit functions:
            // d²y/dx² = -(∂²F/∂x² + 2(dy/dx)∂²F/∂x∂y + (dy/dx)²∂²F/∂y²) / ∂F/∂y
            // This is expensive to calculate, so we'll compute a simplified numerical estimate
            
            // Calculate second derivative numerically using the slope function
            const h2 = 0.001;
            
            // Move slightly in x direction and calculate new point on curve
            // For implicit curve, we need to find y such that F(x+h2, y') = 0
            // We'll approximate by moving along the tangent and then projecting back
            const dx = h2;
            const dy = slope * dx;
            const x1 = worldX + dx;
            const y1 = worldY + dy;
            
            // Recalculate slope at new position using the same reused scope
            const fx1Plus = evalF(x1 + h, y1);
            const fx1Minus = evalF(x1 - h, y1);
            const fy1Plus = evalF(x1, y1 + h);
            const fy1Minus = evalF(x1, y1 - h);
            
            if (fx1Plus !== null && fx1Minus !== null && fy1Plus !== null && fy1Minus !== null) {
                const dFdx1 = (fx1Plus - fx1Minus) / (2 * h);
                const dFdy1 = (fy1Plus - fy1Minus) / (2 * h);
                
                if (Math.abs(dFdy1) > 1e-10) {
                    const slope1 = -dFdx1 / dFdy1;
                    const secondDeriv = (slope1 - slope) / dx;
                    
                    if (isFinite(slope) && isFinite(secondDeriv)) {
                        return {
                            slope: slope,
                            expression: "dy/dx",
                            secondDerivative: secondDeriv,
                            method: 'implicit-numerical'
                        };
                    }
                }
            }
            
            // Fallback: return slope without second derivative
            if (isFinite(slope)) {
                return {
                    slope: slope,
                    expression: "dy/dx",
                    secondDerivative: 0,
                    method: 'implicit-numerical'
                };
            }
            
        } catch (error) {
            console.warn('Could not calculate implicit tangent:', error);
        }
        
        return null;
    }
    
    findPolarTurningPointsForFunction(func, derivativeStr) {
        const turningPoints = [];
        
        // Get theta range from polar settings
        const thetaMin = this.polarSettings.thetaMin;
        const thetaMax = this.polarSettings.thetaMax;
        
        // Use numerical method to find roots of dr/dtheta = 0
        const roots = this.findPolarRootsInRange(derivativeStr, thetaMin, thetaMax);
        
        for (const theta of roots) {
            try {
                // Convert from LaTeX first since we now store LaTeX format
                const convertedExpression = this.convertFromLatex(func.expression);
                
                // Evaluate r at this theta
                let cleanExpression = convertedExpression.trim();
                if (cleanExpression.toLowerCase().startsWith('r=')) {
                    cleanExpression = cleanExpression.substring(2).trim();
                }
                let processedExpression = cleanExpression.toLowerCase();
                
                // Add implicit multiplication: 2theta -> 2*theta, 3cos -> 3*cos
                processedExpression = processedExpression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
                processedExpression = processedExpression.replace(/(\))([a-zA-Z])/g, '$1*$2');
                
                // Note: No need for convertTrigToDegreeMode in polar - we convert theta itself
                const compiledExpression = this.getCompiledExpression(processedExpression);
                
                // Convert theta to radians if in degree mode
                const thetaForEval = this.angleMode === 'degrees' ? theta * Math.PI / 180 : theta;
                
                const scope = this.getEvaluationScope({ 
                    theta: thetaForEval, 
                    t: thetaForEval,
                    pi: Math.PI,
                    e: Math.E
                });
                
                let r = compiledExpression.evaluate(scope);
                
                // Handle negative r values
                let adjustedTheta = theta;
                let adjustedThetaForEval = thetaForEval;
                if (r < 0) {
                    if (this.polarSettings.plotNegativeR) {
                        r = Math.abs(r);
                        // Add PI in correct units
                        adjustedTheta = theta + (this.angleMode === 'degrees' ? 180 : Math.PI);
                        adjustedThetaForEval = thetaForEval + Math.PI;
                    } else {
                        // Skip negative r values
                        continue;
                    }
                }
                
                // Convert polar to cartesian for display
                // Use adjustedThetaForEval which is in radians
                const x = r * Math.cos(adjustedThetaForEval);
                const y = r * Math.sin(adjustedThetaForEval);
                
                // Only add if point is reasonable (not NaN, finite, etc.)
                if (isFinite(x) && isFinite(y) && isFinite(r)) {
                    turningPoints.push({
                        x: x,
                        y: y,
                        func: func,
                        type: 'critical', // Don't classify as min/max in polar mode
                        theta: theta, // Store original theta
                        r: r,
                        derivative: derivativeStr
                    });
                }
            } catch (error) {
                // Skip this root if evaluation fails
                continue;
            }
        }
        
        return turningPoints;
    }
    
    findRootsInRange(expression, xMin, xMax, steps = 200) {
        // Simple numerical root finding using sign changes
        const roots = [];
        const stepSize = (xMax - xMin) / steps;
        
        // Helper function to evaluate derivative expression with same degree handling as evaluateFunction
        const evaluateDerivative = (expr, xValue) => {
            // Apply the same preprocessing as evaluateFunction for degree mode
            let processedExpr = expr.toLowerCase();
            
            if (this.angleMode === 'degrees') {
                // Check if this derivative expression contains regular trig functions
                const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedExpr);
                
                if (hasRegularTrigWithX) {
                    // Preprocess the expression to wrap trig function arguments with degree conversion
                    processedExpr = this.convertTrigToDegreeMode(processedExpr);
                }
            }
            
            // Use cached compiled expression for better performance
            const compiledExpression = this.getCompiledExpression(processedExpr);
            const result = compiledExpression.evaluate(this.getEvaluationScope({x: xValue}));
            
            return result;
        };
        
        // Special case: check if x=0 is in range and if derivative is approximately 0 there
        // But also verify the derivative actually changes sign (to avoid constant zero derivatives)
        if (xMin <= 0 && xMax >= 0) {
            try {
                const valueAtZero = evaluateDerivative(expression, 0);
                if (Math.abs(valueAtZero) < 1e-10) {
                    // Check nearby points to ensure derivative isn't constantly zero
                    const delta = stepSize * 0.1; // Small offset
                    const valueLeft = evaluateDerivative(expression, -delta);
                    const valueRight = evaluateDerivative(expression, delta);
                    
                    // Only add x=0 as a root if derivative changes around it
                    // (not constantly zero like in horizontal lines)
                    if (Math.abs(valueLeft) > 1e-10 || Math.abs(valueRight) > 1e-10) {
                        roots.push(0);
                    }
                }
            } catch {
                // Ignore if evaluation fails
            }
        }
        
        let prevX = xMin;
        let prevValue;
        
        try {
            prevValue = evaluateDerivative(expression, prevX);
        } catch {
            prevValue = NaN;
        }
        
        for (let i = 1; i <= steps; i++) {
            const currentX = xMin + i * stepSize;
            let currentValue;
            
            try {
                currentValue = evaluateDerivative(expression, currentX);
            } catch {
                currentValue = NaN;
            }
            
            // Check for sign change (indicating a root)
            if (isFinite(prevValue) && isFinite(currentValue) && 
                prevValue * currentValue < 0) {
                
                // Use bisection method to refine the root
                const root = this.bisectionMethodForTurningPoints(expression, prevX, currentX);
                if (root !== null && !roots.some(r => Math.abs(r - root) < 1e-6)) {
                    roots.push(root);
                }
            }
            
            prevX = currentX;
            prevValue = currentValue;
        }
        
        return roots;
    }
    
    bisectionMethodForTurningPoints(expression, a, b, tolerance = 1e-8, maxIterations = 50) {
        // Helper function to evaluate derivative expression with same degree handling as evaluateFunction
        const evaluateDerivative = (expr, xValue) => {
            // Apply the same preprocessing as evaluateFunction for degree mode
            let processedExpr = expr.toLowerCase();
            
            if (this.angleMode === 'degrees') {
                // Check if this derivative expression contains regular trig functions
                const hasRegularTrigWithX = this.getCachedRegex('regularTrigWithX').test(processedExpr);
                
                if (hasRegularTrigWithX) {
                    // Preprocess the expression to wrap trig function arguments with degree conversion
                    processedExpr = this.convertTrigToDegreeMode(processedExpr);
                }
            }
            
            // Use cached compiled expression for better performance
            const compiledExpression = this.getCompiledExpression(processedExpr);
            return compiledExpression.evaluate(this.getEvaluationScope({x: xValue}));
        };
        
        try {
            let fa = evaluateDerivative(expression, a);
            let fb = evaluateDerivative(expression, b);
            
            if (fa * fb > 0) {
                return null; // No root in interval
            }
            
            for (let i = 0; i < maxIterations; i++) {
                const c = (a + b) / 2;
                const fc = evaluateDerivative(expression, c);
                
                if (Math.abs(fc) < tolerance || Math.abs(b - a) < tolerance) {
                    return c;
                }
                
                if (fa * fc < 0) {
                    b = c;
                    fb = fc;
                } else {
                    a = c;
                    fa = fc;
                }
            }
            
            return (a + b) / 2; // Return best approximation
        } catch {
            return null;
        }
    }
    
    findPolarRootsInRange(expression, thetaMin, thetaMax, steps = 200) {
        // Numerical root finding for polar derivatives dr/dtheta = 0
        const roots = [];
        
        // Convert range to radians if in degree mode for consistent internal calculations
        const thetaMinRad = this.angleMode === 'degrees' ? thetaMin * Math.PI / 180 : thetaMin;
        const thetaMaxRad = this.angleMode === 'degrees' ? thetaMax * Math.PI / 180 : thetaMax;
        const stepSize = (thetaMaxRad - thetaMinRad) / steps;
        
        // Helper function to evaluate polar derivative expression
        const evaluatePolarDerivative = (expr, thetaValue) => {
            let processedExpr = expr.toLowerCase();
            
            // Note: thetaValue is already in radians here
            const compiledExpression = this.getCompiledExpression(processedExpr);
            
            const scope = this.getEvaluationScope({
                theta: thetaValue,
                t: thetaValue,
                pi: Math.PI,
                e: Math.E
            });
            
            return compiledExpression.evaluate(scope);
        };
        
        // Special case: check if theta=0 is in range and if derivative is approximately 0 there
        // But also verify the derivative actually changes sign (to avoid constant zero derivatives)
        if (thetaMinRad <= 0 && thetaMaxRad >= 0) {
            try {
                const valueAtZero = evaluatePolarDerivative(expression, 0);
                if (Math.abs(valueAtZero) < 1e-10) {
                    // Check nearby points to ensure derivative isn't constantly zero
                    const delta = stepSize * 0.1;
                    const valueLeft = evaluatePolarDerivative(expression, -delta);
                    const valueRight = evaluatePolarDerivative(expression, delta);
                    
                    // Only add theta=0 as a root if derivative changes around it
                    if (Math.abs(valueLeft) > 1e-10 || Math.abs(valueRight) > 1e-10) {
                        // Convert back to original units (degrees if needed)
                        roots.push(this.angleMode === 'degrees' ? 0 : 0);
                    }
                }
            } catch {
                // Ignore if evaluation fails
            }
        }
        
        let prevTheta = thetaMinRad;
        let prevValue;
        
        try {
            prevValue = evaluatePolarDerivative(expression, prevTheta);
        } catch {
            prevValue = NaN;
        }
        
        for (let i = 1; i <= steps; i++) {
            const currentTheta = thetaMinRad + i * stepSize;
            let currentValue;
            
            try {
                currentValue = evaluatePolarDerivative(expression, currentTheta);
            } catch {
                currentValue = NaN;
            }
            
            // Check for sign change (indicating a root)
            if (isFinite(prevValue) && isFinite(currentValue) && 
                prevValue * currentValue < 0) {
                
                // Use bisection method to refine the root
                const rootRad = this.polarBisectionMethod(expression, prevTheta, currentTheta);
                if (rootRad !== null) {
                    // Convert back to original units (degrees if needed)
                    const root = this.angleMode === 'degrees' ? rootRad * 180 / Math.PI : rootRad;
                    if (!roots.some(r => Math.abs(r - root) < 1e-6)) {
                        roots.push(root);
                    }
                }
            }
            
            prevTheta = currentTheta;
            prevValue = currentValue;
        }
        
        return roots;
    }
    
    polarBisectionMethod(expression, a, b, tolerance = 1e-8, maxIterations = 50) {
        // Bisection method for polar derivatives
        // Note: a and b are in radians
        const evaluatePolarDerivative = (expr, thetaValue) => {
            let processedExpr = expr.toLowerCase();
            
            // Note: thetaValue is in radians
            const compiledExpression = this.getCompiledExpression(processedExpr);
            
            const scope = this.getEvaluationScope({
                theta: thetaValue,
                t: thetaValue,
                pi: Math.PI,
                e: Math.E
            });
            return compiledExpression.evaluate(scope);
        };
        
        try {
            let fa = evaluatePolarDerivative(expression, a);
            let fb = evaluatePolarDerivative(expression, b);
            
            if (fa * fb > 0) {
                return null; // No root in interval
            }
            
            for (let i = 0; i < maxIterations; i++) {
                const c = (a + b) / 2;
                const fc = evaluatePolarDerivative(expression, c);
                
                if (Math.abs(fc) < tolerance || Math.abs(b - a) < tolerance) {
                    return c;
                }
                
                if (fa * fc < 0) {
                    b = c;
                    fb = fc;
                } else {
                    a = c;
                    fa = fc;
                }
            }
            
            return (a + b) / 2; // Return best approximation
        } catch {
            return null;
        }
    }
    
    clearTurningPoints() {
        // Clear turning point markers and frozen badges
        this.turningPoints = [];
        this.frozenTurningPointBadges = [];
        this.frozenIntersectionBadges = [];
        
        // Remove all turning point badges (those with badgeType indicating turning points)
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !badge.badgeType || (badge.badgeType !== 'maximum' && badge.badgeType !== 'minimum')
        );
    }
    
    updateTurningPointsToggleButton() {
        const button = document.getElementById('turning-points-toggle');
        if (button) {
            // Enable in both Cartesian and polar modes now
            button.style.background = this.showTurningPoints ? '#2A3F5A' : '#1a2a3f';
            button.style.opacity = this.showTurningPoints ? '1' : '0.6';
            button.style.pointerEvents = 'auto';
        }
    }
    
    clearIntercepts() {
        // Clear intercept markers and frozen badges
        this.intercepts = [];
        this.frozenInterceptBadges = [];
        
        // Remove all intercept badges (Cartesian and polar types)
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !badge.badgeType || (
                badge.badgeType !== 'x-intercept' && 
                badge.badgeType !== 'y-intercept' &&
                badge.badgeType !== 'x-axis-positive' &&
                badge.badgeType !== 'x-axis-negative' &&
                badge.badgeType !== 'y-axis-positive' &&
                badge.badgeType !== 'y-axis-negative'
            )
        );
    }
    
    updateInterceptsToggleButton() {
        const button = document.getElementById('intercepts-toggle');
        if (button) {
            // Enabled in both Cartesian and Polar modes
            button.style.background = this.showIntercepts ? '#2A3F5A' : '#1a2a3f';
            button.style.opacity = this.showIntercepts ? '1' : '0.6';
        }
    }
    
    clearAllBadges() {
        this.input.persistentBadges = [];
    }
    
    findBadgeAtScreenPosition(screenX, screenY, tolerance = 20) {
        for (const badge of this.input.persistentBadges) {
            const distance = Math.sqrt(
                Math.pow(badge.screenX - screenX, 2) + 
                Math.pow(badge.screenY - screenY, 2)
            );
            if (distance <= tolerance) {
                return badge;
            }
        }
        return null;
    }
    
    updateBadgeScreenPositions() {
        // Update screen positions for all badges based on current viewport
        for (const badge of this.input.persistentBadges) {
            const screenPos = this.worldToScreen(badge.worldX, badge.worldY);
            badge.screenX = screenPos.x;
            badge.screenY = screenPos.y;
        }
    }

    updateBadgesAfterParameterChange() {
        // Update all badge positions and properties after parameter values change
        // This preserves badges but recalculates their positions on the new curves
        
        // First, remove all special badge types that will be recalculated
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => {
            return !(
                badge.badgeType === 'intersection' || 
                badge.badgeType === 'x-intercept' || 
                badge.badgeType === 'y-intercept' ||
                badge.badgeType === 'tangent-intercept' ||
                badge.badgeType === 'normal-intercept' ||
                badge.badgeType === 'tangent-intersection' ||
                badge.badgeType === 'normal-intersection' ||
                badge.badgeType === 'tangent-tangent-intersection' ||
                badge.badgeType === 'normal-normal-intersection' ||
                badge.badgeType === 'normal-tangent-intersection' ||
                badge.badgeType === 'turning-point'
            );
        });
        
        // Then update remaining badges (point, tangent, normal, derivative, integral badges)
        for (const badge of this.input.persistentBadges) {
            
            const func = this.findFunctionById(badge.functionId);
            if (!func) continue;
            
            const functionType = this.detectFunctionType(func.expression);
            
            if (this.plotMode === 'polar' && badge.theta !== null && badge.theta !== undefined) {
                // Polar mode: keep theta, recalculate r and convert to x,y
                const tracedPoint = this.tracePolarFunction(func, badge.worldX, badge.worldY, badge.theta, 0);
                if (tracedPoint) {
                    badge.worldX = tracedPoint.x;
                    badge.worldY = tracedPoint.y;
                    // theta stays the same
                }
            } else if (functionType === 'implicit') {
                // Implicit functions: snap to nearest point on new curve
                const tracedPoint = this.traceImplicitFunction(func, badge.worldX, badge.worldY);
                if (tracedPoint) {
                    badge.worldX = tracedPoint.x;
                    badge.worldY = tracedPoint.y;
                }
            } else {
                // Explicit functions: keep x, recalculate y
                const newY = this.evaluateFunction(func.expression, badge.worldX);
                if (isFinite(newY)) {
                    badge.worldY = newY;
                }
            }
            
            // Recalculate tangent/normal slopes if badge has them
            if (badge.hasTangent || badge.hasNormal) {
                const slopeData = this.calculateSlopeAtPoint(func, badge.worldX, badge.worldY, badge.theta);
                if (slopeData) {
                    badge.tangentSlope = slopeData;
                    badge.tangentExpression = slopeData.expression;
                    badge.secondDerivative = slopeData.secondDerivative;
                }
            }
            
            // Update screen position
            const screenPos = this.worldToScreen(badge.worldX, badge.worldY);
            badge.screenX = screenPos.x;
            badge.screenY = screenPos.y;
        }
        
        // Recalculate derived features
        if (this.showIntersections) {
            this.updateCombinedIntersections();
        }
        
        if (this.showIntercepts) {
            this.findAxisIntercepts();
        }
        
        if (this.showTurningPoints) {
            this.findTurningPoints();
        }
    }

    findClosestPolarPoint(func, screenX, screenY, tolerance) {
        try {
            let closestDistance = Infinity;
            let closestWorldX = 0;
            let closestWorldY = 0;
            let closestTheta = 0;
            
            const processedExpression = this.convertFromLatex(func.expression);
            const compiled = math.compile(processedExpression);
            
            // Use dynamic step sizing for performance with higher resolution
            const baseThetaStep = this.calculateDynamicPolarStep(this.polarSettings.thetaMin, this.polarSettings.thetaMax);
            const thetaStep = baseThetaStep / 2; // Higher resolution for better detection
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    const scope = this.getEvaluationScope({ t: theta, theta: theta, pi: Math.PI, e: Math.E });
                    let r = compiled.evaluate(scope);
                    
                    // Handle negative r values
                    let adjustedR = r;
                    let adjustedTheta = theta;
                    
                    if (r < 0 && this.polarSettings.plotNegativeR) {
                        adjustedR = Math.abs(r);
                        adjustedTheta = theta + Math.PI;
                    } else if (r < 0) {
                        continue;
                    }
                    
                    const worldX = adjustedR * Math.cos(adjustedTheta);
                    const worldY = adjustedR * Math.sin(adjustedTheta);
                    
                    if (!isFinite(worldX) || !isFinite(worldY)) continue;
                    
                    // Convert to screen coordinates and check distance
                    const screenPos = this.worldToScreen(worldX, worldY);
                    const distance = Math.sqrt(
                        Math.pow(screenPos.x - screenX, 2) + 
                        Math.pow(screenPos.y - screenY, 2)
                    );
                    
                    if (distance < tolerance) {
                        // If this is a better match, or equal match but with smaller theta (prefer start of range)
                        const isStrictlyBetter = distance < closestDistance;
                        const isEqualButEarlier = Math.abs(distance - closestDistance) < 0.1 && theta < closestTheta;
                        
                        if (isStrictlyBetter || isEqualButEarlier) {
                            closestDistance = distance;
                            closestWorldX = worldX;
                            closestWorldY = worldY;
                            closestTheta = theta; // Store original theta, not adjusted
                        }
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }
            
            if (closestDistance < tolerance) {
                return {
                    distance: closestDistance,
                    worldX: closestWorldX,
                    worldY: closestWorldY,
                    theta: closestTheta
                };
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    traceImplicitFunction(func, worldX, worldY) {
        // For implicit functions, find the closest point on the curve to the mouse position
        // This provides smooth following behavior similar to explicit functions
        const pointsToUse = func.displayPoints || func.points;
        
        if (!pointsToUse || pointsToUse.length < 2) {
            // Fallback: return the input position if no points available
            return { x: worldX, y: worldY };
        }
        
        let closestDistance = Infinity;
        let closestPoint = null;
        
        // Check all line segments and find the closest point
        for (let i = 0; i < pointsToUse.length - 1; i += 3) {
            const startPoint = pointsToUse[i];
            const endPoint = pointsToUse[i + 1];
            
            if (!startPoint || !endPoint || 
                !isFinite(startPoint.x) || !isFinite(startPoint.y) ||
                !isFinite(endPoint.x) || !isFinite(endPoint.y)) {
                continue;
            }
            
            // Find closest point on this segment to (worldX, worldY)
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const px = worldX - startPoint.x;
            const py = worldY - startPoint.y;
            
            const segmentLengthSquared = dx * dx + dy * dy;
            if (segmentLengthSquared === 0) continue;
            
            // Project point onto segment
            let t = (px * dx + py * dy) / segmentLengthSquared;
            t = Math.max(0, Math.min(1, t));
            
            // Interpolated point on segment
            const pointX = startPoint.x + t * dx;
            const pointY = startPoint.y + t * dy;
            
            // Distance from (worldX, worldY) to point on segment
            const distance = Math.sqrt(
                Math.pow(pointX - worldX, 2) + 
                Math.pow(pointY - worldY, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPoint = { x: pointX, y: pointY };
            }
        }
        
        // Return closest point found, or input position if none found
        return closestPoint || { x: worldX, y: worldY };
    }
    
    traceFunction(func, worldX, worldY = null, theta = null, screenDeltaX = 0) {
        try {
            // Check if this is an implicit function
            const functionType = this.detectFunctionType(func.expression);
            
            if (functionType === 'implicit') {
                // For implicit functions, find closest point on curve to (worldX, worldY)
                // We need a y coordinate hint for implicit functions
                if (worldY === null) {
                    console.warn('Implicit function tracing requires both x and y coordinates');
                    return null;
                }
                return this.traceImplicitFunction(func, worldX, worldY);
            }
            
            // Handle polar functions with parametric tracing
            if (func.mode === 'polar') {
                return this.tracePolarFunction(func, worldX, worldY || 0, theta, screenDeltaX);
            }
            
            // Cartesian function tracing (existing logic)
            // Allow tracing to mathematical domain endpoints for inverse trig functions
            let clampedX = worldX;
            
            // For inverse trig functions, allow tracing to their exact domain boundaries
            if (func.expression.toLowerCase().includes('asin') || func.expression.toLowerCase().includes('acos')) {
                // Domain is [-1, 1], allow reaching exactly ±1 even if slightly outside viewport
                clampedX = Math.max(-1, Math.min(1, worldX));
                
                // But still respect viewport for other values
                if (clampedX > -1 && clampedX < 1) {
                    clampedX = Math.max(this.viewport.minX, Math.min(this.viewport.maxX, clampedX));
                }
            } else {
                // For other functions, use normal viewport clamping
                clampedX = Math.max(this.viewport.minX, Math.min(this.viewport.maxX, worldX));
            }
            
            const evaluatedY = this.evaluateFunction(func.expression, clampedX);
            
            if (isNaN(evaluatedY) || !isFinite(evaluatedY)) {
                return null;
            }
            
            return { x: clampedX, y: evaluatedY };
        } catch (error) {
            return null;
        }
    }
    
    tracePolarFunction(func, mouseWorldX, mouseWorldY, currentTheta = null, screenDeltaX = 0) {
        // For polar functions, use parametric tracing along theta
        // This prevents jumping between branches and provides smooth curve following
        try {
            const processedExpression = this.convertFromLatex(func.expression);
            const compiled = math.compile(processedExpression);
            
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            // If we have a current theta (from ongoing drag), adjust it based on mouse movement
            if (currentTheta !== null && currentTheta !== undefined) {
                // Convert screen movement to theta change
                // Horizontal movement adjusts theta - moving right increases theta
                // Use the actual mouse screen delta passed from handlePointerMove
                
                // Scale factor: map screen pixels to theta change
                // Use viewport width to make sensitivity zoom-independent
                const thetaRange = thetaMax - thetaMin;
                const deltaTheta = (screenDeltaX / this.viewport.width) * thetaRange * 0.5;
                
                let newTheta = currentTheta + deltaTheta;
                
                // Allow continuous wrapping at boundaries for smooth motion
                // When reaching thetaMax, continue by wrapping to thetaMin (and vice versa)
                if (newTheta > thetaMax) {
                    newTheta = thetaMin + (newTheta - thetaMax);
                } else if (newTheta < thetaMin) {
                    newTheta = thetaMax - (thetaMin - newTheta);
                }
                
                // Evaluate at new theta
                const scope = this.getEvaluationScope({ t: newTheta, theta: newTheta, pi: Math.PI, e: Math.E });
                let r = compiled.evaluate(scope);
                
                // Handle negative r values
                let adjustedR = r;
                let adjustedTheta = newTheta;
                
                if (r < 0 && this.polarSettings.plotNegativeR) {
                    adjustedR = Math.abs(r);
                    adjustedTheta = newTheta + Math.PI;
                } else if (r < 0) {
                    // Invalid point, return current position
                    return { x: mouseWorldX, y: mouseWorldY, theta: currentTheta };
                }
                
                const x = adjustedR * Math.cos(adjustedTheta);
                const y = adjustedR * Math.sin(adjustedTheta);
                
                if (isFinite(x) && isFinite(y)) {
                    return { x, y, theta: newTheta };
                }
            }
            
            // Fallback: find closest point if no theta provided
            let closestPoint = null;
            let closestDistance = Infinity;
            let closestTheta = 0;
            
            const thetaStep = this.calculateDynamicPolarStep(thetaMin, thetaMax);
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    const scope = this.getEvaluationScope({ t: theta, theta: theta, pi: Math.PI, e: Math.E });
                    let r = compiled.evaluate(scope);
                    
                    // Handle negative r values
                    let adjustedR = r;
                    let adjustedTheta = theta;
                    
                    if (r < 0 && this.polarSettings.plotNegativeR) {
                        adjustedR = Math.abs(r);
                        adjustedTheta = theta + Math.PI;
                    } else if (r < 0) {
                        continue;
                    }
                    
                    const x = adjustedR * Math.cos(adjustedTheta);
                    const y = adjustedR * Math.sin(adjustedTheta);
                    
                    const distance = Math.sqrt(Math.pow(x - mouseWorldX, 2) + Math.pow(y - mouseWorldY, 2));
                    
                    // Prefer earlier (smaller) theta values when distance is equal or better
                    const isStrictlyBetter = distance < closestDistance;
                    const isEqualButEarlier = Math.abs(distance - closestDistance) < 0.1 && theta < closestTheta;
                    
                    if (isStrictlyBetter || isEqualButEarlier) {
                        closestDistance = distance;
                        closestPoint = { x, y };
                        closestTheta = theta;
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }
            
            if (closestPoint) {
                return { ...closestPoint, theta: closestTheta };
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    // ================================
    // ANIMATION LOOP
    // ================================
    
    startAnimationLoop() {
        const animate = (currentTime) => {
            this.deltaTime = currentTime - this.lastFrameTime;
            this.lastFrameTime = currentTime;
            
            // Track FPS if performance monitoring is enabled
            if (this.performance.enabled) {
                this.performance.frameCount++;
                const elapsed = currentTime - this.performance.lastFpsUpdate;
                if (elapsed >= 1000) { // Update FPS every second
                    this.performance.fps = Math.round((this.performance.frameCount * 1000) / elapsed);
                    this.performance.frameCount = 0;
                    this.performance.lastFpsUpdate = currentTime;
                }
            }
            
            this.update(this.deltaTime);
            this.draw();
            
            this.animationId = requestAnimationFrame(animate);
        };
        
        this.animationId = requestAnimationFrame(animate);
    }
    
    // ================================
    // UPDATE LOGIC
    // ================================
    
    update(deltaTime) {
        // State-specific update logic
        switch(this.currentState) {
            case this.states.TITLE:
                this.updateTitleScreen(deltaTime);
                break;
            case this.states.GRAPHING:
                this.updateGraphingScreen(deltaTime);
                break;
        }
        
        // Handle continuous input
        this.handleContinuousInput(deltaTime);
    }
    
    updateTitleScreen(deltaTime) {
        // Title screen animations or effects can go here
    }
    
    updateGraphingScreen(deltaTime) {
        // Update function graphs if needed
        // Handle real-time function updates, animations, etc.
        
        // Update badge tooltip fade animation
        this.updateBadgeTooltip();
    }
    
    handleContinuousInput(deltaTime) {
        if (this.currentState !== this.states.GRAPHING) return;
        
        // Check if any input field is currently focused
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
        
        // Don't handle keyboard panning if an input is focused
        if (isInputFocused) return;
        
        const panSpeed = 200 / this.viewport.scale; // Adjust for zoom level
        let hasPanned = false;
        
        // Keyboard panning
        if (this.input.keys.has('arrowleft') || this.input.keys.has('a')) {
            this.viewport.minX -= panSpeed * deltaTime * 0.001;
            this.viewport.maxX -= panSpeed * deltaTime * 0.001;
            hasPanned = true;
        }
        if (this.input.keys.has('arrowright') || this.input.keys.has('d')) {
            this.viewport.minX += panSpeed * deltaTime * 0.001;
            this.viewport.maxX += panSpeed * deltaTime * 0.001;
            hasPanned = true;
        }
        if (this.input.keys.has('arrowup') || this.input.keys.has('w')) {
            this.viewport.minY += panSpeed * deltaTime * 0.001;
            this.viewport.maxY += panSpeed * deltaTime * 0.001;
            hasPanned = true;
        }
        if (this.input.keys.has('arrowdown') || this.input.keys.has('s')) {
            this.viewport.minY -= panSpeed * deltaTime * 0.001;
            this.viewport.maxY -= panSpeed * deltaTime * 0.001;
            hasPanned = true;
        }
        
        // If panning occurred, update range inputs and trigger viewport change
        // Note: We don't recalculate functions here for performance - just redraw existing points
        // Functions will be recalculated when panning stops via handleViewportChange debounce
        if (hasPanned) {
            this.updateRangeInputs();
            this.handleViewportChange(); // Debounced recalculation
            this.draw(); // Redraw existing points immediately for smooth panning
        }
    }
    
    // ================================
    // DRAWING/RENDERING
    // ================================
    
    draw() {
        // Clear canvas with theme-appropriate background color
        const canvasBg = getComputedStyle(document.documentElement)
            .getPropertyValue('--canvas-bg').trim();
        this.ctx.fillStyle = canvasBg;
        this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
        
        // State-specific drawing
        switch(this.currentState) {
            case this.states.TITLE:
                this.drawTitleScreen();
                break;
            case this.states.GRAPHING:
                this.drawGraphingScreen();
                break;
        }
    }
    
    drawTitleScreen() {
        // Background pattern matching the main graph style
        this.drawGrid();
    }
    
    drawGraphingScreen() {
        // Draw coordinate system
        this.drawGrid();
        this.drawAxes();
        this.drawAxisLabels();
        
        // Draw functions from current mode only
        this.getCurrentFunctions().forEach(func => {
            if (func.enabled) {
                const functionType = this.detectFunctionType(func.expression);
                if (functionType === 'implicit') {
                    // Draw implicit functions using displayPoints (stable during calculations)
                    const pointsToCheck = func.displayPoints || func.points;
                    if (pointsToCheck && pointsToCheck.length > 0) {
                        this.drawImplicitFunction(func);
                    }
                } else {
                    // Always draw explicit functions for smooth interaction
                    if (func.points && func.points.length > 0) {
                        this.drawFunction(func);
                    }
                }
            }
        });
        
        // Draw intersection markers if enabled (skip during polar animation or pause)
        if (this.showIntersections && !this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
            if (this.frozenIntersectionBadges.length > 0) {
                // Show frozen intersection badges whenever they exist (for visual continuity)
                this.drawFrozenIntersectionBadges();
            } else if (this.intersections.length > 0) {
                // When no frozen badges, show actual intersection markers
                this.drawIntersectionMarkers();
            }
        }
        
        // Draw turning point markers if enabled and viewport is stable (skip during polar animation or pause)
        if (this.showTurningPoints && !this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
            if (this.isViewportChanging && this.frozenTurningPointBadges.length > 0) {
                // During viewport changes, show frozen turning point badges for visual continuity
                this.drawFrozenTurningPointBadges();
            } else if (!this.isViewportChanging && this.turningPoints.length > 0) {
                // When viewport is stable, show actual turning point markers
                this.drawTurningPointMarkers();
            }
        }
        
        // Draw axis intercept markers if enabled and viewport is stable (skip during polar animation or pause)
        if (this.showIntercepts && !this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
            if (this.isViewportChanging && this.frozenInterceptBadges && this.frozenInterceptBadges.length > 0) {
                // During viewport changes, show frozen intercept badges for visual continuity
                this.drawFrozenInterceptBadges();
            } else if (!this.isViewportChanging && this.intercepts.length > 0) {
                // When viewport is stable, show actual intercept markers
                this.drawInterceptMarkers();
            }
        }
        
        // Draw integration shaded regions (before badges)
        if (this.integralPairs.length > 0) {
            this.drawIntegrationRegions();
        }
        
        // Draw tracing indicator if active, and all persistent badges
        if (this.input.tracing.active) {
            this.drawActiveTracingIndicator();
        }
        
        // Draw all persistent badges (skip during polar animation or pause)
        if (!this.polarAnimation.isAnimating && !this.polarAnimation.isPaused) {
            this.updateBadgeScreenPositions();
            this.drawPersistentBadges();
        }
        
        // Draw integral panel at bottom-right for ALL pairs (after badges so it's on top)
        if (this.integralPairs.length > 0) {
            this.drawIntegralPanel();
        }
        
        // Draw calculation indicator during viewport changes and calculations
        // Only shown when implicit functions are present
        if (this.shouldShowCalculationIndicator()) {
            this.drawCalculationIndicator();
        }
        
        // Draw polar animation coordinates if animating or paused
        if (this.polarAnimation && (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) && this.plotMode === 'polar') {
            this.drawPolarAnimationSweepLine(); // Draw radar sweep line first (behind everything)
            this.drawPolarAnimationCoordinates();
            this.drawPolarAnimationPoint();
        }
        
        // Draw performance overlay if enabled
        if (this.performance.enabled) {
            this.drawPerformanceOverlay();
        }
        
        // UI overlays removed - cleaner interface
    }
    
    scheduleChunkedDraw() {
        // Use requestAnimationFrame to avoid blocking the UI
        requestAnimationFrame(() => {
            this.draw();
        });
    }
    
    drawGrid() {
        if (this.plotMode === 'polar') {
            this.drawPolarGrid();
        } else {
            this.drawCartesianGrid();
        }
    }
    
    drawCartesianGrid() {
        // Get grid color from CSS variable (adapts to light/dark theme)
        const gridColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--grid-color').trim();
        
        this.ctx.strokeStyle = gridColor;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        // Vertical lines - use trig-aware X-axis spacing
        const xGridSpacing = this.getTrigAwareXGridSpacing();
        const startX = Math.floor(this.viewport.minX / xGridSpacing) * xGridSpacing;
        
        for (let x = startX; x <= this.viewport.maxX; x += xGridSpacing) {
            const screenPos = this.worldToScreen(x, 0);
            this.ctx.moveTo(screenPos.x, 0);
            this.ctx.lineTo(screenPos.x, this.viewport.height);
        }
        
        // Horizontal lines - use Y-axis specific spacing
        const yGridSpacing = this.getTrigAwareYGridSpacing();
        const startY = Math.floor(this.viewport.minY / yGridSpacing) * yGridSpacing;
        
        for (let y = startY; y <= this.viewport.maxY; y += yGridSpacing) {
            const screenPos = this.worldToScreen(0, y);
            this.ctx.moveTo(0, screenPos.y);
            this.ctx.lineTo(this.viewport.width, screenPos.y);
        }
        
        this.ctx.stroke();
    }
    
    drawPolarGrid() {
        // Get grid color from CSS variable (adapts to light/dark theme)
        const gridColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--grid-color').trim();
        
        this.ctx.strokeStyle = gridColor;
        this.ctx.lineWidth = 1;
        
        // Find the center of the viewport in screen coordinates
        const center = this.worldToScreen(0, 0);
        
        // Ensure viewport is properly initialized - force update if needed
        if (!this.viewport || this.viewport.width <= 0 || this.viewport.height <= 0) {
            this.updateViewport();
        }
        
        // Calculate maximum radius needed to cover the viewport
        // Use the distance from center to the farthest corner
        const maxViewportRadius = Math.max(
            Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.minY * this.viewport.minY),
            Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.minY * this.viewport.minY),
            Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.maxY * this.viewport.maxY),
            Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.maxY * this.viewport.maxY)
        );
        
        // Fallback: if maxViewportRadius is suspiciously small, recalculate based on current zoom
        const fallbackRadius = Math.max(
            Math.abs(this.viewport.maxX - this.viewport.minX) / 2,
            Math.abs(this.viewport.maxY - this.viewport.minY) / 2
        ) * 1.5; // Add some margin
        
        const finalMaxRadius = Math.max(maxViewportRadius, fallbackRadius);
        
        // Calculate spacing with fresh viewport data - force recalculation
        const rSpacing = this.calculateFreshPolarSpacing();
        
        // Draw concentric circles (constant r values)
        this.ctx.beginPath();
        for (let r = rSpacing; r <= finalMaxRadius; r += rSpacing) {
            const screenRadius = r * this.viewport.scale;
            this.ctx.moveTo(center.x + screenRadius, center.y);
            this.ctx.arc(center.x, center.y, screenRadius, 0, 2 * Math.PI);
        }
        this.ctx.stroke();
        
        // Draw radial lines (constant θ values)
        this.ctx.beginPath();
        const thetaSpacing = this.getPolarAngleSpacing();
        const maxScreenRadius = finalMaxRadius * this.viewport.scale;
        
        for (let theta = 0; theta < 2 * Math.PI; theta += thetaSpacing) {
            const endX = center.x + maxScreenRadius * Math.cos(theta);
            const endY = center.y - maxScreenRadius * Math.sin(theta); // Negative because screen Y is flipped
            this.ctx.moveTo(center.x, center.y);
            this.ctx.lineTo(endX, endY);
        }
        this.ctx.stroke();
        
        // Draw angle labels on radial lines
        this.drawPolarAngleLabels(center, finalMaxRadius, thetaSpacing);
    }
    
    calculateFreshPolarSpacing() {
        // Force fresh calculation with current viewport - don't rely on cached values
        const viewportRange = Math.max(this.viewport.maxX - this.viewport.minX, this.viewport.maxY - this.viewport.minY);
        const pixelsPerUnit = Math.min(this.viewport.width, this.viewport.height) / viewportRange;
        
        // Target: 30-80 pixels between concentric circles for optimal readability
        const minPixelSpacing = 30;
        const maxPixelSpacing = 80;
        const idealPixelSpacing = 50;
        
        // Calculate ideal world spacing
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnit;
        
        // Find the best "nice" spacing value
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnit, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    drawPolarAngleLabels(center, maxViewportRadius, thetaSpacing) {
        // Use bright yellow/orange for angle labels to differentiate from axis labels and provide good contrast
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const angleColor = isDarkMode ? '#FFD700' : '#FF8C00'; // Gold in dark mode, vibrant orange in light mode

        this.ctx.fillStyle = angleColor;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Find the largest radius that keeps ALL labels visible
        const uniformRadius = this.findUniformLabelRadius(center, thetaSpacing);
        
        if (uniformRadius > 20) { // Only show if we have reasonable space
            for (let theta = 0; theta < 2 * Math.PI; theta += thetaSpacing) {
                // Skip 0° to avoid overlapping with axis labels
                if (Math.abs(theta) < 0.001) continue;
                
                // Calculate label position using uniform radius
                const labelX = center.x + uniformRadius * Math.cos(theta);
                const labelY = center.y - uniformRadius * Math.sin(theta); // Negative because screen Y is flipped
                
                // Format angle based on current angle mode
                const label = this.formatPolarAngle(theta);
                
                // Adjust text alignment based on quadrant for better readability
                const adjustedX = labelX + this.getPolarLabelOffset(theta).x;
                const adjustedY = labelY + this.getPolarLabelOffset(theta).y;
                
                this.ctx.fillText(label, adjustedX, adjustedY);
            }
        }
    }
    
    findUniformLabelRadius(center, thetaSpacing) {
        // Find the minimum safe radius across all angles
        let minSafeRadius = Infinity;
        
        for (let theta = 0; theta < 2 * Math.PI; theta += thetaSpacing) {
            // Skip 0° since we don't draw that label anyway
            if (Math.abs(theta) < 0.001) continue;
            
            const maxRadiusForThisAngle = this.findMaxVisibleRadius(center, theta);
            minSafeRadius = Math.min(minSafeRadius, maxRadiusForThisAngle);
        }
        
        return minSafeRadius === Infinity ? 0 : minSafeRadius;
    }
    
    findMaxVisibleRadius(center, theta) {
        // Calculate how far we can go in this direction before hitting viewport edge
        const cos_theta = Math.cos(theta);
        const sin_theta = Math.sin(theta);
        
        // Calculate intersection with viewport boundaries
        let maxRadius = Infinity;
        
        // Check intersection with right edge (x = viewport.width)
        if (cos_theta > 0) {
            const radiusToRightEdge = (this.viewport.width - 20 - center.x) / cos_theta;
            maxRadius = Math.min(maxRadius, radiusToRightEdge);
        }
        
        // Check intersection with left edge (x = 0)
        if (cos_theta < 0) {
            const radiusToLeftEdge = (20 - center.x) / cos_theta;
            maxRadius = Math.min(maxRadius, radiusToLeftEdge);
        }
        
        // Check intersection with bottom edge (y = viewport.height)
        if (-sin_theta > 0) { // Note: screen Y is flipped
            const radiusToBottomEdge = (this.viewport.height - 20 - center.y) / (-sin_theta);
            maxRadius = Math.min(maxRadius, radiusToBottomEdge);
        }
        
        // Check intersection with top edge (y = 0)
        if (-sin_theta < 0) { // Note: screen Y is flipped
            const radiusToTopEdge = (20 - center.y) / (-sin_theta);
            maxRadius = Math.min(maxRadius, radiusToTopEdge);
        }
        
        // Reduce by a small margin to ensure text doesn't get clipped
        return Math.max(0, maxRadius - 15);
    }
    
    formatPolarAngle(theta) {
        if (this.angleMode === 'degrees') {
            const degrees = (theta * 180 / Math.PI) % 360;
            return Math.round(degrees) + '°';
        } else {
            // Format in terms of π for common angles
            const piMultiple = theta / Math.PI;
            
            // Handle common fractions of π
            if (Math.abs(piMultiple - Math.round(piMultiple)) < 0.001) {
                const rounded = Math.round(piMultiple);
                if (rounded === 0) return '0';
                if (rounded === 1) return 'π';
                if (rounded === -1) return '-π';
                return rounded + 'π';
            }
            
            // Handle common fractions - expanded to include all multiples of π/12 (15°)
            const commonFractions = [
                { value: 1/12, label: 'π/12' },
                { value: 1/6, label: 'π/6' },
                { value: 1/4, label: 'π/4' },
                { value: 1/3, label: 'π/3' },
                { value: 5/12, label: '5π/12' },
                { value: 1/2, label: 'π/2' },
                { value: 7/12, label: '7π/12' },
                { value: 2/3, label: '2π/3' },
                { value: 3/4, label: '3π/4' },
                { value: 5/6, label: '5π/6' },
                { value: 11/12, label: '11π/12' },
                { value: 13/12, label: '13π/12' },
                { value: 7/6, label: '7π/6' },
                { value: 5/4, label: '5π/4' },
                { value: 4/3, label: '4π/3' },
                { value: 17/12, label: '17π/12' },
                { value: 3/2, label: '3π/2' },
                { value: 19/12, label: '19π/12' },
                { value: 5/3, label: '5π/3' },
                { value: 7/4, label: '7π/4' },
                { value: 11/6, label: '11π/6' },
                { value: 23/12, label: '23π/12' }
            ];
            
            for (let fraction of commonFractions) {
                if (Math.abs(piMultiple - fraction.value) < 0.01) {
                    return fraction.label;
                }
            }
            
            // For other values, show as decimal with π
            return (piMultiple).toFixed(2) + 'π';
        }
    }

    // Format a coordinate value as a pi fraction if it's close to a common multiple of π/12
    // Used for badge coordinates in radian mode with trig functions
    formatAsPiFraction(value) {
        // Check if value is close to a multiple of π
        const piMultiple = value / Math.PI;
        
        // Handle integer multiples of π
        if (Math.abs(piMultiple - Math.round(piMultiple)) < 0.001) {
            const rounded = Math.round(piMultiple);
            if (rounded === 0) return null; // Let formatCoordinate handle zero
            if (rounded === 1) return 'π';
            if (rounded === -1) return '-π';
            return rounded + 'π';
        }
        
        // Check if this is a multiple of π/24 (smallest grid unit)
        // This dynamically handles ANY fraction of π, not just a hardcoded list
        const twentyFourthsRatio = piMultiple * 24;
        if (Math.abs(twentyFourthsRatio - Math.round(twentyFourthsRatio)) < 0.01) {
            const numerator = Math.round(twentyFourthsRatio);
            const denominator = 24;
            
            // Simplify the fraction
            const gcd = (a, b) => b === 0 ? Math.abs(a) : gcd(b, a % b);
            const divisor = gcd(Math.abs(numerator), denominator);
            const simplifiedNum = numerator / divisor;
            const simplifiedDen = denominator / divisor;
            
            // Format the simplified fraction
            const sign = simplifiedNum < 0 ? '-' : '';
            const absNum = Math.abs(simplifiedNum);
            
            if (simplifiedDen === 1) {
                // Integer multiple of π (already handled above, but just in case)
                if (absNum === 1) return sign + 'π';
                return sign + absNum + 'π';
            } else {
                // Proper fraction
                if (absNum === 1) {
                    return sign + 'π/' + simplifiedDen;
                } else {
                    return sign + absNum + 'π/' + simplifiedDen;
                }
            }
        }
        
        // Not a recognizable fraction of π
        return null;
    }

    // Format a coordinate value as a common radical/fraction if it matches a known trig value
    // Used for y-coordinates in Cartesian mode and r-coordinates in polar mode
    formatAsCommonValue(value) {
        const tolerance = 0.001;
        
        // Check for zero and one first (most common)
        if (Math.abs(value) < tolerance) return null; // Let formatCoordinate handle zero
        if (Math.abs(value - 1) < tolerance) return null; // formatCoordinate handles 1 fine
        if (Math.abs(value + 1) < tolerance) return null; // formatCoordinate handles -1 fine
        
        // Common trig values - most frequently encountered
        const commonValues = [
            // Positive values
            { value: 1/2, label: '1/2' },
            { value: Math.sqrt(2)/2, label: '√2/2' },
            { value: Math.sqrt(3)/2, label: '√3/2' },
            { value: Math.sqrt(3)/3, label: '√3/3' },
            { value: Math.sqrt(2), label: '√2' },
            { value: Math.sqrt(3), label: '√3' },
            { value: Math.sqrt(5), label: '√5' },
            { value: 2*Math.sqrt(3)/3, label: '2√3/3' },
            // Negative values
            { value: -1/2, label: '-1/2' },
            { value: -Math.sqrt(2)/2, label: '-√2/2' },
            { value: -Math.sqrt(3)/2, label: '-√3/2' },
            { value: -Math.sqrt(3)/3, label: '-√3/3' },
            { value: -Math.sqrt(2), label: '-√2' },
            { value: -Math.sqrt(3), label: '-√3' },
            { value: -Math.sqrt(5), label: '-√5' },
            { value: -2*Math.sqrt(3)/3, label: '-2√3/3' },
            // Special values
            { value: Math.E, label: 'e' },
            { value: -Math.E, label: '-e' },
            { value: (1 + Math.sqrt(5))/2, label: 'φ' }, // Golden ratio
            { value: -(1 + Math.sqrt(5))/2, label: '-φ' }
        ];
        
        for (let item of commonValues) {
            if (Math.abs(value - item.value) < tolerance) {
                return item.label;
            }
        }
        
        return null;
    }
    
    getPolarLabelOffset(theta) {
        // Adjust label position slightly based on angle to avoid overlapping with grid lines
        const offsetDistance = 8;
        return {
            x: offsetDistance * Math.cos(theta + Math.PI/2),
            y: -offsetDistance * Math.sin(theta + Math.PI/2)
        };
    }
    
    getPolarRadiusSpacing() {
        // Use similar logic to cartesian grid spacing for smooth transitions
        const viewportRange = Math.max(this.viewport.maxX - this.viewport.minX, this.viewport.maxY - this.viewport.minY);
        const pixelsPerUnit = Math.min(this.viewport.width, this.viewport.height) / viewportRange;
        
        // Target: 30-80 pixels between concentric circles for optimal readability
        const minPixelSpacing = 30;
        const maxPixelSpacing = 80;
        const idealPixelSpacing = 50;
        
        // Calculate ideal world spacing
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnit;
        
        // Find the best "nice" spacing value
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnit, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    getPolarAngleSpacing() {
        // Fixed angle spacing like Desmos - 15° or π/12 radians (24 radial lines)
        // This provides consistent visual reference regardless of zoom level
        return Math.PI / 12; // 15° = π/12 radians
    }
    
    drawAxes() {
        // Get axes color from CSS variable (adapts to light/dark theme)
        const axesColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--axes-color').trim();
            
        this.ctx.strokeStyle = axesColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        // X-axis
        if (this.viewport.minY <= 0 && this.viewport.maxY >= 0) {
            const y = this.worldToScreen(0, 0).y;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.viewport.width, y);
        }
        
        // Y-axis
        if (this.viewport.minX <= 0 && this.viewport.maxX >= 0) {
            const x = this.worldToScreen(0, 0).x;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.viewport.height);
        }
        
        this.ctx.stroke();
    }
    
    drawAxisLabels() {
        // Get label color from CSS variable (adapts to light/dark theme)
        const labelColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--label-color').trim();
            
        this.ctx.fillStyle = labelColor;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        // Use different spacing logic for polar vs cartesian modes
        let xLabelSpacing, yLabelSpacing;
        if (this.plotMode === 'polar') {
            // In polar mode, use consistent spacing for both axes (they represent radius values)
            xLabelSpacing = this.getXLabelSpacing();
            yLabelSpacing = this.getYLabelSpacing();
        } else {
            // In cartesian mode, use trig-aware spacing for axis-specific functions
            xLabelSpacing = this.getTrigAwareXLabelSpacing();
            yLabelSpacing = this.getTrigAwareYLabelSpacing();
        }
        
        // X-axis labels
        if (this.viewport.minY <= 0 && this.viewport.maxY >= 0) {
            const axisY = this.worldToScreen(0, 0).y;
            const startX = Math.floor(this.viewport.minX / xLabelSpacing) * xLabelSpacing;
            
            for (let x = startX; x <= this.viewport.maxX; x += xLabelSpacing) {
                if (Math.abs(x) < 0.0001) continue; // Skip zero label
                
                const screenPos = this.worldToScreen(x, 0);
                if (screenPos.x >= 20 && screenPos.x <= this.viewport.width - 20) {
                    // In polar mode, always use regular numbers (axes represent radius values)
                    // In cartesian mode, use angle formatting only for pure regular trig functions
                    let label;
                    if (this.plotMode === 'polar') {
                        label = this.formatNumber(x);
                    } else {
                        const hasRegularTrig = this.currentModeContainsRegularTrigFunctions();
                        const hasInverseTrig = this.currentModeContainsInverseTrigFunctions();
                        const useTrigFormatting = hasRegularTrig && !hasInverseTrig;
                        label = useTrigFormatting ? this.formatTrigNumber(x) : this.formatNumber(x);
                    }
                    
                    const labelY = axisY + 5;
                    
                    // Don't draw labels too close to the bottom
                    if (labelY < this.viewport.height - 15) {
                        this.ctx.fillText(label, screenPos.x, labelY);
                    }
                }
            }
        }
        
        // Y-axis labels
        if (this.viewport.minX <= 0 && this.viewport.maxX >= 0) {
            const axisX = this.worldToScreen(0, 0).x;
            const startY = Math.floor(this.viewport.minY / yLabelSpacing) * yLabelSpacing;
            
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            
            for (let y = startY; y <= this.viewport.maxY; y += yLabelSpacing) {
                if (Math.abs(y) < 0.0001) continue; // Skip zero label
                
                const screenPos = this.worldToScreen(0, y);
                if (screenPos.y >= 20 && screenPos.y <= this.viewport.height - 20) {
                    // In polar mode, always use regular numbers (axes represent radius values)
                    // In cartesian mode, use angle formatting only for pure inverse trig functions
                    let label;
                    if (this.plotMode === 'polar') {
                        label = this.formatNumber(y);
                    } else {
                        const hasRegularTrig = this.currentModeContainsRegularTrigFunctions();
                        const hasInverseTrig = this.currentModeContainsInverseTrigFunctions();
                        const useTrigFormatting = hasInverseTrig && !hasRegularTrig;
                        label = useTrigFormatting ? this.formatTrigNumber(y) : this.formatNumber(y);
                    }
                    
                    const labelX = axisX - 5;
                    
                    // Don't draw labels too close to the left edge
                    if (labelX > 15) {
                        this.ctx.fillText(label, labelX, screenPos.y);
                    }
                }
            }
        }
        
        // Draw origin label
        if (this.viewport.minX <= 0 && this.viewport.maxX >= 0 && 
            this.viewport.minY <= 0 && this.viewport.maxY >= 0) {
            const origin = this.worldToScreen(0, 0);
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText('0', origin.x - 5, origin.y + 5);
        }
    }
    
    getLabelSpacing() {
        // Get appropriate spacing for axis labels based on zoom level
        const pixelsPerUnit = this.viewport.scale;
        
        // Target label spacing: 40-120 pixels apart for optimal readability
        const minPixelSpacing = 40;
        const maxPixelSpacing = 120;
        const idealPixelSpacing = 80;
        
        // Calculate ideal world spacing
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnit;
        
        // Generate list of "nice" spacing values
        const niceSpacings = [];
        
        // Add very small spacings for extreme zoom-in
        for (let exp = -6; exp <= 6; exp++) {
            const base = Math.pow(10, exp);
            niceSpacings.push(base, 2 * base, 5 * base);
        }
        
        // Sort the nice spacings
        niceSpacings.sort((a, b) => a - b);
        
        // Find the best spacing that keeps labels between min and max pixel spacing
        let bestSpacing = niceSpacings[0];
        let bestPixelSpacing = bestSpacing * pixelsPerUnit;
        
        for (const spacing of niceSpacings) {
            const pixelSpacing = spacing * pixelsPerUnit;
            
            // If this spacing is too small (labels too close), skip it
            if (pixelSpacing < minPixelSpacing) continue;
            
            // If this spacing is too large (labels too far apart), break
            if (pixelSpacing > maxPixelSpacing) break;
            
            // This spacing is in the acceptable range
            bestSpacing = spacing;
            bestPixelSpacing = pixelSpacing;
            
            // If we're close to ideal, use this one
            if (Math.abs(pixelSpacing - idealPixelSpacing) < Math.abs(bestPixelSpacing - idealPixelSpacing)) {
                bestSpacing = spacing;
                bestPixelSpacing = pixelSpacing;
            }
        }
        
        return bestSpacing;
    }
    
    formatNumber(num) {
        // Format numbers for axis labels using context-aware precision
        // Use the same intelligent formatting as coordinates for consistency
        return this.formatCoordinate(num);
    }
    
    formatTrigNumber(num) {
        // Special formatting for trigonometric values
        if (Math.abs(num) < 0.0001) return '0';
        
        if (this.angleMode === 'radians') {
            // Format common radian values nicely
            const piRatio = num / Math.PI;
            
            // Check for exact fractions of π
            if (Math.abs(piRatio - Math.round(piRatio)) < 0.001) {
                const rounded = Math.round(piRatio);
                if (rounded === 0) return '0';
                if (rounded === 1) return 'π';
                if (rounded === -1) return '-π';
                return rounded + 'π';
            }
            
            // Check if this is a multiple of π/24 (smallest grid unit in radian mode)
            // This ensures all grid values can be expressed as proper fractions
            const twentyFourthsRatio = piRatio * 24;
            if (Math.abs(twentyFourthsRatio - Math.round(twentyFourthsRatio)) < 0.01) {
                const numerator = Math.round(twentyFourthsRatio);
                const denominator = 24;
                
                // Simplify the fraction
                const gcd = (a, b) => b === 0 ? Math.abs(a) : gcd(b, a % b);
                const divisor = gcd(Math.abs(numerator), denominator);
                const simplifiedNum = numerator / divisor;
                const simplifiedDen = denominator / divisor;
                
                // Format the simplified fraction
                const sign = simplifiedNum < 0 ? '-' : '';
                const absNum = Math.abs(simplifiedNum);
                
                if (simplifiedDen === 1) {
                    // Integer multiple of π
                    if (absNum === 1) return sign + 'π';
                    return sign + absNum + 'π';
                } else {
                    // Proper fraction
                    if (absNum === 1) {
                        return sign + 'π/' + simplifiedDen;
                    } else {
                        return sign + absNum + 'π/' + simplifiedDen;
                    }
                }
            }
            
            // Fall back to decimal with π (should rarely happen now)
            if (Math.abs(piRatio) > 0.1) {
                return piRatio.toFixed(1) + 'π';
            }
        } else {
            // Degrees mode - just show the number with ° symbol for clarity
            if (Math.abs(num) >= 1) {
                return Math.round(num) + '°';
            }
        }
        
        // Fall back to normal formatting
        return this.formatNumber(num);
    }
    
    drawFunction(func) {
        if (!func.points || func.points.length < 2) return;
        
        this.ctx.strokeStyle = func.color;
        this.ctx.lineWidth = 3;
        
        let pathStarted = false;
        
        for (let i = 0; i < func.points.length; i++) {
            const point = func.points[i];
            
            // Skip NaN points (discontinuities)
            if (!isFinite(point.y)) {
                // End current path if one was started
                if (pathStarted) {
                    this.ctx.stroke();
                    pathStarted = false;
                }
                continue;
            }
            
            const screenPos = this.worldToScreen(point.x, point.y);
            
            // Be more inclusive for drawing points, especially for function boundaries
            // Allow points that are slightly outside the viewport to be drawn
            const buffer = 100; // Increased buffer for better boundary visibility
            if (screenPos.x >= -buffer && screenPos.x <= this.viewport.width + buffer &&
                screenPos.y >= -buffer && screenPos.y <= this.viewport.height + buffer) {
                
                if (!pathStarted || point.connected === false) {
                    // Start a new path
                    this.ctx.beginPath();
                    this.ctx.moveTo(screenPos.x, screenPos.y);
                    pathStarted = true;
                } else {
                    // Continue the current path
                    this.ctx.lineTo(screenPos.x, screenPos.y);
                }
            } else if (pathStarted) {
                // Point is outside viewport, end current path
                this.ctx.stroke();
                pathStarted = false;
            }
        }
        
        // Stroke the final path if one was started
        if (pathStarted) {
            this.ctx.stroke();
        }
    }

    drawImplicitFunction(func) {
        // Use stable displayPoints if available, otherwise fall back to points
        // displayPoints won't change during viewport panning, eliminating "blink"
        const pointsToUse = func.displayPoints || func.points;
        
        if (!pointsToUse || pointsToUse.length === 0) return;
        
        // Check if points should be connected (like for circles, ellipses, parabolas)
        const hasConnectedPoints = pointsToUse.some(p => p.connected);
        
        if (hasConnectedPoints) {
            // For marching squares output, draw as individual line segments
            this.ctx.strokeStyle = func.color;
            this.ctx.lineWidth = 2;
            
            // Draw individual line segments (every pair of connected points)
            for (let i = 0; i < pointsToUse.length - 1; i += 3) { // Skip by 3 (start, end, NaN)
                const startPoint = pointsToUse[i];
                const endPoint = pointsToUse[i + 1];
                
                if (startPoint && endPoint && 
                    isFinite(startPoint.x) && isFinite(startPoint.y) &&
                    isFinite(endPoint.x) && isFinite(endPoint.y)) {
                    
                    const startScreen = this.worldToScreen(startPoint.x, startPoint.y);
                    const endScreen = this.worldToScreen(endPoint.x, endPoint.y);
                    
                    // Only draw if at least one endpoint is visible
                    if ((startScreen.x >= -50 && startScreen.x <= this.viewport.width + 50 &&
                         startScreen.y >= -50 && startScreen.y <= this.viewport.height + 50) ||
                        (endScreen.x >= -50 && endScreen.x <= this.viewport.width + 50 &&
                         endScreen.y >= -50 && endScreen.y <= this.viewport.height + 50)) {
                        
                        this.ctx.beginPath();
                        this.ctx.moveTo(startScreen.x, startScreen.y);
                        this.ctx.lineTo(endScreen.x, endScreen.y);
                        this.ctx.stroke();
                    }
                }
            }
        } else {
            // Draw as discrete points (for hyperbolas or general implicit functions)
            this.ctx.fillStyle = func.color;
            const pointSize = 1.5;
            
            for (let i = 0; i < pointsToUse.length; i++) {
                const point = pointsToUse[i];
                if (!isFinite(point.x) || !isFinite(point.y)) continue;
                
                const screenPos = this.worldToScreen(point.x, point.y);
                
                if (screenPos.x >= -10 && screenPos.x <= this.viewport.width + 10 &&
                    screenPos.y >= -10 && screenPos.y <= this.viewport.height + 10) {
                    
                    this.ctx.beginPath();
                    this.ctx.arc(screenPos.x, screenPos.y, pointSize, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            }
        }
    }
    
    groupConnectedPoints(points) {
        const connectedPoints = points.filter(p => p.connected);
        if (connectedPoints.length === 0) return [];
        
        // Check if points have branch information (for hyperbolas)
        const hasBranches = connectedPoints.some(p => p.branch);
        
        if (hasBranches) {
            // Group by branch for hyperbolas
            const branches = {};
            connectedPoints.forEach(point => {
                if (!branches[point.branch]) {
                    branches[point.branch] = [];
                }
                branches[point.branch].push(point);
            });
            
            // Sort each branch by parameter order
            Object.keys(branches).forEach(branchName => {
                branches[branchName].sort((a, b) => {
                    // Sort by the primary coordinate for each branch
                    if (branchName.includes('right') || branchName.includes('left')) {
                        return a.y - b.y; // Sort by y for vertical spread
                    } else {
                        return a.x - b.x; // Sort by x for horizontal spread
                    }
                });
            });
            
            return Object.values(branches);
        } else {
            // For circles, ellipses, parabolas - all points form one group
            // General implicit functions will have connected: false, so won't reach here
            return [connectedPoints];
        }
    }
    
    isClosedCurve(expression) {
        const expr = expression.toLowerCase().replace(/\s/g, '');
        // Circles and ellipses are closed curves
        return this.isCircleEquation(expr) || this.isEllipseEquation(expr);
    }
    
    groupImplicitPoints(sortedPoints) {
        if (sortedPoints.length === 0) return [];
        
        const groups = [];
        const tolerance = (this.viewport.maxY - this.viewport.minY) * 0.05; // 5% of viewport height
        
        let currentGroup = [sortedPoints[0]];
        
        for (let i = 1; i < sortedPoints.length; i++) {
            const current = sortedPoints[i];
            const previous = sortedPoints[i - 1];
            
            // Check if this point should be in the same group
            // Points are in the same group if they're close in both x and y
            const xGap = Math.abs(current.x - previous.x);
            const yGap = Math.abs(current.y - previous.y);
            const maxXGap = (this.viewport.maxX - this.viewport.minX) * 0.02; // 2% of viewport width
            
            if (xGap <= maxXGap && yGap <= tolerance) {
                currentGroup.push(current);
            } else {
                // Start a new group
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                }
                currentGroup = [current];
            }
        }
        
        // Add the last group
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }
        
        return groups;
    }

    drawIntersectionMarkers() {
        // Early exit if no intersections
        if (!this.intersections || this.intersections.length === 0) {
            return;
        }
        
        // For large numbers of intersections, limit processing to avoid UI blocking
        const maxProcessPerFrame = 1000;
        const totalIntersections = this.intersections.length;
        
        if (totalIntersections > maxProcessPerFrame) {
            // Process in chunks - only process a subset per frame
            this.drawIntersectionMarkersChunked(maxProcessPerFrame);
            return;
        }
        
        // For smaller numbers, process normally but efficiently
        this.drawIntersectionMarkersImmediate();
    }
    
    drawIntersectionMarkersImmediate() {
        // Convert to screen coordinates and filter by viewport, then apply density culling
        const markersInViewport = [];
        
        for (const intersection of this.intersections) {
            const screenPos = this.worldToScreen(intersection.x, intersection.y);
            
            // Only consider markers within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                markersInViewport.push({
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                    intersection: intersection
                });
            }
        }
        
        // Apply density-based culling: skip markers too close to each other
        const minDistance = 20; // Minimum pixel distance between markers
        const culledMarkers = [];
        
        for (const marker of markersInViewport) {
            let tooClose = false;
            
            // Check if this marker is too close to any already accepted marker
            for (const accepted of culledMarkers) {
                const distance = Math.sqrt(
                    Math.pow(marker.screenX - accepted.screenX, 2) + 
                    Math.pow(marker.screenY - accepted.screenY, 2)
                );
                
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            // Only add marker if it's not too close to existing ones
            if (!tooClose) {
                culledMarkers.push(marker);
            }
        }
        
        // Draw the culled set of markers
        for (const marker of culledMarkers) {
            this.drawIntersectionMarker(marker.screenX, marker.screenY, marker.intersection);
        }
    }
    
    drawIntersectionMarkersChunked(maxProcess) {
        // For large intersection sets, only process the first N intersections
        // This prevents UI blocking while still showing intersection points
        const intersectionsToProcess = this.intersections.slice(0, maxProcess);
        
        // Convert to screen coordinates and filter by viewport
        const markersInViewport = [];
        
        for (const intersection of intersectionsToProcess) {
            const screenPos = this.worldToScreen(intersection.x, intersection.y);
            
            // Only consider markers within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                markersInViewport.push({
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                    intersection: intersection
                });
            }
        }
        
        // Apply simplified culling for performance
        const minDistance = 20;
        const culledMarkers = [];
        
        for (const marker of markersInViewport) {
            let tooClose = false;
            
            // Limit culling checks to prevent excessive computation
            for (let i = Math.max(0, culledMarkers.length - 50); i < culledMarkers.length; i++) {
                const accepted = culledMarkers[i];
                const distance = Math.sqrt(
                    Math.pow(marker.screenX - accepted.screenX, 2) + 
                    Math.pow(marker.screenY - accepted.screenY, 2)
                );
                
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                culledMarkers.push(marker);
            }
        }
        
        // Draw the culled set of markers
        for (const marker of culledMarkers) {
            this.drawIntersectionMarker(marker.screenX, marker.screenY, marker.intersection);
        }
    }
    
    drawIntersectionMarker(screenX, screenY, intersection) {
        // Draw a small, unobtrusive marker
        this.ctx.save();
        
        // Outer circle (white/light background for contrast)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Inner circle (darker color to indicate intersection)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    findIntersectionAtScreenPoint(screenX, screenY) {
        const tolerance = 15; // pixels - tolerance for tap detection
        
        // Check regular intersections
        for (const intersection of this.intersections) {
            const intersectionScreen = this.worldToScreen(intersection.x, intersection.y);
            const distance = Math.sqrt(
                Math.pow(screenX - intersectionScreen.x, 2) + 
                Math.pow(screenY - intersectionScreen.y, 2)
            );
            
            if (distance <= tolerance) {
                return intersection;
            }
        }
        
        return null;
    }
    
    // ================================
    // TURNING POINT RENDERING METHODS
    // ================================
    
    drawTurningPointMarkers() {
        // Convert to screen coordinates and filter by viewport, then apply density culling
        const markersInViewport = [];
        
        for (const turningPoint of this.turningPoints) {
            const screenPos = this.worldToScreen(turningPoint.x, turningPoint.y);
            
            // Only consider markers within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                markersInViewport.push({
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                    turningPoint: turningPoint
                });
            }
        }
        
        // Apply density-based culling: skip markers too close to each other
        const minDistance = 20; // Minimum pixel distance between markers
        const culledMarkers = [];
        
        for (const marker of markersInViewport) {
            let tooClose = false;
            
            // Check if this marker is too close to any already accepted marker
            for (const accepted of culledMarkers) {
                const distance = Math.sqrt(
                    Math.pow(marker.screenX - accepted.screenX, 2) + 
                    Math.pow(marker.screenY - accepted.screenY, 2)
                );
                
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            // Only add marker if it's not too close to existing ones
            if (!tooClose) {
                culledMarkers.push(marker);
            }
        }
        
        // Draw the culled set of markers
        for (const marker of culledMarkers) {
            this.drawTurningPointMarker(marker.screenX, marker.screenY, marker.turningPoint);
        }
    }
    
    drawTurningPointMarker(screenX, screenY, turningPoint) {
        // Draw a marker with same neutral color as intersections
        this.ctx.save();
        
        // Outer circle (white/light background for contrast)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Inner circle (same neutral color as intersections)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawFrozenTurningPointBadges() {
        for (const frozenBadge of this.frozenTurningPointBadges) {
            const screenPos = this.worldToScreen(frozenBadge.x, frozenBadge.y);
            
            // Only draw if within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                // Draw as simple markers (same neutral color as intersections)
                this.ctx.save();
                
                // Outer circle (white/light background for contrast)
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Inner circle (same neutral color as intersections)
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 3, 0, 2 * Math.PI);
                this.ctx.fill();
                
                this.ctx.restore();
            }
        }
    }
    
    // ================================
    // AXIS INTERCEPT RENDERING METHODS
    // ================================
    
    cullInterceptMarkers() {
        // Convert to screen coordinates and filter by viewport, then apply density culling
        // This is called only when intercepts change, not on every frame
        const markersInViewport = [];
        
        for (const intercept of this.intercepts) {
            const screenPos = this.worldToScreen(intercept.x, intercept.y);
            
            // Only consider markers within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                markersInViewport.push({
                    screenX: screenPos.x,
                    screenY: screenPos.y,
                    intercept: intercept
                });
            }
        }
        
        // Apply density-based culling: skip markers too close to each other
        const minDistance = 20; // Minimum pixel distance between markers
        const culledMarkers = [];
        
        for (const marker of markersInViewport) {
            let tooClose = false;
            
            // Check if this marker is too close to any already accepted marker
            for (const accepted of culledMarkers) {
                const distance = Math.sqrt(
                    Math.pow(marker.screenX - accepted.screenX, 2) + 
                    Math.pow(marker.screenY - accepted.screenY, 2)
                );
                
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            // Only add marker if it's not too close to existing ones
            if (!tooClose) {
                culledMarkers.push(marker);
            }
        }
        
        // Cache the culled markers
        this.culledInterceptMarkers = culledMarkers;
    }
    
    drawInterceptMarkers() {
        // Draw the pre-culled cached markers for performance
        // Culling is done only when intercepts change, not on every frame
        for (const marker of this.culledInterceptMarkers) {
            this.drawInterceptMarker(marker.screenX, marker.screenY, marker.intercept);
        }
    }
    
    drawInterceptMarker(screenX, screenY, intercept) {
        // Draw a marker with same style as turning points/intersections
        this.ctx.save();
        
        // Outer circle (white/light background for contrast)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Inner circle (same neutral color as intersections)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawFrozenInterceptBadges() {
        if (!this.frozenInterceptBadges) return;
        
        for (const frozenBadge of this.frozenInterceptBadges) {
            const screenPos = this.worldToScreen(frozenBadge.x, frozenBadge.y);
            
            // Only draw if within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                // Draw as simple markers
                this.ctx.save();
                
                // Outer circle (white/light background for contrast)
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Inner circle (same neutral color as intersections)
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 3, 0, 2 * Math.PI);
                this.ctx.fill();
                
                this.ctx.restore();
            }
        }
    }
    
    drawFrozenIntersectionBadges() {
        for (const frozenBadge of this.frozenIntersectionBadges) {
            const screenPos = this.worldToScreen(frozenBadge.x, frozenBadge.y);
            
            // Only draw if within viewport
            if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
                screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {
                
                // Draw intersection marker (same style as normal intersections)
                this.ctx.save();
                
                // Outer circle (white/light background for contrast)
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
                this.ctx.fill();
                
                // Inner circle (darker color to indicate intersection)
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 3, 0, 2 * Math.PI);
                this.ctx.fill();
                
                this.ctx.restore();
            }
        }
    }
    
    findTurningPointAtScreenPoint(screenX, screenY) {
        const tolerance = 15; // pixels - tolerance for tap detection
        
        // First check regular turning points (when viewport is stable)
        if (!this.isViewportChanging) {
            for (const turningPoint of this.turningPoints) {
                const turningPointScreen = this.worldToScreen(turningPoint.x, turningPoint.y);
                const distance = Math.sqrt(
                    Math.pow(screenX - turningPointScreen.x, 2) + 
                    Math.pow(screenY - turningPointScreen.y, 2)
                );
                
                if (distance <= tolerance) {
                    return turningPoint;
                }
            }
        }
        
        // During viewport changes, check frozen turning point badges
        if (this.isViewportChanging && this.frozenTurningPointBadges.length > 0) {
            for (const frozenBadge of this.frozenTurningPointBadges) {
                const badgeScreen = this.worldToScreen(frozenBadge.x, frozenBadge.y);
                const distance = Math.sqrt(
                    Math.pow(screenX - badgeScreen.x, 2) + 
                    Math.pow(screenY - badgeScreen.y, 2)
                );
                
                if (distance <= tolerance) {
                    return frozenBadge;
                }
            }
        }
        
        return null;
    }
    
    findInterceptAtScreenPoint(screenX, screenY) {
        const tolerance = 15; // pixels - tolerance for tap detection
        
        // First check regular intercepts (when viewport is stable)
        if (!this.isViewportChanging) {
            for (const intercept of this.intercepts) {
                const interceptScreen = this.worldToScreen(intercept.x, intercept.y);
                const distance = Math.sqrt(
                    Math.pow(screenX - interceptScreen.x, 2) + 
                    Math.pow(screenY - interceptScreen.y, 2)
                );
                
                if (distance <= tolerance) {
                    return intercept;
                }
            }
        }
        
        // During viewport changes, check frozen intercept badges
        if (this.isViewportChanging && this.frozenInterceptBadges && this.frozenInterceptBadges.length > 0) {
            for (const frozenBadge of this.frozenInterceptBadges) {
                const badgeScreen = this.worldToScreen(frozenBadge.x, frozenBadge.y);
                const distance = Math.sqrt(
                    Math.pow(screenX - badgeScreen.x, 2) + 
                    Math.pow(screenY - badgeScreen.y, 2)
                );
                
                if (distance <= tolerance) {
                    return frozenBadge;
                }
            }
        }
        
        return null;
    }
    
    handleInterceptTap(intercept, screenX, screenY) {
        // Validate intercept coordinates
        if (isNaN(intercept.x) || isNaN(intercept.y) || 
            !isFinite(intercept.x) || !isFinite(intercept.y)) {
            return;
        }
        
        // Create a badge at the intercept point, passing the functionId, tangentBadgeId, or normalBadgeId
        if (intercept.isTangentIntercept) {
            this.addInterceptBadge(intercept.x, intercept.y, intercept.type, intercept.functionId, intercept.tangentBadgeId, null);
        } else if (intercept.isNormalIntercept) {
            this.addInterceptBadge(intercept.x, intercept.y, intercept.type, intercept.functionId, null, intercept.normalBadgeId);
        } else {
            this.addInterceptBadge(intercept.x, intercept.y, intercept.type, intercept.functionId, null, null);
        }
    }
    
    addInterceptBadge(x, y, interceptType, functionId, tangentBadgeId = null, normalBadgeId = null) {
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(x);
        const snappedY = this.snapCoordinateForDisplay(y);
        
        // Calculate screen position using snapped coordinates
        const screenPos = this.worldToScreen(snappedX, snappedY);
        
        // Check if a badge already exists at this location (within tolerance)
        const existingBadge = this.findBadgeAtScreenPosition(screenPos.x, screenPos.y, 20);
        if (existingBadge) {
            // Badge already exists, don't add another
            return;
        }
        
        // Format coordinates based on the intercept type and plot mode
        let label;
        if (this.plotMode === 'polar') {
            // For polar intercepts, show (r, θ) coordinates
            const r = Math.sqrt(x * x + y * y);
            let theta = Math.atan2(y, x);
            
            // Convert to degrees for display
            let thetaDeg = theta * 180 / Math.PI;
            if (thetaDeg < 0) thetaDeg += 360;
            
            label = `(${this.formatNumber(r)}, ${this.formatNumber(thetaDeg)}°)`;
        } else {
            // Cartesian mode
            if (interceptType === 'x-intercept') {
                // X-intercept: format as (x, 0)
                label = `(${this.formatNumber(x)}, 0)`;
            } else {
                // Y-intercept: format as (0, y)
                label = `(0, ${this.formatNumber(y)})`;
            }
        }
        
        // Create and add badge using snapped coordinates
        const badge = {
            worldX: snappedX,
            worldY: snappedY,
            screenX: screenPos.x,
            screenY: screenPos.y,
            label: label,
            functionId: functionId, // Link badge to the function for proper cleanup
            tangentBadgeId: tangentBadgeId, // Link badge to tangent for proper cleanup
            normalBadgeId: normalBadgeId, // Link badge to normal for proper cleanup
            functionColor: '#808080', // Neutral gray color for intercepts
            badgeType: tangentBadgeId ? 'tangent-intercept' : (normalBadgeId ? 'normal-intercept' : interceptType) // 'tangent-intercept', 'normal-intercept', or 'x-intercept', 'y-intercept', or polar axis types
        };
        
        this.input.persistentBadges.push(badge);
        this.draw();
    }
    
    handleIntersectionTap(intersection, screenX, screenY) {
        // Validate intersection coordinates
        if (isNaN(intersection.x) || isNaN(intersection.y) || 
            !isFinite(intersection.x) || !isFinite(intersection.y)) {
            return;
        }
        
        // Handle tangent-tangent intersections
        if (intersection.isTangentTangentIntersection) {
            // For tangent-tangent intersections, coordinates are already accurate from line-line intersection
            this.addTangentTangentIntersectionBadge(
                intersection.x,
                intersection.y,
                intersection.func1Id, // first tangent badge ID
                intersection.func2Id  // second tangent badge ID
            );
            return;
        }
        
        // Handle tangent intersections differently (no refinement needed)
        if (intersection.isTangentIntersection) {
            // For tangent intersections, coordinates are already accurate from line segment intersection
            this.addTangentIntersectionBadge(
                intersection.x,
                intersection.y,
                intersection.func1Id, // tangent badge ID
                intersection.func2Id  // function ID
            );
            return;
        }
        
        // Handle normal-normal intersections
        if (intersection.isNormalNormalIntersection) {
            // For normal-normal intersections, coordinates are already accurate from line-line intersection
            this.addNormalNormalIntersectionBadge(
                intersection.x,
                intersection.y,
                intersection.func1Id, // first normal badge ID
                intersection.func2Id  // second normal badge ID
            );
            return;
        }
        
        // Handle normal-tangent intersections
        if (intersection.isNormalTangentIntersection) {
            // For normal-tangent intersections, coordinates are already accurate from line-line intersection
            this.addNormalTangentIntersectionBadge(
                intersection.x,
                intersection.y,
                intersection.func1Id, // normal badge ID
                intersection.func2Id  // tangent badge ID
            );
            return;
        }
        
        // Handle normal intersections (normal line with function curve)
        if (intersection.isNormalIntersection) {
            // For normal intersections, coordinates are already accurate from line segment intersection
            this.addNormalIntersectionBadge(
                intersection.x,
                intersection.y,
                intersection.func1Id, // normal badge ID
                intersection.func2Id  // function ID
            );
            return;
        }
        
        // Refine intersection using numerical method for precision (regular function-function intersections)
        const refinedIntersection = this.refineIntersection(intersection);
        
        // Validate refined coordinates
        if (isNaN(refinedIntersection.x) || isNaN(refinedIntersection.y) || 
            !isFinite(refinedIntersection.x) || !isFinite(refinedIntersection.y)) {
            return;
        }
        
        // Create a badge at the refined intersection point
        this.addIntersectionBadge(
            refinedIntersection.x,
            refinedIntersection.y,
            intersection.func1,
            intersection.func2
        );
    }
    
    refineIntersection(intersection) {
        // For polar mode, the line segment intersection is already quite accurate
        // so we don't need to refine it further
        if (this.plotMode === 'polar') {
            return { x: intersection.x, y: intersection.y };
        }
        
        // Check if either function is implicit
        const func1 = intersection.func1;
        const func2 = intersection.func2;
        const func1IsImplicit = !func1.expression || this.detectFunctionType(func1.expression) === 'implicit';
        const func2IsImplicit = !func2.expression || this.detectFunctionType(func2.expression) === 'implicit';
        
        // If either function is implicit, don't refine - the line segment intersection is already accurate
        if (func1IsImplicit || func2IsImplicit) {
            return { x: intersection.x, y: intersection.y };
        }
        
        // Use bisection method to refine the intersection point for cartesian functions
        // Start with a small interval around the approximate intersection
        let x1 = intersection.x - 0.01;
        let x2 = intersection.x + 0.01;
        
        // Bisection method to find where func1(x) - func2(x) = 0
        for (let i = 0; i < 20; i++) { // 20 iterations gives good precision
            const xMid = (x1 + x2) / 2;
            
            const y1_mid = this.evaluateFunction(func1.expression, xMid);
            const y2_mid = this.evaluateFunction(func2.expression, xMid);
            const diff_mid = y1_mid - y2_mid;
            
            const y1_1 = this.evaluateFunction(func1.expression, x1);
            const y2_1 = this.evaluateFunction(func2.expression, x1);
            const diff_1 = y1_1 - y2_1;
            
            if (Math.abs(diff_mid) < 1e-10) break; // Sufficient precision
            
            if (diff_mid * diff_1 < 0) {
                x2 = xMid;
            } else {
                x1 = xMid;
            }
        }
        
        const refinedX = (x1 + x2) / 2;
        const refinedY = this.evaluateFunction(func1.expression, refinedX);
        
        return { x: refinedX, y: refinedY };
    }
    
    addIntersectionBadge(worldX, worldY, func1, func2) {
        // Use a unique color for intersection badges that's not used by any function
        // Function colors: #4A90E2, #E74C3C, #27AE60, #F39C12, #9B59B6, #1ABC9C, #E67E22, #34495E, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4
        const intersectionColor = '#D63384'; // Pink/magenta color not in function palette
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create intersection badge with both function IDs stored
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for backward compatibility with existing code
            func1Id: func1.id, // Store first function ID
            func2Id: func2.id, // Store second function ID
            worldX: snappedX,
            worldY: snappedY,
            functionColor: intersectionColor,
            customText: null,
            badgeType: 'intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    addTangentIntersectionBadge(worldX, worldY, tangentBadgeId, functionId) {
        // Use a different color for tangent intersections
        const tangentIntersectionColor = '#FF1493'; // Deep pink for tangent intersections
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create tangent intersection badge
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for compatibility
            func1Id: tangentBadgeId, // Tangent badge ID (string starting with "tangent_")
            func2Id: functionId, // Function ID
            worldX: snappedX,
            worldY: snappedY,
            functionColor: tangentIntersectionColor,
            customText: null,
            badgeType: 'tangent-intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    addTangentTangentIntersectionBadge(worldX, worldY, tangentBadgeId1, tangentBadgeId2) {
        // Use a distinct color for tangent-tangent intersections
        const tangentTangentIntersectionColor = '#FF69B4'; // Hot pink for tangent-tangent intersections
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create tangent-tangent intersection badge
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for compatibility
            func1Id: tangentBadgeId1, // First tangent badge ID (string starting with "tangent_")
            func2Id: tangentBadgeId2, // Second tangent badge ID (string starting with "tangent_")
            worldX: snappedX,
            worldY: snappedY,
            functionColor: tangentTangentIntersectionColor,
            customText: null,
            badgeType: 'tangent-tangent-intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    addNormalIntersectionBadge(worldX, worldY, normalBadgeId, functionId) {
        // Use a different color for normal intersections
        const normalIntersectionColor = '#00CED1'; // Dark turquoise for normal intersections
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create normal intersection badge
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for compatibility
            func1Id: normalBadgeId, // Normal badge ID (string starting with "normal_")
            func2Id: functionId, // Function ID
            worldX: snappedX,
            worldY: snappedY,
            functionColor: normalIntersectionColor,
            customText: null,
            badgeType: 'normal-intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    addNormalNormalIntersectionBadge(worldX, worldY, normalBadgeId1, normalBadgeId2) {
        // Use a distinct color for normal-normal intersections
        const normalNormalIntersectionColor = '#20B2AA'; // Light sea green for normal-normal intersections
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create normal-normal intersection badge
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for compatibility
            func1Id: normalBadgeId1, // First normal badge ID (string starting with "normal_")
            func2Id: normalBadgeId2, // Second normal badge ID (string starting with "normal_")
            worldX: snappedX,
            worldY: snappedY,
            functionColor: normalNormalIntersectionColor,
            customText: null,
            badgeType: 'normal-normal-intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    addNormalTangentIntersectionBadge(worldX, worldY, normalBadgeId, tangentBadgeId) {
        // Use a distinct color for normal-tangent intersections
        const normalTangentIntersectionColor = '#9370DB'; // Medium purple for normal-tangent intersections
        
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        // Create normal-tangent intersection badge
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: null, // Keep null for compatibility
            func1Id: normalBadgeId, // Normal badge ID (string starting with "normal_")
            func2Id: tangentBadgeId, // Tangent badge ID (string starting with "tangent_")
            worldX: snappedX,
            worldY: snappedY,
            functionColor: normalTangentIntersectionColor,
            customText: null,
            badgeType: 'normal-tangent-intersection',
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    // ================================
    // TURNING POINT TAP HANDLING
    // ================================
    
    handleTurningPointTap(turningPoint, screenX, screenY) {
        // Create a badge at the turning point with classification
        this.addTurningPointBadge(
            turningPoint.x,
            turningPoint.y,
            turningPoint.func,
            turningPoint.type
        );
    }
    
    addTurningPointBadge(worldX, worldY, func, type) {
        // Use color coding for turning point badges
        let badgeColor;
        
        switch (type) {
            case 'maximum':
                badgeColor = '#FFD700'; // Gold for maximum (matches marker)
                break;
            case 'minimum':
                badgeColor = '#8A2BE2'; // Blue violet for minimum (matches marker)
                break;
            default:
                badgeColor = '#808080'; // Gray for inflection/other (matches marker)
        }
        
        this.addTraceBadge(
            func.id, // Associate with the function
            worldX,
            worldY,
            badgeColor,
            null, // No custom text - let system format coordinates dynamically
            type  // Badge type for display (maximum, minimum, etc.)
        );
    }

    drawActiveTracingIndicator() {
        if (!this.input.tracing.active) return;
        
        const tracingFunction = this.findFunctionById(this.input.tracing.functionId);
        if (!tracingFunction) return;
        
        // Convert world coordinates to screen coordinates
        const screenPos = this.worldToScreen(this.input.tracing.worldX, this.input.tracing.worldY);
        
        // Skip drawing if point is outside the visible canvas
        if (screenPos.x < -20 || screenPos.x > this.viewport.width + 20 ||
            screenPos.y < -20 || screenPos.y > this.viewport.height + 20) {
            return;
        }
        
        // Draw tangent or normal line if the dragged badge has one
        if (this.input.tracing.currentSlope !== null && this.input.tracing.currentSlope !== undefined) {
            const tempBadge = {
                worldX: this.input.tracing.worldX,
                worldY: this.input.tracing.worldY,
                tangentSlope: this.input.tracing.currentSlope,
                functionColor: tracingFunction.color,
                hasTangent: !this.input.tracing.hasNormal,
                neonTangent: this.input.tracing.neonTangent || false,
                hasNormal: this.input.tracing.hasNormal || false,
                neonNormal: this.input.tracing.neonNormal || false
            };
            if (tempBadge.hasTangent) {
                this.drawTangentLine(tempBadge);
            } else if (tempBadge.hasNormal) {
                this.drawNormalLine(tempBadge);
            }
        }
        
        // Draw the active tracing indicator with tangent info if present
        const hasTangent = this.input.tracing.currentSlope !== null && this.input.tracing.currentSlope !== undefined && !this.input.tracing.hasNormal;
        const hasNormal = this.input.tracing.hasNormal || false;
        const hasIntegral = this.input.badgeInteraction.originalBadgeState && this.input.badgeInteraction.originalBadgeState.hasIntegral;
        const neonIntegral = hasIntegral && this.input.badgeInteraction.originalBadgeState.neonIntegral;
        
        // Determine integral limit type if dragging an integral badge
        let integralLimitType = null;
        if (hasIntegral && this.input.badgeInteraction.originalBadgeId) {
            const draggedBadgeId = this.input.badgeInteraction.originalBadgeId;
            const pair = this.integralPairs.find(p => p.badge1Id === draggedBadgeId || p.badge2Id === draggedBadgeId);
            if (pair) {
                integralLimitType = pair.badge1Id === draggedBadgeId ? 'lower' : 'upper';
            }
        }
        
        // For polar functions, use theta instead of worldX for proper display
        const displayX = (tracingFunction.mode === 'polar' && this.input.tracing.theta !== null && this.input.tracing.theta !== undefined) 
            ? this.input.tracing.theta 
            : this.input.tracing.worldX;
        
        this.drawTracingBadge(screenPos.x, screenPos.y, tracingFunction.color, 
            displayX, this.input.tracing.worldY, true, false, null, null, 
            hasTangent, hasNormal, hasIntegral, neonIntegral, this.input.tracing.currentSlope, this.input.tracing.currentSecondDerivative, tracingFunction, null, integralLimitType);
        
        // Draw theta hint for polar functions
        if (tracingFunction.mode === 'polar' && this.input.tracing.theta !== null && this.input.tracing.theta !== undefined) {
            this.drawPolarThetaHint(this.input.tracing.theta);
        }
    }
    
    drawIntegrationRegions() {
        // Draw regular integral pairs (not linked)
        for (const pair of this.integralPairs) {
            // Skip if this pair is part of a linked set
            const isLinked = this.linkedBadgePairs.some(lp => 
                lp.pair1 === pair || lp.pair2 === pair
            );
            if (isLinked) continue;
            
            const func = pair.func;
            if (!func || !func.points || func.points.length === 0) continue;
            
            this.ctx.save();
            
            // Set up styling
            if (pair.neon) {
                // Pulsating neon effect - smooth color cycling
                const time = Date.now() / 1000; // Convert to seconds
                const pulseSpeed = 2; // Slower pulse for smoother color transition
                
                // Create color cycling effect through neon colors (hot pink, cyan, lime, orange)
                const colorPhase = (Math.sin(time * pulseSpeed) + 1) / 2; // 0 to 1
                let neonColor;
                
                if (colorPhase < 0.25) {
                    // Hot pink to cyan
                    const t = colorPhase / 0.25;
                    neonColor = `rgba(${Math.floor(255 * (1 - t) + 0 * t)}, ${Math.floor(20 * (1 - t) + 255 * t)}, ${Math.floor(147 * (1 - t) + 255 * t)}, 0.4)`;
                } else if (colorPhase < 0.5) {
                    // Cyan to lime
                    const t = (colorPhase - 0.25) / 0.25;
                    neonColor = `rgba(${Math.floor(0 * (1 - t) + 57 * t)}, ${255}, ${Math.floor(255 * (1 - t) + 255 * t)}, 0.4)`;
                } else if (colorPhase < 0.75) {
                    // Lime to orange
                    const t = (colorPhase - 0.5) / 0.25;
                    neonColor = `rgba(${Math.floor(57 * (1 - t) + 255 * t)}, ${Math.floor(255 * (1 - t) + 165 * t)}, ${Math.floor(255 * (1 - t) + 0 * t)}, 0.4)`;
                } else {
                    // Orange to hot pink
                    const t = (colorPhase - 0.75) / 0.25;
                    neonColor = `rgba(${255}, ${Math.floor(165 * (1 - t) + 20 * t)}, ${Math.floor(0 * (1 - t) + 147 * t)}, 0.4)`;
                }
                
                this.ctx.fillStyle = neonColor;
                this.ctx.strokeStyle = neonColor;
                this.ctx.lineWidth = 2;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = neonColor;
            } else {
                // Use function color with transparency
                const alpha = 0.25;
                this.ctx.fillStyle = this.hexToRGBA(pair.color, alpha);
                this.ctx.strokeStyle = pair.color;
                this.ctx.lineWidth = 1;
            }
            
            // Draw shaded region
            this.ctx.beginPath();
            
            if (this.plotMode === 'polar') {
                // Polar mode: draw sector
                this.drawPolarIntegrationRegion(pair);
            } else {
                // Cartesian mode: draw area under curve
                this.drawCartesianIntegrationRegion(pair);
            }
            
            this.ctx.fill();
            
            // Draw boundary lines
            if (this.plotMode === 'cartesian') {
                // Vertical lines at integration limits
                const start = this.worldToScreen(pair.start, 0);
                const end = this.worldToScreen(pair.end, 0);
                
                this.ctx.setLineDash([5, 5]);
                this.ctx.beginPath();
                this.ctx.moveTo(start.x, 0);
                this.ctx.lineTo(start.x, this.viewport.height);
                this.ctx.stroke();
                
                this.ctx.beginPath();
                this.ctx.moveTo(end.x, 0);
                this.ctx.lineTo(end.x, this.viewport.height);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            this.ctx.restore();
            
            // Don't draw label here - will be drawn in panel at bottom
        }
        
        // Draw linked badge pairs (area between curves)
        this.drawLinkedIntegrationRegions();
    }
    
    drawIntegralPanel() {
        // Draw all integral pairs in bottom-right panel
        for (let i = 0; i < this.integralPairs.length; i++) {
            this.drawIntegrationLabel(this.integralPairs[i], i);
        }
        
        // Draw "Area between" result if two are checked
        if (this.integralPanelCheckboxes.length === 2) {
            const linkedPair = this.linkedBadgePairs.find(lp =>
                this.integralPanelCheckboxes.includes(lp.pair1) &&
                this.integralPanelCheckboxes.includes(lp.pair2)
            );
            
            if (linkedPair && linkedPair.areaBetween !== undefined) {
                this.drawAreaBetweenPanelLabel(linkedPair, this.integralPairs.length);
            }
        } else if (this.integralPairs.length >= 2) {
            // Show hint when there are 2+ integrals but less than 2 checked
            this.drawAreaBetweenHintLabel(this.integralPairs.length);
        }
    }
    
    drawAreaBetweenPanelLabel(linkedPair, index) {
        const panelX = this.viewport.width - 250;
        const panelY = this.viewport.height - 60 - (index * 50);
        const panelWidth = 240;
        const panelHeight = 45;
        
        this.ctx.save();
        
        // Gold background for area between
        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        
        // Border
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Format area value
        const areaText = Math.abs(linkedPair.areaBetween) < 0.01 ?
            linkedPair.areaBetween.toExponential(2) :
            linkedPair.areaBetween.toFixed(3);
        
        const text = `Area between = ${areaText}`;
        
        // Text
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(text, panelX + panelWidth / 2, panelY + panelHeight / 2);
        
        this.ctx.restore();
    }
    
    drawAreaBetweenHintLabel(index) {
        const panelX = this.viewport.width - 250;
        const panelY = this.viewport.height - 60 - (index * 50);
        const panelWidth = 240;
        const panelHeight = 45;
        
        this.ctx.save();
        
        // Gold background with slight transparency to indicate it's a hint
        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        
        // Border
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Hint text on two lines
        this.ctx.font = 'bold 13px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText('Select two functions', panelX + panelWidth / 2, panelY + panelHeight / 2 - 8);
        this.ctx.fillText('for area between', panelX + panelWidth / 2, panelY + panelHeight / 2 + 8);
        
        this.ctx.restore();
    }
    
    drawLinkedIntegrationRegions() {
        for (const linkedPair of this.linkedBadgePairs) {
            const pair1 = linkedPair.pair1;
            const pair2 = linkedPair.pair2;
            
            if (!pair1 || !pair2 || !pair1.func || !pair2.func) continue;
            
            if (this.plotMode === 'polar') {
                this.drawLinkedPolarIntegrationRegion(linkedPair, pair1, pair2);
            } else {
                this.drawLinkedCartesianIntegrationRegion(linkedPair, pair1, pair2);
            }
        }
    }
    
    drawLinkedCartesianIntegrationRegion(linkedPair, pair1, pair2) {
        // Find the overlapping x range
        const xStart = Math.max(pair1.start, pair2.start);
        const xEnd = Math.min(pair1.end, pair2.end);
        
        if (xStart >= xEnd) return; // No overlap
        
        // Get points from both functions in the overlap range
        const points1 = pair1.func.points.filter(p => 
            !isNaN(p.x) && !isNaN(p.y) && p.x >= xStart && p.x <= xEnd
        ).sort((a, b) => a.x - b.x);
        
        const points2 = pair2.func.points.filter(p => 
            !isNaN(p.x) && !isNaN(p.y) && p.x >= xStart && p.x <= xEnd
        ).sort((a, b) => a.x - b.x);
        
        if (points1.length < 2 || points2.length < 2) return;
        
        // Calculate area between curves
        const areaBetween = this.calculateAreaBetweenCurves(points1, points2, xStart, xEnd);
        
        // Store the result in the linked pair for panel display
        linkedPair.areaBetween = areaBetween;
        
        this.ctx.save();
        
        // Use a blend of both colors with gold tint to indicate linking
        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Gold with transparency
        this.ctx.strokeStyle = '#FFD700'; // Gold
        this.ctx.lineWidth = 2;
        
        // Draw the region between curves
        this.ctx.beginPath();
        
        // Trace along first function
        for (let i = 0; i < points1.length; i++) {
            const screen = this.worldToScreen(points1[i].x, points1[i].y);
            if (i === 0) {
                this.ctx.moveTo(screen.x, screen.y);
            } else {
                this.ctx.lineTo(screen.x, screen.y);
            }
        }
        
        // Trace back along second function (in reverse)
        for (let i = points2.length - 1; i >= 0; i--) {
            const screen = this.worldToScreen(points2[i].x, points2[i].y);
            this.ctx.lineTo(screen.x, screen.y);
        }
        
        this.ctx.closePath();
        this.ctx.fill();
        
        // Draw boundary lines at limits
        const startScreen1 = this.worldToScreen(xStart, points1[0].y);
        const startScreen2 = this.worldToScreen(xStart, points2[0].y);
        const endScreen1 = this.worldToScreen(xEnd, points1[points1.length - 1].y);
        const endScreen2 = this.worldToScreen(xEnd, points2[points2.length - 1].y);
        
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.moveTo(startScreen1.x, startScreen1.y);
        this.ctx.lineTo(startScreen2.x, startScreen2.y);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(endScreen1.x, endScreen1.y);
        this.ctx.lineTo(endScreen2.x, endScreen2.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        this.ctx.restore();
    }
    
    drawLinkedPolarIntegrationRegion(linkedPair, pair1, pair2) {
        // Find the overlapping theta range
        const thetaStart = Math.max(pair1.start, pair2.start);
        const thetaEnd = Math.min(pair1.end, pair2.end);
        
        if (thetaStart >= thetaEnd) return; // No overlap
        
        // Get points from both functions in the overlap range, sorted by theta
        const getPointsWithTheta = (func, start, end) => {
            return func.points.filter(p => {
                if (isNaN(p.x) || isNaN(p.y)) return false;
                let theta = Math.atan2(p.y, p.x);
                while (theta < 0) theta += 2 * Math.PI;
                while (theta > 2 * Math.PI) theta -= 2 * Math.PI;
                return theta >= start && theta <= end;
            }).map(p => {
                let theta = Math.atan2(p.y, p.x);
                while (theta < 0) theta += 2 * Math.PI;
                while (theta > 2 * Math.PI) theta -= 2 * Math.PI;
                return { x: p.x, y: p.y, theta };
            }).sort((a, b) => a.theta - b.theta);
        };
        
        const points1 = getPointsWithTheta(pair1.func, thetaStart, thetaEnd);
        const points2 = getPointsWithTheta(pair2.func, thetaStart, thetaEnd);
        
        if (points1.length < 2 || points2.length < 2) return;
        
        // Calculate area between curves (difference of polar integrals)
        const areaBetween = Math.abs(pair1.area - pair2.area);
        linkedPair.areaBetween = areaBetween;
        
        this.ctx.save();
        
        // Gold color for linked region
        this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        
        // Draw the region between the two curves (not from center)
        this.ctx.beginPath();
        
        // Start at first point of first curve
        const firstScreen = this.worldToScreen(points1[0].x, points1[0].y);
        this.ctx.moveTo(firstScreen.x, firstScreen.y);
        
        // Trace along first function
        for (let i = 1; i < points1.length; i++) {
            const screen = this.worldToScreen(points1[i].x, points1[i].y);
            this.ctx.lineTo(screen.x, screen.y);
        }
        
        // Connect to second curve at the end angle
        if (points2.length > 0) {
            const lastPoint2 = points2[points2.length - 1];
            const screen = this.worldToScreen(lastPoint2.x, lastPoint2.y);
            this.ctx.lineTo(screen.x, screen.y);
        }
        
        // Trace back along second function in reverse
        for (let i = points2.length - 2; i >= 0; i--) {
            const screen = this.worldToScreen(points2[i].x, points2[i].y);
            this.ctx.lineTo(screen.x, screen.y);
        }
        
        // Close the path
        this.ctx.closePath();
        this.ctx.fill();
        
        // Draw boundary rays at the start and end angles
        const centerScreen = this.worldToScreen(0, 0);
        
        if (points1.length > 0 && points2.length > 0) {
            // Start ray
            const start1 = this.worldToScreen(points1[0].x, points1[0].y);
            const start2 = this.worldToScreen(points2[0].x, points2[0].y);
            
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.beginPath();
            this.ctx.moveTo(centerScreen.x, centerScreen.y);
            this.ctx.lineTo(start1.x, start1.y);
            this.ctx.moveTo(centerScreen.x, centerScreen.y);
            this.ctx.lineTo(start2.x, start2.y);
            this.ctx.stroke();
            
            // End ray
            const end1 = this.worldToScreen(points1[points1.length - 1].x, points1[points1.length - 1].y);
            const end2 = this.worldToScreen(points2[points2.length - 1].x, points2[points2.length - 1].y);
            
            this.ctx.beginPath();
            this.ctx.moveTo(centerScreen.x, centerScreen.y);
            this.ctx.lineTo(end1.x, end1.y);
            this.ctx.moveTo(centerScreen.x, centerScreen.y);
            this.ctx.lineTo(end2.x, end2.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        this.ctx.restore();
    }
    
    calculateAreaBetweenCurves(points1, points2, xStart, xEnd) {
        // Use trapezoidal rule to calculate area between curves
        // Sample both functions at regular intervals
        const numSamples = 100;
        const dx = (xEnd - xStart) / numSamples;
        let area = 0;
        
        for (let i = 0; i < numSamples; i++) {
            const x1 = xStart + i * dx;
            const x2 = xStart + (i + 1) * dx;
            
            // Interpolate y values from points
            const y1_1 = this.interpolateY(points1, x1);
            const y1_2 = this.interpolateY(points1, x2);
            const y2_1 = this.interpolateY(points2, x1);
            const y2_2 = this.interpolateY(points2, x2);
            
            if (y1_1 !== null && y1_2 !== null && y2_1 !== null && y2_2 !== null) {
                // Trapezoidal rule for the difference
                const diff1 = Math.abs(y1_1 - y2_1);
                const diff2 = Math.abs(y1_2 - y2_2);
                area += (diff1 + diff2) * dx / 2;
            }
        }
        
        return area;
    }
    
    interpolateY(points, x) {
        // Find the two closest points and interpolate
        if (points.length === 0) return null;
        
        // Find points before and after x
        let before = null;
        let after = null;
        
        for (let i = 0; i < points.length; i++) {
            if (points[i].x <= x) {
                before = points[i];
            }
            if (points[i].x >= x && after === null) {
                after = points[i];
                break;
            }
        }
        
        if (before === null) return points[0].y;
        if (after === null) return points[points.length - 1].y;
        if (before === after) return before.y;
        
        // Linear interpolation
        const t = (x - before.x) / (after.x - before.x);
        return before.y + t * (after.y - before.y);
    }
    
    drawCartesianIntegrationRegion(pair) {
        const func = pair.func;
        const points = func.points.filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x >= pair.start && p.x <= pair.end);
        
        if (points.length < 2) return;
        
        // Check if function is implicit using expression type
        const functionType = this.detectFunctionType(func.expression);
        const isImplicit = (functionType === 'implicit');
        
        if (isImplicit) {
            // For implicit functions, use the connected property to separate segments
            const segments = [];
            let currentSegment = [];
            
            // Process points in order from the original array (preserves segment grouping)
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                
                // Check if previous point in original array exists and is connected
                const prevIndex = func.points.indexOf(point) - 1;
                const prevPoint = prevIndex >= 0 ? func.points[prevIndex] : null;
                const isConnectedToPrev = prevPoint && !isNaN(prevPoint.y);
                
                if (currentSegment.length === 0 || !isConnectedToPrev) {
                    // Start new segment
                    if (currentSegment.length > 1) {
                        segments.push(currentSegment);
                    }
                    currentSegment = [point];
                } else {
                    // Continue current segment
                    currentSegment.push(point);
                }
            }
            
            if (currentSegment.length > 1) {
                segments.push(currentSegment);
            }
            
            // Find which segments contain the badge positions
            // This ensures we only shade the branches where the user placed badges
            const badge1 = this.input.persistentBadges.find(b => b.id === pair.badge1Id);
            const badge2 = this.input.persistentBadges.find(b => b.id === pair.badge2Id);
            
            const relevantSegments = segments.filter(segment => {
                // Check if either badge is on or near this segment
                for (const badge of [badge1, badge2]) {
                    if (!badge) continue;
                    
                    // Check if any point in segment is close to the badge
                    for (const point of segment) {
                        const distX = Math.abs(point.x - badge.worldX);
                        const distY = Math.abs(point.y - badge.worldY);
                        
                        // If badge is very close to this segment, include it
                        if (distX < 0.1 && distY < 0.1) {
                            return true;
                        }
                    }
                }
                return false;
            });
            
            // Draw each relevant segment separately as area under curve
            for (const segment of relevantSegments) {
                if (segment.length < 2) continue;
                
                // Sort segment by x to ensure proper drawing
                const sortedSegment = [...segment].sort((a, b) => a.x - b.x);
                
                this.ctx.beginPath();
                
                // Start at x-axis below first point
                const firstScreen = this.worldToScreen(sortedSegment[0].x, 0);
                this.ctx.moveTo(firstScreen.x, firstScreen.y);
                
                // Go up to first point
                const firstPoint = this.worldToScreen(sortedSegment[0].x, sortedSegment[0].y);
                this.ctx.lineTo(firstPoint.x, firstPoint.y);
                
                // Draw along segment
                for (let i = 1; i < sortedSegment.length; i++) {
                    const screen = this.worldToScreen(sortedSegment[i].x, sortedSegment[i].y);
                    this.ctx.lineTo(screen.x, screen.y);
                }
                
                // Draw down to x-axis at last point
                const lastScreen = this.worldToScreen(sortedSegment[sortedSegment.length - 1].x, 0);
                this.ctx.lineTo(lastScreen.x, lastScreen.y);
                
                // Close along x-axis
                this.ctx.closePath();
                this.ctx.fill();
            }
        } else {
            // Simple explicit function - original behavior
            // Sort by x
            points.sort((a, b) => a.x - b.x);
            
            // Start at bottom left
            const startScreen = this.worldToScreen(pair.start, 0);
            this.ctx.moveTo(startScreen.x, startScreen.y);
            
            // Draw up to first point
            const firstPoint = this.worldToScreen(points[0].x, points[0].y);
            this.ctx.lineTo(firstPoint.x, firstPoint.y);
            
            // Draw along curve
            for (let i = 1; i < points.length; i++) {
                const screen = this.worldToScreen(points[i].x, points[i].y);
                this.ctx.lineTo(screen.x, screen.y);
            }
            
            // Draw down to bottom right
            const endScreen = this.worldToScreen(pair.end, 0);
            this.ctx.lineTo(endScreen.x, endScreen.y);
            
            // Close path along x-axis
            this.ctx.lineTo(startScreen.x, startScreen.y);
        }
    }
    
    drawPolarIntegrationRegion(pair) {
        const func = pair.func;
        
        // Draw sector from origin
        const centerScreen = this.worldToScreen(0, 0);
        this.ctx.moveTo(centerScreen.x, centerScreen.y);
        
        // Get points within theta range
        const relevantPoints = [];
        for (const p of func.points) {
            let theta = Math.atan2(p.y, p.x);
            // Normalize theta to [0, 2π]
            while (theta < 0) theta += 2 * Math.PI;
            while (theta > 2 * Math.PI) theta -= 2 * Math.PI;
            
            let start = pair.start;
            let end = pair.end;
            while (start < 0) start += 2 * Math.PI;
            while (end < 0) end += 2 * Math.PI;
            
            if (theta >= start && theta <= end) {
                relevantPoints.push({ x: p.x, y: p.y, theta });
            }
        }
        
        if (relevantPoints.length < 2) return;
        
        // Sort by theta
        relevantPoints.sort((a, b) => a.theta - b.theta);
        
        // Draw from center to first point
        const firstScreen = this.worldToScreen(relevantPoints[0].x, relevantPoints[0].y);
        this.ctx.lineTo(firstScreen.x, firstScreen.y);
        
        // Draw along curve
        for (let i = 1; i < relevantPoints.length; i++) {
            const screen = this.worldToScreen(relevantPoints[i].x, relevantPoints[i].y);
            this.ctx.lineTo(screen.x, screen.y);
        }
        
        // Return to center
        this.ctx.lineTo(centerScreen.x, centerScreen.y);
    }
    
    drawIntegrationLabel(pair, index) {
        // Draw in bottom-right panel instead of on graph
        const panelX = this.viewport.width - 250;
        const panelY = this.viewport.height - 60 - (index * 50);
        const panelWidth = 240;
        const panelHeight = 45;
        
        this.ctx.save();
        
        // Background with function color
        this.ctx.fillStyle = this.hexToRGBA(pair.color, 0.9);
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        
        // Border
        this.ctx.strokeStyle = pair.color;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Format area value
        const areaText = Math.abs(pair.area) < 0.01 ? 
            pair.area.toExponential(2) : 
            pair.area.toFixed(3);
        
        const text = this.plotMode === 'polar' ? 
            `Area = ${areaText}` : 
            `∫ = ${areaText}`;
        
        // Text
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(text, panelX + 40, panelY + panelHeight / 2);
        
        // Draw checkbox
        const checkboxX = panelX + 10;
        const checkboxY = panelY + 12;
        const checkboxSize = 20;
        
        // Checkbox background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(checkboxX, checkboxY, checkboxSize, checkboxSize);
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);
        
        // Check if this pair is checked (by badge IDs, not object reference)
        const isChecked = this.integralPanelCheckboxes.some(p => 
            p.badge1Id === pair.badge1Id && p.badge2Id === pair.badge2Id
        );
        if (isChecked) {
            // Draw checkmark
            this.ctx.strokeStyle = '#00AA00';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(checkboxX + 4, checkboxY + 10);
            this.ctx.lineTo(checkboxX + 8, checkboxY + 15);
            this.ctx.lineTo(checkboxX + 16, checkboxY + 5);
            this.ctx.stroke();
        }
        
        // Store clickable bounds for checkbox
        pair.checkboxBounds = {
            x: checkboxX,
            y: checkboxY,
            width: checkboxSize,
            height: checkboxSize
        };
        
        // Store panel bounds for potential click detection
        pair.panelBounds = {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight
        };
        
        this.ctx.restore();
    }
    
    hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    findIntegralLabelAtPoint(x, y) {
        // Check all integral pairs for checkbox hit
        for (const pair of this.integralPairs) {
            if (pair.checkboxBounds) {
                const bounds = pair.checkboxBounds;
                if (x >= bounds.x && x <= bounds.x + bounds.width &&
                    y >= bounds.y && y <= bounds.y + bounds.height) {
                    return pair;
                }
            }
        }
        return null;
    }
    
    handleIntegralLabelClick(pair) {
        // Toggle checkbox state (find by badge IDs, not object reference)
        const index = this.integralPanelCheckboxes.findIndex(p => 
            p.badge1Id === pair.badge1Id && p.badge2Id === pair.badge2Id
        );
        
        if (index !== -1) {
            // Uncheck - remove from array
            this.integralPanelCheckboxes.splice(index, 1);
        } else {
            // Check - add to array (max 2)
            if (this.integralPanelCheckboxes.length < 2) {
                this.integralPanelCheckboxes.push(pair);
            } else {
                // Already have 2 checked - replace the first one
                this.integralPanelCheckboxes.shift();
                this.integralPanelCheckboxes.push(pair);
            }
        }
        
        // Update linked pairs based on checked boxes
        if (this.integralPanelCheckboxes.length === 2) {
            const pair1 = this.integralPanelCheckboxes[0];
            const pair2 = this.integralPanelCheckboxes[1];
            
            // Only link if they're on different functions
            if (pair1.func.id !== pair2.func.id) {
                // Clear existing links and create new one
                this.linkedBadgePairs = [{
                    pair1: pair1,
                    pair2: pair2
                }];
            } else {
                // Same function - can't link, uncheck the second one
                this.integralPanelCheckboxes.pop();
            }
        } else {
            // Less than 2 checked - clear links
            this.linkedBadgePairs = [];
        }
        
        this.draw();
    }
    
    drawPersistentBadges() {
        // Skip drawing badges during polar animation or pause
        if (this.polarAnimation.isAnimating || this.polarAnimation.isPaused) {
            return;
        }
        
        // Update badge screen positions before drawing
        this.updateBadgeScreenPositions();
        
        // Draw tangent lines first (under badges)
        for (const badge of this.input.persistentBadges) {
            if (badge.hasTangent && badge.tangentSlope !== null) {
                this.drawTangentLine(badge);
            }
            
            // Draw normal line if badge has one
            if (badge.hasNormal) {
                this.drawNormalLine(badge);
            }
        }
        
        // Draw badges on top of tangent lines
        for (const badge of this.input.persistentBadges) {
            // Skip drawing if badge is outside visible canvas
            if (badge.screenX < -20 || badge.screenX > this.viewport.width + 20 ||
                badge.screenY < -20 || badge.screenY > this.viewport.height + 20) {
                continue;
            }
            
            // Get the function(s) for this badge (for proper pi fraction formatting)
            let func = null;
            let func2 = null;
            
            if (badge.functionId) {
                // Regular badge (trace, turning point, intercept)
                func = this.findFunctionById(badge.functionId);
            } else if (badge.func1Id && badge.func2Id) {
                // Intersection badge - get both functions
                func = this.findFunctionById(badge.func1Id);
                func2 = this.findFunctionById(badge.func2Id);
            }
            
            // Check if this badge is being held (for visual feedback)
            const isBeingHeld = this.input.badgeInteraction.targetBadge && 
                               this.input.badgeInteraction.targetBadge.id === badge.id;
            
            // Determine integral limit type if this is an integral badge
            let integralLimitType = null;
            if (badge.hasIntegral) {
                const pair = this.integralPairs.find(p => p.badge1Id === badge.id || p.badge2Id === badge.id);
                if (pair) {
                    integralLimitType = pair.badge1Id === badge.id ? 'lower' : 'upper';
                }
            }
            
            // Draw the persistent badge with hold indication
            // For polar functions, pass theta instead of worldX for proper display
            const displayX = (func && this.plotMode === 'polar' && badge.theta !== null && badge.theta !== undefined) 
                ? badge.theta 
                : badge.worldX;
            
            this.drawTracingBadge(badge.screenX, badge.screenY, badge.functionColor, displayX, badge.worldY, false, isBeingHeld, badge.customText, badge.badgeType, badge.hasTangent, badge.hasNormal, badge.hasIntegral, badge.neonIntegral, badge.tangentSlope, badge.secondDerivative, func, func2, integralLimitType);
        }
        
        // Draw badge tooltip (after all badges so it appears on top)
        this.drawBadgeTooltip();
    }
    
    drawPolarThetaHint(theta) {
        // Draw a subtle hint at the bottom of the screen showing how to adjust theta
        this.ctx.save();
        
        // Format theta value based on angle mode
        let thetaDisplay;
        if (this.angleMode === 'degrees') {
            const degrees = theta * 180 / Math.PI;
            thetaDisplay = `θ = ${degrees.toFixed(1)}°`;
        } else {
            thetaDisplay = `θ = ${theta.toFixed(3)}`;
        }
        
        // Position at bottom center
        const x = this.viewport.width / 2;
        const y = this.viewport.height - 30;
        
        // Semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.font = '14px Inter, system-ui, sans-serif';
        const text = `← Drag horizontally to adjust ${thetaDisplay} →`;
        const metrics = this.ctx.measureText(text);
        const padding = 12;
        
        this.ctx.fillRect(
            x - metrics.width / 2 - padding,
            y - 10 - padding,
            metrics.width + padding * 2,
            20 + padding * 2
        );
        
        // Draw text
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
        
        this.ctx.restore();
    }
    
    drawTangentLine(badge) {
        if (!badge.hasTangent || badge.tangentSlope === null) return;
        
        this.ctx.save();
        
        // Use neon pulsating colors if neonTangent is true, otherwise use function color
        if (badge.neonTangent) {
            // Pulsating neon effect - smooth color cycling like polar radar sweep
            const time = Date.now() / 1000; // Convert to seconds
            const pulseSpeed = 2; // Slower pulse for smoother color transition
            
            // Create color cycling effect through neon colors (hot pink, cyan, lime, orange)
            const colorPhase = (Math.sin(time * pulseSpeed) + 1) / 2; // 0 to 1
            let neonColor;
            
            if (colorPhase < 0.25) {
                // Hot pink to cyan
                const t = colorPhase / 0.25;
                neonColor = `rgba(${Math.floor(255 * (1 - t) + 0 * t)}, ${Math.floor(20 * (1 - t) + 255 * t)}, ${Math.floor(147 * (1 - t) + 255 * t)}, 0.8)`;
            } else if (colorPhase < 0.5) {
                // Cyan to lime
                const t = (colorPhase - 0.25) / 0.25;
                neonColor = `rgba(${Math.floor(0 * (1 - t) + 57 * t)}, ${255}, ${Math.floor(255 * (1 - t) + 255 * t)}, 0.8)`;
            } else if (colorPhase < 0.75) {
                // Lime to orange
                const t = (colorPhase - 0.5) / 0.25;
                neonColor = `rgba(${Math.floor(57 * (1 - t) + 255 * t)}, ${Math.floor(255 * (1 - t) + 165 * t)}, ${Math.floor(255 * (1 - t) + 0 * t)}, 0.8)`;
            } else {
                // Orange to hot pink
                const t = (colorPhase - 0.75) / 0.25;
                neonColor = `rgba(${255}, ${Math.floor(165 * (1 - t) + 20 * t)}, ${Math.floor(0 * (1 - t) + 147 * t)}, 0.8)`;
            }
            
            this.ctx.strokeStyle = neonColor;
            this.ctx.lineWidth = 3; // Thicker for neon effect
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = neonColor;
        } else {
            // Use function color with transparency
            this.ctx.strokeStyle = badge.functionColor;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.8;
        }
        
        this.ctx.setLineDash([10, 5]); // Dashed line pattern
        
        // Calculate the line equation: y - y0 = m(x - x0)
        // Rearranged: y = m*x + (y0 - m*x0)
        const slope = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
        const x0 = badge.worldX;
        const y0 = badge.worldY;
        const intercept = y0 - slope * x0;
        
        // Find the points where the tangent line intersects the viewport edges
        const minX = this.viewport.minX;
        const maxX = this.viewport.maxX;
        const minY = this.viewport.minY;
        const maxY = this.viewport.maxY;
        
        // Calculate y values at viewport left and right edges
        const y_at_minX = slope * minX + intercept;
        const y_at_maxX = slope * maxX + intercept;
        
        // Determine which edges the line crosses
        let startX, startY, endX, endY;
        
        // For nearly horizontal lines (small slope)
        if (Math.abs(slope) < 1e10) {
            startX = minX;
            startY = y_at_minX;
            endX = maxX;
            endY = y_at_maxX;
            
            // Clip to viewport Y bounds
            if (startY < minY) {
                startX = (minY - intercept) / slope;
                startY = minY;
            } else if (startY > maxY) {
                startX = (maxY - intercept) / slope;
                startY = maxY;
            }
            
            if (endY < minY) {
                endX = (minY - intercept) / slope;
                endY = minY;
            } else if (endY > maxY) {
                endX = (maxY - intercept) / slope;
                endY = maxY;
            }
        } else {
            // For nearly vertical lines (large slope)
            startX = (minY - intercept) / slope;
            startY = minY;
            endX = (maxY - intercept) / slope;
            endY = maxY;
        }
        
        // Convert to screen coordinates
        const startScreen = this.worldToScreen(startX, startY);
        const endScreen = this.worldToScreen(endX, endY);
        
        // Draw the tangent line
        this.ctx.beginPath();
        this.ctx.moveTo(startScreen.x, startScreen.y);
        this.ctx.lineTo(endScreen.x, endScreen.y);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawNormalLine(badge) {
        if (!badge.hasNormal || badge.tangentSlope === null) return;
        
        this.ctx.save();
        
        // Use neon pulsating colors if neonNormal is true, otherwise use function color
        if (badge.neonNormal) {
            // Pulsating neon effect - same as tangent
            const time = Date.now() / 1000;
            const pulseSpeed = 2;
            
            const colorPhase = (Math.sin(time * pulseSpeed) + 1) / 2;
            let neonColor;
            
            if (colorPhase < 0.25) {
                const t = colorPhase / 0.25;
                neonColor = `rgba(${Math.floor(255 * (1 - t) + 0 * t)}, ${Math.floor(20 * (1 - t) + 255 * t)}, ${Math.floor(147 * (1 - t) + 255 * t)}, 0.8)`;
            } else if (colorPhase < 0.5) {
                const t = (colorPhase - 0.25) / 0.25;
                neonColor = `rgba(${Math.floor(0 * (1 - t) + 57 * t)}, ${255}, ${Math.floor(255 * (1 - t) + 255 * t)}, 0.8)`;
            } else if (colorPhase < 0.75) {
                const t = (colorPhase - 0.5) / 0.25;
                neonColor = `rgba(${Math.floor(57 * (1 - t) + 255 * t)}, ${Math.floor(255 * (1 - t) + 165 * t)}, ${Math.floor(255 * (1 - t) + 0 * t)}, 0.8)`;
            } else {
                const t = (colorPhase - 0.75) / 0.25;
                neonColor = `rgba(${255}, ${Math.floor(165 * (1 - t) + 20 * t)}, ${Math.floor(0 * (1 - t) + 147 * t)}, 0.8)`;
            }
            
            this.ctx.strokeStyle = neonColor;
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = neonColor;
        } else {
            // Use function color with transparency
            this.ctx.strokeStyle = badge.functionColor;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.8;
        }
        
        this.ctx.setLineDash([5, 5]); // Different dash pattern from tangent
        
        // Calculate the normal line (perpendicular to tangent)
        // Use EXACTLY the same slope extraction as tangent line
        const slope = badge.tangentSlope.slope !== undefined ? badge.tangentSlope.slope : badge.tangentSlope;
        
        let normalSlope;
        
        if (Math.abs(slope) < 1e-10) {
            // Tangent is horizontal, normal is vertical
            normalSlope = Infinity;
        } else if (Math.abs(slope) > 1e10) {
            // Tangent is vertical, normal is horizontal
            normalSlope = 0;
        } else {
            // Normal case: perpendicular slope is simply -1/slope
            normalSlope = -1 / slope;
        }
        
        const x0 = badge.worldX;
        const y0 = badge.worldY;
        const intercept = y0 - normalSlope * x0;
        
        const minX = this.viewport.minX;
        const maxX = this.viewport.maxX;
        const minY = this.viewport.minY;
        const maxY = this.viewport.maxY;
        
        let startX, startY, endX, endY;
        
        if (normalSlope === Infinity || normalSlope === -Infinity) {
            // Vertical normal line
            startX = x0;
            startY = minY;
            endX = x0;
            endY = maxY;
        } else if (Math.abs(normalSlope) < 1e10) {
            // Non-vertical normal line
            const y_at_minX = normalSlope * minX + intercept;
            const y_at_maxX = normalSlope * maxX + intercept;
            
            startX = minX;
            startY = y_at_minX;
            endX = maxX;
            endY = y_at_maxX;
            
            // Clip to viewport Y bounds
            if (startY < minY) {
                startX = (minY - intercept) / normalSlope;
                startY = minY;
            } else if (startY > maxY) {
                startX = (maxY - intercept) / normalSlope;
                startY = maxY;
            }
            
            if (endY < minY) {
                endX = (minY - intercept) / normalSlope;
                endY = minY;
            } else if (endY > maxY) {
                endX = (maxY - intercept) / normalSlope;
                endY = maxY;
            }
        } else {
            // Nearly vertical normal line
            startX = (minY - intercept) / normalSlope;
            startY = minY;
            endX = (maxY - intercept) / normalSlope;
            endY = maxY;
        }
        
        // Convert to screen coordinates
        const startScreen = this.worldToScreen(startX, startY);
        const endScreen = this.worldToScreen(endX, endY);
        
        // Draw the normal line
        this.ctx.beginPath();
        this.ctx.moveTo(startScreen.x, startScreen.y);
        this.ctx.lineTo(endScreen.x, endScreen.y);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawTracingBadge(screenX, screenY, color, worldX, worldY, isActive = false, isBeingHeld = false, customText = null, badgeType = null, hasTangent = false, hasNormal = false, hasIntegral = false, neonIntegral = false, tangentSlope = null, secondDerivative = null, func = null, func2 = null, integralLimitType = null) {
        // Draw the circle indicator
        this.ctx.save();
        
        // Circle - use function color, slightly larger for active tracing or being held
        let radius = 8;
        if (isActive) radius = 10;
        if (isBeingHeld) radius = 9;
        
        this.ctx.strokeStyle = isBeingHeld ? '#FFD700' : '#FFFFFF'; // Gold border when being held
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = isBeingHeld ? 3 : 2; // Thicker border when being held
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Inner dot - slightly larger when being held
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, isBeingHeld ? 3 : 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw integral symbol if badge has integral
        if (hasIntegral) {
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';
            
            if (neonIntegral) {
                // Add glow effect for neon mode
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = color;
            }
            
            this.ctx.fillText('∫', screenX, screenY);
            this.ctx.shadowBlur = 0; // Reset shadow
        }
        
        // Coordinate label with background
        let labelText;
        if (customText) {
            labelText = customText;
        } else if (hasIntegral && integralLimitType) {
            // Integral badge with a pair - show integral symbol, coordinate, and limit type
            if (this.plotMode === 'polar') {
                // For polar mode, show theta value
                const thetaSymbol = this.angleMode === 'degrees' ? 'θ' : 'θ';
                let thetaValue;
                
                if (this.angleMode === 'degrees') {
                    const thetaDegrees = worldX * 180 / Math.PI;
                    thetaValue = this.formatCoordinate(thetaDegrees) + '°';
                } else {
                    // Try to format as pi fraction
                    const piFraction = this.formatAsPiFraction(worldX);
                    thetaValue = piFraction || this.formatCoordinate(worldX);
                }
                
                const limitLabel = integralLimitType === 'lower' ? 'L' : 'U';
                labelText = `∫ | ${thetaSymbol}=${thetaValue} | ${limitLabel}`;
            } else {
                // For cartesian mode, show x value
                const xValue = func ? this.formatCoordinate(worldX, func, true, false) : worldX.toFixed(3);
                const limitLabel = integralLimitType === 'lower' ? 'L' : 'U';
                labelText = `∫ | x=${xValue} | ${limitLabel}`;
            }
        } else if (hasIntegral && !integralLimitType) {
            // Integral badge without a pair - show message to add second badge
            labelText = `∫ | Add 2nd marker`;
        } else if (badgeType) {
            // Badge with type-specific label
            const coords = this.formatCoordinates(worldX, worldY, func, func2);
            switch (badgeType) {
                case 'maximum':
                    labelText = `Local Maximum: ${coords}`;
                    break;
                case 'minimum':
                    labelText = `Local Minimum: ${coords}`;
                    break;
                case 'intersection':
                    // Intersection badges show only coordinates
                    labelText = coords;
                    break;
                default:
                    // Fallback for any unknown badge types - just show coordinates
                    labelText = coords;
            }
        } else if (isActive) {
            // Active tracing badge
            labelText = this.formatCoordinates(worldX, worldY, func);
        } else {
            // Regular badge (intersections, etc.)
            labelText = this.formatCoordinates(worldX, worldY, func);
        }
        
        // Add derivative information if tangent is present
        if (hasTangent && tangentSlope !== null) {
            // For polar mode, display dr/dθ; for Cartesian mode, display dy/dx
            if (this.plotMode === 'polar' && tangentSlope.polarDerivative !== undefined) {
                // Display polar derivative dr/dθ
                const polarDerivStr = this.formatDerivative(tangentSlope.polarDerivative);
                const thetaSymbol = this.angleMode === 'degrees' ? 'θ' : 'θ';
                labelText += ` | dr/d${thetaSymbol}=${polarDerivStr}`;
            } else {
                // Display Cartesian slope dy/dx
                const slopeValue = tangentSlope.slope !== undefined ? tangentSlope.slope : tangentSlope;
                
                // If in degree mode with trig functions, convert derivative back to standard mathematical form
                let displaySlope = slopeValue;
                if (this.angleMode === 'degrees' && tangentSlope.method === 'symbolic') {
                    // Multiply by 180/π to convert from per-degree to per-radian derivative
                    displaySlope = slopeValue * 180 / Math.PI;
                }
                
                let slopeStr;
                if (Math.abs(displaySlope) > 100) {
                    slopeStr = displaySlope > 0 ? '∞' : '-∞';
                } else {
                    slopeStr = this.formatDerivative(displaySlope);
                }
                labelText += ` | dy/dx=${slopeStr}`;
                
                // Add second derivative if available
                const secondDeriv = tangentSlope.secondDerivative !== undefined ? tangentSlope.secondDerivative : secondDerivative;
                if (secondDeriv !== null && isFinite(secondDeriv)) {
                    // Second derivative needs (180/π)² conversion
                    let displaySecondDeriv = secondDeriv;
                    if (this.angleMode === 'degrees' && tangentSlope.method === 'symbolic') {
                        displaySecondDeriv = secondDeriv * Math.pow(180 / Math.PI, 2);
                    }
                    const secondDerivStr = this.formatDerivative(displaySecondDeriv);
                    labelText += ` | d²y/dx²=${secondDerivStr}`;
                }
            }
        }
        
        // Add derivative information if normal is present (same as tangent)
        if (hasNormal && tangentSlope !== null) {
            // For polar mode, display dr/dθ; for Cartesian mode, display dy/dx
            if (this.plotMode === 'polar' && tangentSlope.polarDerivative !== undefined) {
                // Display polar derivative dr/dθ
                const polarDerivStr = this.formatDerivative(tangentSlope.polarDerivative);
                const thetaSymbol = this.angleMode === 'degrees' ? 'θ' : 'θ';
                labelText += ` | dr/d${thetaSymbol}=${polarDerivStr}`;
            } else {
                // Display Cartesian slope dy/dx
                const slopeValue = tangentSlope.slope !== undefined ? tangentSlope.slope : tangentSlope;
                
                // If in degree mode with trig functions, convert derivative back to standard mathematical form
                let displaySlope = slopeValue;
                if (this.angleMode === 'degrees' && tangentSlope.method === 'symbolic') {
                    // Multiply by 180/π to convert from per-degree to per-radian derivative
                    displaySlope = slopeValue * 180 / Math.PI;
                }
                
                let slopeStr;
                if (Math.abs(displaySlope) > 100) {
                    slopeStr = displaySlope > 0 ? '∞' : '-∞';
                } else {
                    slopeStr = this.formatDerivative(displaySlope);
                }
                labelText += ` | dy/dx=${slopeStr}`;
                
                // Add second derivative if available
                const secondDeriv = tangentSlope.secondDerivative !== undefined ? tangentSlope.secondDerivative : secondDerivative;
                if (secondDeriv !== null && isFinite(secondDeriv)) {
                    // Second derivative needs (180/π)² conversion
                    let displaySecondDeriv = secondDeriv;
                    if (this.angleMode === 'degrees' && tangentSlope.method === 'symbolic') {
                        displaySecondDeriv = secondDeriv * Math.pow(180 / Math.PI, 2);
                    }
                    const secondDerivStr = this.formatDerivative(displaySecondDeriv);
                    labelText += ` | d²y/dx²=${secondDerivStr}`;
                }
            }
        }
        
        this.ctx.font = '16px Arial, sans-serif'; // Larger font for classroom visibility
        const textMetrics = this.ctx.measureText(labelText);
        const textWidth = textMetrics.width;
        const textHeight = 16; // Updated to match font size
        
        // Position label to avoid overlapping with the circle
        const labelX = screenX + 15;
        const labelY = screenY - 10;
        
        // Background rectangle - solid color matching the function
        const padding = 6; // Increased padding for larger text
        
        this.ctx.fillStyle = color; // Use function color for solid background
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(
            labelX - padding, 
            labelY - textHeight - padding, 
            textWidth + 2 * padding, 
            textHeight + 2 * padding, 
            3
        );
        this.ctx.fill();
        
        // Text - position inside the background rectangle with proper alignment
        this.ctx.fillStyle = this.getContrastingTextColor(color); // Dynamic text color for optimal contrast
        this.ctx.textAlign = 'left'; // Ensure consistent horizontal alignment
        this.ctx.textBaseline = 'top'; // Set baseline to top for consistent positioning
        this.ctx.fillText(labelText, labelX, labelY - textHeight);
        
        this.ctx.restore();
    }
    
    
    // ================================
    // BADGE TOOLTIP SYSTEM
    // ================================
    
    showBadgeTooltip(text, screenX, screenY) {
        // Dismiss any existing tooltip
        this.badgeTooltip.active = false;
        
        // Show new tooltip
        this.badgeTooltip.active = true;
        this.badgeTooltip.text = text;
        this.badgeTooltip.x = screenX;
        this.badgeTooltip.y = screenY - 50; // Position above the badge (moved from +40 to -50)
        this.badgeTooltip.opacity = 1.0;
        this.badgeTooltip.startTime = Date.now();
    }
    
    updateBadgeTooltip() {
        if (!this.badgeTooltip.active) return;
        
        const elapsed = Date.now() - this.badgeTooltip.startTime;
        
        if (elapsed >= this.badgeTooltip.displayDuration) {
            // Tooltip has fully faded out
            this.badgeTooltip.active = false;
        } else if (elapsed >= (this.badgeTooltip.displayDuration - this.badgeTooltip.fadeDuration)) {
            // Start fading
            const fadeProgress = (elapsed - (this.badgeTooltip.displayDuration - this.badgeTooltip.fadeDuration)) / this.badgeTooltip.fadeDuration;
            this.badgeTooltip.opacity = 1.0 - fadeProgress;
        }
    }
    
    drawBadgeTooltip() {
        if (!this.badgeTooltip.active || this.badgeTooltip.opacity <= 0) return;
        
        this.ctx.save();
        this.ctx.globalAlpha = this.badgeTooltip.opacity;
        
        // Measure text
        this.ctx.font = '13px Inter, system-ui, sans-serif';
        const metrics = this.ctx.measureText(this.badgeTooltip.text);
        const padding = 8;
        const height = 24;
        const width = metrics.width + padding * 2;
        
        // Draw background
        this.ctx.fillStyle = 'rgba(42, 63, 90, 0.95)';
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.5)';
        this.ctx.lineWidth = 1;
        
        const x = this.badgeTooltip.x - width / 2;
        const y = this.badgeTooltip.y;
        
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, 4);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw text
        this.ctx.fillStyle = '#E8F4FD';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.badgeTooltip.text, this.badgeTooltip.x, y + height / 2);
        
        this.ctx.restore();
    }
    
    // Start tracing mode at a specific world position
    startTracingAtWorldPosition(worldX, worldY, targetFunction) {
        this.input.tracing.active = true;
        this.input.tracing.functionId = targetFunction.id;
        this.input.tracing.worldX = worldX;
        this.input.tracing.worldY = worldY;
    }
    
    // Legacy method kept for compatibility - now redirects to new methods
    drawTracingIndicator() {
        this.drawActiveTracingIndicator();
        this.drawPersistentBadges();
    }
    
    
    formatCoordinates(worldX, worldY, func = null, func2 = null) {
        // If specific function(s) are provided, check if THEY contain trig functions
        // For intersections, check if EITHER function has trig
        // In polar mode, always use pi fractions for theta (angles are inherently related to pi)
        // Otherwise fall back to global check (for grid labels, etc.)
        let shouldUsePiFractions, shouldUseCommonValues;
        
        if (this.plotMode === 'polar') {
            // In polar mode, always show pi fractions for theta (if in radians)
            shouldUsePiFractions = this.angleMode === 'radians';
            shouldUseCommonValues = true; // Also check common values for r
        } else {
            const trigRegex = /\\?(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sec|csc|cot|asec|acsc|acot|sech|csch|coth)(\s*\(|\\left\()|\\operatorname\{\\mathrm\{(arc)?(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|sech|csch|coth)\}\}/i;
            
            if (func && func.expression) {
                // Check if the primary function contains trig
                let funcHasTrig = trigRegex.test(func.expression);
                
                // For intersections, also check second function
                if (func2 && func2.expression && !funcHasTrig) {
                    funcHasTrig = trigRegex.test(func2.expression);
                }
                
                shouldUsePiFractions = this.angleMode === 'radians' && funcHasTrig;
                shouldUseCommonValues = funcHasTrig;
            } else {
                // Fall back to global check (for when func is not provided)
                shouldUsePiFractions = this.angleMode === 'radians' && this.containsTrigFunctions();
                shouldUseCommonValues = this.containsTrigFunctions();
            }
        }
        
        if (this.plotMode === 'polar') {
            // Convert cartesian coordinates back to polar for display
            const r = Math.sqrt(worldX * worldX + worldY * worldY);
            let theta = Math.atan2(worldY, worldX);
            
            // Normalize theta to 0-2π range
            if (theta < 0) theta += 2 * Math.PI;
            
            // Format based on angle mode
            if (this.angleMode === 'degrees') {
                const thetaDegrees = theta * 180 / Math.PI;
                // Try to format r as common value
                let rStr;
                if (shouldUseCommonValues) {
                    const commonValue = this.formatAsCommonValue(r);
                    rStr = commonValue || this.formatCoordinate(r);
                } else {
                    rStr = this.formatCoordinate(r);
                }
                return `(${rStr}, ${this.formatCoordinate(thetaDegrees)}°)`;
            } else {
                // Try to format r as common value
                let rStr;
                if (shouldUseCommonValues) {
                    const commonValue = this.formatAsCommonValue(r);
                    rStr = commonValue || this.formatCoordinate(r);
                } else {
                    rStr = this.formatCoordinate(r);
                }
                // Try to format theta as pi fraction if appropriate
                let thetaStr;
                if (shouldUsePiFractions) {
                    const piFraction = this.formatAsPiFraction(theta);
                    thetaStr = piFraction || this.formatCoordinate(theta);
                } else {
                    thetaStr = this.formatCoordinate(theta);
                }
                return `(${rStr}, ${thetaStr})`;
            }
        } else {
            // Cartesian mode - try to format x as pi fraction if appropriate
            let xStr;
            if (shouldUsePiFractions) {
                const piFraction = this.formatAsPiFraction(worldX);
                xStr = piFraction || this.formatCoordinate(worldX);
            } else {
                xStr = this.formatCoordinate(worldX);
            }
            // Try to format y as common value
            let yStr;
            if (shouldUseCommonValues) {
                const commonValue = this.formatAsCommonValue(worldY);
                yStr = commonValue || this.formatCoordinate(worldY);
            } else {
                yStr = this.formatCoordinate(worldY);
            }
            return `(${xStr}, ${yStr})`;
        }
    }

    getContrastingTextColor(backgroundColor) {
        // Convert hex color to RGB
        let r, g, b;
        
        // Handle different color formats
        if (backgroundColor.startsWith('#')) {
            // Hex format
            const hex = backgroundColor.substring(1);
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        } else if (backgroundColor.startsWith('rgb')) {
            // RGB format
            const matches = backgroundColor.match(/\d+/g);
            if (matches && matches.length >= 3) {
                r = parseInt(matches[0]);
                g = parseInt(matches[1]);
                b = parseInt(matches[2]);
            }
        }
        
        // If we couldn't parse the color, default to white text
        if (r === undefined || g === undefined || b === undefined) {
            return '#FFFFFF';
        }
        
        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Return white text for dark backgrounds, black text for light backgrounds
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    formatCoordinate(value) {
        // Format coordinate values for display - never use scientific notation
        // Use context-aware precision based on current viewport scale
        
        // Get the current viewport range to determine appropriate precision
        const currentViewport = this.plotMode === 'cartesian' ? this.cartesianViewport : this.polarViewport;
        const xRange = currentViewport.maxX - currentViewport.minX;
        const yRange = currentViewport.maxY - currentViewport.minY;
        const typicalRange = Math.max(xRange, yRange);
        
        // Calculate precision based on viewport scale
        // For large ranges, we need fewer decimal places
        // For small ranges, we need more decimal places
        let precision;
        if (typicalRange >= 1000) {
            precision = 0; // No decimal places for very large scales
        } else if (typicalRange >= 100) {
            precision = 1; // 1 decimal place
        } else if (typicalRange >= 10) {
            precision = 2; // 2 decimal places
        } else if (typicalRange >= 1) {
            precision = 3; // 3 decimal places
        } else if (typicalRange >= 0.1) {
            precision = 4; // 4 decimal places
        } else if (typicalRange >= 0.01) {
            precision = 5; // 5 decimal places
        } else if (typicalRange >= 0.001) {
            precision = 6; // 6 decimal places
        } else if (typicalRange >= 0.0001) {
            precision = 7; // 7 decimal places
        } else {
            precision = 8; // Maximum 8 decimal places for very fine scales
        }
        
        // Zero threshold based on precision - if number is too small relative to scale, show as zero
        const zeroThreshold = Math.pow(10, -(precision + 3)); // 3 orders of magnitude below precision
        if (Math.abs(value) < zeroThreshold) return '0';
        
        // Handle large numbers with suffixes (only for very large numbers)
        if (Math.abs(value) >= 1000000) {
            return (value / 1000000).toFixed(Math.max(0, precision - 3)) + 'M';
        }
        if (Math.abs(value) >= 1000 && typicalRange >= 1000) {
            return (value / 1000).toFixed(Math.max(0, precision)) + 'k';
        }
        
        // Use context-aware precision for all numbers
        const formatted = value.toFixed(precision);
        
        // If all decimal places are zeros, display as integer
        // e.g. "2.00" becomes "2", but "2.01" stays "2.01"
        if (precision > 0 && formatted.includes('.')) {
            const [integerPart, decimalPart] = formatted.split('.');
            if (decimalPart.match(/^0+$/)) {
                return integerPart;
            }
        }
        
        return formatted;
    }
    
    formatDerivative(value) {
        // Format derivative values for display - independent of viewport scale
        // Derivatives can be very small, so use fixed precision based on magnitude
        
        if (!isFinite(value)) return '0';
        
        const absValue = Math.abs(value);
        
        // Zero threshold - truly tiny values
        if (absValue < 1e-10) return '0';
        
        // Determine precision based on the magnitude of the derivative itself
        let precision;
        if (absValue >= 100) {
            precision = 1; // Large derivatives
        } else if (absValue >= 10) {
            precision = 2;
        } else if (absValue >= 1) {
            precision = 3;
        } else if (absValue >= 0.1) {
            precision = 4;
        } else if (absValue >= 0.01) {
            precision = 5;
        } else if (absValue >= 0.001) {
            precision = 6;
        } else {
            // For very small derivatives, use scientific notation
            return value.toExponential(2);
        }
        
        const formatted = value.toFixed(precision);
        
        // Remove trailing zeros after decimal point
        if (formatted.includes('.')) {
            return formatted.replace(/\.?0+$/, '');
        }
        
        return formatted;
    }
    
    snapCoordinateForDisplay(value) {
        // Snap coordinate values to zero if they're very small
        // This matches the logic in formatCoordinate() but returns a number instead of a string
        // Used to ensure marker positions and stored badge coordinates match displayed values
        
        const currentViewport = this.plotMode === 'cartesian' ? this.cartesianViewport : this.polarViewport;
        const xRange = currentViewport.maxX - currentViewport.minX;
        const yRange = currentViewport.maxY - currentViewport.minY;
        const typicalRange = Math.max(xRange, yRange);
        
        // Calculate precision based on viewport scale (same as formatCoordinate)
        let precision;
        if (typicalRange >= 1000) {
            precision = 0;
        } else if (typicalRange >= 100) {
            precision = 1;
        } else if (typicalRange >= 10) {
            precision = 2;
        } else if (typicalRange >= 1) {
            precision = 3;
        } else if (typicalRange >= 0.1) {
            precision = 4;
        } else if (typicalRange >= 0.01) {
            precision = 5;
        } else if (typicalRange >= 0.001) {
            precision = 6;
        } else if (typicalRange >= 0.0001) {
            precision = 7;
        } else {
            precision = 8;
        }
        
        // Zero threshold - same as formatCoordinate
        const zeroThreshold = Math.pow(10, -(precision + 3));
        if (Math.abs(value) < zeroThreshold) return 0;
        
        return value;
    }
    
    drawPerformanceOverlay() {
        const padding = 10;
        const lineHeight = 20;
        const overlayWidth = 260;
        const overlayHeight = 120 + (this.performance.plotTimes.size * lineHeight);
        
        // Position at top-right corner
        const x = this.viewport.width - overlayWidth - padding;
        let y = padding + lineHeight;
        
        // Save context state
        this.ctx.save();
        
        // Semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(x, padding, overlayWidth, overlayHeight);
        
        // Set text alignment to left
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // Title
        this.ctx.fillStyle = '#00FF00';
        this.ctx.font = 'bold 14px monospace';
        this.ctx.fillText('Performance Monitor', x + 10, y);
        y += lineHeight + 5;
        
        // FPS
        this.ctx.fillStyle = this.performance.fps >= 30 ? '#00FF00' : '#FF0000';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`FPS: ${this.performance.fps}`, x + 10, y);
        y += lineHeight;
        
        // Total points rendered
        const totalPoints = this.getCurrentFunctions()
            .filter(f => f.enabled && f.points)
            .reduce((sum, f) => sum + (f.points.length || 0), 0);
        this.ctx.fillStyle = '#00FF00';
        this.ctx.fillText(`Points: ${totalPoints.toLocaleString()}`, x + 10, y);
        y += lineHeight;
        
        // Intersection time
        if (this.performance.intersectionTime > 0) {
            this.ctx.fillStyle = '#FFFF00';
            this.ctx.fillText(`Intersections: ${this.performance.intersectionTime.toFixed(1)}ms`, x + 10, y);
            y += lineHeight;
        }
        
        // Plot times per function
        if (this.performance.plotTimes.size > 0) {
            this.ctx.fillStyle = '#AAAAAA';
            this.ctx.fillText('Plot Times:', x + 10, y);
            y += lineHeight;
            
            const functions = this.getCurrentFunctions();
            for (const [funcId, time] of this.performance.plotTimes) {
                const func = functions.find(f => f.id === funcId);
                if (func) {
                    const funcName = func.expression.substring(0, 12) + (func.expression.length > 12 ? '...' : '');
                    const color = time > 50 ? '#FF0000' : time > 20 ? '#FFFF00' : '#00FF00';
                    this.ctx.fillStyle = color;
                    this.ctx.fillText(`  ${funcName}: ${time.toFixed(1)}ms`, x + 10, y);
                    y += lineHeight;
                }
            }
        }
        
        // Restore context state
        this.ctx.restore();
    }

    drawPolarAnimationCoordinates() {
        // Safety check: ensure polarAnimation exists
        if (!this.polarAnimation) {
            return;
        }
        
        // Get CSS variables for theme-aware colors
        const bgColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--animation-coord-bg').trim();
        const borderColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--animation-coord-border').trim();
        const textColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--animation-coord-text').trim();
        
        const currentTheta = this.polarAnimation.currentTheta;
        
        // Format theta based on angle mode
        // Note: currentTheta is already in the user's chosen unit system (degrees or radians)
        let thetaDisplay;
        let thetaLabel;
        if (this.angleMode === 'degrees') {
            // currentTheta is already in degrees, no conversion needed
            thetaDisplay = currentTheta.toFixed(1) + '°';
            thetaLabel = 'θ';
        } else {
            thetaDisplay = currentTheta.toFixed(3);
            thetaLabel = 'θ';
        }
        
        // Format text
        const thetaText = `${thetaLabel} = ${thetaDisplay}`;
        
        this.ctx.save();
        
        // Set font and measure text
        const fontSize = 14;
        const fontFamily = 'Arial, sans-serif';
        this.ctx.font = `${fontSize}px ${fontFamily}`;
        
        const textWidth = this.ctx.measureText(thetaText).width;
        
        // Position in bottom right corner with padding
        const padding = 15;
        const innerPadding = 10;
        const boxWidth = textWidth + (innerPadding * 2);
        const boxHeight = fontSize + (innerPadding * 2);
        const x = this.viewport.width - boxWidth - padding;
        const y = this.viewport.height - boxHeight - padding;
        
        // Draw background box with border
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(x, y, boxWidth, boxHeight);
        
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, boxWidth, boxHeight);
        
        // Draw text
        this.ctx.fillStyle = textColor;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        this.ctx.fillText(thetaText, x + innerPadding, y + innerPadding);
        
        this.ctx.restore();
    }
    
    drawPolarAnimationPoint() {
        // Safety check: ensure polarAnimation exists
        if (!this.polarAnimation) {
            return;
        }
        
        const currentTheta = this.polarAnimation.currentTheta;
        
        // Convert theta to radians for calculation (regardless of display mode)
        const thetaRad = this.angleMode === 'degrees' ? currentTheta * Math.PI / 180 : currentTheta;
        
        this.ctx.save();
        
        // Draw a pulsating point at the current position for each polar function
        const polarFuncs = this.getCurrentFunctions();
        
        polarFuncs.forEach(func => {
            if (!func.enabled || !func.expression || func.expression.trim() === '') {
                return;
            }
            
            try {
                // Evaluate r at current theta
                let r;
                if (func.expression.includes('theta=') || func.expression.includes('θ=')) {
                    // For theta = constant functions, skip drawing point (it's a line)
                    return;
                } else {
                    // Standard r = f(theta) function
                    // Process expression the same way as plotPolarFunction does
                    let processedExpression = this.convertFromLatex(func.expression).trim();
                    if (processedExpression.toLowerCase().startsWith('r=')) {
                        processedExpression = processedExpression.substring(2).trim();
                    }
                    processedExpression = processedExpression.toLowerCase();
                    
                    // Add implicit multiplication
                    processedExpression = processedExpression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
                    processedExpression = processedExpression.replace(/(\))([a-zA-Z])/g, '$1*$2');
                    
                    const scope = { 
                        theta: thetaRad, 
                        t: thetaRad,
                        pi: Math.PI,
                        e: Math.E
                    };
                    const compiled = this.getCompiledExpression(processedExpression);
                    const result = compiled.evaluate(scope);
                    r = typeof result === 'number' ? result : (result.re !== undefined ? result.re : NaN);
                }
                
                if (isNaN(r) || !isFinite(r)) {
                    return;
                }
                
                // Convert polar to cartesian
                const x = r * Math.cos(thetaRad);
                const y = r * Math.sin(thetaRad);
                
                // Convert to screen coordinates
                const screenPos = this.worldToScreen(x, y);
                
                // Create pulsating effect using timestamp
                const pulseSpeed = 3; // Speed of pulsation
                const minRadius = 4;
                const maxRadius = 8;
                const pulseRadius = minRadius + (maxRadius - minRadius) * 
                    (0.5 + 0.5 * Math.sin(Date.now() * pulseSpeed / 1000));
                
                // Draw outer glow
                const gradient = this.ctx.createRadialGradient(
                    screenPos.x, screenPos.y, 0,
                    screenPos.x, screenPos.y, pulseRadius * 2
                );
                gradient.addColorStop(0, func.color);
                gradient.addColorStop(0.5, func.color + '88'); // Semi-transparent
                gradient.addColorStop(1, func.color + '00'); // Fully transparent
                
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, pulseRadius * 2, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Draw solid inner point
                this.ctx.fillStyle = func.color;
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, pulseRadius, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Draw bright center highlight
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, pulseRadius * 0.4, 0, Math.PI * 2);
                this.ctx.fill();
                
            } catch (error) {
                // Skip this function if evaluation fails
                return;
            }
        });
        
        this.ctx.restore();
    }
    
    drawPolarAnimationSweepLine() {
        // Safety check: ensure polarAnimation exists
        if (!this.polarAnimation) {
            return;
        }
        
        const currentTheta = this.polarAnimation.currentTheta;
        
        // Convert theta to radians for calculation (regardless of display mode)
        const thetaRad = this.angleMode === 'degrees' ? currentTheta * Math.PI / 180 : currentTheta;
        
        // Get the center point in screen coordinates
        const center = this.worldToScreen(0, 0);
        
        // Calculate the maximum radius needed to reach viewport edge
        const maxViewportRadius = Math.max(
            Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.minY * this.viewport.minY),
            Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.minY * this.viewport.minY),
            Math.sqrt(this.viewport.minX * this.viewport.minX + this.viewport.maxY * this.viewport.maxY),
            Math.sqrt(this.viewport.maxX * this.viewport.maxX + this.viewport.maxY * this.viewport.maxY)
        );
        
        // Calculate end point of sweep line
        const endX = center.x + maxViewportRadius * this.viewport.scale * Math.cos(thetaRad);
        const endY = center.y - maxViewportRadius * this.viewport.scale * Math.sin(thetaRad); // Negative because screen Y is flipped
        
        this.ctx.save();
        
        // Pulsating neon colors - cycle through vibrant street art style colors
        const time = Date.now() / 1000; // Convert to seconds
        const pulseSpeed = 2; // Slower pulse for smoother color transition
        
        // Create color cycling effect through neon colors (hot pink, cyan, lime, orange)
        const colorPhase = (Math.sin(time * pulseSpeed) + 1) / 2; // 0 to 1
        let neonColor;
        
        if (colorPhase < 0.25) {
            // Hot pink to cyan
            const t = colorPhase / 0.25;
            neonColor = `rgba(${Math.floor(255 * (1 - t) + 0 * t)}, ${Math.floor(20 * (1 - t) + 255 * t)}, ${Math.floor(147 * (1 - t) + 255 * t)}, `;
        } else if (colorPhase < 0.5) {
            // Cyan to lime
            const t = (colorPhase - 0.25) / 0.25;
            neonColor = `rgba(${Math.floor(0 * (1 - t) + 57 * t)}, ${255}, ${Math.floor(255 * (1 - t) + 255 * t)}, `;
        } else if (colorPhase < 0.75) {
            // Lime to orange
            const t = (colorPhase - 0.5) / 0.25;
            neonColor = `rgba(${Math.floor(57 * (1 - t) + 255 * t)}, ${Math.floor(255 * (1 - t) + 165 * t)}, ${Math.floor(255 * (1 - t) + 0 * t)}, `;
        } else {
            // Orange to hot pink
            const t = (colorPhase - 0.75) / 0.25;
            neonColor = `rgba(${255}, ${Math.floor(165 * (1 - t) + 20 * t)}, ${Math.floor(0 * (1 - t) + 147 * t)}, `;
        }
        
        // Draw the sweep line with a gradient fade effect for radar/sonar look
        const gradient = this.ctx.createLinearGradient(center.x, center.y, endX, endY);
        gradient.addColorStop(0, neonColor + '0.8)'); // Vibrant neon at origin
        gradient.addColorStop(0.7, neonColor + '0.4)'); // Fade to semi-transparent
        gradient.addColorStop(1, neonColor + '0)'); // Fully transparent at edge
        
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 3; // Slightly thicker for more presence
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    getGridSpacing() {
        const pixelsPerUnit = this.viewport.scale;
        
        // Target grid spacing: 20-80 pixels apart for optimal visibility
        const minPixelSpacing = 20;
        const maxPixelSpacing = 80;
        const idealPixelSpacing = 40;
        
        // Calculate ideal world spacing
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnit;
        
        // Generate list of "nice" spacing values
        const niceSpacings = [];
        
        // Add very small spacings for extreme zoom-in
        for (let exp = -6; exp <= 6; exp++) {
            const base = Math.pow(10, exp);
            niceSpacings.push(base, 2 * base, 5 * base);
        }
        
        // Sort the nice spacings
        niceSpacings.sort((a, b) => a - b);
        
        // Find the best spacing that keeps grid lines between min and max pixel spacing
        let bestSpacing = niceSpacings[0];
        let bestPixelSpacing = bestSpacing * pixelsPerUnit;
        
        for (const spacing of niceSpacings) {
            const pixelSpacing = spacing * pixelsPerUnit;
            
            // If this spacing is too small (lines too close), skip it
            if (pixelSpacing < minPixelSpacing) continue;
            
            // If this spacing is too large (lines too far apart), break
            if (pixelSpacing > maxPixelSpacing) break;
            
            // This spacing is in the acceptable range
            bestSpacing = spacing;
            bestPixelSpacing = pixelSpacing;
            
            // If we're close to ideal, use this one
            if (Math.abs(pixelSpacing - idealPixelSpacing) < Math.abs(bestPixelSpacing - idealPixelSpacing)) {
                bestSpacing = spacing;
                bestPixelSpacing = pixelSpacing;
            }
        }
        
        return bestSpacing;
    }
    
    getXGridSpacing() {
        // Calculate grid spacing specifically for X-axis based on X range
        const xRange = this.viewport.maxX - this.viewport.minX;
        const pixelsPerUnitX = this.viewport.width / xRange;
        
        // Target grid spacing: 20-80 pixels apart for optimal visibility
        const minPixelSpacing = 20;
        const maxPixelSpacing = 80;
        const idealPixelSpacing = 40;
        
        // Calculate ideal world spacing for X-axis
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnitX;
        
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnitX, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    containsTrigFunctions() {
        // Check if any enabled function contains trigonometric functions
        // Include all trig functions: basic, reciprocal, inverse, and hyperbolic
        // Matches both basic format: sin( and LaTeX format: \sin\left(
        const trigRegex = /\\?(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sec|csc|cot|asec|acsc|acot|sech|csch|coth)(\s*\(|\\left\()/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            trigRegex.test(func.expression)
        );
    }

    containsInverseTrigFunctions() {
        // Check if any enabled function contains inverse trigonometric functions
        // Matches: \operatorname{\mathrm{arcsin}} format that MathLive produces
        const inverseTrigRegex = /\\operatorname\{\\mathrm\{arc(sin|cos|tan|sec|csc|cot)\}\}|\\operatorname\{\\mathrm\{a(sin|cos|tan|sec|csc|cot)\}\}/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            inverseTrigRegex.test(func.expression)
        );
    }

    containsRegularTrigFunctions() {
        // Check if any enabled function contains regular (non-inverse) trigonometric functions
        // Matches both basic format: sin( and LaTeX format: \sin\left(
        const regularTrigRegex = /\\?(sin|cos|tan|sinh|cosh|tanh|sec|csc|cot|sech|csch|coth)(\s*\(|\\left\()/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            regularTrigRegex.test(func.expression)
        );
    }
    
    // Check trig functions in current mode only (for axis formatting)
    currentModeContainsRegularTrigFunctions() {
        // Check if any enabled function in current mode contains regular (non-inverse) trig functions
        // Matches both basic format: sin( and LaTeX format: \sin\left(
        const regularTrigRegex = /\\?(sin|cos|tan|sinh|cosh|tanh|sec|csc|cot|sech|csch|coth)(\s*\(|\\left\()/i;
        return this.getCurrentFunctions().some(func => 
            func.enabled && 
            func.expression && 
            regularTrigRegex.test(func.expression)
        );
    }
    
    currentModeContainsInverseTrigFunctions() {
        // Check if any enabled function in current mode contains inverse trig functions
        // Matches: \operatorname{\mathrm{arcsin}} or \operatorname{\mathrm{asin}}
        const inverseTrigRegex = /\\operatorname\{\\mathrm\{arc(sin|cos|tan|sec|csc|cot)\}\}|\\operatorname\{\\mathrm\{a(sin|cos|tan|sec|csc|cot)\}\}/i;
        return this.getCurrentFunctions().some(func => 
            func.enabled && 
            func.expression && 
            inverseTrigRegex.test(func.expression)
        );
    }
    
    hasImplicitFunctions() {
        // Check if any enabled functions are implicit
        return this.getCurrentFunctions().some(func => 
            func.enabled && 
            func.expression && 
            this.detectFunctionType(func.expression) === 'implicit'
        );
    }
    
    hasActiveImplicitCalculations() {
        // Check if any implicit functions are currently being calculated
        // This means they have no points yet (disappeared) and calculation is in progress
        return this.getCurrentFunctions().some(func => {
            if (!func.enabled || !func.expression) return false;
            if (this.detectFunctionType(func.expression) !== 'implicit') return false;
            // Check if this function is actively being calculated and has no points
            return this.activeImplicitCalculations.has(func.id) && (!func.points || func.points.length === 0);
        });
    }
    
    hasEnabledImplicitFunctions() {
        // Check if there are any enabled implicit functions in the current mode
        return this.getCurrentFunctions().some(func => {
            if (!func.enabled || !func.expression) return false;
            return this.detectFunctionType(func.expression) === 'implicit';
        });
    }
    
    shouldShowCalculationIndicator() {
        // Show hourglass if:
        // 1. We have enabled implicit functions AND
        // 2. Either viewport is changing OR implicit calculations are active
        if (!this.hasEnabledImplicitFunctions()) {
            return false;
        }
        return this.isViewportChanging || this.hasActiveImplicitCalculations();
    }
    
    drawCalculationIndicator() {
        const padding = 25; // Increased from 15 to move away from edge
        const size = 40;
        const x = this.viewport.width - size - padding;
        const y = this.viewport.height - size - padding;
        
        // Semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.beginPath();
        this.ctx.roundRect(x - 5, y - 5, size + 10, size + 10, 8);
        this.ctx.fill();
        
        // Hourglass icon
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('⏳', x + size/2, y + size/2);
    }
    
    getSmartResetViewport() {
        // Use different logic for polar vs cartesian modes
        if (this.plotMode === 'polar') {
            return this.getPolarResetViewport();
        } else {
            return this.getCartesianResetViewport();
        }
    }
    
    getPolarResetViewport() {
        // For polar mode, we want a symmetric view centered on origin
        // That shows a good range for typical polar functions like cardioids and roses
        // Scale will be calculated by updateViewportScale() based on canvas dimensions
        return {
            minX: -3, maxX: 3,
            minY: -3, maxY: 3
        };
    }
    
    getCartesianResetViewport() {
        // Analyze current CARTESIAN functions to determine optimal viewport ranges
        const enabledFunctions = this.getCurrentFunctions().filter(func => func.enabled && func.expression.trim());
        
        if (enabledFunctions.length === 0) {
            // No functions enabled, use default ranges
            return {
                minX: -10, maxX: 10,
                minY: -10, maxY: 10,
                scale: 80
            };
        }
        
        const hasRegularTrig = this.currentModeContainsRegularTrigFunctions();
        const hasInverseTrig = this.currentModeContainsInverseTrigFunctions();
        const isDegreesMode = this.angleMode === 'degrees';
        
        if (hasInverseTrig && !hasRegularTrig) {
            // Pure inverse trig functions
            if (isDegreesMode) {
                return {
                    minX: -1.5, maxX: 1.5,
                    minY: -180, maxY: 180,
                    scale: 80
                };
            } else {
                return {
                    minX: -1.5, maxX: 1.5,
                    minY: -Math.PI, maxY: Math.PI,
                    scale: 80
                };
            }
        } else if (hasRegularTrig && !hasInverseTrig) {
            // Pure regular trig functions
            if (isDegreesMode) {
                return {
                    minX: -360, maxX: 360,
                    minY: -3, maxY: 3,
                    scale: 80
                };
            } else {
                return {
                    minX: -2 * Math.PI, maxX: 2 * Math.PI,
                    minY: -3, maxY: 3,
                    scale: 80
                };
            }
        } else {
            // Mixed functions or other types - provide ranges that work for both
            if (hasRegularTrig && hasInverseTrig) {
                // Both regular and inverse trig functions present
                if (isDegreesMode) {
                    return {
                        minX: -10, maxX: 10,    // Use a general range that works for both function types
                        minY: -180, maxY: 180,  // Cover degree outputs for inverse trig and regular range for sin/cos
                        scale: 80
                    };
                } else {
                    return {
                        minX: -10, maxX: 10,    // General range that accommodates both types
                        minY: -Math.PI, maxY: Math.PI,   // Cover radian outputs and regular range
                        scale: 80
                    };
                }
            } else {
                // Other function types, use default ranges
                return {
                    minX: -10, maxX: 10,
                    minY: -10, maxY: 10,
                    scale: 80
                };
            }
        }
    }
    
    getTrigAwareXGridSpacing() {
        if (!this.currentModeContainsRegularTrigFunctions()) {
            return this.getXGridSpacing(); // Use normal spacing if no regular trig functions
        }
        
        if (this.angleMode === 'degrees') {
            // Use degree-based spacing: 30°, 45°, 60°, 90°, etc.
            const degreeIntervals = [3.75, 7.5, 11.25, 15, 22.5, 30, 45, 60, 90, 180, 360];
            return this.chooseBestTrigSpacing(degreeIntervals);
        } else {
            // Use radian-based spacing: only multiples of π/24 for clean fractions
            // π/24 = 7.5° - all multiples simplify to nice fractions
            const radianIntervals = [
                Math.PI / 24,  // π/24 (7.5°)
                Math.PI / 12,  // π/12 = 2π/24 (15°)
                Math.PI / 8,   // π/8 = 3π/24 (22.5°)
                Math.PI / 6,   // π/6 = 4π/24 (30°)
                Math.PI / 4,   // π/4 = 6π/24 (45°)
                Math.PI / 3,   // π/3 = 8π/24 (60°)
                Math.PI / 2,   // π/2 = 12π/24 (90°)
                Math.PI,       // π = 24π/24 (180°)
                2 * Math.PI    // 2π = 48π/24 (360°)
            ];
            return this.chooseBestTrigSpacing(radianIntervals);
        }
    }
    
    chooseBestTrigSpacing(intervals) {
        const xRange = this.viewport.maxX - this.viewport.minX;
        const pixelsPerUnitX = this.viewport.width / xRange;
        
        // Target: 30-100 pixels between grid lines for trig functions
        const minPixelSpacing = 30;
        const maxPixelSpacing = 100;
        
        // Find the best interval that gives good pixel spacing
        for (let interval of intervals) {
            const pixelSpacing = interval * pixelsPerUnitX;
            if (pixelSpacing >= minPixelSpacing && pixelSpacing <= maxPixelSpacing) {
                return interval;
            }
        }
        
        // Check if we're zoomed out too far (largest interval too small)
        const largestInterval = intervals[intervals.length - 1];
        const largestPixelSpacing = largestInterval * pixelsPerUnitX;
        
        if (largestPixelSpacing < minPixelSpacing) {
            // Too zoomed out for trig intervals, use normal spacing
            return this.getXGridSpacing();
        }
        
        // Check if we're zoomed in too far (smallest interval too large)
        const smallestInterval = intervals[0];
        const smallestPixelSpacing = smallestInterval * pixelsPerUnitX;
        
        if (smallestPixelSpacing > maxPixelSpacing * 2) {
            // Too zoomed in for trig intervals, use normal spacing
            return this.getXGridSpacing();
        }
        
        // Otherwise use the closest trigonometric interval
        let bestInterval = intervals[0];
        let bestPixelSpacing = Math.abs(intervals[0] * pixelsPerUnitX - 50); // Target 50px
        
        for (let interval of intervals) {
            const pixelSpacing = interval * pixelsPerUnitX;
            const distanceFromTarget = Math.abs(pixelSpacing - 50);
            if (distanceFromTarget < bestPixelSpacing) {
                bestInterval = interval;
                bestPixelSpacing = distanceFromTarget;
            }
        }
        
        return bestInterval;
    }

    getTrigAwareYGridSpacing() {
        if (!this.currentModeContainsInverseTrigFunctions()) {
            return this.getYGridSpacing(); // Use normal spacing if no inverse trig functions
        }
        
        if (this.angleMode === 'degrees') {
            // Use degree-based spacing for Y-axis: 30°, 45°, 60°, 90°, etc.
            const degreeIntervals = [3.75, 7.5, 11.25, 15, 22.5, 30, 45, 60, 90, 180, 360];
            return this.chooseBestTrigSpacingY(degreeIntervals);
        } else {
            // Use radian-based spacing for Y-axis: only multiples of π/24 for clean fractions
            // π/24 = 7.5° - all multiples simplify to nice fractions
            const radianIntervals = [
                Math.PI / 24,  // π/24 (7.5°)
                Math.PI / 12,  // π/12 = 2π/24 (15°)
                Math.PI / 8,   // π/8 = 3π/24 (22.5°)
                Math.PI / 6,   // π/6 = 4π/24 (30°)
                Math.PI / 4,   // π/4 = 6π/24 (45°)
                Math.PI / 3,   // π/3 = 8π/24 (60°)
                Math.PI / 2,   // π/2 = 12π/24 (90°)
                Math.PI,       // π = 24π/24 (180°)
                2 * Math.PI    // 2π = 48π/24 (360°)
            ];
            return this.chooseBestTrigSpacingY(radianIntervals);
        }
    }

    chooseBestTrigSpacingY(intervals) {
        const yRange = this.viewport.maxY - this.viewport.minY;
        const pixelsPerUnitY = this.viewport.height / yRange;
        
        // Target: 30-100 pixels between grid lines for trig functions on Y-axis
        const minPixelSpacing = 30;
        const maxPixelSpacing = 100;
        
        // Find the best interval that gives good pixel spacing
        for (let interval of intervals) {
            const pixelSpacing = interval * pixelsPerUnitY;
            if (pixelSpacing >= minPixelSpacing && pixelSpacing <= maxPixelSpacing) {
                return interval;
            }
        }
        
        // Check if we're zoomed out too far (largest interval too small)
        const largestInterval = intervals[intervals.length - 1];
        const largestPixelSpacing = largestInterval * pixelsPerUnitY;
        
        if (largestPixelSpacing < minPixelSpacing) {
            // Too zoomed out for trig intervals, use normal spacing
            return this.getYGridSpacing();
        }
        
        // Check if we're zoomed in too far (smallest interval too large)
        const smallestInterval = intervals[0];
        const smallestPixelSpacing = smallestInterval * pixelsPerUnitY;
        
        if (smallestPixelSpacing > maxPixelSpacing * 2) {
            // Too zoomed in for trig intervals, use normal spacing
            return this.getYGridSpacing();
        }
        
        // Otherwise use the closest trigonometric interval
        let bestInterval = intervals[0];
        let bestPixelSpacing = Math.abs(intervals[0] * pixelsPerUnitY - 50); // Target 50px
        
        for (let interval of intervals) {
            const pixelSpacing = interval * pixelsPerUnitY;
            const distanceFromTarget = Math.abs(pixelSpacing - 50);
            if (distanceFromTarget < bestPixelSpacing) {
                bestInterval = interval;
                bestPixelSpacing = distanceFromTarget;
            }
        }
        
        return bestInterval;
    }
    
    getYGridSpacing() {
        // Calculate grid spacing specifically for Y-axis based on Y range
        const yRange = this.viewport.maxY - this.viewport.minY;
        const pixelsPerUnitY = this.viewport.height / yRange;
        
        // Target grid spacing: 20-80 pixels apart for optimal visibility
        const minPixelSpacing = 20;
        const maxPixelSpacing = 80;
        const idealPixelSpacing = 40;
        
        // Calculate ideal world spacing for Y-axis
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnitY;
        
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnitY, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    findBestGridSpacing(idealWorldSpacing, pixelsPerUnit, minPixelSpacing, maxPixelSpacing, idealPixelSpacing) {
        // Generate list of "nice" spacing values
        const niceSpacings = [];
        
        // Add very small spacings for extreme zoom-in
        for (let exp = -6; exp <= 6; exp++) {
            const base = Math.pow(10, exp);
            niceSpacings.push(base, 2 * base, 5 * base);
        }
        
        // Sort the nice spacings
        niceSpacings.sort((a, b) => a - b);
        
        // Find the best spacing that keeps grid lines between min and max pixel spacing
        let bestSpacing = niceSpacings[0];
        let bestPixelSpacing = bestSpacing * pixelsPerUnit;
        
        for (const spacing of niceSpacings) {
            const pixelSpacing = spacing * pixelsPerUnit;
            
            // If this spacing is too small (lines too close), skip it
            if (pixelSpacing < minPixelSpacing) continue;
            
            // If this spacing is too large (lines too far apart), break
            if (pixelSpacing > maxPixelSpacing) break;
            
            // This spacing is in the acceptable range
            bestSpacing = spacing;
            bestPixelSpacing = pixelSpacing;
            
            // If we're close to ideal, use this one
            if (Math.abs(pixelSpacing - idealPixelSpacing) < Math.abs(bestPixelSpacing - idealPixelSpacing)) {
                bestSpacing = spacing;
                bestPixelSpacing = pixelSpacing;
            }
        }
        
        return bestSpacing;
    }
    
    getTrigAwareXLabelSpacing() {
        if (!this.currentModeContainsRegularTrigFunctions()) {
            return this.getXLabelSpacing(); // Use normal spacing if no regular trig functions
        }
        
        // For regular trig functions, use the same spacing as grid lines for alignment
        return this.getTrigAwareXGridSpacing();
    }
    
    getXLabelSpacing() {
        // Calculate label spacing specifically for X-axis based on X range
        const xRange = this.viewport.maxX - this.viewport.minX;
        const pixelsPerUnitX = this.viewport.width / xRange;
        
        // Target label spacing: 40-120 pixels apart for optimal readability
        const minPixelSpacing = 40;
        const maxPixelSpacing = 120;
        const idealPixelSpacing = 80;
        
        // Calculate ideal world spacing for X-axis
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnitX;
        
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnitX, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    getTrigAwareYLabelSpacing() {
        if (!this.currentModeContainsInverseTrigFunctions()) {
            return this.getYLabelSpacing(); // Use normal spacing if no inverse trig functions
        }
        
        // For inverse trig functions, use the same spacing as grid lines
        return this.getTrigAwareYGridSpacing();
    }

    getYLabelSpacing() {
        // Calculate label spacing specifically for Y-axis based on Y range
        const yRange = this.viewport.maxY - this.viewport.minY;
        const pixelsPerUnitY = this.viewport.height / yRange;
        
        // Target label spacing: 40-120 pixels apart for optimal readability
        const minPixelSpacing = 40;
        const maxPixelSpacing = 120;
        const idealPixelSpacing = 80;
        
        // Calculate ideal world spacing for Y-axis
        const idealWorldSpacing = idealPixelSpacing / pixelsPerUnitY;
        
        return this.findBestGridSpacing(idealWorldSpacing, pixelsPerUnitY, minPixelSpacing, maxPixelSpacing, idealPixelSpacing);
    }
    
    // ================================
    // MOBILE & SAFE AREA UTILITIES
    // ================================
    
    getSafeAreaInset(side) {
        // Get safe area insets for iOS devices
        const style = getComputedStyle(document.documentElement);
        const inset = style.getPropertyValue(`--safe-area-${side}`);
        return inset ? parseInt(inset.replace('px', '')) || 0 : 0;
    }

    isTrueMobile() {
        // Simplified mobile detection - just check screen dimensions
        // Use the narrower dimension to determine if we should be in mobile mode
        const narrowDimension = Math.min(window.innerWidth, window.innerHeight);
        return narrowDimension <= 500;
    }

    isIOSSafari() {
        // Detect iOS devices (iPhone and iPad) running in Safari browser mode
        // This affects both iPhone and iPad when NOT in PWA mode
        const isIOS = this.getCachedRegex('iOS').test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = this.getCachedRegex('safari').test(navigator.userAgent) && !this.getCachedRegex('notChromeEdge').test(navigator.userAgent);
        return isIOS && isSafari;
    }

    isIpad() {
        // Keep for backward compatibility - now calls the more general method
        return this.isIOSSafari();
    }

    isStandalonePWA() {
        // Check if the app is running as a standalone PWA
        return window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    }

    fixIOSSafariElementsVisibility() {
        // iOS Safari browser bug fix: UI elements can disappear during orientation changes
        // Affects both iPhone and iPad in Safari browser mode, but not PWA mode
        if (this.isIOSSafari() && !this.isStandalonePWA()) {
            // Use multiple attempts with different timings to ensure fix takes effect
            const attemptFix = () => {
                const hamburgerMenu = document.getElementById('hamburger-menu');
                const functionPanel = document.getElementById('function-panel');
                const mobileOverlay = document.getElementById('mobile-overlay');
                
                // Fix hamburger menu visibility and layout
                if (hamburgerMenu) {
                    hamburgerMenu.style.display = 'flex'; // Important: flex not block for proper line spacing
                    hamburgerMenu.style.visibility = 'visible';
                    hamburgerMenu.style.opacity = '1';
                    hamburgerMenu.style.position = 'fixed';
                    hamburgerMenu.style.zIndex = '20';
                    // Restore flexbox properties that might get corrupted
                    hamburgerMenu.style.flexDirection = 'column';
                    hamburgerMenu.style.justifyContent = 'center';
                    hamburgerMenu.style.alignItems = 'center';
                    // Trigger reflow
                    hamburgerMenu.offsetHeight;
                }
                
                // Fix function panel state - check if it should be open
                if (functionPanel) {
                    const shouldBeOpen = functionPanel.classList.contains('mobile-open');
                    
                    // Temporarily disable transitions to prevent flickering
                    const originalTransition = functionPanel.style.transition;
                    functionPanel.style.transition = 'none';
                    
                    // Force basic visibility properties
                    functionPanel.style.display = 'block';
                    functionPanel.style.visibility = 'visible';
                    functionPanel.style.opacity = '1';
                    functionPanel.style.position = 'fixed';
                    functionPanel.style.zIndex = '15';
                    
                    if (shouldBeOpen) {
                        // Panel should be open - force it to open position
                        functionPanel.style.left = '0';
                        functionPanel.classList.remove('hidden');
                        
                        // Also ensure overlay is visible when panel is open
                        if (mobileOverlay) {
                            mobileOverlay.style.display = 'block';
                            mobileOverlay.style.visibility = 'visible';
                            mobileOverlay.style.opacity = '1';
                            mobileOverlay.style.zIndex = '14';
                            mobileOverlay.offsetHeight;
                        }
                    } else {
                        // Panel should be closed - force it to closed position
                        functionPanel.style.left = '-100%';
                        
                        // Hide overlay if panel is closed
                        if (mobileOverlay) {
                            mobileOverlay.style.display = 'none';
                        }
                    }
                    
                    // Trigger reflow
                    functionPanel.offsetHeight;
                    
                    // Restore transitions after a brief delay
                    setTimeout(() => {
                        functionPanel.style.transition = originalTransition || '';
                    }, 50);
                }
            };
            
            // Immediate fix
            attemptFix();
            
            // Delayed fix attempts to catch any elements that might reappear later
            setTimeout(attemptFix, 50);
            setTimeout(attemptFix, 200);
            setTimeout(attemptFix, 500);
        }
    }

    // Keep old method name for backward compatibility
    fixIpadElementsVisibility() {
        return this.fixIOSSafariElementsVisibility();
    }

    handleMobileLayout(forceUpdate = false) {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        
        if (!hamburgerMenu || !functionPanel) return;
        
        const shouldBeMobile = this.isTrueMobile();
        
        // Don't interfere if mobile menu is currently open (user is actively using it)
        // Special handling for iOS Safari: even with forceUpdate, preserve open panel state
        if (!forceUpdate && functionPanel.classList.contains('mobile-open')) {
            return;
        }
        
        // iOS Safari special case: Don't force close panel during orientation changes
        if (forceUpdate && this.isIOSSafari() && !this.isStandalonePWA() && 
            functionPanel.classList.contains('mobile-open')) {
            // Skip layout changes but ensure hamburger is visible
            if (shouldBeMobile) {
                hamburgerMenu.style.display = 'flex';
            }
            return; // Preserve panel state on iOS Safari
        }
        
        // Don't show hamburger on title screen regardless of mobile/desktop
        if (this.currentState === this.states.TITLE) {
            hamburgerMenu.style.display = 'none';
            functionPanel.classList.add('hidden');
            return;
        }
        
        // Always ensure hamburger is visible in GRAPHING state on mobile
        // This fixes the bug where hamburger disappears after orientation changes
        if (this.currentState === this.states.GRAPHING && shouldBeMobile) {
            hamburgerMenu.style.display = 'flex';
        }
        
        // Determine current state more reliably
        const hamburgerVisible = hamburgerMenu.style.display === 'flex' || 
                                 (hamburgerMenu.style.display === '' && shouldBeMobile);
        const panelVisible = functionPanel.style.display === 'block' || 
                            (functionPanel.style.display === '' && !shouldBeMobile);
        
        const currentlyMobile = hamburgerVisible && !panelVisible;
        
        // Only update if we need to switch modes or if forced
        if (forceUpdate || (shouldBeMobile !== currentlyMobile)) {
            if (shouldBeMobile) {
                // Switch to mobile mode (only if not on title screen)
                hamburgerMenu.style.display = 'flex';
                functionPanel.classList.add('hidden');
                functionPanel.classList.remove('mobile-open');
                // Update hamburger appearance to match closed panel state
                hamburgerMenu.classList.remove('active');
                hamburgerMenu.classList.remove('panel-open');
            } else {
                // Switch to desktop mode - keep hamburger visible in GRAPHING state
                if (this.currentState === this.states.GRAPHING) {
                    hamburgerMenu.style.display = 'flex';
                }
                functionPanel.classList.remove('hidden');
                functionPanel.classList.remove('mobile-open');
                // Update hamburger appearance to match closed panel state
                hamburgerMenu.classList.remove('active');
                hamburgerMenu.classList.remove('panel-open');
            }
        }
    }
    
    // ================================
    // SERVICE WORKER REGISTRATION
    // ================================
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('Service Worker registered');
                
                // Handle updates quietly
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New update available - install quietly without user interruption
                            console.log('New version available - updating automatically...');
                            
                            // Skip waiting to activate immediately
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            
                            // Auto-reload after a short delay to allow clean completion
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
                        }
                    });
                });

                // Handle service worker activation (when new version becomes controlling)
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    // Service worker has been updated and is now controlling the page
                    // No need to reload here as it will happen from the updatefound handler
                });
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    // ================================
    // LATEX CONVERSION METHODS
    // ================================
    
    convertToLatex(expression) {
        if (!expression) return '';
        
        let latex = expression;
        
        // In polar mode, convert 't' to '\theta' for display
        if (this.plotMode === 'polar') {
            // Replace 't' with theta - handle various contexts where t appears
            latex = latex.replace(/\bt\b/g, '\\theta'); // standalone t
            latex = latex.replace(/(\d)t\b/g, '$1\\theta'); // numbers followed by t (like 3t)
            latex = latex.replace(/\(([^)]*)\)t\b/g, '($1)\\theta'); // parentheses followed by t
        }
        
        // Convert common math.js expressions to LaTeX
        // Powers: x^2 -> x^{2}, x^(n+1) -> x^{n+1}
        latex = latex.replace(/\^(\w)/g, '^{$1}');
        latex = latex.replace(/\^(\([^)]+\))/g, '^{$1}');
        
        // Constants (do this BEFORE fraction conversion so \pi is properly handled in fractions)
        latex = latex.replace(/\bpi\b/g, '\\pi');
        latex = latex.replace(/\be\b/g, 'e');
        
        // Fractions: (a)/(b) -> \frac{a}{b}
        latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
        
        // Square roots: sqrt(x) -> \sqrt{x}
        latex = latex.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
        
        // Trigonometric functions
        latex = latex.replace(this.getCachedRegex('sinFunction'), '\\sin(');
        latex = latex.replace(this.getCachedRegex('cosFunction'), '\\cos(');
        latex = latex.replace(this.getCachedRegex('tanFunction'), '\\tan(');
        latex = latex.replace(this.getCachedRegex('asinFunction'), '\\arcsin(');
        latex = latex.replace(this.getCachedRegex('acosFunction'), '\\arccos(');
        latex = latex.replace(this.getCachedRegex('atanFunction'), '\\arctan(');
        
        // Logarithms
        latex = latex.replace(/\blog\(/g, '\\log(');
        latex = latex.replace(/\bln\(/g, '\\ln(');
        
        // Exponential: e^x -> e^{x}
        latex = latex.replace(/\be\^(\w)/g, 'e^{$1}');
        latex = latex.replace(/\be\^(\([^)]+\))/g, 'e^{$1}');
        
        // Clean up unnecessary parentheses in exponents like e^{(-x^2)} -> e^{-x^2}
        latex = latex.replace(/e\^\{(\([^)]+\))\}/g, (match, content) => {
            // Remove outer parentheses if the content is a simple expression
            const inner = content.slice(1, -1); // Remove the parentheses
            return `e^{${inner}}`;
        });
        
        return latex;
    }
    
    convertFractions(expression) {
        // Helper function to find matching closing brace
        const findMatchingBrace = (str, startIndex) => {
            let braceCount = 1;
            let index = startIndex + 1;
            
            while (index < str.length && braceCount > 0) {
                if (str[index] === '{') {
                    braceCount++;
                } else if (str[index] === '}') {
                    braceCount--;
                }
                index++;
            }
            
            return braceCount === 0 ? index - 1 : -1;
        };
        
        let result = expression;
        
        // Process fractions from innermost to outermost
        while (result.includes('\\frac{')) {
            const fracIndex = result.indexOf('\\frac{');
            if (fracIndex === -1) break;
            
            const firstBraceStart = fracIndex + 6; // After '\\frac{'
            const firstBraceEnd = findMatchingBrace(result, firstBraceStart - 1);
            
            if (firstBraceEnd === -1) break; // Malformed fraction
            
            // Look for the second opening brace right after the first closing brace
            if (firstBraceEnd + 1 >= result.length || result[firstBraceEnd + 1] !== '{') {
                break; // Malformed fraction
            }
            
            const secondBraceStart = firstBraceEnd + 2; // After the '{'
            const secondBraceEnd = findMatchingBrace(result, firstBraceEnd + 1);
            
            if (secondBraceEnd === -1) break; // Malformed fraction
            
            // Extract numerator and denominator
            const numerator = result.substring(firstBraceStart, firstBraceEnd);
            const denominator = result.substring(secondBraceStart, secondBraceEnd);
            
            // Replace the fraction with the converted form
            const before = result.substring(0, fracIndex);
            const after = result.substring(secondBraceEnd + 1);
            result = before + `(${numerator})/(${denominator})` + after;
        }
        
        return result;
    }
    
    convertFromLatex(latex) {
        if (!latex) return '';
        
        let expression = latex;
        
        // FIRST: Handle LaTeX parentheses before any other processing
        expression = expression.replace(/\\left\(/g, '(');
        expression = expression.replace(/\\right\)/g, ')');
        expression = expression.replace(/\\left\[/g, '[');
        expression = expression.replace(/\\right\]/g, ']');
        expression = expression.replace(/\\left\{/g, '{');
        expression = expression.replace(/\\right\}/g, '}');
        
        // Convert LaTeX back to math.js expressions
        // Fractions: \frac{a}{b} -> (a)/(b) - handle nested braces properly
        expression = this.convertFractions(expression);
        
        // Handle shorthand fractions: \frac12 -> (1)/(2) (single characters without braces)
        expression = expression.replace(/\\frac([0-9a-zA-Z])([0-9a-zA-Z])/g, '($1)/($2)');
        
        // Cube roots specifically: \sqrt[3]{x} -> cbrt(x) for proper negative value handling
        expression = expression.replace(/\\sqrt\[3\]\{([^}]*)\}/g, 'cbrt($1)');
        
        // Other nth roots: \sqrt[n]{x} -> pow(x, 1/n) (but this won't work for negative x with odd n)
        expression = expression.replace(/\\sqrt\[([^\]]+)\]\{([^}]*)\}/g, 'pow($2, 1/($1))');
        
        // Square roots: \sqrt{x} -> sqrt(x)
        expression = expression.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
        
        // Handle shorthand square roots: \sqrt2 -> sqrt(2) (single characters without braces)
        expression = expression.replace(/\\sqrt([0-9a-zA-Z])/g, 'sqrt($1)');
        
        // Powers: x^{2} -> x^2, but keep parentheses for complex expressions
        expression = expression.replace(/\^{([^}]+)}/g, '^($1)');
        
        // Handle 10^{x} specifically before general power conversion
        expression = expression.replace(/10\^\(([^)]+)\)/g, 'pow(10,$1)'); // 10^{x} -> pow(10,x)
        
        // Trigonometric functions
        expression = expression.replace(/\\sin/g, 'sin');
        expression = expression.replace(/\\cos/g, 'cos');
        expression = expression.replace(/\\tan/g, 'tan');
        expression = expression.replace(/\\sec/g, 'sec');
        expression = expression.replace(/\\csc/g, 'csc');
        expression = expression.replace(/\\cot/g, 'cot');
        
        // Greek letters for parameters
        expression = expression.replace(/\\alpha/g, 'alpha');
        expression = expression.replace(/\\beta/g, 'beta');
        expression = expression.replace(/\\gamma/g, 'gamma');
        expression = expression.replace(/\\delta/g, 'delta');
        
        // Handle spaces: remove spaces that would break parameter-variable/function multiplication
        // e.g., "alpha x" -> "alphax", "beta y" -> "betay", "alpha sin" -> "alphasin"
        expression = expression.replace(/\balpha\s+([xytrabcpi(])/g, 'alpha$1');
        expression = expression.replace(/\bbeta\s+([xytrabcpi(])/g, 'beta$1');
        expression = expression.replace(/\bgamma\s+([xytrabcpi(])/g, 'gamma$1');
        expression = expression.replace(/\bdelta\s+([xytrabcpi(])/g, 'delta$1');
        
        // Also remove spaces between parameters and function names
        // "alpha sin" -> "alphasin", "beta cos" -> "betacos"
        const funcPattern = '(asinh|acosh|atanh|asech|acsch|acoth|asin|acos|atan|asec|acsc|acot|sinh|cosh|tanh|sech|csch|coth|sin|cos|tan|sec|csc|cot|sqrt|cbrt|log|ln|exp|abs)';
        expression = expression.replace(new RegExp(`\\balpha\\s+${funcPattern}`, 'g'), 'alpha$1');
        expression = expression.replace(new RegExp(`\\bbeta\\s+${funcPattern}`, 'g'), 'beta$1');
        expression = expression.replace(new RegExp(`\\bgamma\\s+${funcPattern}`, 'g'), 'gamma$1');
        expression = expression.replace(new RegExp(`\\bdelta\\s+${funcPattern}`, 'g'), 'delta$1');
        
        // Inverse trigonometric functions (standard LaTeX)
        expression = expression.replace(/\\arcsin/g, 'asin');
        expression = expression.replace(/\\arccos/g, 'acos');
        expression = expression.replace(/\\arctan/g, 'atan');
        expression = expression.replace(/\\arcsec/g, 'asec');
        expression = expression.replace(/\\arccsc/g, 'acsc');
        expression = expression.replace(/\\arccot/g, 'acot');
        
        // Inverse hyperbolic functions (standard LaTeX - arcsinh style)
        expression = expression.replace(/\\arcsinh/g, 'asinh');
        expression = expression.replace(/\\arccosh/g, 'acosh');
        expression = expression.replace(/\\arctanh/g, 'atanh');
        expression = expression.replace(/\\arcsech/g, 'asech');
        expression = expression.replace(/\\arccsch/g, 'acsch');
        expression = expression.replace(/\\arccoth/g, 'acoth');
        
        // Inverse trigonometric functions using \operatorname (MathLive fallback format)
        // Handle three formats: \operatorname{arcsin}, \operatorname{\mathrm{arcsin}}, and \operatorname{\mathrm{a}\mathrm{rc}\mathrm{sin}}
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{sin\}\}/g, 'asin');
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{cos\}\}/g, 'acos');
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{tan\}\}/g, 'atan');
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{sec\}\}/g, 'asec');
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{csc\}\}/g, 'acsc');
        expression = expression.replace(/\\operatorname\{\\mathrm\{a\}\\mathrm\{rc\}\\mathrm\{cot\}\}/g, 'acot');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arcsin\}\}/g, 'asin');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccos\}\}/g, 'acos');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arctan\}\}/g, 'atan');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arcsec\}\}/g, 'asec');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccsc\}\}/g, 'acsc');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccot\}\}/g, 'acot');
        expression = expression.replace(/\\operatorname\{arcsin\}/g, 'asin');
        expression = expression.replace(/\\operatorname\{arccos\}/g, 'acos');
        expression = expression.replace(/\\operatorname\{arctan\}/g, 'atan');
        expression = expression.replace(/\\operatorname\{arcsec\}/g, 'asec');
        expression = expression.replace(/\\operatorname\{arccsc\}/g, 'acsc');
        expression = expression.replace(/\\operatorname\{arccot\}/g, 'acot');
        
        // Hyperbolic functions
        // Handle both \operatorname{sinh} and \operatorname{\mathrm{sinh}} formats
        expression = expression.replace(/\\sinh/g, 'sinh');
        expression = expression.replace(/\\cosh/g, 'cosh');
        expression = expression.replace(/\\tanh/g, 'tanh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{sinh\}\}/g, 'sinh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{cosh\}\}/g, 'cosh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{tanh\}\}/g, 'tanh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{sech\}\}/g, 'sech');
        expression = expression.replace(/\\operatorname\{\\mathrm\{csch\}\}/g, 'csch');
        expression = expression.replace(/\\operatorname\{\\mathrm\{coth\}\}/g, 'coth');
        expression = expression.replace(/\\operatorname\{sinh\}/g, 'sinh');
        expression = expression.replace(/\\operatorname\{cosh\}/g, 'cosh');
        expression = expression.replace(/\\operatorname\{tanh\}/g, 'tanh');
        expression = expression.replace(/\\operatorname\{sech\}/g, 'sech');
        expression = expression.replace(/\\operatorname\{csch\}/g, 'csch');
        expression = expression.replace(/\\operatorname\{coth\}/g, 'coth');
        
        // Inverse hyperbolic functions using \operatorname
        // Handle both \operatorname{asinh} and \operatorname{\mathrm{asinh}} formats
        // AND \operatorname{arcsinh} (arc-style notation)
        expression = expression.replace(/\\operatorname\{\\mathrm\{arcsinh\}\}/g, 'asinh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccosh\}\}/g, 'acosh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arctanh\}\}/g, 'atanh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arcsech\}\}/g, 'asech');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccsch\}\}/g, 'acsch');
        expression = expression.replace(/\\operatorname\{\\mathrm\{arccoth\}\}/g, 'acoth');
        expression = expression.replace(/\\operatorname\{arcsinh\}/g, 'asinh');
        expression = expression.replace(/\\operatorname\{arccosh\}/g, 'acosh');
        expression = expression.replace(/\\operatorname\{arctanh\}/g, 'atanh');
        expression = expression.replace(/\\operatorname\{arcsech\}/g, 'asech');
        expression = expression.replace(/\\operatorname\{arccsch\}/g, 'acsch');
        expression = expression.replace(/\\operatorname\{arccoth\}/g, 'acoth');
        expression = expression.replace(/\\operatorname\{\\mathrm\{asinh\}\}/g, 'asinh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{acosh\}\}/g, 'acosh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{atanh\}\}/g, 'atanh');
        expression = expression.replace(/\\operatorname\{\\mathrm\{asech\}\}/g, 'asech');
        expression = expression.replace(/\\operatorname\{\\mathrm\{acsch\}\}/g, 'acsch');
        expression = expression.replace(/\\operatorname\{\\mathrm\{acoth\}\}/g, 'acoth');
        expression = expression.replace(/\\operatorname\{asinh\}/g, 'asinh');
        expression = expression.replace(/\\operatorname\{acosh\}/g, 'acosh');
        expression = expression.replace(/\\operatorname\{atanh\}/g, 'atanh');
        expression = expression.replace(/\\operatorname\{asech\}/g, 'asech');
        expression = expression.replace(/\\operatorname\{acsch\}/g, 'acsch');
        expression = expression.replace(/\\operatorname\{acoth\}/g, 'acoth');
        
        // Logarithms and exponentials (corrected for math.js)
        expression = expression.replace(/\\ln/g, 'log');     // ln(x) -> log(x) (natural log in math.js)
        
        // Convert \log to base-10 logarithm marker
        expression = expression.replace(/\\log/g, 'log10_');  // log(x) -> log10_(x) marker
        expression = expression.replace(/e\^/g, 'exp');
        
        // Absolute value: \left|x\right| -> abs(x)
        expression = expression.replace(/\\left\|([^|]+)\\right\|/g, 'abs($1)');
        
        // Constants
        expression = expression.replace(/\\pi/g, 'pi');
        // Convert theta to 't' for evaluation (math.js doesn't treat 't' as a unit in this context)
        expression = expression.replace(/\\theta/g, 't');
        
        // Multiplication symbols
        expression = expression.replace(/\\cdot/g, '*');
        expression = expression.replace(/\\times/g, '*');
        
        // Fix MathLive bug: when typing "2arccoth" it creates \operatorname{2\mathrm{arccoth}}
        // Extract the coefficient and function name
        expression = expression.replace(/\\operatorname\{(\d+)\\mathrm\{(arc(?:sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|sech|csch|coth)|a(?:sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|sech|csch|coth))\}\}/g, 
            '$1*\\operatorname{$2}');
        
        // Convert typed arc-style hyperbolic functions to a-style (math.js format)
        // These appear when user types "arcsinh" instead of using keyboard button
        // Must happen BEFORE implicit multiplication
        expression = expression.replace(/\barcsinh\(/g, 'asinh(');
        expression = expression.replace(/\barccosh\(/g, 'acosh(');
        expression = expression.replace(/\barctanh\(/g, 'atanh(');
        expression = expression.replace(/\barcsech\(/g, 'asech(');
        expression = expression.replace(/\barccsch\(/g, 'acsch(');
        expression = expression.replace(/\barccoth\(/g, 'acoth(');
        
        // Add implicit multiplication for common cases
        // 2x -> 2*x, 3sin(x) -> 3*sin(x)
        expression = expression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
        expression = expression.replace(/(\))([a-zA-Z])/g, '$1*$2');
        
        // Add implicit multiplication for parameters followed by variables or parentheses
        // alphax -> alpha*x, alpha(x) -> alpha*(x), betay -> beta*y, gammat -> gamma*t, etc.
        expression = expression.replace(/\balpha([xytrabcpi(])/g, 'alpha*$1');
        expression = expression.replace(/\bbeta([xytrabcpi(])/g, 'beta*$1');
        expression = expression.replace(/\bgamma([xytrabcpi(])/g, 'gamma*$1');
        expression = expression.replace(/\bdelta([xytrabcpi(])/g, 'delta*$1');
        
        // Add implicit multiplication for parameters followed by function names
        // alphasin -> alpha*sin, betacos -> beta*cos, etc.
        const paramNames = ['alpha', 'beta', 'gamma', 'delta'];
        const allFunctions = [
            'asinh', 'acosh', 'atanh', 'asech', 'acsch', 'acoth',
            'asin', 'acos', 'atan', 'asec', 'acsc', 'acot',
            'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
            'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
            'sqrt', 'cbrt', 'log', 'ln', 'exp', 'abs'
        ];
        
        for (const param of paramNames) {
            for (const func of allFunctions) {
                // Match parameter followed by function name
                const pattern = new RegExp(`\\b${param}(${func})\\(`, 'g');
                expression = expression.replace(pattern, `${param}*$1(`);
            }
        }
        
        // Handle implicit multiplication between variables and function names
        // ysin(x) -> y*sin(x), xcos(t) -> x*cos(t), etc.
        // IMPORTANT: Process longer function names FIRST to avoid partial matches
        // (e.g., 'asinh' before 'sinh', 'asin' before 'sin')
        const functionNames = [
            'asinh', 'acosh', 'atanh', 'asech', 'acsch', 'acoth',  // Longest first
            'asin', 'acos', 'atan', 'asec', 'acsc', 'acot',
            'log10_',  // log10_ marker before log
            'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
            'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
            'sqrt', 'cbrt',  // sqrt before log to avoid issues
            'log', 'ln', 'exp', 'abs'
        ];
        
        for (const func of functionNames) {
            // Match: single variable + functionname( -> variable*functionname(
            // BUT: Don't match if this function name is actually the END of a longer function name
            // For example, when processing 'sinh', don't match the 'sinh' in 'asinh' or 'arcsinh'
            // We do this by checking that we're either:
            // 1. At start of string or after = or operator
            // 2. Preceded by exactly ONE letter (for implicit mult like xsin -> x*sin)
            
            // Skip if this is a substring of any longer function we haven't processed yet
            const longerFuncs = functionNames.filter(f => f.length > func.length && f.includes(func));
            let shouldSkipThisPattern = false;
            
            // Check if any of the longer function names actually appear in the expression
            for (const longerFunc of longerFuncs) {
                if (expression.includes(longerFunc + '(')) {
                    shouldSkipThisPattern = true;
                    break;
                }
            }
            
            // Also check for arc+function pattern (e.g., arcsinh, arccosh)
            if (!shouldSkipThisPattern && expression.includes('arc' + func + '(')) {
                shouldSkipThisPattern = true;
            }
            
            if (shouldSkipThisPattern) {
                continue;
            }
            
            const pattern = new RegExp(`([a-zA-Z])(${func})\\(`, 'g');
            expression = expression.replace(pattern, '$1*$2(');
        }
        
        // Add implicit multiplication before opening parenthesis (after function handling)
        // x( -> x*(, 2( -> 2*(, )( -> )*(
        // Use negative lookbehind to avoid matching function names
        expression = expression.replace(/(?<![a-zA-Z]{2})([a-zA-Z0-9])(\()/g, '$1*$2');
        expression = expression.replace(/(\))(\()/g, '$1*$2');
        
        // Remove spaces
        expression = expression.replace(/\s+/g, '');
        
        // Convert log10_ marker to log(x, 10)
        expression = expression.replace(/log10_\(([^)]+)\)/g, 'log($1, 10)');
        
        return expression;
    }





    fixIOSViewportBug() {
        // Fix iOS PWA 9-pixel viewport bug by using actual window dimensions
        const setActualViewportHeight = () => {
            const actualHeight = window.innerHeight;
            document.documentElement.style.setProperty('--actual-vh', `${actualHeight}px`);
        };

        // Set initial value
        setActualViewportHeight();

        // Update on resize/orientation change
        window.addEventListener('resize', setActualViewportHeight);
        window.addEventListener('orientationchange', () => {
            // iOS needs a delay after orientation change
            setTimeout(setActualViewportHeight, 100);
        });
    }

    // Helper functions for MathLive range inputs
    getRangeValue(element) {
        if (!element) return NaN;
        
        // If it's a MathLive math-field, get the LaTeX and convert to number
        if (element.tagName.toLowerCase() === 'math-field') {
            const latex = element.getValue();
            if (!latex) return NaN;
            
            // Convert LaTeX expressions to numbers
            const expression = this.convertFromLatex(latex);
            
            try {
                // Use math.js to evaluate the expression
                const result = window.math.evaluate(expression);
                
                // Make sure result is a finite number
                if (typeof result === 'number' && isFinite(result)) {
                    return result;
                } else {
                    console.warn('Range input - Result is not a finite number:', result);
                    return NaN;
                }
            } catch (error) {
                console.warn('Could not evaluate range value:', latex, '->', expression, 'Error:', error.message);
                
                // Try simple fallback conversions for common cases
                if (latex === '\\pi') return Math.PI;
                if (latex === '2\\pi') return 2 * Math.PI;
                if (latex === '-\\pi') return -Math.PI;
                if (latex === '-2\\pi') return -2 * Math.PI;
                
                // Don't try parseFloat fallback - it's too permissive and will parse
                // "23d" as "23", hiding syntax errors. Return NaN for any evaluation error.
                
                return NaN;
            }
        }
        
        // Fallback for regular input elements
        return parseFloat(element.value);
    }
    
    setRangeValue(element, value) {
        if (!element) return;
        
        // If it's a MathLive math-field, set the LaTeX
        if (element.tagName.toLowerCase() === 'math-field') {
            element.setValue(value.toString());
        } else {
            // Fallback for regular input elements
            element.value = value;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.graphiti = new Graphiti();
});
