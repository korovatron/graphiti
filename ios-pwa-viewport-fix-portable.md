# iOS PWA Bottom-Bar / Short-Viewport Fix (Portable Version)

A drop-in, app-agnostic fix for an intermittent-to-deterministic bug in iOS
home-screen web apps (standalone PWAs): a gap/bar appears across the bottom of
the screen, usually most visible on cold launch or after rotating, showing the
page background instead of your app filling the screen. Rotating to landscape
and back to portrait clears it.

This file has no project-specific names in it - replace the one placeholder
(`#app-container`) with your own root app-shell element ID and this should
work as-is.

---

## Root cause (two separate bugs, both covered by this fix)

1. **iOS incorrectly subtracts `safe-area-inset-top` from `window.innerHeight`
   in standalone/PWA mode.** This makes the reported viewport height too
   short by roughly the height of the status bar/notch/Dynamic Island
   (commonly ~50-65px on iPhone, ~30px on iPad). `env(safe-area-inset-top)`
   itself also resolves **asynchronously** after launch - reading it too
   early returns `0`.
2. **`visualViewport.scale` is not always `1`, even with
   `user-scalable=no`.** On some devices/sessions, a standalone PWA can be
   running at a non-1 zoom scale (e.g. measured at `0.85` on one device in
   testing). When that happens, `window.screen.width/height` and the
   safe-area inset (both reported in true physical points) stop being
   directly comparable to `window.innerHeight` (reported in the current
   CSS-pixel zoom space). Any fix that compares these values without
   normalizing for scale will silently fail to detect or correct the
   shortfall on an affected device - not occasionally, but **every single
   time**, because the comparison is mathematically wrong, not just
   mistimed.

A rotation fixes both because it forces iOS to do a genuine native relayout,
which recomputes everything correctly. The goal of this fix is to get the
same correct result without requiring the user to rotate.

---

## 1. Required `<head>` tags

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

- `viewport-fit=cover` is required, or `env(safe-area-inset-*)` always returns
  `0` on iOS.
- `black-translucent` tells iOS to draw your app behind the status bar/notch,
  which is what causes the safe-area behaviour in the first place (and why
  this bug is PWA-only, not a plain Safari-tab problem).

## 2. Required CSS

```css
:root {
    --safe-area-top: env(safe-area-inset-top);
    --safe-area-bottom: env(safe-area-inset-bottom);
}

html, body {
    width: 100%;
    height: 100%;
    height: var(--actual-vh, 100vh);
    min-height: 100vh;
    min-height: var(--actual-vh, 100vh);
}

/* Replace #app-container with your own root app-shell element's selector */
#app-container {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: var(--actual-vh, 100vh);
    min-height: var(--actual-vh, 100vh);
}
```

The root app shell **must** be `position: fixed; inset: 0`, not a normal
block-level element. Without this, a transient short height during
launch/rotation exposes the page background below the app instead of just
leaving the shell a little short (which is far less noticeable and self-heals
on the next retry).

Apply the same `100vh` → `var(--actual-vh, 100vh)` → `min-height` fallback
pattern to any other element that needs to fill the full screen (e.g. a fixed
side panel).

## 3. The JS fix

Call `fixIOSViewportBug()` **synchronously, as the very first line of your
app's startup/constructor**, before anything else initializes.

```js
function fixIOSViewportBug() {
    let lastKnownHeight = 0;

    const setActualViewportHeight = () => {
        // Use innerHeight, not visualViewport.height, as the source of truth.
        // visualViewport can report transient share-sheet/browser-chrome/
        // keyboard heights that must never become the app's full-screen
        // CSS height.
        let viewportHeight = window.innerHeight;

        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      window.navigator.standalone === true;
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isPortrait = window.innerHeight > window.innerWidth;

        if (isIOS && isPWA && isPortrait) {
            // Force a style/layout flush so the computed style read below
            // can't return a stale cached value for --safe-area-top.
            void document.documentElement.offsetHeight;

            // screen.width/height and --safe-area-top are reported in true
            // physical points, but innerHeight (and --actual-vh) operate in
            // whatever CSS-pixel zoom space the page is currently running
            // at. These normally coincide (scale 1), but some devices/
            // sessions run the standalone PWA at a visualViewport.scale
            // other than 1 even with user-scalable=no. Dividing by scale
            // brings everything into the same units; this is a no-op
            // (divide by 1) on every device where scale is already 1.
            const scale = (window.visualViewport && window.visualViewport.scale) || 1;

            // Only used to *detect* whether the shortfall is present on this
            // pass. The actual correction amount always comes from the
            // device's own reported safe-area-inset-top, never a guessed or
            // hard-coded pixel amount, so this stays correct on any notch/
            // Dynamic Island size, current or future.
            const screenPortraitHeight = Math.max(window.screen.height, window.screen.width) / scale;
            const difference = screenPortraitHeight - viewportHeight;

            if (difference > 2) {
                const computedStyle = getComputedStyle(document.documentElement);
                const safeTop = computedStyle.getPropertyValue('--safe-area-top');
                const safeTopPx = (parseInt(safeTop) || 0) / scale;

                if (safeTopPx > 0) {
                    // Trust the real measured inset - no upper cap. Capping
                    // this to a value tuned for one device/screen size will
                    // silently break on any device with a larger shortfall.
                    viewportHeight = viewportHeight + safeTopPx;
                } else if (difference <= 180 / scale) {
                    // Safe-area isn't resolved yet (common on cold launch) -
                    // fall back to the known screen height as a best guess
                    // until a later retry picks up the real inset. The
                    // (scaled) sanity cap only applies to this guess, to
                    // avoid misfiring during unrelated large viewport
                    // shrinks (e.g. on-screen keyboard open).
                    viewportHeight = screenPortraitHeight;
                }
            }
        }
        // Landscape mode: skip compensation - CSS env() handles the notch automatically.

        document.documentElement.style.setProperty('--actual-vh', `${viewportHeight}px`);

        // If the height changed significantly, trigger a resize so any
        // canvas/layout code re-measures against the corrected value.
        if (lastKnownHeight > 0 && Math.abs(viewportHeight - lastKnownHeight) > 30) {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }
        lastKnownHeight = viewportHeight;
    };

    const scheduleViewportHeightUpdates = (delays) => {
        delays.forEach(delay => setTimeout(setActualViewportHeight, delay));
    };

    const scheduleIOSPWALayoutRefreshes = (delays) => {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      window.navigator.standalone === true;
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIOS || !isPWA) return;
        delays.forEach(delay => setTimeout(() => window.dispatchEvent(new Event('resize')), delay));
    };

    // Run immediately - window.screen.width/height is available synchronously
    // with no async wait, so this first call already catches most cases
    // before the user ever sees a live frame. Then stagger retries, because
    // env(safe-area-inset-*) resolves asynchronously and can take a while.
    setActualViewportHeight();
    scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800, 2400]);
    scheduleIOSPWALayoutRefreshes([350, 900, 1800, 2400]);

    window.addEventListener('resize', setActualViewportHeight);
    window.addEventListener('orientationchange', () => {
        scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
    });
    if (screen.orientation) {
        screen.orientation.addEventListener('change', () => {
            scheduleViewportHeightUpdates([50, 100, 200, 350, 600, 900, 1300, 1800]);
        });
    }
    // Re-run when the app comes back from background (handles app-switching on iOS).
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) scheduleViewportHeightUpdates([50, 200, 500, 900]);
    });
}
```

---

## Rules not to break when porting/modifying this

1. **Call it first, synchronously** - before any other setup code runs. The
   immediate (non-delayed) call is what hides the bug on most devices/launches,
   because `screen.width/height` is available instantly while
   `env(safe-area-inset-*)` is not.
2. **Never use `visualViewport.height`** as the source for `--actual-vh` - it
   is too volatile around keyboard/share-sheet/tab-switch transitions and can
   poison the whole layout until the next resize/orientation event corrects it.
3. **Always divide the physical-point values (`screen.width/height`, the
   measured `--safe-area-top`) by `visualViewport.scale`** before comparing or
   adding them to `innerHeight`. Skipping this is invisible on devices where
   scale happens to be `1`, and silently, deterministically breaks the whole
   fix on any device/session where it isn't.
4. **Don't put an upper cap on the real measured-inset correction
   (`safeTopPx`)** - only the screen-height *guess* fallback (used while the
   safe-area value is still resolving) needs a sanity cap, and that cap
   should be generous (e.g. 180px) rather than tuned tightly to one device.
5. **Root app shell must be `position: fixed; inset: 0`**, not a normal
   relative/static block, or a transient short height exposes the page
   background underneath it.
6. Keep the long staggered retry schedule (out to ~2.4s) and the
   `visibilitychange`/`orientationchange` listeners - cold launches and
   app-switching can both leave `env(safe-area-inset-*)` unresolved for
   longer than you'd expect.

---

## Optional: verifying it on a real device without risking production

If you need to confirm the real numbers on a specific device before trusting
a fix, it's safer to add a temporary, fully opt-in diagnostics view than to
guess:

- A small, low-opacity button somewhere unobtrusive that, when tapped, shows
  (or copies to clipboard) the current values of: `window.innerHeight`,
  `window.outerHeight`, `window.screen.width/height`,
  `window.visualViewport.height`/`scale`, `window.devicePixelRatio`,
  orientation, the PWA/iOS detection flags, the resolved `--safe-area-top`/
  `--safe-area-bottom`, and the current `--actual-vh`.
- Refresh it on an interval (e.g. every 300ms) while visible, so you can watch
  the values change live while rotating.
- Make sure it does nothing unless explicitly triggered, so it's safe to ship
  temporarily to real users while you gather data, and trivial to strip out
  afterwards.
