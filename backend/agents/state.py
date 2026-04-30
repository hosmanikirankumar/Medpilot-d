"""
MedPilot OS — Shared LangGraph State Definition
"""
from typing import Any, Optional
from typing_extensions import TypedDict


class MedPilotState(TypedDict, total=False):
    # ── Intent classification ──────────────────────────────────────────────────
    intent: str          # CLINICAL_QUERY | DOCUMENT_INTAKE | DIETARY_CHECK | FOOD_SCAN |
                         # EMERGENCY_VITALS | ELIGIBILITY_CHECK | DEEP_DIVE | RESEARCH |
                         # PATIENT_BRIEFING | DOCTOR_BRIEF
    priority: str        # high | normal
    delegate_to: list[str]

    # ── Patient context ────────────────────────────────────────────────────────
    patient_id: Optional[str]
    patient_context: Optional[dict]   # demographics, active_medications[], coords[], abha_id,
                                      # preferred_language, medicine_systems, symptoms[], tasks[], notes[]
    language: str                     # ISO 639-1 language code, e.g. "hi", "ta"

    # ── Raw input ──────────────────────────────────────────────────────────────
    raw_input: str        # user's natural language query or GCS url
    query_type: str       # text | image | vitals | report | food

    # ── Processed outputs ──────────────────────────────────────────────────────
    extracted_json:       Optional[dict]   # from DataIntegrity agent
    validation_result:    Optional[dict]   # from Validation agent
    pkdb_data:            Optional[dict]   # from Validation agent — PK-DB pharmacokinetics per drug
    drug_interactions:    Optional[list]   # from Polypharmacy agent (RxNav + Gemini)
    interaction_matrix:   Optional[list]   # N×N matrix — [{drug_a, drug_b, severity, mechanism, pmid}]
    food_warnings:        Optional[list]   # from Food Scanner — [{food, drug, severity, mechanism}]
    eligibility_result:   Optional[dict]   # from Eligibility agent (PM-JAY coverage)
    abha_profile:         Optional[dict]   # from Eligibility agent (ABHA identity)
    emergency_result:     Optional[dict]   # from Emergency Cascade agent
    nearby_hospitals:     Optional[list]   # from Logistics agent (Maps results)
    clinical_response:    Optional[str]    # final natural language answer
    report_type:          Optional[str]    # from Deep-Dive agent (e.g. "MRI Brain")
    evidence_citations:   Optional[list]   # from Research agent — [{pmid, title, url}]
    briefing_result:      Optional[dict]   # from Patient Briefing agent — {text, audio_base64, language}

    # ── Google Workspace results ───────────────────────────────────────────────
    google_tasks_created:     Optional[list]   # tasks created in Google Tasks
    calendar_events_created:  Optional[list]   # events created in Google Calendar
    gmail_sent:               Optional[dict]   # email dispatch result
    workspace_result:         Optional[dict]   # full workspace agent result

    # ── Trajectory results ─────────────────────────────────────────────────────
    trajectory_result:        Optional[dict]   # from Trajectory Forecaster agent

    # ── Control flags ──────────────────────────────────────────────────────────
    hitl_required: bool
    emergency: bool
    retry_count: int

    # ── Trace ─────────────────────────────────────────────────────────────────
    agent_logs: list[dict]
    final_response: str    # returned to user
