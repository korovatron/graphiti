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
            // Force a style/layout flush so the computed style read below
            // can't return a stale cached value for --safe-area-top.
            void document.documentElement.offsetHeight;

            // Compare actual viewport with expected screen height. This is
            // only used to *detect* whether the shortfall bug is present -
            // the correction amount always comes from the device's own
            // reported safe-area-inset-top, never a guessed/hard-coded pixel
            // amount, so it stays correct on any notch/Dynamic Island size.
            const screenPortraitHeight = Math.max(window.screen.height, window.screen.width);
            const difference = screenPortraitHeight - viewportHeight;

            if (difference > 2) {
                const computedStyle = getComputedStyle(document.documentElement);
                const safeTop = computedStyle.getPropertyValue('--safe-area-top');
                const safeTopPx = parseInt(safeTop) || 0;

                if (safeTopPx > 0) {
                    // Trust the real measured inset - no upper cap.
                    viewportHeight = viewportHeight + safeTopPx;
                } else if (difference <= 180) {
                    // Safe-area isn't resolved yet (cold launch) - best
                    // guess until a later retry picks up the real inset.
                    // The 180px sanity cap only applies to this guess, to
                    // avoid misfiring on unrelated large viewport shrinks
                    // (e.g. on-screen keyboard open).
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

    const scheduleIOSPWALayoutRefreshes = (delays) => {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      window.navigator.standalone === true;
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (!isIOS || !isPWA) {
            return;
        }

        delays.forEach(delay => {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, delay);
        });
    };


    // Run immediately, then stagger multiple attempts because iOS doesn't
    // always have safe-area values ready right away on launch
    setActualViewportHeight();
    scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800, 2400]);
    scheduleIOSPWALayoutRefreshes([350, 900, 1800, 2400]);

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
and you get the gap. Running at 50ms, 100ms, 200ms, 350ms, 600ms, 900ms,
1300ms, 1800ms and 2400ms covers the delayed cold-launch settling seen after
the app was last closed or suspended in landscape and then reopened in portrait.
Some devices are fast, some slow. The
`lastKnownHeight` guard triggers a resize event only when the value actually
changes significantly (>30px), so there is no visual flicker on devices where
the first read is already correct.

The cold-launch path also schedules a few iOS-PWA-only resize events after the
delayed height reads. This mirrors the manual rotate-and-back workaround: the
rotation path fixes the bug because it causes both a fresh height read and a
layout/canvas refresh after iOS has settled.

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

---

## New-hardware regression: "always" instead of "intermittent" (iPhone 18 Pro Max)

A user with an existing iPhone (15 Pro Max) and a new iPhone (18 Pro Max), both
on the *same* iOS version, reported that the bottom-bar bug that used to be
*intermittent* on the old phone became *deterministic* (every single launch) on
the new phone, with the same rotate-to-fix workaround still clearing it.

Two phones reporting the same iOS marketing version are not running identical
code paths for this bug:

- Apple ships per-device-model builds. A matching version number does not
  guarantee an identical safe-area/layout timing implementation on new
  silicon/display hardware (e.g. a different Dynamic Island/camera-housing
  size, a different display scaler, a faster SoC that reaches the app's first
  paint before WebKit has resolved `env(safe-area-inset-*)`).
- The pre-existing fix made its correction decision using **hard-coded pixel
  thresholds** (`difference <= 180`, `remainingShortfall > 8`) that were
  effectively tuned against the old device's measured ~59px shortfall. If a
  new device's real shortfall sits outside that tuned band, the correction
  branch is silently skipped - turning what used to be an occasional
  timing race into a bug that fires on every cold launch on that specific
  hardware.
- The retry schedule dispatches a *synthetic* `resize` `Event`. That only
  re-runs this app's own listeners - it does not force WebKit to actually
  recompute `env(safe-area-inset-*)` the way a real rotation does, so on a
  device/OS combination where the CSS variable is slow to resolve, waiting
  longer does not help.

### What changed

1. The correction amount is now always derived from the device's own
   measured `--safe-area-top` value with **no upper cap**, instead of only
   being trusted when it closes the gap to within a hard-coded tolerance.
   This makes the fix correct for any notch/Dynamic Island size, including
   future hardware this was never tested against.
2. The screen-height guess (`screenPortraitHeight`) is now used only to
   *detect* that a shortfall exists, and as a fallback guess while the real
   safe-area value is still resolving (keeping its 180px sanity cap, since a
   guess with no real measurement behind it still needs a guard against
   misfiring during unrelated large viewport shrinks like the keyboard
   opening).
3. A forced style/layout flush (`void document.documentElement.offsetHeight`)
   was added immediately before reading the computed `--safe-area-top` value,
   to reduce the chance of reading a stale cached computed style.

If this is still seen on specific hardware after this change, the next
diagnostic step is to log the actual `window.innerHeight`,
`window.screen.height/width`, and resolved `--safe-area-top` values on that
device at each retry delay, since those are the numbers the whole fix is
built on and we currently have no real telemetry from new hardware models.

---

## Relevant git commits in Graphiti (oldest to newest)

| Commit    | Description |
|-----------|-------------|
| `06a008b` | Original JS fix - `setActualViewportHeight()` + `--actual-vh` CSS var |
| `c0ae93b` | Added `void document.body.offsetHeight` reflow trick + `visibilitychange` handler for app-switching |
| `9dec2be` | Comprehensive rewrite ported from Mandelscope - portrait-mode safe-area-top compensation, staggered timeouts up to 1200ms, `visualViewport` listener |
| `bb2210f` | Added `(display-mode: fullscreen)` to PWA detection (iOS can use either) |
| `6839bf3` | Switched root app height back to `window.innerHeight`; removed `visualViewport.height` from `--actual-vh` after iPhone Safari/PWA share-sheet testing |
