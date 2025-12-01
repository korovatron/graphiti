# Bug Report - Performance Degradation Leading to Unresponsiveness

**Date:** December 1, 2025  
**Platform:** PWA on Windows  
**Version:** v1.584  
**Status:** ✅ RESOLVED in v1.585

## Issue Description
App became progressively slower and eventually completely unresponsive. Not a hard crash - gradual performance degradation observed in real-time.

## Root Cause - IDENTIFIED! 🎯
**X-intercept calculation blocking UI thread.**

With `y=cos(x)` from x=-109 to x=81 (190-unit range), cosine has ~60 x-intercepts (one every π units). The intercept-finding algorithm was:
1. Sampling 100 points synchronously
2. Finding ALL intercepts without limit
3. Blocking UI during calculation
4. User witnessed partial rendering (~75% done), freeze, update, freeze again

## Fix Applied (v1.585)
Added `maxIntercepts = 20` limit in both:
- `findXInterceptsForFunction()` - caps x-intercepts at 20
- `findYInterceptsForFunction()` - caps y-intercepts at 20

Early exit when limit reached prevents UI freeze while still showing representative intercepts.

## Symptoms
- Panning became increasingly sluggish
- Zooming lagged progressively worse
- Button clicks delayed/unresponsive
- Eventually completely frozen

## Reproduction Context

### Viewport Settings
- **xmin:** -109
- **xmax:** 81
- **ymin:** -7
- **ymax:** 35

### Functions Plotted
1. `y=cos(x)`
2. Astroid (implicit curve: `x^(2/3)+y^(2/3)=1`)

## Analysis Notes
Performance degradation suggests:
- Memory leak (gradually consuming resources)
- Runaway computation (recursive/infinite loop building up)
- Canvas rendering accumulation (not clearing properly)
- Badge/intersection calculation explosion
- Event listener pile-up

## Areas to Investigate
1. **Implicit curve rendering** - Astroid uses marching squares, could be generating excessive geometry
2. **Badge calculations** - Intersection/turning point badges at this viewport scale
3. **Animation loop** - Check if requestAnimationFrame is accumulating
4. **Expression cache** - May be growing unbounded
5. **Event listeners** - Could be stacking on pan/zoom
6. **Canvas context** - Previous context degradation issues

## Next Steps
- Add performance monitoring (console.time for render loop)
- Check memory usage in Chrome DevTools during reproduction
- Add frame rate counter to detect when degradation starts
- Profile the marching squares algorithm at this viewport scale
- Check if badge arrays are growing unbounded
- Verify expression cache has proper limits

## Priority
**HIGH** - Affects core usability, user experienced it happening in production
