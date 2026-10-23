// Native adaptations of Bastion's button/input/select/disclosure patterns and Wenvy tokens.
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export const c = {
  ink: "#0c0a07",
  panel: "#15110b",
  soft: "#1d1812",
  paper: "#f3e7cf",
  dim: "#c9b48b",
  line: "#3b3428",
  wine: "#780000",
  credit: "#b7d6b2",
  debit: "#f4b4a1",
};
export const fonts = {
  display: "InstrumentSerif_400Regular",
  body: "DMSans_400Regular",
  medium: "DMSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
};
export function Txt({
  children,
  muted = false,
  style,
  mono = false,
}: {
  children: ReactNode;
  muted?: boolean;
  mono?: boolean;
  style?: object;
}) {
  return (
    <Text
      style={[
        s.text,
        muted && { color: c.dim },
        mono && { fontFamily: fonts.mono, fontSize: 11 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Heading({
  children,
  small = false,
}: {
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <Text
      accessibilityRole="header"
      style={[s.heading, small && { fontSize: 29 }]}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt mono muted style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>
      {children}
    </Txt>
  );
}
export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Divider() {
  return (
    <View style={{ height: 1, backgroundColor: c.line, marginVertical: 6 }} />
  );
}
export function Badge({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <View style={[s.badge, warning && { borderColor: c.debit }]}>
      <Txt mono style={{ color: warning ? c.debit : c.credit, fontSize: 10 }}>
        {children}
      </Txt>
    </View>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  danger = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed, focused }: any) => [
        s.button,
        secondary && s.secondary,
        compact && { flexGrow: 1 },
        danger && { borderColor: c.debit },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
        focused && {
          outlineStyle: "solid",
          outlineColor: c.paper,
          outlineWidth: 2,
          outlineOffset: 3,
        },
      ]}
    >
      {busy && <ActivityIndicator color={c.paper} />}
      <Text style={[s.buttonLabel, danger && { color: c.debit }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  multiline,
  hint,
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  hint?: string;
  autoCapitalize?: "none" | "words" | "sentences";
}) {
  return (
    <View style={{ gap: 7 }}>
      <Txt style={{ fontSize: 12, fontFamily: fonts.medium }}>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#897d66"
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          s.input,
          multiline && { minHeight: 90, textAlignVertical: "top" },
        ]}
      />
      {hint && (
        <Txt muted style={{ fontSize: 11 }}>
          {hint}
        </Txt>
      )}
    </View>
  );
}
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontSize: 12, fontFamily: fonts.medium }}>{label}</Txt>
      <Row style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 8 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}
            accessibilityLabel={`${label}: ${option.label}`}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              s.chip,
              value === option.value && s.selected,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Txt style={{ fontSize: 12 }}>{option.label}</Txt>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onChange}
      style={s.check}
    >
      <Text
        style={[
          s.checkbox,
          checked && { backgroundColor: c.paper, color: c.ink },
        ]}
      >
        {checked ? "✓" : ""}
      </Text>
      <Txt style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <View accessibilityElementsHidden style={s.avatar}>
      <Txt style={{ fontFamily: fonts.display, fontSize: 22 }}>
        {name.slice(0, 1).toUpperCase()}
      </Txt>
    </View>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={s.error}
    >
      <Txt style={{ color: c.debit }}>{message}</Txt>
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <Card style={{ paddingVertical: 30, gap: 12 }}>
      <Heading small>{title}</Heading>
      <Txt muted>{detail}</Txt>
      {action}
    </Card>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 30, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={c.paper} />
      <Txt muted>Loading your group…</Txt>
    </View>
  );
}
export function Page({
  children,
  footer,
  title,
  subtitle,
}: {
  children: ReactNode;
  footer?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.ink }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <View style={{ gap: 8, paddingVertical: 6 }}>
          <Heading>{title}</Heading>
          {subtitle && <Txt muted>{subtitle}</Txt>}
        </View>
        {children}
        <View style={{ height: 12 }} />
      </ScrollView>
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  text: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: c.paper,
  },
  heading: {
    fontFamily: fonts.display,
    color: c.paper,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 22,
    gap: 20,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 14,
    backgroundColor: c.panel,
  },
  button: {
    minHeight: 48,
    borderRadius: 9,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.wine,
    borderColor: c.wine,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
  },
  secondary: { backgroundColor: c.soft, borderColor: c.line },
  buttonLabel: { fontFamily: fonts.medium, color: c.paper, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 48,
    color: c.paper,
    fontFamily: fonts.body,
    fontSize: 15,
    backgroundColor: c.ink,
  },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.line,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 22,
    justifyContent: "center",
  },
  selected: { backgroundColor: c.wine, borderColor: c.paper },
  check: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    height: 23,
    width: 23,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.dim,
    color: c.paper,
    textAlign: "center",
    lineHeight: 21,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.soft,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: c.line,
    alignSelf: "flex-start",
  },
  error: {
    borderWidth: 1,
    borderColor: c.debit,
    backgroundColor: "#2d1811",
    borderRadius: 8,
    padding: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderColor: c.line,
    padding: 14,
    backgroundColor: c.panel,
    gap: 8,
  },
});
