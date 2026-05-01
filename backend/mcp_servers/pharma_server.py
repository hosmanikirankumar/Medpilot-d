"""
MedPilot OS — Pharma Research MCP Server
Wraps PK-DB, PubMed E-utilities, and OpenFDA APIs as MCP tools.
All open APIs — no credentials required (NCBI key optional).
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MedPilot-Pharma")

PKDB_BASE          = "https://pk-db.com"
PUBMED_SEARCH_URL  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
OPENFDA_URL        = "https://api.fda.gov/drug/event.json"
OPENFDA_LABEL_URL  = "https://api.fda.gov/drug/label.json"
NCBI_API_KEY       = os.getenv("NCBI_API_KEY", "")


# ── PK-DB Tools ──────────────────────────────────────────────────────────────

@mcp.tool()
async def get_pharmacokinetics(substance: str) -> dict:
    """
    Query PK-DB for pharmacokinetic data: half-life, clearance.

    Args:
        substance: Drug name (e.g. 'warfarin', 'metformin')

    Returns:
        Dict with keys: half_life_h, clearance_L_h, source
    """
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            resp = await c.get(
                f"{PKDB_BASE}/api/v1/outputs/",
                params={"substance": substance.lower(), "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", data if isinstance(data, list) else [])
                half_life = None
                clearance = None
                for entry in results:
                    pk_type = str(entry.get("measurement_type", "")).lower()
                    value   = entry.get("value") or entry.get("mean")
                    if value is None:
                        continue
                    if "half" in pk_type or "t1/2" in pk_type or "t½" in pk_type:
                        half_life = float(value)
                    if "clearance" in pk_type or "cl" == pk_type:
                        clearance = float(value)
                if half_life is not None:
                    return {"half_life_h": half_life, "clearance_L_h": clearance,
                            "source": "pkdb_live"}
    except Exception:
        pass
    return {}


@mcp.tool()
async def get_drug_interventions(substance: str) -> dict:
    """
    Query PK-DB for drug intervention data: route, dose, form.

    Args:
        substance: Drug name (e.g. 'warfarin')

    Returns:
        Dict with keys: route, dose_unit, form, source
    """
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            resp = await c.get(
                f"{PKDB_BASE}/api/v1/interventions/",
                params={"name": substance.lower(), "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", data if isinstance(data, list) else [])
                if results:
                    entry = results[0]
                    return {
                        "route":     entry.get("route", "unknown"),
                        "dose_unit": entry.get("unit", ""),
                        "form":      entry.get("form", ""),
                        "source":    "pkdb_live",
                    }
    except Exception:
        pass
    return {}


# ── PubMed Tools ─────────────────────────────────────────────────────────────

@mcp.tool()
async def search_pubmed(query: str, max_results: int = 5) -> list[dict]:
    """
    Search PubMed via NCBI E-utilities for relevant articles.

    Args:
        query: Clinical search query
        max_results: Max articles to return (default 5)

    Returns:
        List of dicts: pmid, title, pub_date, source, url
    """
    try:
        params = {
            "db": "pubmed", "term": query, "retmax": max_results,
            "retmode": "json", "sort": "relevance",
        }
        if NCBI_API_KEY:
            params["api_key"] = NCBI_API_KEY

        async with httpx.AsyncClient(timeout=8.0) as c:
            search_resp = await c.get(PUBMED_SEARCH_URL, params=params)
            pmids = search_resp.json().get("esearchresult", {}).get("idlist", [])
            if not pmids:
                return []

            summary_params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"}
            if NCBI_API_KEY:
                summary_params["api_key"] = NCBI_API_KEY

            summary_resp = await c.get(PUBMED_SUMMARY_URL, params=summary_params)
            summary_data = summary_resp.json()
            uids = summary_data.get("result", {}).get("uids", [])
            results_dict = summary_data.get("result", {})

            articles = []
            for uid in uids:
                if uid == "uids":
                    continue
                article = results_dict.get(uid, {})
                articles.append({
                    "pmid":     uid,
                    "title":    article.get("title", "Title unavailable"),
                    "pub_date": article.get("pubdate", ""),
                    "source":   article.get("source", ""),
                    "url":      f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                })
            return articles
    except Exception as e:
        return [{"pmid": "ERROR", "title": f"PubMed query failed: {e}",
                 "pub_date": "", "source": "", "url": ""}]


# ── OpenFDA Tools ────────────────────────────────────────────────────────────

@mcp.tool()
async def query_openfda_adverse_events(drug_name: str) -> dict:
    """
    Query OpenFDA for serious adverse events and label warnings.

    Args:
        drug_name: Drug name to check (e.g. 'warfarin')

    Returns:
        Dict: drug, serious_ae_count, warnings_snippet, boxed_warning
    """
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            ae_resp = await c.get(OPENFDA_URL, params={
                "search": f'patient.drug.medicinalproduct:"{drug_name}"&serious:1',
                "limit": 5,
            })
            ae_count = ae_resp.json().get("meta", {}).get("results", {}).get("total", 0)

            label_resp = await c.get(OPENFDA_LABEL_URL, params={
                "search": f'openfda.generic_name:"{drug_name}"',
                "limit": 1,
            })
            label_data = label_resp.json()
            results    = label_data.get("results", [])
            warnings   = ""
            bb_warning = ""
            if results:
                warnings   = " ".join(results[0].get("warnings", [""])[:1])[:300]
                bb_warning = " ".join(results[0].get("boxed_warning", [""])[:1])[:300]

            return {
                "drug": drug_name, "serious_ae_count": ae_count,
                "warnings_snippet": warnings, "boxed_warning": bb_warning,
            }
    except Exception as e:
        return {"drug": drug_name, "error": str(e)}


if __name__ == "__main__":
    mcp.run()
