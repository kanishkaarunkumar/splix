import React, { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { DMSans_900Black } from "@expo-google-fonts/dm-sans/900Black";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "../core/store";
import { c, ErrorBox, Loading, fonts } from "../components/ui";
function Product() {
  const { session, ready } = useStore();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => listener.remove();
  }, []);
  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.ink },
        headerTintColor: c.paper,
        headerTitleStyle: { fontFamily: fonts.mono, fontSize: 13 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.ink },
        animation: reduced ? "none" : "slide_from_right",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="Home" options={{ title: "splix." }} />
        <Stack.Screen name="Group" options={{ title: "GROUP" }} />
        <Stack.Screen name="Expense" options={{ title: "SHARED EXPENSE" }} />
        <Stack.Screen
          name="Settlement"
          options={{ title: "RECORD A PAYMENT" }}
        />
        <Stack.Screen name="Capture" options={{ title: "ACTIVE GROUP MODE" }} />
        <Stack.Screen name="Inbox" options={{ title: "PRIVATE INBOX" }} />
        <Stack.Screen name="Queue" options={{ title: "THIS DEVICE’S QUEUE" }} />
        <Stack.Screen name="Members" options={{ title: "PEOPLE & INVITES" }} />
        <Stack.Screen name="Report" options={{ title: "MONTHLY REPORT" }} />
        <Stack.Screen name="Closeout" options={{ title: "CLOSE OUT" }} />
        <Stack.Screen name="Profile" options={{ title: "YOUR ACCOUNT" }} />
        <Stack.Screen
          name="review/[draftId]"
          options={{ title: "PRIVATE REVIEW" }}
        />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    DMSans_900Black,
    DMSans_400Regular,
    DMSans_600SemiBold,
    IBMPlexMono_400Regular,
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: c.ink }}>
        {error ? (
          <ErrorBox
            message={`Could not load bundled fonts: ${error.message}`}
          />
        ) : !loaded ? (
          <Loading />
        ) : (
          <StoreProvider>
            <Product />
          </StoreProvider>
        )}
      </View>
    </SafeAreaProvider>
  );
}
