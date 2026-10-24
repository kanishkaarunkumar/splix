import React, { useCallback, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { HomeDock } from "../components/HomeDock";
import { PeopleOverview } from "../components/PeopleOverview";
import { overview, suggestedTransfers } from "../core/overview";
import { money } from "../core/money";
import type { Group } from "../core/types";
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
  type Tone,
} from "../components/ui";
export function Home({ route, navigation }: ScreenProps<"Home">) {
  const { session, groups, local, api, refresh, offline, message } = useStore();
  const wide = useWindowDimensions().width >= 800;
  const tab = route.params?.tab === "overview" ? "overview" : "groups";
  const summary = overview(groups, local.snapshots, session!.id);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  function groupCaption(group: Group): string {
    const snapshot = local.snapshots[group.id];
    const own = snapshot?.balances.find(
      (balance) => balance.userId === session?.id,
    );
    if (!own) return "Balance not loaded yet";
    const amount = BigInt(own.balancePaise);
    if (amount === 0n) return "You’re all square";
    if (amount > 0n) return `You get back ${money(own.balancePaise)}`;
    try {
      const recipients = suggestedTransfers(snapshot.balances).filter(
        (payment) => payment.fromUserId === session?.id,
      );
      const name = group.members.find(
        (member) => member.id === recipients[0]?.toUserId,
      )?.displayName;
      return `You owe ${money(String(-amount))}${name ? ` to ${name}${recipients.length > 1 ? ` +${recipients.length - 1}` : ""}` : ""}`;
    } catch {
      return "Refresh to load your balance";
    }
  }
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
      title={
        tab === "overview"
          ? "Your overview."
          : `Hello, ${session?.displayName.split(" ")[0]}.`
      }
      subtitle={
        tab === "overview"
          ? "Every group. Every person."
          : "Your shared life, at a glance."
      }
      footer={<HomeDock active={tab} />}
    >
      <Row>
        <Eyebrow>
          {summary.loadedGroups === summary.totalGroups
            ? "Across all your groups"
            : `${summary.loadedGroups} of ${summary.totalGroups} groups loaded`}
        </Eyebrow>
        <Button
          label="Active mode"
          secondary
          onPress={() => navigation.navigate("Capture")}
        />
      </Row>
      <Row style={{ alignItems: "stretch", gap: 14 }}>
        <Card tone="pink" style={{ flex: 1, padding: 18, gap: 9 }}>
          <Txt mono>You owe</Txt>
          <Heading small>{money(summary.owePaise)}</Heading>
        </Card>
        <Card tone="teal" style={{ flex: 1, padding: 18, gap: 9 }}>
          <Txt mono>You get back</Txt>
          <Heading small>{money(summary.receivePaise)}</Heading>
        </Card>
      </Row>
      {summary.oldestUpdate && (
        <Txt muted mono>
          {offline ? "Saved" : "Confirmed"} balances ·{" "}
          {new Date(summary.oldestUpdate).toLocaleTimeString()}
        </Txt>
      )}
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
      {tab === "overview" ? (
        <PeopleOverview
          summary={summary}
          onOpenGroup={(groupId) => navigation.navigate("Group", { groupId })}
        />
      ) : (
        <>
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
                        {group.members.length === 1 ? "member" : "members"} ·
                        Shared expenses
                      </Txt>
                      <Txt style={{ fontSize: 14 }}>{groupCaption(group)}</Txt>
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
              <Field
                label="Have a join code?"
                value={code}
                onChange={setCode}
                autoCapitalize="characters"
                placeholder="AB7K"
                hint="New codes have 4 characters. Previously shared codes still work until they expire."
              />
              <Button
                label="Request to join"
                secondary
                disabled={!code.trim() || offline}
                busy={busy}
                onPress={() => void work(true)}
              />
            </Card>
          )}
        </>
      )}
      {error && <ErrorBox message={error} />}
      {notice && <Txt>{notice}</Txt>}
      <Row>
        <Button
          label={tab === "overview" ? "Refresh overview" : "Refresh groups"}
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
