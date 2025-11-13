/**
 * Performance utility functions for throttling and debouncing
 */

/**
 * Throttle a function to only execute once per specified time period
 * @param func The function to throttle
 * @param limit Time limit in milliseconds
 * @returns Throttled function with cancel method
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let inThrottle: boolean;
  let lastResult: ReturnType<T>;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(this, args);
      timeoutId = setTimeout(() => {
        inThrottle = false;
        timeoutId = null;
      }, limit);
    }
    return lastResult;
  } as ((...args: Parameters<T>) => void) & { cancel: () => void };

  // Add cancel method to clear pending timeout
  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      inThrottle = false;
    }
  };

  return throttled;
}

/**
 * Debounce a function to only execute after specified time has passed since last call
 * @param func The function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  } as ((...args: Parameters<T>) => void) & { cancel: () => void };

  // Add cancel method to clear pending timeout
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Request animation frame throttle for smooth 60fps animations
 * @param func The function to throttle
 * @returns RAF throttled function with cancel method
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let rafId: number | null = null;

  const throttled = function (this: any, ...args: Parameters<T>) {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, args);
        rafId = null;
      });
    }
  } as ((...args: Parameters<T>) => void) & { cancel: () => void };

  // Add cancel method to clear pending RAF callback
  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled;
}
