"""
Scenario definitions — pre-built fictional scenarios for the case study.

Scenario A (Normal): USB-C charger imbalance
  Dubai has excess, Abu Dhabi has shortage risk. The system recommends
  a transfer. No major disruptions. Sara approves and sees improvement.

Scenario B (Difficult): Semiconductor supply constraint + shipping route delay
  The normal imbalance exists, but a semiconductor disruption affects
  specific charger SKUs, and a shipping delay affects the DXB-SHJ route.
  The system must reassess and avoid recommending affected transfers.
"""


SCENARIO_A = {
    "name": "A",
    "title": "Normal Planning Journey — USB-C Charger Imbalance",
    "description": (
        "Sara reviews USB-C chargers: Dubai has 500 units against ~200 forecast "
        "for the next 30 days; Abu Dhabi has 100 against ~290 (stockout-corrected) with a 200-unit PO "
        "inbound; and Sharjah has 300 against ~150. The assistant flags a potential Abu Dhabi shortage and "
        "suggests a transfer from Dubai, checking safety stock, inbound orders, "
        "transfer lead time, and net economic benefit."
    ),
    "events": [
        {
            "sim_day": 1,
            "type": "sale_recorded",
            "description": "Daily sales coming in across all warehouses",
        },
        {
            "sim_day": 3,
            "type": "imbalance_detected",
            "description": "Abu Dhabi USB-C charger shortage projected (after counting the 200-unit inbound PO)",
        },
        {
            "sim_day": 5,
            "type": "recommendation_generated",
            "description": "DXB→AUH transfer recommended; SHJ→AUH evaluated and rejected (DXB already covers the gap more cheaply)",
        },
        {
            "sim_day": 7,
            "type": "prompt_approval",
            "description": "Sara reviews and approves the transfer",
        },
        {
            "sim_day": 8,
            "type": "transfer_in_transit",
            "description": "Approved transfer executed (prototype moves stock on approval; real lead times are a pilot item)",
        },
        {
            "sim_day": 10,
            "type": "transfer_completed",
            "description": "Abu Dhabi expected lost sales reduced — see Actions → Baseline vs plan",
        },
    ],
    "disruptions_to_activate": [],  # no disruptions in scenario A
}


SCENARIO_B = {
    "name": "B",
    "title": "Difficult Case — Supply Disruption + Shipping Delay",
    "description": (
        "The same USB-C charger imbalance exists, but two disruption events occur: "
        "(1) A semiconductor supply constraint affects GaN-based chargers (CHG-UC-002, CHG-UC-003) "
        "— their inbound POs slip (+14 days, labelled assumption). (2) A shipping route delay on the DXB-SHJ "
        "corridor adds 3 days transit to that route only. The system must NOT assume all products are affected, must NOT "
        "invent events, and must reassess recommendations with updated constraints."
    ),
    "events": [
        {
            "sim_day": 1,
            "type": "sale_recorded",
            "description": "Daily sales across all warehouses",
        },
        {
            "sim_day": 3,
            "type": "imbalance_detected",
            "description": "Abu Dhabi USB-C charger shortage projected",
        },
        {
            "sim_day": 5,
            "type": "recommendation_generated",
            "description": "Transfer DXB→AUH recommended initially",
        },
        {
            "sim_day": 9,
            "type": "disruption_published",
            "description": "Semiconductor supply constraint — affects CHG-UC-002, CHG-UC-003 only",
            "disruption_id": "supply_shortage_gan",
        },
        {
            "sim_day": 11,
            "type": "recommendation_updated",
            "description": "Inbound POs for CHG-UC-002/003 assumed +14 days late (labelled assumption); shortage risk reassessed for those SKUs only",
        },
        {
            "sim_day": 14,
            "type": "disruption_published",
            "description": "Shipping route delay — DXB-SHJ corridor affected",
            "disruption_id": "shipping_delay_dxb_shj",
        },
        {
            "sim_day": 15,
            "type": "recommendation_updated",
            "description": "DXB↔SHJ transfers get +3 days; they stay only if still worth it. 3.20 AED/unit cross-emirate moves rejected where cost > benefit",
        },
        {
            "sim_day": 17,
            "type": "prompt_approval",
            "description": "Sara reviews updated recommendations with disruption context",
        },
    ],
    "disruptions_to_activate": [
        {
            "sim_day": 9,
            "disruption_key": "supply_shortage",
        },
        {
            "sim_day": 14,
            "disruption_key": "shipping_delay",
        },
    ],
}


SCENARIOS = {
    "A": SCENARIO_A,
    "B": SCENARIO_B,
}
