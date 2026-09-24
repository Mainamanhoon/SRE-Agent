export class DiagnosisAdmissionRejectedError extends Error {
  public constructor() {
    super("diagnosis admission queue is full");
    this.name = "DiagnosisAdmissionRejectedError";
  }
}

export class DiagnosisTimeoutError extends Error {
  public constructor() {
    super("diagnosis exceeded its execution deadline");
    this.name = "DiagnosisTimeoutError";
  }
}

export abstract class DiagnosisAdmissionController {
  public abstract run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T>;

  public abstract snapshot(): { active: number; queued: number; capacity: number };
}
