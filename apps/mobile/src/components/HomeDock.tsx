import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { c, fonts } from "./ui";
export type HomeTab = "groups" | "overview" | "inbox" | "you";
const tabs: { value: HomeTab; label: string; symbol: string }[] = [
  { value: "groups", label: "Groups", symbol: "▦" },
  { value: "overview", label: "Overview", symbol: "↗" },
  { value: "inbox", label: "Inbox", symbol: "▤" },
  { value: "you", label: "You", symbol: "☺" },
];
export function HomeDock({ active }: { active: HomeTab }) {
  const router = useRouter();
  function navigate(tab: HomeTab) {
    if (tab === active) return;
    if (tab === "inbox") router.navigate("/Inbox");
    else if (tab === "you") router.navigate("/Profile");
    else router.navigate({ pathname: "/Home", params: { tab } });
  }
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
      style={styles.dock}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.value}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: active === tab.value }}
          onPress={() => navigate(tab.value)}
          style={({ pressed, focused }: any) => [
            styles.tab,
            active === tab.value && { backgroundColor: c.teal },
            pressed && { opacity: 0.7 },
            focused && {
              outlineStyle: "solid",
              outlineWidth: 2,
              outlineColor: c.ink,
            },
          ]}
        >
          <Text accessible={false} style={styles.symbol}>
            {tab.symbol}
          </Text>
          <Text style={styles.label}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  dock: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: c.paper,
    borderRadius: 23,
    padding: 7,
    flexDirection: "row",
    gap: 5,
    boxShadow: "0px 5px 20px rgba(48,36,39,0.12)",
  },
  tab: {
    flex: 1,
    minHeight: 59,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  symbol: {
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 21,
    lineHeight: 24,
  },
  label: {
    color: c.ink,
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
  },
});
