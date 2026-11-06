# First-scene performance and content contract

The first campus has three original procedural miniature hubs (Venetian, Wynn, Caesars Forum), a fountain, paths, trees and benches. These are **symbolic illustrations**, not replicas or accurate physical positions. Venue names are sourced from the 2026 official agenda; all session assignments remain synthetic. All geometry and CSS artwork in this slice are authored in this repository, with no third-party textures, models, fonts, audio, analytics or asset-CDN calls.

## Engineering budgets for slice 1

- Under 250 rendering draw calls and 100,000 triangles for this initial scene, asserted in browser tests via renderer counters. No individually rendered mesh per catalog session.
- No continued frame loop at rest. Render on camera movement, resize, selection or settings changes; stop after damping settles.
- Explicit `?view=2d` must avoid downloading the lazy scene chunk. List browsing and notebook actions must work without WebGL.
- Initial core HTML/CSS/JS under 100 kB gzip, excluding the lazy WebGL renderer. Scene chunk target under 300 kB gzip; it is loaded only while 3D is enabled. Vite's generic 500 kB uncompressed warning is retained, not hidden.
- Aim for at least 30 fps during camera motion on the verified local desktop; measure rather than claim 60 fps across devices. Cap DPR at 1.5; lighter mode uses DPR 1, no shadows and fewer trees. These are engineering reference targets, not a promise for every phone or GPU.
- Camera overview, click-to-focus and map shortcuts need keyboard equivalents. Reduced-motion mode jumps directly to the target and disables damping. 2D mode and context-loss fallback retain the same session list.

## Participant-requested expansion during slice 2

On 2026-09-29 the participant explicitly requested a standalone fullscreen map and a controllable person before the incomplete live-auth slice passed. This is the recorded D-15 exception. The scene now has **six** named original procedural building illustrations (all venues named by the official 2026 agenda), a simplified visitor, camera-follow walking with WASD/arrows/touch pad, illustrative boundaries/building collision, and a quick-jump view. It is served on `/map`, and the 2D planning desk is `/`. The venues are *not* geographically arranged.

The same performance checks still apply: E2E tests enforce <250 calls and <100,000 triangles, and the renderer is lazy-loaded only on `/map`. The running M1 Pro/Chromium reference observed 152 draw calls and 4,928 triangles and zero additional idle frames over a one-second interval. Updated build gzip figures and any further measurements belong in `build-log.md`. No authorized floor plans/booth coordinates were available, so indoor accuracy is **not implemented**.

Windows/Safari/mobile hardware verification remains a later release requirement.

## Strip redesign (D-17, 2026-09-29)

The island was replaced by an original Las Vegas Strip diorama (six coloured hotel illustrations, boulevard, plazas, palms, lamps, stalls, fountain, pond). All static geometry is merged per object into single vertex-coloured meshes (`src/scene/parts.ts`), so the observed reference (Chromium, Apple M1 Pro) is 36–48 draw calls and ~19.7k triangles, well under the 250 / 100,000 budgets asserted in E2E. The scene chunk is 244.3 kB gzip and the core bundle 83.7 kB gzip. The renderer still does not loop at rest: only walking, camera motion, settling limbs and the opt-in "Ambient life" toggle (24 Hz, off by default) request frames. All positions are illustrative; nothing is derived from a map dataset.
