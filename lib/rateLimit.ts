/**
 * Application-level rate limiter for social actions.
 * Prevents spam by tracking action timestamps per key.
 */

type RateLimitConfig = {
  maxActions: number;    // max actions allowed
  windowMs: number;      // time window in milliseconds
};

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  like: { maxActions: 30, windowMs: 60_000 },        // 30 likes per minute
  comment: { maxActions: 10, windowMs: 60_000 },      // 10 comments per minute
  follow: { maxActions: 20, windowMs: 60_000 },       // 20 follows per minute
};

// Track timestamps of recent actions
const actionLog: Record<string, number[]> = {};

export function checkRateLimit(action: string): { allowed: boolean; retryAfterMs?: number } {
  const config = RATE_LIMITS[action];
  if (!config) return { allowed: true };

  const now = Date.now();
  const key = action;

  if (!actionLog[key]) {
    actionLog[key] = [];
  }

  // Remove expired entries
  actionLog[key] = actionLog[key].filter(ts => now - ts < config.windowMs);

  if (actionLog[key].length >= config.maxActions) {
    const oldestInWindow = actionLog[key][0];
    const retryAfterMs = config.windowMs - (now - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }

  actionLog[key].push(now);
  return { allowed: true };
}

export function resetRateLimit(action?: string): void {
  if (action) {
    delete actionLog[action];
  } else {
    Object.keys(actionLog).forEach(key => delete actionLog[key]);
  }
}
