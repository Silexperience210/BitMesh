/**
 * Rate limiter pour limiter les appels par seconde
 * 
 * Usage: const limited = rateLimit(fn, 1000); // max 1 appel par seconde
 */

export function rateLimit<T extends (...args: any[]) => any>(
  fn: T,
  minIntervalMs: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= minIntervalMs) {
      lastCall = now;
      return fn(...args);
    }
    console.warn('[RateLimit] Appel ignoré (trop fréquent)');
    return undefined;
  };
}

/**
 * Rate limiter avec file d'attente
 * 
 * Usage: const queue = createRateLimitedQueue(10, 1000); // max 10 msg/sec
 */
export function createRateLimitedQueue(
  maxPerSecond: number,
  burstSize: number = maxPerSecond
) {
  const queue: (() => void)[] = [];
  let tokens = burstSize;
  let lastRefill = Date.now();
  
  const refillTokens = () => {
    const now = Date.now();
    const elapsed = now - lastRefill;
    const refill = (elapsed / 1000) * maxPerSecond;
    tokens = Math.min(burstSize, tokens + refill);
    lastRefill = now;
  };
  
  return {
    enqueue: (fn: () => void) => {
      refillTokens();
      
      if (tokens >= 1) {
        tokens--;
        fn();
      } else {
        queue.push(fn);
        console.warn('[RateLimit] Message en file d\'attente');
      }
    },
    
    processQueue: () => {
      refillTokens();
      
      while (queue.length > 0 && tokens >= 1) {
        const fn = queue.shift();
        if (fn) {
          tokens--;
          fn();
        }
      }
    },
    
    getQueueSize: () => queue.length,
  };
}
