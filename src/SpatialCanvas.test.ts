import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  buildInstruments,
  instrumentSegmentCount,
} from '@sudobility/music_spatial_core';
import {
  effectiveUnpluggedArrangement,
  trackSpatialModel,
} from '@sudobility/music_types';
import type { Score } from '@sudobility/music_types';
import { twoTrackScore } from '@sudobility/music_types/test';
import { StageInstruments } from './SpatialCanvas';

/** The four-track band the draw-call audit was measured on: piano, bass,
 *  string ensemble, drum kit. */
function bandScore(): Score {
  const base = twoTrackScore();
  const [template] = base.tracks;
  const band = [
    { id: 'piano', name: 'Piano', clef: 'treble', midiProgram: 0 },
    { id: 'bass', name: 'Bass', clef: 'bass', midiProgram: 33 },
    { id: 'strings', name: 'Strings', clef: 'treble', midiProgram: 48 },
    { id: 'kit', name: 'Drums', clef: 'percussion', midiProgram: 0 },
  ] as const;
  return { ...base, tracks: band.map(t => ({ ...template, ...t })) };
}

/** Elements of `type` anywhere in a React element tree. */
function countElements(node: unknown, type: string): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((n, child) => n + countElements(child, type), 0);
  }
  if (!isValidElement(node)) return 0;
  const props = node.props as { readonly children?: unknown };
  return (node.type === type ? 1 : 0) + countElements(props.children, type);
}

function findElements(
  node: unknown,
  type: string
): { readonly props: Record<string, unknown> }[] {
  if (Array.isArray(node))
    return node.flatMap(child => findElements(child, type));
  if (!isValidElement(node)) return [];
  const props = node.props as Record<string, unknown>;
  const own = node.type === type ? [{ props }] : [];
  return [...own, ...findElements(props.children, type)];
}

describe('StageInstruments', () => {
  it('draws a four-track band as four lineSegments and four materials — one per track, not one per stroke', () => {
    const score = bandScore();
    const instruments = buildInstruments(
      score.tracks,
      effectiveUnpluggedArrangement(score).tracks,
      new Set()
    );
    const tree = StageInstruments({ instruments });

    expect(countElements(tree, 'lineSegments')).toBe(4);
    expect(countElements(tree, 'lineBasicMaterial')).toBe(4);

    // What merging bought: this many elements + materials before, at one
    // per stroke. (The audit measured ~645 for this band; the exact figure
    // tracks the authored models.)
    const strokes = score.tracks.reduce(
      (n, track) => n + trackSpatialModel(track).model.strokes.length,
      0
    );
    const segments = score.tracks.reduce(
      (n, track) => n + instrumentSegmentCount(trackSpatialModel(track).model),
      0
    );
    expect(strokes).toBeGreaterThan(100);
    expect(segments).toBeGreaterThanOrEqual(strokes);
  });

  it('colours a sounding track lit and the rest at base', () => {
    const score = bandScore();
    const instruments = buildInstruments(
      score.tracks,
      effectiveUnpluggedArrangement(score).tracks,
      new Set(['bass'])
    );
    const tree = StageInstruments({ instruments });
    const materials = findElements(tree, 'lineBasicMaterial');
    const byTrack = Object.fromEntries(
      instruments.map((instrument, i) => [
        instrument.trackId,
        materials[i].props.color,
      ])
    );
    const bass = instruments.find(i => i.trackId === 'bass')!;
    const piano = instruments.find(i => i.trackId === 'piano')!;
    expect(byTrack.bass).toBe(bass.litColor);
    expect(byTrack.piano).toBe(piano.color);
    expect(bass.litColor).not.toBe(bass.color);
  });
});
