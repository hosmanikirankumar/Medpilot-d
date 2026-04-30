"""
MedPilot OS — Eligibility Agent (PM-JAY / ABHA / NHA ABDM Sandbox)
All NHA calls delegated to MCP NHA Server.
Prompt: "Parse the user's ABHA ID. Trigger the MCP NHA tool.
Extract the PM-JAY eligibility boolean and format a UI alert payload."
"""
from .state import MedPilotState
from .llm import generate_text

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.nha_server import (
    get_nha_token,
    search_abha,
    check_pmjay_eligibility,
)
from .llm import generate_with_mcp_tools

ELIGIBILITY_RESPONSE_PROMPT = """
You are the MedPilot OS PM-JAY Eligibility agent.

Patient context: {patient_context}
Query: {raw_input}

Your job is to autonomously execute the following sequence:
1. Call `get_nha_token` to get an OAuth token.
2. Call `search_abha` using the token and the patient's ABHA ID (default: '14-2948-3821-7710').
3. Call `check_pmjay_eligibility` using the token and the healthId returned from search_abha.

Generate a clear, friendly summary of the patient's coverage status.
Include:
- Scheme name and coverage limit in INR
- e-KYC / ABHA verification status
- Copay/deductible information
- Recommended next steps for the clinician
Format as a UI alert payload. Use markdown, keep under 250 words.
"""

async def eligibility_node(state: MedPilotState) -> MedPilotState:
    ctx     = state.get("patient_context", {})
    logs    = state.get("agent_logs", [])
    query   = state.get("raw_input", "")

    logs.append({
        "agent_name": "PM-JAY Eligibility",
        "action": f"🆔 Triggering autonomous NHA MCP integration",
        "status": "Info"
    })

    prompt = ELIGIBILITY_RESPONSE_PROMPT.format(
        patient_context=str(ctx),
        raw_input=query,
    )
    
    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[get_nha_token, search_abha, check_pmjay_eligibility],
        logs=logs
    )

    logs.append({
        "agent_name": "PM-JAY Eligibility",
        "action": "✅ Eligibility check complete",
        "status": "Success",
    })

    return {
        **state,
        "final_response":     response,
        "agent_logs":         logs,
    }
