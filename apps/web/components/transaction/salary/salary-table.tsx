"use client";

import { CircleAlert, Pencil } from "lucide-react";

import { PartyEdit } from "~/components/account/party/party-sheet";
import { NumberInput } from "~/components/ui/number-input";
import { Switch } from "~/components/ui/switch";
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
  const {
    t,
    table,
    lines,
    value,
    available,
    setAll,
    editingId,
    setEditingId,
    refreshEmployees,
    tried,
  } = useSalaryEntry();
  // what cash and the bank accounts hold together, and what's left after the ticked salaries (the admin only: staff
  // see no balances)
  const held = Number.isFinite(available) ? available : null;
  const leftAfter = held === null ? 0 : Math.round((held - value) * 100) / 100;
  const short = leftAfter < 0;
  if (table.length === 0) return <p className="text-sm">{t("nothingOwed")}</p>;
  const allOn = table.every((r) => r.on);
  const editingRow = table.find((r) => r.employee.employeeId === editingId);
  return (
    <div className="flex flex-col gap-3">
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
                  <span className="flex items-center justify-between gap-3">
                    <TakeBack row={r} />
                    <Advance row={r} />
                  </span>
                </td>
                <Dim on={r.on} strong>
                  {amount(r.total)}
                </Dim>
              </tr>
            ))}
          </tbody>
          {/* the total, then what cash and the banks hold and what's left after the salaries: each name right beside
              its figure, at the right end under the Total column */}
          <tfoot>
            {/* the total in the chestnut box, as the phone's total and a payment's To pay */}
            <tr className="font-heading text-lg font-bold [&>td]:px-2 [&>td]:pt-3">
              <td colSpan={5} />
              <td className="whitespace-nowrap text-right align-middle">{t("table.total")}</td>
              <td className="text-right">
                <span className="inline-flex min-h-11 min-w-28 items-center justify-end rounded-control bg-chestnut px-3.5 text-ivory">
                  {amount(value)}
                </span>
              </td>
            </tr>
            {held !== null && (
              <>
                <tr className="text-sm [&>td]:px-2 [&>td]:pt-2">
                  <td colSpan={5} />
                  <td className="whitespace-nowrap text-right">{t("heldBar")}</td>
                  <td className="text-right">{amount(held)}</td>
                </tr>
                <tr className={cn("font-semibold [&>td]:px-2 [&>td]:pt-1", short && "text-danger")}>
                  <td colSpan={5} />
                  {/* a line above Left, as under a sum (Cash + bank less the total) */}
                  <td className="whitespace-nowrap border-t border-chestnut/30 !pt-1.5 text-right">
                    <LeftLabel short={short} />
                  </td>
                  <td className="border-t border-chestnut/30 !pt-1.5 text-right">
                    {amount(Math.abs(leftAfter))}
                  </td>
                </tr>
              </>
            )}
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
              <Line label={inRupees(t("table.advance"))} beside={<TakeBack row={r} />}>
                <Advance row={r} />
              </Line>
              <Line label={inRupees(t("table.total"))} strong>
                {amount(r.total)}
              </Line>
            </div>
          </div>
        ))}
        {/* the total and what's left: stuck just above the bottom bar while the rows scroll under it, on the card's
            ivory edge to edge, so it's always in view */}
        <div className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2.5 bg-ivory px-4 pb-3 pt-2 shadow-[0_-6px_8px_-6px] shadow-chestnut/25">
          <p className="flex items-center justify-between rounded-control bg-chestnut px-4 py-3 font-heading text-lg font-bold text-ivory">
            <span>{t("table.total")}</span>
            <span className="tabular">{rupees(value)}</span>
          </p>
          {/* what cash and the banks hold, then what's left after the salaries */}
          {held !== null && (
            <div className="tabular flex flex-col gap-1.5 px-4 text-sm">
              <p className="flex items-center justify-between gap-3">
                <span>{t("heldBar")}</span>
                <span>{rupees(held)}</span>
              </p>
              <p
                className={cn(
                  "flex items-center justify-between gap-3 border-t border-chestnut/30 pt-1.5 font-semibold",
                  short && "text-danger",
                )}
              >
                <LeftLabel short={short} />
                <span>{rupees(Math.abs(leftAfter))}</span>
              </p>
            </div>
          )}
        </div>
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

// what's left after the salaries: "Left", or in red "Short by" with the warning icon after it when they come to more than
// there is
function LeftLabel({ short }: { short: boolean }) {
  const { t } = useSalaryEntry();
  return short ? (
    <span className="inline-flex items-center gap-1.5">
      {t("heldShort")}
      <CircleAlert className="size-4 shrink-0" aria-hidden />
    </span>
  ) : (
    <span>{t("heldLeft")}</span>
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

// the advance they owe back, in red; its switch (TakeBack) on, it's taken back from this payment (all of it, up to what
// the months come to); off (to start with), it isn't. None owed: —
function Advance({ row }: { row: Row }) {
  return row.employee.advanceLeft <= 0 ? (
    <>—</>
  ) : (
    <span className="text-danger">{amount(row.employee.advanceLeft)}</span>
  );
}

// taking the advance back, as the TDS row's switch: by the Advance name (a phone's row), at the start of its cell (the
// table's), never beside the figure
function TakeBack({ row }: { row: Row }) {
  const { t, setRow } = useSalaryEntry();
  if (row.employee.advanceLeft <= 0) return null;
  return (
    <Switch
      small
      on={row.take}
      onFlip={(take) => setRow(row.employee.employeeId, { take })}
      label={t("table.takeBack")}
      disabled={!row.on}
    />
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
  beside,
  strong,
  children,
}: {
  label: string;
  // right by the name (the advance's take-back switch)
  beside?: React.ReactNode;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center justify-between gap-3 border-b border-chestnut/10 py-1.5 last:border-0">
      <span className="flex items-center gap-2.5 text-xs font-semibold">
        {label}
        {beside}
      </span>
      <span className={cn(strong && "font-heading text-base font-bold")}>{children}</span>
    </p>
  );
}
