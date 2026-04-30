"""
MedPilot OS — Orchestrator Agent
Classifies user intent and decides which agents to delegate to.
"""
from .state import MedPilotState
from .llm import generate_json, generate_text
import os
import json

ORCHESTRATOR_PROMPT = """
You are the MedPilot OS Orchestrator — a clinical AI router for Indian healthcare.

Classify the user query into EXACTLY ONE intent from this list:
- CLINICAL_QUERY       → general medical question, drug info, symptom advice, lab analysis
- DOCUMENT_INTAKE      → user wants to upload or process a medical document/prescription
- DIETARY_CHECK        → food-drug interactions (text-based dietary question)
- FOOD_SCAN            → specific food item check against medications (e.g. 'can I eat spinach?')
- POLYPHARMACY_CHECK   → drug-drug or drug-herb interaction matrix, polypharmacy analysis
- EMERGENCY_VITALS     → critical vitals, emergency, SOS situation
- ELIGIBILITY_CHECK    → PM-JAY, ABHA, insurance, government scheme
- DEEP_DIVE            → dense specialist report analysis (MRI, pathology, oncology, radiology)
- RESEARCH             → evidence-based research, PubMed citations, drug safety, clinical studies
- PATIENT_BRIEFING     → translate discharge plan for patient, multi-language audio/text summary
- DOCTOR_BRIEF         → generate pre-consultation brief, doctor summary, patient summary for visit
- SCHEDULE_MANAGE      → schedule appointment, set medication reminder, manage calendar, create task, send email
- VITALS_TRAJECTORY    → predict patient decline, show vitals trend, phase space, health trajectory, early warning

Patient context (if available):
{patient_context}

User query:
{raw_input}

Respond ONLY with valid JSON (no markdown):
{{"intent": "...", "priority": "high|normal", "delegate_to": ["agent1", "agent2"], "reasoning": "one sentence"}}
"""

def get_firestore():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            cred_json = os.getenv("FIREBASE_ADMIN_CREDENTIALS", "")
            if not cred_json or cred_json.strip() in ("", "{}", "{}"):
                return None
            cred = credentials.Certificate(json.loads(cred_json))
            firebase_admin.initialize_app(cred)
        return firestore.client()
    except Exception:
        return None

async def orchestrator_node(state: MedPilotState) -> MedPilotState:
    patient_id = state.get("patient_id", "PT-001")
    ctx = {}

    db = get_firestore()
    if db:
        try:
            doc = db.collection("patients").document(patient_id).get()
            if doc.exists:
                ctx = doc.to_dict()
            else:
                print(f"Warning: Patient {patient_id} not found in Firestore.")
        except Exception as e:
            print(f"Failed to fetch patient context from Firestore: {e}")
    else:
        print("Warning: Firestore client not initialized, proceeding with empty context.")

    prompt = ORCHESTRATOR_PROMPT.format(
        patient_context=str(ctx),
        raw_input=state.get("raw_input", "")
    )

    result = await generate_json(prompt)

    logs = state.get("agent_logs", [])
    logs.append({
        "agent_name": "Orchestrator",
        "action": f"Classified intent: {result.get('intent', 'CLINICAL_QUERY')} — delegating to {result.get('delegate_to', [])}",
        "status": "Success"
    })

    return {
        **state,
        "intent": result.get("intent", "CLINICAL_QUERY"),
        "priority": result.get("priority", "normal"),
        "delegate_to": result.get("delegate_to", ["clinical_memory"]),
        "patient_context": ctx,
        "agent_logs": logs,
    }


def route_intent(state: MedPilotState) -> str:
    """Routing function for LangGraph conditional edges."""
    intent = state.get("intent", "CLINICAL_QUERY")
    routing = {
        "CLINICAL_QUERY":    "clinical_memory",
        "DOCUMENT_INTAKE":   "data_integrity",
        "DIETARY_CHECK":     "dietary_guard",
        "FOOD_SCAN":         "food_scanner",
        "POLYPHARMACY_CHECK":"polypharmacy",
        "EMERGENCY_VITALS":  "emergency_cascade",
        "ELIGIBILITY_CHECK": "eligibility",
        "DEEP_DIVE":         "deep_dive",
        "RESEARCH":          "research",
        "PATIENT_BRIEFING":  "briefing",
        "DOCTOR_BRIEF":      "doctor_brief",
        "SCHEDULE_MANAGE":   "workspace",       # Google Calendar/Tasks/Gmail
        "VITALS_TRAJECTORY": "trajectory",      # Predictive trajectory forecaster
    }
    return routing.get(intent, "clinical_memory")
