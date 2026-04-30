"""
MedPilot OS — Evidence & Research Agent (Pod D)
All PubMed and OpenFDA calls delegated to MCP Pharma Server.
Every diagnostic suggestion includes a valid PMID or DOI link.
"""
from .state import MedPilotState
from .llm import generate_text

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.pharma_server import search_pubmed, query_openfda_adverse_events
from .llm import generate_with_mcp_tools

EVIDENCE_SYNTHESIS_PROMPT = """
You are MedPilot OS — Evidence & Research Agent.
Your task is to synthesize peer-reviewed literature and regulatory data into a grounded clinical summary.

Clinical query: {query}
Patient context: {patient_context}
Medications: {medications}

Your job is to autonomously:
1. Call `search_pubmed` to find recent literature.
2. Call `query_openfda_adverse_events` for any active medications to check for boxed warnings or AEs.

Rules:
- Every clinical claim MUST cite a PMID (format: PMID: XXXXXXXX) or DOI
- Flag any FDA black-box warnings or major adverse events
- Summarize key evidence quality (RCT, meta-analysis, case series, etc.)
- Keep response under 350 words, use markdown
"""

async def research_node(state: MedPilotState) -> MedPilotState:
    ctx   = state.get("patient_context", {})
    query = state.get("raw_input", "")
    meds  = ctx.get("active_medications", [])
    logs  = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Evidence & Research",
        "action": f"🔬 Triggering autonomous MCP Pharma Server (PubMed + OpenFDA)",
        "status": "Info"
    })

    prompt = EVIDENCE_SYNTHESIS_PROMPT.format(
        query=query,
        patient_context=str(ctx) if ctx else "None",
        medications=", ".join(meds) if meds else "None",
    )
    
    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[search_pubmed, query_openfda_adverse_events],
        logs=logs
    )

    logs.append({
        "agent_name": "Evidence & Research",
        "action": f"✅ Evidence synthesis complete",
        "status": "Success"
    })

    return {
        **state,
        "clinical_response":  response,
        "final_response":     response,
        "agent_logs":         logs,
    }
