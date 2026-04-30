"""
MedPilot OS — Logistics & Routing Agent
Delegates all Google Maps calls to the MCP Maps Server.
"""
from .state import MedPilotState

# ── MCP Tool imports (in-process) ─────────────────────────────────────────────
from mcp_servers.maps_server import (
    find_nearest_hospital,
    get_multiple_hospitals,
)
from .llm import generate_with_mcp_tools

LOGISTICS_PROMPT = """
You are MedPilot OS Logistics & Routing Agent.
A request has been made to find nearby hospitals.

Patient Context: {patient_context}
Query: {raw_input}

Your job is to autonomously call `get_multiple_hospitals` using the patient's coordinates.
CRITICAL: Ensure you pass `max_results=20` to the tool so we fetch ALL nearby hospitals from the Google Maps API for the live map, rather than just a few.
Return a brief summary of the top hospitals found and their ETAs.
"""

# ── LangGraph node ────────────────────────────────────────────────────────────

async def logistics_node(state: MedPilotState) -> MedPilotState:
    ctx  = state.get("patient_context", {})
    query = state.get("raw_input", "")
    logs = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Logistics & Routing",
        "action": f"📍 Activating autonomous Logistics MCP integration",
        "status": "Info"
    })

    prompt = LOGISTICS_PROMPT.format(
        patient_context=str(ctx),
        raw_input=query
    )
    
    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[get_multiple_hospitals],
        logs=logs
    )

    return {
        **state,
        "final_response": response,
        "agent_logs":     logs,
    }
