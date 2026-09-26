import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Score, UnpluggedListener } from '@sudobility/music_types';
import { twoTrackScore } from '@sudobility/music_types/test';
import { useEffectiveArrangement, useSpatialScene } from './useSpatialScene';

/** Shared so a listener-only change is exactly that: the store keeps
 *  `unplugged.tracks` by identity when only the listener moves. */
const NO_SAVED_TRACKS = {};

function withListener(score: Score, listener: UnpluggedListener): Score {
  return {
    ...score,
    unplugged: { listener, tracks: score.unplugged?.tracks ?? NO_SAVED_TRACKS },
  };
}

describe('useSpatialScene', () => {
  it('keeps the instruments by identity across a listener-only change, and moves only the camera', () => {
    const base = twoTrackScore();
    const sounding = new Set<string>();
    const start = withListener(base, { x: 0, z: 0, facingDeg: 0 });
    const { result, rerender } = renderHook(
      ({ score }) => useSpatialScene(score, sounding),
      { initialProps: { score: start } }
    );
    const first = result.current;

    // A walking frame: same tracks, same saved positions, new listener.
    rerender({
      score: withListener(start, { x: 1, z: 0.5, facingDeg: 15 }),
    });
    const second = result.current;

    expect(second.instruments).toBe(first.instruments);
    expect(second.camera).not.toBe(first.camera);
    expect(second.camera.position[0]).toBeCloseTo(-1);
    expect(second.camera.position[2]).toBeCloseTo(0.5);
  });

  it('rebuilds the instruments when the lit set changes, sharing the geometry', () => {
    const score = twoTrackScore();
    const [trackId] = score.tracks.map(t => t.id);
    const { result, rerender } = renderHook(
      ({ sounding }) => useSpatialScene(score, sounding),
      { initialProps: { sounding: new Set<string>() } }
    );
    const first = result.current;

    rerender({ sounding: new Set([trackId]) });
    const second = result.current;

    expect(second.instruments).not.toBe(first.instruments);
    expect(second.camera).toBe(first.camera);
    const lit = second.instruments.find(i => i.trackId === trackId)!;
    expect(lit.lit).toBe(true);
    expect(lit.geometry).toBe(
      first.instruments.find(i => i.trackId === trackId)!.geometry
    );
  });

  it('rebuilds the instruments when a track is dragged, leaving the camera', () => {
    const base = twoTrackScore();
    const [trackId] = base.tracks.map(t => t.id);
    const listener = { x: 0, z: 0, facingDeg: 0 };
    const sounding = new Set<string>();
    const { result, rerender } = renderHook(
      ({ score }) => useSpatialScene(score, sounding),
      { initialProps: { score: withListener(base, listener) } }
    );
    const first = result.current;

    rerender({
      score: {
        ...base,
        unplugged: { listener, tracks: { [trackId]: { x: 2, z: 3 } } },
      },
    });
    const second = result.current;

    expect(second.instruments).not.toBe(first.instruments);
    expect(second.camera).toBe(first.camera);
    const moved = second.instruments.find(i => i.trackId === trackId)!;
    expect(moved.position[2]).toBeCloseTo(3);
  });
});

describe('useEffectiveArrangement', () => {
  it('keeps `tracks` by identity across a listener-only change', () => {
    const base = twoTrackScore();
    const { result, rerender } = renderHook(
      ({ score }) => useEffectiveArrangement(score),
      {
        initialProps: {
          score: withListener(base, { x: 0, z: 0, facingDeg: 0 }),
        },
      }
    );
    const first = result.current;
    rerender({
      score: withListener(base, { x: 3, z: 1, facingDeg: 90 }),
    });
    expect(result.current.tracks).toBe(first.tracks);
    expect(result.current.listener).toEqual({ x: 3, z: 1, facingDeg: 90 });
  });

  it('is stable across re-renders of an untouched score, default listener included', () => {
    const score = twoTrackScore();
    expect(score.unplugged).toBeUndefined();
    const { result, rerender } = renderHook(() =>
      useEffectiveArrangement(score)
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first.listener).toEqual({ x: 0, z: 0, facingDeg: 0 });
    expect(Object.keys(first.tracks).sort()).toEqual(
      score.tracks.map(t => t.id).sort()
    );
  });
});
