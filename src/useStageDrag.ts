/** Direct horizontal stage preview; commit once on pointer release. */
import { useRef, useState } from 'react';
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
  readonly currentX: number;
};

export function useStageDrag(
  listener: UnpluggedListener,
  onMove: (next: UnpluggedListener) => void,
  onStart?: () => void
) {
  const [preview, setPreview] = useState<UnpluggedListener | null>(null);
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
    const x = event.clientX - rect.left;
    startRef.current = {
      pointerId: event.pointerId,
      listener: listenerRef.current,
      startX: x,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      currentX: x,
    };
    onStartRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const x = event.clientX - start.left;
    startRef.current = { ...start, currentX: x };
    setPreview(
      listenerForStageDrag(
        start.listener,
        { width: start.width, height: start.height },
        start.startX,
        x
      )
    );
    event.preventDefault();
  };

  const finish = (
    event: ReactPointerEvent<HTMLDivElement>,
    commit: boolean
  ) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    startRef.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!commit) return;
    const x = event.clientX - start.left;
    const final = listenerForStageDrag(
      start.listener,
      { width: start.width, height: start.height },
      start.startX,
      x
    );
    if (final.facingDeg !== start.listener.facingDeg) onMoveRef.current(final);
  };

  const onLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startRef.current?.pointerId !== event.pointerId) return;
    startRef.current = null;
    setPreview(null);
  };

  return {
    preview,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) =>
      finish(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) =>
      finish(event, false),
    onLostPointerCapture,
  };
}
