export interface DebouncedSaveOptions {
  delayMs: number;
  maxWaitMs: number;
  onError: (error: unknown) => void;
  onStatusChange?: (status: DebouncedSaveStatus) => void;
}

export type DebouncedSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function shouldWarnBeforeUnload(status: DebouncedSaveStatus): boolean {
  return status === 'pending' || status === 'saving' || status === 'error';
}

export class DebouncedSave<T> {
  private pending: T | undefined;
  private delayTimer: ReturnType<typeof setTimeout> | undefined;
  private maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();
  private queuedSaves = 0;

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly options: DebouncedSaveOptions,
  ) {}

  schedule(value: T): void {
    this.pending = value;
    this.options.onStatusChange?.('pending');
    if (this.delayTimer !== undefined) clearTimeout(this.delayTimer);
    this.delayTimer = setTimeout(() => void this.flush(), this.options.delayMs);
    this.maxWaitTimer ??= setTimeout(() => void this.flush(), this.options.maxWaitMs);
  }

  flush(): Promise<void> {
    if (this.pending === undefined) return this.queue;
    const value = this.pending;
    this.pending = undefined;
    this.clearTimers();
    this.queuedSaves += 1;
    this.queue = this.queue.then(async () => {
      this.options.onStatusChange?.('saving');
      try {
        await this.save(value);
        this.queuedSaves -= 1;
        this.options.onStatusChange?.(
          this.pending !== undefined || this.queuedSaves > 0 ? 'pending' : 'saved',
        );
      } catch (error) {
        this.queuedSaves -= 1;
        this.options.onError(error);
        this.options.onStatusChange?.(
          this.pending !== undefined || this.queuedSaves > 0 ? 'pending' : 'error',
        );
      }
    });
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
