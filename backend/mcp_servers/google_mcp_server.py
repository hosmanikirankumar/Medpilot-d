"""
MedPilot OS — Google Workspace FastMCP Server (Native MCP Protocol)

This is the PROPER FastMCP server that exposes Google Calendar, Tasks, and Gmail
as MCP-protocol tools discoverable by Gemini's native MCP integration.

Usage patterns:
  1. Native MCP (preferred):
     Used by generate_with_google_mcp() in llm.py via fastmcp.Client

  2. Direct import (in-process):
     from mcp_servers.google_mcp_server import (
         add_calendar_event, list_calendar_events, ...
     )
     Used by workspace_node in agents/workspace.py

Architecture note:
  This file (google_mcp_server.py) is the MCP PROTOCOL LAYER.
  mcp_servers/google_workspace_server.py is the HTTP/API WRAPPER LAYER.
  They share the same underlying Google API logic but serve different purposes.

Run standalone as MCP server (for MCP Inspector / external clients):
  python mcp_servers/google_mcp_server.py
"""
import os
import json
import base64
import httpx
from datetime import datetime, timedelta

# ── FastMCP 2.x import (standalone package, NOT mcp.server.fastmcp) ──────────
try:
    from fastmcp import FastMCP
    _FASTMCP_AVAILABLE = True
except ImportError:
    # Graceful degradation — tools still work as plain callables
    _FASTMCP_AVAILABLE = False
    print("[GoogleMCP] fastmcp package not installed — MCP server mode unavailable. "
          "Run: pip install fastmcp>=2.0.0")

    # Stub FastMCP class so the file can still be imported
    class FastMCP:
        def __init__(self, name): self.name = name
        def tool(self): return lambda f: f
        def run(self): pass

mcp = FastMCP("MedPilot-Google-Workspace-MCP")

# ── Configuration ─────────────────────────────────────────────────────────────
GOOGLE_OAUTH_CLIENT_ID     = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_TOKEN_JSON    = os.getenv("GOOGLE_OAUTH_TOKEN_JSON", "")

CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
TASKS_BASE    = "https://www.googleapis.com/tasks/v1"
GMAIL_BASE    = "https://gmail.googleapis.com/gmail/v1"
TOKEN_URL     = "https://oauth2.googleapis.com/token"


# ── Token management ──────────────────────────────────────────────────────────

def _load_token() -> dict | None:
    """Load OAuth token from env var (JSON string)."""
    token_str = os.getenv("GOOGLE_OAUTH_TOKEN_JSON", GOOGLE_OAUTH_TOKEN_JSON)
    if not token_str:
        return None
    try:
        return json.loads(token_str)
    except Exception:
        return None


async def _get_access_token() -> str | None:
    """Get a valid access token, refreshing if needed."""
    token_data = _load_token()
    if not token_data:
        return None

    # If token is still valid (expiry > 5 min from now), return it directly
    expiry_str = token_data.get("token_expiry", "")
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            if expiry > datetime.utcnow() + timedelta(minutes=5):
                return token_data.get("access_token")
        except Exception:
            pass

    # Refresh using refresh_token
    refresh_token = token_data.get("refresh_token")
    client_id     = os.getenv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_OAUTH_CLIENT_ID)
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", GOOGLE_OAUTH_CLIENT_SECRET)

    if not refresh_token or not client_id:
        return token_data.get("access_token")  # return stale, let caller handle 401

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(TOKEN_URL, data={
                "client_id":     client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type":    "refresh_token",
            })
            if resp.status_code == 200:
                new_data = resp.json()
                return new_data.get("access_token")
    except Exception:
        pass

    return token_data.get("access_token")


def _is_configured() -> bool:
    """Return True if Google OAuth is configured and a token is available."""
    return bool(os.getenv("GOOGLE_OAUTH_TOKEN_JSON", GOOGLE_OAUTH_TOKEN_JSON) and _load_token())


# ── Google Calendar Tools ─────────────────────────────────────────────────────

@mcp.tool()
async def add_calendar_event(
    title: str,
    description: str,
    start_datetime: str,
    end_datetime: str,
    recurrence: str = "",
    calendar_id: str = "primary",
) -> dict:
    """
    Add an event to Google Calendar (medication reminder, appointment, follow-up).

    Args:
        title: Event title (e.g. 'Take Warfarin 5mg')
        description: Event description / clinical notes
        start_datetime: ISO 8601 datetime (e.g. '2026-05-01T08:00:00+05:30')
        end_datetime: ISO 8601 datetime for event end
        recurrence: RFC 5545 recurrence rule (e.g. 'RRULE:FREQ=DAILY') or empty string
        calendar_id: Calendar ID (default: 'primary')

    Returns:
        Dict with keys: success, event_id, html_link, source
    """
    if not _is_configured():
        print(f"[Google Calendar Demo] Would create: '{title}' at {start_datetime}")
        return {
            "success":   False,
            "event_id":  f"DEMO-{title[:10].replace(' ','-')}",
            "html_link": None,
            "source":    "demo",
            "message":   f"Demo mode — event '{title}' scheduled at {start_datetime} (not persisted, Google OAuth not configured)",
        }

    token = await _get_access_token()
    if not token:
        return {"success": False, "source": "demo", "message": "Could not obtain access token"}

    event_body: dict = {
        "summary":     title,
        "description": description,
        "start":       {"dateTime": start_datetime, "timeZone": "Asia/Kolkata"},
        "end":         {"dateTime": end_datetime,   "timeZone": "Asia/Kolkata"},
    }
    if recurrence:
        event_body["recurrence"] = [recurrence]

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                f"{CALENDAR_BASE}/calendars/{calendar_id}/events",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=event_body,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success":   True,
                    "event_id":  data.get("id"),
                    "html_link": data.get("htmlLink"),
                    "source":    "google_calendar_live",
                }
            return {
                "success": False,
                "source":  "google_calendar_live",
                "message": f"Calendar API returned {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {"success": False, "source": "google_calendar_live", "message": str(e)}


@mcp.tool()
async def list_calendar_events(
    days_ahead: int = 7,
    calendar_id: str = "primary",
    max_results: int = 20,
) -> list:
    """
    List upcoming Google Calendar events (medication reminders, appointments).

    Args:
        days_ahead: Number of days ahead to look (default: 7)
        calendar_id: Calendar ID (default: 'primary')
        max_results: Maximum number of events to return (default: 20)

    Returns:
        List of event dicts with keys: title, start, end, description, event_id, source
    """
    if not _is_configured():
        today = datetime.now()
        return [
            {"title": "💊 Warfarin 5mg",     "start": str(today.replace(hour=8, minute=0)),  "end": str(today.replace(hour=8, minute=15)),  "source": "demo"},
            {"title": "💊 Metformin 500mg",   "start": str(today.replace(hour=13, minute=0)), "end": str(today.replace(hour=13, minute=15)), "source": "demo"},
            {"title": "💊 Ashwagandha 300mg", "start": str(today.replace(hour=21, minute=0)), "end": str(today.replace(hour=21, minute=15)), "source": "demo"},
            {"title": "🏥 INR Recheck",        "start": str((today + timedelta(days=3)).replace(hour=10, minute=0)), "end": str((today + timedelta(days=3)).replace(hour=11, minute=0)), "source": "demo"},
        ]

    token = await _get_access_token()
    if not token:
        return []

    time_min = datetime.utcnow().isoformat() + "Z"
    time_max = (datetime.utcnow() + timedelta(days=days_ahead)).isoformat() + "Z"

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.get(
                f"{CALENDAR_BASE}/calendars/{calendar_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "timeMin": time_min, "timeMax": time_max,
                    "maxResults": max_results, "singleEvents": "true",
                    "orderBy": "startTime",
                },
            )
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return [
                    {
                        "title":       item.get("summary", ""),
                        "start":       item.get("start", {}).get("dateTime", item.get("start", {}).get("date", "")),
                        "end":         item.get("end", {}).get("dateTime", ""),
                        "description": item.get("description", ""),
                        "event_id":    item.get("id", ""),
                        "html_link":   item.get("htmlLink", ""),
                        "source":      "google_calendar_live",
                    }
                    for item in items
                ]
    except Exception:
        pass
    return []


# ── Google Tasks Tools ────────────────────────────────────────────────────────

@mcp.tool()
async def add_health_task(
    title: str,
    notes: str = "",
    due_date: str = "",
    tasklist_id: str = "@default",
) -> dict:
    """
    Create a health task in Google Tasks.

    Args:
        title: Task title (e.g. 'Follow up INR test — due in 3 days')
        notes: Detailed notes about the task
        due_date: ISO 8601 date (e.g. '2026-05-05T00:00:00.000Z') or empty string
        tasklist_id: Task list ID (default '@default')

    Returns:
        Dict with keys: success, task_id, title, source
    """
    if not _is_configured():
        print(f"[Google Tasks Demo] Would create task: '{title}' due {due_date}")
        return {
            "success":  False,
            "task_id":  f"DEMO-TASK-{title[:10].replace(' ', '-')}",
            "title":    title,
            "source":   "demo",
            "message":  f"Demo mode — task '{title}' created (not persisted, Google OAuth not configured)",
        }

    token = await _get_access_token()
    if not token:
        return {"success": False, "source": "demo", "message": "Could not obtain access token"}

    task_body: dict = {"title": title}
    if notes:
        task_body["notes"] = notes
    if due_date:
        task_body["due"] = due_date

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                f"{TASKS_BASE}/lists/{tasklist_id}/tasks",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=task_body,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "success": True,
                    "task_id": data.get("id"),
                    "title":   data.get("title"),
                    "source":  "google_tasks_live",
                }
            return {
                "success": False,
                "source":  "google_tasks_live",
                "message": f"Tasks API returned {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {"success": False, "source": "google_tasks_live", "message": str(e)}


@mcp.tool()
async def list_health_tasks(tasklist_id: str = "@default") -> list:
    """
    List health tasks from Google Tasks.

    Args:
        tasklist_id: Task list ID (default '@default')

    Returns:
        List of task dicts with keys: title, notes, due, completed, task_id, source
    """
    if not _is_configured():
        return [
            {"title": "INR recheck in 72 hours", "due": "",  "completed": False, "notes": "Warfarin dose adjustment pending INR result", "source": "demo"},
            {"title": "Ashwagandha review appointment", "due": "", "completed": False, "notes": "Check for Warfarin interaction at next cardiology visit", "source": "demo"},
            {"title": "HbA1c follow-up test", "due": "", "completed": False, "notes": "Previous result 7.2% — recheck in 3 months", "source": "demo"},
        ]

    token = await _get_access_token()
    if not token:
        return []

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.get(
                f"{TASKS_BASE}/lists/{tasklist_id}/tasks",
                headers={"Authorization": f"Bearer {token}"},
                params={"showCompleted": "true", "maxResults": 50},
            )
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return [
                    {
                        "title":     item.get("title", ""),
                        "notes":     item.get("notes", ""),
                        "due":       item.get("due", ""),
                        "completed": item.get("status") == "completed",
                        "task_id":   item.get("id", ""),
                        "source":    "google_tasks_live",
                    }
                    for item in items
                ]
    except Exception:
        pass
    return []


# ── Gmail Tools ───────────────────────────────────────────────────────────────

@mcp.tool()
async def send_clinical_email(
    to_email: str,
    subject: str,
    body_html: str,
    from_name: str = "MedPilot OS",
) -> dict:
    """
    Send a clinical email via Gmail API (doctor brief, lab summary, SOS alert).

    Args:
        to_email: Recipient email address
        subject: Email subject line
        body_html: HTML email body content
        from_name: Display name for the sender (default: 'MedPilot OS')

    Returns:
        Dict with keys: success, message_id, source
    """
    if not _is_configured():
        print(f"[Gmail Demo] Would send '{subject}' to {to_email}")
        return {
            "success":    False,
            "message_id": None,
            "source":     "demo",
            "message":    f"Demo mode — email '{subject}' to {to_email} logged (not sent, Gmail not configured)",
        }

    token = await _get_access_token()
    if not token:
        return {"success": False, "source": "demo", "message": "Could not obtain access token"}

    # Build RFC 2822 message
    raw_message = (
        f"From: {from_name} <me>\r\n"
        f"To: {to_email}\r\n"
        f"Subject: {subject}\r\n"
        f"MIME-Version: 1.0\r\n"
        f"Content-Type: text/html; charset=utf-8\r\n"
        f"\r\n"
        f"{body_html}"
    )
    encoded = base64.urlsafe_b64encode(raw_message.encode("utf-8")).decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                f"{GMAIL_BASE}/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"raw": encoded},
            )
            if resp.status_code in (200, 201):
                return {
                    "success":    True,
                    "message_id": resp.json().get("id"),
                    "source":     "gmail_live",
                }
            return {
                "success": False,
                "source":  "gmail_live",
                "message": f"Gmail API returned {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {"success": False, "source": "gmail_live", "message": str(e)}


# ── Auth helpers ──────────────────────────────────────────────────────────────

def get_auth_status() -> dict:
    """Return current Google Workspace OAuth authentication status."""
    token = _load_token()
    return {
        "configured":    bool(os.getenv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_OAUTH_CLIENT_ID)),
        "authenticated": bool(token),
        "has_calendar":  bool(token),
        "has_tasks":     bool(token),
        "has_gmail":     bool(token),
        "source":        "google_oauth_live" if token else "demo",
        "fastmcp_available": _FASTMCP_AVAILABLE,
    }


def get_oauth_url(redirect_uri: str) -> str:
    """Generate OAuth consent URL for first-time Google Workspace auth."""
    from urllib.parse import urlencode
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_OAUTH_CLIENT_ID)
    if not client_id:
        return ""
    scopes = " ".join([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/tasks",
        "https://www.googleapis.com/auth/gmail.send",
    ])
    params = {
        "client_id":     client_id,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         scopes,
        "access_type":   "offline",
        "prompt":        "consent",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


if __name__ == "__main__":
    # Run as a standalone MCP server (for MCP Inspector testing)
    print("[GoogleMCP] Starting Google Workspace MCP server…")
    mcp.run()
