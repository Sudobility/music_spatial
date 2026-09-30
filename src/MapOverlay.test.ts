import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MapOverlay, type MapOverlayProps } from './MapOverlay';

const BASE: MapOverlayProps = {
  tracks: [],
  colors: {},
  listener: { x: 0, z: 0, facingDeg: 0 },
  trackPositions: {},
  onMoveListener: () => {},
  onMoveTrack: () => {},
};

// `createElement`, not JSX: the build excludes `*.test.ts` and nothing else,
// so a `.tsx` test would be compiled into `dist` and published.
function overlay(props: Partial<MapOverlayProps> = {}) {
  return createElement(MapOverlay, { ...BASE, ...props });
}

/** True when `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
  );
}

describe('MapOverlay layout', () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver, and the map measures itself with one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('stacks Wander above Reset in one column, ahead of the map', () => {
    render(
      overlay({ onWanderingChange: () => {}, onResetArrangement: () => {} })
    );
    const wander = screen.getByRole('button', { name: 'Wander' });
    const reset = screen.getByRole('button', { name: 'Reset arrangement' });
    const map = screen.getByLabelText('Stage arrangement');
    const column = wander.parentElement as HTMLElement;

    expect(reset.parentElement).toBe(column);
    expect(column.style.flexDirection).toBe('column');
    expect(Array.from(column.children)).toEqual([wander, reset]);

    const row = column.parentElement as HTMLElement;
    expect(Array.from(row.children)).toEqual([column, map]);
    expect(row.style.alignItems).toBe('flex-end');
    expect(precedes(wander, reset)).toBe(true);
    expect(precedes(column, map)).toBe(true);
  });

  it('holds only the button it was given a callback for', () => {
    render(overlay({ onResetArrangement: () => {} }));
    const reset = screen.getByRole('button', { name: 'Reset arrangement' });
    expect(screen.queryByRole('button', { name: 'Wander' })).toBeNull();
    expect(Array.from(reset.parentElement?.children ?? [])).toEqual([reset]);
  });

  it('is the map alone when neither callback is given', () => {
    render(overlay());
    const map = screen.getByLabelText('Stage arrangement');
    expect(screen.queryByRole('button', { name: 'Wander' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Reset arrangement' })
    ).toBeNull();
    expect(Array.from(map.parentElement?.children ?? [])).toEqual([map]);
  });
});
