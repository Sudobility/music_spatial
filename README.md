# @sudobility/music_spatial

First-person 3D "Spatial" stage view for Moosiac scores — web, Three.js via
[`@react-three/fiber`](https://github.com/pmndrs/react-three-fiber). It renders
one wireframe instrument model per track on a stage, lit up while the track is
sounding, with a 2D top-down map overlay for rearranging the players and the
listener. The listener walks the stage: drag the canvas to turn, arrow keys to
turn and step, or let it wander on its own.

This package is **web only**. It is a thin rendering/input layer over
[`@sudobility/music_spatial_core`](https://github.com/Sudobility/music_spatial_core),
which holds all the platform-agnostic logic (scene composition, geometry,
movement, map math). The React Native sibling `music_spatial_rn` builds on the
same core; neither spatial package depends on the other.

## What it does

- **3D stage (`SpatialCanvas`)** — mounts the `@react-three/fiber` DOM
  `<Canvas>`, draws one `<lineSegments>` per track (one draw call each) plus a
  floor grid, a half-circle stage ring and fog. Runs `frameloop="demand"`, so a
  frame is only drawn when something actually changed (a listener move, a lit-set
  change, a dragged instrument).
- **Map overlay (`MapOverlay`)** — a standalone, store-free 2D arrangement view
  ported from the app's old "Unplugged" tab. Drag instruments and the listener,
  turn the listener with its handle, reset the arrangement, toggle wander.
- **Movement** — `useStageDrag` (pointer turns the view horizontally),
  `useKeyboardMovement` (arrow keys: Left/Right turn 15°, Up/Down step 0.5 m),
  and `useWander` (automatic random walk, a transient preview that never saves
  positions).

## Public API

The top-level export is `SpatialView`, which composes the canvas, overlay and
input hooks:

```tsx
import { SpatialView } from '@sudobility/music_spatial';

<SpatialView
  score={score}
  soundingTrackIds={soundingTrackIds}        // ReadonlySet<string>, recomputed each tick
  locked={false}                             // disables drag-to-rearrange only
  showMap={true}
  onMoveListener={patch => setListener(patch)}
  onMoveTrack={(trackId, point) => setTrackPosition(trackId, point)}
  onResetArrangement={() => reset()}
  onFacingTrackChange={id => setActiveTrack(id)}
  mapLabels={{ wander: 'Wander' /* … */ }}
  stageBackground="#12161d"
  className="spatial-view"
/>
```

Key contract: this package **reads the score and reports intents** — it never
dispatches commands or reads audio state. The host supplies `soundingTrackIds`
every render and wires `onMoveListener` / `onMoveTrack` / `onResetArrangement`
to its own command layer.

Also exported for direct use: `SpatialCanvas`, `MapOverlay`, `InstrumentGlyph`,
`useKeyboardMovement`, `useStageDrag` (and their prop/option types). See
`src/index.ts`.

## Install

Packages under `@sudobility` are published to **GitHub Packages**, not the
public npm registry. `.npmrc` already points the scope there; installing
requires a GitHub token with `read:packages` exported as `GH_PACKAGES_READ_TOKEN`
(or otherwise configured for `npm.pkg.github.com`).

```bash
bun install
```

### Peer dependencies

Consumers must provide these (ranges from `package.json`):

| Peer | Range |
| --- | --- |
| `react` / `react-dom` | `>=18` (dev/tested on 19) |
| `three` | `^0.160.0` |
| `@react-three/fiber` | `^9.0.0` |
| `@sudobility/music_spatial_core` | `^0.0.32` |
| `@sudobility/music_types` | `^0.13.65` |

## Build, test, run

[Bun](https://bun.sh) is the package manager and script runner. There is no app
to "run" — this is a library consumed by a host app; verify changes via tests.

```bash
bun run build          # tsc -p tsconfig.esm.json, then scripts/fix-esm-imports.mjs
bun run test:unit      # vitest run (jsdom)
bun run test:watch     # vitest in watch mode
bun run typecheck      # tsc --noEmit
bun run lint           # eslint src
bun run format         # prettier --write src
bun run format:check   # prettier --check src
bun run verify         # format:check + typecheck + lint + test:unit + build
bun run clean          # rimraf dist
```

`bun run verify` is the full gate and runs as `prepublishOnly`.

### The ESM import fixer

`build` compiles with `tsc` under `moduleResolution: "bundler"`, which emits
extensionless relative imports (`from './foo'`). Node's native ESM loader
rejects those, so `scripts/fix-esm-imports.mjs` rewrites every relative
specifier in `dist` to a fully-qualified path (`./foo` → `./foo/index.js` or
`./foo.js`). It is idempotent and never fails the build on an unresolved
specifier.

## Testing

Vitest with the `jsdom` environment. Tests cover this package's thin
JSX-composition and input layer only (does `SpatialCanvas` render one
`<lineSegments>` per instrument, does each arrow key produce the right movement,
does the overlay drag/commit correctly) — the heavy scene/geometry/math logic is
tested once in `music_spatial_core`. `music_spatial_core` is inlined through
Vite in `vitest.config.ts` (see the note there) because its extensionless
compiled imports are not resolvable by Node's ESM loader directly.

## Layout

```
src/
  index.ts              # public exports
  SpatialView.tsx       # top-level composition (canvas + overlay + input)
  SpatialCanvas.tsx     # @react-three/fiber <Canvas>, StageCamera, instruments
  MapOverlay.tsx        # 2D top-down arrangement overlay
  InstrumentGlyph.tsx   # 2D instrument icon for map markers
  useSpatialScene.ts    # memo boundaries over core's buildInstruments/cameraFor
  useKeyboardMovement.ts # arrow-key stepping
  useStageDrag.ts       # pointer drag to turn the view
  useWander.ts          # automatic random walk preview
  *.test.ts             # vitest unit tests
docs/SPEC.md            # original design spec (historical; predates implementation)
scripts/fix-esm-imports.mjs
```

## License

BUSL-1.1.
