// Graphiti - Mathematical Function Explorer
// Main application logic with animation loop and state management

class Graphiti {
    constructor() {
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
        this.angleMode = 'degrees'; // 'degrees' or 'radians'
        
        // Canvas and viewport properties
        this.viewport = {
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
        
        // Mathematical functions
        this.functions = [];
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
    
    addFunction(expression = '') {
        const id = this.nextFunctionId++;
        const color = this.functionColors[(this.functions.length) % this.functionColors.length];
        
        const func = {
            id: id,
            expression: expression,
            points: [],
            color: color,
            enabled: true
        };
        
        this.functions.push(func);
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
            <input type="text" placeholder="e.g., sin(x), x^2, log(x)" value="${func.expression}">
            <button class="remove-btn">×</button>
        `;
        
        // Add event listeners
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
            func.expression = e.target.value;
            // Auto-plot with debouncing to avoid excessive calculations
            this.debouncePlot(func);
        });
        
        colorIndicator.addEventListener('click', () => {
            func.enabled = !func.enabled;
            this.updateFunctionVisualState(func, funcDiv);
        });
        
        removeBtn.addEventListener('click', () => {
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
        
        this.functions = this.functions.filter(f => f.id !== id);
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
        
        this.functions = [];
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
        
        try {
            // Calculate points for the current viewport
            const points = [];
            const step = (this.viewport.maxX - this.viewport.minX) / this.viewport.width;
            
            for (let x = this.viewport.minX; x <= this.viewport.maxX; x += step) {
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
            alert(`Invalid function "${func.expression}": ${error.message}`);
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
            
            this.viewport.width = rect.width;
            this.viewport.height = rect.height;
            this.viewport.centerX = rect.width / 2;
            this.viewport.centerY = rect.height / 2;
            
            this.updateViewport();
        };
        
        // Initial resize
        resizeCanvas();
        
        // Handle window resize (desktop) and orientation change (mobile)
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('orientationchange', () => {
            // Add a small delay for orientation change to complete
            setTimeout(resizeCanvas, 100);
        });
        
        // Additional mobile-specific resize handling
        if ('screen' in window && 'orientation' in window.screen) {
            window.screen.orientation.addEventListener('change', () => {
                setTimeout(resizeCanvas, 100);
            });
        }
        
        // Handle visual viewport changes (mobile keyboard, etc.)
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', resizeCanvas);
        }
    }
    
    setupEventListeners() {
        // Wait for elements to be available
        const startButton = document.getElementById('start-button');
        const addFunctionButton = document.getElementById('add-function');
        const zoomInButton = document.getElementById('zoom-in');
        const zoomOutButton = document.getElementById('zoom-out');
        const resetViewButton = document.getElementById('reset-view');
        const xMinInput = document.getElementById('x-min');
        const xMaxInput = document.getElementById('x-max');
        const yMinInput = document.getElementById('y-min');
        const yMaxInput = document.getElementById('y-max');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const functionPanel = document.getElementById('function-panel');
        
        if (!startButton) {
            console.error('Start button not found!');
            return;
        }
        
        // UI Button Events
        startButton.addEventListener('click', () => {
            this.changeState(this.states.GRAPHING);
            // Add the first function when starting
            if (this.functions.length === 0) {
                this.addFunction('x^2');
            }
            // Open the function panel by default so users can start immediately
            this.openMobileMenu();
        });
        
        if (addFunctionButton) {
            addFunctionButton.addEventListener('click', () => {
                this.addFunction('');
            });
        }
        
        if (zoomInButton) {
            zoomInButton.addEventListener('click', () => {
                this.zoomIn();
            });
        }
        
        if (zoomOutButton) {
            zoomOutButton.addEventListener('click', () => {
                this.zoomOut();
            });
        }
        
        if (resetViewButton) {
            resetViewButton.addEventListener('click', () => {
                // Reset to exact initial state
                this.viewport.scale = this.initialViewport.scale;
                this.viewport.minX = this.initialViewport.minX;
                this.viewport.maxX = this.initialViewport.maxX;
                this.viewport.minY = this.initialViewport.minY;
                this.viewport.maxY = this.initialViewport.maxY;
                
                // Update range inputs to reflect the reset
                this.updateRangeInputs();
                
                // Re-plot all functions with the reset viewport
                this.replotAllFunctions();
            });
        }
        
        // Theme Toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }
        
        // Angle Mode Toggle
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        if (angleModeToggle) {
            angleModeToggle.addEventListener('click', () => {
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
        
        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerStart(e.clientX, e.clientY));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e.clientX, e.clientY));
        this.canvas.addEventListener('mouseup', () => this.handlePointerEnd());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Click on canvas to close hamburger menu (desktop only)
        this.canvas.addEventListener('click', (e) => {
            // Only close on desktop, not mobile (to avoid interfering with touch gestures)
            if (window.innerWidth > 768) {
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
            // Only handle if not on canvas (canvas has its own handlers)
            if (e.target !== this.canvas) {
                const touch = e.touches[0];
                this.input.startX = touch.clientX;
                this.input.startY = touch.clientY;
                this.input.startTime = Date.now();
                this.input.maxMoveDistance = 0;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            // Only handle if not on canvas and we have start coordinates
            if (e.target !== this.canvas && this.input.startX !== null && this.input.startY !== null) {
                const touch = e.touches[0];
                const moveDistance = Math.sqrt(
                    Math.pow(touch.clientX - this.input.startX, 2) + 
                    Math.pow(touch.clientY - this.input.startY, 2)
                );
                this.input.maxMoveDistance = Math.max(this.input.maxMoveDistance, moveDistance);
            }
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            // Only handle if not on canvas and we have start coordinates
            if (e.target !== this.canvas && this.input.startX !== null && this.input.startY !== null) {
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
                    this.debounceRangeUpdate();
                });
                
                input.addEventListener('keydown', (e) => {
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
    }
    
    handlePointerMove(x, y) {
        if (this.input.mouse.down && this.currentState === this.states.GRAPHING) {
            const deltaX = x - this.input.lastX;
            const deltaY = y - this.input.lastY;
            
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
            // Do immediate final replot
            this.replotAllFunctions();
        }
        
        this.input.mouse.down = false;
        this.input.dragging = false;
    }
    
    // Touch handling methods for pinch-to-zoom
    handleTouchStart(e) {
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
                // Uniform pinch - zoom both axes (original behavior)
                const zoomFactor = currentDistance / this.input.pinch.initialDistance;
                const newScale = this.input.pinch.initialScale * zoomFactor;
                
                if (newScale >= minScale && newScale <= maxScale) {
                    this.viewport.scale = newScale;
                    this.updateViewport();
                }
            }
        }
    }
    
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            // All touches ended - check for tap
            const tapDuration = Date.now() - this.input.startTime;
            const isTap = this.input.maxMoveDistance <= 10 && tapDuration <= 300;
            
            if (isTap && this.input.startX !== null && this.input.startY !== null) {
                // This was a tap - check if it's outside the function panel to close hamburger
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
    
    changeState(newState) {
        this.previousState = this.currentState;
        this.currentState = newState;
        
        // Show/hide UI elements based on state
        const titleScreen = document.getElementById('title-screen');
        const functionPanel = document.getElementById('function-panel');
        const controlsPanel = document.getElementById('controls-panel');
        const hamburgerMenu = document.getElementById('hamburger-menu');
        
        switch(newState) {
            case this.states.TITLE:
                if (titleScreen) titleScreen.classList.remove('hidden');
                if (functionPanel) functionPanel.classList.add('hidden');
                if (controlsPanel) controlsPanel.classList.add('hidden');
                if (hamburgerMenu) hamburgerMenu.style.display = 'none';
                this.closeMobileMenu();
                break;
            case this.states.GRAPHING:
                if (titleScreen) titleScreen.classList.add('hidden');
                if (functionPanel) functionPanel.classList.remove('hidden');
                if (controlsPanel) controlsPanel.classList.remove('hidden');
                if (hamburgerMenu) hamburgerMenu.style.display = '';
                break;
        }
    }
    
    // Mobile Menu Methods
    toggleMobileMenu() {
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
        
        if (hamburgerMenu) hamburgerMenu.classList.add('active');
        if (functionPanel) functionPanel.classList.add('mobile-open');
        
        // Only show overlay on actual mobile devices
        if (window.innerWidth <= 768 && mobileOverlay) {
            mobileOverlay.style.display = 'block';
        }
    }
    
    closeMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const functionPanel = document.getElementById('function-panel');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        if (hamburgerMenu) hamburgerMenu.classList.remove('active');
        if (functionPanel) functionPanel.classList.remove('mobile-open');
        if (mobileOverlay) mobileOverlay.style.display = 'none';
    }
    
    toggleTheme() {
        const html = document.documentElement;
        const themeToggle = document.getElementById('theme-toggle');
        const currentTheme = html.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Switch to dark mode
            html.removeAttribute('data-theme');
            if (themeToggle) themeToggle.textContent = '🌙 Dark Mode';
            localStorage.setItem('graphiti-theme', 'dark');
        } else {
            // Switch to light mode
            html.setAttribute('data-theme', 'light');
            if (themeToggle) themeToggle.textContent = '☀️ Light Mode';
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
            if (themeToggle) themeToggle.textContent = '☀️ Light Mode';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeToggle) themeToggle.textContent = '🌙 Dark Mode';
        }
        
        this.updateCanvasBackground();
    }
    
    toggleAngleMode() {
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        
        if (this.angleMode === 'degrees') {
            this.angleMode = 'radians';
            if (angleModeToggle) angleModeToggle.textContent = '📐 Radians';
            localStorage.setItem('graphiti-angle-mode', 'radians');
            
            // Set appropriate ranges for radians: -2π to 2π for X, -2 to 2 for Y
            this.viewport.minX = -2 * Math.PI;
            this.viewport.maxX = 2 * Math.PI;
            this.viewport.minY = -2;
            this.viewport.maxY = 2;
        } else {
            this.angleMode = 'degrees';
            if (angleModeToggle) angleModeToggle.textContent = '📐 Degrees';
            localStorage.setItem('graphiti-angle-mode', 'degrees');
            
            // Set appropriate ranges for degrees: -360° to 360° for X, -2 to 2 for Y
            this.viewport.minX = -360;
            this.viewport.maxX = 360;
            this.viewport.minY = -2;
            this.viewport.maxY = 2;
        }
        
        // Update scale for consistent grid/label spacing
        this.updateViewportScale();
        
        // Update range inputs to reflect the new ranges
        this.updateRangeInputs();
        
        // Re-plot all functions since angle mode affects trig functions
        this.replotAllFunctions();
    }
    
    initializeAngleMode() {
        // Load saved angle mode from localStorage
        const savedAngleMode = localStorage.getItem('graphiti-angle-mode');
        const angleModeToggle = document.getElementById('angle-mode-toggle');
        
        if (savedAngleMode === 'radians') {
            this.angleMode = 'radians';
            if (angleModeToggle) angleModeToggle.textContent = '📐 Radians';
        } else {
            this.angleMode = 'degrees';
            if (angleModeToggle) angleModeToggle.textContent = '📐 Degrees';
        }
    }
    
    evaluateFunction(expression, x) {
        try {
            // Make function names case-insensitive for mobile compatibility
            // Convert common function names to lowercase
            let processedExpression = expression
                .replace(/\bSin\b/g, 'sin')
                .replace(/\bCos\b/g, 'cos')
                .replace(/\bTan\b/g, 'tan')
                .replace(/\bLog\b/g, 'log')
                .replace(/\bLn\b/g, 'ln')
                .replace(/\bSqrt\b/g, 'sqrt')
                .replace(/\bAbs\b/g, 'abs')
                .replace(/\bExp\b/g, 'exp')
                .replace(/\bFloor\b/g, 'floor')
                .replace(/\bCeil\b/g, 'ceil')
                .replace(/\bRound\b/g, 'round')
                .replace(/\bAsin\b/g, 'asin')
                .replace(/\bAcos\b/g, 'acos')
                .replace(/\bAtan\b/g, 'atan')
                .replace(/\bSinh\b/g, 'sinh')
                .replace(/\bCosh\b/g, 'cosh')
                .replace(/\bTanh\b/g, 'tanh');
            
            // Handle degrees mode by converting degree arguments to radians
            if (this.angleMode === 'degrees') {
                // Simple regex replacement to multiply trig function arguments by pi/180
                processedExpression = processedExpression
                    .replace(/sin\(([^)]+)\)/g, 'sin(($1) * pi / 180)')
                    .replace(/cos\(([^)]+)\)/g, 'cos(($1) * pi / 180)')
                    .replace(/tan\(([^)]+)\)/g, 'tan(($1) * pi / 180)');
                
                // For inverse trig functions, multiply the result by 180/pi
                processedExpression = processedExpression
                    .replace(/asin\(([^)]+)\)/g, 'asin($1) * 180 / pi')
                    .replace(/acos\(([^)]+)\)/g, 'acos($1) * 180 / pi')
                    .replace(/atan\(([^)]+)\)/g, 'atan($1) * 180 / pi');
            }
            
            // Use math.js for safe mathematical expression evaluation
            const result = math.evaluate(processedExpression, { x: x });
            
            // Ensure the result is a finite number
            if (typeof result === 'number' && isFinite(result)) {
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
        
        // Draw functions
        this.functions.forEach(func => {
            if (func.enabled && func.points && func.points.length > 0) {
                this.drawFunction(func);
            }
        });
        
        // Draw UI overlays
        this.drawCrosshair();
    }
    
    drawGrid() {
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
        const yGridSpacing = this.getYGridSpacing();
        const startY = Math.floor(this.viewport.minY / yGridSpacing) * yGridSpacing;
        
        for (let y = startY; y <= this.viewport.maxY; y += yGridSpacing) {
            const screenPos = this.worldToScreen(0, y);
            this.ctx.moveTo(0, screenPos.y);
            this.ctx.lineTo(this.viewport.width, screenPos.y);
        }
        
        this.ctx.stroke();
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
        
        // Use axis-specific label spacing for directional zoom compatibility
        const xLabelSpacing = this.getTrigAwareXLabelSpacing();
        const yLabelSpacing = this.getYLabelSpacing();
        
        // X-axis labels
        if (this.viewport.minY <= 0 && this.viewport.maxY >= 0) {
            const axisY = this.worldToScreen(0, 0).y;
            const startX = Math.floor(this.viewport.minX / xLabelSpacing) * xLabelSpacing;
            
            for (let x = startX; x <= this.viewport.maxX; x += xLabelSpacing) {
                if (Math.abs(x) < 0.0001) continue; // Skip zero label
                
                const screenPos = this.worldToScreen(x, 0);
                if (screenPos.x >= 20 && screenPos.x <= this.viewport.width - 20) {
                    const label = this.containsTrigFunctions() ? this.formatTrigNumber(x) : this.formatNumber(x);
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
                    const label = this.formatNumber(y);
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
            
            // Only draw points that are reasonably close to the viewport
            if (screenPos.x >= -50 && screenPos.x <= this.viewport.width + 50 &&
                screenPos.y >= -50 && screenPos.y <= this.viewport.height + 50) {
                
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
    
    drawCrosshair() {
        if (this.currentState !== this.states.GRAPHING) return;
        
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        
        // Vertical line at mouse
        this.ctx.moveTo(this.input.mouse.x, 0);
        this.ctx.lineTo(this.input.mouse.x, this.viewport.height);
        
        // Horizontal line at mouse
        this.ctx.moveTo(0, this.input.mouse.y);
        this.ctx.lineTo(this.viewport.width, this.input.mouse.y);
        
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw coordinate display
        this.drawCoordinateDisplay();
    }
    
    drawCoordinateDisplay() {
        // Convert mouse position to world coordinates
        const worldPos = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
        
        // Format coordinates
        const xCoord = this.formatCoordinate(worldPos.x);
        const yCoord = this.formatCoordinate(worldPos.y);
        const coordText = `(${xCoord}, ${yCoord})`;
        
        // Set up text styling
        this.ctx.font = '14px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // Measure text for background sizing
        const textMetrics = this.ctx.measureText(coordText);
        const textWidth = textMetrics.width;
        const textHeight = 16;
        const padding = 8;
        const margin = 10;
        
        // Calculate background dimensions
        const bgWidth = textWidth + padding * 2;
        const bgHeight = textHeight + padding * 2;
        
        // Position in top-right corner, but ensure it stays within screen bounds
        let bgX = this.viewport.width - bgWidth - margin;
        let bgY = margin;
        
        // Ensure it doesn't go off the right edge (safety check)
        if (bgX + bgWidth > this.viewport.width) {
            bgX = this.viewport.width - bgWidth - 5;
        }
        
        // Ensure it doesn't go off the left edge (for very wide coordinate text)
        if (bgX < 5) {
            bgX = 5;
            // If the text is still too wide, we might need to truncate or use smaller font
            // For now, just position it at the left edge
        }
        
        // Draw background to match function panel style (fixed colors)
        this.ctx.fillStyle = 'rgba(42, 63, 90, 0.95)'; // Exact same as other panels
        
        // Draw rounded rectangle (fallback for older browsers)
        const radius = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(bgX + radius, bgY);
        this.ctx.lineTo(bgX + bgWidth - radius, bgY);
        this.ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
        this.ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
        this.ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
        this.ctx.lineTo(bgX + radius, bgY + bgHeight);
        this.ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
        this.ctx.lineTo(bgX, bgY + radius);
        this.ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Optional: Add subtle border to match function panel (fixed color)
        this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.3)'; // Same as function panel
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Draw text (fixed color)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White text like other panels
        this.ctx.fillText(coordText, bgX + padding, bgY + padding);
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
        return this.functions.some(func => 
            func.enabled && 
            func.expression && 
            trigRegex.test(func.expression)
        );
    }
    
    getTrigAwareXGridSpacing() {
        if (!this.containsTrigFunctions()) {
            return this.getXGridSpacing(); // Use normal spacing if no trig functions
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
        if (!this.containsTrigFunctions()) {
            return this.getXLabelSpacing(); // Use normal spacing if no trig functions
        }
        
        // For trig functions, use the same spacing as grid lines for alignment
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
    // SERVICE WORKER REGISTRATION
    // ================================
    
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('Service Worker registered:', registration);
                
                // Handle updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New update available
                            if (confirm('New version available! Reload to update?')) {
                                window.location.reload();
                            }
                        }
                    });
                });
                
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.graphiti = new Graphiti();
});