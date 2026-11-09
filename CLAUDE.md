# CLAUDE.md

## What this is

`@sudobility/music_spatial` — a web-only React library: a first-person 3D
"Spatial" stage view of a Moosiac score (Three.js via `@react-three/fiber`),
with a 2D map overlay for rearranging players/listener. Published to **GitHub
Packages** (not public npm). Consumed by a host app; there is no runnable app
here.

## Stack

- TypeScript, React 19, `three` + `@react-three/fiber` (web DOM renderer).
- **Bun** is the package manager and script runner.
- Build: `tsc` (ESM only) + a post-build import-rewrite script.
- Tests: Vitest (`jsdom`).
- All the real logic (scene composition, geometry, movement, map math) lives in
  the peer dep `@sudobility/music_spatial_core`; this package is a thin
  rendering + raw-input layer over it.

## Commands (verified against package.json)

```bash
bun install            # needs GH_PACKAGES_READ_TOKEN (read:packages) for @sudobility scope
bun run build          # tsc -p tsconfig.esm.json && node scripts/fix-esm-imports.mjs
bun run test:unit      # vitest run
bun run typecheck      # tsc --noEmit
bun run lint           # eslint src
bun run format:check   # prettier --check src
bun run verify         # format:check + typecheck + lint + test:unit + build (full gate; also prepublishOnly)
```

## Architecture

- `SpatialView.tsx` — top-level public component. Composes `SpatialCanvas` +
  `MapOverlay` + the input hooks. Owns wander state and the "facing track"
  effect with hysteresis.
- `SpatialCanvas.tsx` — the `@react-three/fiber` `<Canvas>`. `StageCamera`
  installs fiber's intrinsic `<perspectiveCamera>` as the default (replaced
  drei). One `<lineSegments>` + material per track (core merges a model's
  strokes into one geometry → one draw call). Stage grid/ring/fog drawn here
  (purely visual); everything else comes from core.
- `MapOverlay.tsx` — standalone 2D overlay, no store/i18n/theme of its own;
  draws in translucent greys and takes text colour from the host via
  `currentColor`. Drag math from core.
- `useSpatialScene.ts` — the memo boundaries. `instruments` is keyed on roster +
  arrangement + lit set; `camera` on the listener alone. Keep these split: a
  walking frame must not rebuild instrument geometry.
- Input hooks: `useKeyboardMovement` (arrows: 15° turn, 0.5 m step),
  `useStageDrag` (pointer turns view), `useWander` (rAF random walk, preview
  only — never saves positions).

## Key conventions / contracts

- **No audio, no command layer, no store.** The package reads the `score` and
  reports intents via `onMoveListener` / `onMoveTrack` / `onResetArrangement`;
  the host wires those to its own commands. The host supplies `soundingTrackIds`
  (a `ReadonlySet<string>`) every render — this package never reads player state.
- `locked` disables drag-to-rearrange only; walking is never locked (it's a read
  of the score, not an edit).
- ESM-only build. Public exports are defined in `src/index.ts` — update it when
  adding/removing public API.
- Formatting is Prettier's job (single quotes, `arrowParens: avoid`, 80 cols);
  ESLint's `prettier/prettier` enforces it. Many react-hooks and
  `no-non-null-assertion` rules are intentionally off (see `eslint.config.mjs`).

## Gotchas

- **Install needs the GitHub Packages token.** `.npmrc` routes `@sudobility` to
  `npm.pkg.github.com`; without `GH_PACKAGES_READ_TOKEN` configured, `bun
  install` fails to resolve the peer deps.
- **`music_spatial_core` is inlined in `vitest.config.ts`** (`server.deps.inline`).
  Core is compiled with extensionless relative imports, which Node's ESM
  resolver refuses; inlining routes it through Vite. Do NOT "fix" core upstream
  with `.js` extensions — that would make it the odd package in the family.
- **`scripts/fix-esm-imports.mjs` is required after every build.** tsc (bundler
  resolution) emits extensionless specifiers that Node's ESM loader rejects; the
  script rewrites them in `dist`. It's idempotent and never fails on an
  unresolved specifier.
- **`frameloop="demand"`** on the Canvas: frames draw only on change. Anything
  that should animate must arrive as a new prop/commit (listener, lit set,
  dragged instrument). The old `always` loop starved the app's keyboard ticker.

## Stale doc

`docs/SPEC.md` is the original design spec and opens by calling itself "draft,
not implemented" — that is historical. The code in `src/` is fully implemented;
the spec's "link: dependency" dev note is also outdated (core is now a normal
`^0.0.32` range). Trust the code and README over SPEC.md.
