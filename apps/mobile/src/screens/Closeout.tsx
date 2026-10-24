import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useStore } from "../core/store";
import { captureStatus, nativeCapture } from "../core/capture";
import { money } from "../core/money";
import type { ScreenProps } from "../navigation";
import {
  Badge,
  Button,
  Card,
  Check,
  ErrorBox,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function CloseoutScreen({ route, navigation }: ScreenProps<"Closeout">) {
  const { groupId } = route.params;
  const { session, groups, local, api, refreshGroup } = useStore();
  const group = groups.find((g) => g.id === groupId),
    snapshot = local.snapshots[groupId];
  const [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      void refreshGroup(groupId).catch((e) => setError(e.message));
    }, [groupId, refreshGroup]),
  );
  const pending = local.queue.filter(
    (x) => x.groupId === groupId && x.state !== "posted",
  ).length;
  const drafts =
    nativeCapture
      ?.drafts(session!.id)
      .filter((d) => d.groupId === groupId && d.state === "needs_review")
      .length || 0;
  const forms = Object.keys(local.forms).filter((key) =>
    key.startsWith(`${groupId}:`),
  ).length;
  const settled =
    !!snapshot && snapshot.balances.every((b) => BigInt(b.balancePaise) === 0n);
  async function archive() {
    setBusy(true);
    setError("");
    try {
      await refreshGroup(groupId);
      const freshDrafts =
        nativeCapture
          ?.drafts(session!.id)
          .filter((d) => d.groupId === groupId && d.state === "needs_review")
          .length || 0;
      if (freshDrafts)
        throw new Error(
          "Review this device’s new suggestions before archiving.",
        );
      await api!.request(`/api/v1/groups/${groupId}/archive`, {
        method: "POST",
      });
      if (captureStatus(session!.id).groupId === groupId)
        nativeCapture?.stop(session!.id);
      await refreshGroup(groupId);
      navigation.popTo("Group", { groupId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Close group" subtitle={group?.name || "Group"}>
      <Card>
        <Heading small>Before you close</Heading>
        <Row>
          <Txt>Private suggestions to review</Txt>
          <Badge warning={!!drafts}>{drafts}</Badge>
        </Row>
        <Row>
          <Txt>Saved manual drafts</Txt>
          <Badge warning={!!forms}>{forms}</Badge>
        </Row>
        <Row>
          <Txt>Waiting to sync</Txt>
          <Badge warning={!!pending}>{pending}</Badge>
        </Row>
        <Txt muted>
          These counts are for this phone. Check that everyone has added their
          expenses.
        </Txt>
      </Card>
      <Card>
        <Heading small>Confirmed group balances</Heading>
        {snapshot?.balances.map((balance) => (
          <Row key={balance.userId}>
            <Txt>
              {group?.members.find((m) => m.id === balance.userId)
                ?.displayName || "Member"}
            </Txt>
            <Txt mono>{money(balance.balancePaise)}</Txt>
          </Row>
        ))}
        <Badge warning={!settled}>
          {settled ? "Everyone is square" : "Balances still need settling"}
        </Badge>
      </Card>
      <Button
        label="Review private inbox"
        secondary
        onPress={() => navigation.navigate("Inbox")}
      />
      <Button
        label="Review queue"
        secondary
        onPress={() => navigation.navigate("Queue")}
      />
      <Button
        label="Export monthly summary"
        secondary
        onPress={() => navigation.navigate("Report", { groupId })}
      />
      {group?.ownerId === session?.id && !group?.archived && (
        <>
          <Check
            label="I’ve checked this device and confirmed the group is ready to close"
            checked={ack}
            onChange={() => setAck(!ack)}
          />
          <Button
            label="Archive group"
            disabled={!ack || !settled || !!drafts || !!pending || !!forms}
            busy={busy}
            onPress={() => void archive()}
          />
          <Txt muted>
            History stays available. New expenses stop, and all balances must be
            settled.
          </Txt>
        </>
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
