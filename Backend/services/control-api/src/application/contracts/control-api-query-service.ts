import type { HealthView, SystemView } from "../../domain/system.js";

export abstract class ControlApiQueryService {
  public abstract getHealth(): HealthView;

  public abstract getSystem(): SystemView;
}
