"""
MedPilot OS — Google Workspace MCP Server
Wraps Google Calendar API, Google Tasks API, and Gmail API.
Supports OAuth 2.0 token flow. Degrades gracefully to demo mode when not configured.
"""
import os
import json
import base64
import httpx
from datetime import datetime, timedelta
try:
    from fastmcp import FastMCP                  # FastMCP 2.x standalone package (preferred)
except ImportError:
    from mcp.server.fastmcp import FastMCP       # Fallback: bundled mcp[cli] package

mcp = FastMCP("MedPilot-Google-Workspace")

# NOTE: These are read fresh from os.environ on every call so the OAuth callback
# can set os.environ["GOOGLE_OAUTH_TOKEN_JSON"] and tokens work immediately.
def _get_client_id()     -> str: return os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
def _get_client_secret() -> str: return os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
def _get_token_json()    -> str: return os.getenv("GOOGLE_OAUTH_TOKEN_JSON", "")

# Google API base URLs
CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
TASKS_BASE    = "https://www.googleapis.com/tasks/v1"
GMAIL_BASE    = "https://gmail.googleapis.com/gmail/v1"
TOKEN_URL     = "https://oauth2.googleapis.com/token"

# ── Token management ──────────────────────────────────────────────────────────

def _load_token() -> dict | None:
    """Load OAuth token from env var (JSON string) — re-read every call so live updates work."""
    token_str = _get_token_json()
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

    # If token is still valid (has expiry > 5 min from now), return it
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
    client_id     = _get_client_id()
    client_secret = _get_client_secret()
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
    return bool(_get_token_json() and _load_token())


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
        description: Event description / notes
        start_datetime: ISO 8601 datetime (e.g. '2026-05-01T08:00:00+05:30')
        end_datetime: ISO 8601 datetime for event end
        recurrence: RFC 5545 recurrence rule (e.g. 'RRULE:FREQ=DAILY')
        calendar_id: Calendar ID (default: 'primary')

    Returns:
        Dict with keys: success, event_id, html_link, source
    """
    if not _is_configured():
        print(f"[Google Calendar Demo] Would create: '{title}' at {start_datetime}")
        return {
            "success": False,
            "event_id": None,
            "html_link": None,
            "source": "demo",
            "message": "Google Calendar not configured — event logged to console",
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
) -> list[dict]:
    """
    List upcoming Google Calendar events (medication reminders, appointments).

    Returns:
        List of dicts: title, start, end, description, event_id
    """
    if not _is_configured():
        # Return demo schedule
        today = datetime.now()
        return [
            {"title": "💊 Warfarin 5mg",    "start": str(today.replace(hour=8, minute=0)),  "source": "demo"},
            {"title": "💊 Metformin 500mg",  "start": str(today.replace(hour=13, minute=0)), "source": "demo"},
            {"title": "💊 Ashwagandha 300mg","start": str(today.replace(hour=21, minute=0)), "source": "demo"},
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
        due_date: ISO 8601 date (e.g. '2026-05-05T00:00:00.000Z')
        tasklist_id: Task list ID (default '@default')

    Returns:
        Dict with keys: success, task_id, title, source
    """
    if not _is_configured():
        print(f"[Google Tasks Demo] Would create task: '{title}' due {due_date}")
        return {
            "success":  False,
            "task_id":  None,
            "title":    title,
            "source":   "demo",
            "message":  "Google Tasks not configured — task logged to console",
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
async def list_health_tasks(tasklist_id: str = "@default") -> list[dict]:
    """
    List health tasks from Google Tasks.

    Returns:
        List of dicts: title, notes, due, completed, task_id
    """
    if not _is_configured():
        return [
            {"title": "INR recheck in 72 hours", "due": "", "completed": False, "source": "demo"},
            {"title": "Ashwagandha review appointment", "due": "", "completed": False, "source": "demo"},
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
        body_html: HTML email body
        from_name: Display name for sender

    Returns:
        Dict with keys: success, message_id, source
    """
    if not _is_configured():
        print(f"[Gmail Demo] Would send '{subject}' to {to_email}")
        return {
            "success":    False,
            "message_id": None,
            "source":     "demo",
            "message":    "Gmail not configured — email logged to console",
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
    """Return current Google Workspace authentication status."""
    token = _load_token()
    return {
        "configured":    bool(_get_client_id()),
        "authenticated": bool(token),
        "has_calendar":  bool(token),
        "has_tasks":     bool(token),
        "has_gmail":     bool(token),
        "source":        "google_oauth_live" if token else "demo",
    }


def get_oauth_url(redirect_uri: str) -> str:
    """Generate OAuth consent URL for first-time auth."""
    from urllib.parse import urlencode
    scopes = " ".join([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/tasks",
        "https://www.googleapis.com/auth/gmail.send",
    ])
    params = {
        "client_id":     _get_client_id(),
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         scopes,
        "access_type":   "offline",
        "prompt":        "consent",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


if __name__ == "__main__":
    mcp.run()
