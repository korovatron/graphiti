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
        
        // Startup state tracking for immediate implicit function rendering
        this.isStartup = false;
        
        // Flag to prevent saving bounds while loading from localStorage
        this.isLoadingBounds = false;
        
        // Flag to prevent saving bounds during initial setup (before loadAndApplyViewportBounds runs)
        this.isInitialSetup = true;
        
        // Angle mode for trigonometric functions
        this.angleMode = 'radians'; // 'degrees' or 'radians'
        
        // Plotting mode
        this.plotMode = 'cartesian'; // 'cartesian' or 'polar'
        this.polarSettings = {
            thetaMin: 0,
            thetaMax: 2 * Math.PI,
            plotNegativeR: false,  // Default to not plotting negative r
            step: 0.01 // theta increment
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
        this.showIntercepts = false; // Toggle for intercept display (off by default to reduce clutter)
        
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
        this.showIntersections = true; // Toggle for intersection display
        this.intersectionDebounceTimer = null; // Timer for debounced intersection updates
        this.isViewportChanging = false; // Flag to track active pan/zoom operations
        
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
        
        this.init();
    }
    
    configureMathLive() {
        // Wait for both DOMContentLoaded and MathLive to be available
        const setupKeyboard = () => {
            // Wait a bit more to ensure MathLive is fully loaded
            setTimeout(() => {
                if (window.mathVirtualKeyboard) {
                    try {
                        
                        // Create a custom numeric layout (replacing the default)
                        const customNumericLayout = {
                            label: '123',
                            labelClass: 'MLK__tex-math',
                            tooltip: 'Numbers & Basic Operations',
                            rows: [
                                [
                                    // Variables and parentheses - reorganized
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
                                        latex: '\\sin(#?)', 
                                        label: 'sin', 
                                        shift: { latex: '\\arcsin(#?)', label: 'sin⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\cos(#?)', 
                                        label: 'cos', 
                                        shift: { latex: '\\arccos(#?)', label: 'cos⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\tan(#?)', 
                                        label: 'tan', 
                                        shift: { latex: '\\arctan(#?)', label: 'tan⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\ln(#?)', 
                                        label: 'ln', 
                                        shift: { latex: 'e^{#?}', label: 'eˣ' }
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
                                        latex: '\\csc(#?)', 
                                        label: 'csc', 
                                        shift: { latex: '\\operatorname{arccsc}(#?)', label: 'csc⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\sec(#?)', 
                                        label: 'sec', 
                                        shift: { latex: '\\operatorname{arcsec}(#?)', label: 'sec⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\cot(#?)', 
                                        label: 'cot', 
                                        shift: { latex: '\\operatorname{arccot}(#?)', label: 'cot⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\log_{10}(#?)', 
                                        label: 'log', 
                                        shift: { latex: '10^{#?}', label: '10ˣ' }
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
                                    // Hyperbolic functions (primary)
                                    { 
                                        latex: '\\sinh(#?)', 
                                        label: 'sinh',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{asinh}(#?)', label: 'sinh⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\cosh(#?)', 
                                        label: 'cosh',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{acosh}(#?)', label: 'cosh⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\tanh(#?)', 
                                        label: 'tanh',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{atanh}(#?)', label: 'tanh⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: 'e^{#?}', 
                                        label: 'eˣ', 
                                        shift: { latex: '\\ln(#?)', label: 'ln' }
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
                                        latex: '\\operatorname{csch}(#?)', 
                                        label: 'csch',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{acsch}(#?)', label: 'csch⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\operatorname{sech}(#?)', 
                                        label: 'sech',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{asech}(#?)', label: 'sech⁻¹', class: 'small' }
                                    },
                                    { 
                                        latex: '\\operatorname{coth}(#?)', 
                                        label: 'coth',
                                        class: 'small',
                                        shift: { latex: '\\operatorname{acoth}(#?)', label: 'coth⁻¹', class: 'small' }
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

                        window.mathVirtualKeyboard.layouts = [customNumericLayout, functionsLayout, hyperbolicLayout];
                        
                        // Store layout references for mode-aware updates
                        this.customNumericLayout = customNumericLayout;
                        this.functionsLayout = functionsLayout;
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
    

    
    // ================================
    // LANDSCAPE EDITING RESTRICTION
    // ================================
    
    shouldRestrictLandscapeEditing() {
        // Only restrict on mobile phones in landscape mode
        // Allow tablets (iPad) and desktop to edit in landscape
        const isMobilePhone = this.isMobilePhone();
        const isLandscape = window.innerWidth > window.innerHeight;
        
        return isMobilePhone && isLandscape;
    }
    
    isMobilePhone() {
        // Detect mobile phones (exclude tablets and desktop)
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroidPhone = this.getCachedRegex('android').test(userAgent) && this.getCachedRegex('mobile').test(userAgent);
        const isIPhone = this.getCachedRegex('iPhone').test(userAgent);
        const isWindowsPhone = this.getCachedRegex('windowsPhone').test(userAgent);
        
        // Also check screen size - phones typically have smaller screens
        const isSmallScreen = window.screen.width <= 500 || window.screen.height <= 500;
        
        return (isAndroidPhone || isIPhone || isWindowsPhone) && isSmallScreen;
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
                <h3>Function Editing Restricted</h3>
                <div class="rotate-icon">Please rotate to portrait mode</div>
                <p>Function editing is only available in portrait mode on mobile phones for the best experience.</p>
                <p>Please rotate your device to portrait mode to edit functions.</p>
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
        }
        
        this.createFunctionUI(func);
        
        // If expression is provided, plot it immediately
        if (expression) {
            this.plotFunction(func);
            
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
        
        // Add keyboard event listener for polar mode theta conversion and smart power key
        mathField.addEventListener('keydown', (event) => {
            // In polar mode, convert 't' key to theta symbol
            if (this.plotMode === 'polar' && event.key === 't' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault(); // Prevent default 't' insertion
                mathField.executeCommand(['insert', '\\theta']); // Insert theta instead
                return;
            }
            
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
        
        // Add focus listener to check for landscape editing restriction
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

        mathField.addEventListener('input', () => {
            // Store LaTeX directly instead of converting
            try {
                const latex = mathField.getValue();
                func.expression = latex; // Store LaTeX format
                
                // Clear expression cache when function expression changes
                this.clearExpressionCache();
                
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
            try {
                if (this.plotMode === 'polar') {
                    // Skip validation for theta-constant rays (they're assignments, not evaluable expressions)
                    const functionType = this.detectFunctionType(func.expression);
                    if (functionType !== 'theta-constant') {
                        // For polar mode, test with theta/t variable - remove "r=" prefix if present
                        let processedExpression = this.convertFromLatex(func.expression);
                        processedExpression = processedExpression.trim();
                        if (processedExpression.toLowerCase().startsWith('r=')) {
                            processedExpression = processedExpression.substring(2).trim();
                        }
                        math.evaluate(processedExpression, { t: 1, theta: 1 });
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
                        let processedExpression = this.convertFromLatex(func.expression);
                        // Strip y= prefix if present (since we store full equations now)
                        if (processedExpression.toLowerCase().startsWith('y=')) {
                            processedExpression = processedExpression.substring(2).trim();
                        }
                        math.evaluate(processedExpression, { x: 1 });
                        
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
                scale: this.cartesianViewport.scale
            };
            localStorage.setItem('graphiti_cartesian_bounds', JSON.stringify(cartesianBounds));

            // Always save polar viewport bounds (from viewport object and polarSettings)
            const polarBounds = {
                thetaMin: this.polarSettings.thetaMin.toString(),
                thetaMax: this.polarSettings.thetaMax.toString(),
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
                            
                            if (xMinInput) this.setRangeValue(xMinInput, bounds.xMin);
                            if (xMaxInput) this.setRangeValue(xMaxInput, bounds.xMax);
                            if (yMinInput) this.setRangeValue(yMinInput, bounds.yMin);
                            if (yMaxInput) this.setRangeValue(yMaxInput, bounds.yMax);
                            
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
                            
                            if (thetaMinInput) this.setRangeValue(thetaMinInput, bounds.thetaMin);
                            if (thetaMaxInput) this.setRangeValue(thetaMaxInput, bounds.thetaMax);
                            
                            this.isLoadingBounds = false;
                            
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
                    const y = this.evaluateFunction(func.expression, x);
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
                        const y = this.evaluateFunction(func.expression, criticalX);
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
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    // Convert theta to radians if in degree mode, since math.js trig functions expect radians
                    let thetaForEval = this.angleMode === 'degrees' ? theta * Math.PI / 180 : theta;
                    
                    // Support both 'theta' and 't' as variable names
                    const scope = { 
                        theta: thetaForEval, 
                        t: thetaForEval,
                        pi: Math.PI,
                        e: Math.E
                    };
                    
                    let r = compiledExpression.evaluate(scope);
                    
                    // Handle negative r values based on setting
                    if (r < 0) {
                        if (this.polarSettings.plotNegativeR) {
                            // Plot negative r at opposite angle
                            r = Math.abs(r);
                            // Update both theta and thetaForEval
                            theta += (this.angleMode === 'degrees' ? 180 : Math.PI);
                            thetaForEval += Math.PI; // Always add PI in radians
                        } else {
                            // Skip negative r values
                            continue;
                        }
                    }
                    
                    // Convert polar to cartesian
                    // Use thetaForEval which is already in radians
                    const x = r * Math.cos(thetaForEval);
                    const y = r * Math.sin(thetaForEval);
                    
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
        const startTime = performance.now();
        
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
        
        // Balanced resolution scaling - performance vs quality
        const viewportSize = Math.max(viewportWidth, viewportHeight);
        
        // Improved resolution scaling with better base quality for busy curves
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
        
        // Create grid of function values
        const grid = [];
        for (let i = 0; i <= resolution; i++) {
            grid[i] = [];
            for (let j = 0; j <= resolution; j++) {
                const x = this.viewport.minX + i * stepX;
                const y = this.viewport.minY + j * stepY;
                const value = this.evaluateImplicitEquation(equation, x, y);
                grid[i][j] = value !== null ? value : 0;
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
        const segments = [];
        
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
                    const value = this.evaluateImplicitEquation(equation, x, y);
                    grid[i][j] = value !== null ? value : 0;
                }
            }
            
            // Yield control after each chunk (skip delay during immediate mode)
            if (!immediate && chunkStart + chunkSize <= resolution) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
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
            
            // Yield control after each chunk (skip delay during immediate mode)
            if (!immediate && chunkStart + chunkSize < resolution) {
                await new Promise(resolve => setTimeout(resolve, 0));
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
            
            // Return the difference: left - right (so we solve for = 0)
            return {
                leftExpression: leftSide,
                rightExpression: rightSide
            };
            
        } catch (error) {
            console.error('Error parsing implicit equation:', error);
            return null;
        }
    }

    evaluateImplicitEquation(equation, x, y) {
        try {
            // Evaluate left side - right side
            const scope = { x: x, y: y, pi: Math.PI, e: Math.E };
            
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
            // Skip this processing if the expression already contains properly formatted functions
            if (!this.containsProperFunctions(processedExpression)) {
                // xy -> x*y, 2x -> 2*x, x2 -> x*2, etc.
                processedExpression = processedExpression.replace(/([a-z])([a-z])/g, '$1*$2'); // variable*variable
                processedExpression = processedExpression.replace(/(\d)([a-z])/g, '$1*$2'); // number*variable
                processedExpression = processedExpression.replace(/([a-z])(\d)/g, '$1*$2'); // variable*number
                processedExpression = processedExpression.replace(/(\))([a-z\d])/g, '$1*$2'); // )*variable/number
                processedExpression = processedExpression.replace(/([a-z\d])(\()/g, '$1*$2'); // variable/number*(
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
        } else {
            // Reset to 0 to 2π radians (default)
            this.polarSettings.thetaMin = 0;
            this.polarSettings.thetaMax = 2 * Math.PI;
            
            if (thetaMinInput) {
                this.setRangeValue(thetaMinInput, '0');
            }
            if (thetaMaxInput) {
                const value = (2 * Math.PI).toFixed(6);
                this.setRangeValue(thetaMaxInput, value);
            }
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
            
            // Replot implicit functions asynchronously to avoid blocking UI
            setTimeout(() => {
                this.replotImplicitFunctions();
            }, 0);
            
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
        }, 100); // Very short delay to minimize blocking period
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
                this.polarSettings.thetaMin = this.getRangeValue(thetaMinInput) || 0;
                this.saveViewportBounds();
                this.replotAllFunctions();
            });
        }
        
        if (thetaMaxInput) {
            thetaMaxInput.addEventListener('input', () => {
                this.polarSettings.thetaMax = this.getRangeValue(thetaMaxInput) || 2 * Math.PI;
                this.saveViewportBounds();
                this.replotAllFunctions();
            });
        }
        


        if (negativeRToggle) {
            negativeRToggle.addEventListener('change', () => {
                this.polarSettings.plotNegativeR = !negativeRToggle.checked;  // Invert checkbox state
                this.replotAllFunctions();
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
                // Clear all badges when changing angle mode (coordinate system change)
                this.clearAllBadges();
                this.toggleAngleMode();
            });
        }
        
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
            // Close function panel on narrow screens when clicking the graph area
            const isNarrowScreen = window.innerWidth < 1024;
            if (isNarrowScreen) {
                const functionPanel = document.getElementById('function-panel');
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
                    
                    // Immediate validation for invalid expressions
                    const value = this.getRangeValue(input);
                    if (isNaN(value)) {
                        this.setInputError(input, true);
                    } else {
                        this.setInputError(input, false);
                    }
                    
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
        this.input.mouse.x = x;
        this.input.mouse.y = y;
        this.input.mouse.down = true;
        this.input.lastX = x;
        this.input.lastY = y;
        this.input.dragging = false;
        
        // Check if we should enter tracing mode
        if (this.currentState === this.states.GRAPHING) {
            // Update badge positions for accurate click detection
            this.updateBadgeScreenPositions();
            
            // First, check if user clicked on an existing badge (highest priority)
            const targetBadge = this.findBadgeAtScreenPosition(x, y, 25);
            if (targetBadge) {
                // Immediately enter badge interaction mode with visual feedback
                this.input.badgeInteraction.targetBadge = targetBadge;
                this.input.badgeInteraction.startTime = Date.now();
                this.input.badgeInteraction.startX = x;
                this.input.badgeInteraction.startY = y;
                this.input.badgeInteraction.isHolding = true; // Start in hold mode immediately
                
                // Remove the original badge right away
                this.removeBadgeById(targetBadge.id);
                
                // Start tracing mode for immediate responsiveness
                const targetFunction = this.findFunctionById(targetBadge.functionId);
                if (targetFunction) {
                    this.startTracingAtWorldPosition(targetBadge.worldX, targetBadge.worldY, targetFunction);
                }
                return; // Exit early - don't process other input logic
            }
            
            // Second, check for intersection marker tap (only if no badge was clicked)
            const tappedIntersection = this.findIntersectionAtScreenPoint(x, y);
            if (tappedIntersection) {
                // Handle intersection tap and exit early
                this.handleIntersectionTap(tappedIntersection, x, y);
                return; // Don't process any other input logic
            }
            
            // Third, check for intercept marker tap (only if no intersection was clicked)
            const tappedIntercept = this.findInterceptAtScreenPoint(x, y);
            if (tappedIntercept) {
                // Handle intercept tap and exit early
                this.handleInterceptTap(tappedIntercept, x, y);
                return; // Don't process any other input logic
            }
            
            // Fourth, check for turning point marker tap (only if no intersection/intercept was clicked)
            const tappedTurningPoint = this.findTurningPointAtScreenPoint(x, y);
            if (tappedTurningPoint) {
                // Handle turning point tap and exit early
                this.handleTurningPointTap(tappedTurningPoint, x, y);
                return; // Don't process any other input logic
            }
            
            // If no badge or intersection was clicked, check for function curve tracing
            // Clear any previous badge interaction state
            this.input.badgeInteraction.targetBadge = null;
            this.input.badgeInteraction.startTime = 0;
            this.input.badgeInteraction.startX = 0;
            this.input.badgeInteraction.startY = 0;
            this.input.badgeInteraction.isHolding = false;
            
            // Determine tolerance based on input type (mouse vs touch)
            const tolerance = this.input.touch.active ? 
                this.input.tracing.tolerance.touch : 
                this.input.tracing.tolerance.mouse;
            
            const curvePoint = this.findClosestCurvePoint(x, y, tolerance);
            
            if (curvePoint) {
                // Enter tracing mode (don't clear existing badges)
                this.input.tracing.active = true;
                this.input.tracing.functionId = curvePoint.function.id;
                this.input.tracing.worldX = curvePoint.worldX;
                this.input.tracing.worldY = curvePoint.worldY;
            } else {
                // Normal panning mode
                this.input.tracing.active = false;
            }
        }
    }
    
    handlePointerMove(x, y) {
        if (this.input.mouse.down && this.currentState === this.states.GRAPHING) {
            const deltaX = x - this.input.lastX;
            const deltaY = y - this.input.lastY;
            
            // Badge interaction is now handled immediately in handlePointerStart
            // All badge interactions start in tracing mode right away
            
            if (this.input.tracing.active) {
                // Tracing mode - update on every movement for smooth tracing
                const currentWorldPos = this.screenToWorld(x, y);
                const tracingFunction = this.findFunctionById(this.input.tracing.functionId);
                
                if (tracingFunction) {
                    // Trace the function at the new X position
                    const tracePoint = this.traceFunction(tracingFunction, currentWorldPos.x);
                    
                    if (tracePoint) {
                        this.input.tracing.worldX = tracePoint.x;
                        this.input.tracing.worldY = tracePoint.y;
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
            
            this.input.lastX = x;
            this.input.lastY = y;
        }
        
        this.input.mouse.x = x;
        this.input.mouse.y = y;
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
            
            // If user didn't move much and released quickly, it was a tap - don't add new badge
            if (totalMovement < this.input.badgeInteraction.moveThreshold) {
                const holdDuration = Date.now() - this.input.badgeInteraction.startTime;
                if (holdDuration < this.input.badgeInteraction.holdThreshold) {
                    // Quick tap with minimal movement - just remove the badge (already removed in handlePointerStart)
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
            
            // Add new badge to the collection
            this.addTraceBadge(
                this.input.tracing.functionId,
                this.input.tracing.worldX,
                this.input.tracing.worldY,
                functionColor
            );
        }
        
        this.input.tracing.active = false;
        this.input.tracing.functionId = null;
        
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
            // Fallback for regular input elements
            if (input.tagName.toLowerCase() !== 'math-field') {
                input.style.borderColor = '#E74C3C';
                input.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
                input.style.boxShadow = '0 0 0 1px rgba(231, 76, 60, 0.3)';
            }
        } else {
            input.classList.remove('input-error');
            // Clear fallback styles for regular input elements
            if (input.tagName.toLowerCase() !== 'math-field') {
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
        
        if (xMinInput) {
            this.setRangeValue(xMinInput, this.viewport.minX.toFixed(2));
            this.setInputError(xMinInput, false);
        }
        if (xMaxInput) {
            this.setRangeValue(xMaxInput, this.viewport.maxX.toFixed(2));
            this.setInputError(xMaxInput, false);
        }
        if (yMinInput) {
            this.setRangeValue(yMinInput, this.viewport.minY.toFixed(2));
            this.setInputError(yMinInput, false);
        }
        if (yMaxInput) {
            this.setRangeValue(yMaxInput, this.viewport.maxY.toFixed(2));
            this.setInputError(yMaxInput, false);
        }
        
        // Save the updated bounds to localStorage (unless we're loading initial state)
        if (!skipSave) {
            this.saveViewportBounds();
        }
    }
    
    togglePlotMode() {
        // Clear all badges when switching modes since coordinate systems are different
        this.clearAllBadges();
        
        // Clear turning points when switching modes (will be recalculated in new mode)
        this.turningPoints = [];
        
        this.plotMode = this.plotMode === 'cartesian' ? 'polar' : 'cartesian';
        
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
        
        // Update all three keyboard layouts
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
                            row[index] = { latex: 'y', label: 'y', class: 'variable-key' };
                        } else {
                            // In polar mode, show theta
                            row[index] = { latex: '\\theta', label: 'θ', class: 'variable-key' };
                        }
                    }
                });
            });
        });
        
        // Update the virtual keyboard with new layouts
        window.mathVirtualKeyboard.layouts = [this.customNumericLayout, this.functionsLayout, this.hyperbolicLayout];
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

    
    replotAllFunctions(onlyExplicit = false) {
        this.getCurrentFunctions().forEach(func => {
            if (func.enabled) {
                // Check if this is an implicit function
                const isImplicit = func.expression && this.detectFunctionType(func.expression) === 'implicit';
                
                // Skip implicit functions if onlyExplicit is true
                if (onlyExplicit && isImplicit) {
                    return;
                }
                
                this.plotFunctionWithValidation(func);
                
                // If function has no points after validation, clear its badges
                if (!func.points || func.points.length === 0) {
                    this.removeBadgesForFunction(func.id);
                    this.removeIntersectionBadgesForFunction(func.id);
                }
            }
        });
        
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
                // All functions processed, redraw
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
                if (hamburgerMenu) hamburgerMenu.style.display = '';
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
        
        // Close MathLive virtual keyboard when closing mobile menu
        if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
            window.mathVirtualKeyboard.hide();
        }
        
        // For tablets, delay the blur to prevent immediate refocus from the same touch event
        const isTablet = window.innerWidth > 500 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
        const blurDelay = isTablet ? 150 : 0;
        
        setTimeout(() => {
            // Blur any focused mathfields to prevent keyboard from reopening
            const focused = document.querySelector('math-field:focus');
            if (focused) {
                focused.blur();
                
                // For tablets, add a temporary flag to prevent immediate refocus
                if (isTablet) {
                    focused.setAttribute('data-blur-protected', 'true');
                    setTimeout(() => {
                        focused.removeAttribute('data-blur-protected');
                    }, 300);
                }
            }
        }, blurDelay);
        
        // Additional cleanup for tablets - sometimes the keyboard needs extra time to close
        setTimeout(() => {
            if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) {
                window.mathVirtualKeyboard.hide();
            }
            // Clean up any lingering MathLive elements that might keep keyboard open
            const backdrops = document.querySelectorAll('.MLK__backdrop');
            backdrops.forEach(backdrop => {
                if (backdrop.parentNode) {
                    backdrop.parentNode.removeChild(backdrop);
                }
            });
        }, 200);
        
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
    
    toggleAngleMode() {
        const degreesIcon = document.getElementById('degrees-icon');
        const radiansIcon = document.getElementById('radians-icon');
        
        if (this.angleMode === 'degrees') {
            this.angleMode = 'radians';
            if (degreesIcon && radiansIcon) {
                degreesIcon.style.opacity = '0.3';  // Dim degrees icon
                radiansIcon.style.opacity = '1';    // Bright radians icon
            }
        } else {
            this.angleMode = 'degrees';
            if (degreesIcon && radiansIcon) {
                degreesIcon.style.opacity = '1';    // Bright degrees icon
                radiansIcon.style.opacity = '0.3';  // Dim radians icon
            }
        }
        
        // Update polar theta range if in polar mode
        if (this.plotMode === 'polar') {
            this.resetPolarRange();
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
    }
    
    initializeAngleMode() {
        // Always default to radians mode
        const degreesIcon = document.getElementById('degrees-icon');
        const radiansIcon = document.getElementById('radians-icon');
        
        this.angleMode = 'radians';
        if (degreesIcon && radiansIcon) {
            degreesIcon.style.opacity = '0.3';  // Dim degrees icon
            radiansIcon.style.opacity = '1';    // Bright radians icon
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
            const result = compiledExpression.evaluate({ x: x }); // Use x directly, no conversion needed
            
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
    
    findClosestCurvePoint(screenX, screenY, tolerance) {
        const worldPos = this.screenToWorld(screenX, screenY);
        let closestFunction = null;
        let closestDistance = Infinity;
        let closestWorldX = worldPos.x;
        let closestWorldY = worldPos.y;
        
        // Check each active function in current mode
        for (const func of this.getCurrentFunctions()) {
            if (!func.enabled || !func.expression.trim()) continue;
            
            // Only allow tracing on explicit functions (cartesian and polar)
            const functionType = this.detectFunctionType(func.expression);
            if (functionType === 'implicit') {
                continue; // Skip implicit functions - they can't be traced with y=f(x) approach
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
                distance: closestDistance
            };
        }
        
        return null;
    }
    
    // Badge management methods for multi-badge tracing system
    addTraceBadge(functionId, worldX, worldY, functionColor, customText = null, badgeType = null) {
        // Snap coordinates to zero if they're very close (matches display formatting)
        const snappedX = this.snapCoordinateForDisplay(worldX);
        const snappedY = this.snapCoordinateForDisplay(worldY);
        
        const badge = {
            id: this.input.badgeIdCounter++,
            functionId: functionId,
            worldX: snappedX,
            worldY: snappedY,
            functionColor: functionColor,
            customText: customText, // For intersection badges
            badgeType: badgeType, // For turning point badges (maximum, minimum, etc.)
            screenX: 0, // Will be updated during rendering
            screenY: 0  // Will be updated during rendering
        };
        
        this.input.persistentBadges.push(badge);
        return badge.id;
    }
    
    removeBadgeById(badgeId) {
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => badge.id !== badgeId);
    }
    
    removeBadgesForFunction(functionId) {
        const beforeCount = this.input.persistentBadges.length;
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => badge.functionId !== functionId);
    }

    removeIntersectionBadgesForFunction(functionId) {
        // Remove intersection badges that involve the specified function
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            !(badge.badgeType === 'intersection' && (badge.func1Id === functionId || badge.func2Id === functionId))
        );
    }

    clearIntersections() {
        // Remove all intersection badges (those with functionId === null or badgeType === 'intersection')
        this.input.persistentBadges = this.input.persistentBadges.filter(badge => 
            badge.functionId !== null && badge.badgeType !== 'intersection'
        );
        
        // Clear the intersection arrays
        this.intersections = [];
        this.explicitIntersections = [];
        this.implicitIntersections = [];
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
        // Combine explicit and implicit intersections for display
        this.intersections = [...this.explicitIntersections, ...this.implicitIntersections];
        
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
                const scope = { x: 0 };
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
                const scope = { x: xMid };
                const yMid = math.evaluate(convertedExpression, scope);
                
                if (!isFinite(yMid)) {
                    return null;
                }
                
                if (Math.abs(yMid) < tolerance) {
                    return xMid;
                }
                
                const scope1 = { x: x1 };
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
                    secondDerivValue = compiledSecondDeriv.evaluate({x: x}); // Use x directly
                } else {
                    const compiledSecondDeriv = this.getCompiledExpression(secondDerivativeStr);
                    secondDerivValue = compiledSecondDeriv.evaluate({x: x});
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
                
                const scope = { 
                    theta: thetaForEval, 
                    t: thetaForEval,
                    pi: Math.PI,
                    e: Math.E
                };
                
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
            const result = compiledExpression.evaluate({x: xValue});
            
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
            return compiledExpression.evaluate({x: xValue});
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
            
            const scope = {
                theta: thetaValue,
                t: thetaValue,
                pi: Math.PI,
                e: Math.E
            };
            
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
            
            const scope = {
                theta: thetaValue,
                t: thetaValue,
                pi: Math.PI,
                e: Math.E
            };
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

    findClosestPolarPoint(func, screenX, screenY, tolerance) {
        try {
            let closestDistance = Infinity;
            let closestWorldX = 0;
            let closestWorldY = 0;
            
            const processedExpression = this.convertFromLatex(func.expression);
            const compiled = math.compile(processedExpression);
            
            // Use dynamic step sizing for performance with higher resolution
            const baseThetaStep = this.calculateDynamicPolarStep(this.polarSettings.thetaMin, this.polarSettings.thetaMax);
            const thetaStep = baseThetaStep / 2; // Higher resolution for better detection
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    const scope = { t: theta, theta: theta, pi: Math.PI, e: Math.E };
                    let r = compiled.evaluate(scope);
                    
                    if (r < 0 && this.polarSettings.plotNegativeR) {
                        r = Math.abs(r);
                        theta += Math.PI;
                    } else if (r < 0) {
                        continue;
                    }
                    
                    const worldX = r * Math.cos(theta);
                    const worldY = r * Math.sin(theta);
                    
                    if (!isFinite(worldX) || !isFinite(worldY)) continue;
                    
                    // Convert to screen coordinates and check distance
                    const screenPos = this.worldToScreen(worldX, worldY);
                    const distance = Math.sqrt(
                        Math.pow(screenPos.x - screenX, 2) + 
                        Math.pow(screenPos.y - screenY, 2)
                    );
                    
                    if (distance < tolerance && distance < closestDistance) {
                        closestDistance = distance;
                        closestWorldX = worldX;
                        closestWorldY = worldY;
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }
            
            if (closestDistance < tolerance) {
                return {
                    distance: closestDistance,
                    worldX: closestWorldX,
                    worldY: closestWorldY
                };
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    traceFunction(func, worldX) {
        try {
            // Handle polar functions differently
            if (func.mode === 'polar') {
                return this.tracePolarFunction(func, worldX);
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
            
            const worldY = this.evaluateFunction(func.expression, clampedX);
            
            if (isNaN(worldY) || !isFinite(worldY)) {
                return null;
            }
            
            return { x: clampedX, y: worldY };
        } catch (error) {
            return null;
        }
    }
    
    tracePolarFunction(func, worldX) {
        // For polar functions, find the closest point on the curve to the given x coordinate
        try {
            let closestPoint = null;
            let closestDistance = Infinity;
            
            const thetaStep = this.calculateDynamicPolarStep(this.polarSettings.thetaMin, this.polarSettings.thetaMax);
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            // Sample the polar function and find closest point to worldX
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    let processedExpression = this.convertFromLatex(func.expression);
                    const compiled = math.compile(processedExpression);
                    const scope = { t: theta, theta: theta, pi: Math.PI, e: Math.E };
                    
                    let r = compiled.evaluate(scope);
                    
                    if (r < 0 && this.polarSettings.plotNegativeR) {
                        r = Math.abs(r);
                        theta += Math.PI;
                    } else if (r < 0) {
                        continue;
                    }
                    
                    const x = r * Math.cos(theta);
                    const y = r * Math.sin(theta);
                    
                    const distance = Math.abs(x - worldX);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestPoint = { x, y };
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }
            
            return closestPoint;
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
        
        // Draw intersection markers if enabled
        if (this.showIntersections) {
            if (this.frozenIntersectionBadges.length > 0) {
                // Show frozen intersection badges whenever they exist (for visual continuity)
                this.drawFrozenIntersectionBadges();
            } else if (this.intersections.length > 0) {
                // When no frozen badges, show actual intersection markers
                this.drawIntersectionMarkers();
            }
        }
        
        // Draw turning point markers if enabled and viewport is stable
        if (this.showTurningPoints) {
            if (this.isViewportChanging && this.frozenTurningPointBadges.length > 0) {
                // During viewport changes, show frozen turning point badges for visual continuity
                this.drawFrozenTurningPointBadges();
            } else if (!this.isViewportChanging && this.turningPoints.length > 0) {
                // When viewport is stable, show actual turning point markers
                this.drawTurningPointMarkers();
            }
        }
        
        // Draw axis intercept markers if enabled and viewport is stable
        if (this.showIntercepts) {
            if (this.isViewportChanging && this.frozenInterceptBadges && this.frozenInterceptBadges.length > 0) {
                // During viewport changes, show frozen intercept badges for visual continuity
                this.drawFrozenInterceptBadges();
            } else if (!this.isViewportChanging && this.intercepts.length > 0) {
                // When viewport is stable, show actual intercept markers
                this.drawInterceptMarkers();
            }
        }
        
        // Draw tracing indicator if active, and all persistent badges
        if (this.input.tracing.active) {
            this.drawActiveTracingIndicator();
        }
        
        // Draw all persistent badges
        this.updateBadgeScreenPositions();
        this.drawPersistentBadges();
        
        // Draw calculation indicator during viewport changes and calculations
        // Only shown when implicit functions are present
        if (this.shouldShowCalculationIndicator()) {
            this.drawCalculationIndicator();
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
            
            // Handle common fractions like π/2, π/3, π/4, π/6
            const commonFractions = [
                { value: 1/6, label: 'π/6' },
                { value: 1/4, label: 'π/4' },
                { value: 1/3, label: 'π/3' },
                { value: 1/2, label: 'π/2' },
                { value: 2/3, label: '2π/3' },
                { value: 3/4, label: '3π/4' },
                { value: 5/6, label: '5π/6' },
                { value: 4/3, label: '4π/3' },
                { value: 3/2, label: '3π/2' },
                { value: 5/3, label: '5π/3' },
                { value: 7/4, label: '7π/4' },
                { value: 11/6, label: '11π/6' }
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
        // Angle spacing based on angle mode and zoom level
        const viewportRange = Math.max(this.viewport.maxX - this.viewport.minX, this.viewport.maxY - this.viewport.minY);
        
        if (this.angleMode === 'degrees') {
            // Use common degree increments
            if (viewportRange > 20) return Math.PI / 6; // 30°
            if (viewportRange > 10) return Math.PI / 8; // 22.5°
            return Math.PI / 12; // 15°
        } else {
            // Use radian increments
            if (viewportRange > 20) return Math.PI / 4; // π/4
            if (viewportRange > 10) return Math.PI / 6; // π/6
            return Math.PI / 8; // π/8
        }
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
            
            // Check for common fractions
            const commonFractions = [
                { ratio: 1/48, label: 'π/48' },
                { ratio: 1/24, label: 'π/24' },
                { ratio: 1/16, label: 'π/16' },
                { ratio: 1/12, label: 'π/12' },
                { ratio: 1/8, label: 'π/8' },
                { ratio: 1/6, label: 'π/6' },
                { ratio: 1/5, label: 'π/5' },
                { ratio: 1/4, label: 'π/4' },
                { ratio: 1/3, label: 'π/3' },
                { ratio: 5/12, label: '5π/12' },
                { ratio: 1/2, label: 'π/2' },
                { ratio: 7/12, label: '7π/12' },
                { ratio: 2/3, label: '2π/3' },
                { ratio: 3/4, label: '3π/4' },
                { ratio: 4/5, label: '4π/5' },
                { ratio: 5/6, label: '5π/6' },
                { ratio: 7/8, label: '7π/8' },
                { ratio: 11/12, label: '11π/12' },
                { ratio: 15/16, label: '15π/16' },
                { ratio: 23/24, label: '23π/24' },
                { ratio: 47/48, label: '47π/48' },
                { ratio: 2, label: '2π' },
                { ratio: 3/2, label: '3π/2' },
                { ratio: 4/3, label: '4π/3' },
                { ratio: 5/4, label: '5π/4' },
                { ratio: 5/3, label: '5π/3' },
                { ratio: 7/4, label: '7π/4' },
                { ratio: 11/6, label: '11π/6' }
            ];
            
            for (let frac of commonFractions) {
                if (Math.abs(piRatio - frac.ratio) < 0.001) {
                    return frac.label;
                }
                if (Math.abs(piRatio + frac.ratio) < 0.001) {
                    return '-' + frac.label;
                }
            }
            
            // Fall back to decimal with π
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
        
        // Create a badge at the intercept point, passing the functionId
        this.addInterceptBadge(intercept.x, intercept.y, intercept.type, intercept.functionId);
    }
    
    addInterceptBadge(x, y, interceptType, functionId) {
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
            functionColor: '#808080', // Neutral gray color for intercepts
            badgeType: interceptType // 'x-intercept', 'y-intercept', or polar axis types
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
        
        // Refine intersection using numerical method for precision
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
        
        // Draw the active tracing indicator
        this.drawTracingBadge(screenPos.x, screenPos.y, tracingFunction.color, this.input.tracing.worldX, this.input.tracing.worldY, true);
    }
    
    drawPersistentBadges() {
        // Update badge screen positions before drawing
        this.updateBadgeScreenPositions();
        
        for (const badge of this.input.persistentBadges) {
            // Skip drawing if badge is outside visible canvas
            if (badge.screenX < -20 || badge.screenX > this.viewport.width + 20 ||
                badge.screenY < -20 || badge.screenY > this.viewport.height + 20) {
                continue;
            }
            
            // Check if this badge is being held (for visual feedback)
            const isBeingHeld = this.input.badgeInteraction.targetBadge && 
                               this.input.badgeInteraction.targetBadge.id === badge.id;
            
            // Draw the persistent badge with hold indication
            this.drawTracingBadge(badge.screenX, badge.screenY, badge.functionColor, badge.worldX, badge.worldY, false, isBeingHeld, badge.customText, badge.badgeType);
        }
    }
    
    drawTracingBadge(screenX, screenY, color, worldX, worldY, isActive = false, isBeingHeld = false, customText = null, badgeType = null) {
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
        
        // Coordinate label with background
        let labelText;
        if (customText) {
            labelText = customText;
        } else if (badgeType) {
            // Badge with type-specific label
            const coords = this.formatCoordinates(worldX, worldY);
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
            labelText = this.formatCoordinates(worldX, worldY);
        } else {
            // Regular badge (intersections, etc.)
            labelText = this.formatCoordinates(worldX, worldY);
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
    
    
    formatCoordinates(worldX, worldY) {
        if (this.plotMode === 'polar') {
            // Convert cartesian coordinates back to polar for display
            const r = Math.sqrt(worldX * worldX + worldY * worldY);
            let theta = Math.atan2(worldY, worldX);
            
            // Normalize theta to 0-2π range
            if (theta < 0) theta += 2 * Math.PI;
            
            // Format based on angle mode
            if (this.angleMode === 'degrees') {
                const thetaDegrees = theta * 180 / Math.PI;
                return `(${this.formatCoordinate(r)}, ${this.formatCoordinate(thetaDegrees)}°)`;
            } else {
                return `(${this.formatCoordinate(r)}, ${this.formatCoordinate(theta)})`;
            }
        } else {
            // Cartesian mode - show (x, y)
            return `(${this.formatCoordinate(worldX)}, ${this.formatCoordinate(worldY)})`;
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
        // Matches both basic format: asin( and LaTeX format: \asin\left(
        const inverseTrigRegex = /\\?(asin|acos|atan|asec|acsc|acot)(\s*\(|\\left\()/i;
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
        // Matches both basic format: asin( and LaTeX format: \asin\left(
        const inverseTrigRegex = /\\?(asin|acos|atan|asec|acsc|acot)(\s*\(|\\left\()/i;
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
        
        const hasRegularTrig = this.containsRegularTrigFunctions();
        const hasInverseTrig = this.containsInverseTrigFunctions();
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
            // Use radian-based spacing: π/6, π/4, π/3, π/2, π, etc.
            const radianIntervals = [
                Math.PI / 48,  // π/48 ≈ 0.065 (3.75°)
                Math.PI / 24,  // π/24 ≈ 0.13 (7.5°)
                Math.PI / 16,  // π/16 ≈ 0.20 (11.25°)
                Math.PI / 12,  // π/12 ≈ 0.26 (15°)
                Math.PI / 8,   // π/8 ≈ 0.39 (22.5°)
                Math.PI / 6,   // π/6 ≈ 0.52 (30°)
                Math.PI / 4,   // π/4 ≈ 0.79 (45°)
                Math.PI / 3,   // π/3 ≈ 1.05 (60°)
                Math.PI / 2,   // π/2 ≈ 1.57 (90°)
                Math.PI,       // π ≈ 3.14 (180°)
                2 * Math.PI    // 2π ≈ 6.28 (360°)
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
            // Use radian-based spacing for Y-axis: π/6, π/4, π/3, π/2, π, etc.
            const radianIntervals = [
                Math.PI / 48,  // π/48 ≈ 0.065 (3.75°)
                Math.PI / 24,  // π/24 ≈ 0.13 (7.5°)
                Math.PI / 16,  // π/16 ≈ 0.20 (11.25°)
                Math.PI / 12,  // π/12 ≈ 0.26 (15°)
                Math.PI / 8,   // π/8 ≈ 0.39 (22.5°)
                Math.PI / 6,   // π/6 ≈ 0.52 (30°)
                Math.PI / 4,   // π/4 ≈ 0.79 (45°)
                Math.PI / 3,   // π/3 ≈ 1.05 (60°)
                Math.PI / 2,   // π/2 ≈ 1.57 (90°)
                Math.PI,       // π ≈ 3.14 (180°)
                2 * Math.PI    // 2π ≈ 6.28 (360°)
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
            } else {
                // Switch to desktop mode
                hamburgerMenu.style.display = 'none';
                functionPanel.classList.remove('hidden');
                functionPanel.classList.remove('mobile-open');
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
        expression = expression.replace(/\\arcsin/g, 'asin');
        expression = expression.replace(/\\arccos/g, 'acos');
        expression = expression.replace(/\\arctan/g, 'atan');
        
        // Inverse trigonometric functions using \operatorname
        expression = expression.replace(/\\operatorname\{arcsec\}/g, 'asec');
        expression = expression.replace(/\\operatorname\{arccsc\}/g, 'acsc');
        expression = expression.replace(/\\operatorname\{arccot\}/g, 'acot');
        
        // Hyperbolic functions
        expression = expression.replace(/\\sinh/g, 'sinh');
        expression = expression.replace(/\\cosh/g, 'cosh');
        expression = expression.replace(/\\tanh/g, 'tanh');
        expression = expression.replace(/\\operatorname\{sech\}/g, 'sech');
        expression = expression.replace(/\\operatorname\{csch\}/g, 'csch');
        expression = expression.replace(/\\operatorname\{coth\}/g, 'coth');
        
        // Inverse hyperbolic functions using \operatorname
        expression = expression.replace(/\\operatorname\{asinh\}/g, 'asinh');
        expression = expression.replace(/\\operatorname\{acosh\}/g, 'acosh');
        expression = expression.replace(/\\operatorname\{atanh\}/g, 'atanh');
        expression = expression.replace(/\\operatorname\{asech\}/g, 'asech');
        expression = expression.replace(/\\operatorname\{acsch\}/g, 'acsch');
        expression = expression.replace(/\\operatorname\{acoth\}/g, 'acoth');
        
        // Logarithms and exponentials (corrected for math.js)
        expression = expression.replace(/\\ln/g, 'log');     // ln(x) -> log(x) (natural log in math.js)
        
        // Handle logarithms with arbitrary bases - MUST come before the fallback \\log replacement
        // Pattern 1: log_{base}(arg) with braces
        expression = expression.replace(/\\log_\{([^}]+)\}\(([^)]+)\)/g, function(match, base, arg) {
            if (base === '10') {
                return `log10(${arg})`; // Use built-in log10 for base 10
            } else if (base === 'e') {
                return `log(${arg})`; // Use built-in log for base e (natural log)
            } else {
                return `(log(${arg})/log(${base}))`; // Change of base formula
            }
        });
        
        // Pattern 2: log_base(arg) without braces around base
        expression = expression.replace(/\\log_([0-9]+)\(([^)]+)\)/g, function(match, base, arg) {
            if (base === '10') {
                return `log10(${arg})`; // Use built-in log10 for base 10
            } else if (base === 'e') {
                return `log(${arg})`; // Use built-in log for base e (natural log)
            } else {
                return `(log(${arg})/log(${base}))`; // Change of base formula
            }
        });
        
        // Fallback: plain log (must come AFTER specific base handling)
        expression = expression.replace(/\\log/g, 'log10');  // fallback: log(x) -> log10(x) (base-10 log in math.js)
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
        
        // Add implicit multiplication for common cases
        // 2x -> 2*x, 3sin(x) -> 3*sin(x)
        expression = expression.replace(/(\d)([a-zA-Z])/g, '$1*$2');
        expression = expression.replace(/(\))([a-zA-Z])/g, '$1*$2');
        
        // Handle implicit multiplication between variables and function names
        // ysin(x) -> y*sin(x), xcos(t) -> x*cos(t), etc.
        const functionNames = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 
                              'sinh', 'cosh', 'tanh', 'log', 'log10', 'ln', 'exp', 'sqrt', 'cbrt', 'abs'];
        
        for (const func of functionNames) {
            // Match: single variable + functionname( -> variable*functionname(
            // Check for the specific pattern: letter+functionname+openParen
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
                
                // Try parsing as a simple number if conversion failed
                const numValue = parseFloat(latex);
                if (!isNaN(numValue) && isFinite(numValue)) {
                    return numValue;
                }
                
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
