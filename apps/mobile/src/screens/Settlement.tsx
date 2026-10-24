import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../core/store";
import { localDate, money, rupees, toPaise } from "../core/money";
import type { ScreenProps } from "../navigation";
import {
  Button,
  Card,
  Check,
  Choice,
  ErrorBox,
  Field,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function SettlementScreen({
  route,
  navigation,
}: ScreenProps<"Settlement">) {
  const { groupId, draftId } = route.params;
  const { groups, local, api, session, confirm } = useStore();
  const group =
    groups.find((g) => g.id === groupId) || local.snapshots[groupId]?.group;
  const [from, setFrom] = useState(
      route.params.fromUserId || session?.id || "",
    ),
    [to, setTo] = useState(route.params.toUserId || ""),
    [amount, setAmount] = useState(
      route.params.amountPaise ? rupees(route.params.amountPaise) : "",
    ),
    [date, setDate] = useState(localDate());
  const [suggestions, setSuggestions] = useState<
      { fromUserId: string; toUserId: string; amountPaise: string }[]
    >([]),
    [error, setError] = useState(""),
    [paid, setPaid] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  useEffect(() => {
    void api
      ?.request<{ suggestions: typeof suggestions }>(
        `/api/v1/groups/${groupId}/settlement-suggestions`,
      )
      .then((result) => setSuggestions(result.suggestions))
      .catch((e) => setError(e.message));
  }, [api, groupId]);
  const name = (id: string) =>
    group?.members.find((m) => m.id === id)?.displayName || "Member";
  function body() {
    if (!from || !to || from === to)
      throw new Error("Choose two different group members.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error("Enter a valid date as YYYY-MM-DD.");
    return {
      fromUserId: from,
      toUserId: to,
      amountPaise: toPaise(amount),
      effectiveDate: date,
    };
  }
  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      if (!paid)
        throw new Error(
          "Confirm that the payment has already happened outside Splix.",
        );
      await confirm({
        groupId,
        path: `/api/v1/groups/${groupId}/settlements`,
        body: body(),
        ...(draftId ? { draftId } : {}),
      });
      navigation.popTo("Group", { groupId });
    } catch (e) {
      submitted.current = false;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!group)
    return (
      <Page title="Record a payment">
        <ErrorBox message="Open a current group first." />
      </Page>
    );
  return (
    <Page
      title="Record payment"
      subtitle={`${group.name} · For money already paid.`}
      footer={
        <Button
          label={review ? "Confirm recorded payment" : "Review payment"}
          busy={busy}
          disabled={group.archived || (review && !paid)}
          onPress={() => {
            if (review) void submit();
            else {
              try {
                body();
                setReview(true);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }
          }}
        />
      }
    >
      {!review && !!suggestions.length && (
        <Card>
          <Heading small>Suggested payments</Heading>
          <Txt muted>Tap a suggestion to fill the form.</Txt>
          {suggestions.map((suggestion, i) => (
            <Button
              key={i}
              secondary
              label={`${name(suggestion.fromUserId)} → ${name(suggestion.toUserId)} · ${money(suggestion.amountPaise)}`}
              onPress={() => {
                setFrom(suggestion.fromUserId);
                setTo(suggestion.toUserId);
                setAmount(rupees(suggestion.amountPaise));
              }}
            />
          ))}
        </Card>
      )}
      {review ? (
        <>
          <Card>
            <Heading>{money(toPaise(amount))}</Heading>
            <Row>
              <Txt>{name(from)}</Txt>
              <Txt>→</Txt>
              <Txt>{name(to)}</Txt>
            </Row>
            <Txt muted>{date} · External payment</Txt>
          </Card>
          <Check
            label="This payment was already made outside Splix"
            checked={paid}
            onChange={() => setPaid(!paid)}
          />
          <Txt muted>
            Only record money already paid. We’ll check the current balance when
            it syncs.
          </Txt>
          <Button
            label="Edit payment"
            secondary
            onPress={() => setReview(false)}
          />
        </>
      ) : (
        <>
          <Choice
            label="Who paid?"
            value={from}
            onChange={setFrom}
            options={group.members.map((x) => ({
              value: x.id,
              label: x.displayName,
            }))}
          />
          <Choice
            label="Who received it?"
            value={to}
            onChange={setTo}
            options={group.members
              .filter((x) => x.id !== from)
              .map((x) => ({ value: x.id, label: x.displayName }))}
          />
          <Field
            label="Payment amount (₹)"
            value={amount}
            onChange={setAmount}
            keyboardType="decimal-pad"
          />
          <Field
            label="Payment date"
            value={date}
            onChange={setDate}
            hint="YYYY-MM-DD"
          />
        </>
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
