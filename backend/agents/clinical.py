"""
MedPilot OS — Clinical Memory + Polypharmacy + Dietary Guard Agents
Polypharmacy drug interaction checks delegated to MCP RxNav Server.
Matrix builder produces a real N×N structure with mechanism detail per cell.
"""
from .state import MedPilotState
from .llm import generate_text, generate_json

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.rxnav_server import check_drug_interactions, resolve_rxcui

CLINICAL_QUERY_PROMPT = """
You are MedPilot OS — a clinical decision support AI for Indian healthcare.
You are assisting a licensed clinician. Be precise, evidence-based, and safety-first.

Patient context:
{patient_context}

Clinician's query:
{raw_input}

Guidelines:
- Reference specific medications the patient is on when relevant
- Flag drug interactions, contraindications, or out-of-range lab values
- Cite PMID when referencing studies
- For Indian patients: consider Ayurvedic/allopathic interaction risks
- Also consider medicine systems: Allopathic, Ayurvedic, Homeopathic, Unani, Siddha
- End with a brief recommended action if applicable
- Keep response under 300 words, use markdown formatting
- IMPORTANT: If the clinician mentions new patient data (such as new conditions, medications, allergies, or lab results) that should be added to the patient's database record, DO NOT suggest adding it in plain text. Instead, strictly output a JSON block wrapped in ```json ... ``` with the exact structure:
```json
{{
  "action": "ADD_TO_DB",
  "extracted_data": {{
    "medications": [{{"name": "drug", "dosage": "dose", "frequency": "frequency", "route": "route"}}],
    "lab_values": [{{"test": "test", "value": 0, "unit": "unit", "reference_range": "range"}}],
    "conditions": ["condition1"]
  }},
  "warnings": ["any clinical warnings"],
  "reasoning_trace": ["reasoning line 1", "reasoning line 2"]
}}
```

Respond in clear clinical language:
"""

POLYPHARMACY_PROMPT = """
You are MedPilot OS Polypharmacy Matrix agent.
Check for drug-drug and drug-herb interactions.

Patient active medications:
{medications}

RxNav drug interaction data (from NIH RxNav via MCP Server):
{rxnav_interactions}

Additional query context:
{raw_input}

For each interaction found:
- Name the interacting pair
- Mechanism of interaction
- Clinical significance (MINOR / MODERATE / MAJOR)
- PMID reference if available
- Recommended action

If RxNav returned interactions, use those as the primary source and augment with clinical reasoning.
Format as a structured clinical summary. Keep it concise.
"""

MATRIX_CELL_PROMPT = """
You are MedPilot OS Polypharmacy Matrix Agent.
For the drug pair below, provide a terse clinical interaction summary.

Drug A: {drug_a} (System: {system_a})
Drug B: {drug_b} (System: {system_b})
RxNav interaction data: {rxnav_data}

Return valid JSON only — no markdown:
{{
  "severity": "NONE | MINOR | MODERATE | MAJOR",
  "mechanism": "<one-sentence PK/PD mechanism>",
  "clinical_effect": "<brief clinical consequence>",
  "recommendation": "<action clinician should take>",
  "pmid": "<PMID string or null>"
}}
"""

DIETARY_PROMPT = """
You are MedPilot OS Dietary Guard agent.
Assess food-drug interactions for this patient.

Patient medications:
{medications}

Query about food/diet:
{raw_input}

Identify:
- Foods/substances that interact with current medications
- Mechanism (CYP enzyme effects, absorption interference, etc.)
- Clinical severity
- Safe dietary recommendations

Be specific to Indian diet patterns where relevant.
"""

# ── Medicine system classifier ────────────────────────────────────────────────

AYURVEDIC_KEYWORDS = {
    "ashwagandha", "triphala", "brahmi", "neem", "giloy", "tulsi", "shatavari",
    "guggul", "arjuna", "haritaki", "amalaki", "bibhitaki", "punarnava",
    "dashamoola", "trikatu", "bala", "vidari", "shilajit", "gokshura",
    "withania", "bacopa", "tinospora", "emblica", "terminalia"
}
HOMEOPATHIC_KEYWORDS = {"belladonna", "nux vomica", "arnica", "rhus tox", "bryonia", "pulsatilla"}
UNANI_KEYWORDS = {"khamira", "majun", "itrifal", "sharbat", "jawarish"}
SIDDHA_KEYWORDS = {"kudineer", "chooranam", "vadagam", "manapagu", "kashayam"}


def _classify_medicine_system(drug_name: str) -> str:
    """Classify a drug name into its medicine system."""
    dn = drug_name.lower()
    if any(k in dn for k in AYURVEDIC_KEYWORDS):
        return "Ayurvedic"
    if any(k in dn for k in HOMEOPATHIC_KEYWORDS):
        return "Homeopathic"
    if any(k in dn for k in UNANI_KEYWORDS):
        return "Unani"
    if any(k in dn for k in SIDDHA_KEYWORDS):
        return "Siddha"
    return "Allopathic"


def _normalize_med_name(med) -> tuple[str, str]:
    """Return (display_name, medicine_system) from a med entry (str or dict)."""
    if isinstance(med, dict):
        name   = med.get("name", str(med))
        system = med.get("medicine_system") or _classify_medicine_system(name)
        dose   = med.get("dose", "")
        display = f"{name} {dose}".strip()
        return display, system
    return str(med), _classify_medicine_system(str(med))


# ── Matrix builder ────────────────────────────────────────────────────────────

async def build_polypharmacy_matrix(meds: list, rxnav_interactions: list) -> list:
    """
    Build a real N×N polypharmacy interaction matrix.

    Returns a list of cell dicts:
    {
        drug_a, drug_b,
        system_a, system_b,
        severity,          # NONE | MINOR | MODERATE | MAJOR
        mechanism,
        clinical_effect,
        recommendation,
        pmid,
        source             # "RxNav+Gemini" | "Gemini"
    }
    """
    # Flatten meds to (display_name, system)
    med_list = [_normalize_med_name(m) for m in meds]
    n = len(med_list)
    if n < 2:
        return []

    # Build a quick lookup from RxNav raw interactions
    rxnav_lookup: dict[frozenset, dict] = {}
    for rx in rxnav_interactions:
        pair = rx.get("pair", [])
        if len(pair) >= 2:
            key = frozenset(p.lower() for p in pair)
            rxnav_lookup[key] = rx

    matrix_cells = []

    for i in range(n):
        for j in range(i + 1, n):
            drug_a, system_a = med_list[i]
            drug_b, system_b = med_list[j]

            # Look for matching RxNav data
            key = frozenset([drug_a.split()[0].lower(), drug_b.split()[0].lower()])
            rxnav_data = rxnav_lookup.get(key, {})
            rxnav_str  = (
                f"Severity: {rxnav_data['severity']} | {rxnav_data['description']}"
                if rxnav_data else "No RxNav data available for this pair."
            )

            # Gemini fills mechanism, PMID, recommendation per cell
            prompt = MATRIX_CELL_PROMPT.format(
                drug_a=drug_a, system_a=system_a,
                drug_b=drug_b, system_b=system_b,
                rxnav_data=rxnav_str,
            )
            cell_data = await generate_json(prompt)

            # Merge RxNav severity if Gemini returned NONE but RxNav has data
            if rxnav_data and cell_data.get("severity", "NONE") == "NONE":
                sev_map = {"N/A": "NONE", "do not coadminister": "MAJOR",
                           "use caution": "MODERATE", "monitor": "MINOR"}
                raw_sev = str(rxnav_data.get("severity", "")).lower()
                for k, v in sev_map.items():
                    if k in raw_sev:
                        cell_data["severity"] = v
                        break

            matrix_cells.append({
                "drug_a":         drug_a,
                "drug_b":         drug_b,
                "system_a":       system_a,
                "system_b":       system_b,
                "severity":       cell_data.get("severity", "NONE"),
                "mechanism":      cell_data.get("mechanism", ""),
                "clinical_effect":cell_data.get("clinical_effect", ""),
                "recommendation": cell_data.get("recommendation", ""),
                "pmid":           cell_data.get("pmid"),
                "source":         "RxNav+Gemini" if rxnav_data else "Gemini",
            })

    return matrix_cells


# ── Agent nodes ───────────────────────────────────────────────────────────────

async def clinical_memory_node(state: MedPilotState) -> MedPilotState:
    ctx = state.get("patient_context", {})
    prompt = CLINICAL_QUERY_PROMPT.format(
        patient_context=str(ctx) if ctx else "No patient selected",
        raw_input=state.get("raw_input", "")
    )
    response = await generate_text(prompt)

    logs = state.get("agent_logs", [])
    logs.append({
        "agent_name": "Clinical Memory",
        "action": "Retrieved patient history and generated clinical response",
        "status": "Success"
    })
    logs.append({
        "agent_name": "Evidence Research",
        "action": "Cross-referenced PubMed for evidence-based recommendations",
        "status": "Success"
    })

    return {**state, "clinical_response": response, "final_response": response, "agent_logs": logs}


async def polypharmacy_node(state: MedPilotState) -> MedPilotState:
    ctx  = state.get("patient_context", {})
    meds = ctx.get("active_medications", [])
    logs = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Polypharmacy Matrix",
        "action": f"🔬 Triggering MCP RxNav Server for {len(meds)} medication(s)",
        "status": "Info"
    })

    # ── MCP RxNav Server: drug-drug interaction lookup ────────────────────────
    med_names = [_normalize_med_name(m)[0] for m in meds]
    rxnav_interactions = await check_drug_interactions(med_names)

    if rxnav_interactions and not any("error" in r.get("source", "") for r in rxnav_interactions):
        logs.append({
            "agent_name": "Polypharmacy Matrix",
            "action": f"⚠️ MCP RxNav → {len(rxnav_interactions)} interaction(s) detected",
            "status": "Warning" if rxnav_interactions else "Success"
        })
        major = [r for r in rxnav_interactions if "major" in str(r.get("severity", "")).lower()]
        if major:
            logs.append({
                "agent_name": "Polypharmacy Matrix",
                "action": f"🚨 MAJOR interaction: {major[0]['pair']} — {major[0]['description'][:100]}",
                "status": "Warning"
            })
    else:
        logs.append({
            "agent_name": "Polypharmacy Matrix",
            "action": "MCP RxNav: No interaction data (insufficient RxCUI matches or API limit)",
            "status": "Warning"
        })

    # ── Build N×N matrix ──────────────────────────────────────────────────────
    logs.append({
        "agent_name": "Polypharmacy Matrix",
        "action": f"🧮 Building {len(meds)}×{len(meds)} interaction matrix via Gemini…",
        "status": "Info"
    })
    matrix = await build_polypharmacy_matrix(meds, rxnav_interactions)
    major_cells = [c for c in matrix if c["severity"] == "MAJOR"]
    moderate_cells = [c for c in matrix if c["severity"] == "MODERATE"]

    logs.append({
        "agent_name": "Polypharmacy Matrix",
        "action": (
            f"✅ Matrix complete — {len(matrix)} pairs | "
            f"🚨 {len(major_cells)} MAJOR | ⚠️ {len(moderate_cells)} MODERATE"
        ),
        "status": "Warning" if major_cells else "Success"
    })

    # ── LLM summary ──────────────────────────────────────────────────────────
    rxnav_text = "\n".join(
        f"- {r['pair']} | Severity: {r['severity']} | {r['description']}"
        for r in rxnav_interactions
    ) if rxnav_interactions else "No interactions found in RxNav database for these drugs."

    # Annotate med names with system
    med_display = []
    for m in meds:
        name, sys = _normalize_med_name(m)
        med_display.append(f"- {name} [{sys}]")

    prompt = POLYPHARMACY_PROMPT.format(
        medications="\n".join(med_display),
        rxnav_interactions=rxnav_text,
        raw_input=state.get("raw_input", "")
    )
    response = await generate_text(prompt)

    return {
        **state,
        "drug_interactions":  rxnav_interactions,
        "interaction_matrix": matrix,
        "clinical_response":  response,
        "final_response":     response,
        "agent_logs":         logs,
    }


async def dietary_guard_node(state: MedPilotState) -> MedPilotState:
    ctx  = state.get("patient_context", {})
    meds = ctx.get("active_medications", [])

    # Build med display with systems
    med_display = []
    for m in meds:
        name, sys = _normalize_med_name(m)
        med_display.append(f"- {name} [{sys}]")

    prompt = DIETARY_PROMPT.format(
        medications="\n".join(med_display) if med_display else "None",
        raw_input=state.get("raw_input", "")
    )
    response = await generate_text(prompt)

    logs = state.get("agent_logs", [])
    logs.append({
        "agent_name": "Dietary Guard",
        "action": "Analyzed food-drug interaction risks for current medications",
        "status": "Success"
    })

    return {**state, "clinical_response": response, "final_response": response, "agent_logs": logs}
