import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useStore } from "../core/store";
import type { Session } from "../core/types";
import {
  Bloom,
  Row,
  Wordmark,
  Button,
  Card,
  Choice,
  ErrorBox,
  Eyebrow,
  Field,
  Heading,
  Page,
  Txt,
} from "../components/ui";
export function Auth() {
  const { api, configError, signIn, message } = useStore();
  const wide = useWindowDimensions().width >= 850;
  const [mode, setMode] = useState<"login" | "register" | "recovery">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [token, setToken] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(reset = false) {
    if (!api) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "recovery") {
        await api.request(
          `/api/v1/auth/recovery/${reset ? "confirm" : "request"}`,
          {
            method: "POST",
            anonymous: true,
            body: reset ? { token, password } : { email },
          },
        );
        setNotice(
          reset
            ? "Password reset. Sign in with your new password."
            : "If recovery delivery is configured for this account, a reset link will be sent. Contact your administrator if it does not arrive.",
        );
      } else {
        const session = await api.request<Session>(`/api/v1/auth/${mode}`, {
          method: "POST",
          anonymous: true,
          body: {
            email,
            password,
            ...(mode === "register" ? { displayName: name } : {}),
          },
        });
        await signIn(session);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="">
      <Row style={{ paddingVertical: 6 }}>
        <Wordmark />
        <Eyebrow>in good company.</Eyebrow>
      </Row>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 18,
          alignItems: "stretch",
          flexShrink: 0,
        }}
      >
        <Card
          tone="teal"
          style={{
            flex: wide ? 1 : undefined,
            minHeight: wide ? 550 : 260,
            overflow: "hidden",
            justifyContent: "space-between",
            padding: wide ? 34 : 24,
          }}
        >
          <View style={{ gap: 18, zIndex: 1 }}>
            <Eyebrow>Less keeping score. More living.</Eyebrow>
            <Heading>Good times.{"\n"}Fair shares.</Heading>
            <Txt style={{ maxWidth: wide ? 240 : 190 }}>
              For the meals, the miles,{"\n"}and everything you share.
            </Txt>
          </View>
          {wide && (
            <View
              style={{
                alignItems: "flex-start",
                gap: 8,
                paddingTop: wide ? 100 : 14,
              }}
            >
              <Card
                tone="cream"
                style={{ padding: 14, borderRadius: 16, gap: 2, zIndex: 1 }}
              >
                <Txt mono>Pay normally.</Txt>
                <Txt mono>Split together.</Txt>
              </Card>
            </View>
          )}
          <View
            style={{
              position: "absolute",
              bottom: wide ? 35 : 22,
              right: wide ? 26 : 20,
            }}
          >
            <Bloom size={wide ? 195 : 86} />
          </View>
        </Card>
        <Card
          style={{
            flex: wide ? 1 : undefined,
            gap: 20,
            padding: wide ? 32 : 24,
          }}
        >
          <Heading small>
            {mode === "login"
              ? "Welcome back."
              : mode === "register"
                ? "Come on in."
                : "Let’s get you back in."}
          </Heading>
          <Choice
            label="Account"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setError("");
              setNotice("");
            }}
            options={[
              { value: "login", label: "Sign in" },
              { value: "register", label: "Create account" },
              { value: "recovery", label: "Recover" },
            ]}
          />
          {mode === "register" && (
            <Field
              label="Your name"
              value={name}
              onChange={setName}
              autoCapitalize="words"
            />
          )}
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          {mode !== "recovery" && (
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              secure
              hint="At least 8 characters"
            />
          )}
          {!!(error || configError || message) && (
            <ErrorBox message={error || configError || message} />
          )}
          {notice && <Txt>{notice}</Txt>}
          <Button
            label={
              mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : "Request recovery link"
            }
            busy={busy}
            disabled={
              !api ||
              !email ||
              (mode !== "recovery" && password.length < 8) ||
              (mode === "register" && !name.trim())
            }
            onPress={() => void submit()}
          />
          {mode === "recovery" && (
            <>
              <Field
                label="Recovery token"
                value={token}
                onChange={setToken}
                hint="Use the token delivered by your administrator."
              />
              <Field
                label="New password"
                value={password}
                onChange={setPassword}
                secure
              />
              <Button
                label="Reset password"
                secondary
                busy={busy}
                disabled={!token || password.length < 8 || !api}
                onPress={() => void submit(true)}
              />
            </>
          )}
        </Card>
      </View>
      <Txt muted style={{ fontSize: 12, maxWidth: 680 }}>
        Splix records payments made outside the app. It doesn’t move money.
        Notification access is optional; every shared expense needs your
        confirmation.
      </Txt>
    </Page>
  );
}
