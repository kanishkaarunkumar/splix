import { Pressable, View } from "react-native";
import type { Overview, PersonBalance } from "../core/overview";
import { money } from "../core/money";
import { Avatar, Card, Divider, Empty, Heading, Row, Txt } from "./ui";
export function PeopleOverview({
  summary,
  onOpenGroup,
}: {
  summary: Overview;
  onOpenGroup: (id: string) => void;
}) {
  const sections: {
    direction: "owe" | "receive";
    title: string;
    description: string;
  }[] = [
    {
      direction: "owe",
      title: "Who to pay",
      description: "Suggested payments across your groups.",
    },
    {
      direction: "receive",
      title: "Coming back to you",
      description: "Suggested payments from your groupmates.",
    },
  ];
  if (!summary.people.length)
    return (
      <Empty
        title={
          summary.loadedGroups === summary.totalGroups
            ? "All square."
            : "Waiting on your balances."
        }
        detail={
          summary.loadedGroups === summary.totalGroups
            ? "You have no outstanding group balances. Add an expense in Groups to get started."
            : "Refresh to load the rest of your groups. Saved balances are shown until then."
        }
      />
    );
  return (
    <>
      {sections.map((section) => {
        const people = summary.people.filter(
          (person) =>
            BigInt(
              section.direction === "owe"
                ? person.owePaise
                : person.receivePaise,
            ) > 0n,
        );
        if (!people.length) return null;
        return (
          <View key={section.direction} style={{ gap: 14 }}>
            <Heading small>{section.title}</Heading>
            <Txt muted>{section.description}</Txt>
            {people.map((person: PersonBalance) => (
              <View
                key={person.userId}
                testID={`person-${section.direction}-${person.userId}`}
              >
                <Card>
                  <Row>
                    <Row style={{ flex: 1 }}>
                      <Avatar name={person.name} />
                      <View style={{ flex: 1 }}>
                        <Txt style={{ fontSize: 17 }}>{person.name}</Txt>
                        <Txt muted style={{ fontSize: 12 }}>
                          {
                            person.groups.filter(
                              (group) => group.direction === section.direction,
                            ).length
                          }{" "}
                          shared{" "}
                          {person.groups.filter(
                            (group) => group.direction === section.direction,
                          ).length === 1
                            ? "group"
                            : "groups"}
                        </Txt>
                      </View>
                    </Row>
                    <Txt mono style={{ fontSize: 20 }}>
                      {money(
                        section.direction === "owe"
                          ? person.owePaise
                          : person.receivePaise,
                      )}
                    </Txt>
                  </Row>
                  <Divider />
                  {person.groups
                    .filter((group) => group.direction === section.direction)
                    .map((group) => (
                      <Pressable
                        key={group.groupId}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${group.groupName} from overview`}
                        onPress={() => onOpenGroup(group.groupId)}
                        style={({ pressed }) => ({
                          minHeight: 44,
                          justifyContent: "center",
                          opacity: pressed ? 0.65 : 1,
                        })}
                      >
                        <Row>
                          <Txt style={{ flex: 1 }}>{group.groupName}</Txt>
                          <Txt mono>{money(group.amountPaise)} ↗</Txt>
                        </Row>
                      </Pressable>
                    ))}
                </Card>
              </View>
            ))}
          </View>
        );
      })}
      <Txt muted style={{ fontSize: 12 }}>
        These suggestions preserve each group’s balances. A payment in one group
        does not automatically settle another.
      </Txt>
    </>
  );
}
