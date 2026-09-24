/**
 * Random walking on the web: a frame loop over `music_spatial_core`'s
 * `stepWander`, the same shape as `useKeyboardMovement`. The hook owns the
 * loop and the random source; the behaviour — which playing instrument to
 * head for, how to ease there, when to give up on one that fell silent —
 * is core's, tested there with a fixed `rng`.
 */
import { useEffect, useRef } from 'react';
import {
  IDLE_WANDER,
  stepWander,
  type WanderInstrument,
  type WanderState,
} from '@sudobility/music_spatial_core';
import type { UnpluggedListener } from '@sudobility/music_types';

/** Longest single frame acted on — a tab coming back from the background must not teleport the listener. */
const MAX_DELTA_SECONDS = 0.1;

export function useWander(
  enabled: boolean,
  listener: UnpluggedListener,
  instruments: readonly WanderInstrument[],
  onMove: (next: UnpluggedListener) => void
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const instrumentsRef = useRef(instruments);
  instrumentsRef.current = instruments;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!enabled) return;
    let frame: number | null = null;
    let lastTime: number | null = null;
    let state: WanderState = IDLE_WANDER;

    function tick(time: number) {
      const deltaSeconds =
        lastTime === null
          ? 0
          : Math.min((time - lastTime) / 1000, MAX_DELTA_SECONDS);
      lastTime = time;
      if (deltaSeconds > 0) {
        const step = stepWander(
          listenerRef.current,
          state,
          instrumentsRef.current,
          deltaSeconds
        );
        state = step.state;
        if (step.listener !== listenerRef.current) {
          listenerRef.current = step.listener;
          onMoveRef.current(step.listener);
        }
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled]);
}
