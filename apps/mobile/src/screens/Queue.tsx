import React, { useState } from "react";
import { useStore } from "../core/store";
import { money } from "../core/money";
import {
  Badge,
  Button,
  Card,
  Details,
  Empty,
  ErrorBox,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function QueueScreen() {
  const { local, groups, flush, updateLocal } = useStore();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    setError("");
    try {
      await flush();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Sync status"
      subtitle="Your confirmed expenses and payments."
      footer={
        <Button label="Sync now" busy={busy} onPress={() => void sync()} />
      }
    >
      <Txt muted>
        Pending items are saved on this phone. Balances update after they sync.
      </Txt>
      {!local.queue.length && (
        <Empty
          title="All clear."
          detail="Expenses and payments appear here after you confirm them."
        />
      )}
      {[...local.queue].reverse().map((item) => (
        <Card key={item.id}>
          <Row>
            <Badge warning={item.state === "needs_attention"}>
              {item.state === "posted"
                ? "Synced"
                : item.state === "needs_attention"
                  ? "Needs attention"
                  : item.state === "sending"
                    ? "Sending"
                    : "Pending"}
            </Badge>
            <Txt mono>
              {money(
                "amountPaise" in item.body
                  ? item.body.amountPaise
                  : item.body.replacement.amountPaise,
              )}
            </Txt>
          </Row>
          <Heading small>
            {"title" in item.body
              ? item.body.title
              : "replacement" in item.body
                ? `Correction: ${item.body.replacement.title}`
                : "External payment"}
          </Heading>
          <Txt muted>
            {groups.find((g) => g.id === item.groupId)?.name || "Group"} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </Txt>
          <Details title="Sync details">
            <Txt mono muted>
              Request {item.id.slice(0, 8)} ·{" "}
              {item.eventId
                ? `Event ${item.eventId.slice(0, 8)}`
                : "Awaiting server confirmation"}
            </Txt>
            <Txt muted>
              Retries keep the same request key to avoid duplicate records.
            </Txt>
          </Details>
          {item.error && <ErrorBox message={item.error} />}
          {item.state === "needs_attention" && (
            <>
              <Txt muted>Check the group and balance before retrying.</Txt>
              <Button
                label="Retry this exact request"
                secondary
                onPress={() => {
                  void updateLocal((state) => {
                    const row = state.queue.find((x) => x.id === item.id)!;
                    row.state = "pending";
                    delete row.error;
                  })
                    .then(sync)
                    .catch((e) => setError(e.message));
                }}
              />
              <Button
                label="Discard rejected request"
                secondary
                onPress={() => {
                  void updateLocal((state) => {
                    state.queue = state.queue.filter((x) => x.id !== item.id);
                  }).catch((e) => setError(e.message));
                }}
              />
              <Txt muted>
                Discarding returns a linked suggestion to your inbox for review.
              </Txt>
            </>
          )}
        </Card>
      ))}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
