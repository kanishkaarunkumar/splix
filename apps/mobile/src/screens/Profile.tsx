import React, { useState } from "react";
import { HomeDock } from "../components/HomeDock";
import { useStore } from "../core/store";
import { repository } from "../core/repository";
import {
  Button,
  Card,
  Check,
  Details,
  ErrorBox,
  Field,
  Page,
  Txt,
} from "../components/ui";
export function ProfileScreen() {
  const { session, api, signOut, signIn, local } = useStore();
  const [name, setName] = useState(session?.displayName || ""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [deletion, setDeletion] = useState(false),
    [localDeletion, setLocalDeletion] = useState(false);
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = local.queue.filter((x) => x.state !== "posted").length;
  return (
    <Page
      title="Your account"
      subtitle={session?.email}
      footer={<HomeDock active="you" />}
    >
      <Card>
        <Field
          label="Your name"
          value={name}
          onChange={setName}
          autoCapitalize="words"
        />
        <Button
          label="Save profile"
          busy={busy}
          disabled={!name.trim()}
          onPress={() =>
            void work(async () => {
              const profile = await api!.request<any>("/api/v1/me", {
                method: "PATCH",
                body: { displayName: name.trim() },
              });
              await signIn({ ...session!, ...profile });
              setNotice("Profile saved.");
            })
          }
        />
      </Card>
      <Card>
        <Details title="Device data & privacy">
          <Txt muted>
            Private drafts stay on this phone. Confirmed group expenses are
            shared with your group.
          </Txt>
          <Txt muted>
            Signing out stops reminders and keeps your drafts for next time.
          </Txt>
          <Txt muted>
            {pending} items waiting to sync. Deleting device data permanently
            removes them and your drafts. Check group history first if a sync
            result is uncertain.
          </Txt>
          <Check
            label="Delete this account’s private data on this device"
            checked={localDeletion}
            onChange={() => setLocalDeletion(!localDeletion)}
          />
          <Button
            label="Delete local drafts & queue"
            danger
            secondary
            disabled={!localDeletion}
            busy={busy}
            onPress={() =>
              void work(async () => {
                await repository.delete(session!.id);
                await signOut();
              })
            }
          />
        </Details>
      </Card>
      <Button
        label="Sign out"
        secondary
        busy={busy}
        onPress={() => void work(signOut)}
      />
      <Card>
        <Details title="Account deletion">
          <Txt muted>
            Your profile is anonymised and sessions are revoked. Existing group
            financial history is retained for everyone’s audit trail. This also
            removes your private drafts and queue from this device.
          </Txt>
          <Check
            label="I understand the retained financial history and want to delete my account"
            checked={deletion}
            onChange={() => setDeletion(!deletion)}
          />
          <Button
            label="Delete account"
            danger
            secondary
            disabled={!deletion}
            busy={busy}
            onPress={() =>
              void work(async () => {
                await api!.request("/api/v1/me", { method: "DELETE" });
                await repository.delete(session!.id);
                await signOut();
              })
            }
          />
        </Details>
      </Card>
      {notice && <Txt>{notice}</Txt>}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
