/**
 * Horizontal stage turn. Every move commits the new heading straight to the
 * one source of truth — `score.unplugged.listener`, through `onMove` — and the
 * stage camera redraws from that single value. There is no separate drag
 * "preview": the hook holds no listener of its own. Commits coalesce into one
 * undo entry (see `setUnpluggedListenerCommand`), exactly like the walk and the
 * map drag.
 */
import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { listenerForStageDrag } from '@sudobility/music_spatial_core';
import type { UnpluggedListener } from '@sudobility/music_types';

type DragStart = {
  readonly pointerId: number;
  readonly listener: UnpluggedListener;
  readonly startX: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export function useStageDrag(
  listener: UnpluggedListener,
  onMove: (next: UnpluggedListener) => void,
  onStart?: () => void
) {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const startRef = useRef<DragStart | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || startRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    startRef.current = {
      pointerId: event.pointerId,
      // The press anchors the turn; the drag distance from here is the angle.
      // Fixed at press, so our own per-move commits never feed back into it.
      listener: listenerRef.current,
      startX: event.clientX - rect.left,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    onStartRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const next = listenerForStageDrag(
      start.listener,
      { width: start.width, height: start.height },
      start.startX,
      event.clientX - start.left
    );
    // Skip a no-op frame, but otherwise commit live so the camera turns with
    // the pointer — the source is the only thing the camera reads.
    if (next.facingDeg !== listenerRef.current.facingDeg) {
      onMoveRef.current(next);
    }
    event.preventDefault();
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startRef.current?.pointerId !== event.pointerId) return;
    startRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startRef.current?.pointerId !== event.pointerId) return;
    startRef.current = null;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture,
  };
}
