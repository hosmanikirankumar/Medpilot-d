"""
MedPilot OS — Google Maps MCP Server
Wraps Google Maps Places API (Nearby Search) and Distance Matrix API
as standardised MCP tool definitions.
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MedPilot-Maps")

MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
PLACES_URL   = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
MATRIX_URL   = "https://maps.googleapis.com/maps/api/distancematrix/json"

# ── Demo fallback data ────────────────────────────────────────────────────────
_DEMO_HOSPITALS = [
    {"name": "Apollo Hospital, Bannerghatta Rd",  "coords": [12.9011, 77.5968], "eta_minutes": 8,  "vicinity": "Bannerghatta Road",  "rating": 4.3, "open_now": True, "place_id": "", "demo": True},
    {"name": "Manipal Hospital, Whitefield",       "coords": [12.9698, 77.7499], "eta_minutes": 14, "vicinity": "Whitefield",          "rating": 4.4, "open_now": True, "place_id": "", "demo": True},
    {"name": "Fortis Hospital, Bannerghatta",      "coords": [12.8762, 77.5977], "eta_minutes": 11, "vicinity": "Bannerghatta",         "rating": 4.1, "open_now": True, "place_id": "", "demo": True},
]


@mcp.tool()
async def find_nearest_hospital(
    lat: float,
    lng: float,
    hospital_type: str = "ICU emergency",
    radius: int = 15000,
) -> dict:
    """
    Find the single nearest hospital matching a clinical requirement.
    Uses Google Maps Places Nearby Search + Distance Matrix for ETA.

    Args:
        lat: Patient latitude coordinate
        lng: Patient longitude coordinate
        hospital_type: Clinical facility type needed (e.g. 'Cardiac ICU', 'Trauma Center')
        radius: Search radius in metres (default 15km)

    Returns:
        Dict with keys: success, name, coords, eta_minutes, place_id, vicinity, message
    """
    if not MAPS_API_KEY:
        demo = _DEMO_HOSPITALS[0]
        return {
            "success":     False,
            "name":        f"{demo['name']} (Demo)",
            "coords":      demo["coords"],
            "eta_minutes": demo["eta_minutes"],
            "place_id":    "",
            "vicinity":    demo["vicinity"],
            "message":     "Maps API Key not configured — returning demo hospital",
        }

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            # Step 1: Nearby Search
            places_resp = await c.get(
                PLACES_URL,
                params={
                    "location": f"{lat},{lng}",
                    "radius":   radius,
                    "type":     "hospital",
                    "keyword":  hospital_type,
                    "key":      MAPS_API_KEY,
                },
            )
            results = places_resp.json().get("results", [])

            if not results:
                return {
                    "success":     False,
                    "name":        "No hospitals found nearby",
                    "coords":      [lat, lng],
                    "eta_minutes": 0,
                    "place_id":    "",
                    "vicinity":    "",
                    "message":     f"Places API returned 0 results for '{hospital_type}' within {radius}m",
                }

            top      = results[0]
            h_name   = top.get("name", "Unknown Hospital")
            h_loc    = top["geometry"]["location"]
            h_lat    = h_loc["lat"]
            h_lng    = h_loc["lng"]
            place_id = top.get("place_id", "")
            vicinity = top.get("vicinity", "")

            # Step 2: Distance Matrix for ETA
            eta_minutes = 0
            matrix_resp = await c.get(
                MATRIX_URL,
                params={
                    "origins":      f"{lat},{lng}",
                    "destinations": f"{h_lat},{h_lng}",
                    "key":          MAPS_API_KEY,
                },
            )
            rows = matrix_resp.json().get("rows", [])
            if rows and rows[0].get("elements"):
                element = rows[0]["elements"][0]
                if element.get("status") == "OK":
                    eta_minutes = element["duration"]["value"] // 60

            return {
                "success":     True,
                "name":        h_name,
                "coords":      [h_lat, h_lng],
                "eta_minutes": eta_minutes,
                "place_id":    place_id,
                "vicinity":    vicinity,
                "message":     f"Found {len(results)} hospitals. Routing to nearest: {h_name}",
            }

    except Exception as e:
        demo = _DEMO_HOSPITALS[0]
        return {
            "success":     False,
            "name":        f"{demo['name']} (Fallback)",
            "coords":      demo["coords"],
            "eta_minutes": demo["eta_minutes"],
            "place_id":    "",
            "vicinity":    demo["vicinity"],
            "message":     f"Maps API error: {e} — using demo fallback",
        }


@mcp.tool()
async def get_multiple_hospitals(
    lat: float,
    lng: float,
    hospital_type: str = "hospital",
    radius: int = 15000,
    max_results: int = 20,
) -> list[dict]:
    """
    Find multiple nearby hospitals with ETAs for map display.
    Uses Google Maps Places Nearby Search + batch Distance Matrix.

    Args:
        lat: Patient latitude coordinate
        lng: Patient longitude coordinate
        hospital_type: Clinical facility type keyword
        radius: Search radius in metres
        max_results: Maximum number of hospitals to return


    Returns:
        List of dicts with keys: name, coords, eta_minutes, vicinity, place_id, demo
    """
    if not MAPS_API_KEY:
        return _DEMO_HOSPITALS[:max_results]

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            places_resp = await c.get(
                PLACES_URL,
                params={
                    "location": f"{lat},{lng}",
                    "radius":   radius,
                    "type":     "hospital",
                    "keyword":  hospital_type,
                    "key":      MAPS_API_KEY,
                },
            )
            results = places_resp.json().get("results", [])[:max_results]

            if not results:
                return []

            # Batch Distance Matrix
            destinations = "|".join(
                f"{r['geometry']['location']['lat']},{r['geometry']['location']['lng']}"
                for r in results
            )
            matrix_resp = await c.get(
                MATRIX_URL,
                params={
                    "origins":      f"{lat},{lng}",
                    "destinations": destinations,
                    "key":          MAPS_API_KEY,
                },
            )
            elements = matrix_resp.json().get("rows", [{}])[0].get("elements", [])

            hospitals = []
            for i, r in enumerate(results):
                loc = r["geometry"]["location"]
                eta = 0
                if i < len(elements) and elements[i].get("status") == "OK":
                    eta = elements[i]["duration"]["value"] // 60
                hospitals.append({
                    "name":        r.get("name", "Unknown"),
                    "coords":      [loc["lat"], loc["lng"]],
                    "eta_minutes": eta,
                    "vicinity":    r.get("vicinity", ""),
                    "place_id":    r.get("place_id", ""),
                    "rating":      r.get("rating", 0),
                    "open_now":    r.get("opening_hours", {}).get("open_now"),
                    "demo":        False,
                })
            return hospitals

    except Exception:
        return []


@mcp.tool()
async def get_eta(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> dict:
    """
    Get driving ETA between two points using Google Maps Distance Matrix API.

    Args:
        origin_lat: Origin latitude
        origin_lng: Origin longitude
        dest_lat: Destination latitude
        dest_lng: Destination longitude

    Returns:
        Dict with keys: eta_minutes, distance_km, status
    """
    if not MAPS_API_KEY:
        return {"eta_minutes": 0, "distance_km": 0, "status": "no_api_key"}

    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            resp = await c.get(
                MATRIX_URL,
                params={
                    "origins":      f"{origin_lat},{origin_lng}",
                    "destinations": f"{dest_lat},{dest_lng}",
                    "key":          MAPS_API_KEY,
                },
            )
            data = resp.json()
            rows = data.get("rows", [])
            if rows and rows[0].get("elements"):
                el = rows[0]["elements"][0]
                if el.get("status") == "OK":
                    return {
                        "eta_minutes":  el["duration"]["value"] // 60,
                        "distance_km":  round(el["distance"]["value"] / 1000, 1),
                        "status":       "ok",
                    }
            return {"eta_minutes": 0, "distance_km": 0, "status": "no_route"}
    except Exception as e:
        return {"eta_minutes": 0, "distance_km": 0, "status": f"error: {e}"}


# ── Standalone server entry point ─────────────────────────────────────────────
if __name__ == "__main__":
    mcp.run()
