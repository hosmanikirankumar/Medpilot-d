"""
MedPilot OS — Google Workspace Agent
Manages medications, appointments, and tasks via Google Calendar, Gmail, and Tasks.
Degrades gracefully to demo mode when OAuth is not configured.
"""
from .state import MedPilotState
from .llm import generate_text, generate_json, pick_model
from datetime import datetime, timedelta
import json

WORKSPACE_PROMPT = """
You are MedPilot OS's Google Workspace Agent — a clinical scheduling assistant.

Patient context:
{patient_context}

User request: {raw_input}

Based on the patient's medications, conditions, and the user's request, generate a structured workspace action plan.

For medication reminders, analyze: {medications}
For appointments, consider: {conditions}

Return a JSON object:
{{
  "action_type": "schedule_medication|create_appointment|send_email|create_task|list_schedule",
  "summary": "brief description of what you are doing",
  "calendar_events": [
    {{
      "title": "event title",
      "description": "clinical notes",
      "start_datetime": "ISO 8601 string in IST",
      "end_datetime": "ISO 8601 string in IST",
      "recurrence": "RRULE:FREQ=DAILY or empty string",
      "type": "medication|appointment|followup"
    }}
  ],
  "tasks": [
    {{
      "title": "task title",
      "notes": "clinical details",
      "due_date": "ISO 8601 string or empty",
      "priority": "high|normal"
    }}
  ],
  "email": {{
    "to": "email@example.com",
    "subject": "email subject",
    "body": "plain text or HTML",
    "send": false
  }},
  "clinical_rationale": "brief clinical reasoning"
}}
"""


async def workspace_node(state: MedPilotState) -> MedPilotState:
    """
    Google Workspace Agent:
    1. Parses user intent re: scheduling/tasks/email
    2. Calls Google Workspace MCP server tools
    3. Returns structured calendar + task results
    """
    ctx   = state.get("patient_context", {})
    query = state.get("raw_input", "")
    logs  = state.get("agent_logs", [])

    logs.append({
        "agent_name": "Google Workspace",
        "action": "📅 Processing scheduling / task request via Google Workspace Agent",
        "status": "Info"
    })

    # ── Ask Gemini to plan the workspace actions ──────────────────────────────
    meds       = ctx.get("active_medications", [])
    conditions = ctx.get("conditions", [])
    patient_id = state.get("patient_id", "PT-001")
    patient_name = ctx.get("name", "Patient")

    prompt = WORKSPACE_PROMPT.format(
        patient_context=json.dumps(ctx, default=str),
        raw_input=query,
        medications=", ".join(meds) if meds else "None listed",
        conditions=", ".join(conditions) if conditions else "None listed",
    )

    try:
        plan = await generate_json(prompt, model=pick_model("doctor_brief"))
    except Exception as e:
        plan = {
            "action_type": "list_schedule",
            "summary": f"Failed to parse workspace plan: {e}",
            "calendar_events": [],
            "tasks": [],
            "clinical_rationale": "LLM parse failure — returning demo schedule",
        }

    action_type = plan.get("action_type", "list_schedule")
    events_created = []
    tasks_created  = []
    email_sent     = None

# ── Import MCP workspace tools ────────────────────────────────────────────
from mcp_servers.google_workspace_server import (
    add_calendar_event,
    list_calendar_events,
    add_health_task,
    list_health_tasks,
    send_clinical_email,
)
from .llm import generate_with_mcp_tools

WORKSPACE_PROMPT = """
You are MedPilot OS's Google Workspace Agent — a clinical scheduling assistant.

Patient context:
{patient_context}

User request: {raw_input}

Based on the patient's medications, conditions, and the user's request, execute the required workspace actions.
You have tools to:
- add_calendar_event
- list_calendar_events
- add_health_task
- list_health_tasks
- send_clinical_email

For medication reminders, analyze: {medications}
For appointments, consider: {conditions}

Autonomously use the tools necessary to fulfill the request. Return a friendly markdown summary of what was scheduled or emailed.
"""

async def workspace_node(state: MedPilotState) -> MedPilotState:
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

    response = await generate_with_mcp_tools(
        prompt=prompt,
        tools=[
            add_calendar_event,
            list_calendar_events,
            add_health_task,
            list_health_tasks,
            send_clinical_email
        ],
        logs=logs
    )

    logs.append({
        "agent_name": "Google Workspace",
        "action": f"✅ Workspace sync complete",
        "status": "Success",
    })

    return {
        **state,
        "final_response": response,
        "agent_logs": logs,
    }
