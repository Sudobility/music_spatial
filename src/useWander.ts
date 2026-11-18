/**
 * Random walking. Each step is reported through `onStep`, which the caller
 * commits to the one listener position (`score.unplugged.listener`) — the
 * walk keeps no position of its own beyond the frame it is computing.
 */
import { useEffect, useRef } from 'react';
import {
  IDLE_WANDER,
  stepWander,
  type WanderInstrument,
  type WanderState,
} from '@sudobility/music_spatial_core';
import type { UnpluggedListener } from '@sudobility/music_types';

const MAX_DELTA_SECONDS = 0.1;

export function useWander(
  enabled: boolean,
  listener: UnpluggedListener,
  instruments: readonly WanderInstrument[],
  onStep: (next: UnpluggedListener) => void
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const instrumentsRef = useRef(instruments);
  instrumentsRef.current = instruments;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    if (!enabled) return;
    let currentListener = listenerRef.current;
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
          currentListener,
          state,
          instrumentsRef.current,
          deltaSeconds
        );
        state = step.state;
        if (step.listener !== currentListener) {
          currentListener = step.listener;
          onStepRef.current(currentListener);
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
