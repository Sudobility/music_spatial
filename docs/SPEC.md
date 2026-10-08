# music_spatial — design spec (draft, for review)

Status: **draft, not implemented.** Nothing in `src/` is real yet — this
document is the thing being reviewed before any of it is written. Where a
decision genuinely needs the user's call rather than a default, it is marked
**OPEN** and left unresolved on purpose.

## What this is

A first-person 3D "Spatial" view of a score: a stage, one wireframe model per
instrument in the roster, posed the way that instrument is actually played,
lit up while it sounds. The listener walks through it. A 2D map overlay shows
relative positions and lets the user rearrange them — this is the existing
"Unplugged" arrangement UI (already built, in `music_app` today), carried
over as the overlay rather than an inspector tab.

Companion packages:
[`music_spatial_core`](../../music_spatial_core/docs/SPEC.md) is where
nearly all of the actual logic lives now — see "Architecture" below.
[`music_spatial_rn`](../../music_spatial_rn/docs/SPEC.md) is the React
Native equivalent, built on the same core, with its own native-rendering
plan and its own open risk (native GL on macOS/Windows).

This package is **web only** (`@react-three/fiber`'s DOM renderer). It does
not import React Native, and `music_spatial_rn` does not import this
package — they are siblings, not one depending on the other, so that neither
build can break the other and neither ships dead weight for a platform it
doesn't run on. What they *do* share, fully, is `music_spatial_core`.

## Architecture: as thin as possible over `music_spatial_core`

The previous draft of this spec split things "data shared, rendering
duplicated." That undersold how much can actually be shared: `three` core
(not `@react-three/fiber`) and React core (not `react-dom`/`react-native`)
both run identically on web and native, so almost everything that isn't
*mounting a Canvas* or *capturing raw input* has moved into a third package,
[`music_spatial_core`](../../music_spatial_core/docs/SPEC.md), that this
package and `music_spatial_rn` both depend on and neither forks.

This package's own job shrinks to:
- Mounting `@react-three/fiber`'s DOM `<Canvas>`.
- Capturing raw web input (`keydown`/`keyup` for movement, pointer events for
  drag) and handing it to `music_spatial_core`'s pure functions.
- Rendering `music_spatial_core`'s `SpatialScene` output as JSX
  (one `<lineSegments geometry={...} />` per instrument, fiber's intrinsic
  `<perspectiveCamera>` made the default from the scene's camera transform)
  and the map overlay's actual DOM/CSS elements, positioned by
  `music_spatial_core`'s map math.

Full detail on what moved and why is in `music_spatial_core`'s spec; this
document only covers what's still genuinely this package's own.

## Why a separate package (from `music_app`)

Same reasoning as `music_editing`/`music_player`/every other sibling in this
family: this is a self-contained capability with its own dependency surface
(`three`, `@react-three/fiber` — neither of which anything else in the stack
needs) and its own churn (instrument model authoring is
going to be a long tail of small, unrelated commits, landing in
`music_types` rather than here — see below). Keeping it out of `music_app`
keeps that churn out of the app's own history and keeps the app's
`node_modules` free of a 3D engine when Spatial view is off.

## Dependency graph

```
music_spatial
├── @sudobility/music_spatial_core (peer) — scene composition, geometry
│                                            conversion, movement, map math,
│                                            the local-preview commit hook —
│                                            everything platform-agnostic
├── @sudobility/music_types        (peer) — Score, Track, UnpluggedListener/
│                                            Point/Arrangement (re-exported
│                                            types only; the actual spatial-
│                                            model data lives here too, see
│                                            below, but this package never
│                                            reads it directly — core does)
├── three                          (peer) — needed directly: this package's
│                                            own JSX (`<lineSegments>`,
│                                            `<primitive>`) is typed against
│                                            `three`'s own types
├── @react-three/fiber             (peer) — DOM Canvas renderer. Its intrinsic
│                                            <perspectiveCamera> is the stage
│                                            camera; drei was dropped once
│                                            `makeDefault` was the only thing
│                                            used of it (its PerspectiveCamera
│                                            also allocated an unused 256x256
│                                            render target and a useFrame)
├── react, react-dom                (peer)
```

Nothing here imports `@sudobility/music_player` or any audio code. The host
app supplies `soundingTrackIds` (which tracks are audible *right now*) every
render; `music_spatial_core`'s `buildScene` reads that set to decide what
glows. Audio routing stays exactly where it is today, in the app's own
`bind-player.ts`.

## The one prerequisite extension to `music_types`

`music_spatial_core`'s spec covers this in full; summarized here since it's
the one piece of new *content* (not code) this feature needs and it doesn't
live in either spatial package:

`music_types` gains `InstrumentSpatialModel`/`spatialModelForTrack`
(`src/domain/instruments/spatial-model.ts`), a sibling to the existing 2D
icon system (`icon-art.ts`, `gm-icon.ts`), same resolution shape (per-program
lookup, family fallback for safety). **Authoring scope, resolved: every
instrument this app supports** — all 128 `INSTRUMENT_OPTIONS` GM programs
plus the 8 `GM_KITS` drum kits, 136 bespoke models, no family-fallback
shortcut standing in for an unauthored one. This stays in `music_types`
rather than moving into `music_spatial_core`, deliberately: it's data about
an instrument, the same category as everything else already in
`domain/instruments/`, and it doesn't need `three` as a dependency to exist
(a `Vec3` tuple is just three numbers) — only *converting* it into drawable
geometry needs `three`, and that conversion is what actually lives in
`music_spatial_core`.

**Resolved — parametric, from real dimensions.** `music_types/src/domain/
instruments/spatial-geometry.ts` is the authoring toolkit (surfaces of
revolution, bent tubes, spline outlines, extrusions, `place` with
pitch/yaw/roll) and `spatial-parts.ts` the shared sub-assemblies
(keyboards, drums, cymbals, stands, bows, figures); `spatial-models/*.ts`
build every program's model from measured sizes in meters, player at the
origin, +z toward the audience, with the played pose baked in. 128 programs
and 8 kits resolve to 106 distinct models — programs that are physically
the same object (both grand pianos, the three Hammond patches, the eight
leads on one monosynth) share one on purpose. `gm-spatial-model.test.ts`
asserts the full coverage, that every model is finite, floor-standing and
stage-sized, and the poses (violin at the chin, cello on its endpin, winds
at the lips).

## Public API

```ts
export interface SpatialViewProps {
  readonly score: Score;
  /** Track ids with an active note right now. Recomputed by the caller each
   *  tick/render from the player — this package never reads audio state. */
  readonly soundingTrackIds: ReadonlySet<string>;
  /** Disables drag-to-rearrange on the map overlay. Walking is never locked
   *  by this — it's a read of the score, not an edit to it. */
  readonly locked?: boolean;
  /** Map overlay visibility. Default true. */
  readonly showMap?: boolean;
  readonly onMoveListener: (patch: Partial<UnpluggedListener>) => void;
  readonly onMoveTrack: (trackId: string, point: UnpluggedPoint) => void;
  readonly onResetArrangement?: () => void;
  readonly className?: string;
}

export function SpatialView(props: SpatialViewProps): JSX.Element;
```

Unchanged from the previous draft. `onMoveListener`/`onMoveTrack`/
`onResetArrangement` are called, never dispatched to directly — the host app
wires them to `setUnpluggedListenerCommand`/`setUnpluggedTrackPositionCommand`/
`resetUnpluggedArrangementCommand` exactly as `UnpluggedTab.tsx` does today.
This package has no dependency on the command layer or the store.

## Internal composition (not public API, but the intended shape)

- `SpatialCanvas` — the `@react-three/fiber` `<Canvas>` root. Calls
  `music_spatial_core`'s `buildInstruments` and `cameraFor` through
  `useSpatialScene`, memoised apart — the instruments on the roster, the
  arrangement's track positions and the lit set; the camera on the listener
  alone, so a walking frame re-creates no instrument element — then maps the
  instruments to one `<lineSegments geometry={i.geometry} position={i.position}
  rotation={i.rotation} />` each (one draw call per track) and sets the
  default `<perspectiveCamera>` from the camera — there is very little
  decision left for this component to make; composition already happened in
  core.
- `MapOverlay` — the ported 2D top-down arrangement view, rendered as DOM/CSS
  elements positioned via `music_spatial_core`'s `pixelFromPoint`/
  `pointFromPixel`, drag handled via pointer events feeding
  `bearingFromCenter` and the shared `useThrottledCommit` hook, which keeps
  updates local during a drag and commits once on release. Auto-walk never
  saves audience positions. Only the container changes from the original `UnpluggedTab.tsx` — a small panel
  overlaid on the canvas corner instead of a full inspector tab.
- Stage drag — captured pointer events turn the listener by the change in
  screen bearing, keeping the grabbed scene point under the pointer
  horizontally. Vertical travel is ignored; release stops the drag.
- Keyboard — each arrow key event calls `stepListener` once: Left/Right turn
  15 degrees; Up/Down move 0.5 metres forward/backward.

## Consuming-app changes this implies (documented here, built later)

Not part of this package, but the reason it exists — recorded so the spec is
a complete picture:

- `music_types`: remove `"unplugged"` from `INSPECTOR_TABS` once Spatial
  ships (the tab goes away per the user's instruction — "I don't want a
  'unplugged' tab anymore").
- `music_app`: remove `<TabsContent value="unplugged">` and
  `src/components/inspector/UnpluggedTab.tsx` from `InspectorPanel.tsx`
  (superseded by this package's `MapOverlay`).
- `music_app`: add a "Spatial" toggle to `TransportBar.tsx`, immediately
  before the existing keyboard toggle (`src/components/transport/
  TransportBar.tsx:689-705`) — same `Tooltip` + ghost icon `Button` +
  `TOGGLE_BUTTON_CLASS` on/off pattern already used there. When on, it swaps
  the score canvas for `<SpatialView>` in whatever component currently
  renders the notation (not yet located — implementation-phase task).
- `music_editing`: `unpluggedActive` (in `ui-slice.ts`) is likely renamed to
  `spatialActive` for naming symmetry with the new toggle — low-stakes,
  flagged rather than assumed.
- `music_app/src/services/playback/bind-player.ts`'s existing
  `scoreForPlayback(score, unpluggedActive)` shadow-score function is
  **unchanged in behavior** — Spatial view being on is exactly what
  "unplugged mode" already meant for audio purposes. Only the flag's name
  and the UI that sets it change.

## Testing

Vitest. Almost all of the logic worth testing now lives in
`music_spatial_core` and is tested once, there — this package's own tests
cover the thin JSX-composition layer (does `SpatialCanvas` render one
`<lineSegments>` per `scene.instruments` entry, does the keyboard handler
produce the right `MovementInput` for each key) and nothing WebGL-rendering
itself, matching `music_api`'s own stated practice ("unit tests pin the
encoding; they cannot tell you that a drum part is a metronome") — a short
manual checklist (does each instrument look right in its played pose, does
lighting toggle correctly) stands in for what a test can't see.

## Dev note: `music_spatial_core` is a `link:` dependency for now

`package.json` points `@sudobility/music_spatial_core` at
`link:@sudobility/music_spatial_core` rather than a semver range — it isn't
published yet, and `bun install` errors outright (not just warns) on a
peer/dev dependency it can't find on the registry at all, unlike a version
mismatch on something that does exist there (`three`, `react`), which is
only a warning. Once `music_spatial_core` is published, this becomes an
ordinary version range like every other dependency here, and the
`link:` entry goes away.

## Build sequencing

Per the user's decision: this package (and `music_spatial_core` alongside
it) is built and wired into `music_app` **fully working first**, before any
work starts on `music_spatial_rn`. `music_spatial_rn` then consumes
`music_spatial_core` as-is, ideally unmodified, rather than re-deriving any
of its logic.
