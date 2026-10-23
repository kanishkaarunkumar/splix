import React, { useState } from "react";
import { useStore } from "../core/store";
import { money } from "../core/money";
import {
  Badge,
  Button,
  Card,
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
      title="Saved. Then synced."
      subtitle="Only the writes you confirmed are here."
      footer={
        <Button
          label="Retry pending writes"
          busy={busy}
          onPress={() => void sync()}
        />
      }
    >
      <Txt muted>
        Pending writes are saved on this device and excluded from confirmed
        balances. Retries use the same request key, even after restart or a lost
        response.
      </Txt>
      {!local.queue.length && (
        <Empty
          title="All clear."
          detail="Confirm an expense or a payment to add a write to this queue."
        />
      )}
      {[...local.queue].reverse().map((item) => (
        <Card key={item.id}>
          <Row>
            <Badge warning={item.state === "needs_attention"}>
              {item.state === "posted"
                ? "Committed"
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
          <Txt mono muted>
            Request {item.id.slice(0, 8)} ·{" "}
            {item.eventId
              ? `Event ${item.eventId.slice(0, 8)}`
              : "Awaiting server confirmation"}
          </Txt>
          {item.error && <ErrorBox message={item.error} />}
          {item.state === "needs_attention" && (
            <>
              <Txt muted>
                Check the group’s current membership, balance, and history
                before retrying. This request keeps its original payload and
                key.
              </Txt>
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
                Discard only removes this rejected request. A linked suggestion
                returns to the private inbox for a fresh review.
              </Txt>
            </>
          )}
        </Card>
      ))}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
