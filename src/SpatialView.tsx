/**
 * The public entry point: the first-person 3D stage plus its map overlay,
 * composed per the spec. No audio dependency, no command-layer dependency
 * — `onMoveListener`/`onMoveTrack`/`onResetArrangement` are called, never
 * dispatched to directly, and the host app wires them to
 * `setUnpluggedListenerCommand`/`setUnpluggedTrackPositionCommand`/
 * `resetUnpluggedArrangementCommand` exactly as the original `UnpluggedTab`
 * did.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  effectiveUnpluggedArrangement,
  facingTrackId,
  trackColors,
} from '@sudobility/music_spatial_core';
import type {
  Score,
  UnpluggedListener,
  UnpluggedPoint,
} from '@sudobility/music_types';
import { SpatialCanvas } from './SpatialCanvas';
import { MapOverlay, type MapOverlayLabels } from './MapOverlay';
import { useKeyboardMovement } from './useKeyboardMovement';
import { useWander } from './useWander';

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
  readonly mapLabels?: MapOverlayLabels;
  /** Stage background colour for the 3D view. Default: a dark blue-grey. */
  readonly stageBackground?: string;
  /**
   * Called when the instrument the listener is facing changes — the
   * nearest one within the field of view, with hysteresis so standing
   * between two does not flicker (see core's `facingTrackId`). A host
   * follows it with its active track. Called with null only when the
   * listener turns away from everything.
   */
  readonly onFacingTrackChange?: (trackId: string | null) => void;
  readonly className?: string;
}

export function SpatialView({
  score,
  soundingTrackIds,
  locked = false,
  showMap = true,
  onMoveListener,
  onMoveTrack,
  onResetArrangement,
  mapLabels,
  stageBackground,
  onFacingTrackChange,
  className,
}: SpatialViewProps) {
  const arrangement = effectiveUnpluggedArrangement(score);
  const colors = useMemo(() => trackColors(score.tracks), [score.tracks]);
  const wanderInstruments = useMemo(
    () =>
      score.tracks.flatMap(track => {
        const point = arrangement.tracks[track.id];
        return point
          ? [{ id: track.id, point, sounding: soundingTrackIds.has(track.id) }]
          : [];
      }),
    [score.tracks, arrangement.tracks, soundingTrackIds]
  );
  const [wandering, setWandering] = useState(false);

  // Continuous walking is deliberately not gated on `locked`: locked
  // disables *rearranging* instruments and the listener via drag, but
  // walking through the stage is a read of the score, not an edit to it —
  // the same distinction the spec draws for `locked` generally.
  useKeyboardMovement(arrangement.listener, onMoveListener);
  useWander(wandering, arrangement.listener, wanderInstruments, onMoveListener);

  // Follow the instrument in front of the listener. The last reported id is
  // the hysteresis reference, so the pick sticks until something is clearly
  // nearer or it leaves the field of view.
  const facingRef = useRef<string | null>(null);
  const onFacingRef = useRef(onFacingTrackChange);
  onFacingRef.current = onFacingTrackChange;
  const { listener } = arrangement;
  useEffect(() => {
    if (!onFacingRef.current) return;
    const next = facingTrackId(
      listener,
      wanderInstruments.map(i => ({ id: i.id, point: i.point })),
      facingRef.current
    );
    if (next !== facingRef.current) {
      facingRef.current = next;
      onFacingRef.current(next);
    }
  }, [listener, wanderInstruments]);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <SpatialCanvas
        score={score}
        soundingTrackIds={soundingTrackIds}
        background={stageBackground}
        className="spatial-canvas"
      />
      {showMap && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 220,
          }}
        >
          <MapOverlay
            tracks={score.tracks}
            colors={colors}
            listener={arrangement.listener}
            trackPositions={arrangement.tracks}
            soundingTrackIds={soundingTrackIds}
            locked={locked}
            onMoveListener={onMoveListener}
            onMoveTrack={onMoveTrack}
            onResetArrangement={onResetArrangement}
            wandering={wandering}
            onWanderingChange={setWandering}
            labels={mapLabels}
          />
        </div>
      )}
    </div>
  );
}
