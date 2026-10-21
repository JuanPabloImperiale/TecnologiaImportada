import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSharedSubscription } from './sharedSubscription';

describe('createSharedSubscription', () => {
  afterEach(() => vi.useRealTimers());

  it('shares one source and reuses its last value across subscribers', () => {
    const source = vi.fn();
    const callbacks: { onData: (value: number) => void; onError: (error: unknown) => void }[] = [];
    source.mockImplementation((onData, onError) => {
      callbacks.push({ onData, onError });
      return vi.fn();
    });

    const shared = createSharedSubscription<number>(source);
    const firstData: number[] = [];
    const secondData: number[] = [];
    const unsubscribeFirst = shared.subscribe((value) => firstData.push(value), vi.fn());
    callbacks[0].onData(244);
    unsubscribeFirst();

    const unsubscribeSecond = shared.subscribe((value) => secondData.push(value), vi.fn());
    callbacks[0].onData(245);

    expect(source).toHaveBeenCalledTimes(1);
    expect(firstData).toEqual([244]);
    expect(secondData).toEqual([244, 245]);
    unsubscribeSecond();
    shared.dispose();
  });

  it('restarts the source after an error and notifies current subscribers', () => {
    const callbacks: { onData: (value: number) => void; onError: (error: unknown) => void }[] = [];
    const source = vi.fn((onData: (value: number) => void, onError: (error: unknown) => void) => {
      callbacks.push({ onData, onError });
      return vi.fn();
    });
    const shared = createSharedSubscription<number>(source);
    const onError = vi.fn();

    shared.subscribe(vi.fn(), onError);
    callbacks[0].onError(new Error('offline'));
    shared.subscribe(vi.fn(), vi.fn());

    expect(onError).toHaveBeenCalledOnce();
    expect(source).toHaveBeenCalledTimes(2);
    shared.dispose();
  });

  it('keeps the source briefly for route changes, then closes it while idle', () => {
    vi.useFakeTimers();
    const callbacks: { onData: (value: number) => void; onError: (error: unknown) => void }[] = [];
    const stops: ReturnType<typeof vi.fn>[] = [];
    const source = vi.fn((onData: (value: number) => void, onError: (error: unknown) => void) => {
      callbacks.push({ onData, onError });
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    const shared = createSharedSubscription<number>(source);
    const unsubscribeFirst = shared.subscribe(vi.fn(), vi.fn());
    callbacks[0].onData(244);
    unsubscribeFirst();

    vi.advanceTimersByTime(29_999);
    expect(stops[0]).not.toHaveBeenCalled();

    const secondData: number[] = [];
    const unsubscribeSecond = shared.subscribe((value) => secondData.push(value), vi.fn());
    expect(secondData).toEqual([244]);
    expect(source).toHaveBeenCalledOnce();

    unsubscribeSecond();
    vi.advanceTimersByTime(30_000);
    expect(stops[0]).toHaveBeenCalledOnce();

    shared.dispose();
  });
});