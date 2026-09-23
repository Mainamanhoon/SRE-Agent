export abstract class RepairToolServer {
  public abstract start(): Promise<void>;

  public abstract close(): Promise<void>;
}
