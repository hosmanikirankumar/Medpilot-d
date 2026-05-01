"""
MedPilot OS — WhatsApp Business MCP Server
Wraps Meta Graph API for WhatsApp Business message dispatch.
Used by the Emergency Cascade agent for SOS alerts.
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MedPilot-WhatsApp")

WA_TOKEN    = os.getenv("WHATSAPP_BUSINESS_TOKEN", "")
WA_PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WA_API_BASE = "https://graph.facebook.com/v19.0"


@mcp.tool()
async def send_sos_message(to_number: str, message_body: str) -> dict:
    """
    Send an emergency SOS message via WhatsApp Business API.

    Args:
        to_number: Recipient phone number (E.164 format, e.g. '+919845000000')
        message_body: Full text body of the SOS alert message

    Returns:
        Dict with keys: sent (bool), message_id (str or None), source
    """
    if not WA_TOKEN or not WA_PHONE_ID:
        print("--- WHATSAPP SOS PAYLOAD (No credentials configured) ---")
        print(f"To: {to_number}")
        print(message_body)
        print("--------------------------------------------------------")
        return {
            "sent": False,
            "message_id": None,
            "source": "demo",
            "message": "WhatsApp credentials not configured — SOS logged to console",
        }

    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.post(
                f"{WA_API_BASE}/{WA_PHONE_ID}/messages",
                headers={"Authorization": f"Bearer {WA_TOKEN}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": to_number,
                    "type": "text",
                    "text": {"body": message_body},
                },
            )
            if resp.status_code in (200, 201):
                msg_id = resp.json().get("messages", [{}])[0].get("id")
                return {
                    "sent": True,
                    "message_id": msg_id,
                    "source": "whatsapp_live",
                    "message": f"SOS dispatched to {to_number}",
                }
            return {
                "sent": False,
                "message_id": None,
                "source": "whatsapp_live",
                "message": f"WhatsApp API returned {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as e:
        return {
            "sent": False,
            "message_id": None,
            "source": "whatsapp_live",
            "message": f"WhatsApp dispatch failed: {e}",
        }


@mcp.tool()
async def send_template_message(
    to_number: str,
    template_name: str,
    language_code: str = "en_US",
    parameters: list[str] | None = None,
) -> dict:
    """
    Send a pre-approved WhatsApp message template (e.g. SOS with Quick Reply).

    Args:
        to_number: Recipient phone number (E.164 format)
        template_name: Approved template name in Meta Business Manager
        language_code: Template language code (default 'en_US')
        parameters: Optional list of template parameter values

    Returns:
        Dict with keys: sent, message_id, source
    """
    if not WA_TOKEN or not WA_PHONE_ID:
        return {"sent": False, "message_id": None, "source": "demo",
                "message": "WhatsApp credentials not configured"}

    components = []
    if parameters:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": p} for p in parameters],
        })

    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.post(
                f"{WA_API_BASE}/{WA_PHONE_ID}/messages",
                headers={"Authorization": f"Bearer {WA_TOKEN}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": to_number,
                    "type": "template",
                    "template": {
                        "name": template_name,
                        "language": {"code": language_code},
                        "components": components,
                    },
                },
            )
            if resp.status_code in (200, 201):
                msg_id = resp.json().get("messages", [{}])[0].get("id")
                return {"sent": True, "message_id": msg_id, "source": "whatsapp_live"}
            return {"sent": False, "message_id": None, "source": "whatsapp_live",
                    "message": f"Template send returned {resp.status_code}"}
    except Exception as e:
        return {"sent": False, "message_id": None, "source": "whatsapp_live",
                "message": f"Template dispatch failed: {e}"}


if __name__ == "__main__":
    mcp.run()
