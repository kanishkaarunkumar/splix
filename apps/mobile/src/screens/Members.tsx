import React, { useCallback, useState } from "react";
import { Share } from "react-native";
import { useFocusEffect } from "expo-router";
import { useStore } from "../core/store";
import type { User } from "../core/types";
import type { ScreenProps } from "../navigation";
import {
  Avatar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
type JoinRequest = { id: string; user: User; status: string };
export function MembersScreen({ route }: ScreenProps<"Members">) {
  const { groupId } = route.params;
  const { groups, local, session, api, refreshGroup } = useStore();
  const group =
    groups.find((g) => g.id === groupId) || local.snapshots[groupId]?.group;
  const owner = group?.ownerId === session?.id;
  const [requests, setRequests] = useState<JoinRequest[]>([]),
    [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (owner)
      setRequests(
        await api!.request(`/api/v1/groups/${groupId}/join-requests`),
      );
  }, [api, groupId, owner]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
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
  return (
    <Page title="People & invites" subtitle={group?.name}>
      <Card>
        {group?.members.map((member) => (
          <Row key={member.id}>
            <Row style={{ flex: 1 }}>
              <Avatar name={member.displayName} />
              <Txt style={{ flex: 1 }}>{member.displayName}</Txt>
            </Row>
            <Txt muted mono>
              {member.id === group.ownerId ? "Owner" : "Member"}
            </Txt>
          </Row>
        ))}
      </Card>
      {owner && !group?.archived && (
        <>
          <Card>
            <Heading small>Invite someone</Heading>
            <Txt muted>
              Share a code. It lasts 24 hours, and you approve each request.
            </Txt>
            <Button
              label="Create join code"
              busy={busy}
              onPress={() =>
                void work(async () =>
                  setInvite(
                    await api!.request(`/api/v1/groups/${groupId}/join-codes`, {
                      method: "POST",
                    }),
                  ),
                )
              }
            />
            {invite && (
              <>
                <Txt
                  mono
                  style={{ fontSize: 32, lineHeight: 42, letterSpacing: 6 }}
                >
                  {invite.code}
                </Txt>
                <Txt muted>
                  Expires {new Date(invite.expiresAt * 1000).toLocaleString()}
                </Txt>
                <Button
                  label="Share join code"
                  secondary
                  onPress={() =>
                    void Share.share({
                      message: `Join ${group?.name} on Splix with code ${invite.code}. The group owner will approve your request.`,
                    }).catch((e) => setError(e.message))
                  }
                />
                <Button
                  label="Revoke this code"
                  secondary
                  busy={busy}
                  onPress={() =>
                    void work(async () => {
                      await api!.request(
                        `/api/v1/groups/join-codes/${invite.code}/revoke`,
                        { method: "POST" },
                      );
                      setInvite(null);
                    })
                  }
                />
              </>
            )}
          </Card>
          <Heading small>Waiting to join</Heading>
          {!requests.length && (
            <Empty
              title="Everyone’s accounted for."
              detail="New join requests will appear here."
            />
          )}
          {requests.map((request) => (
            <Card key={request.id}>
              <Txt>{request.user.displayName}</Txt>
              <Txt muted>{request.user.email}</Txt>
              <Row>
                <Button
                  label="Approve"
                  accessibilityLabel={`Approve ${request.user.displayName}`}
                  compact
                  busy={busy}
                  onPress={() =>
                    void work(async () => {
                      await api!.request(
                        `/api/v1/groups/${groupId}/join-requests/${request.id}`,
                        { method: "POST", body: { approve: true } },
                      );
                      await refreshGroup(groupId);
                      await load();
                    })
                  }
                />
                <Button
                  label="Decline"
                  accessibilityLabel={`Decline ${request.user.displayName}`}
                  compact
                  secondary
                  busy={busy}
                  onPress={() =>
                    void work(async () => {
                      await api!.request(
                        `/api/v1/groups/${groupId}/join-requests/${request.id}`,
                        { method: "POST", body: { approve: false } },
                      );
                      await load();
                    })
                  }
                />
              </Row>
            </Card>
          ))}
        </>
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
