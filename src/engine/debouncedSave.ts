export interface DebouncedSaveOptions {
  delayMs: number;
  maxWaitMs: number;
  onError: (error: unknown) => void;
}

export class DebouncedSave<T> {
  private pending: T | undefined;
  private delayTimer: ReturnType<typeof setTimeout> | undefined;
  private maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly options: DebouncedSaveOptions,
  ) {}

  schedule(value: T): void {
    this.pending = value;
    if (this.delayTimer !== undefined) clearTimeout(this.delayTimer);
    this.delayTimer = setTimeout(() => void this.flush(), this.options.delayMs);
    this.maxWaitTimer ??= setTimeout(() => void this.flush(), this.options.maxWaitMs);
  }

  flush(): Promise<void> {
    if (this.pending === undefined) return this.queue;
    const value = this.pending;
    this.pending = undefined;
    this.clearTimers();
    this.queue = this.queue
      .then(() => this.save(value))
      .catch((error) => this.options.onError(error));
    return this.queue;
  }

  dispose(): void {
    this.pending = undefined;
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.delayTimer !== undefined) clearTimeout(this.delayTimer);
    if (this.maxWaitTimer !== undefined) clearTimeout(this.maxWaitTimer);
    this.delayTimer = undefined;
    this.maxWaitTimer = undefined;
  }
}
