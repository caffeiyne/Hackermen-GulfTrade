"""
Planning context — one consistent view of the world for forecaster, detector
and recommender.

Everything the engine "knows" comes from here, so a corrected record or a
changed disruption assumption flows through forecast -> imbalances ->
recommendations -> impact in one pass.

Disruption effects are deliberately narrow and always labelled as assumptions:
  * supply_shortage  -> inbound POs for the listed SKUs slip by N days
                        (N by severity, see SUPPLY_DELAY_DAYS)
  * shipping_delay   -> listed routes get extra transit days, or are BLOCKED
                        when severity is 'critical'; inbound POs for listed
                        SKUs are held until the disruption ends (high/critical)
                        or slip by the route delay (low/medium)
  * demand_surge     -> a *supplied* demand signal: forecast for the listed
                        SKUs is multiplied for the overlapping days only
No disruption ever touches a SKU or route it does not list.
"""

from __future__ import annotations

import math
from datetime import date, timedelta

HORIZON_DAYS = 30

# Assumptions (shown to the planner wherever they are used)
SUPPLY_DELAY_DAYS = {"low": 3, "medium": 7, "high": 14, "critical": 21}
ROUTE_DELAY_DAYS = {"low": 1, "medium": 3, "high": 7}
SURGE_MULTIPLIER = {"low": 1.5, "medium": 2.0, "high": 3.0, "critical": 5.0}
DEFAULT_HOLDING = 0.05  # AED/unit/day when no holding-cost record exists


def _d(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def adjusted_eta(po, disruptions, sim_date):
    """
    ETA for an inbound PO after supplied disruptions. Shared by the planner and
    the simulator so what the agent assumes is what the sim does.
    Returns (eta, note-or-None).
    """
    eta = _d(po["revised_date"]) or _d(po["expected_date"]) or sim_date
    note = None
    for d in disruptions:
        if po["sku_id"] not in (d.get("affected_skus") or []):
            continue
        if d["disruption_type"] == "supply_shortage":
            slip = SUPPLY_DELAY_DAYS.get(d["severity"], 7)
            eta = eta + timedelta(days=slip)
            note = (f"PO {po['po_id']}: ETA slipped +{slip}d by '{d['title']}' "
                    f"(assumption: {d['severity']} severity = +{slip}d)")
        elif d["disruption_type"] == "shipping_delay" and not (d.get("affected_routes") or []):
            end = _d(d.get("end_date"))
            if d["severity"] in ("high", "critical") and end:
                eta = max(eta, end + timedelta(days=1))
                note = f"PO {po['po_id']}: held until {end} by '{d['title']}' (assumption)"
            else:
                slip = ROUTE_DELAY_DAYS.get(d["severity"], 3)
                eta = eta + timedelta(days=slip)
                note = f"PO {po['po_id']}: ETA +{slip}d by '{d['title']}' (assumption)"
    return eta, note


async def get_sim_date(conn) -> date:
    row = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
    return _d(row["sim_clock"]) if row and row["sim_clock"] else date.today()


async def load_context(conn) -> dict:
    sim_date = await get_sim_date(conn)
    horizon_end = sim_date + timedelta(days=HORIZON_DAYS)

    disruptions = [
        dict(r) for r in await conn.fetch(
            """
            SELECT disruption_id, disruption_type, title, description, affected_skus,
                   affected_routes, severity, start_date, end_date, source
            FROM events.disruptions
            WHERE is_active = TRUE
              AND $1::date BETWEEN start_date AND COALESCE(end_date, '2099-12-31'::date)
            """,
            sim_date,
        )
    ]
    for d in disruptions:
        d["affected_skus"] = list(d.get("affected_skus") or [])
        d["affected_routes"] = list(d.get("affected_routes") or [])
        d["start_date"] = _d(d["start_date"])
        d["end_date"] = _d(d["end_date"])

    # ---- routes -----------------------------------------------------------
    routes = {}
    for r in await conn.fetch("SELECT * FROM master.transfer_matrix WHERE active = TRUE"):
        key = (r["from_warehouse"], r["to_warehouse"])
        route = {
            "route_key": f"{key[0]}-{key[1]}",
            "cost_per_unit": float(r["cost_per_unit"]),
            "base_lead_days": int(r["lead_time_days"]),
            "extra_days": 0,
            "blocked": False,
            "notes": [],
        }
        for d in disruptions:
            if d["disruption_type"] != "shipping_delay" or route["route_key"] not in d["affected_routes"]:
                continue
            if d["severity"] == "critical":
                route["blocked"] = True
                until = d["end_date"].isoformat() if d["end_date"] else "further notice"
                route["notes"].append(f"BLOCKED by '{d['title']}' until {until} (supplied signal)")
            else:
                extra = ROUTE_DELAY_DAYS.get(d["severity"], 3)
                route["extra_days"] += extra
                route["notes"].append(
                    f"+{extra} days transit from '{d['title']}' (assumption: {d['severity']} severity = +{extra}d)"
                )
        route["lead_days"] = route["base_lead_days"] + route["extra_days"]
        routes[key] = route

    # ---- stock + master data ------------------------------------------------
    stock = {}
    for r in await conn.fetch(
        """
        SELECT sl.sku_id, sl.warehouse_id, sl.available_qty, sl.reserved_qty,
               sl.safety_stock, sl.inbound_qty, sl.updated_at,
               s.unit_cost, s.unit_price, s.name AS sku_name, s.product_type, s.supplier_lead_days,
               COALESCE(hc.daily_holding_cost, $1) AS daily_holding_cost
        FROM inventory.stock_levels sl
        JOIN master.skus s ON s.sku_id = sl.sku_id
        LEFT JOIN master.holding_costs hc
               ON hc.sku_id = sl.sku_id AND hc.warehouse_id = sl.warehouse_id
        ORDER BY sl.sku_id, sl.warehouse_id
        """,
        DEFAULT_HOLDING,
    ):
        row = dict(r)
        for k in ("unit_cost", "unit_price", "daily_holding_cost"):
            row[k] = float(row[k])
        row["margin"] = row["unit_price"] - row["unit_cost"]
        stock[(r["sku_id"], r["warehouse_id"])] = row

    # ---- inbound with disruption-adjusted ETAs -------------------------------
    inbound = {k: {"in_horizon": 0, "beyond_horizon": 0, "arrivals": [], "notes": []} for k in stock}
    po_rows = await conn.fetch(
        """
        SELECT po_id, sku_id, warehouse_id, quantity, expected_date, revised_date, status
        FROM orders.inbound
        WHERE status IN ('pending', 'in_transit', 'delayed')
        """
    )
    seen = set()
    for po in po_rows:
        key = (po["sku_id"], po["warehouse_id"])
        if key not in inbound:
            continue
        seen.add(key)
        eta, note = adjusted_eta(po, disruptions, sim_date)
        eta = max(eta, sim_date + timedelta(days=1))  # overdue POs: assume next day
        qty = int(po["quantity"])
        bucket = "in_horizon" if eta < horizon_end else "beyond_horizon"
        inbound[key][bucket] += qty
        inbound[key]["arrivals"].append({"po_id": po["po_id"], "eta": eta, "qty": qty})
        if note:
            inbound[key]["notes"].append(note + ("" if bucket == "in_horizon" else " — now lands AFTER the 30-day horizon"))

    # Stock rows that show inbound but have no PO record: keep the quantity but say so
    for key, row in stock.items():
        if key not in seen and row["inbound_qty"] > 0:
            inbound[key]["in_horizon"] += int(row["inbound_qty"])
            inbound[key]["arrivals"].append({"po_id": None, "eta": sim_date + timedelta(days=7), "qty": int(row["inbound_qty"])})
            inbound[key]["notes"].append("Inbound quantity has no PO record — ETA assumed day 7 (unverified)")

    # ---- supplied demand signals ----------------------------------------------
    surges = {}
    for d in disruptions:
        if d["disruption_type"] != "demand_surge":
            continue
        mult = SURGE_MULTIPLIER.get(d["severity"], 2.0)
        start = max(d["start_date"], sim_date)
        end = min(d["end_date"] or horizon_end, horizon_end)
        overlap = max(0, (end - start).days)
        for sku in d["affected_skus"]:
            surges.setdefault(sku, []).append({"title": d["title"], "multiplier": mult, "days": overlap})

    return {
        "sim_date": sim_date,
        "horizon_end": horizon_end,
        "disruptions": disruptions,
        "routes": routes,
        "stock": stock,
        "inbound": inbound,
        "surges": surges,
    }


# ---------------------------------------------------------------------------
# Normal loss helpers — expected units short when stocking S against D~N(mu, sd)
# ---------------------------------------------------------------------------
def _phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def _Phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def expected_short(mu: float, sd: float, stock: float) -> float:
    """E[max(D - stock, 0)] for D ~ Normal(mu, sd), truncated sensibly."""
    if mu <= 0:
        return 0.0
    if sd <= 1e-9:
        return max(mu - stock, 0.0)
    z = (stock - mu) / sd
    return max(0.0, sd * (_phi(z) - z * (1 - _Phi(z))))


def position_after_leadtime(mu: float, sd: float, on_hand: float, lead_days: int):
    """
    Split the horizon at the transfer arrival day. Stock that arrives after
    `lead_days` can only serve demand from that day on.
    Returns (unavoidable_short_before_arrival, stock_left_at_arrival, mu_rest, sd_rest).
    """
    frac = min(max(lead_days, 0), HORIZON_DAYS) / HORIZON_DAYS
    mu_before, sd_before = mu * frac, sd * math.sqrt(frac)
    short_before = expected_short(mu_before, sd_before, on_hand)
    left = max(on_hand - mu_before, 0.0)
    rest = 1 - frac
    return short_before, left, mu * rest, sd * math.sqrt(rest)
