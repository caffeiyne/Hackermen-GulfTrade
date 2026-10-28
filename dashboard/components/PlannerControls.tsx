"use client";

/**
 * Planner controls — the case study's "correct a record or change a disruption
 * assumption ONCE and see the revised forecast, actions and impact everywhere".
 *
 * Both actions hit PATCH endpoints that write an audit-log entry (before/after)
 * and wake the agent, which recomputes forecast → imbalances → recommendations
 * → impact from one consistent snapshot.
 */

import { useEffect, useState } from "react";
import { SlidersHorizontal, PencilLine, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Disruption } from "@/lib/types";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const WAREHOUSES = ["DXB", "AUH", "SHJ"];

export function PlannerControls() {
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    sku_id: "CHG-UC-001",
    warehouse_id: "AUH",
    field: "available_qty",
    value: "",
    note: "",
  });

  const load = async () => {
    try {
      const all = await api.getDisruptions();
      setDisruptions(all);
    } catch {
      /* backend offline — keep last list */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 5000);
  };

  const changeAssumption = async (d: Disruption, change: { is_active?: boolean; severity?: string }) => {
    if (!d.disruption_id) return;
    setBusy(true);
    try {
      await api.updateDisruption(d.disruption_id, { ...change, changed_by: "Sara" });
      flash(`Assumption updated: ${d.title}. Forecast, actions and impact are being recomputed.`);
      await load();
    } catch (err) {
      flash(`Failed: ${(err as Error).message}`);
    }
    setBusy(false);
  };

  const correctRecord = async () => {
    const v = Number(form.value);
    if (form.value === "" || Number.isNaN(v) || v < 0) return;
    setBusy(true);
    try {
      await api.correctStock(form.sku_id.trim().toUpperCase(), form.warehouse_id, {
        [form.field]: Math.round(v),
        note: form.note || undefined,
        corrected_by: "Sara",
      });
      flash(`Corrected ${form.sku_id} @ ${form.warehouse_id}: ${form.field} = ${Math.round(v)}. Plan recomputed.`);
      setForm({ ...form, value: "", note: "" });
    } catch (err) {
      flash(`Failed: ${(err as Error).message}`);
    }
    setBusy(false);
  };

  const inputCls =
    "w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text";

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="w-4 h-4 text-tradeling-400" />
        <h3 className="font-medium text-buddy-text">Planner controls</h3>
      </div>
      <p className="text-xs text-buddy-muted mb-4">
        Change an assumption or fix a record once — every page (forecast, imbalances, actions, impact) updates from
        the new value. Every change is audit-logged with before/after values.
      </p>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-tradeling-800 bg-tradeling-950/40 p-3 text-xs text-tradeling-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disruption assumptions */}
        <div>
          <h4 className="text-sm font-medium text-buddy-text mb-2">Disruption assumptions</h4>
          {disruptions.length === 0 && (
            <p className="text-xs text-buddy-muted">No disruption signals loaded.</p>
          )}
          <div className="space-y-2">
            {disruptions.map((d) => (
              <div key={d.disruption_id ?? d.title} className="rounded-lg border border-buddy-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-buddy-text">{d.title}</span>
                  <Badge variant={d.is_active ? "warning" : "neutral"}>{d.is_active ? "active" : "off"}</Badge>
                </div>
                <p className="mt-1 text-xs text-buddy-muted">
                  {d.disruption_type} · {d.start_date} → {d.end_date ?? "open"} ·{" "}
                  {d.affected_skus.length ? `SKUs: ${d.affected_skus.join(", ")}` : "no SKUs"}
                  {d.affected_routes && d.affected_routes.length ? ` · routes: ${d.affected_routes.join(", ")}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={d.severity}
                    disabled={busy}
                    onChange={(e) => changeAssumption(d, { severity: e.target.value })}
                    className="bg-buddy-bg border border-buddy-border rounded-lg px-2 py-1 text-xs text-buddy-text"
                    aria-label="Severity"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => changeAssumption(d, { is_active: !d.is_active })}
                  >
                    {d.is_active ? "Mark as not happening" : "Re-activate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Record correction */}
        <div>
          <h4 className="text-sm font-medium text-buddy-text mb-2 flex items-center gap-2">
            <PencilLine className="w-4 h-4" /> Correct a stock record
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-buddy-muted block mb-1">SKU</label>
              <input
                className={inputCls}
                value={form.sku_id}
                onChange={(e) => setForm({ ...form, sku_id: e.target.value })}
                placeholder="CHG-UC-001"
              />
            </div>
            <div>
              <label className="text-xs text-buddy-muted block mb-1">Warehouse</label>
              <select
                className={inputCls}
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-buddy-muted block mb-1">Field</label>
              <select
                className={inputCls}
                value={form.field}
                onChange={(e) => setForm({ ...form, field: e.target.value })}
              >
                <option value="available_qty">Available</option>
                <option value="reserved_qty">Reserved</option>
                <option value="safety_stock">Safety stock</option>
                <option value="inbound_qty">Inbound</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-buddy-muted block mb-1">Correct value</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="e.g. 40"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-buddy-muted block mb-1">Reason (optional)</label>
              <input
                className={inputCls}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. cycle count found 60 damaged units"
              />
            </div>
          </div>
          <Button className="mt-3" size="md" disabled={busy || form.value === ""} onClick={correctRecord}>
            Apply correction
          </Button>
        </div>
      </div>
    </Card>
  );
}
