/**
 * Continuous, held-key walking for the 3D view — web's raw-input capture
 * over `music_spatial_core`'s `stepListener`. Up = forward, Down = back,
 * Left = turn left, Right = turn right, the same scheme the map overlay's
 * own discrete nudge already uses, so the two controls feel related even
 * though one is a one-shot step and this one is continuous.
 *
 * Kept alongside the map's discrete nudge rather than replacing it — see
 * `MapOverlay`'s doc for why both exist. This hook does its own
 * `requestAnimationFrame` loop rather than piggybacking on React's render
 * cycle, since movement must continue smoothly for as long as a key is
 * held, independent of whatever else causes a re-render.
 */
import { useEffect, useRef } from 'react';
import {
  stepListener,
  DEFAULT_MOVEMENT_SPEED,
  type MovementSpeed,
} from '@sudobility/music_spatial_core';
import type { UnpluggedListener } from '@sudobility/music_types';

type Axis = { readonly forward?: number; readonly turn?: number };

const KEY_TO_AXIS: Record<string, Axis> = {
  ArrowUp: { forward: 1 },
  ArrowDown: { forward: -1 },
  ArrowLeft: { turn: -1 },
  ArrowRight: { turn: 1 },
};

/** Longest single frame's delta this will act on — a tab regaining focus
 *  after being backgrounded should not teleport the listener across the
 *  whole stage in one "frame". */
const MAX_DELTA_SECONDS = 0.1;

export interface UseKeyboardMovementOptions {
  readonly enabled?: boolean;
  readonly speed?: MovementSpeed;
}

export function useKeyboardMovement(
  listener: UnpluggedListener,
  onMove: (next: UnpluggedListener) => void,
  options?: UseKeyboardMovementOptions
): void {
  const enabled = options?.enabled ?? true;
  const speed = options?.speed ?? DEFAULT_MOVEMENT_SPEED;

  const heldRef = useRef<Set<string>>(new Set());
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!enabled) return;

    let frame: number | null = null;
    let lastTime: number | null = null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key in KEY_TO_AXIS) {
        heldRef.current.add(event.key);
        event.preventDefault();
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      heldRef.current.delete(event.key);
    }
    function onBlur() {
      // A key released while the window doesn't have focus never fires
      // `keyup` — without this, alt-tabbing away mid-turn leaves the
      // listener walking forever.
      heldRef.current.clear();
    }

    function tick(time: number) {
      const deltaSeconds =
        lastTime === null
          ? 0
          : Math.min((time - lastTime) / 1000, MAX_DELTA_SECONDS);
      lastTime = time;

      if (heldRef.current.size > 0 && deltaSeconds > 0) {
        let forward = 0;
        let turn = 0;
        for (const key of heldRef.current) {
          const axis = KEY_TO_AXIS[key];
          forward += axis.forward ?? 0;
          turn += axis.turn ?? 0;
        }
        const next = stepListener(
          listenerRef.current,
          { forward, strafe: 0, turn },
          deltaSeconds,
          speed
        );
        listenerRef.current = next;
        onMoveRef.current(next);
      }
      frame = requestAnimationFrame(tick);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (frame !== null) cancelAnimationFrame(frame);
      heldRef.current.clear();
    };
  }, [enabled, speed]);
}
