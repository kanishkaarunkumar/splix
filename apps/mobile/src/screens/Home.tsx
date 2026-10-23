import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useStore } from "../core/store";
import type { ScreenProps } from "../navigation";
import {
  Bloom,
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
  type Tone,
} from "../components/ui";
export function Home({ navigation }: ScreenProps<"Home">) {
  const { session, groups, local, api, refresh, offline, message } = useStore();
  const wide = useWindowDimensions().width >= 800;
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
        <Eyebrow>Your shared life, a little lighter.</Eyebrow>
        <Button
          label="Profile"
          secondary
          onPress={() => navigation.navigate("Profile")}
        />
      </Row>
      <Row style={{ alignItems: "stretch", gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Private inbox"
          onPress={() => navigation.navigate("Inbox")}
          style={{ flex: 1 }}
        >
          <Card
            tone="teal"
            style={{
              minHeight: 164,
              flex: 1,
              justifyContent: "space-between",
              padding: 20,
            }}
          >
            <Row>
              <Bloom size={36} />
              <Txt style={{ fontSize: 24 }}>↗</Txt>
            </Row>
            <View style={{ gap: 5 }}>
              <Heading small>Private inbox</Heading>
              <Txt style={{ fontSize: 12 }}>Review before you share.</Txt>
            </View>
          </Card>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Active mode"
          onPress={() => navigation.navigate("Capture")}
          style={{ flex: 1 }}
        >
          <Card
            tone="pink"
            style={{
              minHeight: 164,
              flex: 1,
              justifyContent: "space-between",
              padding: 20,
            }}
          >
            <Row>
              <Txt mono style={{ fontSize: 25 }}>
                ＋
              </Txt>
              <Txt style={{ fontSize: 24 }}>↗</Txt>
            </Row>
            <View style={{ gap: 5 }}>
              <Heading small>Active mode</Heading>
              <Txt style={{ fontSize: 12 }}>Pay now. Decide later.</Txt>
            </View>
          </Card>
        </Pressable>
      </Row>
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
      {!!groups.length && (
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          {groups.map((group, index) => (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${group.name}`}
              onPress={() =>
                navigation.navigate("Group", { groupId: group.id })
              }
              style={wide ? { width: "48.8%" } : { width: "100%" }}
            >
              <Card
                tone={(["cream", "yellow", "pink"] as Tone[])[index % 3]}
                style={{ minHeight: 148, justifyContent: "space-between" }}
              >
                <Row>
                  <Avatar name={group.name} />
                  <Txt mono>{group.archived ? "Archived" : "Active"} ↗</Txt>
                </Row>
                <View style={{ gap: 7 }}>
                  <Heading small>{group.name}</Heading>
                  <Txt muted style={{ fontSize: 12 }}>
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "member" : "members"} · Shared
                    expenses
                  </Txt>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
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
