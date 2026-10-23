import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useStore } from "../core/store";
import type { ScreenProps } from "../navigation";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Empty,
  ErrorBox,
  Eyebrow,
  Field,
  Heading,
  Page,
  Row,
  Txt,
  c,
} from "../components/ui";
export function Home({ navigation }: ScreenProps<"Home">) {
  const { session, groups, local, api, refresh, offline, message } = useStore();
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false);
  const pending = local.queue.filter((x) => x.state !== "posted").length;
  async function work(join = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api!.request<any>(
        join ? "/api/v1/groups/join" : "/api/v1/groups",
        {
          method: "POST",
          body: join ? { code: code.trim() } : { name: name.trim() },
        },
      );
      await refresh();
      setName("");
      setCode("");
      setNotice(
        join
          ? "Join request sent. The group owner can approve you."
          : "Group created. Invite your people.",
      );
      if (!join) navigation.navigate("Group", { groupId: result.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title={`Hello, ${session?.displayName.split(" ")[0]}.`}
      subtitle="Make room for the good stuff."
    >
      <Row>
        <Eyebrow>Your shared life</Eyebrow>
        <Button
          compact
          label="Profile"
          secondary
          onPress={() => navigation.navigate("Profile")}
        />
      </Row>
      <Card style={{ backgroundColor: c.wine, borderColor: c.wine }}>
        <Heading small>Shared, settled.</Heading>
        <Txt>The little things add up. Keep them fair.</Txt>
        <Row>
          <Button
            label="Private inbox"
            secondary
            compact
            onPress={() => navigation.navigate("Inbox")}
          />
          <Button
            label="Active mode"
            secondary
            compact
            onPress={() => navigation.navigate("Capture")}
          />
        </Row>
      </Card>
      {(offline || message) && (
        <Badge warning>{message || "Offline · showing saved groups"}</Badge>
      )}
      {!!pending && (
        <Button
          label={`${pending} pending ${pending === 1 ? "write" : "writes"} · review queue`}
          secondary
          onPress={() => navigation.navigate("Queue")}
        />
      )}
      <Row>
        <Heading small>Your groups</Heading>
        <Button
          label={create ? "Hide form" : "+ New / join"}
          secondary
          compact
          onPress={() => setCreate(!create)}
        />
      </Row>
      {!groups.length && (
        <Empty
          title="Who’s sharing?"
          detail="Create a group for your flat, your next trip, or the people you split with."
          action={
            <Button
              label="Create your first group"
              onPress={() => setCreate(true)}
            />
          }
        />
      )}
      {groups.map((group) => (
        <Pressable
          key={group.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${group.name}`}
          onPress={() => navigation.navigate("Group", { groupId: group.id })}
        >
          <Card>
            <Row>
              <Row>
                <Avatar name={group.name} />
                <View>
                  <Txt style={{ fontSize: 18 }}>{group.name}</Txt>
                  <Txt muted style={{ fontSize: 12 }}>
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "member" : "members"} ·{" "}
                    {group.archived ? "Archived" : "Active"}
                  </Txt>
                </View>
              </Row>
              <Txt muted>↗</Txt>
            </Row>
          </Card>
        </Pressable>
      ))}
      {create && (
        <Card>
          <Heading small>Bring your people.</Heading>
          <Field
            label="Group name"
            value={name}
            onChange={setName}
            placeholder="A place or a plan"
            autoCapitalize="words"
          />
          <Button
            label="Create group"
            disabled={!name.trim() || offline}
            busy={busy}
            onPress={() => void work()}
          />
          <Divider />
          <Field label="Have a join code?" value={code} onChange={setCode} />
          <Button
            label="Request to join"
            secondary
            disabled={!code.trim() || offline}
            busy={busy}
            onPress={() => void work(true)}
          />
        </Card>
      )}
      {error && <ErrorBox message={error} />}
      {notice && <Txt>{notice}</Txt>}
      <Row>
        <Button
          label="Refresh groups"
          secondary
          compact
          onPress={() => void refresh()}
        />
        <Button
          label="Sync queue"
          secondary
          compact
          onPress={() => navigation.navigate("Queue")}
        />
      </Row>
    </Page>
  );
}
