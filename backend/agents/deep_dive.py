"""
MedPilot OS — Clinical Deep-Dive Agent (Pod D)
Uses Gemini 2.0 Flash (or Pro when available) to summarize dense specialist
reports (MRI, Pathology, Oncology, Neurology) for primary care physicians.
"""
from .state import MedPilotState
from .llm import generate_text

DEEP_DIVE_PROMPT = """
You are MedPilot OS — Clinical Deep-Dive Agent.
You are assisting a PRIMARY CARE PHYSICIAN who has received a complex specialist report.
Your role: extract the bottom-line clinical insights in plain language they can act on.

Patient context:
{patient_context}

Specialist Report / Dense Clinical Text:
{report_text}

Report type (if known): {report_type}

Provide a structured clinical summary with these sections:
1. **Key Finding** (1-2 sentences — the most important takeaway)
2. **Supporting Details** (what evidence/measurements support it)
3. **Red Flags** (anything requiring urgent action)
4. **Recommended Next Steps** (for primary care follow-up)
5. **Terms Explained** (define any specialist jargon in plain English)

Keep total length under 400 words. Use markdown. Be precise and safety-first.
Cite measurement values exactly as stated in the report.
"""

REPORT_TYPE_DETECTION_PROMPT = """
Read this medical text and classify its report type in 2-3 words:
Examples: "MRI Brain", "Histopathology Report", "Echocardiography", "CBC Report", "CT Abdomen", "Nerve Conduction Study"

Text:
{text}

Return ONLY the report type string, nothing else.
"""


async def deep_dive_node(state: MedPilotState) -> MedPilotState:
    """
    Clinical Deep-Dive Agent:
    Detects report type, then generates a plain-language clinical summary
    for a primary care physician from dense specialist output.
    """
    ctx        = state.get("patient_context", {})
    raw_input  = state.get("raw_input", "")
    logs       = state.get("agent_logs", [])

    # ── Step 1: Detect report type ────────────────────────────────────────────
    # Use heuristic first (fast + no LLM cost), LLM only as fallback
    report_keywords = [
        ("MRI", ["mri", "magnetic resonance"]),
        ("CT Scan", ["ct scan", "computed tomography", "ct abdomen", "ct chest", "ct brain"]),
        ("Histopathology", ["histopathology", "biopsy", "pathology", "tissue", "carcinoma", "adenocarcinoma"]),
        ("Echocardiography", ["echocardiography", "echo", "ejection fraction", "lvef"]),
        ("CBC Report", ["complete blood count", "cbc", "haemoglobin", "hemoglobin", "wbc", "platelet"]),
        ("Nerve Conduction Study", ["nerve conduction", "emg", "electromyography", "ncs"]),
        ("Oncology Report", ["oncology", "chemotherapy", "staging", "tnm", "metastasis"]),
        ("Radiology Report", ["radiology", "x-ray", "chest pa", "opacity", "consolidation"]),
    ]
    text_lower  = raw_input.lower()
    report_type = "Clinical Report"  # default
    for rtype, keywords in report_keywords:
        if any(kw in text_lower for kw in keywords):
            report_type = rtype
            break

    logs.append({
        "agent_name": "Clinical Deep-Dive",
        "action": f"📋 Report type detected: {report_type} — initiating deep analysis",
        "status": "Info"
    })

    # ── Step 2: Generate summary ──────────────────────────────────────────────
    prompt = DEEP_DIVE_PROMPT.format(
        patient_context=str(ctx) if ctx else "No patient context provided",
        report_text=raw_input,
        report_type=report_type,
    )
    response = await generate_text(prompt)

    logs.append({
        "agent_name": "Clinical Deep-Dive",
        "action": f"✅ {report_type} summarized — key findings extracted for primary care review",
        "status": "Success"
    })

    return {
        **state,
        "clinical_response": response,
        "final_response":    response,
        "agent_logs":        logs,
        "report_type":       report_type,
    }
