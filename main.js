// Graphiti - Mathematical Function Explorer
// Main application logic with animation loop and state management

class Graphiti {
    constructor() {
        // Fix iOS PWA 9-pixel viewport bug
        this.fixIOSViewportBug();
        
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
            // Persistent tracing display for educational use
            persistentTracing: {
                visible: false,
                functionId: null,
                worldX: 0,
                worldY: 0,
                functionColor: '#4A90E2'
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
        this.functionColors = [
            '#4A90E2', '#E74C3C', '#27AE60', '#F39C12', 
            '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'
        ];
        this.plotTimers = new Map(); // For debouncing auto-plot
        this.rangeTimer = null; // For debouncing range updates
        this.panTimer = null; // For debouncing pan replotting
        
        // Animation
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.animationId = null;
        
        this.init();
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
        this.createFunctionUI(func);
        
        // If expression is provided, plot it immediately
        if (expression) {
            this.plotFunction(func);
        }
    }
    
    createFunctionUI(func) {
        const container = document.getElementById('functions-container');
        const funcDiv = document.createElement('div');
        funcDiv.className = 'function-item';
        funcDiv.style.borderLeftColor = func.color;
        funcDiv.setAttribute('data-function-id', func.id);

        funcDiv.innerHTML = `
            <div class="color-indicator" style="background-color: ${func.color}" title="Click to show/hide function"></div>
            <input type="text" spellcheck="false" placeholder="e.g., sin(x), x^2, log(x)" value="${func.expression}">
            <button class="remove-btn">×</button>
        `;        // Add event listeners
        const input = funcDiv.querySelector('input');
        const colorIndicator = funcDiv.querySelector('.color-indicator');
        const removeBtn = funcDiv.querySelector('.remove-btn');
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Force immediate plotting on Enter, bypassing debounce
                func.expression = input.value;
                this.plotFunctionWithValidation(func);
            }
        });
        
        input.addEventListener('input', (e) => {
            // Clear persistent tracing when editing functions
            this.input.persistentTracing.visible = false;
            func.expression = e.target.value;
            // Auto-plot with debouncing to avoid excessive calculations
            this.debouncePlot(func);
        });
        
        colorIndicator.addEventListener('click', () => {
            // Clear persistent tracing when toggling function visibility
            this.input.persistentTracing.visible = false;
            func.enabled = !func.enabled;
            this.updateFunctionVisualState(func, funcDiv);
        });
        
        removeBtn.addEventListener('click', () => {
            // Clear persistent tracing when removing functions
            this.input.persistentTracing.visible = false;
            this.removeFunction(func.id);
        });
        
        container.appendChild(funcDiv);
        
        // Set initial visual state
        this.updateFunctionVisualState(func, funcDiv);
    }
    
    updateFunctionVisualState(func, funcDiv) {
        const colorIndicator = funcDiv.querySelector('.color-indicator');
        const input = funcDiv.querySelector('input');
        
        if (func.enabled) {
            // Function is visible
            colorIndicator.style.opacity = '1';
            colorIndicator.style.filter = 'none';
            colorIndicator.title = 'Click to hide function';
            input.style.opacity = '1';
            funcDiv.classList.remove('disabled');
        } else {
            // Function is hidden
            colorIndicator.style.opacity = '0.3';
            colorIndicator.style.filter = 'grayscale(100%)';
            colorIndicator.title = 'Click to show function';
            input.style.opacity = '0.6';
            funcDiv.classList.add('disabled');
        }
    }
    
    debouncePlot(func) {
        // Clear existing timer for this function
        if (this.plotTimers.has(func.id)) {
            clearTimeout(this.plotTimers.get(func.id));
        }
        
        // Set new timer for delayed plotting
        const timerId = setTimeout(() => {
            this.plotFunctionWithValidation(func);
            this.plotTimers.delete(func.id);
        }, 300); // 300ms delay
        
        this.plotTimers.set(func.id, timerId);
    }
    
    plotFunctionWithValidation(func) {
        // Don't plot empty expressions
        if (!func.expression.trim()) {
            func.points = [];
            return;
        }
        
        // Check if math.js is available
        if (typeof math === 'undefined') {
            console.error('Math.js library not loaded!');
            return;
        }
        
        try {
            // Quick validation: try to evaluate at x=0
            const testResult = this.evaluateFunction(func.expression, 0);
            
            // If we get here without throwing, the expression is syntactically valid
            this.plotFunction(func);
            
            // Update UI to show success (remove any error styling)
            const funcDiv = document.querySelector(`[data-function-id="${func.id}"]`);
            if (funcDiv) {
                const input = funcDiv.querySelector('input');
                input.style.borderColor = '';
                input.style.backgroundColor = '';
            }
            
        } catch (error) {
            // Expression is invalid, clear points and show visual feedback
            func.points = [];
            
            // Update UI to show error (subtle visual feedback)
            const funcDiv = document.querySelector(`[data-function-id="${func.id}"]`);
            if (funcDiv) {
                const input = funcDiv.querySelector('input');
                input.style.borderColor = '#E74C3C';
                input.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
            }
        }
    }
    
    removeFunction(id) {
        // Clear any pending plot timer for this function
        if (this.plotTimers.has(id)) {
            clearTimeout(this.plotTimers.get(id));
            this.plotTimers.delete(id);
        }
        
        // Remove from the appropriate function array
        this.cartesianFunctions = this.cartesianFunctions.filter(f => f.id !== id);
        this.polarFunctions = this.polarFunctions.filter(f => f.id !== id);
        
        const funcDiv = document.querySelector(`[data-function-id="${id}"]`);
        if (funcDiv) {
            funcDiv.remove();
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
    
    replotAllFunctions() {
        this.functions.forEach(func => {
            if (func.expression && func.enabled) {
                this.plotFunction(func);
            }
        });
    }
    
    plotFunction(func) {
        // Check if math.js is available
        if (typeof math === 'undefined') {
            console.error('Math.js library not loaded!');
            alert('Math library not loaded. Please refresh the page.');
            return;
        }
        
        if (!func.expression.trim()) {
            func.points = [];
            return;
        }
        
        // Route to appropriate plotting method based on mode
        if (this.plotMode === 'polar') {
            this.plotPolarFunction(func);
            return;
        }
        
        // Cartesian plotting (existing code)
        try {
            // Calculate points for the current viewport
            const points = [];
            const step = (this.viewport.maxX - this.viewport.minX) / this.viewport.width;
            
            // Use a more precise approach to ensure we include the endpoint
            const numSteps = Math.ceil((this.viewport.maxX - this.viewport.minX) / step);
            
            // Collect critical points that must be included (domain boundaries)
            const criticalPoints = [];
            if (func.expression.toLowerCase().includes('asin') || func.expression.toLowerCase().includes('acos')) {
                // For inverse trig functions, ensure we include x = ±1 if they're in viewport
                if (this.viewport.minX <= 1 && this.viewport.maxX >= 1) criticalPoints.push(1);
                if (this.viewport.minX <= -1 && this.viewport.maxX >= -1) criticalPoints.push(-1);
            }
            
            for (let i = 0; i <= numSteps; i++) {
                let x = this.viewport.minX + (i * step);
                
                // Ensure we hit the exact endpoint on the last iteration
                if (i === numSteps) {
                    x = this.viewport.maxX;
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
    }
    
    plotPolarFunction(func) {
        try {
            // Prepare the expression for evaluation
            let processedExpression = func.expression.toLowerCase();
            
            // Create a compiled expression with math.js
            const compiledExpression = math.compile(processedExpression);
            
            const points = [];
            const thetaStep = this.polarSettings.step;
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    // Support both 'theta' and 't' as variable names
                    const scope = { 
                        theta: theta, 
                        t: theta,
                        pi: Math.PI,
                        e: Math.E
                    };
                    
                    let r = compiledExpression.evaluate(scope);
                    
                    // Handle negative r values based on setting
                    if (r < 0) {
                        if (this.polarSettings.plotNegativeR) {
                            // Plot negative r at opposite angle
                            r = Math.abs(r);
                            theta += Math.PI;
                        } else {
                            // Skip negative r values
                            continue;
                        }
                    }
                    
                    // Convert polar to cartesian
                    const x = r * Math.cos(theta);
                    const y = r * Math.sin(theta);
                    
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
        });
        
        // Additional mobile-specific resize handling
        if ('screen' in window && 'orientation' in window.screen) {
            window.screen.orientation.addEventListener('change', () => {
                setTimeout(() => {
                    resizeCanvas();
                    this.handleMobileLayout(true); // Force layout re-evaluation on screen orientation change
                }, 100);
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
                // Clear persistent tracing when adding functions
                this.input.persistentTracing.visible = false;
                this.addFunction('');
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
                this.polarSettings.thetaMin = parseFloat(thetaMinInput.value) || 0;
                this.replotAllFunctions();
            });
        }
        
        if (thetaMaxInput) {
            thetaMaxInput.addEventListener('input', () => {
                this.polarSettings.thetaMax = parseFloat(thetaMaxInput.value) || 2 * Math.PI;
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
                // Clear persistent tracing when resetting view
                this.input.persistentTracing.visible = false;
                
                // Close the function panel only on mobile devices
                if (this.isTrueMobile()) {
                    this.closeMobileMenu();
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
        
        // Theme Toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                // Clear persistent tracing when changing theme
                this.input.persistentTracing.visible = false;
                this.toggleTheme();
            });
        }
        
        // Angle Mode Toggle
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            angleModeToggle.addEventListener('click', () => {
                // Clear persistent tracing when changing angle mode
                this.input.persistentTracing.visible = false;
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
        
        // Click on canvas to close hamburger menu (desktop only)
        this.canvas.addEventListener('click', (e) => {
            // Only close mobile menu on mobile devices when tapping the graph
            if (this.isTrueMobile()) {
                const functionPanel = document.getElementById('function-panel');
                if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                    this.closeMobileMenu();
                }
            }
        });
        
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
                    this.input.persistentTracing.visible = false;
                    this.debounceRangeUpdate();
                });
                
                input.addEventListener('keydown', (e) => {
                    this.input.persistentTracing.visible = false;
                    if (e.key === 'Enter') {
                        // Force immediate update on Enter, bypassing debounce
                        this.validateAndSetRange();
                    } else if (e.key === '-') {
                        // Handle minus key to maintain cursor position
                        this.handleMinusKey(e, input);
                    }
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
            // Determine tolerance based on input type (mouse vs touch)
            const tolerance = this.input.touch.active ? 
                this.input.tracing.tolerance.touch : 
                this.input.tracing.tolerance.mouse;
            
            const curvePoint = this.findClosestCurvePoint(x, y, tolerance);
            
            if (curvePoint) {
                // Clear persistent tracing only when starting a new trace
                this.input.persistentTracing.visible = false;
                
                // Enter tracing mode
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
                    
                    // Debounce the expensive function re-plotting
                    this.debouncePanReplot();
                }
            }
            
            this.input.lastX = x;
            this.input.lastY = y;
        }
        
        this.input.mouse.x = x;
        this.input.mouse.y = y;
    }
    
    debouncePanReplot() {
        // Clear existing timer
        if (this.panTimer) {
            clearTimeout(this.panTimer);
        }
        
        // Set new timer for delayed re-plotting
        this.panTimer = setTimeout(() => {
            this.replotAllFunctions();
            this.panTimer = null;
        }, 100); // 100ms delay - responsive but not overwhelming
    }
    
    handlePointerEnd() {
        // If we were dragging, ensure final replot happens immediately
        if (this.input.dragging) {
            // Clear any pending debounced replot
            if (this.panTimer) {
                clearTimeout(this.panTimer);
                this.panTimer = null;
            }
            // Do immediate final replot if not tracing
            if (!this.input.tracing.active) {
                this.replotAllFunctions();
            }
        }
        
        // Exit tracing mode - save state for persistent display
        if (this.input.tracing.active) {
            // Save current tracing state for persistent display
            this.input.persistentTracing.visible = true;
            this.input.persistentTracing.functionId = this.input.tracing.functionId;
            this.input.persistentTracing.worldX = this.input.tracing.worldX;
            this.input.persistentTracing.worldY = this.input.tracing.worldY;
            
            // Get function color for persistent display
            const tracingFunction = this.findFunctionById(this.input.tracing.functionId);
            this.input.persistentTracing.functionColor = tracingFunction ? tracingFunction.color : '#4A90E2';
        }
        
        this.input.tracing.active = false;
        this.input.tracing.functionId = null;
        
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
            
            if (this.input.pinch.direction === 'horizontal') {
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
                    this.replotAllFunctions();
                }
                
            } else if (this.input.pinch.direction === 'vertical') {
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
                    this.replotAllFunctions();
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
                    this.replotAllFunctions();
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
                // Since this touch event is on the canvas, close mobile menu if open
                const functionPanel = document.getElementById('function-panel');
                if (functionPanel && functionPanel.classList.contains('mobile-open')) {
                    this.closeMobileMenu();
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
        // Check if any input field is currently focused
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
        
        // If an input is focused, don't handle navigation keys
        if (isInputFocused && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            return; // Let the input handle the arrow keys normally
        }
        
        switch(e.key.toLowerCase()) {
            case 'escape':
                this.changeState(this.states.TITLE);
                break;
            case '=':
            case '+':
                const newScaleUp = this.viewport.scale * 1.1;
                if (newScaleUp <= 10000) {
                    this.viewport.scale = newScaleUp;
                    this.updateViewport();
                }
                break;
            case '-':
                // Only handle minus for zoom if not in an input field
                if (!isInputFocused) {
                    const newScaleDown = this.viewport.scale / 1.1;
                    if (newScaleDown >= 0.001) {
                        this.viewport.scale = newScaleDown;
                        this.updateViewport();
                    }
                }
                break;
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
        
        // Re-plot all functions when viewport changes
        this.replotAllFunctions();
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
            this.replotAllFunctions();
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
            this.replotAllFunctions();
        }
    }
    
    handleMinusKey(e, input) {
        const cursorPosition = input.selectionStart;
        const currentValue = input.value;
        
        // If we're at the beginning or the value is empty, handle minus specially
        if (cursorPosition === 0 || currentValue === '') {
            e.preventDefault();
            
            if (currentValue.startsWith('-')) {
                // Remove existing minus sign
                input.value = currentValue.substring(1);
                input.setSelectionRange(0, 0);
            } else {
                // Add minus sign at the beginning
                input.value = '-' + currentValue;
                input.setSelectionRange(1, 1);
            }
            
            // Trigger input event to update the graph
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // If cursor is not at the beginning, let default behavior handle it
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
        const xMin = parseFloat(xMinInput.value);
        const xMax = parseFloat(xMaxInput.value);
        const yMin = parseFloat(yMinInput.value);
        const yMax = parseFloat(yMaxInput.value);
        
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
        if (hasError) {
            input.style.borderColor = '#E74C3C';
            input.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
            input.style.boxShadow = '0 0 0 1px rgba(231, 76, 60, 0.3)';
        } else {
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            input.style.boxShadow = '';
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
        
        // Re-plot all functions with new range
        this.replotAllFunctions();
    }
    
    setCustomRange() {
        // Legacy method - redirect to new validation system
        this.validateAndSetRange();
    }
    
    updateRangeInputs() {
        const xMinInput = document.getElementById('x-min');
        const xMaxInput = document.getElementById('x-max');
        const yMinInput = document.getElementById('y-min');
        const yMaxInput = document.getElementById('y-max');
        
        if (xMinInput) {
            xMinInput.value = this.viewport.minX.toFixed(2);
            this.setInputError(xMinInput, false);
        }
        if (xMaxInput) {
            xMaxInput.value = this.viewport.maxX.toFixed(2);
            this.setInputError(xMaxInput, false);
        }
        if (yMinInput) {
            yMinInput.value = this.viewport.minY.toFixed(2);
            this.setInputError(yMinInput, false);
        }
        if (yMaxInput) {
            yMaxInput.value = this.viewport.maxY.toFixed(2);
            this.setInputError(yMaxInput, false);
        }
    }
    
    togglePlotMode() {
        // Clear persistent tracing when switching modes since functions are mode-specific
        this.input.persistentTracing.visible = false;
        
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
        
        // Update Add Function button text based on coordinate system
        const addFunctionBtn = document.getElementById('add-function');
        if (addFunctionBtn) {
            addFunctionBtn.textContent = this.plotMode === 'cartesian' ? '+ f(x)' : '+ f(θ)';
        }
        
        if (cartesianRanges && cartesianRangesY) {
            cartesianRanges.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
            cartesianRangesY.style.display = this.plotMode === 'cartesian' ? 'flex' : 'none';
        }
        
        if (polarRanges && polarOptions) {
            polarRanges.style.display = this.plotMode === 'polar' ? 'flex' : 'none';
            polarOptions.style.display = this.plotMode === 'polar' ? 'block' : 'none';
        }
        
        // Clear existing function UI and recreate for current mode
        this.refreshFunctionUI();

        // Add pre-populated functions if the current mode has no functions
        if (this.getCurrentFunctions().length === 0) {
            if (this.plotMode === 'cartesian') {
                this.addFunction('sin(2x + pi)');
                this.addFunction('e^(-x^2)');
                this.addFunction(''); // Empty function to show placeholder example text
            } else {
                this.addFunction('1 + cos(theta)'); // Cardioid
                this.addFunction('2*cos(3*theta)'); // Three-petaled rose  
                this.addFunction('sin(2*theta)'); // Four-petaled rose
                this.addFunction(''); // Empty function to show placeholder example text
            }
        }
        
        // Update function placeholders
        this.updateFunctionPlaceholders();

        // Synchronize canvas dimensions between viewports
        const currentViewport = this.viewport;
        if (this.plotMode === 'polar') {
            this.polarViewport.width = this.cartesianViewport.width;
            this.polarViewport.height = this.cartesianViewport.height;
            this.polarViewport.centerX = this.cartesianViewport.centerX;
            this.polarViewport.centerY = this.cartesianViewport.centerY;

            // Initialize polar viewport ranges if not set up
            if (this.polarViewport.scale === 80 && this.polarViewport.minX === -3) {
                const polarReset = this.getPolarResetViewport();
                this.polarViewport.minX = polarReset.minX;
                this.polarViewport.maxX = polarReset.maxX;
                this.polarViewport.minY = polarReset.minY;
                this.polarViewport.maxY = polarReset.maxY;
                this.polarViewport.scale = polarReset.scale;

                // Force 1:1 aspect ratio for proper polar display
                this.enforcePolarAspectRatio();
            }
        } else {
            this.cartesianViewport.width = this.polarViewport.width;
            this.cartesianViewport.height = this.polarViewport.height;
            this.cartesianViewport.centerX = this.polarViewport.centerX;
            this.cartesianViewport.centerY = this.polarViewport.centerY;
        }
        
        // Clear all function points since we're switching coordinate systems
        this.cartesianFunctions.forEach(func => func.points = []);
        this.polarFunctions.forEach(func => func.points = []);
        
        // Force complete viewport recalculation
        this.updateViewport();

        // Update range inputs to reflect the correct viewport values
        this.updateRangeInputs();

        // Force a complete redraw to ensure viewport is current
        this.draw();
        
        // Replot all functions in current mode
        this.replotAllFunctions();
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
    
    updateFunctionPlaceholders() {
        const functionInputs = document.querySelectorAll('.function-item input[type="text"]');
        functionInputs.forEach(input => {
            if (this.plotMode === 'polar') {
                input.placeholder = 'e.g., 1 + cos(theta), 2*sin(3*t)';
            } else {
                input.placeholder = 'e.g., sin(x), x^2, log(x)';
            }
        });
    }
    
    replotAllFunctions() {
        this.getCurrentFunctions().forEach(func => {
            if (func.expression && func.enabled) {
                this.plotFunction(func);
            }
        });
        this.draw();
    }
    
    startGraphing() {
        this.changeState(this.states.GRAPHING);
        // Add three initial function boxes when starting to show multiple plot capability
        if (this.getCurrentFunctions().length === 0) {
            if (this.plotMode === 'cartesian') {
                this.addFunction('sin(2x + pi)');
                this.addFunction('e^(-x^2)');
                this.addFunction(''); // Empty function to show placeholder example text
            } else {
                this.addFunction('1 + cos(theta)');
                this.addFunction('cos(3*theta)');
                this.addFunction(''); // Empty function to show placeholder example text
            }
            
            // Use the same smart reset viewport logic as the reset button for consistency
            const smartViewport = this.getSmartResetViewport();
            this.viewport.minX = smartViewport.minX;
            this.viewport.maxX = smartViewport.maxX;
            this.viewport.minY = smartViewport.minY;
            this.viewport.maxY = smartViewport.maxY;
            this.viewport.scale = smartViewport.scale;
            
            // Update range inputs to reflect the smart viewport
            this.updateRangeInputs();
            
            // Plot all functions after setting viewport
            this.getCurrentFunctions().forEach(func => {
                if (func.expression) {
                    this.plotFunction(func);
                }
            });
        }
        // Open the function panel by default so users can start immediately
        // Add a small delay on mobile to prevent touch event conflicts
        if (this.isTrueMobile()) {
            setTimeout(() => {
                this.openMobileMenu();
            }, 100);
        } else {
            this.openMobileMenu();
        }
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
                if (functionPanel) functionPanel.classList.remove('hidden');
                if (hamburgerMenu) hamburgerMenu.style.display = '';
                break;
        }
    }
    
    // Mobile Menu Methods
    toggleMobileMenu() {
        // Clear persistent tracing when menu is toggled
        this.input.persistentTracing.visible = false;
        
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
        
        // Only show overlay on actual mobile devices
        if (this.isTrueMobile() && mobileOverlay) {
            mobileOverlay.style.display = 'block';
        }
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
        if (mobileOverlay) mobileOverlay.style.display = 'none';
    }
    
    toggleTheme() {
        const html = document.documentElement;
        const themeToggle = document.getElementById('theme-toggle');
        const currentTheme = html.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Switch to dark mode
            html.removeAttribute('data-theme');
            if (themeToggle) themeToggle.textContent = '🌙';
            localStorage.setItem('graphiti-theme', 'dark');
        } else {
            // Switch to light mode
            html.setAttribute('data-theme', 'light');
            if (themeToggle) themeToggle.textContent = '☀️';
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
        const themeToggle = document.getElementById('theme-toggle');
        
        if (savedTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeToggle) themeToggle.textContent = '☀️';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeToggle) themeToggle.textContent = '🌙';
        }
        
        this.updateCanvasBackground();
    }
    
    toggleAngleMode() {
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        
        if (this.angleMode === 'degrees') {
            this.angleMode = 'radians';
            if (angleModeToggle) angleModeToggle.textContent = 'RAD';
        } else {
            this.angleMode = 'degrees';
            if (angleModeToggle) angleModeToggle.textContent = 'DEG';
        }
        
        // Only adjust viewport if there are trig functions that would be affected
        if (this.containsTrigFunctions()) {
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
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        
        this.angleMode = 'radians';
        if (angleModeToggle) angleModeToggle.textContent = 'RAD';
    }
    
    evaluateFunction(expression, x) {
        try {
            // Make function names case-insensitive for mobile compatibility
            // Simply convert the entire expression to lowercase
            let processedExpression = expression.toLowerCase();
            
            // Convert input for regular trig functions if in degree mode
            let evaluationX = x;
            if (this.angleMode === 'degrees') {
                // Check if THIS specific expression contains regular trig functions that need x converted
                const hasRegularTrigWithX = /\b(sin|cos|tan)\s*\(\s*[^)]*x[^)]*\)/i.test(processedExpression);
                // Check if THIS specific expression contains inverse trig functions (which use regular number inputs)
                const hasInverseTrigWithX = /\b(asin|acos|atan)\s*\(\s*[^)]*x[^)]*\)/i.test(processedExpression);
                
                // Convert input x from degrees to radians for regular trig functions
                if (hasRegularTrigWithX) {
                    evaluationX = x * Math.PI / 180;
                } else {
                    // Keep x as-is for inverse trig and other functions
                }
            }
            
            // Use math.js for safe mathematical expression evaluation
            const result = math.evaluate(processedExpression, { x: evaluationX });
            
            // Ensure the result is a finite number
            if (typeof result === 'number' && isFinite(result)) {
                // Convert result for inverse trig functions if in degree mode
                if (this.angleMode === 'degrees') {
                    const hasInverseTrig = /\b(asin|acos|atan)\s*\(/i.test(processedExpression);
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
    
    findClosestPolarPoint(func, screenX, screenY, tolerance) {
        try {
            let closestDistance = Infinity;
            let closestWorldX = 0;
            let closestWorldY = 0;
            
            const processedExpression = func.expression.toLowerCase();
            const compiled = math.compile(processedExpression);
            
            // Sample more densely for better detection
            const thetaStep = this.polarSettings.step / 2; // Higher resolution
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    const scope = { theta: theta, t: theta, pi: Math.PI, e: Math.E };
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
            
            const thetaStep = this.polarSettings.step;
            const thetaMin = this.polarSettings.thetaMin;
            const thetaMax = this.polarSettings.thetaMax;
            
            // Sample the polar function and find closest point to worldX
            for (let theta = thetaMin; theta <= thetaMax; theta += thetaStep) {
                try {
                    let processedExpression = func.expression.toLowerCase();
                    const compiled = math.compile(processedExpression);
                    const scope = { theta: theta, t: theta, pi: Math.PI, e: Math.E };
                    
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
        
        // If panning occurred, update range inputs and re-plot functions
        if (hasPanned) {
            this.updateRangeInputs();
            this.replotAllFunctions();
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
            if (func.enabled && func.points && func.points.length > 0) {
                this.drawFunction(func);
            }
        });
        
        // Draw tracing indicator if active or persistent
        if (this.input.tracing.active || this.input.persistentTracing.visible) {
            this.drawTracingIndicator();
        }
        
        // UI overlays removed - cleaner interface
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
        // Use yellow for angle labels to differentiate from axis labels and provide good contrast
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const angleColor = isDarkMode ? '#FFD700' : '#B8860B'; // Gold in dark mode, dark goldenrod in light mode

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
                        const hasRegularTrig = this.containsRegularTrigFunctions();
                        const hasInverseTrig = this.containsInverseTrigFunctions();
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
                        const hasRegularTrig = this.containsRegularTrigFunctions();
                        const hasInverseTrig = this.containsInverseTrigFunctions();
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
        // Format numbers for axis labels
        if (Math.abs(num) < 0.0001) return '0';
        
        if (Math.abs(num) >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (Math.abs(num) >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        if (Math.abs(num) >= 100) {
            return num.toFixed(0);
        }
        if (Math.abs(num) >= 10) {
            return num.toFixed(1);
        }
        if (Math.abs(num) >= 1) {
            return num.toFixed(1);
        }
        if (Math.abs(num) >= 0.1) {
            return num.toFixed(2);
        }
        if (Math.abs(num) >= 0.01) {
            return num.toFixed(3);
        }
        
        // For very small numbers, use scientific notation
        return num.toExponential(1);
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

    drawTracingIndicator() {
        let tracingData, tracingFunction;
        
        if (this.input.tracing.active) {
            // Use active tracing data
            tracingData = this.input.tracing;
            tracingFunction = this.findFunctionById(tracingData.functionId);
        } else if (this.input.persistentTracing.visible) {
            // Use persistent tracing data
            tracingData = this.input.persistentTracing;
            tracingFunction = { color: tracingData.functionColor }; // Simplified function object
        } else {
            return;
        }
        
        if (!tracingFunction) return;
        
        // Convert world coordinates to screen coordinates
        const screenPos = this.worldToScreen(tracingData.worldX, tracingData.worldY);
        
        // Skip drawing if point is outside the visible canvas
        if (screenPos.x < -20 || screenPos.x > this.viewport.width + 20 ||
            screenPos.y < -20 || screenPos.y > this.viewport.height + 20) {
            return;
        }
        
        // Draw the circle indicator
        this.ctx.save();
        
        // Circle - use function color
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = tracingFunction.color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, 8, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Inner dot
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Coordinate display - show polar coordinates (r, θ) in polar mode
        const x = tracingData.worldX;
        const y = tracingData.worldY;
        
        let coordText;
        if (this.plotMode === 'polar') {
            // Convert cartesian coordinates back to polar for display
            const r = Math.sqrt(x * x + y * y);
            let theta = Math.atan2(y, x);
            
            // Normalize theta to 0-2π range
            if (theta < 0) theta += 2 * Math.PI;
            
            // Format based on angle mode
            if (this.angleMode === 'degrees') {
                const thetaDegrees = theta * 180 / Math.PI;
                coordText = `(${this.formatCoordinate(r)}, ${this.formatCoordinate(thetaDegrees)}°)`;
            } else {
                coordText = `(${this.formatCoordinate(r)}, ${this.formatCoordinate(theta)})`;
            }
        } else {
            // Cartesian mode - show (x, y)
            coordText = `(${this.formatCoordinate(x)}, ${this.formatCoordinate(y)})`;
        }
        
        // Position text to avoid going off screen
        let textX = screenPos.x + 15;
        let textY = screenPos.y - 15;
        
        // Measure text to adjust position
        this.ctx.font = '14px Arial';
        const textMetrics = this.ctx.measureText(coordText);
        const textWidth = textMetrics.width;
        const textHeight = 16;
        
        // Adjust if text would go off screen
        if (textX + textWidth > this.viewport.width - 10) {
            textX = screenPos.x - textWidth - 15;
        }
        if (textY - textHeight < 10) {
            textY = screenPos.y + textHeight + 15;
        }
        
        // Draw text background using function color
        this.ctx.fillStyle = tracingFunction.color;
        this.ctx.fillRect(textX - 5, textY - textHeight, textWidth + 10, textHeight + 4);
        
        // Draw text with contrasting color
        this.ctx.fillStyle = this.getContrastingTextColor(tracingFunction.color);
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(coordText, textX, textY - textHeight + 2);
        
        this.ctx.restore();
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
        // Format coordinate values for display
        if (Math.abs(value) < 0.000001) return '0';
        
        if (Math.abs(value) >= 1000000) {
            return (value / 1000000).toFixed(2) + 'M';
        }
        if (Math.abs(value) >= 1000) {
            return (value / 1000).toFixed(2) + 'k';
        }
        if (Math.abs(value) >= 100) {
            return value.toFixed(1);
        }
        if (Math.abs(value) >= 10) {
            return value.toFixed(2);
        }
        if (Math.abs(value) >= 1) {
            return value.toFixed(3);
        }
        if (Math.abs(value) >= 0.1) {
            return value.toFixed(4);
        }
        if (Math.abs(value) >= 0.01) {
            return value.toFixed(5);
        }
        
        // For very small numbers, use scientific notation
        return value.toExponential(2);
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
        const trigRegex = /\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sec|csc|cot|asec|acsc|acot|sech|csch|coth)\s*\(/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            trigRegex.test(func.expression)
        );
    }

    containsInverseTrigFunctions() {
        // Check if any enabled function contains inverse trigonometric functions
        const inverseTrigRegex = /\b(asin|acos|atan|asec|acsc|acot)\s*\(/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            inverseTrigRegex.test(func.expression)
        );
    }

    containsRegularTrigFunctions() {
        // Check if any enabled function contains regular (non-inverse) trigonometric functions
        const regularTrigRegex = /\b(sin|cos|tan|sinh|cosh|tanh|sec|csc|cot|sech|csch|coth)\s*\(/i;
        return this.getAllFunctions().some(func => 
            func.enabled && 
            func.expression && 
            regularTrigRegex.test(func.expression)
        );
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
        if (!this.containsRegularTrigFunctions()) {
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
        if (!this.containsInverseTrigFunctions()) {
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
        if (!this.containsRegularTrigFunctions()) {
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
        if (!this.containsInverseTrigFunctions()) {
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

    handleMobileLayout(forceUpdate = false) {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        
        if (!hamburgerMenu || !functionPanel) return;
        
        const shouldBeMobile = this.isTrueMobile();
        
        // Don't interfere if mobile menu is currently open (user is actively using it)
        if (!forceUpdate && functionPanel.classList.contains('mobile-open')) {
            return;
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
                console.log('Service Worker registered:', registration);
                
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
                    console.log('Service Worker updated and activated');
                    // No need to reload here as it will happen from the updatefound handler
                });
                
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.graphiti = new Graphiti();
});