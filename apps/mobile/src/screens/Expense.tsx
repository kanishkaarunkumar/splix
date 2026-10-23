import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useStore } from "../core/store";
import { allocate, localDate, money, rupees, toPaise } from "../core/money";
import { nativeCapture } from "../core/capture";
import type { Expense, Preset, SplitMethod } from "../core/types";
import type { ScreenProps } from "../navigation";
import {
  Badge,
  Button,
  Card,
  Check,
  Choice,
  ErrorBox,
  Field,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function ExpenseScreen({ route, navigation }: ScreenProps<"Expense">) {
  const { groupId, correction, draftId, initial } = route.params;
  const { session, groups, local, confirm, updateLocal, api } = useStore();
  const group =
    groups.find((g) => g.id === groupId) || local.snapshots[groupId]?.group;
  const capture =
    draftId && session
      ? nativeCapture?.drafts(session.id).find((d) => d.id === draftId)
      : undefined;
  const formKey = `${groupId}:${correction?.id || draftId || "manual"}`;
  const saved = initial || local.forms[formKey];
  const original:
    | (Expense & { rawAmount?: string; rawValues?: Record<string, string> })
    | undefined =
    saved ||
    (correction
      ? {
          title: correction.title || "",
          amountPaise: correction.amountPaise,
          payerId: correction.payerId!,
          effectiveDate: correction.effective_date,
          category: correction.category || "Other",
          note: correction.note,
          splitMethod: "exact",
          participantIds: correction.shares.map((x) => x.userId),
          shares: correction.shares,
        }
      : undefined);
  const [title, setTitle] = useState(
      original?.title || capture?.payeeLabel || "",
    ),
    [amount, setAmount] = useState(
      original
        ? (original.rawAmount ?? rupees(original.amountPaise))
        : capture
          ? rupees(capture.amountPaise)
          : "",
    ),
    [payer, setPayer] = useState(original?.payerId || session?.id || ""),
    [date, setDate] = useState(original?.effectiveDate || localDate()),
    [category, setCategory] = useState(original?.category || "Food"),
    [note, setNote] = useState(original?.note || ""),
    [method, setMethod] = useState<SplitMethod>(
      original?.splitMethod || "equal",
    ),
    [ids, setIds] = useState(
      original?.participantIds || group?.members.map((x) => x.id) || [],
    );
  const [values, setValues] = useState<Record<string, string>>(
    () =>
      original?.rawValues ||
      Object.fromEntries(
        (original?.splitMethod === "exact"
          ? original.shares?.map((x) => [x.userId, rupees(x.amountPaise)])
          : original?.splitMethod === "percentage"
            ? original.percentages?.map((x) => [
                x.userId,
                String(x.basisPoints / 100),
              ])
            : original?.weights?.map((x) => [x.userId, String(x.weight)])) ||
          [],
      ),
  );
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [presets, setPresets] = useState<Preset[]>([]),
    [presetName, setPresetName] = useState("");
  const submitted = useRef(false);
  useEffect(() => {
    void api
      ?.request<Preset[]>(`/api/v1/groups/${groupId}/presets`)
      .then(setPresets)
      .catch(() => {});
  }, [api, groupId]);
  function body(): Expense {
    const amountPaise = toPaise(amount);
    const result: Expense = {
      title: title.trim(),
      amountPaise,
      payerId: payer,
      effectiveDate: date,
      category,
      note: note.trim(),
      splitMethod: method,
      participantIds: ids,
    };
    if (!result.title || result.title.length > 120 || note.length > 1000)
      throw new Error(
        "Enter a title up to 120 characters and a note up to 1,000 characters.",
      );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error("Enter a valid date as YYYY-MM-DD.");
    if (
      !group?.members.some((m) => m.id === payer) ||
      ids.some((id) => !group.members.some((m) => m.id === id))
    )
      throw new Error("Choose current group members.");
    if (method === "percentage")
      result.percentages = ids.map((userId) => ({
        userId,
        basisPoints: Number(toPaise(values[userId] || "0", true)),
      }));
    if (method === "weighted")
      result.weights = ids.map((userId) => {
        if (!/^\d+$/.test(values[userId] || ""))
          throw new Error(
            "Enter a positive whole-number weight for each participant.",
          );
        return { userId, weight: Number(values[userId]) };
      });
    if (method === "exact")
      result.shares = ids.map((userId) => ({
        userId,
        amountPaise: toPaise(values[userId] || "0", true),
      }));
    allocate(result);
    return result;
  }
  let preview: ReturnType<typeof allocate> = [];
  try {
    preview = allocate(body());
  } catch {}
  async function save() {
    setError("");
    try {
      const value: Expense & {
        rawAmount: string;
        rawValues: Record<string, string>;
      } = {
        title,
        amountPaise: "0",
        rawAmount: amount,
        rawValues: values,
        payerId: payer,
        effectiveDate: date,
        category,
        note,
        splitMethod: method,
        participantIds: ids,
      };
      await updateLocal((state) => {
        state.forms[formKey] = value;
      });
      setError("Draft saved on this device. It has not been posted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      if (draftId && (!capture || capture.state !== "needs_review"))
        throw new Error(
          "This suggestion is unavailable or already confirmed. Open the inbox again.",
        );
      if (correction && !reason.trim())
        throw new Error("Explain why you are correcting this expense.");
      await confirm({
        groupId,
        path: `/api/v1/groups/${groupId}/expenses${correction ? `/${correction.id}/corrections` : ""}`,
        body: correction
          ? { replacement: body(), reason: reason.trim() }
          : body(),
        ...(draftId ? { draftId } : {}),
      });
      await updateLocal((state) => {
        delete state.forms[formKey];
      });
      navigation.popTo("Group", { groupId });
    } catch (e) {
      submitted.current = false;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function apply(preset: Preset) {
    setMethod(preset.splitMethod);
    setIds(
      preset.participantIds.filter((id) =>
        group?.members.some((m) => m.id === id),
      ),
    );
    setValues(
      Object.fromEntries(
        preset.splitMethod === "weighted"
          ? (preset.weights || []).map((x) => [x.userId, String(x.weight)])
          : preset.splitMethod === "percentage"
            ? (preset.percentages || []).map((x) => [
                x.userId,
                String(x.basisPoints / 100),
              ])
            : (preset.shares || []).map((x) => [
                x.userId,
                rupees(x.amountPaise),
              ]),
      ),
    );
    setReviewing(false);
  }
  async function savePreset() {
    setError("");
    try {
      const value = body();
      const preset = await api!.request<Preset>(
        `/api/v1/groups/${groupId}/presets`,
        {
          method: "POST",
          body: {
            name: presetName,
            splitMethod: value.splitMethod,
            participantIds: value.participantIds,
            weights: value.weights || [],
            percentages: value.percentages || [],
            shares: value.shares || [],
          },
        },
      );
      setPresets([...presets, preset]);
      setPresetName("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!group)
    return (
      <Page title="Expense">
        <ErrorBox message="Open a current group before adding an expense." />
      </Page>
    );
  return (
    <Page
      title={
        correction
          ? "Make it right."
          : reviewing
            ? "A fair share."
            : "Add an expense."
      }
      subtitle={`${group.name} · ${correction ? "The original stays in history." : "Every little thing, accounted for."}`}
      footer={
        <Button
          label={
            reviewing
              ? correction
                ? "Confirm correction"
                : "Confirm shared expense"
              : "Review split"
          }
          busy={busy}
          disabled={group.archived}
          onPress={() => {
            if (reviewing) void submit();
            else {
              try {
                body();
                if (correction && !reason.trim())
                  throw new Error("Enter a correction reason.");
                setReviewing(true);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }
          }}
        />
      }
    >
      {capture?.duplicateWarning && (
        <ErrorBox message="Possible duplicate payment. Check the group history before confirming another expense." />
      )}
      {reviewing ? (
        <>
          <Card>
            <Heading>{money(toPaise(amount))}</Heading>
            <Txt>
              {title} · {category}
            </Txt>
            <Txt muted>
              Paid by {group.members.find((m) => m.id === payer)?.displayName}{" "}
              on {date}
            </Txt>
            {preview.map((share) => (
              <Row key={share.userId}>
                <Txt>
                  {
                    group.members.find((m) => m.id === share.userId)
                      ?.displayName
                  }
                </Txt>
                <Txt mono>{money(share.amountPaise)}</Txt>
              </Row>
            ))}
            {note && <Txt muted>{note}</Txt>}
            {correction && <Txt muted>Correction reason: {reason}</Txt>}
          </Card>
          <Txt muted>
            Confirming saves one request on this device. It will post when the
            connection is available. The server checks the final split.
          </Txt>
          <Button
            label="Edit expense"
            secondary
            onPress={() => setReviewing(false)}
          />
        </>
      ) : (
        <>
          {!!presets.length && (
            <Card>
              <Heading small>A familiar split?</Heading>
              {presets.map((p) => (
                <Button
                  key={p.id}
                  label={`Apply ${p.name}`}
                  secondary
                  onPress={() => apply(p)}
                />
              ))}
            </Card>
          )}
          <Field
            label="What was it for?"
            value={title}
            onChange={setTitle}
            placeholder="Dinner, groceries, the cab home…"
            autoCapitalize="sentences"
          />
          <Field
            label="Amount (₹)"
            value={amount}
            onChange={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Choice
            label="Paid by"
            value={payer}
            onChange={setPayer}
            options={group.members.map((x) => ({
              value: x.id,
              label: x.displayName,
            }))}
          />
          <Choice
            label="Category"
            value={category}
            onChange={setCategory}
            options={["Food", "Travel", "Home", "Stay", "Other"].map((x) => ({
              value: x,
              label: x,
            }))}
          />
          <Field
            label="Date"
            value={date}
            onChange={setDate}
            hint="YYYY-MM-DD"
          />
          <Choice
            label="How are we splitting?"
            value={method}
            onChange={(value) => {
              setMethod(value);
              setValues({});
            }}
            options={[
              { value: "equal", label: "Equally" },
              { value: "percentage", label: "Percentages" },
              { value: "exact", label: "Exact amounts" },
              { value: "weighted", label: "By shares" },
            ]}
          />
          <Card>
            <Heading small>Who’s in?</Heading>
            {group.members.map((member) => (
              <View key={member.id} style={{ gap: 5 }}>
                <Check
                  label={member.displayName}
                  checked={ids.includes(member.id)}
                  onChange={() =>
                    setIds(
                      ids.includes(member.id)
                        ? ids.filter((i) => i !== member.id)
                        : [...ids, member.id],
                    )
                  }
                />
                {ids.includes(member.id) && method !== "equal" && (
                  <Field
                    label={`${member.displayName}: ${method === "percentage" ? "percentage" : method === "weighted" ? "weight" : "rupees"}`}
                    value={values[member.id] || ""}
                    onChange={(value) =>
                      setValues({ ...values, [member.id]: value })
                    }
                    keyboardType={
                      method === "weighted" ? "number-pad" : "decimal-pad"
                    }
                  />
                )}
              </View>
            ))}
            {preview.map((x) => (
              <Row key={x.userId}>
                <Txt muted>
                  {group.members.find((m) => m.id === x.userId)?.displayName}
                </Txt>
                <Txt mono>{money(x.amountPaise)}</Txt>
              </Row>
            ))}
          </Card>
          <Field
            label="Note (optional)"
            value={note}
            onChange={setNote}
            multiline
          />
          {correction && (
            <Field
              label="Correction reason"
              value={reason}
              onChange={setReason}
              multiline
            />
          )}
          {!correction && !draftId && (
            <Button
              label="Save local draft"
              secondary
              onPress={() => void save()}
            />
          )}
          {group.ownerId === session?.id && (
            <Card>
              <Field
                label="Save this split as a preset"
                value={presetName}
                onChange={setPresetName}
                placeholder="A name you’ll recognise"
              />
              <Button
                label="Save split preset"
                secondary
                disabled={!presetName.trim()}
                onPress={() => void savePreset()}
              />
            </Card>
          )}
        </>
      )}
      {group.archived && (
        <Badge warning>Archived groups cannot accept expenses.</Badge>
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
