interface Observer<T> {
  onData: (value: T) => void;
  onError: (error: unknown) => void;
}

export interface SharedSubscription<T> {
  subscribe(onData: (value: T) => void, onError: (error: unknown) => void): () => void;
  dispose(): void;
}

export function createSharedSubscription<T>(
  start: (
    onData: (value: T) => void,
    onError: (error: unknown) => void,
  ) => () => void,
): SharedSubscription<T> {
  const idleTimeoutMs = 30_000;
  const observers = new Set<Observer<T>>();
  let stopSource: (() => void) | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let lastValue: T;
  let hasLastValue = false;

  return {
    subscribe(onData, onError) {
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      const observer = { onData, onError };
      observers.add(observer);
      if (hasLastValue) onData(lastValue);

      if (!stopSource) {
        stopSource = start(
          (value) => {
            lastValue = value;
            hasLastValue = true;
            observers.forEach((current) => current.onData(value));
          },
          (error) => {
            const stop = stopSource;
            stopSource = null;
            if (stopTimer) clearTimeout(stopTimer);
            stopTimer = null;
            stop?.();
            observers.forEach((current) => current.onError(error));
          },
        );
      }

      return () => {
        observers.delete(observer);
        if (observers.size === 0 && stopSource && !stopTimer) {
          stopTimer = setTimeout(() => {
            stopSource?.();
            stopSource = null;
            stopTimer = null;
          }, idleTimeoutMs);
        }
      };
    },

    dispose() {
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = null;
      stopSource?.();
      stopSource = null;
      observers.clear();
      hasLastValue = false;
    },
  };
}