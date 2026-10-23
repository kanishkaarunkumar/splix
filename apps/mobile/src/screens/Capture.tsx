import React, { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureSources, captureStatus, nativeCapture } from "../core/capture";
import { HomeDock } from "../components/HomeDock";
import { useStore } from "../core/store";
import type { CaptureDraft } from "../core/types";
import type { ScreenProps } from "../navigation";
import { money } from "../core/money";
import {
  Badge,
  Button,
  Card,
  Check,
  Choice,
  Empty,
  ErrorBox,
  Eyebrow,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function CaptureScreen({ navigation }: ScreenProps<"Capture">) {
  const { session, groups, api } = useStore();
  const accountId = session!.id;
  const [status, setStatus] = useState(() => captureStatus(accountId)),
    [selectedGroup, setSelectedGroup] = useState(""),
    [duration, setDuration] = useState("60"),
    [sources, setSources] = useState<string[]>([]),
    [agreed, setAgreed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    setStatus(captureStatus(accountId));
  }, [accountId]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(refresh, 10000);
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => {
        clearInterval(timer);
        listener.remove();
      };
    }, [refresh]),
  );
  function run(action: () => void) {
    setError("");
    try {
      action();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function activate() {
    setBusy(true);
    setError("");
    try {
      const fresh = await api!.request<typeof groups>("/api/v1/groups");
      if (!fresh.some((g) => g.id === selectedGroup && !g.archived))
        throw new Error("Choose a current, active group you belong to.");
      nativeCapture!.activate(
        session!.id,
        selectedGroup,
        Number(duration) * 60000,
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Pay, then decide."
      subtitle="Active Group Mode · entirely optional."
    >
      <Card>
        <Eyebrow>PRIVATE BY DESIGN</Eyebrow>
        <Heading small>A suggestion, never an expense.</Heading>
        <Txt>
          With your permission, Splix checks selected UPI app notifications on
          this Android device for likely outgoing payments. It stores a minimal
          private suggestion for you to review.
        </Txt>
        <Txt muted>
          Notification access can expose other notifications to an app. Splix
          filters the source before parsing, never uploads notification text,
          and never uses SMS or accessibility access. Capture can miss payments
          or suggest duplicates. Your manual app always works without it.
        </Txt>
        <Txt muted>
          Suggestions may include an amount, payee label, time, and the group
          active when captured. They remain on this device until you delete
          them. Turn off access in Android settings at any time.
        </Txt>
      </Card>
      {!status.available ? (
        <Empty
          title="Manual works here."
          detail="Payment capture requires the custom Splix Android build. Browser previews and generic Expo Go cannot monitor notifications."
          action={
            <Button
              label="Back to your groups"
              secondary
              onPress={() => navigation.navigate("Home")}
            />
          }
        />
      ) : (
        <>
          <Badge warning={!status.granted}>
            {!status.granted
              ? "Notification access is off"
              : status.paused
                ? "Capture is paused / expired"
                : "Active on this device"}
          </Badge>
          {!status.paused && (
            <Card>
              <Txt>
                Capturing for{" "}
                {groups.find((g) => g.id === status.groupId)?.name ||
                  "your selected group"}
              </Txt>
              <Txt mono muted>
                Stops at {new Date(status.expiresAt!).toLocaleTimeString()}
              </Txt>
              <Row>
                <Button
                  label="Pause capture"
                  compact
                  secondary
                  onPress={() => run(() => nativeCapture!.pause(session!.id))}
                />
                <Button
                  label="Stop capture"
                  compact
                  secondary
                  onPress={() => run(() => nativeCapture!.stop(session!.id))}
                />
              </Row>
            </Card>
          )}
          <Card>
            <Heading small>Choose the sources</Heading>
            <Txt muted>
              These are candidate sources; real-device coverage is still being
              evaluated.
            </Txt>
            {captureSources.map((source) => (
              <Check
                key={source.id}
                label={source.name}
                checked={sources.includes(source.id)}
                onChange={() =>
                  setSources(
                    sources.includes(source.id)
                      ? sources.filter((x) => x !== source.id)
                      : [...sources, source.id],
                  )
                }
              />
            ))}
            <Check
              label="I understand and consent to private payment suggestions on this device"
              checked={agreed}
              onChange={() => setAgreed(!agreed)}
            />
            <Button
              label={
                status.granted
                  ? "Update consent & access"
                  : "Agree & open Android settings"
              }
              disabled={!agreed || !sources.length}
              onPress={() =>
                run(() => nativeCapture!.consent(session!.id, sources))
              }
            />
          </Card>
          {status.granted && status.consent && (
            <Card>
              <Choice
                label="One active group"
                value={selectedGroup}
                onChange={setSelectedGroup}
                options={groups
                  .filter((g) => !g.archived)
                  .map((g) => ({ value: g.id, label: g.name }))}
              />
              <Choice
                label="Automatically stop after"
                value={duration}
                onChange={setDuration}
                options={[
                  { value: "30", label: "30 min" },
                  { value: "60", label: "1 hour" },
                  { value: "120", label: "2 hours" },
                  { value: "240", label: "4 hours" },
                ]}
              />
              <Txt muted>
                Switching groups keeps older suggestions assigned to their
                captured group. You can change that when reviewing.
              </Txt>
              <Button
                label="Start active mode"
                disabled={!selectedGroup}
                busy={busy}
                onPress={() => void activate()}
              />
            </Card>
          )}
        </>
      )}
      <Button
        label="Open private inbox"
        secondary
        onPress={() => navigation.navigate("Inbox")}
      />
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
export function InboxScreen({ route, navigation }: ScreenProps<"Inbox">) {
  const { session, groups, local, reloadLocal, updateLocal } = useStore();
  const accountId = session!.id;
  const [drafts, setDrafts] = useState<CaptureDraft[]>([]),
    [error, setError] = useState(""),
    [reviewId, setReviewId] = useState<string | null>(
      route.params?.draftId || null,
    ),
    [groupId, setGroupId] = useState(""),
    [kind, setKind] = useState("expense");
  const refresh = useCallback(() => {
    try {
      setDrafts(nativeCapture?.drafts(accountId) || []);
      void reloadLocal();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [accountId, reloadLocal]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const current = drafts.find(
    (d) =>
      d.id === reviewId &&
      d.accountId === session?.id &&
      d.state === "needs_review",
  );
  const selectedGroupId = groupId || current?.groupId || "";
  function disposition(draft: CaptureDraft, state: "personal" | "dismissed") {
    setError("");
    try {
      nativeCapture!.disposition(session!.id, draft.id, state);
      setReviewId(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const visible = drafts.filter((d) => d.state === "needs_review");
  return (
    <Page
      title="Just between us."
      subtitle="Your private suggestions · this device only."
      footer={<HomeDock active="inbox" />}
    >
      <Txt muted>
        Opening a suggestion never posts it. Review the amount and group, then
        deliberately confirm an expense or a payment.
      </Txt>
      {route.params?.draftId && !current && (
        <ErrorBox message="This link does not point to an available suggestion for this signed-in account. Nothing has been posted." />
      )}
      {current ? (
        <Card>
          <Badge warning={current.duplicateWarning}>
            {current.duplicateWarning
              ? "Possible duplicate · check history first"
              : "Needs your review"}
          </Badge>
          <Heading>{money(current.amountPaise)}</Heading>
          <Txt>{current.payeeLabel}</Txt>
          <Txt muted>{new Date(current.observedAt).toLocaleString()}</Txt>
          <Choice
            label="Review as"
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Shared expense" },
              { value: "settlement", label: "External payment" },
            ]}
          />
          <Choice
            label="Confirm the group"
            value={selectedGroupId}
            onChange={setGroupId}
            options={groups
              .filter((g) => !g.archived)
              .map((g) => ({ value: g.id, label: g.name }))}
          />
          <Txt muted>
            Captured for{" "}
            {groups.find((g) => g.id === current.groupId)?.name ||
              "an unavailable group"}
            . An explicit group choice applies only to this review.
          </Txt>
          <Button
            label="Continue to review"
            disabled={
              !groups.some((g) => g.id === selectedGroupId && !g.archived)
            }
            onPress={() => {
              if (kind === "expense")
                navigation.navigate("Expense", {
                  groupId: selectedGroupId,
                  draftId: current.id,
                });
              else
                navigation.navigate("Settlement", {
                  groupId: selectedGroupId,
                  draftId: current.id,
                  amountPaise: current.amountPaise,
                });
            }}
          />
          <Row>
            <Button
              label="Personal / not shared"
              secondary
              compact
              onPress={() => disposition(current, "personal")}
            />
            <Button
              label="Dismiss"
              secondary
              compact
              onPress={() => disposition(current, "dismissed")}
            />
          </Row>
          <Button label="Later" secondary onPress={() => setReviewId(null)} />
        </Card>
      ) : visible.length ? (
        visible.map((draft) => (
          <Card key={draft.id}>
            <Row>
              <Txt>{draft.payeeLabel}</Txt>
              <Txt mono>{money(draft.amountPaise)}</Txt>
            </Row>
            <Txt muted>
              {groups.find((g) => g.id === draft.groupId)?.name ||
                "Captured group unavailable"}{" "}
              · {new Date(draft.observedAt).toLocaleDateString()}
            </Txt>
            {draft.duplicateWarning && (
              <Badge warning>Possible duplicate</Badge>
            )}
            <Button
              label={`Review ${draft.payeeLabel}`}
              onPress={() => {
                setGroupId("");
                setReviewId(draft.id);
              }}
            />
          </Card>
        ))
      ) : (
        <Empty
          title="Nothing waiting on you."
          detail="Private payment suggestions will appear here when Active Group Mode detects a candidate payment. You can always add an expense yourself."
          action={
            <Button
              label="Active mode settings"
              secondary
              onPress={() => navigation.navigate("Capture")}
            />
          }
        />
      )}
      {!!Object.keys(local.forms).length && (
        <Card>
          <Heading small>Saved manual drafts</Heading>
          {Object.entries(local.forms).map(([key, form]) => {
            const groupId = key.split(":")[0];
            return (
              <Card key={key}>
                <Button
                  label={`Resume ${form.title || "expense draft"}`}
                  secondary
                  onPress={() =>
                    navigation.navigate("Expense", { groupId, initial: form })
                  }
                />
                <Button
                  label={`Discard ${form.title || "expense draft"}`}
                  secondary
                  onPress={() =>
                    void updateLocal((state) => {
                      delete state.forms[key];
                    })
                  }
                />
              </Card>
            );
          })}
        </Card>
      )}
      {drafts.some((d) => ["queued", "needs_attention"].includes(d.state)) && (
        <Button
          label="Review confirmed writes in queue"
          secondary
          onPress={() => navigation.navigate("Queue")}
        />
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
