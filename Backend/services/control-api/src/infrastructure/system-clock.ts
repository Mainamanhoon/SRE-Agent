import { Clock } from "../application/contracts/clock.js";

export class SystemClock extends Clock {
  public override now(): Date {
    return new Date();
  }
}
