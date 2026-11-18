import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStageDrag } from './useStageDrag';

const LISTENER = { x: 2, z: -1, facingDeg: 20 };

function pointer(clientX: number, clientY: number, pointerId = 1) {
  const target = {
    getBoundingClientRect: () => ({ left: 100, width: 800, height: 600 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  return {
    button: 0,
    pointerId,
    clientX,
    clientY,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

describe('useStageDrag', () => {
  it('commits the heading live on a horizontal move, ignores vertical travel, and stops on release', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useStageDrag(LISTENER, onMove));
    act(() => result.current.onPointerDown(pointer(400, 200)));
    // Vertical-only travel does not turn the view, so it commits nothing.
    act(() => result.current.onPointerMove(pointer(400, 550)));
    expect(onMove).not.toHaveBeenCalled();
    // A horizontal drag turns the view and commits straight to the single
    // source of truth — live, while dragging, not on release. There is no
    // local preview to read.
    expect('preview' in result.current).toBe(false);
    act(() => result.current.onPointerMove(pointer(600, 550)));
    expect(onMove).toHaveBeenCalled();
    const calls = onMove.mock.calls;
    const committed = calls[calls.length - 1][0] as {
      x: number;
      z: number;
      facingDeg: number;
    };
    expect(committed.x).toBe(LISTENER.x);
    expect(committed.z).toBe(LISTENER.z);
    expect(committed.facingDeg).toBeLessThan(LISTENER.facingDeg);
    // Release ends the gesture; a later move commits nothing more.
    act(() => result.current.onPointerUp(pointer(600, 200)));
    const afterRelease = onMove.mock.calls.length;
    act(() => result.current.onPointerMove(pointer(300, 200)));
    expect(onMove.mock.calls.length).toBe(afterRelease);
  });

  it('stops on release or pointer capture loss', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useStageDrag(LISTENER, onMove));
    act(() => result.current.onPointerDown(pointer(400, 200)));
    act(() => result.current.onPointerMove(pointer(500, 200)));
    act(() => result.current.onPointerUp(pointer(500, 200)));
    act(() => result.current.onPointerMove(pointer(700, 200)));
    expect(onMove).toHaveBeenCalledTimes(1);
    act(() => result.current.onPointerDown(pointer(400, 200)));
    act(() => result.current.onLostPointerCapture(pointer(400, 200)));
    act(() => result.current.onPointerMove(pointer(700, 200)));
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});
