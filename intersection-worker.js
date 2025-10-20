// intersection-worker.js - Web Worker for background intersection calculations
// This worker handles computationally expensive intersection detection without blocking the UI

console.log('Intersection worker loaded');

// Import math.js for function evaluation in the worker context
importScripts('https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js');

// Worker message handler
self.onmessage = function(event) {
    const { type, data } = event.data;
    
    console.log('Worker received message:', type);
    
    switch (type) {
        case 'TEST_COMMUNICATION':
            // Simple test to verify worker communication works
            self.postMessage({
                type: 'TEST_RESPONSE',
                data: { message: 'Worker communication successful!', timestamp: Date.now() }
            });
            break;
            
        case 'CALCULATE_INTERSECTIONS':
            try {
                console.log('Starting intersection calculations...');
                const startTime = performance.now();
                
                // Extract data from main thread
                const { functions, viewport, plotMode, maxResolution } = data;
                
                // For now, just simulate the calculation and return empty results
                // We'll implement the actual calculation logic in the next step
                const mockIntersections = [];
                
                const endTime = performance.now();
                const calculationTime = endTime - startTime;
                
                console.log(`Mock intersection calculation completed in ${calculationTime.toFixed(2)}ms`);
                
                // Send results back to main thread
                self.postMessage({
                    type: 'INTERSECTIONS_COMPLETE',
                    data: {
                        intersections: mockIntersections,
                        calculationTime: calculationTime,
                        functionCount: functions.length
                    }
                });
                
            } catch (error) {
                console.error('Worker error:', error);
                self.postMessage({
                    type: 'INTERSECTIONS_ERROR',
                    data: { error: error.message }
                });
            }
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('Worker error:', error);
    self.postMessage({
        type: 'WORKER_ERROR',
        data: { error: error.message }
    });
};

console.log('Intersection worker ready');