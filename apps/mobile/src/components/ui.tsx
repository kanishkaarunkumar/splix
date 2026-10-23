// Native controls with Splix's rounded-square, colour-block visual system.
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
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
  ink: "#302427",
  background: "#FA7559",
  panel: "#F7F5D8",
  soft: "#EEECD3",
  paper: "#F7F5D8",
  dim: "#D1C1BB",
  line: "#675451",
  teal: "#50B49F",
  coral: "#FA7559",
  pink: "#E8A1D6",
  yellow: "#E6D344",
  credit: "#21634E",
  debit: "#A03425",
  muted: "#665F50",
};
export const fonts = {
  display: "IBMPlexMono_400Regular",
  brand: "DMSans_900Black",
  body: "DMSans_400Regular",
  medium: "DMSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
};
export type Tone = "cream" | "teal" | "coral" | "pink" | "yellow" | "dark";
const toneColor: Record<Tone, string> = {
  cream: c.paper,
  teal: c.teal,
  coral: c.coral,
  pink: c.pink,
  yellow: c.yellow,
  dark: c.ink,
};
export const CardMotionContext = createContext(true);
const Surface = createContext({ text: c.ink, muted: "#442D29", dark: false });
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
  const surface = useContext(Surface);
  return (
    <Text
      style={[
        s.text,
        { color: muted ? surface.muted : surface.text },
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
  const surface = useContext(Surface);
  return (
    <Text
      accessibilityRole="header"
      style={[
        s.heading,
        { color: surface.text },
        small && { fontSize: 23, lineHeight: 29, letterSpacing: -1 },
      ]}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt mono muted style={{ letterSpacing: 0.7 }}>
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
  tone = "cream",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: Tone;
}) {
  const reduced = useContext(CardMotionContext);
  const [hover] = useState(() => new Animated.Value(0));
  const [hovered, setHovered] = useState(false);
  useEffect(() => () => hover.stopAnimation(), [hover]);
  function highlight(active: boolean) {
    setHovered(active);
    hover.stopAnimation();
    Animated.timing(hover, {
      toValue: active && !reduced ? 1 : 0,
      duration: reduced ? 0 : 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }
  return (
    <Surface.Provider
      value={{
        text: tone === "dark" ? c.paper : c.ink,
        muted: tone === "dark" ? c.dim : tone === "cream" ? c.muted : "#38332D",
        dark: tone === "dark",
      }}
    >
      <Animated.View
        testID="surface-card"
        onPointerEnter={(event) => {
          if (event.nativeEvent.pointerType !== "touch") highlight(true);
        }}
        onPointerLeave={() => highlight(false)}
        onPointerCancel={() => highlight(false)}
        style={[
          s.card,
          { backgroundColor: toneColor[tone] },
          style,
          {
            transform: [
              {
                translateY: reduced
                  ? 0
                  : hover.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -3],
                    }),
              },
            ],
            boxShadow: hovered
              ? "0px 9px 22px rgba(48, 36, 39, 0.16)"
              : "0px 0px 0px rgba(48, 36, 39, 0)",
          },
        ]}
      >
        {children}
      </Animated.View>
    </Surface.Provider>
  );
}
export function Wordmark({ large = false }: { large?: boolean }) {
  const surface = useContext(Surface);
  return (
    <Text
      accessibilityLabel="Splix"
      style={{
        fontFamily: fonts.brand,
        color: surface.text,
        fontSize: large ? 76 : 34,
        lineHeight: large ? 82 : 40,
        letterSpacing: large ? -6 : -2.5,
      }}
    >
      splix<Text style={{ color: surface.dark ? c.coral : c.ink }}>.</Text>
    </Text>
  );
}
export function Bloom({ size = 88 }: { size?: number }) {
  const half = size / 2;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, transform: [{ rotate: "-8deg" }] }}
    >
      {[
        {
          backgroundColor: c.pink,
          top: 0,
          left: 0,
          borderBottomRightRadius: 4,
        },
        {
          backgroundColor: c.coral,
          top: 0,
          left: half,
          borderBottomLeftRadius: 4,
        },
        {
          backgroundColor: "#268D77",
          top: half,
          left: 0,
          borderTopRightRadius: 4,
        },
        {
          backgroundColor: c.yellow,
          top: half,
          left: half,
          borderTopLeftRadius: 4,
        },
      ].map((petal, index) => (
        <View
          key={index}
          style={[
            {
              position: "absolute",
              width: half,
              height: half,
              borderRadius: half * 0.74,
            },
            petal,
          ]}
        />
      ))}
      <View
        style={{
          position: "absolute",
          width: size * 0.19,
          height: size * 0.19,
          left: size * 0.405,
          top: size * 0.405,
          borderRadius: size * 0.055,
          backgroundColor: c.paper,
          transform: [{ rotate: "8deg" }],
        }}
      />
    </View>
  );
}
export function Divider() {
  const surface = useContext(Surface);
  return (
    <View
      style={{
        height: 1,
        backgroundColor: surface.dark ? c.line : "#DCD9BD",
        marginVertical: 6,
      }}
    />
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
    <View
      style={[s.badge, { backgroundColor: warning ? "#F5D5A8" : "#DCEAD2" }]}
    >
      <Txt mono style={{ color: warning ? "#753B20" : c.credit, fontSize: 10 }}>
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
        compact && { flex: 1 },
        danger && { backgroundColor: "#F2D5D1", borderColor: "#E6B6AF" },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] },
        focused && {
          outlineStyle: "solid",
          outlineColor: c.teal,
          outlineWidth: 3,
          outlineOffset: 3,
        },
      ]}
    >
      {busy && <ActivityIndicator color={c.ink} />}
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
    <View style={{ gap: 8 }}>
      <Txt style={{ fontSize: 12, fontFamily: fonts.mono }}>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#847D6C"
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          s.input,
          multiline && { minHeight: 96, textAlignVertical: "top" },
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
    <View style={{ gap: 9 }}>
      <Txt style={{ fontSize: 12, fontFamily: fonts.mono }}>{label}</Txt>
      <Row style={{ flexWrap: "wrap", justifyContent: "flex-start", gap: 7 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}
            accessibilityLabel={`${label}: ${option.label}`}
            onPress={() => onChange(option.value)}
            style={({ pressed, focused }: any) => [
              s.chip,
              value === option.value && s.selected,
              pressed && { opacity: 0.7 },
              focused && {
                outlineStyle: "solid",
                outlineWidth: 2,
                outlineColor: c.teal,
                outlineOffset: 2,
              },
            ]}
          >
            <Txt
              style={{
                fontSize: 12,
                color: c.ink,
                fontFamily: value === option.value ? fonts.medium : fonts.body,
              }}
            >
              {option.label}
            </Txt>
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
          checked && { backgroundColor: c.teal, borderColor: c.teal },
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
      <Text style={{ color: c.ink, fontFamily: fonts.brand, fontSize: 21 }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
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
    <Card style={{ paddingVertical: 26, gap: 15 }}>
      <Row>
        <Heading small>{title}</Heading>
        <Bloom size={46} />
      </Row>
      <Txt muted>{detail}</Txt>
      {action}
    </Card>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 30, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={c.teal} />
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
      testID="app-page"
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        {!!title && (
          <View style={{ gap: 9, paddingVertical: 7 }}>
            <Heading>{title}</Heading>
            {subtitle && <Txt muted>{subtitle}</Txt>}
          </View>
        )}
        {children}
        <View style={{ height: 12 }} />
      </ScrollView>
      {footer && (
        <View style={s.footer}>
          <View style={{ width: "100%", maxWidth: 1036, alignSelf: "center" }}>
            {footer}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  heading: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1.3,
  },
  page: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    padding: 20,
    gap: 18,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: { padding: 22, gap: 16, borderRadius: 26 },
  button: {
    minHeight: 50,
    borderRadius: 15,
    paddingHorizontal: 17,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.teal,
    borderColor: c.teal,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
  },
  secondary: { backgroundColor: c.soft, borderColor: "#DCD8BF" },
  buttonLabel: {
    fontFamily: fonts.medium,
    color: c.ink,
    fontSize: 13,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D8D5BC",
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 14,
    minHeight: 52,
    color: c.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    backgroundColor: "#FFFEEB",
  },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D9D5BC",
    backgroundColor: c.soft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: "center",
  },
  selected: { backgroundColor: c.teal, borderColor: c.teal },
  check: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    height: 25,
    width: 25,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A8A18E",
    color: c.ink,
    backgroundColor: c.paper,
    textAlign: "center",
    lineHeight: 23,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.pink,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  error: { backgroundColor: "#F8D9CE", borderRadius: 16, padding: 16 },
  footer: { padding: 14, backgroundColor: c.background, gap: 8 },
});
