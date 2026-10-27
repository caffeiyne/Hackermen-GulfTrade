"""
Demand profiles for the simulator engine — mirrors the sales generator.

These are used by the ScenarioRunner to emit realistic sales during the
real-time simulation.
"""

DEMAND_PROFILES = {
    # Chargers
    ("CHG-UC-001", "DXB"): {"base": 7,  "weekend_mult": 0.6, "trend": 0.01},
    ("CHG-UC-001", "AUH"): {"base": 12, "weekend_mult": 0.5, "trend": 0.02},
    ("CHG-UC-001", "SHJ"): {"base": 5,  "weekend_mult": 0.7, "trend": 0.01},
    ("CHG-UC-002", "DXB"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CHG-UC-002", "AUH"): {"base": 6,  "weekend_mult": 0.5, "trend": 0.01},
    ("CHG-UC-002", "SHJ"): {"base": 3,  "weekend_mult": 0.7, "trend": 0.005},
    ("CHG-UC-003", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.0},
    ("CHG-UC-003", "AUH"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("CHG-UC-003", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("CHG-UC-004", "DXB"): {"base": 5,  "weekend_mult": 0.7, "trend": 0.005},
    ("CHG-UC-004", "AUH"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CHG-UC-004", "SHJ"): {"base": 3,  "weekend_mult": 0.7, "trend": 0.005},
    # Cables
    ("CAB-LT-001", "DXB"): {"base": 10, "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-LT-001", "AUH"): {"base": 7,  "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-LT-001", "SHJ"): {"base": 5,  "weekend_mult": 0.6, "trend": 0.005},
    ("CAB-LT-002", "DXB"): {"base": 6,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-LT-002", "AUH"): {"base": 4,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-LT-002", "SHJ"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.0},
    ("CAB-UC-001", "DXB"): {"base": 8,  "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-UC-001", "AUH"): {"base": 5,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-001", "SHJ"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CAB-UC-002", "DXB"): {"base": 5,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-002", "AUH"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    # Power banks
    ("PWB-001", "DXB"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-001", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("PWB-001", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("PWB-002", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("PWB-002", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-002", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-003", "DXB"): {"base": 6,  "weekend_mult": 0.6, "trend": 0.01},
    ("PWB-003", "AUH"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-003", "SHJ"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    # Earbuds
    ("EAR-001", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("EAR-001", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-001", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-002", "DXB"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("EAR-002", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("EAR-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("EAR-003", "DXB"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("EAR-003", "AUH"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-003", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    # Mice
    ("MOU-001", "DXB"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-001", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-001", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-002", "DXB"): {"base": 5,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-002", "AUH"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-003", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("MOU-003", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-003", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
}

BUYER_IDS = [f"BUY-{i:04d}" for i in range(1, 21)]
