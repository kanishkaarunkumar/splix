import React, { useCallback, useState } from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureSources, captureStatus, nativeCapture } from "../core/capture";
import {
  captureChoicesSaved,
  startCaptureSession,
  startPaymentReminders,
} from "../core/capture-session";
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
  Details,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function CaptureScreen({ navigation }: ScreenProps<"Capture">) {
  const { session, groups, api } = useStore();
  const accountId = session!.id;
  const [status, setStatus] = useState(() => captureStatus(accountId)),
    [selectedGroup, setSelectedGroup] = useState(status.groupId || ""),
    [duration, setDuration] = useState("60"),
    [sources, setSources] = useState<string[]>(status.sources || []),
    [agreed, setAgreed] = useState(status.consent),
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
      const saved = await startCaptureSession(
        nativeCapture!,
        session!.id,
        selectedGroup,
        Number(duration) * 60000,
      );
      setStatus(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enablePrompts() {
    setError("");
    try {
      if (!nativeCapture || Platform.OS !== "android") return;
      if (Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        if (!(await PermissionsAndroid.check(permission))) {
          const result = await PermissionsAndroid.request(permission);
          if (result === PermissionsAndroid.RESULTS.DENIED) {
            setError(
              "Notifications remain off. Payment suggestions still appear in your private inbox.",
            );
            refresh();
            return;
          }
        }
      }
      if (!captureStatus(accountId).promptsEnabled)
        nativeCapture.openPromptSettings(accountId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function enableReminders() {
    setBusy(true);
    setError("");
    try {
      setStatus(await startPaymentReminders(nativeCapture!, accountId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const savedSms =
    !!status.smsPackage && !!status.sources?.includes(status.smsPackage);
  const allowedSource = (source: string) =>
    captureSources.some((item) => item.id === source) ||
    source === status.smsPackage;
  const selectedSources = sources.filter(allowedSource);
  const choicesSaved = captureChoicesSaved(
    selectedSources,
    (status.sources || []).filter(allowedSource),
    status.consent && agreed,
  );
  const ready = status.granted && choicesSaved && status.promptsEnabled;
  const smsMessage = (
    {
      recognized: "Payment found. Check your payment inbox.",
      sender_format:
        "An SMS alert arrived, but its sender format is not supported yet.",
      not_recognized:
        "An SMS alert arrived. It was hidden, unrelated or in an unsupported format.",
      outside_session:
        "This alert was older than your current session. Try a new payment alert.",
      not_stored:
        "This payment was already handled or reminders changed before it could be saved.",
    } as Record<string, string>
  )[status.smsLastResult || ""];
  return (
    <Page
      title="Payment reminders"
      subtitle="Optional. You choose what gets shared."
    >
      <Card tone="teal">
        <Badge
          warning={
            status.paused ||
            !status.promptsEnabled ||
            status.listenerConnected === false
          }
        >
          {status.paused
            ? "Reminders off"
            : !status.promptsEnabled || status.listenerConnected === false
              ? "Action needed"
              : "Reminders on"}
        </Badge>
        <Txt>
          After a supported payment, name it in the notification, choose a group
          or mark it personal.
        </Txt>
        {status.granted && status.listenerConnected === false && (
          <Button
            label="Reconnect alerts"
            secondary
            onPress={() =>
              run(() => nativeCapture!.reconnectListener(accountId))
            }
          />
        )}
        {!status.paused && (
          <>
            <Txt>
              {status.remindersEnabled
                ? "Choose a group after each payment."
                : `${groups.find((g) => g.id === status.groupId)?.name || "Your group"} · until ${new Date(status.expiresAt!).toLocaleTimeString()}`}
            </Txt>
            <Row style={{ flexWrap: "wrap" }}>
              <Button
                label="Pause reminders"
                secondary
                compact
                onPress={() => run(() => nativeCapture!.pause(accountId))}
              />
              <Button
                label="Turn off reminders"
                secondary
                compact
                onPress={() => run(() => nativeCapture!.stop(accountId))}
              />
            </Row>
          </>
        )}
      </Card>
      {!status.available ? (
        <Empty
          title="Set up on Android"
          detail="Open the Splix Android app to enable payment reminders. You can add expenses manually here."
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
          <Card>
            <Heading small>1. Allow Splix notifications</Heading>
            <Badge warning={!status.promptsEnabled}>
              {status.promptsEnabled ? "Allowed" : "Not allowed yet"}
            </Badge>
            <Button
              label={
                status.promptsEnabled
                  ? "Notification settings"
                  : "Allow payment prompts"
              }
              secondary={!!status.promptsEnabled}
              onPress={() =>
                status.promptsEnabled
                  ? run(() => nativeCapture!.openPromptSettings(accountId))
                  : void enablePrompts()
              }
            />
          </Card>
          <Card>
            <Heading small>2. Choose payment alerts</Heading>
            <Txt>
              Splix checks selected alerts on this phone. Android notification
              access can expose other notifications; their text is not uploaded.
              Your SMS inbox is not read.
            </Txt>
            {status.smsPackage ? (
              <>
                <Check
                  label={`Use bank SMS alerts from ${status.smsAppName || "Messages"}`}
                  checked={sources.includes(status.smsPackage)}
                  onChange={() =>
                    setSources(
                      sources.includes(status.smsPackage!)
                        ? sources.filter((s) => s !== status.smsPackage)
                        : [...sources, status.smsPackage!],
                    )
                  }
                />
                {sources.includes(status.smsPackage) && (
                  <>
                    <Txt muted>
                      Allow bank transaction notifications in your Messages app
                      too.
                    </Txt>
                    <Button
                      label="Open SMS notification settings"
                      secondary
                      onPress={() =>
                        run(() =>
                          nativeCapture!.openSmsNotificationSettings(accountId),
                        )
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <Txt muted>
                No default SMS app found. You can use the payment apps below.
              </Txt>
            )}
            <Details title="Other payment apps">
              {captureSources.map((source) => (
                <Check
                  key={source.id}
                  label={source.name}
                  checked={sources.includes(source.id)}
                  onChange={() =>
                    setSources(
                      sources.includes(source.id)
                        ? sources.filter((s) => s !== source.id)
                        : [...sources, source.id],
                    )
                  }
                />
              ))}
            </Details>
            <Check
              label="I agree to private payment suggestions from my selected alerts"
              checked={agreed}
              onChange={() => setAgreed(!agreed)}
            />
            <Badge warning={!choicesSaved}>
              {choicesSaved ? "Choices saved" : "Save your choices to continue"}
            </Badge>
            <Button
              label={
                status.granted
                  ? "Save choices"
                  : "Save & allow notification access"
              }
              disabled={
                !agreed ||
                !selectedSources.length ||
                (choicesSaved && status.granted)
              }
              onPress={() =>
                run(() => nativeCapture!.consent(accountId, selectedSources))
              }
            />
            <Txt muted>
              {status.granted && status.consent
                ? "Access granted. Saving changes pauses reminders."
                : "Android will ask you to allow notification access for Splix."}
            </Txt>
          </Card>
          <Card>
            <Heading small>3. Start reminders</Heading>
            <Txt>Choose the group after a payment. No timer needed.</Txt>
            <Button
              label={
                status.remindersEnabled
                  ? "Reminders are on"
                  : "Enable payment reminders"
              }
              disabled={!ready || status.remindersEnabled}
              busy={busy}
              onPress={() => void enableReminders()}
            />
            {!ready && <Txt muted>Finish steps 1 and 2 first.</Txt>}
            {status.remindersEnabled && (
              <Badge
                warning={
                  status.listenerConnected === false || !status.promptsEnabled
                }
              >
                {status.listenerConnected === false
                  ? "Waiting for Android to connect"
                  : !status.promptsEnabled
                    ? "Allow Splix notifications in step 1"
                    : "Ready for your next payment alert"}
              </Badge>
            )}
          </Card>
          <Details title="Use a group for a limited time">
            <Choice
              label="Group"
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={groups
                .filter((g) => !g.archived)
                .map((g) => ({ value: g.id, label: g.name }))}
            />
            <Choice
              label="Stop after"
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
              New payments use this group. Older drafts keep their original
              group.
            </Txt>
            <Button
              label="Start active mode"
              disabled={!selectedGroup || !status.granted || !choicesSaved}
              busy={busy}
              onPress={() => void activate()}
            />
          </Details>
          <Details title="Troubleshooting">
            <Badge warning={!status.granted}>
              {status.granted
                ? "Notification access allowed"
                : "Notification access off"}
            </Badge>
            {status.granted && status.listenerConnected === false && (
              <>
                <Txt>
                  Android disconnected the listener. Reconnect it, then enable
                  reminders again.
                </Txt>
                <Button
                  label="Reconnect notification listener"
                  secondary
                  onPress={() =>
                    run(() => nativeCapture!.reconnectListener(accountId))
                  }
                />
              </>
            )}
            <Txt>
              {savedSms
                ? smsMessage ||
                  "No SMS alert checked yet. Start reminders and wait for a new bank notification."
                : "Select bank SMS alerts and save your choices to check SMS notifications."}
            </Txt>
            {!!status.smsLastObservedAt && (
              <Txt muted>
                Last check:{" "}
                {new Date(status.smsLastObservedAt).toLocaleString()}
              </Txt>
            )}
            <Txt muted>
              Only the last check time and outcome are saved locally. Sender and
              message text are not saved.
            </Txt>
            <Button
              label="Refresh capture status"
              secondary
              onPress={() => run(() => {})}
            />
          </Details>
        </>
      )}
      <Button
        label="Open payment inbox"
        secondary
        onPress={() => navigation.navigate("Inbox")}
      />
      {error && <ErrorBox message={error} />}
      <Details title="Privacy & how it works">
        <Txt>
          Selected notifications are processed on this phone to suggest an
          amount, payee and time. Bank SMS alerts need a separate opt-in. Splix
          never reads your SMS history or uses accessibility access.
        </Txt>
        <Txt>
          Drafts and troubleshooting status stay on this device until you delete
          them in Your account. Only expenses you review and confirm are shared
          with your group.
        </Txt>
        <Txt>
          Detection can miss alerts or suggest duplicates. Android settings and
          hidden content can prevent detection. Manual entry always works.
        </Txt>
        <Txt>
          Pause reminders, sign out or revoke notification access at any time to
          stop capture.
        </Txt>
      </Details>
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
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      const focus =
        Platform.OS === "android"
          ? AppState.addEventListener("focus", refresh)
          : undefined;
      return () => {
        listener.remove();
        focus?.remove();
      };
    }, [refresh]),
  );
  const current = drafts.find(
    (d) =>
      d.id === reviewId &&
      d.accountId === session?.id &&
      d.state === "needs_review",
  );
  const capturedGroup = groups.find(
    (g) => g.id === current?.groupId && !g.archived,
  );
  const selectedGroupId = groupId || capturedGroup?.id || "";
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
      title="Payment inbox"
      subtitle="Private until you confirm."
      footer={<HomeDock active="inbox" />}
    >
      <Txt muted>
        Choose a payment to name it and pick a group. Nothing is shared until
        you confirm.
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
          {current.enteredTitle && (
            <Txt>What it was for: {current.enteredTitle}</Txt>
          )}
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
            {current.groupId === "__choose_group__"
              ? "Choose a group for this payment above."
              : `Captured for ${capturedGroup?.name || "an unavailable group"}.`}{" "}
            An explicit group choice applies only to this review.
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
            {draft.enteredTitle && <Txt>{draft.enteredTitle}</Txt>}
            <Txt muted>
              {groups.find((g) => g.id === draft.groupId)?.name ||
                (draft.groupId === "__choose_group__"
                  ? "Choose a group during review"
                  : "Captured group unavailable")}{" "}
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
