import React, { useEffect, useState } from "react";
import { useStore } from "../core/store";
import { localDate, money } from "../core/money";
import { shareCsv } from "../core/export";
import type { Report } from "../core/types";
import type { ScreenProps } from "../navigation";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Heading,
  Page,
  Row,
  Txt,
} from "../components/ui";
export function ReportScreen({ route }: ScreenProps<"Report">) {
  const { groupId } = route.params;
  const { groups, api } = useStore();
  const group = groups.find((x) => x.id === groupId);
  const [initialMonth] = useState(() => localDate().slice(0, 7));
  const [month, setMonth] = useState(initialMonth),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error("Enter a month as YYYY-MM.");
      setReport(
        await api!.request(
          `/api/v1/groups/${groupId}/reports/monthly?month=${month}`,
        ),
      );
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    api!
      .request<Report>(
        `/api/v1/groups/${groupId}/reports/monthly?month=${initialMonth}`,
      )
      .then((value) => {
        if (alive) setReport(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [api, groupId, initialMonth]);
  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      if (!report) return;
      const csv = await api!.request<string>(
        `/api/v1/groups/${groupId}/reports/monthly?month=${report.month}&format=csv`,
        { text: true },
      );
      await shareCsv(csv, report.month);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    group?.members.find((m) => m.id === id)?.displayName || "Member";
  return (
    <Page
      title="The month, made clear."
      subtitle={`${group?.name || "Group"} · Confirmed activity only.`}
    >
      <Field
        label="Report month"
        value={month}
        onChange={setMonth}
        hint="YYYY-MM"
      />
      <Button
        label="View month"
        secondary
        busy={busy}
        onPress={() => void load()}
      />
      {report && (
        <>
          <Card>
            <Txt muted>{report.month} · Shared expenses</Txt>
            <Heading>
              {money(
                Object.values(report.categories)
                  .reduce((sum, value) => sum + BigInt(value), 0n)
                  .toString(),
              )}
            </Heading>
            {!Object.keys(report.categories).length && (
              <Txt muted>No expenses this month.</Txt>
            )}
            {Object.entries(report.categories).map(([category, value]) => (
              <Row key={category}>
                <Txt>{category}</Txt>
                <Txt mono>{money(value)}</Txt>
              </Row>
            ))}
          </Card>
          <Card>
            <Heading small>Everyone’s share</Heading>
            {Object.entries(report.memberShares).map(([id, value]) => (
              <Row key={id}>
                <Txt>{name(id)}</Txt>
                <Txt mono>{money(value)}</Txt>
              </Row>
            ))}
          </Card>
          <Card>
            <Heading small>Opening → closing</Heading>
            {Object.entries(report.closingBalances).map(([id, value]) => (
              <Row key={id}>
                <Txt style={{ flex: 1 }}>{name(id)}</Txt>
                <Txt mono>
                  {money(report.openingBalances[id] || "0")} → {money(value)}
                </Txt>
              </Row>
            ))}
          </Card>
          <Card>
            <Heading small>Payments recorded</Heading>
            {report.settlements.length ? (
              report.settlements.map((event) => (
                <Row key={event.id}>
                  <Txt style={{ flex: 1 }}>
                    {name(event.fromUserId!)} → {name(event.toUserId!)}
                  </Txt>
                  <Txt mono>{money(event.amountPaise)}</Txt>
                </Row>
              ))
            ) : (
              <Txt muted>No external payments recorded this month.</Txt>
            )}
          </Card>
          <Button
            label="Share / download CSV"
            busy={busy}
            onPress={() => void exportCsv()}
          />
          <Txt muted>
            The CSV comes from the same monthly API report. Local suggestions
            and pending writes are excluded. Late corrections can restate
            earlier months.
          </Txt>
        </>
      )}
      {!report && !busy && !error && (
        <Empty
          title="Choose a month."
          detail="Your monthly shared spending and settlement activity will appear here."
        />
      )}
      {error && <ErrorBox message={error} />}
    </Page>
  );
}
