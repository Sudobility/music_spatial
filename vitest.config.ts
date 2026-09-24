import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom: this package's own tests cover its thin JSX-composition layer
    // (SpatialCanvas, MapOverlay, keyboard handling), matching music_app's
    // own vitest environment.
    environment: 'jsdom',
    globals: false,
    server: { deps: { external: [/@sudobility\//] } },
  },
});
