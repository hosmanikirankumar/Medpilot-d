"""
MedPilot OS — Google Workspace Agent
Manages medications, appointments, and tasks via Google Calendar, Gmail, and Tasks.
Degrades gracefully to demo mode when OAuth is not configured.

FIX: Removed duplicate workspace_node definition that caused the broken first
     copy to shadow the correct implementation. Imports are now at module level.
"""
from .state import MedPilotState
from .llm import generate_with_mcp_tools, pick_model
from mcp_servers.google_workspace_server import (
    add_calendar_event,
    list_calendar_events,
    add_health_task,
    list_health_tasks,
    send_clinical_email,
)
import json

WORKSPACE_PROMPT = """
You are MedPilot OS's Google Workspace Agent — a clinical scheduling assistant.

Patient context:
{patient_context}

User request: {raw_input}

Based on the patient's medications, conditions, and the user's request, execute the required workspace actions.
You have tools to:
- add_calendar_event: Add a calendar event (medication reminder, appointment, follow-up)
- list_calendar_events: List upcoming calendar events
- add_health_task: Create a health task (e.g. "INR recheck in 72 hours")
- list_health_tasks: List pending health tasks
- send_clinical_email: Send a clinical email to doctor or patient

For medication reminders, analyze: {medications}
For appointments, consider: {conditions}

Autonomously use the tools necessary to fulfill the request. Return a friendly markdown summary of what was scheduled or emailed.
If no Google OAuth is configured, explain what WOULD be scheduled (demo mode).
"""


async def workspace_node(state: MedPilotState) -> MedPilotState:
    """
    Google Workspace Agent LangGraph node:
    1. Parses user scheduling/task/email intent via Gemini
    2. Calls Google Workspace MCP tools (Calendar, Tasks, Gmail)
    3. Returns structured results + markdown summary
    """
    ctx   = state.get("patient_context", {})
    query = state.get("raw_input", "")
    logs  = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Google Workspace",
        "action": "📅 Delegating scheduling/task request to autonomous MCP Workspace Agent",
        "status": "Info"
    })

    meds       = ctx.get("active_medications", [])
    conditions = ctx.get("conditions", [])

    prompt = WORKSPACE_PROMPT.format(
        patient_context=json.dumps(ctx, default=str),
        raw_input=query,
        medications=", ".join(meds) if meds else "None listed",
        conditions=", ".join(conditions) if conditions else "None listed",
    )

    # Expose the Google Workspace MCP tools to Gemini for autonomous tool-calling
    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[
            add_calendar_event,
            list_calendar_events,
            add_health_task,
            list_health_tasks,
            send_clinical_email,
        ],
        model=pick_model("workspace"),
        logs=logs,
    )

    logs.append({
        "agent_name": "Google Workspace",
        "action": "✅ Workspace sync complete — calendar/tasks updated",
        "status": "Success",
    })

    return {
        **state,
        "final_response": response,
        "agent_logs":     logs,
        "workspace_result": {
            "summary":  response,
            "source":   "google_workspace_mcp",
        },
    }
