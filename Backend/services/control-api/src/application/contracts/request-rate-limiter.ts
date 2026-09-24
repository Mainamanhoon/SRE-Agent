export abstract class RequestRateLimiter {
  public abstract allow(now?: number): boolean;
}
