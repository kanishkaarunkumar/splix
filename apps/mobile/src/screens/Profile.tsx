import React, { useState } from "react";
import { HomeDock } from "../components/HomeDock";
import { useStore } from "../core/store";
import { repository } from "../core/repository";
import {
  Button,
  Card,
  Check,
  ErrorBox,
  Field,
  Heading,
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
      title="Your corner."
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
        <Heading small>Your data stays yours.</Heading>
        <Txt muted>
          Payment suggestions and saved drafts stay on this device. Sessions are
          stored in Android secure storage. Group expenses and recorded payments
          remain part of the shared financial history.
        </Txt>
        <Txt muted>
          Capture access is optional. Revoking access or signing out stops
          capture. You can remove this device’s private data below.
        </Txt>
        <Txt muted>
          {pending} uncommitted writes on this device. Deleting local data
          permanently removes these requests and drafts; check group history
          first if a response was lost.
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
      </Card>
      <Button
        label="Sign out"
        secondary
        busy={busy}
        onPress={() => void work(signOut)}
      />
      <Txt muted>
        Signing out keeps this account’s local queue isolated so you can resume
        it after signing in again.
      </Txt>
      <Card>
        <Heading small>Delete your account</Heading>
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
      </Card>
      {notice && <Txt>{notice}</Txt>}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
