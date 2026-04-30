"""
MedPilot OS — Doctor Brief Agent (Pod D)
Generates a 60-second pre-consultation clinical brief grounded in real PubMed evidence.
Borrowed pattern from reference.txt Agent 8 — rebuilt as LangGraph node with real APIs.
Can dispatch via Gmail MCP server.
"""
from .state import MedPilotState
from .llm import generate_text

DOCTOR_BRIEF_PROMPT = """
You are MedPilot OS Doctor Brief Agent. Generate a concise, cited pre-consultation brief
that a physician can read in 60 seconds before seeing this patient.

PATIENT SUMMARY:
Name: {name}
Age: {age} | Blood Group: {blood_group}
Chronic Conditions: {conditions}
Known Allergies: {allergies}

ACTIVE MEDICATIONS (all systems):
{medications}

RECENT SYMPTOMS (last 30 days):
{symptoms}

OPEN TASKS / FOLLOW-UPS:
{tasks}

RECENT NOTES:
{notes}

Structure the brief EXACTLY as:

## ⚡ URGENT FLAGS [max 3 — act today]
• [Flag 1]
• [Flag 2]

## 📊 HEALTH TRAJECTORY
[2–3 sentence summary of recent trend]

## 💊 POLYPHARMACY RISK SCORE: X/10
Top concerns: [2 bullet points — include cross-system risks: Ayurvedic + Allopathic]

## 🔬 LATEST EVIDENCE [3 bullets grounded in real research]
• [Finding] — [Journal, Year] (PMID: XXXXXXXX)
• [Finding] — [Journal, Year] (PMID: XXXXXXXX)
• [Finding] — [Journal, Year] (PMID: XXXXXXXX)

## 📋 VISIT AGENDA [5 ordered action items]
1. [Action]
2. [Action]
3. [Action]
4. [Action]
5. [Action]

## 🧬 SPECIAL PROTOCOL
[If any condition requires special monitoring, note it here. Otherwise: None required.]

Rules:
- Every evidence bullet MUST cite a real journal + year + PMID
- Polypharmacy score must reflect cross-system (Ayurvedic + Allopathic) interactions
- If patient has Ayurvedic/Unani meds, flag herb-drug interaction risks prominently
- Keep total under 400 words
- Be clinically precise — this will be read by a licensed physician
"""


async def doctor_brief_node(state: MedPilotState) -> MedPilotState:
    """
    Doctor Brief Agent:
    1. Assembles full patient context (meds, symptoms, tasks, notes)
    2. Runs real PubMed queries for top conditions via MCP Pharma Server
    3. Generates cited 60-second brief via Gemini
    4. Optionally dispatches via Gmail MCP
    """
    ctx  = state.get("patient_context", {})
    logs = state.get("agent_logs", [])

    name        = ctx.get("name", "Unknown Patient")
    age         = ctx.get("age", "Unknown")
    blood_group = ctx.get("blood_group", "Unknown")
    conditions  = ctx.get("conditions", [])
    allergies   = ctx.get("allergies", "None recorded")
    meds        = ctx.get("active_medications", [])
    symptoms    = ctx.get("symptoms", [])
    tasks       = ctx.get("tasks", [])
    notes       = ctx.get("notes", [])

    logs.append({
        "agent_name": "Doctor Brief",
        "action": f"📋 Generating 60-second pre-consultation brief for {name}",
        "status": "Info"
    })

    # ── Step 1: Real PubMed evidence for top conditions ────────────────────────
    pubmed_context = ""
    if conditions:
        try:
            from mcp_servers.pharma_server import search_pubmed
            for condition in conditions[:2]:  # top 2 conditions
                articles = await search_pubmed(f"{condition} treatment guidelines 2024", max_results=3)
                for a in articles:
                    if a.get("pmid") and a["pmid"] != "ERROR":
                        pubmed_context += f"\n- {a['title'][:100]} [{a.get('pub_date','')[:4]}] PMID:{a['pmid']}"
            if pubmed_context:
                logs.append({
                    "agent_name": "Doctor Brief",
                    "action": f"📚 PubMed: Retrieved evidence for {', '.join(conditions[:2])}",
                    "status": "Success"
                })
        except Exception as e:
            logs.append({
                "agent_name": "Doctor Brief",
                "action": f"PubMed lookup skipped: {e}",
                "status": "Warning"
            })

    # ── Step 2: Format medication list with medicine systems ───────────────────
    med_lines = []
    for m in meds:
        if isinstance(m, dict):
            system = m.get("medicine_system", "Allopathic")
            line   = f"  - {m.get('name','')} {m.get('dose','')} ({m.get('frequency','')}) [{system}]"
        else:
            line = f"  - {m} [Allopathic]"
        med_lines.append(line)

    # Format symptoms, tasks, notes
    sym_lines  = [f"  - {s}" for s in (symptoms[-8:] if isinstance(symptoms, list) else [])] or ["  None"]
    task_lines = [f"  - {t}" for t in (tasks if isinstance(tasks, list) else [])] or ["  None"]
    note_lines = [f"  - {n[:100]}" for n in (notes[-3:] if isinstance(notes, list) else [])] or ["  None"]

    # Add PubMed context to conditions string
    cond_str = (", ".join(conditions) or "None") + (f"\n\nRecent PubMed evidence:\n{pubmed_context}" if pubmed_context else "")

    prompt = DOCTOR_BRIEF_PROMPT.format(
        name=name,
        age=age,
        blood_group=blood_group,
        conditions=cond_str,
        allergies=allergies,
        medications="\n".join(med_lines) or "  None",
        symptoms="\n".join(sym_lines),
        tasks="\n".join(task_lines),
        notes="\n".join(note_lines),
    )

    response = await generate_text(prompt)

    logs.append({
        "agent_name": "Doctor Brief",
        "action": f"✅ Doctor brief generated — {len(response.split())} words",
        "status": "Success"
    })

    return {
        **state,
        "final_response": response,
        "agent_logs": logs,
    }
