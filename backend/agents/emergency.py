"""
MedPilot OS — Emergency Cascade Agent
Handles EMERGENCY_VITALS intent: nearest hospital routing + WhatsApp SOS.
All external calls delegated to MCP servers (Maps + WhatsApp).
"""
from .state import MedPilotState
from .llm import generate_text

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.maps_server import find_nearest_hospital
from mcp_servers.whatsapp_server import send_sos_message
from .llm import generate_with_mcp_tools

EMERGENCY_SUMMARY_PROMPT = """
You are MedPilot OS Emergency Cascade agent.
A CRITICAL vitals alert has been received. 

Patient Context: {patient_context}
Query/Vitals: {raw_input}

Your job is to autonomously execute the emergency cascade:
1. Call `find_nearest_hospital` using the patient's coordinates to find an ICU.
2. Call `send_sos_message` to dispatch an alert to the emergency contact. Include the patient's vitals, the hospital name, and ETA.
3. Generate a brief (3-4 sentence) emergency action summary for the clinician dashboard.

You MUST call the tools above. Return ONLY the clinical summary text in your final response.
"""

async def emergency_cascade_node(state: MedPilotState) -> MedPilotState:
    ctx   = state.get("patient_context", {})
    query = state.get("raw_input", "")
    logs  = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Emergency Cascade",
        "action": "🚨 CRITICAL vitals detected — activating autonomous emergency cascade protocol",
        "status": "Warning"
    })

    prompt = EMERGENCY_SUMMARY_PROMPT.format(
        patient_context=str(ctx),
        raw_input=query,
    )
    
    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[find_nearest_hospital, send_sos_message],
        logs=logs
    )

    logs.append({
        "agent_name": "System",
        "action": "🔴 Emergency cascade complete — awaiting clinician acknowledgment",
        "status": "Warning"
    })

    return {
        **state,
        "emergency":        True,
        "emergency_result": {"active": True, "details": "Autonomously executed via MCP"},
        "final_response":   response,
        "agent_logs":       logs,
    }
