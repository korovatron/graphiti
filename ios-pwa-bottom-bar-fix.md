# iOS PWA Intermittent Bottom Bar Fix

## The Problem

When the app opens in full-screen PWA mode on iPhone, or after rotating from
landscape back to portrait in PWA mode, there can sometimes be a bar across the
bottom of the screen. It is intermittent - sometimes present, sometimes not.

This is caused by a race condition: iOS does not always have the
`safe-area-inset-*` values ready at the moment the app launches. The app
calculates its height too early, gets an incorrect value, and renders with a
gap at the bottom. When you rotate and rotate back, iOS recalculates everything
and the correct height is used. In the rotation case, iOS can first report the
old landscape height, then a portrait height that still behaves like Safari
browser mode with chrome reserved at the bottom.

There is also a secondary bug: in PWA/standalone mode, iOS incorrectly
**subtracts** `safe-area-inset-top` from `window.innerHeight`, making the
reported height about 59px too short on iPhone (32px on iPad). This leaves the
gap at the bottom.

A later Safari/PWA discovery is important: `visualViewport.height` must not be
used as the app-wide full-screen height. On iOS it can report transient heights
while the share sheet, browser chrome, screenshots, or tab/app switching are in
progress. If that value is written to `--actual-vh`, the whole layout can be
poisoned until another resize/orientation event corrects it. Graphiti now uses
`window.innerHeight` as the source of truth for `--actual-vh`, matching the
behaviour that proved stable in Vectorama.

---

## How It Was Fixed in Graphiti

The fix lives in the `fixIOSViewportBug()` method in `main.js`, which is called
from the constructor as the very first thing.

### The CSS side

The fix that finally matched Vectorama has two parts: use the JS-calculated
height, and pin the app shell to the installed PWA viewport so a short transient
height cannot expose the page background below the app.

```css
html, body {
    width: 100%;
    height: 100%;
    height: var(--actual-vh, 100vh);
    min-height: 100vh;
    min-height: var(--actual-vh, 100vh);
}

#app-container {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: var(--actual-vh, 100vh);
    min-height: var(--actual-vh, 100vh);
}

#function-panel {
    position: fixed;
    top: 0;
    height: 100vh;
    height: var(--actual-vh, 100vh);
    min-height: var(--actual-vh, 100vh);
}
```

This means the JavaScript can set the correct height at runtime instead of
relying only on the browser's `100vh` calculation. The `position: fixed; inset:
0` app shell is the part that fixed the remaining rotation gap seen in testing.

### The JavaScript side (`fixIOSViewportBug()`)

```js
fixIOSViewportBug() {
    let lastKnownHeight = 0;

    const setActualViewportHeight = () => {
        // 1. Use innerHeight for global layout height. iOS visualViewport can
        // report transient share-sheet/browser-chrome heights that should not
        // become the app's full-screen CSS height.
        let viewportHeight = window.innerHeight;

        // 2. Detect PWA mode (bug only occurs in PWA, not Safari browser)
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      window.navigator.standalone === true;
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // 3. Portrait mode compensation (iPhone & iPad)
        const isPortrait = window.innerHeight > window.innerWidth;

        if (isIOS && isPWA && isPortrait) {
            // Compare actual viewport with expected screen height
            const screenPortraitHeight = Math.max(window.screen.height, window.screen.width);
            const difference = screenPortraitHeight - viewportHeight;

            // iPhone diff ~59px, iPad diff ~32px - use 15px threshold
            if (difference > 15) {
                const computedStyle = getComputedStyle(document.documentElement);
                const safeTop = computedStyle.getPropertyValue('--safe-area-top');
                const safeTopPx = parseInt(safeTop) || 0;
                const heightWithSafeTop = viewportHeight + safeTopPx;
                const remainingShortfall = screenPortraitHeight - heightWithSafeTop;

                if (remainingShortfall > 8 && difference <= 180) {
                    viewportHeight = screenPortraitHeight;
                } else if (safeTopPx > 0) {
                    viewportHeight = heightWithSafeTop;
                } else if (difference <= 180) {
                    viewportHeight = screenPortraitHeight;
                }
            }
        }
        // Landscape mode: skip compensation - CSS env() handles it automatically

        // Set the CSS custom property used by html/body/#app-container
        document.documentElement.style.setProperty('--actual-vh', `${viewportHeight}px`);

        // If height changed significantly, trigger a resize to update canvas layout
        if (lastKnownHeight > 0 && Math.abs(viewportHeight - lastKnownHeight) > 30) {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
        }

        lastKnownHeight = viewportHeight;
    };

    const scheduleViewportHeightUpdates = (delays) => {
        delays.forEach(delay => {
            setTimeout(setActualViewportHeight, delay);
        });
    };

    // Run immediately, then stagger multiple attempts because iOS doesn't
    // always have safe-area values ready right away on launch
    setActualViewportHeight();
    scheduleViewportHeightUpdates([50, 150, 300, 500, 800, 1200]);

    // Keep it updated on resize and orientation change
    window.addEventListener('resize', setActualViewportHeight);
    window.addEventListener('orientationchange', () => {
        scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
    });
    if (screen.orientation) {
        screen.orientation.addEventListener('change', () => {
            scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
        });
    }

    // Re-run when app comes back from background (handles app-switching on iOS)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            scheduleViewportHeightUpdates([50, 200, 500, 900]);
        }
    });
}
```

### Key points for the fix to work

1. **Call `fixIOSViewportBug()` first** - in Graphiti it is literally the first
   line of the constructor, before anything else runs.

2. **Pin the root app shell to the viewport** - `#app-container` must be
    `position: fixed` with `inset: 0`. This was the Vectorama-matching change
    that stopped the bottom page background from showing after rotation.

3. **Use the full height fallback pattern** for every element that needs to fill
    the screen: `height: 100vh`, then `height: var(--actual-vh, 100vh)`, then
    `min-height: var(--actual-vh, 100vh)` where appropriate. The app shell and
    fixed function panel both use this pattern.

4. **Use `window.innerHeight` for `--actual-vh`, not `visualViewport.height`.**
    `visualViewport` is useful for local keyboard/chrome observations, but it is
    too volatile to drive the root app height on iOS Safari/PWA.

5. **The safe-area-top CSS variable must exist.** In Graphiti's `index.html`:
   ```css
   :root {
       --safe-area-top: env(safe-area-inset-top);
       --safe-area-bottom: env(safe-area-inset-bottom);
       /* etc. */
   }
   ```

6. **The viewport meta tag must include `viewport-fit=cover`:**
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0,
       maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
   ```
   Without this, `env(safe-area-inset-*)` returns zero on iOS.

7. **The Apple PWA meta tags must be present:**
   ```html
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   ```
    `black-translucent` is important - it tells iOS to draw behind the status bar
   and notch, which is what causes the safe-area behaviour in the first place.

---

## Why the staggered timeouts?

iOS calculates `env(safe-area-inset-top)` asynchronously after launch. If you
read it too early you get `0`, which means the height compensation does nothing,
and you get the gap. Running at 50ms, 150ms, 300ms, 500ms, 800ms, 1200ms covers
all the devices/conditions seen in testing - some are fast, some slow. The
`lastKnownHeight` guard triggers a resize event only when the value actually
changes significantly (>30px), so there is no visual flicker on devices where
the first read is already correct.

Do not add a `visualViewport.resize` listener back to this root height fix unless
there is a very specific new reason. Recent iPhone testing showed that
`visualViewport.height` can be the stale or transient value that creates the
bottom-gap problem after share-sheet/screenshot/browser-chrome transitions.

After landscape-to-portrait rotation in PWA mode, iOS can first report the old
landscape height, then settle on a portrait `innerHeight` that still looks like
Safari browser mode with chrome reserved at the bottom. The fix therefore runs
a longer staggered retry sequence after orientation changes. If the app is in
iOS standalone portrait and the height is still short after applying
`safe-area-inset-top`, Graphiti falls back to the portrait screen height instead
of preserving the browser-chrome-sized gap.

The Vectorama comparison showed another important part of the fix: do not leave
the app shell as a normal relative block that can be visibly shorter than the
installed PWA viewport. Graphiti now pins `#app-container` to the viewport with
`position: fixed` and `inset: 0`, and gives both the app shell and fixed function
panel the same `100vh` fallback plus `--actual-vh`/`min-height` pattern used in
Vectorama. This prevents the page background from showing below the app if iOS
briefly reports a short height during rotation.

---

## Relevant git commits in Graphiti (oldest to newest)

| Commit    | Description |
|-----------|-------------|
| `06a008b` | Original JS fix - `setActualViewportHeight()` + `--actual-vh` CSS var |
| `c0ae93b` | Added `void document.body.offsetHeight` reflow trick + `visibilitychange` handler for app-switching |
| `9dec2be` | Comprehensive rewrite ported from Mandelscope - portrait-mode safe-area-top compensation, staggered timeouts up to 1200ms, `visualViewport` listener |
| `bb2210f` | Added `(display-mode: fullscreen)` to PWA detection (iOS can use either) |
| `6839bf3` | Switched root app height back to `window.innerHeight`; removed `visualViewport.height` from `--actual-vh` after iPhone Safari/PWA share-sheet testing |
