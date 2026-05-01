"""
MedPilot OS — LangGraph Agent Graph (16 agents)
Full agent workforce wired and compiled.
"""
from langgraph.graph import StateGraph, END
from .state import MedPilotState
from .orchestrator import orchestrator_node, route_intent
from .clinical import clinical_memory_node, polypharmacy_node, dietary_guard_node
from .eligibility import eligibility_node
from .emergency import emergency_cascade_node
from .logistics import logistics_node
from .validation import validation_node
from .deep_dive import deep_dive_node
from .research import research_node
from .briefing import briefing_node
from .food_scanner import food_scanner_node
from .doctor_brief import doctor_brief_node
from .workspace import workspace_node
from .trajectory import trajectory_node


def build_graph():
    """Build and compile the MedPilot 16-agent graph."""
    builder = StateGraph(MedPilotState)

    # ── Register all 16 agent nodes ────────────────────────────────────────────────────
    # Pod A: Core Management & Extraction
    builder.add_node("orchestrator",      orchestrator_node)
    builder.add_node("validation",        validation_node)

    # Pod B: Clinical Analysis & Safety
    builder.add_node("clinical_memory",   clinical_memory_node)
    builder.add_node("polypharmacy",      polypharmacy_node)
    builder.add_node("dietary_guard",     dietary_guard_node)
    builder.add_node("food_scanner",      food_scanner_node)

    # Pod C: Emergency & External Integrations
    builder.add_node("emergency_cascade", emergency_cascade_node)
    builder.add_node("logistics",         logistics_node)
    builder.add_node("eligibility",       eligibility_node)

    # Pod D: Deep Reasoning & Patient Engagement
    builder.add_node("deep_dive",         deep_dive_node)
    builder.add_node("research",          research_node)
    builder.add_node("briefing",          briefing_node)
    builder.add_node("doctor_brief",      doctor_brief_node)

    # Pod E: Proactive Intelligence & Scheduling
    builder.add_node("workspace",         workspace_node)     # Google Calendar/Tasks/Gmail
    builder.add_node("trajectory",        trajectory_node)    # Predictive trajectory forecaster

    # ── Entry point ────────────────────────────────────────────────────────────
    builder.set_entry_point("orchestrator")

    # ── Conditional routing from orchestrator ─────────────────────────────────────────────
    builder.add_conditional_edges(
        "orchestrator",
        route_intent,
        {
            "clinical_memory":   "clinical_memory",
            "data_integrity":    "clinical_memory",   # fallback
            "dietary_guard":     "dietary_guard",
            "food_scanner":      "food_scanner",
            "polypharmacy":      "polypharmacy",
            "eligibility":       "eligibility",
            "emergency_cascade": "emergency_cascade",
            "deep_dive":         "deep_dive",
            "research":          "research",
            "briefing":          "briefing",
            "doctor_brief":      "doctor_brief",
            "workspace":         "workspace",         # Google Workspace scheduling
            "trajectory":        "trajectory",        # Predictive trajectory
        },
    )

    # ── Sequential chains ────────────────────────────────────────────────────
    # Polypharmacy queries RxNav, then passes to Validation for PK-DB check
    builder.add_edge("polypharmacy", "validation")

    # Emergency cascade → logistics (fetches nearby hospital list for map display)
    builder.add_edge("emergency_cascade", "logistics")

    # ── Leaf nodes → END ───────────────────────────────────────────────────────
    for node in [
        "clinical_memory",
        "validation",
        "dietary_guard",
        "food_scanner",
        "eligibility",
        "logistics",
        "deep_dive",
        "research",
        "briefing",
        "doctor_brief",
        "workspace",
        "trajectory",
    ]:
        builder.add_edge(node, END)

    return builder.compile()


# Singleton compiled graph
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_query(raw_input: str, patient_id: str = "PT-001", language: str = "en", patient_context: dict = None) -> dict:
    """
    Entry point: run a user query through the full 12-agent graph.
    Returns: { final_response, intent, agent_logs, emergency, emergency_result, ... }
    """
    graph = get_graph()

    initial_state: MedPilotState = {
        "raw_input":       raw_input,
        "patient_id":      patient_id,
        "query_type":      "text",
        "language":        language,
        "hitl_required":   False,
        "emergency":       False,
        "retry_count":     0,
        "agent_logs":      [],
        "final_response":  "",
        "patient_context": patient_context or {},
    }

    result = await graph.ainvoke(initial_state)

    return {
        "final_response":      result.get("final_response", ""),
        "intent":              result.get("intent", "CLINICAL_QUERY"),
        "priority":            result.get("priority", "normal"),
        "agent_logs":          result.get("agent_logs", []),
        "emergency":           result.get("emergency", False),
        "emergency_result":    result.get("emergency_result"),
        "eligibility_result":  result.get("eligibility_result"),
        "abha_profile":        result.get("abha_profile"),
        "drug_interactions":   result.get("drug_interactions"),
        "pkdb_data":           result.get("pkdb_data"),
        "evidence_citations":  result.get("evidence_citations"),
        "briefing_result":     result.get("briefing_result"),
        "nearby_hospitals":    result.get("nearby_hospitals"),
        "report_type":         result.get("report_type"),
        "trajectory_result":   result.get("trajectory_result"),
        "workspace_result":    result.get("workspace_result"),
    }
