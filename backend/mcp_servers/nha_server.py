"""
MedPilot OS — NHA ABDM MCP Server
Wraps the National Health Authority ABDM Sandbox APIs:
  - OAuth 2.0 session token
  - ABHA profile lookup
  - PM-JAY beneficiary eligibility check
Degrades gracefully to demo mode when sandbox credentials are absent.
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MedPilot-NHA")

NHA_CLIENT_ID     = os.getenv("NHA_SANDBOX_CLIENT_ID", "")
NHA_CLIENT_SECRET = os.getenv("NHA_SANDBOX_CLIENT_SECRET", "")

NHA_BASE            = "https://sandbox.abdm.gov.in"
NHA_TOKEN_URL       = f"{NHA_BASE}/api/v1/sessions"
NHA_ABHA_URL        = f"{NHA_BASE}/api/v1/search/abha"
NHA_BENEFICIARY_URL = f"{NHA_BASE}/api/v1/beneficiary"


@mcp.tool()
async def get_nha_token() -> dict:
    """
    Obtain an OAuth 2.0 access token from NHA ABDM sandbox.
    Required before calling search_abha or check_pmjay_eligibility.

    Returns:
        Dict with keys: success, token (str or None), source ('nha_live' | 'demo')
    """
    if not NHA_CLIENT_ID or not NHA_CLIENT_SECRET:
        return {"success": False, "token": None, "source": "demo",
                "message": "NHA credentials not configured — demo mode"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                NHA_TOKEN_URL,
                json={"clientId": NHA_CLIENT_ID, "clientSecret": NHA_CLIENT_SECRET},
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code in (200, 201):
                token = resp.json().get("accessToken")
                return {"success": True, "token": token, "source": "nha_live",
                        "message": "NHA ABDM OAuth 2.0 token obtained"}
            return {"success": False, "token": None, "source": "nha_live",
                    "message": f"NHA token request returned {resp.status_code}"}
    except Exception as e:
        return {"success": False, "token": None, "source": "nha_live",
                "message": f"NHA token request failed: {e}"}


@mcp.tool()
async def search_abha(token: str, abha_id: str) -> dict:
    """
    Search for a patient by ABHA address (Health ID) in NHA ABDM sandbox.

    Args:
        token: OAuth 2.0 access token from get_nha_token()
        abha_id: Patient's ABHA address (e.g. '14-2948-3821-7710')

    Returns:
        Dict with ABHA profile fields: name, healthId, gender, yearOfBirth,
        address, ekycStatus, etc. Empty dict if not found.
    """
    if not token:
        return _demo_abha_profile(abha_id)

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                NHA_ABHA_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type":  "application/json",
                },
                json={"abhaAddress": abha_id},
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                if data:
                    return {**data, "source": "nha_live"}
            return {}
    except Exception:
        return {}


@mcp.tool()
async def check_pmjay_eligibility(token: str, health_id: str) -> dict:
    """
    Check PM-JAY beneficiary eligibility using the patient's ABHA health ID.

    Args:
        token: OAuth 2.0 access token from get_nha_token()
        health_id: Patient's Health ID (from ABHA profile)

    Returns:
        Dict with keys: covered (bool), scheme, limit (INR), copay,
        beneficiary_id, source
    """
    if not token:
        return _demo_eligibility(health_id)

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            resp = await c.post(
                NHA_BENEFICIARY_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type":  "application/json",
                },
                json={"healthId": health_id, "scheme": "PMJAY"},
            )
            if resp.status_code in (200, 201):
                data    = resp.json()
                covered = data.get("eligible", data.get("covered", True))
                return {
                    "covered":        covered,
                    "scheme":         data.get("schemeName", "PM-JAY / Ayushman Bharat") if covered else None,
                    "limit":          data.get("coverageLimit", 500000),
                    "copay":          data.get("copay", "Nil for listed procedures") if covered else "N/A",
                    "beneficiary_id": data.get("beneficiaryId"),
                    "source":         "nha_live",
                }
            return _demo_eligibility(health_id)
    except Exception:
        return _demo_eligibility(health_id)


# ── Demo fallbacks ────────────────────────────────────────────────────────────

def _demo_abha_profile(abha_id: str) -> dict:
    """Return demo ABHA profile when sandbox is not configured."""
    covered = abha_id.startswith("14-")
    return {
        "name":        "Rajan Pillai",
        "abhaAddress": abha_id,
        "healthId":    abha_id,
        "gender":      "M",
        "yearOfBirth": "1978",
        "address":     "Bengaluru, Karnataka",
        "mobile":      "+91-98450-00000",
        "ekycStatus":  "AUTHENTICATED" if covered else "PENDING",
        "source":      "demo",
    }


def _demo_eligibility(health_id: str) -> dict:
    """Return demo PM-JAY eligibility when sandbox is not configured."""
    covered = health_id.startswith("14-")
    return {
        "covered":        covered,
        "scheme":         "PM-JAY Gold / Ayushman Bharat" if covered else None,
        "limit":          500000 if covered else 0,
        "copay":          "Nil for listed procedures" if covered else "N/A",
        "beneficiary_id": f"PMJAY-BEN-{health_id[-8:]}" if covered else None,
        "source":         "demo",
    }


# ── Standalone server entry point ─────────────────────────────────────────────
if __name__ == "__main__":
    mcp.run()
