"""
MedPilot OS — NIH RxNav MCP Server
Wraps the NIH RxNav REST API for:
  - Drug name → RxNorm CUI resolution
  - Multi-drug interaction checking
Open API — no credentials required.
"""
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MedPilot-RxNav")

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"


@mcp.tool()
async def resolve_rxcui(drug_name: str) -> dict:
    """
    Resolve a drug name to its RxNorm CUI via NIH RxNav.

    Args:
        drug_name: Generic drug name (e.g. 'warfarin')

    Returns:
        Dict with keys: drug_name, rxcui (str or None), success
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.get(
                f"{RXNAV_BASE}/rxcui.json",
                params={"name": drug_name.strip().lower(), "search": 1},
            )
            data   = resp.json()
            rxcuis = data.get("idGroup", {}).get("rxnormId", [])
            if rxcuis:
                return {"drug_name": drug_name, "rxcui": rxcuis[0], "success": True}
            return {"drug_name": drug_name, "rxcui": None, "success": False}
    except Exception as e:
        return {"drug_name": drug_name, "rxcui": None, "success": False, "error": str(e)}


@mcp.tool()
async def check_drug_interactions(drug_names: list[str]) -> list[dict]:
    """
    Check drug-drug interactions across a medication list via RxNav.

    Args:
        drug_names: List of drug names (e.g. ['Warfarin', 'Aspirin'])

    Returns:
        List of interaction dicts: pair, severity, description, source
    """
    if not drug_names or len(drug_names) < 2:
        return []

    # Resolve names → RxCUIs
    rxcuis = []
    for name in drug_names:
        generic = name.strip().split()[0]
        result  = await resolve_rxcui(generic)
        if result.get("rxcui"):
            rxcuis.append((name, result["rxcui"]))

    if len(rxcuis) < 2:
        return []

    try:
        rxcui_str = "+".join(cuid for _, cuid in rxcuis)
        async with httpx.AsyncClient(timeout=6.0) as c:
            resp = await c.get(
                f"{RXNAV_BASE}/interaction/list.json",
                params={"rxcuis": rxcui_str},
            )
            data = resp.json()
            interactions = []
            for group in data.get("fullInteractionTypeGroup", []):
                for int_type in group.get("fullInteractionType", []):
                    int_pairs = int_type.get("interactionPair", [])
                    if not int_pairs:
                        continue
                    first_pair = int_pairs[0]
                    pair = [
                        m.get("minConceptItem", {}).get("name", "Unknown")
                        for m in first_pair.get("interactionConcept", [])
                    ]
                    severity    = first_pair.get("severity", "Unknown")
                    description = first_pair.get("description", "")
                    if pair:
                        interactions.append({
                            "pair": pair, "severity": severity,
                            "description": description[:300], "source": "NIH RxNav",
                        })
            return interactions
    except Exception as e:
        return [{"pair": [], "severity": "Unknown",
                 "description": f"RxNav query failed: {e}", "source": "error"}]


if __name__ == "__main__":
    mcp.run()
