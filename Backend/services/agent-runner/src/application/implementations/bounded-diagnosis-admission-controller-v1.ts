import {
  DiagnosisAdmissionController,
  DiagnosisAdmissionRejectedError,
  DiagnosisTimeoutError,
} from "../contracts/diagnosis-admission-controller.js";

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
}

export class BoundedDiagnosisAdmissionControllerV1 extends DiagnosisAdmissionController {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  public constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly timeoutMs: number,
  ) {
    super();
  }

  public override async run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    await this.acquire(callerSignal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DiagnosisTimeoutError()), this.timeoutMs);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      if (callerSignal?.aborted) controller.abort(callerSignal.reason);
      return await raceWithAbort(operation(controller.signal), controller.signal);
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
      this.release();
    }
  }

  public override snapshot() {
    return { active: this.active, queued: this.waiters.length, capacity: this.maxConcurrent };
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.maxQueued) {
      return Promise.reject(new DiagnosisAdmissionRejectedError());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      waiter.abort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(signal?.reason ?? new Error("diagnosis caller aborted"));
      };
      signal?.addEventListener("abort", waiter.abort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private release(): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.abort) waiter.signal?.removeEventListener("abort", waiter.abort);
      waiter.resolve();
      return;
    }
    this.active -= 1;
  }
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DiagnosisTimeoutError());
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
