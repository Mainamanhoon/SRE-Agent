import { RequestRateLimiter } from "../contracts/request-rate-limiter.js";

export class TokenBucketRequestRateLimiterV1 extends RequestRateLimiter {
  private tokens: number;
  private lastRefill: number;

  public constructor(
    private readonly requestsPerSecond: number,
    private readonly capacity: number,
    now = Date.now(),
  ) {
    super();
    this.tokens = capacity;
    this.lastRefill = now;
  }

  public override allow(now = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1_000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.requestsPerSecond);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
