"""
Recommender — cost-effective stock transfers and replenishment advice.

Economics are expected-value, not point-forecast:
  lost sales at a location = margin x E[max(D - stock, 0)],  D ~ N(P50, sd)
so uncertain demand is never treated as guaranteed.

Allocation (per SKU), in small batches:
  * candidates = (source, destination) where the destination is short,
    the route exists and is not blocked;
  * a batch is moved along the pair with the highest marginal net benefit:
        margin x (lost sales avoided at destination, only for demand AFTER
                  the transfer arrives)
      - margin x (extra lost sales created at the source)
      + holding cost saved at source on true surplus
      - holding cost at destination
      - transfer cost
  * stop when no pair has positive marginal benefit.
Hard constraints: only physical on-hand stock moves (not inbound), and the
source keeps at least its own P50 forecast + safety stock.

Each destination's gap is filled once, by the cheapest adequate source. Options
that were evaluated but not chosen are returned as "Not Recommended" with the
reason (blocked route, source can't spare stock, cost > benefit, need already
covered).

Impact: baseline (do nothing) vs plan, both scored with the same expected-loss
model, so before/after numbers are in the same units and comparable.
"""

from __future__ import annotations

import logging
import math

from app.db import get_conn
from app.ai.forecaster import forecast_all, Z90
from app.ai.planning import (
    HORIZON_DAYS, load_context, expected_short, position_after_leadtime,
)

logger = logging.getLogger(__name__)

BATCH = 5                 # units per allocation step
MIN_NET_BENEFIT = 25.0    # AED — below this a transfer isn't worth the handling effort
MAX_REJECTED_SHOWN = 12


def _surplus_cost(p, stock):
    """30-day holding cost of stock above P90 demand + safety (true surplus)."""
    return max(0.0, stock - (p["p90"] + p["safety"])) * p["st"]["daily_holding_cost"] * HORIZON_DAYS


def _dest_loss(mu, sd, stock, incoming):
    """Expected units short at destination given incoming = [(qty, lead_days)]."""
    if not incoming:
        return expected_short(mu, sd, stock)
    # Approximation: all incoming lands at the latest arrival among them
    lead = max(l for _, l in incoming)
    qty = sum(q for q, _ in incoming)
    before, left, mu_r, sd_r = position_after_leadtime(mu, sd, stock, lead)
    return before + expected_short(mu_r, sd_r, left + qty)


async def generate_recommendations(ctx: dict = None, forecasts: list = None):
    async with get_conn() as conn:
        if ctx is None:
            ctx = await load_context(conn)
    if forecasts is None:
        forecasts = await forecast_all(ctx=ctx)
    fmap = {(f["sku_id"], f["warehouse_id"]): f for f in forecasts}
    sim_date = ctx["sim_date"]

    # ---- per-location planning position ------------------------------------
    pos = {}
    for key, st in ctx["stock"].items():
        f = fmap.get(key)
        if not f:
            continue
        net = st["available_qty"] - st["reserved_qty"]
        usable = net + ctx["inbound"][key]["in_horizon"]
        mu, sd = float(f["forecast_qty_30d"]), float(f.get("forecast_sd") or 0)
        pos[key] = {
            "st": st, "f": f, "mu": mu, "sd": sd, "net": net, "usable": usable,
            "safety": st["safety_stock"],
            "short": usable - mu < st["safety_stock"],
            "need": max(0, int(math.ceil(st["safety_stock"] - (usable - mu)))),
            "spare": max(0, min(net, int(usable - mu - st["safety_stock"]))),
            "p90": f["confidence_high"],
        }

    skus = sorted({k[0] for k in pos})
    recommendations, rejected = [], []

    for sku in skus:
        locs = {k[1]: v for k, v in pos.items() if k[0] == sku}
        dests = [w for w, p in locs.items() if p["short"]]
        if not dests:
            continue
        sources = [w for w in locs if w not in dests]
        moved = {}                         # (src, dst) -> qty
        out_of = {w: 0 for w in locs}      # units leaving each source
        into = {w: [] for w in locs}       # dst -> [(qty, lead)]

        def pair_ok(s, d):
            r = ctx["routes"].get((s, d))
            return r is not None and not r["blocked"]

        def marginal(s, d, q):
            r = ctx["routes"][(s, d)]
            P, S = locs[d], locs[s]
            m_d, m_s = P["st"]["margin"], S["st"]["margin"]
            cur_in = into[d]
            loss_d0 = _dest_loss(P["mu"], P["sd"], P["usable"], cur_in)
            loss_d1 = _dest_loss(P["mu"], P["sd"], P["usable"], cur_in + [(q, r["lead_days"])])
            src_stock = S["usable"] - out_of[s]
            loss_s0 = expected_short(S["mu"], S["sd"], src_stock)
            loss_s1 = expected_short(S["mu"], S["sd"], src_stock - q)
            dst_stock = P["usable"] + sum(qq for qq, _ in cur_in)
            hold = (_surplus_cost(S, src_stock) - _surplus_cost(S, src_stock - q)
                    - (_surplus_cost(P, dst_stock + q) - _surplus_cost(P, dst_stock)))
            benefit = m_d * (loss_d0 - loss_d1) - m_s * (loss_s1 - loss_s0) + hold
            return benefit - q * r["cost_per_unit"], benefit

        # ---- greedy allocation ----
        while True:
            best = None
            for s in sources:
                cap = locs[s]["spare"] - out_of[s]
                if cap <= 0:
                    continue
                for d in dests:
                    if not pair_ok(s, d):
                        continue
                    remaining_need = locs[d]["need"] - sum(q for q, _ in into[d])
                    q = min(BATCH, cap, remaining_need)
                    if q <= 0:
                        continue
                    net_b, _ = marginal(s, d, q)
                    if net_b > 0 and (best is None or net_b / q > best[0]):
                        best = (net_b / q, s, d, q)
            if best is None:
                break
            _, s, d, q = best
            moved[(s, d)] = moved.get((s, d), 0) + q
            out_of[s] += q
            into[d].append((q, ctx["routes"][(s, d)]["lead_days"]))

        # ---- materialise chosen transfers (exact totals) ----
        for (s, d), q in moved.items():
            r = ctx["routes"][(s, d)]
            P, S = locs[d], locs[s]
            others_in = [(qq, ctx["routes"][(ss, dd)]["lead_days"]) for (ss, dd), qq in moved.items() if dd == d and ss != s]
            m_d, m_s = P["st"]["margin"], S["st"]["margin"]
            avoided = (_dest_loss(P["mu"], P["sd"], P["usable"], others_in)
                       - _dest_loss(P["mu"], P["sd"], P["usable"], others_in + [(q, r["lead_days"])]))
            src_after = S["usable"] - out_of[s]
            created = expected_short(S["mu"], S["sd"], src_after) - expected_short(S["mu"], S["sd"], src_after + q)
            dst_before = P["usable"] + sum(qq for qq, _ in others_in)
            hold = (_surplus_cost(S, src_after + q) - _surplus_cost(S, src_after)
                    - (_surplus_cost(P, dst_before + q) - _surplus_cost(P, dst_before)))
            benefit = m_d * avoided - m_s * created + hold
            cost = q * r["cost_per_unit"]
            # Downside: same transfer if destination demand comes in at P10
            mu_lo = max(0.0, P["mu"] - Z90 * P["sd"])
            avoided_lo = (_dest_loss(mu_lo, P["sd"], P["usable"], others_in)
                          - _dest_loss(mu_lo, P["sd"], P["usable"], others_in + [(q, r["lead_days"])]))
            downside_net = m_d * avoided_lo - m_s * created + hold - cost

            constraints = [
                f"Destination short: usable {P['usable']} vs forecast {int(P['mu'])} (P10–P90 {P['f']['confidence_low']}–{P['p90']}) + safety {P['safety']}",
                f"Source keeps {int(src_after)} ≥ its own forecast {int(S['mu'])} + safety {S['safety']} (moves on-hand stock only)",
                f"Route {r['route_key']}: {r['cost_per_unit']:.2f} AED/unit, {r['lead_days']} day(s) lead time"
                + (f" (base {r['base_lead_days']}d + {r['extra_days']}d disruption)" if r["extra_days"] else ""),
                f"Expected lost sales avoided at {d}: {avoided:.0f} units (only demand after arrival counts)",
                f"If demand lands at P10, net benefit would be {downside_net:.0f} AED",
            ] + r["notes"] + ctx["inbound"][(sku, d)]["notes"]

            recommendations.append({
                "recommendation_id": f"REC-{sku}-{s}-{d}",
                "action_type": "transfer",
                "sku_id": sku,
                "sku_name": P["st"]["sku_name"],
                "from_warehouse": s,
                "to_warehouse": d,
                "quantity": int(q),
                "transfer_cost": round(cost, 2),
                "expected_benefit": round(benefit, 2),
                "net_benefit": round(benefit - cost, 2),
                "downside_net_benefit": round(downside_net, 2),
                "expected_units_saved": round(avoided, 1),
                "lead_time_days": r["lead_days"],
                "reason": (
                    f"Move {q} units of {P['st']['sku_name']} {s}→{d}. {d} is expected to be "
                    f"{expected_short(P['mu'], P['sd'], P['usable']):.0f} units short without action; this avoids ~{avoided:.0f} "
                    f"lost sales for {cost:.0f} AED transport. Expected net {benefit - cost:.0f} AED "
                    f"(P10 case {downside_net:.0f} AED)."
                ),
                "constraints_checked": constraints,
                "is_feasible": True,
                "confidence_level": P["f"]["confidence_level"],
                "route_disrupted": bool(r["extra_days"] or r["blocked"]),
                "rejection_reason": None,
            })

        # ---- evaluated but not chosen ----
        for d in dests:
            for s in locs:
                if s == d or (s, d) in moved:
                    continue
                r = ctx["routes"].get((s, d))
                if r is None:
                    continue
                P, S = locs[d], locs[s]
                covered = sum(q for q, _ in into[d])
                nominal = max(BATCH, min(P["need"], max(S["net"], 0)))
                cost = nominal * r["cost_per_unit"]
                if r["blocked"]:
                    reason = f"Route {r['route_key']} blocked — " + "; ".join(r["notes"])
                    net_b, benefit, cost = 0.0, 0.0, 0.0
                elif S["spare"] - out_of.get(s, 0) <= 0:
                    if S["net"] <= 0:
                        continue
                    reason = (f"{s} cannot spare stock: it needs {int(S['mu'])} (forecast) + {S['safety']} "
                              f"(safety) and has {S['usable']} usable")
                    net_b, benefit, cost = 0.0, 0.0, 0.0
                else:
                    net_b, benefit = marginal(s, d, min(nominal, S["spare"] - out_of[s]))
                    if covered >= P["need"]:
                        reason = (f"Gap at {d} already covered by a cheaper/faster source; "
                                  f"extra units here would cost {cost:.0f} AED for ~{max(benefit,0):.0f} AED benefit")
                    else:
                        reason = (f"Transfer cost {r['cost_per_unit']:.2f} AED/unit over {r['lead_days']}d "
                                  f"exceeds expected benefit (net {net_b:.0f} AED)")
                rejected.append({
                    "recommendation_id": f"REC-{sku}-{s}-{d}",
                    "action_type": "transfer",
                    "sku_id": sku,
                    "sku_name": P["st"]["sku_name"],
                    "from_warehouse": s,
                    "to_warehouse": d,
                    "quantity": int(nominal),
                    "transfer_cost": round(cost, 2),
                    "expected_benefit": round(benefit, 2),
                    "net_benefit": round(net_b, 2),
                    "downside_net_benefit": None,
                    "expected_units_saved": 0,
                    "lead_time_days": r["lead_days"],
                    "reason": f"Not recommended: {reason}.",
                    "constraints_checked": [reason] + r["notes"],
                    "is_feasible": False,
                    "confidence_level": P["f"]["confidence_level"],
                    "route_disrupted": bool(r["extra_days"] or r["blocked"]),
                    "rejection_reason": reason,
                    "_priority": (0 if r["blocked"] else 1 if ("exceeds" in reason or "covered" in reason) else 2),
                })

    # Cautious: tiny moves are listed but not recommended
    keep = []
    for x in recommendations:
        if x["net_benefit"] < MIN_NET_BENEFIT:
            reason = (f"Expected net benefit {x['net_benefit']:.0f} AED is below the {MIN_NET_BENEFIT:.0f} AED "
                      f"minimum — not worth the handling effort")
            x.update(is_feasible=False, rejection_reason=reason, reason=f"Not recommended: {reason}.",
                     _priority=1)
            x["constraints_checked"] = [reason] + x["constraints_checked"]
            rejected.append(x)
        else:
            keep.append(x)
    recommendations = keep
    recommendations.sort(key=lambda x: x["net_benefit"], reverse=True)
    rejected.sort(key=lambda x: (x["_priority"], x["net_benefit"]))
    rejected = rejected[:MAX_REJECTED_SHOWN]
    for x in rejected:
        x.pop("_priority", None)
    all_recs = recommendations + rejected
    for i, rec in enumerate(all_recs):
        rec["rank"] = i + 1

    impact, baseline = _impact(ctx, pos, recommendations)
    replenishment = _replenishment(ctx, pos, recommendations)

    return {
        "recommendations": all_recs,
        "replenishment_actions": replenishment,
        "impact_assessment": impact,
        "baseline_comparison": baseline,
        "summary": {
            "total_recommendations": len(all_recs),
            "feasible_recommendations": len(recommendations),
            "rejected_options_shown": len(rejected),
            "total_net_benefit": round(sum(r["net_benefit"] for r in recommendations), 2),
            "shortages_identified": sum(1 for p in pos.values() if p["short"]),
            "excess_sources_found": sum(1 for p in pos.values() if p["spare"] > 0),
            "as_of": str(sim_date),
        },
    }


def _score(ctx, pos, transfers):
    """Expected lost units/AED and excess holding for a set of transfers."""
    incoming, outgoing = {}, {}
    for r in transfers:
        incoming.setdefault((r["sku_id"], r["to_warehouse"]), []).append((r["quantity"], r["lead_time_days"]))
        outgoing[(r["sku_id"], r["from_warehouse"])] = outgoing.get((r["sku_id"], r["from_warehouse"]), 0) + r["quantity"]
    lost_units = lost_aed = demand = excess_hold = 0.0
    for key, p in pos.items():
        stock = p["usable"] - outgoing.get(key, 0)
        u = _dest_loss(p["mu"], p["sd"], stock, incoming.get(key, []))
        lost_units += u
        lost_aed += u * p["st"]["margin"]
        demand += p["mu"]
        on_hand_after = stock + sum(q for q, _ in incoming.get(key, []))
        excess_hold += max(0.0, on_hand_after - (p["p90"] + p["safety"])) * p["st"]["daily_holding_cost"] * HORIZON_DAYS
    fill = 100 * (1 - lost_units / demand) if demand else 100.0
    return {"lost_units": lost_units, "lost_aed": lost_aed, "excess_hold": excess_hold, "fill": fill}


def _impact(ctx, pos, transfers):
    b = _score(ctx, pos, [])
    a = _score(ctx, pos, transfers)
    t_cost = sum(r["transfer_cost"] for r in transfers)
    b_net = -(b["lost_aed"] + b["excess_hold"])
    a_net = -(a["lost_aed"] + a["excess_hold"] + t_cost)

    def m(metric, before, after, unit, better_low=True):
        return {"metric": metric, "before": round(before, 1), "after": round(after, 1), "unit": unit,
                "delta": round(after - before, 1),
                "is_improvement": (after < before) if better_low else (after > before)}

    impact = [
        m("Expected lost sales (AED margin)", b["lost_aed"], a["lost_aed"], "AED"),
        m("Expected units short", b["lost_units"], a["lost_units"], "units"),
        m("Holding cost on surplus stock, 30d (AED)", b["excess_hold"], a["excess_hold"], "AED"),
        m("Transfer cost (AED)", 0.0, t_cost, "AED"),
        m("Total expected cost (AED)", -b_net, -a_net, "AED"),
        m("Expected fill rate (%)", b["fill"], a["fill"], "%", better_low=False),
    ]
    baseline = {
        "method": ("Both columns scored with the same model: expected lost margin = margin x E[max(demand - stock, 0)] "
                   "with demand ~ forecast distribution; plus 30-day holding cost on stock above P90 + safety; plus transfer cost."),
        "baseline": {
            "label": "Baseline (do nothing)",
            "description": "No proactive transfers; current stock and inbound only",
            "shortage_exposure_aed": round(b["lost_aed"], 2),
            "transfer_cost_aed": 0.0,
            "excess_holding_aed": round(b["excess_hold"], 2),
            "net_position_aed": round(b_net, 2),
            "units_at_risk": round(b["lost_units"], 1),
            "service_level_pct": round(b["fill"], 1),
        },
        "ai_solution": {
            "label": "Agent plan (approved transfers)",
            "description": f"{len(transfers)} transfer(s) ranked by expected net benefit; all need planner approval",
            "shortage_exposure_aed": round(a["lost_aed"], 2),
            "transfer_cost_aed": round(t_cost, 2),
            "excess_holding_aed": round(a["excess_hold"], 2),
            "net_position_aed": round(a_net, 2),
            "units_at_risk": round(a["lost_units"], 1),
            "service_level_pct": round(a["fill"], 1),
        },
        "improvement": {
            "shortage_reduction_aed": round(b["lost_aed"] - a["lost_aed"], 2),
            "shortage_reduction_pct": round(100 * (b["lost_aed"] - a["lost_aed"]) / b["lost_aed"], 1) if b["lost_aed"] > 0 else 0,
            "net_benefit_aed": round(a_net - b_net, 2),
            "service_level_delta_pct": round(a["fill"] - b["fill"], 1),
        },
    }
    return impact, baseline


def _replenishment(ctx, pos, transfers):
    """Advisory only (purchasing is out of scope): where transfers can't close the gap."""
    incoming = {}
    for r in transfers:
        incoming.setdefault((r["sku_id"], r["to_warehouse"]), []).append((r["quantity"], r["lead_time_days"]))
    out = []
    for key, p in pos.items():
        if not p["short"]:
            continue
        residual = _dest_loss(p["mu"], p["sd"], p["usable"], incoming.get(key, []))
        if residual < 5:
            continue
        lead = int(p["st"].get("supplier_lead_days") or 14)
        out.append({
            "action_type": "replenishment",
            "sku_id": key[0], "warehouse_id": key[1], "sku_name": p["st"]["sku_name"],
            "suggested_qty": int(math.ceil(p["need"] - sum(q for q, _ in incoming.get(key, [])))),
            "supplier_lead_days": lead,
            "expected_units_short_after_transfers": round(residual, 1),
            "arrives_within_horizon": lead < HORIZON_DAYS,
            "notes": ctx["inbound"][key]["notes"],
            "reason": (f"Transfers leave ~{residual:.0f} units of expected shortfall at {key[1]}. "
                       f"Raise or expedite a PO (supplier lead {lead}d)" + ("" if lead < HORIZON_DAYS else " — would land after this horizon") + "."),
            "requires_approval": True,
        })
    out.sort(key=lambda x: -x["expected_units_short_after_transfers"])
    return out
