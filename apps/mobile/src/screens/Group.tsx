import React, { useCallback, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { useStore } from "../core/store";
import { money } from "../core/money";
import type { Balance, FinancialEvent } from "../core/types";
import type { ScreenProps } from "../navigation";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Eyebrow,
  Field,
  Heading,
  Loading,
  Page,
  Row,
  Txt,
  c,
} from "../components/ui";
export function GroupScreen({ route, navigation }: ScreenProps<"Group">) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 430;
  const actionsStyle = {
    flexDirection: stacked ? ("column" as const) : ("row" as const),
    alignItems: "stretch" as const,
  };
  const { groupId } = route.params;
  const { groups, local, refreshGroup, api, offline, session } = useStore();
  const snapshot = local.snapshots[groupId],
    group = groups.find((x) => x.id === groupId) || snapshot?.group;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [searched, setSearched] = useState<FinancialEvent[] | null>(null),
    [nextOffset, setNextOffset] = useState<number | null>(25),
    [explanation, setExplanation] = useState<{
      userId: string;
      events: (FinancialEvent & { contributionPaise: string })[];
    } | null>(null);
  useFocusEffect(
    useCallback(() => {
      void refreshGroup(groupId).catch((e) => setError(e.message));
    }, [groupId, refreshGroup]),
  );
  const name = (id?: string) =>
    group?.members.find((m) => m.id === id)?.displayName || "Member";
  const rows = searched || snapshot?.history || [];
  const pending = local.queue.filter(
    (x) => x.groupId === groupId && x.state !== "posted",
  );
  async function search(more = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api!.request<{
        items: FinancialEvent[];
        nextOffset: number | null;
      }>(
        `/api/v1/groups/${groupId}/history?q=${encodeURIComponent(query)}&limit=25&offset=${more ? nextOffset : 0}`,
      );
      setSearched(more ? [...rows, ...result.items] : result.items);
      setNextOffset(result.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function explain(userId: string) {
    setError("");
    try {
      setExplanation(
        await api!.request(
          `/api/v1/groups/${groupId}/explanations?user_id=${userId}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!group)
    return (
      <Page title="Your group">
        {error ? <ErrorBox message={error} /> : <Loading />}
      </Page>
    );
  return (
    <Page
      title={group.name}
      subtitle={`${group.members.length} people, one shared story.`}
      footer={
        !group.archived && (
          <Row style={actionsStyle}>
            <Button
              label="+ Add expense"
              compact={!stacked}
              onPress={() => navigation.navigate("Expense", { groupId })}
            />
            <Button
              label="Record payment"
              secondary
              compact={!stacked}
              onPress={() => navigation.navigate("Settlement", { groupId })}
            />
          </Row>
        )
      }
    >
      <Row>
        <Eyebrow>THE GROUP TAB</Eyebrow>
        <Badge warning={offline}>
          {group.archived
            ? "Archived"
            : offline
              ? "Saved offline"
              : "Live group"}
        </Badge>
      </Row>
      {!!pending.length && (
        <Button
          label={`${pending.length} pending · balances exclude these writes`}
          secondary
          onPress={() => navigation.navigate("Queue")}
        />
      )}
      <Card>
        <Row style={{ flexWrap: "wrap" }}>
          <Heading small>Where you stand</Heading>
          <Txt mono muted>
            INR
          </Txt>
        </Row>
        {!snapshot ? (
          <Loading />
        ) : (
          snapshot.balances.map((balance: Balance) => (
            <Row key={balance.userId} style={actionsStyle}>
              <Row style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
                <Avatar name={name(balance.userId)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt>
                    {name(balance.userId)}
                    {balance.userId === session?.id ? " (you)" : ""}
                  </Txt>
                  <Txt muted style={{ fontSize: 11 }}>
                    {BigInt(balance.balancePaise) > 0n
                      ? "Gets back"
                      : BigInt(balance.balancePaise) < 0n
                        ? "Owes"
                        : "All square"}
                  </Txt>
                </View>
              </Row>
              <View
                style={{
                  alignItems: stacked ? "flex-start" : "flex-end",
                  gap: 8,
                  minWidth: 0,
                  maxWidth: stacked ? "100%" : "55%",
                }}
              >
                <Txt
                  style={{
                    fontSize: 20,
                    color:
                      BigInt(balance.balancePaise) < 0n ? c.debit : c.credit,
                  }}
                >
                  {money(balance.balancePaise)}
                </Txt>
                <Button
                  label="Explain balance"
                  accessibilityLabel={`Explain ${name(balance.userId)}'s balance`}
                  secondary
                  onPress={() => void explain(balance.userId)}
                />
              </View>
            </Row>
          ))
        )}
        {snapshot && (
          <Txt muted mono>
            Confirmed as of {new Date(snapshot.fetchedAt).toLocaleTimeString()}
          </Txt>
        )}
      </Card>
      {explanation && (
        <Card>
          <Row style={actionsStyle}>
            <Heading small>{name(explanation.userId)}’s balance</Heading>
            <Button
              label="Close explanation"
              secondary
              compact={!stacked}
              onPress={() => setExplanation(null)}
            />
          </Row>
          {explanation.events.length ? (
            explanation.events.map((event) => (
              <Row key={event.id}>
                <Txt style={{ flex: 1 }}>
                  {event.title || event.kind} · {event.effective_date}
                </Txt>
                <Txt mono>{money(event.contributionPaise)}</Txt>
              </Row>
            ))
          ) : (
            <Txt muted>No contributing events yet.</Txt>
          )}
        </Card>
      )}
      <Row style={actionsStyle}>
        <Button
          label="People & invites"
          secondary
          compact={!stacked}
          onPress={() => navigation.navigate("Members", { groupId })}
        />
        <Button
          label="Monthly report"
          secondary
          compact={!stacked}
          onPress={() => navigation.navigate("Report", { groupId })}
        />
        <Button
          label="Close out"
          secondary
          compact={!stacked}
          onPress={() => navigation.navigate("Closeout", { groupId })}
        />
      </Row>
      <Row style={actionsStyle}>
        <Heading small>The shared history</Heading>
        <Button
          label="Refresh"
          secondary
          compact={!stacked}
          onPress={() => {
            setSearched(null);
            void refreshGroup(groupId).catch((e) => setError(e.message));
          }}
        />
      </Row>
      <Field
        label="Search history"
        value={query}
        onChange={setQuery}
        placeholder="Title, category, date, or member"
      />
      <Button
        label="Search"
        secondary
        busy={busy}
        onPress={() => void search()}
      />
      {!rows.length && (
        <Empty
          title="A fresh start."
          detail="Add your first shared expense. Everyone’s balance will appear here."
        />
      )}
      {rows.map((event) => {
        const corrected = rows.some((e) => e.reversesEventId === event.id);
        return (
          <Card key={event.id}>
            <Row>
              <Badge warning={event.kind === "reversal"}>
                {event.kind === "reversal"
                  ? "Reversed"
                  : event.kind === "settlement"
                    ? "Payment recorded"
                    : corrected
                      ? "Corrected original"
                      : "Expense"}
              </Badge>
              <Txt mono>{money(event.amountPaise)}</Txt>
            </Row>
            <Txt style={{ fontSize: 19 }}>
              {event.title ||
                (event.kind === "settlement"
                  ? `${name(event.fromUserId)} → ${name(event.toUserId)}`
                  : event.reason)}
            </Txt>
            <Txt muted style={{ fontSize: 12 }}>
              {event.effective_date} · by {name(event.actor_id)}
              {event.payerId ? ` · paid by ${name(event.payerId)}` : ""}
            </Txt>
            {event.note && <Txt muted>{event.note}</Txt>}
            {event.correctionOfEventId && (
              <Txt mono muted>
                Replaces {event.correctionOfEventId.slice(0, 8)}
              </Txt>
            )}
            {event.reversesEventId && (
              <Txt mono muted>
                Original {event.reversesEventId.slice(0, 8)}
              </Txt>
            )}
            <Txt muted mono>
              Recorded {new Date(event.recorded_at).toLocaleString()}
            </Txt>
            {event.kind === "expense" &&
              !corrected &&
              !group.archived &&
              (session?.id === group.ownerId ||
                event.actor_id === session?.id) && (
                <Button
                  label={`Correct ${event.title}`}
                  secondary
                  onPress={() =>
                    navigation.navigate("Expense", {
                      groupId,
                      correction: event,
                    })
                  }
                />
              )}
          </Card>
        );
      })}
      {rows.length >= 25 && nextOffset !== null && (
        <Button
          label="Load more history"
          secondary
          busy={busy}
          onPress={() => void search(true)}
        />
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
