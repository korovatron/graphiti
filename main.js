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
            lastY: 0
        };
        
        // Mathematical functions
        this.functions = [];
        this.currentFunction = 'x^2';
        
        // Animation
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.startAnimationLoop();
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
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupEventListeners() {
        // Wait for elements to be available
        const startButton = document.getElementById('start-button');
        const graphButton = document.getElementById('graph-button');
        const clearButton = document.getElementById('clear-button');
        const zoomInButton = document.getElementById('zoom-in');
        const zoomOutButton = document.getElementById('zoom-out');
        const resetViewButton = document.getElementById('reset-view');
        const menuButton = document.getElementById('menu-button');
        const functionInput = document.getElementById('function-input');
        
        if (!startButton) {
            console.error('Start button not found!');
            return;
        }
        
        // UI Button Events
        startButton.addEventListener('click', () => {
            this.changeState(this.states.GRAPHING);
        });
        
        if (graphButton) {
            graphButton.addEventListener('click', () => {
                const input = document.getElementById('function-input');
                this.currentFunction = input.value;
                this.parseAndGraphFunction(this.currentFunction);
            });
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.functions = [];
            });
        }
        
        if (zoomInButton) {
            zoomInButton.addEventListener('click', () => {
                this.viewport.scale *= 1.2;
                this.updateViewport();
            });
        }
        
        if (zoomOutButton) {
            zoomOutButton.addEventListener('click', () => {
                this.viewport.scale /= 1.2;
                this.updateViewport();
            });
        }
        
        if (resetViewButton) {
            resetViewButton.addEventListener('click', () => {
                this.viewport.scale = 50;
                this.updateViewport();
            });
        }
        
        if (menuButton) {
            menuButton.addEventListener('click', () => {
                this.changeState(this.states.TITLE);
            });
        }
        
        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerStart(e.clientX, e.clientY));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e.clientX, e.clientY));
        this.canvas.addEventListener('mouseup', () => this.handlePointerEnd());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handlePointerStart(touch.clientX, touch.clientY);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handlePointerMove(touch.clientX, touch.clientY);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handlePointerEnd();
        }, { passive: false });
        
        // Keyboard Events
        document.addEventListener('keydown', (e) => {
            this.input.keys.add(e.key.toLowerCase());
            this.handleKeyboard(e);
        });
        
        document.addEventListener('keyup', (e) => {
            this.input.keys.delete(e.key.toLowerCase());
        });
        
        // Function input enter key
        if (functionInput) {
            functionInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const graphBtn = document.getElementById('graph-button');
                    if (graphBtn) graphBtn.click();
                }
            });
        }
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
                
                // Pan the viewport
                this.viewport.minX -= deltaX / this.viewport.scale;
                this.viewport.maxX -= deltaX / this.viewport.scale;
                this.viewport.minY += deltaY / this.viewport.scale;
                this.viewport.maxY += deltaY / this.viewport.scale;
            }
            
            this.input.lastX = x;
            this.input.lastY = y;
        }
        
        this.input.mouse.x = x;
        this.input.mouse.y = y;
    }
    
    handlePointerEnd() {
        this.input.mouse.down = false;
        this.input.dragging = false;
    }
    
    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.viewport.scale *= zoomFactor;
        this.updateViewport();
    }
    
    handleKeyboard(e) {
        switch(e.key.toLowerCase()) {
            case 'escape':
                this.changeState(this.states.TITLE);
                break;
            case '=':
            case '+':
                this.viewport.scale *= 1.1;
                this.updateViewport();
                break;
            case '-':
                this.viewport.scale /= 1.1;
                this.updateViewport();
                break;
        }
    }
    
    updateViewport() {
        const halfWidth = this.viewport.width / (2 * this.viewport.scale);
        const halfHeight = this.viewport.height / (2 * this.viewport.scale);
        
        this.viewport.minX = -halfWidth;
        this.viewport.maxX = halfWidth;
        this.viewport.minY = -halfHeight;
        this.viewport.maxY = halfHeight;
    }
    
    changeState(newState) {
        this.previousState = this.currentState;
        this.currentState = newState;
        
        // Show/hide UI elements based on state
        const titleScreen = document.getElementById('title-screen');
        const functionPanel = document.getElementById('function-panel');
        const controlsPanel = document.getElementById('controls-panel');
        
        switch(newState) {
            case this.states.TITLE:
                if (titleScreen) titleScreen.classList.remove('hidden');
                if (functionPanel) functionPanel.classList.add('hidden');
                if (controlsPanel) controlsPanel.classList.add('hidden');
                break;
            case this.states.GRAPHING:
                if (titleScreen) titleScreen.classList.add('hidden');
                if (functionPanel) functionPanel.classList.remove('hidden');
                if (controlsPanel) controlsPanel.classList.remove('hidden');
                break;
        }
    }
    
    parseAndGraphFunction(functionString) {
        console.log('Parsing function:', functionString);
        
        // Check if math.js is available
        if (typeof math === 'undefined') {
            console.error('Math.js library not loaded!');
            alert('Math library not loaded. Please refresh the page.');
            return;
        }
        
        try {
            // Simple function parser - you can expand this
            const points = [];
            const step = (this.viewport.maxX - this.viewport.minX) / this.viewport.width;
            
            console.log('Graphing range:', this.viewport.minX, 'to', this.viewport.maxX, 'step:', step);
            
            for (let x = this.viewport.minX; x <= this.viewport.maxX; x += step) {
                try {
                    const y = this.evaluateFunction(functionString, x);
                    if (isFinite(y)) {
                        points.push({ x, y });
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }
            
            console.log('Generated points:', points.length);
            if (points.length > 0) {
                console.log('Sample points:', points.slice(0, 5));
            }
            
            this.functions = [{ expression: functionString, points, color: '#4A90E2' }];
        } catch (error) {
            console.error('Error parsing function:', error);
            alert('Invalid function: ' + error.message);
        }
    }
    
    evaluateFunction(expression, x) {
        try {
            // Use math.js for safe mathematical expression evaluation
            // math.js automatically handles x substitution and mathematical functions
            const result = math.evaluate(expression, { x: x });
            
            // Ensure the result is a finite number
            if (typeof result === 'number' && isFinite(result)) {
                return result;
            } else {
                console.warn('Non-finite result for x =', x, 'result =', result);
                return NaN;
            }
        } catch (error) {
            console.warn('Evaluation error for x =', x, ':', error.message);
            // Return NaN for invalid expressions or points
            // This allows the graphing to skip invalid points gracefully
            return NaN;
        }
    }
    
    worldToScreen(worldX, worldY) {
        const screenX = this.viewport.centerX + (worldX * this.viewport.scale);
        const screenY = this.viewport.centerY - (worldY * this.viewport.scale);
        return { x: screenX, y: screenY };
    }
    
    screenToWorld(screenX, screenY) {
        const worldX = (screenX - this.viewport.centerX) / this.viewport.scale;
        const worldY = -(screenY - this.viewport.centerY) / this.viewport.scale;
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
        
        const panSpeed = 200 / this.viewport.scale; // Adjust for zoom level
        
        // Keyboard panning
        if (this.input.keys.has('arrowleft') || this.input.keys.has('a')) {
            this.viewport.minX -= panSpeed * deltaTime * 0.001;
            this.viewport.maxX -= panSpeed * deltaTime * 0.001;
        }
        if (this.input.keys.has('arrowright') || this.input.keys.has('d')) {
            this.viewport.minX += panSpeed * deltaTime * 0.001;
            this.viewport.maxX += panSpeed * deltaTime * 0.001;
        }
        if (this.input.keys.has('arrowup') || this.input.keys.has('w')) {
            this.viewport.minY += panSpeed * deltaTime * 0.001;
            this.viewport.maxY += panSpeed * deltaTime * 0.001;
        }
        if (this.input.keys.has('arrowdown') || this.input.keys.has('s')) {
            this.viewport.minY -= panSpeed * deltaTime * 0.001;
            this.viewport.maxY -= panSpeed * deltaTime * 0.001;
        }
    }
    
    // ================================
    // DRAWING/RENDERING
    // ================================
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#1A2F42';
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
        // Background pattern or animation
        this.ctx.save();
        this.ctx.globalAlpha = 0.1;
        this.drawGrid();
        this.ctx.restore();
    }
    
    drawGraphingScreen() {
        // Draw coordinate system
        this.drawGrid();
        this.drawAxes();
        
        // Draw functions
        this.functions.forEach(func => {
            this.drawFunction(func);
        });
        
        // Draw UI overlays
        this.drawCrosshair();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        // Vertical lines
        const gridSpacing = this.getGridSpacing();
        const startX = Math.floor(this.viewport.minX / gridSpacing) * gridSpacing;
        
        for (let x = startX; x <= this.viewport.maxX; x += gridSpacing) {
            const screenPos = this.worldToScreen(x, 0);
            this.ctx.moveTo(screenPos.x, 0);
            this.ctx.lineTo(screenPos.x, this.viewport.height);
        }
        
        // Horizontal lines
        const startY = Math.floor(this.viewport.minY / gridSpacing) * gridSpacing;
        
        for (let y = startY; y <= this.viewport.maxY; y += gridSpacing) {
            const screenPos = this.worldToScreen(0, y);
            this.ctx.moveTo(0, screenPos.y);
            this.ctx.lineTo(this.viewport.width, screenPos.y);
        }
        
        this.ctx.stroke();
    }
    
    drawAxes() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
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
    
    drawFunction(func) {
        if (func.points.length < 2) return;
        
        this.ctx.strokeStyle = func.color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        let first = true;
        for (const point of func.points) {
            const screenPos = this.worldToScreen(point.x, point.y);
            
            if (screenPos.x >= -10 && screenPos.x <= this.viewport.width + 10 &&
                screenPos.y >= -10 && screenPos.y <= this.viewport.height + 10) {
                
                if (first) {
                    this.ctx.moveTo(screenPos.x, screenPos.y);
                    first = false;
                } else {
                    this.ctx.lineTo(screenPos.x, screenPos.y);
                }
            }
        }
        
        this.ctx.stroke();
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
    }
    
    getGridSpacing() {
        const pixelsPerUnit = this.viewport.scale;
        
        if (pixelsPerUnit > 100) return 0.1;
        if (pixelsPerUnit > 50) return 0.5;
        if (pixelsPerUnit > 20) return 1;
        if (pixelsPerUnit > 10) return 2;
        if (pixelsPerUnit > 5) return 5;
        return 10;
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