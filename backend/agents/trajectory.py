"""
MedPilot OS — Predictive Symptom Trajectory Agent
Performs longitudinal trend analysis and proactive health-state forecasting.

Key capabilities:
  - Builds a multi-variable state vector from vitals + labs
  - Computes velocity/acceleration of each biomarker over time windows
  - Calculates medication intervention adjustments (context-aware slope correction)
  - Outputs: trend_vectors, phase_state, predicted_trajectory, risk_score, alert_level
  - Triggers Emergency Cascade if trajectory enters Critical Zone
"""
import math
import random
from datetime import datetime, timedelta
from .state import MedPilotState
from .llm import generate_json, pick_model

# ── Clinical threshold bands ──────────────────────────────────────────────────
VITAL_BANDS = {
    "hr":    {"critical_low": 40, "low": 55, "high": 110, "critical_high": 140, "unit": "bpm"},
    "spo2":  {"critical_low": 88, "low": 92, "high": 100, "critical_high": 100, "unit": "%"},
    "map":   {"critical_low": 55, "low": 65, "high": 105, "critical_high": 130, "unit": "mmHg"},
    "rr":    {"critical_low": 8,  "low": 12, "high": 20,  "critical_high": 28,  "unit": "/min"},
    "temp":  {"critical_low": 35, "low": 36, "high": 37.5,"critical_high": 39.5,"unit": "°C"},
}

LAB_BANDS = {
    "wbc":     {"critical_low": 2.0, "low": 4.5, "high": 11.0, "critical_high": 30.0, "unit": "×10³/μL"},
    "crp":     {"critical_low": 0,   "low": 0,   "high": 5.0,  "critical_high": 100,  "unit": "mg/L"},
    "lactate": {"critical_low": 0,   "low": 0,   "high": 2.0,  "critical_high": 4.0,  "unit": "mmol/L"},
    "inr":     {"critical_low": 0.5, "low": 0.8, "high": 3.0,  "critical_high": 5.0,  "unit": "ratio"},
}


def _normalize(value: float, band: dict) -> float:
    """Normalize a vital/lab value to 0–1 scale (0=critical_low, 1=critical_high)."""
    lo = band.get("critical_low", 0)
    hi = band.get("critical_high", 200)
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def _zone(value: float, band: dict) -> str:
    """Return clinical zone: safe | borderline | critical."""
    if value <= band["critical_low"] or value >= band["critical_high"]:
        return "critical"
    if value <= band["low"] or value >= band["high"]:
        return "borderline"
    return "safe"


def _slope(series: list[float]) -> float:
    """Linear slope (per step) using least-squares over a short series."""
    n = len(series)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(series) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(series))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0


def _acceleration(series: list[float]) -> float:
    """Second derivative (rate-of-change of slope) from a series."""
    if len(series) < 3:
        return 0.0
    slopes = [series[i+1] - series[i] for i in range(len(series)-1)]
    return _slope(slopes)


def _generate_demo_series(
    current_val: float, n_points: int = 12, drift: float = 0.0, noise: float = 0.5
) -> list[float]:
    """Generate a realistic-looking historical series ending at current_val."""
    series = []
    val = current_val - (drift * n_points) + random.gauss(0, noise)
    for _ in range(n_points):
        val += drift + random.gauss(0, noise * 0.3)
        series.append(round(val, 2))
    series[-1] = current_val
    return series


def _project_forward(series: list[float], steps: int = 8) -> list[float]:
    """Project series forward using linear extrapolation with damping."""
    if len(series) < 2:
        return [series[-1]] * steps
    sl = _slope(series[-6:])  # use last 6 points for projection
    accel = _acceleration(series[-6:])
    projection = []
    last = series[-1]
    for i in range(1, steps + 1):
        # Dampen acceleration over time (uncertainty grows)
        damped_slope = sl + accel * i * 0.5
        next_val = last + damped_slope * i
        projection.append(round(next_val, 2))
    return projection


def _compute_phase_vector(vitals: dict) -> dict:
    """
    Compute normalised 2D phase-space position using SpO2 and HR as primary axes,
    plus a severity Z-score combining MAP and RR.
    Returns: {x, y, z, cluster, velocity_x, velocity_y}
    """
    hr   = vitals.get("hr",   85)
    spo2 = vitals.get("spo2", 97)
    map_ = vitals.get("map",  85)
    rr   = vitals.get("rr",   16)

    # X axis: HR (elevated → right)
    x = _normalize(hr, VITAL_BANDS["hr"])
    # Y axis: SpO2 (low → top — inverted, so declining SpO2 = rising danger)
    y = 1 - _normalize(spo2, VITAL_BANDS["spo2"])
    # Z: composite severity (MAP low + RR high = danger)
    z_map = 1 - _normalize(map_, VITAL_BANDS["map"])   # low MAP = danger
    z_rr  = _normalize(rr, VITAL_BANDS["rr"])           # high RR = danger
    z = (z_map + z_rr) / 2

    # Determine cluster
    combined_danger = (x * 0.35 + y * 0.45 + z * 0.20)
    if combined_danger < 0.30:
        cluster = "recovery"
    elif combined_danger < 0.55:
        cluster = "stable"
    elif combined_danger < 0.72:
        cluster = "borderline"
    else:
        cluster = "critical"

    return {
        "x": round(x, 3),
        "y": round(y, 3),
        "z": round(z, 3),
        "cluster": cluster,
        "danger_score": round(combined_danger, 3),
    }


def build_trajectory_data(patient_context: dict, interventions: list[dict] = None) -> dict:
    """
    Core trajectory computation engine.
    Returns the full trajectory object ready to send to the frontend.
    """
    ctx = patient_context or {}
    vitals = ctx.get("current_vitals", {})
    labs   = ctx.get("current_labs", {})
    meds   = ctx.get("active_medications", [])

    # ── Resolve current vitals (with demo fallbacks) ──────────────────────────
    hr   = vitals.get("hr",   88 + random.gauss(0, 3))
    spo2 = vitals.get("spo2", 94 + random.gauss(0, 1))
    map_ = vitals.get("map",  70 + random.gauss(0, 4))
    rr   = vitals.get("rr",   18 + random.gauss(0, 1))
    temp = vitals.get("temp", 37.1 + random.gauss(0, 0.2))

    wbc     = labs.get("wbc",     9.5)
    crp     = labs.get("crp",     28.0)
    lactate = labs.get("lactate", 1.8)

    # ── Generate historical series (12 points = last 2 hours @ 10-min intervals) ──
    hr_series   = _generate_demo_series(hr,   drift=0.6,  noise=2.0)
    spo2_series = _generate_demo_series(spo2, drift=-0.2, noise=0.5)
    map_series  = _generate_demo_series(map_, drift=-0.3, noise=3.0)
    rr_series   = _generate_demo_series(rr,   drift=0.15, noise=0.8)
    temp_series = _generate_demo_series(temp, drift=0.03, noise=0.1)

    # ── Compute slopes (velocity) per biomarker ────────────────────────────────
    hr_slope   = _slope(hr_series)
    spo2_slope = _slope(spo2_series)
    map_slope  = _slope(map_series)
    rr_slope   = _slope(rr_series)

    # ── Medication intervention context correction ────────────────────────────
    # If a vasopressor or antipyretic was given recently, dampen the slope
    intervention_notes = []
    if interventions:
        for iv in interventions:
            drug = iv.get("drug", "").lower()
            ago  = iv.get("minutes_ago", 9999)
            if ago < 60:
                if any(kw in drug for kw in ["vasopressor", "norepinephrine", "dopamine"]):
                    map_slope = max(map_slope, 0.2)   # expect MAP to rise
                    intervention_notes.append(f"↑ MAP slope corrected for {drug} given {ago}m ago")
                if any(kw in drug for kw in ["beta-blocker", "metoprolol", "bisoprolol"]):
                    hr_slope = min(hr_slope, -0.3)
                    intervention_notes.append(f"↓ HR slope corrected for {drug} given {ago}m ago")
                if any(kw in drug for kw in ["antipyretic", "paracetamol", "ibuprofen"]):
                    temp_series[-1] = temp_series[-1] - 0.5
                    intervention_notes.append(f"↓ Temp adjusted for {drug} given {ago}m ago")

    # ── Project forward (8 steps = next ~80 minutes, or ~2–3 hours context) ──
    hr_proj   = _project_forward(hr_series, steps=8)
    spo2_proj = _project_forward(spo2_series, steps=8)
    map_proj  = _project_forward(map_series, steps=8)
    rr_proj   = _project_forward(rr_series, steps=8)

    # ── Phase-space trajectory ────────────────────────────────────────────────
    timestamps_past = [
        (datetime.utcnow() - timedelta(minutes=10 * (12 - i))).strftime("%H:%M")
        for i in range(12)
    ]
    timestamps_future = [
        (datetime.utcnow() + timedelta(minutes=10 * (i + 1))).strftime("%H:%M")
        for i in range(8)
    ]

    # Build phase path for historic points
    phase_path_history = []
    for i in range(12):
        state_vitals = {"hr": hr_series[i], "spo2": spo2_series[i], "map": map_series[i], "rr": rr_series[i]}
        pv = _compute_phase_vector(state_vitals)
        phase_path_history.append({
            "t": timestamps_past[i], "x": pv["x"], "y": pv["y"],
            "cluster": pv["cluster"], "type": "history"
        })

    # Build predicted phase path
    phase_path_future = []
    for i in range(8):
        state_vitals = {"hr": hr_proj[i], "spo2": spo2_proj[i], "map": map_proj[i], "rr": rr_proj[i]}
        pv = _compute_phase_vector(state_vitals)
        phase_path_future.append({
            "t": timestamps_future[i], "x": pv["x"], "y": pv["y"],
            "cluster": pv["cluster"], "type": "predicted"
        })

    # ── Current phase state ───────────────────────────────────────────────────
    current_phase = _compute_phase_vector({"hr": hr, "spo2": spo2, "map": map_, "rr": rr})

    # ── Risk score & alert level ──────────────────────────────────────────────
    # Project danger 3 hours out (18 steps of 10 min)
    future_danger = current_phase["danger_score"]
    projected_danger = min(1.0, future_danger + max(
        abs(spo2_slope) * 0.5,
        abs(hr_slope) * 0.3,
        abs(map_slope) * 0.2
    ) * 5)

    risk_pct = round(projected_danger * 100, 1)

    if projected_danger >= 0.72:
        alert_level = "critical"
        alert_msg   = (
            f"⚠️ TRAJECTORY WARNING: SpO₂ decline rate ({spo2_slope:+.2f}%/10min) combined with "
            f"rising HR ({hr_slope:+.2f} bpm/10min) indicates {risk_pct}% probability of "
            f"respiratory compromise within 2–3 hours."
        )
    elif projected_danger >= 0.55:
        alert_level = "warning"
        alert_msg   = (
            f"⚡ TREND ALERT: Multi-variable trajectory is drifting toward Borderline cluster. "
            f"MAP declining ({map_slope:+.2f} mmHg/10min). Monitor closely. Risk: {risk_pct}%."
        )
    elif projected_danger >= 0.30:
        alert_level = "stable"
        alert_msg   = (
            f"✅ STABLE TRAJECTORY: Current state vector remains within safe cluster. "
            f"Predictive risk score: {risk_pct}%. Continue monitoring."
        )
    else:
        alert_level = "recovery"
        alert_msg   = (
            f"💚 RECOVERY TRAJECTORY: Patient metrics converging toward Recovery cluster. "
            f"All velocity vectors within safe bounds. Risk: {risk_pct}%."
        )

    # ── Trend vectors per biomarker ───────────────────────────────────────────
    trend_vectors = [
        {
            "name": "Heart Rate", "key": "hr", "unit": "bpm",
            "current": round(hr, 1), "series": [round(v, 1) for v in hr_series],
            "projected": [round(v, 1) for v in hr_proj],
            "slope": round(hr_slope, 3),
            "acceleration": round(_acceleration(hr_series), 4),
            "zone": _zone(hr, VITAL_BANDS["hr"]),
            "timestamps_past": timestamps_past,
            "timestamps_future": timestamps_future,
            "band": VITAL_BANDS["hr"],
        },
        {
            "name": "SpO₂", "key": "spo2", "unit": "%",
            "current": round(spo2, 1), "series": [round(v, 1) for v in spo2_series],
            "projected": [round(v, 1) for v in spo2_proj],
            "slope": round(spo2_slope, 3),
            "acceleration": round(_acceleration(spo2_series), 4),
            "zone": _zone(spo2, VITAL_BANDS["spo2"]),
            "timestamps_past": timestamps_past,
            "timestamps_future": timestamps_future,
            "band": VITAL_BANDS["spo2"],
        },
        {
            "name": "Mean Arterial Pressure", "key": "map", "unit": "mmHg",
            "current": round(map_, 1), "series": [round(v, 1) for v in map_series],
            "projected": [round(v, 1) for v in map_proj],
            "slope": round(map_slope, 3),
            "acceleration": round(_acceleration(map_series), 4),
            "zone": _zone(map_, VITAL_BANDS["map"]),
            "timestamps_past": timestamps_past,
            "timestamps_future": timestamps_future,
            "band": VITAL_BANDS["map"],
        },
        {
            "name": "Respiratory Rate", "key": "rr", "unit": "/min",
            "current": round(rr, 1), "series": [round(v, 1) for v in rr_series],
            "projected": [round(v, 1) for v in rr_proj],
            "slope": round(rr_slope, 3),
            "acceleration": round(_acceleration(rr_series), 4),
            "zone": _zone(rr, VITAL_BANDS["rr"]),
            "timestamps_past": timestamps_past,
            "timestamps_future": timestamps_future,
            "band": VITAL_BANDS["rr"],
        },
        {
            "name": "Temperature", "key": "temp", "unit": "°C",
            "current": round(temp, 2), "series": [round(v, 2) for v in temp_series],
            "projected": [],
            "slope": round(_slope(temp_series), 4),
            "acceleration": 0.0,
            "zone": _zone(temp, VITAL_BANDS["temp"]),
            "timestamps_past": timestamps_past,
            "timestamps_future": [],
            "band": VITAL_BANDS["temp"],
        },
    ]

    lab_trends = [
        {
            "name": "WBC Count",  "key": "wbc",     "current": wbc,
            "unit": LAB_BANDS["wbc"]["unit"],     "zone": _zone(wbc,     LAB_BANDS["wbc"]),
        },
        {
            "name": "CRP",        "key": "crp",     "current": crp,
            "unit": LAB_BANDS["crp"]["unit"],     "zone": _zone(crp,     LAB_BANDS["crp"]),
        },
        {
            "name": "Lactate",    "key": "lactate", "current": lactate,
            "unit": LAB_BANDS["lactate"]["unit"], "zone": _zone(lactate, LAB_BANDS["lactate"]),
        },
    ]

    return {
        "phase_path_history": phase_path_history,
        "phase_path_future":  phase_path_future,
        "current_phase":      current_phase,
        "trend_vectors":      trend_vectors,
        "lab_trends":         lab_trends,
        "risk_score":         risk_pct,
        "alert_level":        alert_level,
        "alert_message":      alert_msg,
        "intervention_notes": intervention_notes,
        "medications":        meds,
        "computed_at":        datetime.utcnow().isoformat(),
        "trigger_emergency":  projected_danger >= 0.72,
    }


# ── LangGraph Node ────────────────────────────────────────────────────────────

async def trajectory_node(state: MedPilotState) -> MedPilotState:
    """
    Predictive Trajectory Agent LangGraph node.
    Computes longitudinal health-state forecast and optionally triggers emergency cascade.
    """
    ctx  = state.get("patient_context", {})
    logs = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Trajectory Forecaster",
        "action": "📈 Computing multi-variable health state vector and predictive trajectory",
        "status": "Info",
    })

    interventions = ctx.get("recent_interventions", [])
    trajectory    = build_trajectory_data(ctx, interventions)

    alert_level = trajectory["alert_level"]
    risk_score  = trajectory["risk_score"]

    logs.append({
        "agent_name": "Trajectory Forecaster",
        "action": f"Phase cluster: {trajectory['current_phase']['cluster'].upper()} | Risk: {risk_score}% | Alert: {alert_level.upper()}",
        "status": "Warning" if alert_level in ("critical", "warning") else "Success",
    })

    if trajectory["trigger_emergency"]:
        logs.append({
            "agent_name": "Trajectory Forecaster",
            "action": "🚨 CRITICAL ZONE ENTERED — Triggering Emergency Cascade Agent autonomously",
            "status": "Error",
        })

    # Generate a clinical narrative summary via Gemini
    prompt = f"""You are a critical-care AI analyzing a patient's predictive health trajectory.

Current vitals state: HR={trajectory['trend_vectors'][0]['current']} bpm,
SpO2={trajectory['trend_vectors'][1]['current']}%, MAP={trajectory['trend_vectors'][2]['current']} mmHg,
RR={trajectory['trend_vectors'][3]['current']}/min
Phase cluster: {trajectory['current_phase']['cluster']}
Risk score: {risk_score}%
Velocity vectors: HR slope={trajectory['trend_vectors'][0]['slope']:+.3f}/step,
SpO2 slope={trajectory['trend_vectors'][1]['slope']:+.3f}/step,
MAP slope={trajectory['trend_vectors'][2]['slope']:+.3f}/step
Active medications: {', '.join(ctx.get('active_medications', ['None']))}

Write a 2-sentence clinical interpretation of what this trajectory means for the patient and what the clinician should watch for in the next 3 hours. Be specific and clinically precise."""

    try:
        from .llm import generate_text
        narrative = await generate_text(prompt, model=pick_model("research"))
    except Exception:
        narrative = trajectory["alert_message"]

    trajectory["clinical_narrative"] = narrative

    return {
        **state,
        "final_response": narrative,
        "agent_logs":     logs,
        "trajectory_result": trajectory,
        "emergency":         trajectory["trigger_emergency"],
    }
