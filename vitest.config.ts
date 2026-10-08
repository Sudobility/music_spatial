import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    // jsdom: this package's own tests cover its thin JSX-composition layer
    // (SpatialCanvas, MapOverlay, keyboard handling), matching music_app's
    // own vitest environment.
    environment: 'jsdom',
    globals: false,
    // `music_spatial_core` is compiled by `tsc` with extensionless relative
    // imports (`from './geometry'`), the house style these packages share.
    // Bun's resolver accepts that; Node's ESM resolver, which vitest hands
    // bare dependencies to, refuses it with "Cannot find module .../dist/
    // geometry". Through a `bun link` symlink it happened to work — Vite
    // treats an out-of-tree path as source and transforms it — so this only
    // surfaced once the real npm package was installed. Inlining routes it
    // through Vite instead. `music_types` is bundled with extensions and
    // needs nothing. Don't "fix" this upstream with `.js` extensions: that
    // would make core the one package in the family built differently.
    server: { deps: { inline: [/@sudobility\/music_spatial_core/] } },
  },
});
