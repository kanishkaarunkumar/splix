import { expect, test } from "vitest";
import { Queue, type Repository } from "./queue";
import { ApiError } from "./api";
import { emptyLocal, type Mutation } from "./types";
const mutation = (id: string, accountId = "a"): Mutation => ({
  id,
  accountId,
  groupId: "g",
  path: "/api/v1/groups/g/settlements",
  body: {
    fromUserId: "a",
    toUserId: "b",
    amountPaise: "100",
    effectiveDate: "2026-01-01",
  },
  createdAt: 1,
  state: "pending",
});
class MemoryRepo implements Repository {
  state = emptyLocal();
  async read() {
    return structuredClone(this.state);
  }
  async write(_: string, value: typeof this.state) {
    this.state = structuredClone(value);
  }
  async update(_: string, change: (value: typeof this.state) => void) {
    change(this.state);
  }
  async enqueue(_: string, value: Mutation) {
    this.state.queue.push(structuredClone(value));
  }
}
test("lost response + restart replays the original key and creates one server event", async () => {
  const repo = new MemoryRepo();
  repo.state.queue = [mutation("stable-key")];
  const server = new Map<string, { id: string }>();
  let loseResponse = true;
  const sent: string[] = [];
  const send = async (row: Mutation) => {
    sent.push(row.id);
    if (!server.has(row.id)) server.set(row.id, { id: "committed-event" });
    if (loseResponse) {
      loseResponse = false;
      throw new TypeError("Network response lost");
    }
    return server.get(row.id)!;
  };
  await new Queue(
    "a",
    repo,
    send,
    () => {},
    () => {},
  ).flush();
  expect(repo.state.queue[0].state).toBe("pending");
  await new Queue(
    "a",
    repo,
    send,
    () => {},
    () => {},
  ).flush();
  expect(sent).toEqual(["stable-key", "stable-key"]);
  expect(server.size).toBe(1);
  expect(repo.state.queue[0].eventId).toBe("committed-event");
});
test("recovers sending rows and never sends another account’s queue", async () => {
  const repo = new MemoryRepo();
  repo.state.queue = [mutation("crashed"), mutation("other", "b")];
  repo.state.queue[0].state = "sending";
  const sent: string[] = [];
  await new Queue(
    "a",
    repo,
    async (row) => {
      sent.push(row.id);
      return { id: "done" };
    },
    () => {},
    () => {},
  ).flush();
  expect(sent).toEqual(["crashed"]);
  expect(repo.state.queue[1].state).toBe("pending");
});
test("conflicts need review; auth expiry pauses and retains the request", async () => {
  const repo = new MemoryRepo();
  repo.state.queue = [
    mutation("conflict"),
    mutation("expired"),
    mutation("later"),
  ];
  let expired = false;
  const queue = new Queue(
    "a",
    repo,
    async (row) => {
      throw new ApiError(
        row.id === "conflict" ? 409 : 401,
        "CONFLICT",
        "Review required",
      );
    },
    () => {},
    () => {
      expired = true;
    },
  );
  await queue.flush();
  expect(repo.state.queue.map((x) => x.state)).toEqual([
    "needs_attention",
    "pending",
    "pending",
  ]);
  expect(expired).toBe(true);
});
test("concurrent flushes do not double-send; writes enqueued while awaiting are preserved", async () => {
  const repo = new MemoryRepo();
  repo.state.queue = [mutation("one")];
  let calls = 0;
  const queue = new Queue(
    "a",
    repo,
    async () => {
      calls++;
      await repo.enqueue("a", mutation("two"));
      return { id: "done" };
    },
    () => {},
    () => {},
  );
  await Promise.all([queue.flush(), queue.flush()]);
  expect(calls).toBe(1);
  expect(repo.state.queue.map((x) => x.id)).toEqual(["one", "two"]);
  expect(repo.state.queue[1].state).toBe("pending");
});
