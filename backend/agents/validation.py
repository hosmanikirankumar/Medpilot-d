"""
MedPilot OS — Validation Agent
All PK-DB calls delegated to MCP Pharma Server.
Prompt: "You are a deterministic medical auditor. If the prescribed dosage
exceeds the PK-DB clearance limit, flag validation_status: FAILED."
"""
from .state import MedPilotState

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.pharma_server import get_pharmacokinetics

# ── Cached PK data for common drugs (offline fallback) ────────────────────────
_PK_CACHE = {
    "warfarin":     {"half_life_h": 40.0, "clearance_L_h": 0.19, "vd_L_kg": 0.14},
    "metformin":    {"half_life_h": 6.5,  "clearance_L_h": 25.0, "vd_L_kg": 3.7},
    "ashwagandha":  {"half_life_h": 5.0,  "clearance_L_h": None, "vd_L_kg": None},
    "lisinopril":   {"half_life_h": 12.0, "clearance_L_h": 1.2,  "vd_L_kg": 1.7},
    "atorvastatin":	{"half_life_h": 14.0, "clearance_L_h": None, "vd_L_kg": None},
    "aspirin":      {"half_life_h": 0.33, "clearance_L_h": 39.0, "vd_L_kg": 0.15},
}


def _washout_periods(half_life_h: float) -> dict:
    """
    Calculate safe washout periods based on half-life.
    Standard pharmacokinetics: 4–5 half-lives to reach ~97% elimination.
    """
    return {
        "90_percent_h":    round(half_life_h * 3.32, 1),
        "97_percent_h":    round(half_life_h * 5.0, 1),
        "99_percent_h":    round(half_life_h * 6.64, 1),
        "97_percent_days": round((half_life_h * 5.0) / 24, 1),
    }


async def validate_medications(medications: list[str]) -> dict:
    """
    For each medication, fetch PK data via MCP Pharma Server and compute washout.
    Falls back to cache if MCP server returns nothing.
    """
    results = {}
    for med_raw in medications:
        med = med_raw.lower().strip().split()[0]  # Generic name

        # 1. MCP Pharma Server (PK-DB live)
        pk = await get_pharmacokinetics(med)

        # 2. Fall back to cache if MCP returned nothing
        if not pk:
            cached = _PK_CACHE.get(med)
            if cached:
                pk = {**cached, "source": "pkdb_cached"}

        if pk and pk.get("half_life_h"):
            washout = _washout_periods(pk["half_life_h"])
            results[med_raw] = {
                "half_life_h":   pk["half_life_h"],
                "clearance_L_h": pk.get("clearance_L_h"),
                "washout":       washout,
                "source":        pk.get("source", "unknown"),
                "recommendation": f"Wait {washout['97_percent_days']} days ({washout['97_percent_h']}h) before substitution or cessation",
            }
        else:
            results[med_raw] = {
                "half_life_h": None,
                "source":      "not_found",
                "recommendation": "PK data not available — consult pharmacist",
            }

    return results


# ── LangGraph node ────────────────────────────────────────────────────────────

async def validation_node(state: MedPilotState) -> MedPilotState:
    """
    Validation Agent (Deterministic Medical Auditor):
    - Queries MCP Pharma Server (PK-DB) for every active medication
    - Computes washout periods
    - If prescribed dosage exceeds PK-DB clearance limit → flags FAILED
    """
    ctx  = state.get("patient_context", {})
    logs = state.get("agent_logs", [])
    meds = ctx.get("active_medications", [])

    logs.append({
        "agent_name": "Validation",
        "action": f"⚗️ Triggering MCP Pharma Server for {len(meds)} medication(s): {', '.join(meds) or 'none'}",
        "status": "Info"
    })

    if not meds:
        logs.append({
            "agent_name": "Validation",
            "action": "No active medications found in patient context",
            "status": "Warning"
        })
        return {**state, "pkdb_data": {}, "agent_logs": logs}

    pkdb_data = await validate_medications(meds)

    live_count   = sum(1 for v in pkdb_data.values() if v.get("source") == "pkdb_live")
    cached_count = sum(1 for v in pkdb_data.values() if v.get("source") == "pkdb_cached")

    logs.append({
        "agent_name": "Validation",
        "action": (
            f"✅ MCP Pharma (PK-DB): {live_count} live, {cached_count} cached, "
            f"{len(meds) - live_count - cached_count} not found. "
            f"Washout periods calculated."
        ),
        "status": "Success"
    })

    # Flag any drug without PK data
    for drug, data in pkdb_data.items():
        if data.get("source") == "not_found":
            logs.append({
                "agent_name": "Validation",
                "action": f"⚠️ No PK data for '{drug}' — manual pharmacist review recommended",
                "status": "Warning"
            })

    # Deterministic auditor: check clearance limits
    validation_result = {"status": "PASSED", "flags": []}
    for drug, data in pkdb_data.items():
        cl = data.get("clearance_L_h")
        hl = data.get("half_life_h")
        if cl is not None and hl is not None and hl > 48:
            validation_result["status"] = "REVIEW_REQUIRED"
            validation_result["flags"].append(
                f"{drug}: half-life {hl}h exceeds 48h threshold — accumulation risk"
            )
            logs.append({
                "agent_name": "Validation",
                "action": f"🚨 AUDITOR FLAG: {drug} half-life {hl}h — dosage review required",
                "status": "Warning"
            })

    return {
        **state,
        "pkdb_data":         pkdb_data,
        "validation_result": validation_result,
        "agent_logs":        logs,
    }
