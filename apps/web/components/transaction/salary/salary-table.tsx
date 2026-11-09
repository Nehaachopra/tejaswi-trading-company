"use client";

import { Pencil } from "lucide-react";

import { PartyEdit } from "~/components/account/party/party-sheet";
import { NumberInput } from "~/components/ui/number-input";
import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "../shared/form-basics";
import { useSalaryEntry, type SalaryEntryState } from "./state";

type Row = SalaryEntryState["table"][number];

// money columns carry ₹ in their heading, so the figures under them go without it
const inRupees = (label: string) => `${label} (₹)`;
const amount = (n: number) => rupees(n).replace(/^₹\s*/, "");

const nameOf = (r: Row) => r.employee.shortName ?? titleCase(r.employee.name.toLowerCase());

// a salary: every employee owed a month, all ticked to start with, each paying all its months owed; untick whom not to
// pay, change the months (oldest owed first). Each row: the name with Edit (their details changed right here), pay a
// month, the months owed, the months, the advance taken back in them, and the total; the grand total under it all.
// A table on wider screens, a card a row on the phone (each column's name left, its value right)
export function SalaryTable() {
  const { t, table, lines, value, setAll, editingId, setEditingId, refreshEmployees, tried } =
    useSalaryEntry();
  if (table.length === 0) return <p className="text-sm">{t("nothingOwed")}</p>;
  const allOn = table.every((r) => r.on);
  const editingRow = table.find((r) => r.employee.employeeId === editingId);
  return (
    <div className="flex flex-col gap-3">
      <HeldBar />
      {/* wider screens: the table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="border-b border-chestnut/20 text-xs font-semibold [&>th]:px-2 [&>th]:py-2 [&>th]:text-right">
              <th className="w-8 !text-left">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => setAll(e.target.checked)}
                  aria-label={t("table.all")}
                  className="size-4.5 accent-chestnut"
                />
              </th>
              <th className="!text-left">{t("employee")}</th>
              <th>{inRupees(t("table.payPerMonth"))}</th>
              <th>{t("table.monthsOwed")}</th>
              <th>{t("table.months")}</th>
              <th>{inRupees(t("table.advance"))}</th>
              <th>{inRupees(t("table.total"))}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr
                key={r.employee.employeeId}
                className={cn(
                  "border-b border-chestnut/10 transition-colors [&>td]:px-2 [&>td]:py-2 [&>td]:text-right",
                  r.on && "bg-chestnut/8",
                )}
              >
                <td className="!text-left">
                  <Tick row={r} />
                </td>
                <td className="!text-left">
                  <span className="font-semibold">{nameOf(r)}</span>
                  <EditButton row={r} />
                </td>
                <Dim on={r.on}>{amount(r.employee.monthlySalary)}</Dim>
                <Dim on={r.on}>{r.employee.owed.length}</Dim>
                <td className={cn(!r.on && "opacity-40")}>
                  <Months row={r} />
                </td>
                <td className={cn(!r.on && "opacity-40")}>
                  <Advance row={r} />
                </td>
                <Dim on={r.on} strong>
                  {amount(r.total)}
                </Dim>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-heading text-lg font-bold [&>td]:px-2 [&>td]:pt-3">
              <td />
              <td>{t("table.total")}</td>
              <td colSpan={4} />
              <td className="text-right">{amount(value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* the phone: a card a row */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => setAll(e.target.checked)}
            className="size-4.5 accent-chestnut"
          />
          {t("table.all")}
        </label>
        {table.map((r) => (
          <div
            key={r.employee.employeeId}
            className={cn(
              "flex flex-col rounded-control px-3.5 py-2.5 text-sm tabular shadow-[0_0_5px_0] shadow-chestnut/25 transition-colors",
              r.on && "bg-chestnut/8",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-chestnut/15 pb-2">
              <label className="flex min-w-0 items-center gap-2.5 font-semibold">
                <Tick row={r} />
                <span className="truncate">{nameOf(r)}</span>
              </label>
              <EditButton row={r} />
            </div>
            <div className={cn("flex flex-col", !r.on && "opacity-40")}>
              <Line label={inRupees(t("table.payPerMonth"))}>
                {amount(r.employee.monthlySalary)}
              </Line>
              <Line label={t("table.monthsOwed")}>{r.employee.owed.length}</Line>
              <Line label={t("table.months")}>
                <Months row={r} />
              </Line>
              <Line label={inRupees(t("table.advance"))}>
                <Advance row={r} />
              </Line>
              <Line label={inRupees(t("table.total"))} strong>
                {amount(r.total)}
              </Line>
            </div>
          </div>
        ))}
        <p className="flex items-center justify-between rounded-control bg-chestnut px-4 py-3 font-heading text-lg font-bold text-ivory">
          <span>{t("table.total")}</span>
          <span className="tabular">{rupees(value)}</span>
        </p>
      </div>

      {tried && lines.length === 0 && (
        <p className="text-sm text-danger">{t("missing.employees")}</p>
      )}

      {/* the employee's details changed right here; the table then shows the new pay */}
      {editingRow && (
        <PartyEdit
          partyId={editingRow.employee.partyId}
          onCancel={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            refreshEmployees();
          }}
        />
      )}
    </div>
  );
}

// what the ticked employees come to against what cash and the bank accounts hold together: a bar filling as more are
// ticked, red past what's held
export function HeldBar() {
  const { t, value, available } = useSalaryEntry();
  if (!Number.isFinite(available)) return null;
  const share = available > 0 ? Math.min(value / available, 1) : 1;
  const over = value > available;
  return (
    <div className="flex flex-col gap-1.5">
      <p className={cn("flex items-center justify-between gap-3 text-sm font-semibold", over && "text-danger")}>
        <span>{t("heldBar")}</span>
        <span className="tabular">{rupees(available)}</span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-chestnut/15" role="progressbar" aria-valuemin={0} aria-valuemax={available} aria-valuenow={value} aria-label={t("heldBar")}>
        <div className={cn("h-full rounded-full transition-all", over ? "bg-danger" : "bg-chestnut")} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

// ticked: paid in this save
function Tick({ row }: { row: Row }) {
  const { setRow } = useSalaryEntry();
  return (
    <input
      type="checkbox"
      checked={row.on}
      onChange={(e) => setRow(row.employee.employeeId, { on: e.target.checked })}
      aria-label={row.employee.name}
      className="size-4.5 shrink-0 accent-chestnut"
    />
  );
}

// opens (or closes) the employee's details
function EditButton({ row }: { row: Row }) {
  const { t, editingId, setEditingId } = useSalaryEntry();
  const id = row.employee.employeeId;
  return (
    <button
      type="button"
      onClick={() => setEditingId(editingId === id ? null : id)}
      aria-label={t("table.edit")}
      title={t("table.edit")}
      aria-pressed={editingId === id}
      className="ml-1.5 inline-grid size-7 shrink-0 place-items-center rounded-full align-middle hover:bg-chestnut/10 aria-pressed:bg-chestnut/15"
    >
      <Pencil className="size-3.5" aria-hidden />
    </button>
  );
}

// the months it pays: at least one, never more than are owed
function Months({ row }: { row: Row }) {
  const { setRow } = useSalaryEntry();
  const owed = row.employee.owed.length;
  return (
    <NumberInput
      value={row.months}
      onChange={(v) =>
        setRow(row.employee.employeeId, {
          months: v === "" ? "" : String(Math.min(Math.max(Number(v), 1), owed)),
        })
      }
      maxDigits={3}
      max={owed}
      disabled={!row.on}
      placeholder="--"
      className={cn(input(false), "ml-auto w-16 py-1.5 text-center tabular")}
    />
  );
}

// the advance they owe back, in red, with a toggle beside it: on, it's taken back from this payment (all of it, up to
// what the months come to); off (to start with), it isn't. None owed: —
function Advance({ row }: { row: Row }) {
  const { t, setRow } = useSalaryEntry();
  if (row.employee.advanceLeft <= 0) return <>—</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-danger">{amount(row.employee.advanceLeft)}</span>
      <button
        type="button"
        role="switch"
        aria-checked={row.take}
        aria-label={t("table.takeBack")}
        title={t("table.takeBack")}
        disabled={!row.on}
        onClick={() => setRow(row.employee.employeeId, { take: !row.take })}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          row.take ? "bg-chestnut" : "bg-chestnut/25",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-ivory shadow transition-all",
            row.take ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
    </span>
  );
}

// a table cell, faded when not ticked
function Dim({
  on,
  strong,
  children,
}: {
  on: boolean;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <td className={cn(!on && "opacity-40", strong && "font-heading text-base font-bold")}>
      {children}
    </td>
  );
}

// a phone row: the column's name left, its value right
function Line({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center justify-between gap-3 border-b border-chestnut/10 py-1.5 last:border-0">
      <span className="text-xs font-semibold">{label}</span>
      <span className={cn(strong && "font-heading text-base font-bold")}>{children}</span>
    </p>
  );
}
