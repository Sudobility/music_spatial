import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardMovement } from './useKeyboardMovement';

const LISTENER = { x: 0, z: 0, facingDeg: 0 };

function fireKeyDown(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}
function fireKeyUp(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key }));
}

describe('useKeyboardMovement', () => {
  let time = 0;
  let queued: ((time: number) => void) | null = null;
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    time = 0;
    queued = null;
    rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: (time: number) => void) => {
        queued = cb;
        return 1;
      });
    cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      queued = null;
    });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  /** Manually advances the mocked clock and runs exactly the one queued
   *  frame — never lets the mock recurse on its own, so each tick is
   *  precisely controlled rather than free-running. */
  function flush(deltaMs: number) {
    time += deltaMs;
    const cb = queued;
    queued = null;
    if (cb) act(() => cb(time));
  }

  it('does not call onMove when no key is held', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    flush(16);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves forward (+z) while ArrowUp is held', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    act(() => fireKeyDown('ArrowUp'));
    flush(16); // first tick has no previous timestamp, establishes the baseline
    flush(16); // second tick actually moves
    expect(onMove).toHaveBeenCalled();
    const [next] = onMove.mock.calls[onMove.mock.calls.length - 1];
    expect(next.z).toBeGreaterThan(0);
    expect(next.x).toBeCloseTo(0);
  });

  it('turns right (increasing facingDeg) while ArrowRight is held', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    act(() => fireKeyDown('ArrowRight'));
    flush(16);
    flush(16);
    const [next] = onMove.mock.calls[onMove.mock.calls.length - 1];
    expect(next.facingDeg).toBeGreaterThan(0);
  });

  it('stops calling onMove once the key is released', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    act(() => fireKeyDown('ArrowUp'));
    flush(16);
    flush(16);
    onMove.mockClear();
    act(() => fireKeyUp('ArrowUp'));
    flush(16);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove, { enabled: false }));
    act(() => fireKeyDown('ArrowUp'));
    expect(queued).toBeNull(); // never even started its own frame loop
    expect(onMove).not.toHaveBeenCalled();
  });

  it('clears held keys on unmount, so a lingering frame moves nothing', () => {
    const onMove = vi.fn();
    const { unmount } = renderHook(() => useKeyboardMovement(LISTENER, onMove));
    act(() => fireKeyDown('ArrowUp'));
    unmount();
    expect(queued).toBeNull(); // the pending frame was cancelled on cleanup
  });
});
