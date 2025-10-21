// intersection-worker.js - Web Worker for background intersection calculations
// This worker handles computationally expensive intersection detection without blocking the UI

console.log('Intersection worker loaded');

// Import math.js for function evaluation in the worker context
importScripts('https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js');

// Global cancellation flag
let isCancelled = false;

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
            
        case 'CANCEL_CALCULATION':
            // Set cancellation flag to abort current calculation
            isCancelled = true;
            console.log('Worker: Calculation cancelled');
            self.postMessage({
                type: 'CALCULATION_CANCELLED',
                data: { timestamp: Date.now() }
            });
            break;
            
        case 'CALCULATE_INTERSECTIONS':
            try {
                // Reset cancellation flag for new calculation
                isCancelled = false;
                console.log('Starting intersection calculations...');
                const startTime = performance.now();
                
                // Extract data from main thread
                const { functions, viewport, plotMode, maxResolution, calculationType } = data;
                
                // Apply adaptive resolution based on function count
                const adaptiveResolution = functions.length > 10 ? 400 : functions.length > 6 ? 600 : 1000;
                console.log(`Using adaptive resolution: ${adaptiveResolution} points for ${functions.length} functions (${calculationType || 'mixed'} calculation)`);
                
                // Calculate intersections using the same logic as main thread
                const intersections = findIntersections(functions, plotMode);
                
                // Check if calculation was cancelled before sending results
                if (isCancelled) {
                    console.log('Worker: Calculation was cancelled, not sending results');
                    return;
                }
                
                const endTime = performance.now();
                const calculationTime = endTime - startTime;
                
                console.log(`Intersection calculation completed: ${intersections.length} intersections found in ${calculationTime.toFixed(2)}ms`);
                
                // Send results back to main thread
                self.postMessage({
                    type: 'INTERSECTIONS_COMPLETE',
                    data: {
                        intersections: intersections,
                        calculationTime: calculationTime,
                        functionCount: functions.length,
                        calculationType: calculationType || 'mixed'
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

// ================================
// INTERSECTION DETECTION FUNCTIONS
// ================================

function findIntersections(functions, plotMode) {
    // Find intersection points between all pairs of enabled functions
    const intersections = [];
    const enabledFunctions = functions.filter(f => f.enabled && f.points.length > 0);
    
    console.log(`Worker: Processing ${enabledFunctions.length} functions for intersections`);
    enabledFunctions.forEach((f, i) => {
        console.log(`  Function ${i}: ${f.expression} (${f.points.length} points, implicit: ${f.isImplicit || f.expression.includes('=')})`);
    });
    
    // Check all pairs of functions
    for (let i = 0; i < enabledFunctions.length; i++) {
        // Check for cancellation between function pairs
        if (isCancelled) {
            console.log('Worker: Intersection calculation cancelled');
            return [];
        }
        
        for (let j = i + 1; j < enabledFunctions.length; j++) {
            const func1 = enabledFunctions[i];
            const func2 = enabledFunctions[j];
            
            console.log(`Worker: Checking intersections between "${func1.expression}" and "${func2.expression}"`);
            
            const pairIntersections = findIntersectionsBetweenFunctions(func1, func2, plotMode);
            console.log(`  Found ${pairIntersections.length} intersections`);
            intersections.push(...pairIntersections);
        }
    }
    
    console.log(`Worker: Total intersections found: ${intersections.length}`);
    return intersections;
}

function findIntersectionsBetweenFunctions(func1, func2, plotMode) {
    const intersections = [];
    const points1 = func1.points;
    const points2 = func2.points;
    
    if (points1.length === 0 || points2.length === 0) {
        return intersections;
    }
    
    // Check if either function is implicit (has NaN separators)
    const isImplicit1 = points1.some(p => !isFinite(p.x) || !isFinite(p.y));
    const isImplicit2 = points2.some(p => !isFinite(p.x) || !isFinite(p.y));
    
    // Handle different combinations of function types
    if (isImplicit1 && isImplicit2) {
        // Both implicit - use line segment intersection
        console.log('  Both functions are implicit - using segment intersection');
        return findImplicitIntersections(func1, func2);
    } else if (isImplicit1 || isImplicit2) {
        // Mixed explicit/implicit - use hybrid method
        console.log('  Mixed explicit/implicit - using hybrid intersection');
        return findMixedIntersections(func1, func2, isImplicit1);
    }
    
    // Both explicit - use original interpolation method
    console.log('  Both functions are explicit - using interpolation method');
    
    // Original logic for explicit functions
    if (plotMode === 'cartesian') {
        // For cartesian functions, use x-axis interpolation method
        const allX = [...new Set([...points1.map(p => p.x), ...points2.map(p => p.x)])].sort((a, b) => a - b);
        
        for (let i = 0; i < allX.length - 1; i++) {
            // Check for cancellation every 100 iterations to avoid excessive checking
            if (i % 100 === 0 && isCancelled) {
                return [];
            }
            
            const x1 = allX[i];
            const x2 = allX[i + 1];
            
            // Interpolate y values for both functions at these x points
            const y1_at_x1 = interpolateYAtX(func1, x1);
            const y1_at_x2 = interpolateYAtX(func1, x2);
            const y2_at_x1 = interpolateYAtX(func2, x1);
            const y2_at_x2 = interpolateYAtX(func2, x2);
            
            if (y1_at_x1 !== null && y1_at_x2 !== null && y2_at_x1 !== null && y2_at_x2 !== null) {
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
        
        // Second pass: look for tangent intersections using local minima detection
        // Sample every 10th point to avoid dense detection
        for (let i = 10; i < allX.length - 10; i += 5) {
            // Check for cancellation every 50 iterations
            if (i % 50 === 0 && isCancelled) {
                return [];
            }
            
            const x0 = allX[i - 5];
            const x1 = allX[i];
            const x2 = allX[i + 5];
            
            const y1_at_x0 = interpolateYAtX(func1, x0);
            const y1_at_x1 = interpolateYAtX(func1, x1);
            const y1_at_x2 = interpolateYAtX(func1, x2);
            const y2_at_x0 = interpolateYAtX(func2, x0);
            const y2_at_x1 = interpolateYAtX(func2, x1);
            const y2_at_x2 = interpolateYAtX(func2, x2);
            
            if (y1_at_x0 !== null && y1_at_x1 !== null && y1_at_x2 !== null && 
                y2_at_x0 !== null && y2_at_x1 !== null && y2_at_x2 !== null) {
                
                // Calculate distances between functions at these points
                const dist0 = Math.abs(y1_at_x0 - y2_at_x0);
                const dist1 = Math.abs(y1_at_x1 - y2_at_x1);
                const dist2 = Math.abs(y1_at_x2 - y2_at_x2);
                
                // Check if x1 is a local minimum in distance
                if (dist1 < dist0 && dist1 < dist2) {
                    // Define threshold for tangent detection
                    const threshold = 0.02; // Fallback threshold for worker
                    
                    if (dist1 <= threshold) {
                        // Check if this is too close to existing intersections
                        const tooClose = intersections.some(existing => 
                            Math.abs(existing.x - x1) < Math.abs(x2 - x0) * 0.5
                        );
                        
                        if (!tooClose) {
                            intersections.push({
                                x: x1,
                                y: (y1_at_x1 + y2_at_x1) / 2,
                                func1: func1,
                                func2: func2,
                                isApproximate: true,
                                isTangent: true
                            });
                        }
                    }
                }
            }
        }
    } else if (plotMode === 'polar') {
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
                const intersection = findLineSegmentIntersection(
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

function findImplicitIntersections(func1, func2) {
    const intersections = [];
    const segments1 = getLineSegments(func1.points);
    const segments2 = getLineSegments(func2.points);
    
    // Simple O(n²) approach but with reasonable segment counts
    for (const seg1 of segments1) {
        for (const seg2 of segments2) {
            const intersection = findLineSegmentIntersection(
                seg1.start, seg1.end, seg2.start, seg2.end
            );
            
            if (intersection) {
                // Reasonable duplicate filtering
                const isDuplicate = intersections.some(existing => 
                    Math.abs(existing.x - intersection.x) < 0.01 && 
                    Math.abs(existing.y - intersection.y) < 0.01
                );
                
                if (!isDuplicate) {
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

function findMixedIntersections(func1, func2, func1IsImplicit) {
    const intersections = [];
    
    // Determine which function is explicit and which is implicit
    const explicitFunc = func1IsImplicit ? func2 : func1;
    const implicitFunc = func1IsImplicit ? func1 : func2;
    
    console.log(`  Explicit function has ${explicitFunc.points.length} points`);
    console.log(`  Implicit function has ${implicitFunc.points.length} points`);
    
    // Get line segments from implicit function
    const implicitSegments = getLineSegments(implicitFunc.points);
    
    console.log(`  Found ${implicitSegments.length} implicit segments`);
    
    // For each implicit segment, check intersection with explicit function curve
    for (const segment of implicitSegments) {
        // Find intersections between this line segment and the explicit function
        const segmentIntersections = findSegmentCurveIntersections(segment, explicitFunc, implicitFunc);
        intersections.push(...segmentIntersections);
    }
    
    console.log(`  Found ${intersections.length} mixed intersections`);
    return intersections;
}

function findSegmentCurveIntersections(segment, explicitFunc, implicitFunc) {
    const intersections = [];
    const { start: segStart, end: segEnd } = segment;
    
    // Validate segment coordinates
    if (isNaN(segStart.x) || isNaN(segStart.y) || isNaN(segEnd.x) || isNaN(segEnd.y)) {
        console.log('  Skipping invalid segment with NaN coordinates');
        return intersections;
    }
    
    // Check intersection with each pair of consecutive points in explicit function
    for (let i = 0; i < explicitFunc.points.length - 1; i++) {
        const curveP1 = explicitFunc.points[i];
        const curveP2 = explicitFunc.points[i + 1];
        
        // Skip if curve points are invalid
        if (isNaN(curveP1.x) || isNaN(curveP1.y) || isNaN(curveP2.x) || isNaN(curveP2.y)) {
            continue;
        }
        
        // Check if line segments intersect using existing function
        const intersection = findLineSegmentIntersection(segStart, segEnd, curveP1, curveP2);
        
        if (intersection) {
            // Validate intersection coordinates
            if (isNaN(intersection.x) || isNaN(intersection.y)) {
                console.log('  Skipping intersection with NaN coordinates:', intersection);
                continue;
            }
            
            // Check for duplicates
            const isDuplicate = intersections.some(existing => 
                Math.abs(existing.x - intersection.x) < 0.01 && 
                Math.abs(existing.y - intersection.y) < 0.01
            );
            
            if (!isDuplicate) {
                intersections.push({
                    x: intersection.x,
                    y: intersection.y,
                    func1: explicitFunc,
                    func2: implicitFunc,
                    isApproximate: true
                });
            }
        }
    }
    
    return intersections;
}

function getLineSegments(points) {
    const segments = [];
    
    // Process points in groups of 3 (start, end, NaN)
    for (let i = 0; i < points.length - 1; i += 3) {
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

function findLineSegmentIntersection(p1, p2, p3, p4) {
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

function interpolateYAtX(func, targetX) {
    const points = func.points;
    if (points.length === 0) return null;
    
    // Check if this is an implicit function (has disconnected segments)
    const hasDisconnectedSegments = points.some(p => !isFinite(p.x) || !isFinite(p.y));
    
    if (hasDisconnectedSegments) {
        // For implicit functions, only use exact matches or very close points
        // Don't interpolate across disconnected segments
        let closestPoint = null;
        let minDistance = Infinity;
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (isFinite(point.x) && isFinite(point.y)) {
                const distance = Math.abs(point.x - targetX);
                if (distance < minDistance && distance < 0.01) { // Very close threshold
                    minDistance = distance;
                    closestPoint = point;
                }
            }
        }
        
        return closestPoint ? closestPoint.y : null;
    }
    
    // For explicit functions, use original interpolation logic
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        if (p1.x <= targetX && targetX <= p2.x && p1.connected && p2.connected) {
            // Linear interpolation
            const ratio = (targetX - p1.x) / (p2.x - p1.x);
            return p1.y + ratio * (p2.y - p1.y);
        }
    }
    
    return null; // targetX is outside the function's domain
}

console.log('Intersection worker ready');