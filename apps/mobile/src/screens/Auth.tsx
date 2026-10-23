import React, { useState } from "react";
import { View } from "react-native";
import { useStore } from "../core/store";
import type { Session } from "../core/types";
import {
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
    <Page
      title="A little less owing."
      subtitle="Shared expenses, clearly settled."
    >
      <View style={{ paddingTop: 30, gap: 12 }}>
        <Eyebrow>S P L I X / shared, settled</Eyebrow>
        <Heading>Pay normally.{"\n"}Split together.</Heading>
        <Txt muted>
          Keep the trip, the flat, and the everyday fair. Add expenses yourself,
          or review private payment suggestions on Android.
        </Txt>
      </View>
      <Card>
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
      <Txt muted style={{ fontSize: 12 }}>
        Splix records payments made outside the app. It doesn’t move money.
        Notification access is optional; every shared expense needs your
        confirmation.
      </Txt>
    </Page>
  );
}
