import { ApiError } from "./api";
import type { LocalState, Mutation } from "./types";
export interface Repository {
  read(accountId: string): Promise<LocalState>;
  update(accountId: string, change: (state: LocalState) => void): Promise<void>;
  write(accountId: string, state: LocalState): Promise<void>;
  enqueue(accountId: string, mutation: Mutation): Promise<void>;
}
export class Queue {
  private running = false;
  private stopped = false;
  constructor(
    private accountId: string,
    private repo: Repository,
    private send: (
      mutation: Mutation,
    ) => Promise<{ id?: string; replacement?: { id: string } }>,
    private changed: () => void,
    private unauthorized: () => void,
  ) {}
  stop() {
    this.stopped = true;
  }
  async flush() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const current = await this.repo.read(this.accountId);
      // A crash or lost response may leave sending rows; their original keys are retained.
      for (const original of current.queue.filter(
        (x) =>
          x.accountId === this.accountId &&
          (x.state === "pending" || x.state === "sending"),
      )) {
        if (this.stopped) break;
        let item = original;
        await this.repo.update(this.accountId, (state) => {
          item = state.queue.find((x) => x.id === original.id)!;
          item.state = "sending";
          delete item.error;
        });
        this.changed();
        try {
          const result = await this.send(item);
          if (this.stopped) break;
          await this.repo.update(this.accountId, (latest) => {
            const row = latest.queue.find((x) => x.id === item.id)!;
            row.state = "posted";
            row.eventId = result.id || result.replacement?.id;
          });
        } catch (error) {
          if (this.stopped) break;
          const transient =
            !(error instanceof ApiError) ||
            error.status >= 500 ||
            error.status === 429 ||
            error.status === 401;
          await this.repo.update(this.accountId, (latest) => {
            const row = latest.queue.find((x) => x.id === item.id)!;
            row.state = transient ? "pending" : "needs_attention";
            row.error =
              error instanceof Error ? error.message : "Reconnect to retry.";
          });
          if (error instanceof ApiError && error.status === 401) {
            this.stopped = true;
            this.unauthorized();
          }
          if (transient) break;
        } finally {
          this.changed();
        }
      }
    } finally {
      this.running = false;
    }
  }
}
