# Desktop widget backgrounds implementation plan

**Goal:** Offer Android transparent backgrounds, matching photo composition tools on both clients, clear photos and reliable Harmony photo replacement.

**Architecture:** Keep photo processing and private files native. A square composition viewport supports dragging and pinch zoom; save a high quality, bounded crop instead of the existing 400px whole-image thumbnail. Harmony image bindings use a revision-specific resource key to avoid reusing the host's image cache.

**Tech stack:** Android Canvas/ScaleGestureDetector, ArkUI gestures, ImageKit, existing widget bridges.

**Constraints:** Keep display version 1.9.0; increment native build codes when packaging. Artifacts remain in ../love-app. No pushes or deployment. Execute in this session using existing tools; no delegation or additional approval step.

**Platform boundary:** Harmony transparent backplate requires Huawei capability approval and a new signing profile; user confirmed approval is absent. Document the official application steps rather than present an opaque host card as transparent. Android launcher chooses the light-background variant where supported; global wallpaper colors provide a fallback, without wallpaper-file permissions.

## Tasks
- [x] Fix Harmony replacement: unique form image key per photo revision; test successive photos retain distinct resource names.
- [x] Android: theme the native background settings and composition viewport; drag/pinch, reset, cancel, save; bound decoding and output size, retain owner/session guards.
- [x] Harmony: add a themed native composition screen with drag/pinch and back cancellation; crop before encoding; atomic replacement and account guard. Separate preview thumbnail from high quality widget photo.
- [x] Android transparent preset: remove all fill and photo layers, support automatic wallpaper contrast and launcher light layout, preserve manual regional colors. Gate web option by client build.
- [x] Verify crop geometry, replacement regression, existing widget/Harmony tests, native builds; deliver packages outside source. Document platform limitations and Harmony capability/signing workflow.

## Review focus
Cancel/back keeps the old photo; logout during decode cannot publish a previous account's photo; extreme aspect ratios remain bounded; repeated photo selection invalidates host image cache; larger images cannot exceed widget bitmap transport limits.


## Verification

- `npm test`: 149 passed, 0 failed.
- Related Harmony/widget tests: 38 passed, including multi-card settings isolation, account reset, sequential image revision bindings and crop/preview sizes.
- Real browser carousel QA: Android/Harmony at 320, 390 and 1280px; selection, color isolation, new-card action, no horizontal overflow.
- Android16 emulator: photo picker, crop drag and save, Back cancellation preserves identical SHA256, new card inherits template while existing card stays unchanged, transparent background visibly exposes wallpaper.
- Separate native instrumentation: real Canvas crop is768px, drag selects expected source pixels, two-pointer MotionEvent pinch changes zoom and crop size; passed.
- Android release build and lint passed; HAP compile/sign and verify-app passed. No Harmony device connected, so visual/native gesture and photo replacement on Harmony still require device confirmation.
- Final local builds: Android10907 / Harmony10911, display1.9.0. APK/HAP remain outside repository. Harmony transparent host behavior remains pending Huawei approval and new Profile; application instructions supplied separately.
