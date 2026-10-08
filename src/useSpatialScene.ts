/**
 * The memo boundaries of the stage, in one place.
 *
 * Everything that moves here arrives as a new `score` — a walking frame is
 * a new `score.unplugged.listener` — and the first version memoised the
 * whole scene on `score`, so every step rebuilt every instrument's element
 * to move a camera that was the only thing that had changed. Core's
 * `buildInstruments` and `cameraFor` are separate functions for exactly
 * this; these hooks key each on its own inputs, and key the effective
 * arrangement's two halves apart as well, because
 * `effectiveUnpluggedArrangement` allocates on every call (its result was
 * never reference-stable, so a memo on it never hit).
 */
import { useMemo } from 'react';
import {
  buildInstruments,
  cameraFor,
  effectiveUnpluggedArrangement,
  type SpatialScene,
} from '@sudobility/music_spatial_core';
import { defaultUnpluggedListener } from '@sudobility/music_types';
import type {
  EffectiveUnpluggedArrangement,
  Score,
  UnpluggedListener,
} from '@sudobility/music_types';

export type ArrangementScore = Pick<Score, 'tracks' | 'unplugged'>;

/**
 * `effectiveUnpluggedArrangement(score)`, reference-stable per half: its
 * `tracks` reads only the roster's ids and `score.unplugged.tracks` (the
 * default half-circle layered under the saved positions), and its
 * `listener` reads only `score.unplugged.listener`. A listener move keeps
 * `tracks` by identity, so anything memoised on it — the instruments, the
 * wander targets, the facing pick — stays put.
 */
export function useEffectiveArrangement(
  score: ArrangementScore
): EffectiveUnpluggedArrangement {
  const savedTracks = score.unplugged?.tracks;
  const savedListener = score.unplugged?.listener;
  const tracks = useMemo(
    // Only `.tracks` is kept, and it depends on nothing but the two deps —
    // the listener the closure can also see never reaches it.
    () => effectiveUnpluggedArrangement(score).tracks,
    [score.tracks, savedTracks]
  );
  const listener = useMemo(
    () => savedListener ?? defaultUnpluggedListener(),
    [savedListener]
  );
  return useMemo(() => ({ listener, tracks }), [listener, tracks]);
}

/**
 * The scene for `SpatialCanvas`: `instruments` keyed on the roster, the
 * arrangement's track positions and the lit set; `camera` on the listener
 * alone. A listener-only change returns the same `instruments` array.
 */
export function useSpatialScene(
  score: ArrangementScore,
  soundingTrackIds: ReadonlySet<string>,
  listenerOverride?: UnpluggedListener
): SpatialScene {
  const { tracks: arrangementTracks, listener } =
    useEffectiveArrangement(score);
  const instruments = useMemo(
    () => buildInstruments(score.tracks, arrangementTracks, soundingTrackIds),
    [score.tracks, arrangementTracks, soundingTrackIds]
  );
  const cameraListener = listenerOverride ?? listener;
  const camera = useMemo(() => cameraFor(cameraListener), [cameraListener]);
  return useMemo(() => ({ instruments, camera }), [instruments, camera]);
}
