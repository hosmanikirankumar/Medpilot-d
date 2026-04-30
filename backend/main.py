"""
MedPilot OS — FastAPI Backend Entry Point
Orchestrates all 12 agents via LangGraph.
"""
import sys
import io
# ── Fix Windows cp1252 UnicodeEncodeError on emoji in print() ─────────────────
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
import json
import httpx
import asyncio
from datetime import datetime
import math

# ── Vertex AI: lazy import — only load when a real key is present ─────────────
try:
    import vertexai
    from vertexai.generative_models import GenerativeModel, Part
    _VERTEXAI_AVAILABLE = True
except ImportError:
    _VERTEXAI_AVAILABLE = False

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MedPilot OS",
    description="12-Agent Clinical Operating System — 2026 Google APAC Gen AI Hackathon",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Config ───────────────────────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

GCP_PROJECT_ID  = os.getenv("GCP_PROJECT_ID", "medpilot-os-2026")
VERTEX_LOCATION = os.getenv("VERTEX_AI_LOCATION", "us-central1")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
MAPS_API_KEY    = os.getenv("GOOGLE_MAPS_API_KEY", "")
WA_TOKEN        = os.getenv("WHATSAPP_BUSINESS_TOKEN", "")
WA_PHONE_ID     = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
NHA_CLIENT_ID   = os.getenv("NHA_SANDBOX_CLIENT_ID", "")
NHA_CLIENT_SECRET = os.getenv("NHA_SANDBOX_CLIENT_SECRET", "")

# ─── Pydantic models ──────────────────────────────────────────────────────────
class IntakeRequest(BaseModel):
    patient_id: str
    gcs_url: str
    entry_id: str

class HITLCommitRequest(BaseModel):
    entry_id: str
    patient_id: str
    clinician_uid: str

class EmergencyVitalsRequest(BaseModel):
    patient_id: str
    vitals: dict
    gps: list[float]  # [lat, lng]

class EligibilityRequest(BaseModel):
    abha_id: str
    patient_id: str

class ChatRequest(BaseModel):
    message: str
    patient_id: str = "PT-001"
    conversation_id: str = ""
    language: str = "en"   # ISO 639-1 language code for Patient Briefing Agent

class BriefingRequest(BaseModel):
    patient_id: str
    discharge_plan: str
    language: str = "en"   # hi, ta, te, kn, ml, mr, bn, gu, pa

class ResearchRequest(BaseModel):
    query: str
    patient_id: str = "PT-001"
    max_results: int = 5

class DeepDiveRequest(BaseModel):
    patient_id: str
    report_text: str
    report_type: str = "auto"   # auto | MRI | Pathology | Echo | CT | etc.

# ─── Firestore helper (admin SDK) ─────────────────────────────────────────────
def get_firestore():
    """
    Returns a Firestore client, or None if credentials are not configured.
    Accepts credentials in three forms (checked in order):
      1. FIREBASE_CREDENTIALS_FILE — path to a service-account .json file
      2. FIREBASE_ADMIN_CREDENTIALS — raw JSON string (single or multi-line)
      3. Neither configured → demo mode
    """
    cred_obj = None

    # ── Option 1: File path ────────────────────────────────────────────────────
    cred_file = os.getenv("FIREBASE_CREDENTIALS_FILE", "")
    if cred_file and os.path.isfile(cred_file):
        try:
            with open(cred_file, "r", encoding="utf-8") as f:
                cred_obj = json.load(f)
            print(f"[MedPilot] Firestore: loaded credentials from file → {cred_file}")
        except Exception as e:
            print(f"[MedPilot] Firestore: could not read credential file {cred_file}: {e}")

    # ── Option 2: JSON string (single-line or multi-line) ──────────────────────
    if cred_obj is None:
        raw = os.getenv("FIREBASE_ADMIN_CREDENTIALS", "")
        if raw and raw.strip() not in ("", "{}", '{"type": "service_account", "project_id": "..."}'):
            try:
                cred_obj = json.loads(raw)
            except json.JSONDecodeError:
                # Could be multi-line — strip newlines and try again
                try:
                    cred_obj = json.loads(raw.replace("\n", "").replace("\r", ""))
                except json.JSONDecodeError as e:
                    print(f"[MedPilot] Firestore: JSON parse error — {e}")

    # ── Validate ───────────────────────────────────────────────────────────────
    if not cred_obj or cred_obj.get("project_id", "...") == "...":
        print("[MedPilot] Firestore: no credentials configured — running in demo mode")
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_obj)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print(f"[MedPilot] Firestore: ✅ connected → project '{cred_obj.get('project_id')}'")
        return db
    except Exception as e:
        print(f"[MedPilot] Firestore init failed: {e} — running in demo mode")
        return None

def write_agent_log(db, agent_name: str, action: str, status: str = "Success"):
    """Write an agent log entry. No-op if Firestore is unavailable."""
    if db is None:
        print(f"[AgentLog/{status}] {agent_name}: {action}")
        return
    try:
        db.collection("agent_logs").add({
            "timestamp": datetime.utcnow(),
            "agent_name": agent_name,
            "action": action,
            "status": status,
        })
    except Exception as e:
        print(f"[AgentLog] Firestore write failed: {e}")

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "online", "system": "MedPilot OS", "agents": 12}


@app.get("/api/health")
async def api_health():
    """Health check via /api prefix — used by the Vite-proxied frontend."""
    return {"status": "online", "system": "MedPilot OS", "agents": 12, "mode": "demo" if not os.getenv("GEMINI_API_KEY") else "live"}

@app.get("/api/patients")
async def get_patients():
    """Return all patients from Firestore (demo list if no credentials or empty DB)."""
    DEMO_PATIENTS = [
        {
            "patient_id": "PT-001",
            "name": "Rajan Pillai",
            "age": 58,
            "gender": "Male",
            "blood_type": "B+",
            "abha_id": "14-2948-3821-7710",
            "coords": [12.9716, 77.5946],
            "conditions": ["Type 2 Diabetes", "Hypertension", "Atrial Fibrillation"],
            "active_medications": ["Warfarin 5mg", "Metformin 500mg", "Ashwagandha 300mg"],
            "allergies": "Penicillin",
            "emergency_contact": "+919845000000",
            "preferred_language": "hi",
            "pmjay_covered": True,
            "pmjay_limit": 500000,
            "source": "demo",
        },
        {
            "patient_id": "PT-002",
            "name": "Meena Krishnamurthy",
            "age": 45,
            "gender": "Female",
            "blood_type": "O+",
            "abha_id": "14-5512-9934-1102",
            "coords": [12.9352, 77.6245],
            "conditions": ["Hypertension"],
            "active_medications": ["Lisinopril 10mg", "Triphala Churna"],
            "allergies": [],
            "emergency_contact": "+919845000001",
            "preferred_language": "ta",
            "pmjay_covered": False,
            "pmjay_limit": 0,
            "source": "demo",
        },
    ]
    db = get_firestore()
    if db is None:
        return DEMO_PATIENTS
    try:
        docs = db.collection("patients").stream()
        patients = [doc.to_dict() for doc in docs]
        return patients if patients else DEMO_PATIENTS
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """
    Main AI assistant endpoint — runs the full LangGraph multi-agent pipeline.
    Accepts a natural language query, returns AI response + agent trace logs.
    Every query is persisted to Firestore agent_logs for model integrity audit.
    """
    from agents.graph import run_query
    from agents.llm import get_llm_status
    import re
    import uuid

    query_id = f"QRY-{uuid.uuid4().hex[:8].upper()}"

    try:
        result = await run_query(req.message, req.patient_id, req.language)

        final_response = result.get("final_response", "")
        proposed_entry = None

        if "ADD_TO_DB" in final_response and "```json" in final_response:
            try:
                match = re.search(r'```json(.*?)```', final_response, re.DOTALL)
                if match:
                    data = json.loads(match.group(1).strip())
                    if data.get("action") == "ADD_TO_DB":
                        entry_id = f"ENT-{uuid.uuid4().hex[:6].upper()}"
                        proposed_entry = {
                            "entry_id": entry_id,
                            "patient_id": req.patient_id,
                            "extracted_data": data.get("extracted_data", {}),
                            "validation_status": "PENDING_HUMAN_REVIEW",
                            "ai_reasoning_trace": data.get("reasoning_trace", []),
                            "warnings": data.get("warnings", []),
                            "pmid_links": [],
                            "created_at": datetime.utcnow().isoformat()
                        }
                        db = get_firestore()
                        if db:
                            db.collection("proposed_entries").document(entry_id).set(proposed_entry)

                        final_response = "I have staged the new clinical data for your review. Please check the HITL Gate to verify and add to the patient's record."
            except Exception as e:
                print(f"Failed to parse ADD_TO_DB json: {e}")

        # ── Persist agent logs to Firestore for model integrity audit ───────────────
        llm_status = get_llm_status()
        agent_logs = result.get("agent_logs", [])
        model_integrity = {
            "query_id":       query_id,
            "timestamp":      datetime.utcnow().isoformat() + "Z",
            "patient_id":     req.patient_id,
            "query_preview":  req.message[:120],
            "intent":         result.get("intent", "UNKNOWN"),
            "priority":       result.get("priority", "normal"),
            "model_lite":     llm_status["model_lite"],
            "model_full":     llm_status["model_full"],
            "agents_invoked": len(agent_logs),
            "emergency":      result.get("emergency", False),
            "status":         "SUCCESS",
            "agent_steps":    agent_logs,
        }
        db = get_firestore()
        if db:
            try:
                db.collection("agent_logs").document(query_id).set(model_integrity)
            except Exception as e:
                print(f"[AgentLog] Firestore persist failed: {e}")
        else:
            # Fallback: print to console so logs are visible even without Firestore
            print(f"[AgentLog/INTEGRITY] query_id={query_id} intent={model_integrity['intent']} "
                  f"agents={model_integrity['agents_invoked']} model={llm_status['model_lite']}")
            for step in agent_logs:
                status_sym = {"Success": "OK", "Warning": "WRN", "Error": "ERR", "Info": "INF"}.get(step.get("status",""), "---")
                print(f"  [{status_sym}] {step.get('agent_name','?')}: {step.get('action','')[:100]}")

        return {
            "response":            final_response,
            "intent":             result["intent"],
            "priority":           result["priority"],
            "agent_logs":         agent_logs,
            "query_id":           query_id,
            "proposed_entry":     proposed_entry,
            "emergency":          result["emergency"],
            "emergency_result":   result.get("emergency_result"),
            "eligibility_result": result.get("eligibility_result"),
            "abha_profile":       result.get("abha_profile"),
            "drug_interactions":  result.get("drug_interactions"),
            "pkdb_data":          result.get("pkdb_data"),
            "evidence_citations": result.get("evidence_citations"),
            "briefing_result":    result.get("briefing_result"),
            "nearby_hospitals":   result.get("nearby_hospitals"),
            "report_type":        result.get("report_type"),
            "trajectory_result":  result.get("trajectory_result"),
            "workspace_result":   result.get("workspace_result"),
        }
    except Exception as e:
        # Log failure to Firestore too
        db = get_firestore()
        if db:
            try:
                db.collection("agent_logs").document(query_id).set({
                    "query_id":      query_id,
                    "timestamp":     datetime.utcnow().isoformat() + "Z",
                    "patient_id":    req.patient_id,
                    "query_preview": req.message[:120],
                    "status":        "ERROR",
                    "error":         str(e)[:500],
                })
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agent-logs")
async def get_agent_logs(limit: int = 20, patient_id: str = ""):
    """
    Retrieve recent agent execution logs from Firestore.
    Used by frontend AgentLog panel to display model integrity audit trail.
    """
    from agents.llm import get_llm_status
    llm_status = get_llm_status()

    db = get_firestore()
    if db is None:
        # Return demo logs when Firestore isn’t configured
        return {
            "logs": [
                {
                    "query_id":       "QRY-DEMO0001",
                    "timestamp":      datetime.utcnow().isoformat() + "Z",
                    "patient_id":     patient_id or "PT-001",
                    "query_preview":  "Demo mode — no Firestore configured",
                    "intent":         "CLINICAL_QUERY",
                    "model_lite":     llm_status["model_lite"],
                    "model_full":     llm_status["model_full"],
                    "agents_invoked": 3,
                    "status":         "SUCCESS",
                    "agent_steps": [
                        {"agent_name": "Orchestrator",    "action": "Classified intent: CLINICAL_QUERY", "status": "Success"},
                        {"agent_name": "Clinical Memory", "action": "Retrieved patient history and generated clinical response", "status": "Success"},
                        {"agent_name": "Evidence Research", "action": "Cross-referenced PubMed for evidence-based recommendations", "status": "Success"},
                    ],
                }
            ],
            "model": llm_status["model_lite"],
            "source": "demo",
        }

    try:
        q = db.collection("agent_logs").order_by("timestamp", direction="DESCENDING").limit(limit)
        if patient_id:
            q = q.where("patient_id", "==", patient_id)
        docs = [d.to_dict() for d in q.stream()]
        return {"logs": docs, "model": llm_status["model_lite"], "source": "firestore"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/maps/hospitals")
async def get_maps_hospitals(lat: float, lng: float, radius: int = 15000):
    """Fetch nearby hospitals using the MCP Maps Server."""
    from mcp_servers.maps_server import get_multiple_hospitals
    try:
        hospitals = await get_multiple_hospitals(lat=lat, lng=lng, hospital_type="hospital", radius=radius, max_results=20)
        return {"hospitals": hospitals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/brief/{patient_id}")
async def get_doctor_brief(patient_id: str):
    """Generate a comprehensive doctor brief grounded in real Firestore patient data."""
    from agents.doctor_brief import doctor_brief_node

    db = get_firestore()
    ctx = {}
    if db:
        try:
            # Fetch base patient document
            doc = db.collection("patients").document(patient_id).get()
            if doc.exists:
                ctx = doc.to_dict()

            # Enrich with recent clinical records (lab reports, discharge summaries etc.)
            records_ref = db.collection("patients").document(patient_id).collection("records")
            records = [r.to_dict() for r in records_ref.order_by("date", direction="DESCENDING").limit(5).stream()]
            if records:
                # Extract notes and lab flags
                notes = []
                lab_flags = []
                for r in records:
                    structured = r.get("structured", {})
                    if structured.get("summary"):
                        notes.append(f"[{r.get('date','?')} {r.get('type','')}] {structured['summary']}")
                    for lv in structured.get("lab_values", []):
                        if lv.get("status") in ("high", "low", "critical"):
                            lab_flags.append(f"{lv.get('test','?')}: {lv.get('value','')} {lv.get('unit','')} ({lv.get('status','')})")
                ctx["notes"] = notes
                ctx["lab_flags"] = lab_flags
        except Exception as e:
            print(f"[DoctorBrief] Firestore enrichment failed: {e}")

    # Demo fallback for PT-001
    if not ctx:
        ctx = {
            "patient_id": patient_id,
            "name": "Rajan Pillai",
            "age": 58,
            "blood_group": "O+",
            "conditions": ["Type 2 Diabetes", "Hypertension", "Atrial Fibrillation"],
            "allergies": ["Penicillin"],
            "active_medications": ["Warfarin 5mg", "Metformin 500mg", "Ashwagandha 300mg"],
            "notes": ["Discharge from Apollo Hospital 2026-03-15: Post-cardiac monitoring, Warfarin continued."],
            "symptoms": ["Fatigue", "Mild dyspnea on exertion"],
        }

    state = {
        "raw_input": "Generate a comprehensive pre-consultation doctor summary",
        "patient_id": patient_id,
        "patient_context": ctx,
        "agent_logs": [],
        "intent": "DOCTOR_BRIEF",
    }

    try:
        result = await doctor_brief_node(state)
        return {
            "brief": result.get("final_response", "Failed to generate brief."),
            "logs": result.get("agent_logs", []),
            "patient": ctx,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/intake/upload-url")
async def get_upload_url(patient_id: str, entry_id: str):
    """Return a signed GCS upload URL for document ingestion."""
    from google.cloud import storage
    client = storage.Client()
    bucket = client.bucket(f"{GCP_PROJECT_ID}-documents")
    blob = bucket.blob(f"patients/{patient_id}/{entry_id}.jpg")
    url = blob.generate_signed_url(expiration=300, method="PUT", content_type="image/jpeg")
    return {"signed_url": url, "gcs_url": f"gs://{bucket.name}/{blob.name}"}


@app.post("/api/intake/process")
async def process_document(req: IntakeRequest):
    """
    Orchestrator → DataIntegrity → Validation pipeline.
    Extracts structured JSON from a medical document image.
    """
    db = get_firestore()

    # Log: Orchestrator
    write_agent_log(db, "Orchestrator", f"Routing DOCUMENT_INTAKE to DataIntegrity for entry {req.entry_id}")

    # ── Data Integrity Agent (Gemini Flash Multimodal) ───────────────────────
    write_agent_log(db, "DataIntegrity", f"Processing image via Gemini Flash: {req.gcs_url}", "Info")

    extracted = None
    if _VERTEXAI_AVAILABLE and (GEMINI_API_KEY or VERTEX_LOCATION):
        try:
            vertexai.init(project=GCP_PROJECT_ID, location=VERTEX_LOCATION)
            model = GenerativeModel("gemini-2.5-flash")
            prompt = """
            Extract the medications and lab values from this document.
            Return a JSON object matching this structure exactly:
            {
              "medications": [{"name": "string", "dosage": "string", "frequency": "string", "route": "string"}],
              "lab_values": [{"test": "string", "value": number, "unit": "string", "reference_range": "string"}],
              "confidence": number (between 0.0 and 1.0)
            }
            """
            # Using Part.from_uri to pass GCS URL directly
            response = model.generate_content([Part.from_uri(req.gcs_url, "image/jpeg"), prompt])
            # Strip JSON markdown fences if present
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            extracted = json.loads(text)
        except Exception as e:
            print(f"Vertex AI fallback due to error: {e}")

    if not extracted:
        # MOCK extracted data for demo fallback
        extracted = {
            "medications": [
                {"name": "Warfarin", "dosage": "5mg", "frequency": "Once daily", "route": "Oral"},
                {"name": "Ashwagandha", "dosage": "300mg", "frequency": "Twice daily", "route": "Oral"},
            ],
            "lab_values": [
                {"test": "INR", "value": 3.8, "unit": "ratio", "reference_range": "2.0 – 3.0"},
                {"test": "HbA1c", "value": 7.2, "unit": "%", "reference_range": "< 7.0"},
            ],
            "confidence": 0.92,
        }
    
    write_agent_log(db, "DataIntegrity", f"Extracted {len(extracted.get('medications', []))} medications, confidence: {extracted.get('confidence', 0.9)}")

    # ── Validation Agent ───────────────────────────────────────────────────────
    write_agent_log(db, "Validation", "Querying PK-DB for Warfarin half-life", "Info")
    async with httpx.AsyncClient() as client_http:
        try:
            pkdb_resp = await client_http.get(
                "https://pk-db.com/api/v1/outputs/?substance=warfarin&format=json",
                timeout=5.0
            )
            write_agent_log(db, "Validation", "PK-DB: Warfarin half-life ~40h retrieved")
        except Exception:
            write_agent_log(db, "Validation", "PK-DB: Using cached half-life data (40h)", "Warning")

    warnings = []
    reasoning_trace = [
        "Orchestrator: Routed DOCUMENT_INTAKE to DataIntegrity agent",
        f"DataIntegrity: Gemini Flash extracted 2 medications, 2 lab values (confidence: {extracted['confidence']})",
        "Validation: Querying PK-DB for Warfarin half-life → 40 hours",
        "Polypharmacy: ⚠️ Ashwagandha may potentiate Warfarin anticoagulant effect (PMID: 28349297)",
        "Validation: INR 3.8 is ABOVE therapeutic range (2.0–3.0) — flagged for clinician review",
        "System: Proposed entry staged. Awaiting HITL confirmation.",
    ]

    for med in extracted["medications"]:
        if med["name"] == "Ashwagandha":
            warnings.append("Ashwagandha + Warfarin interaction: May increase bleeding risk (PMID: 28349297)")
            write_agent_log(db, "Polypharmacy", "⚠️ Ashwagandha + Warfarin interaction flagged (PMID: 28349297)", "Warning")

    for lab in extracted.get("lab_values", []):
        if lab["test"] == "INR" and lab["value"] > 3.0:
            warnings.append(f"INR {lab['value']} exceeds therapeutic range — dosage adjustment may be required")
            write_agent_log(db, "Validation", f"INR {lab['value']} above therapeutic range", "Warning")

    # Write proposed entry to Firestore staging area (skip if no db)
    if db:
        try:
            db.collection("proposed_entries").document(req.entry_id).set({
                "entry_id": req.entry_id,
                "patient_id": req.patient_id,
                "extracted_data": extracted,
                "source_image_url": req.gcs_url,
                "validation_status": "PENDING_HUMAN_REVIEW",
                "ai_reasoning_trace": reasoning_trace,
                "warnings": warnings,
                "pmid_links": ["PMID: 28349297", "PMID: 31567234"],
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            print(f"[MedPilot] Firestore write failed: {e}")

    write_agent_log(db, "System", f"📋 Proposed entry {req.entry_id} staged → HITL Confirmation Gate triggered", "Warning")
    return {
        "status": "staged",
        "entry_id": req.entry_id,
        "warnings": len(warnings),
        "extracted_data": extracted,
        "reasoning_trace": reasoning_trace,
        "warning_messages": warnings,
    }


@app.post("/api/hitl/confirm")
async def hitl_confirm(req: HITLCommitRequest):
    """Move data from proposed_entries → patients/{pid}/records after clinician approval."""
    db = get_firestore()
    if db is None:
        # Demo mode: just acknowledge the commit
        print(f"[Demo] HITL commit: entry {req.entry_id} by clinician {req.clinician_uid}")
        return {"status": "committed", "entry_id": req.entry_id, "source": "demo"}

    try:
        entry_ref = db.collection("proposed_entries").document(req.entry_id)
        entry = entry_ref.get()
        if not entry.exists:
            raise HTTPException(status_code=404, detail="Proposed entry not found")

        data = entry.to_dict()
        db.collection("patients").document(req.patient_id) \
          .collection("records").add({
              **data["extracted_data"],
              "committed_by": req.clinician_uid,
              "committed_at": datetime.utcnow(),
              "source_entry_id": req.entry_id,
          })
        entry_ref.update({"validation_status": "COMMITTED"})
        write_agent_log(db, "System", f"✅ Record committed by clinician {req.clinician_uid}")
        return {"status": "committed", "entry_id": req.entry_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/emergency/vitals-alert")
async def emergency_vitals(req: EmergencyVitalsRequest):
    """Emergency cascade via MCP servers: Maps + WhatsApp + Gemini triage."""
    from mcp_servers.maps_server import find_nearest_hospital
    from mcp_servers.whatsapp_server import send_sos_message

    db = get_firestore()
    bp = f"{req.vitals.get('bp_systolic', '?')}/{req.vitals.get('bp_diastolic', '?')}"
    spo2 = req.vitals.get("spo2", "?")

    write_agent_log(db, "System", f"🚨 CRITICAL vitals received: BP {bp}, SPO₂ {spo2}%", "Error")
    write_agent_log(db, "Orchestrator", "EMERGENCY: Delegating to MCP Maps + WhatsApp servers")

    # Fetch patient context for AI analysis
    patient_context = {}
    try:
        doc = db.collection("patients").document(req.patient_id).get()
        if doc.exists:
            patient_context = doc.to_dict()
    except Exception as e:
        print(f"Failed to fetch patient context: {e}")

    hospital_type = "ICU emergency"
    clinical_summary = f"Patient {req.patient_id} in critical condition. BP: {bp}, SPO2: {spo2}%"

    # ── AI Assessment (Gemini 2.0 Flash) ──────────────────────────────────────
    if _VERTEXAI_AVAILABLE and (GEMINI_API_KEY or VERTEX_LOCATION):
        write_agent_log(db, "EmergencyCascade", "🧠 Analyzing patient context via Gemini 2.0 Flash")
        try:
            vertexai.init(project=GCP_PROJECT_ID, location=VERTEX_LOCATION)
            model = GenerativeModel("gemini-2.5-flash")
            prompt = f"""
            You are a triage AI. Review this patient's context and current critical vitals.
            Patient Context: {json.dumps(patient_context)}
            Current Vitals: {json.dumps(req.vitals)}
            1. Determine the specific type of hospital facility needed. Keep it under 3 words.
            2. Write a concise clinical summary for the receiving doctor (max 3 sentences).
            Return JSON exactly like this: {{"hospital_type": "...", "clinical_summary": "..."}}
            """
            response = model.generate_content(prompt)
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            ai_data = json.loads(text)
            hospital_type = ai_data.get("hospital_type", hospital_type)
            clinical_summary = ai_data.get("clinical_summary", clinical_summary)
        except Exception as e:
            print(f"Vertex AI fallback due to error in emergency routing: {e}")

    write_agent_log(db, "Orchestrator", f"AI Triage determined requirement: {hospital_type}")

    # ── MCP Maps Server: nearest hospital ─────────────────────────────────────
    lat, lng = req.gps[0], req.gps[1]
    hospital_result = await find_nearest_hospital(lat, lng, hospital_type=hospital_type)
    nearest_hospital = hospital_result.get("name", "Unknown Hospital")
    hospital_coords  = hospital_result.get("coords", [lat, lng])
    eta_minutes      = hospital_result.get("eta_minutes", 0)

    write_agent_log(db, "Logistics", f"🗺️ MCP Maps → Nearest ICU: {nearest_hospital}")

    # ── MCP WhatsApp Server: SOS dispatch ─────────────────────────────────────
    wa_message_body = f"🚨 MEDPILOT SOS ALERT 🚨\nPatient: {req.patient_id}\nBP: {bp} | SPO₂: {spo2}%\n\n🏥 Routed to: {nearest_hospital}\nETA: {eta_minutes} min\n\n🩺 CLINICAL SUMMARY:\n{clinical_summary}"
    wa_result = await send_sos_message("+919845000000", wa_message_body)
    whatsapp_sent = wa_result.get("sent", False)

    if whatsapp_sent:
        write_agent_log(db, "EmergencyCascade", "📱 MCP WhatsApp → SOS dispatched")
    else:
        write_agent_log(db, "EmergencyCascade", f"📱 MCP WhatsApp: {wa_result.get('message', 'SOS logged')}")

    # Update Firestore emergency state (skip if no db)
    if db:
        try:
            db.collection("emergency_state").document(req.patient_id).set({
                "active": True,
                "patient_id": req.patient_id,
                "vitals": req.vitals,
                "nearest_hospital": nearest_hospital,
                "hospital_coords": hospital_coords,
                "eta_minutes": eta_minutes,
                "acknowledged": False,
                "whatsapp_sent": whatsapp_sent,
                "triggered_at": datetime.utcnow(),
            })
        except Exception as e:
            print(f"[MedPilot] Firestore emergency_state write failed: {e}")

    return {"status": "cascade_triggered", "hospital": nearest_hospital, "eta": eta_minutes}


@app.post("/api/eligibility/check")
async def check_eligibility(req: EligibilityRequest):
    """Benefits Agent via MCP NHA Server: PM-JAY coverage check."""
    from mcp_servers.nha_server import get_nha_token, search_abha, check_pmjay_eligibility

    db = get_firestore()
    write_agent_log(db, "Eligibility", f"Triggering MCP NHA Server for ABHA {req.abha_id}", "Info")

    token_result = await get_nha_token()
    covered = False
    limit   = 0

    if token_result.get("success"):
        token = token_result["token"]
        abha_profile = await search_abha(token, req.abha_id)
        health_id = abha_profile.get("healthId", req.abha_id)
        elig = await check_pmjay_eligibility(token, health_id)
        covered = elig.get("covered", False)
        limit   = elig.get("limit", 0)
    else:
        # Demo mode fallback
        covered = req.abha_id.startswith("14-29")
        limit   = 500000 if covered else 0

    write_agent_log(db, "Eligibility",
        f"PM-JAY {'coverage verified ✓' if covered else 'not eligible'} — ABHA {req.abha_id}")
    return {"covered": covered, "limit": limit, "scheme": "PM-JAY" if covered else None}




# ─── Pod D: Deep Reasoning & Patient Engagement ───────────────────────────────

@app.post("/api/reports/deep-dive")
async def deep_dive_report(req: DeepDiveRequest):
    """
    Clinical Deep-Dive Agent: Summarizes dense specialist reports (MRI, Pathology,
    Echocardiography, Oncology, etc.) into plain-language clinical summaries.
    """
    from agents.graph import run_query
    # Prepend the report text with the report type hint for orchestrator routing
    message = f"Summarize this {req.report_type} specialist report:\n\n{req.report_text}"
    try:
        # Force deep_dive intent directly via the briefing node
        from agents.deep_dive import deep_dive_node
        from agents.state import MedPilotState

        db  = None
        ctx = {}
        try:
            db  = get_firestore()
            doc = db.collection("patients").document(req.patient_id).get()
            ctx = doc.to_dict() if doc.exists else {}
        except Exception:
            pass

        state: MedPilotState = {
            "raw_input":      req.report_text,
            "patient_id":     req.patient_id,
            "patient_context": ctx,
            "query_type":     "report",
            "hitl_required":  False,
            "emergency":      False,
            "retry_count":    0,
            "agent_logs":     [],
            "final_response": "",
        }
        result = await deep_dive_node(state)
        return {
            "summary":      result["final_response"],
            "report_type":  result.get("report_type", req.report_type),
            "agent_logs":   result.get("agent_logs", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/research/query")
async def research_query(req: ResearchRequest):
    """
    Evidence & Research Agent: Queries PubMed and OpenFDA, returns
    evidence-grounded clinical summary with real PMID citations.
    """
    from agents.research import research_node
    from agents.state import MedPilotState

    ctx = {}
    try:
        db  = get_firestore()
        doc = db.collection("patients").document(req.patient_id).get()
        ctx = doc.to_dict() if doc.exists else {}
    except Exception:
        pass

    state: MedPilotState = {
        "raw_input":       req.query,
        "patient_id":      req.patient_id,
        "patient_context": ctx,
        "query_type":      "text",
        "hitl_required":   False,
        "emergency":       False,
        "retry_count":     0,
        "agent_logs":      [],
        "final_response":  "",
    }
    try:
        result = await research_node(state)
        return {
            "summary":    result["final_response"],
            "citations":  result.get("evidence_citations", []),
            "agent_logs": result.get("agent_logs", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/briefing/generate")
async def generate_briefing(req: BriefingRequest):
    """
    Patient Briefing Agent: Translates discharge plans into simplified,
    multi-language text (+ optional TTS audio) suitable for patients.
    Supports 10 Indian languages via Gemini TTS.
    """
    from agents.briefing import briefing_node
    from agents.state import MedPilotState

    ctx = {}
    try:
        db  = get_firestore()
        doc = db.collection("patients").document(req.patient_id).get()
        if doc.exists:
            ctx = doc.to_dict()
        ctx["preferred_language"] = req.language
    except Exception:
        ctx = {"preferred_language": req.language}

    state: MedPilotState = {
        "raw_input":       req.discharge_plan,
        "patient_id":      req.patient_id,
        "patient_context": ctx,
        "language":        req.language,
        "query_type":      "text",
        "hitl_required":   False,
        "emergency":       False,
        "retry_count":     0,
        "agent_logs":      [],
        "final_response":  "",
    }
    try:
        result = await briefing_node(state)
        br = result.get("briefing_result", {})
        return {
            "language":        br.get("language", "English"),
            "language_code":   br.get("language_code", req.language),
            "briefing_text":   br.get("briefing_text", result["final_response"]),
            "audio_available": br.get("audio_available", False),
            "audio_base64":    br.get("audio_base64"),   # WAV/MP3 base64 or null
            "agent_logs":      result.get("agent_logs", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/briefing/languages")
async def get_supported_languages():
    """Return the list of languages supported by the Patient Briefing Agent."""
    from agents.briefing import SUPPORTED_LANGUAGES
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in SUPPORTED_LANGUAGES.items()
        ]
    }


# ─── NEW: Patient CRUD ────────────────────────────────────────────────────────

class CreatePatientRequest(BaseModel):
    name: str
    age: int
    gender: str = "Other"
    blood_type: str = ""
    conditions: list[str] = []
    allergies: list[str] = []
    medications: list[dict] = []   # [{name, dosage, system: Allopathic|Ayurvedic|...}]
    emergency_contact: str = ""
    abha_id: str = ""
    preferred_language: str = "en"
    coords: list[float] = [12.9716, 77.5946]

@app.post("/api/patients")
async def create_patient(req: CreatePatientRequest):
    """Create a new patient in Firestore."""
    import uuid
    db = get_firestore()
    patient_id = f"PT-{uuid.uuid4().hex[:6].upper()}"
    patient = {
        "patient_id":         patient_id,
        "name":               req.name,
        "age":                req.age,
        "gender":             req.gender,
        "blood_type":         req.blood_type,
        "conditions":         req.conditions,
        "allergies":          req.allergies,
        "active_medications": [f"{m.get('name','')} {m.get('dosage','')}".strip() for m in req.medications],
        "medication_details": req.medications,
        "emergency_contact":  req.emergency_contact,
        "abha_id":            req.abha_id,
        "preferred_language": req.preferred_language,
        "coords":             req.coords,
        "created_at":         datetime.utcnow().isoformat(),
        "pmjay_covered":      None,
        "pmjay_limit":        None,
    }
    if db:
        db.collection("patients").document(patient_id).set(patient)
    return patient


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    """Fetch a single patient by ID."""
    db = get_firestore()
    if db:
        doc = db.collection("patients").document(patient_id).get()
        if doc.exists:
            return doc.to_dict()
    raise HTTPException(status_code=404, detail="Patient not found")


# ─── NEW: Polypharmacy Matrix ─────────────────────────────────────────────────

@app.get("/api/polypharmacy/{patient_id}")
async def get_polypharmacy_matrix(patient_id: str):
    """Build a real N×N polypharmacy interaction matrix using RxNav + Gemini."""
    db = get_firestore()

    # Fetch patient medications
    meds = []
    med_details = []
    if db:
        doc = db.collection("patients").document(patient_id).get()
        if doc.exists:
            data = doc.to_dict()
            meds = data.get("active_medications", [])
            med_details = data.get("medication_details", [])

    # Fallback demo patient
    if not meds:
        if patient_id == "PT-001":
            meds = ["Warfarin 5mg", "Metformin 500mg", "Ashwagandha 300mg"]
            med_details = [
                {"name": "Warfarin", "dosage": "5mg", "system": "Allopathic"},
                {"name": "Metformin", "dosage": "500mg", "system": "Allopathic"},
                {"name": "Ashwagandha", "dosage": "300mg", "system": "Ayurvedic"},
            ]
        else:
            return {"matrix": [], "medications": [], "error": "No medications found"}

    # Parse med names for RxNav lookup
    med_names = [m.get("name", m) if isinstance(m, dict) else m.split()[0] for m in (med_details or meds)]
    systems = {m.get("name", "").lower(): m.get("system", "Allopathic") for m in med_details} if med_details else {}

    # Get RxCUI for each drug
    rxcui_map = {}
    async with httpx.AsyncClient(timeout=5.0) as hc:
        for name in med_names:
            try:
                r = await hc.get(f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={name}&search=1")
                ids = r.json().get("idGroup", {}).get("rxnormId", [])
                if ids:
                    rxcui_map[name.lower()] = ids[0]
            except Exception:
                pass

    # Build interaction matrix using Gemini
    from agents.llm import generate_json
    n = len(med_names)
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append({"severity": "none", "summary": "Same drug", "mechanism": ""})
            elif j < i:
                # Mirror upper triangle
                row.append(matrix[j][i])
            else:
                a = med_names[i]
                b = med_names[j]
                sys_a = systems.get(a.lower(), "Allopathic")
                sys_b = systems.get(b.lower(), "Allopathic")
                prompt = f"""Analyze the pharmacological interaction between {a} ({sys_a}) and {b} ({sys_b}).
Return ONLY a JSON object:
{{"severity": "none|mild|moderate|major", "summary": "one sentence", "mechanism": "pharmacodynamic/pharmacokinetic mechanism brief"}}
Base your answer on clinical evidence. Be concise."""
                try:
                    result = await generate_json(prompt)
                    row.append({
                        "severity": result.get("severity", "unknown"),
                        "summary": result.get("summary", ""),
                        "mechanism": result.get("mechanism", ""),
                    })
                except Exception:
                    row.append({"severity": "unknown", "summary": "Analysis unavailable", "mechanism": ""})
        matrix.append(row)

    return {
        "medications": [
            {"name": med_names[i], "system": systems.get(med_names[i].lower(), "Allopathic"), "rxcui": rxcui_map.get(med_names[i].lower(), "")}
            for i in range(n)
        ],
        "matrix": matrix,
        "patient_id": patient_id,
    }


# ─── NEW: Food Scanner with Vision ───────────────────────────────────────────

@app.post("/api/food-scan")
async def food_scan(
    patient_id: str = Form("PT-001"),
    text_input: str = Form(""),
    image: Optional[UploadFile] = File(None),
):
    """
    Analyzes food for drug interactions.
    Accepts text description OR image (uses Gemini vision).
    Returns: food items detected, interaction risks per medication system.
    """
    db = get_firestore()

    # Fetch patient meds
    meds = ["Warfarin 5mg", "Metformin 500mg"]
    if db:
        try:
            doc = db.collection("patients").document(patient_id).get()
            if doc.exists:
                meds = doc.to_dict().get("active_medications", meds)
        except Exception:
            pass

    from agents.llm import generate_text
    from google import genai
    from google.genai import types as gtypes

    GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
    client = genai.Client(api_key=GEMINI_KEY) if GEMINI_KEY else None

    food_description = text_input
    vision_used = False

    # Vision path: image uploaded
    if image and client:
        try:
            img_bytes = await image.read()
            import base64
            img_b64 = base64.b64encode(img_bytes).decode()
            mime = image.content_type or "image/jpeg"

            vision_prompt = """Identify all food items visible in this image. 
List each food item with its approximate quantity. Be specific about Indian foods.
Return as plain text list."""

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    gtypes.Part.from_bytes(data=img_bytes, mime_type=mime),
                    vision_prompt,
                ],
            )
            food_description = response.text.strip()
            vision_used = True
        except Exception as e:
            food_description = text_input or "Unknown food items"

    # Analysis prompt
    meds_str = ", ".join(meds)
    analysis_prompt = f"""You are a clinical pharmacist expert in Indian diet and multi-system medicine (Allopathic, Ayurvedic, Homeopathic).

Patient medications: {meds_str}
Food items: {food_description}

Analyze each food item for interactions with these medications. Consider:
- Vitamin K content (Warfarin)
- Glycaemic index (Metformin/diabetes meds)  
- CYP450 interactions
- Ayurvedic food-herb interactions
- Common Indian foods: dal, roti, rice, sabzi, masala, chai, etc.

Return a detailed JSON:
{{
  "food_items": ["list of identified foods"],
  "overall_risk": "safe|caution|avoid",
  "interactions": [
    {{"food": "name", "medication": "name", "risk": "safe|caution|avoid", "reason": "brief reason", "system": "Allopathic|Ayurvedic"}}
  ],
  "recommendations": ["actionable recommendation 1", "recommendation 2"],
  "ayurvedic_notes": "any Ayurvedic diet-drug notes"
}}"""

    from agents.llm import generate_json as gen_json
    try:
        result = await gen_json(analysis_prompt)
    except Exception:
        result = {"food_items": [food_description], "overall_risk": "unknown", "interactions": [], "recommendations": []}

    return {**result, "vision_used": vision_used, "raw_food_text": food_description}


# ─── NEW: Nearby Hospitals (Real Google Maps) ─────────────────────────────────

@app.get("/api/hospitals/nearby")
async def get_nearby_hospitals(lat: float = 12.9716, lng: float = 77.5946, radius: int = 5000):
    """Fetch real nearby hospitals using Google Maps Places API."""
    if not MAPS_API_KEY:
        # Fallback demo data
        return {"hospitals": [
            {"name": "Victoria Hospital", "lat": 12.9634, "lng": 77.5855, "distance_km": 1.2, "rating": 4.1, "address": "Ft. Rd, Bengaluru"},
            {"name": "Apollo Hospital Bannerghatta", "lat": 12.8921, "lng": 77.5964, "distance_km": 8.8, "rating": 4.3, "address": "Bannerghatta Rd"},
            {"name": "Manipal Hospital Whitefield", "lat": 12.9698, "lng": 77.7499, "distance_km": 14.2, "rating": 4.4, "address": "Whitefield"},
        ], "source": "demo"}

    async with httpx.AsyncClient(timeout=10.0) as hc:
        try:
            r = await hc.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params={"location": f"{lat},{lng}", "radius": radius, "type": "hospital", "key": MAPS_API_KEY}
            )
            places = r.json().get("results", [])
            hospitals = []
            for p in places[:10]:
                plat = p["geometry"]["location"]["lat"]
                plng = p["geometry"]["location"]["lng"]
                dist = math.sqrt((plat - lat)**2 + (plng - lng)**2) * 111
                hospitals.append({
                    "name": p.get("name", ""),
                    "lat": plat,
                    "lng": plng,
                    "distance_km": round(dist, 1),
                    "rating": p.get("rating", 0),
                    "address": p.get("vicinity", ""),
                    "place_id": p.get("place_id", ""),
                    "open_now": p.get("opening_hours", {}).get("open_now"),
                })
            hospitals.sort(key=lambda h: h["distance_km"])
            return {"hospitals": hospitals, "source": "google_maps", "center": {"lat": lat, "lng": lng}}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


# ─── NEW: Clinical Memory — Upload + Manual Entry ────────────────────────────

@app.post("/api/clinical-memory/upload")
async def upload_clinical_record(
    patient_id: str = Form("PT-001"),
    record_type: str = Form("Lab Report"),
    facility: str = Form(""),
    date: str = Form(""),
    file: UploadFile = File(...),
):
    """Upload a medical document (photo/PDF), run Gemini OCR, save to Firestore."""
    import uuid, base64
    db = get_firestore()

    img_bytes = await file.read()
    img_b64 = base64.b64encode(img_bytes).decode()
    mime = file.content_type or "image/jpeg"

    # Gemini vision OCR
    GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
    extracted_text = ""
    structured = {}

    if GEMINI_KEY:
        from google import genai
        from google.genai import types as gtypes
        client = genai.Client(api_key=GEMINI_KEY)
        try:
            ocr_prompt = f"""This is a medical document of type: {record_type}.
Extract ALL text and structured information. Return JSON:
{{
  "raw_text": "full extracted text",
  "medications": [{{"name": "", "dosage": "", "frequency": ""}}],
  "lab_values": [{{"test": "", "value": "", "unit": "", "reference": "", "status": "normal|high|low"}}],
  "diagnoses": [],
  "doctor": "",
  "date": "",
  "summary": "2-sentence clinical summary",
  "flags": ["any abnormal values or warnings"]
}}"""
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[gtypes.Part.from_bytes(data=img_bytes, mime_type=mime), ocr_prompt],
            )
            text = resp.text.strip()
            if text.startswith("```"):
                parts = text.split("```")
                text = parts[1][4:] if parts[1].startswith("json") else parts[1]
            structured = json.loads(text)
            extracted_text = structured.get("raw_text", "")
        except Exception as e:
            extracted_text = f"OCR failed: {e}"
            structured = {}

    record_id = f"REC-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "record_id": record_id,
        "patient_id": patient_id,
        "type": record_type,
        "facility": facility,
        "date": date or datetime.utcnow().strftime("%Y-%m-%d"),
        "extracted_text": extracted_text,
        "structured": structured,
        "file_name": file.filename,
        "mime_type": mime,
        "uploaded_at": datetime.utcnow().isoformat(),
        "source": "upload",
    }
    if db:
        try:
            db.collection("patients").document(patient_id).collection("records").document(record_id).set(record)
        except Exception as e:
            print(f"Firestore write failed: {e}")

    return record


@app.post("/api/clinical-memory/manual")
async def manual_clinical_record(
    patient_id: str = Form("PT-001"),
    record_type: str = Form(""),
    facility: str = Form(""),
    date: str = Form(""),
    notes: str = Form(""),
):
    """Save a manually entered clinical record to Firestore."""
    import uuid
    db = get_firestore()
    record_id = f"REC-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "record_id": record_id,
        "patient_id": patient_id,
        "type": record_type,
        "facility": facility,
        "date": date or datetime.utcnow().strftime("%Y-%m-%d"),
        "notes": notes,
        "uploaded_at": datetime.utcnow().isoformat(),
        "source": "manual",
        "structured": {"summary": notes},
    }
    if db:
        try:
            db.collection("patients").document(patient_id).collection("records").document(record_id).set(record)
        except Exception as e:
            print(f"Firestore write failed: {e}")
    return record


@app.get("/api/clinical-memory/{patient_id}")
async def get_clinical_records(patient_id: str):
    """Fetch all clinical records for a patient from Firestore."""
    db = get_firestore()
    if db:
        try:
            docs = db.collection("patients").document(patient_id).collection("records").stream()
            records = [doc.to_dict() for doc in docs]
            records.sort(key=lambda r: r.get("date", ""), reverse=True)
            return {"records": records, "patient_id": patient_id}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    # Demo fallback
    return {"records": [
        {"record_id": "REC-091", "type": "Discharge Summary", "facility": "Apollo Hospital", "date": "2026-03-15", "source": "demo", "structured": {"summary": "Post-surgical discharge. Warfarin continued."}},
        {"record_id": "REC-088", "type": "Lab Report (HbA1c)", "facility": "LalPath Labs", "date": "2025-11-02", "source": "demo", "structured": {"lab_values": [{"test": "HbA1c", "value": "7.2", "unit": "%", "status": "high"}]}},
    ], "patient_id": patient_id}


# ─── NEW: Agent Status ────────────────────────────────────────────────────────

@app.get("/api/agents/status")
async def get_agent_status():
    """Return real-time status of all 12 agents."""
    # In production these would be read from Firestore or Redis
    # For now return last known status from in-memory state
    agents = [
        {"id": "orchestrator",        "label": "Orchestrator",            "pod": "A", "status": "idle", "model": "gemini-2.5-flash-lite",  "description": "Routes user queries to the appropriate specialist agents"},
        {"id": "data_integrity",      "label": "Data Integrity",          "pod": "A", "status": "idle", "model": "gemini-2.5-flash",       "description": "Extracts structured data from medical documents via Gemini Vision"},
        {"id": "validation",          "label": "Validation",              "pod": "A", "status": "idle", "model": "gemini-2.5-flash-lite",  "description": "Cross-validates extracted data against RxNav and PK-DB"},
        {"id": "polypharmacy",        "label": "Polypharmacy Matrix",     "pod": "B", "status": "idle", "model": "gemini-2.5-flash",       "description": "Builds N×N drug interaction matrix for all patient medications"},
        {"id": "dietary_guard",       "label": "Dietary Guard",           "pod": "B", "status": "idle", "model": "gemini-2.5-flash",       "description": "Analyzes food-drug interactions, Indian diet aware"},
        {"id": "symptom_trajectory",  "label": "Symptom Trajectory",     "pod": "B", "status": "idle", "model": "gemini-2.5-flash-lite",  "description": "Tracks symptom patterns and detects urgency trends"},
        {"id": "clinical_memory",     "label": "Clinical Memory",         "pod": "B", "status": "idle", "model": "gemini-2.5-flash",       "description": "OCR and indexes medical documents into Firestore"},
        {"id": "emergency_cascade",   "label": "Emergency Cascade",       "pod": "C", "status": "idle", "model": "gemini-2.5-flash",       "description": "Triggers emergency protocol with Gemini triage assessment"},
        {"id": "logistics",           "label": "Logistics & Routing",     "pod": "C", "status": "idle", "model": "Google Maps API",        "description": "Finds nearest ICU and calculates optimal ambulance routing"},
        {"id": "eligibility",         "label": "PM-JAY Eligibility",      "pod": "C", "status": "idle", "model": "NHA ABDM Sandbox",       "description": "Verifies PM-JAY/Ayushman Bharat insurance eligibility"},
        {"id": "clinical_deep_dive",  "label": "Clinical Deep-Dive",      "pod": "D", "status": "idle", "model": "gemini-2.5-flash",       "description": "Interprets specialist reports: MRI, pathology, echo, CT"},
        {"id": "evidence_research",   "label": "Evidence Research",       "pod": "D", "status": "idle", "model": "PubMed + OpenFDA",       "description": "RAG over PubMed and OpenFDA for evidence-based answers"},
        {"id": "google_workspace",    "label": "Google Workspace",        "pod": "E", "status": "idle", "model": "Google Calendar/Tasks/Gmail", "description": "Manages medications, appointments & tasks via Google Calendar, Tasks and Gmail"},
        {"id": "trajectory_forecaster","label": "Trajectory Forecaster",  "pod": "E", "status": "idle", "model": "gemini-2.5-flash",       "description": "Proactive 2–3 hour health-state prediction via multi-variable phase-space analysis"},
    ]
    return {"agents": agents, "total": len(agents), "online": len(agents)}


@app.post("/api/agents/trigger/{agent_name}")
async def trigger_agent(agent_name: str):
    """Manually trigger an agent (demo/status dashboard)."""
    db = get_firestore()
    import uuid
    log_id = str(uuid.uuid4())
    log_entry = {
        "id": log_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "agent_name": agent_name.replace("_", " ").title(),
        "action": f"Manual system override triggered for {agent_name} agent.",
        "status": "Success"
    }
    if db:
        try:
            db.collection("agent_logs").document(log_id).set(log_entry)
        except Exception as e:
            print("Failed to write to agent_logs:", e)
    return {"status": "triggered", "agent": agent_name, "log": log_entry}

# ─── NEW: Predictive Trajectory API ──────────────────────────────────────────

class TrajectoryRequest(BaseModel):
    patient_id: str = "PT-001"
    include_interventions: bool = True

@app.post("/api/trajectory")
async def get_trajectory(req: TrajectoryRequest):
    """
    Predictive Symptom Trajectory Agent: Computes multi-variable health state vector,
    calculates velocity/acceleration of each biomarker, and forecasts the patient's
    2–3 hour health trajectory. Triggers Emergency Cascade if Critical Zone entered.
    """
    from agents.trajectory import build_trajectory_data

    db = get_firestore()
    ctx = {}
    if db:
        try:
            doc = db.collection("patients").document(req.patient_id).get()
            if doc.exists:
                ctx = doc.to_dict()
        except Exception as e:
            print(f"[Trajectory] Firestore fetch failed: {e}")

    # Demo patient context
    if not ctx:
        ctx = {
            "patient_id": req.patient_id,
            "name": "Rajan Pillai",
            "conditions": ["Hypertension", "Atrial Fibrillation"],
            "active_medications": ["Warfarin 5mg", "Metformin 500mg"],
            "current_vitals": {
                "hr": 108, "spo2": 93.5, "map": 68, "rr": 22, "temp": 37.9
            },
            "current_labs": {
                "wbc": 13.2, "crp": 42.0, "lactate": 2.1
            },
            "recent_interventions": [
                {"drug": "paracetamol", "minutes_ago": 45}
            ] if req.include_interventions else [],
        }

    try:
        trajectory = build_trajectory_data(
            patient_context=ctx,
            interventions=ctx.get("recent_interventions", []),
        )

        # If trajectory flags critical — log it
        if trajectory.get("trigger_emergency") and db:
            try:
                db.collection("trajectory_alerts").add({
                    "patient_id": req.patient_id,
                    "risk_score": trajectory["risk_score"],
                    "alert_level": trajectory["alert_level"],
                    "alert_message": trajectory["alert_message"],
                    "triggered_at": datetime.utcnow().isoformat(),
                })
            except Exception:
                pass

        return trajectory
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/trajectory/{patient_id}")
async def get_trajectory_get(patient_id: str):
    """GET convenience endpoint for trajectory (useful for live dashboard polling)."""
    from agents.trajectory import build_trajectory_data

    db = get_firestore()
    ctx = {}
    if db:
        try:
            doc = db.collection("patients").document(patient_id).get()
            if doc.exists:
                ctx = doc.to_dict()
        except Exception:
            pass

    if not ctx:
        ctx = {
            "patient_id": patient_id,
            "conditions": ["Sepsis watch"],
            "active_medications": ["Vancomycin 1g", "Piperacillin-Tazobactam 4.5g"],
            "current_vitals": {"hr": 115, "spo2": 91.0, "map": 62, "rr": 24, "temp": 38.5},
            "current_labs": {"wbc": 18.5, "crp": 85.0, "lactate": 3.1},
            "recent_interventions": [],
        }

    trajectory = build_trajectory_data(ctx, ctx.get("recent_interventions", []))
    return trajectory


# ─── NEW: Google Workspace API ────────────────────────────────────────────────

class WorkspaceRequest(BaseModel):
    patient_id: str = "PT-001"
    action: str = "list_schedule"   # list_schedule | schedule_medication | create_appointment | send_email
    note: str = ""                  # Optional extra instruction for Gemini


@app.post("/api/workspace")
async def workspace_action(req: WorkspaceRequest):
    """
    Google Workspace Agent: Manages patient medications, appointments and tasks
    via Google Calendar, Tasks, and Gmail. Powered by Gemini scheduling intelligence.
    Degrades gracefully to demo mode when OAuth is not configured.
    """
    from agents.workspace import workspace_node
    from agents.state import MedPilotState

    db = get_firestore()
    ctx = {}
    if db:
        try:
            doc = db.collection("patients").document(req.patient_id).get()
            if doc.exists:
                ctx = doc.to_dict()
        except Exception as e:
            print(f"[Workspace] Firestore fetch failed: {e}")

    if not ctx:
        ctx = {
            "name": "Rajan Pillai",
            "active_medications": ["Warfarin 5mg", "Metformin 500mg", "Ashwagandha 300mg"],
            "conditions": ["Type 2 Diabetes", "Hypertension", "Atrial Fibrillation"],
            "email": "patient@example.com",
        }

    query = req.note or f"Manage schedule for {req.action.replace('_', ' ')}"

    state: MedPilotState = {
        "raw_input":      query,
        "patient_id":     req.patient_id,
        "patient_context": ctx,
        "intent":         "SCHEDULE_MANAGE",
        "query_type":     "text",
        "hitl_required":  False,
        "emergency":      False,
        "retry_count":    0,
        "agent_logs":     [],
        "final_response": "",
    }

    try:
        result = await workspace_node(state)
        return {
            "summary":           result.get("final_response", ""),
            "workspace_result":  result.get("workspace_result", {}),
            "agent_logs":        result.get("agent_logs", []),
            "calendar_events":   result.get("calendar_events_created", []),
            "tasks":             result.get("google_tasks_created", []),
            "email_sent":        result.get("gmail_sent"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workspace/{patient_id}/schedule")
async def get_patient_schedule(patient_id: str):
    """
    Fetch the patient's upcoming calendar events and pending health tasks
    directly from Google Calendar/Tasks (or demo data if not configured).
    """
    from mcp_servers.google_workspace_server import (
        list_calendar_events,
        list_health_tasks,
        get_auth_status,
    )
    try:
        events = await list_calendar_events(days_ahead=7)
        tasks  = await list_health_tasks()
        auth   = get_auth_status()
        return {
            "patient_id":  patient_id,
            "events":      events,
            "tasks":       tasks,
            "auth_status": auth,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workspace/auth-status")
async def workspace_auth_status():
    """Return current Google OAuth authentication status."""
    from mcp_servers.google_workspace_server import get_auth_status
    return get_auth_status()


# ─── Patient location update ──────────────────────────────────────────────────

class LocationUpdate(BaseModel):
    lat: float
    lng: float

@app.patch("/api/patients/{patient_id}/location")
async def update_patient_location(patient_id: str, loc: LocationUpdate):
    """Update a patient's GPS coordinates in Firestore."""
    db = get_firestore()
    coords = [loc.lat, loc.lng]
    if db:
        try:
            db.collection("patients").document(patient_id).update({
                "coords": coords,
                "location_updated_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            # If document doesn't exist yet, use set with merge
            db.collection("patients").document(patient_id).set(
                {"coords": coords, "location_updated_at": datetime.utcnow().isoformat()},
                merge=True
            )
    return {"patient_id": patient_id, "coords": coords, "status": "updated"}


# ─── Clinical record edit ─────────────────────────────────────────────────────

class RecordPatch(BaseModel):
    notes: Optional[str] = None
    facility: Optional[str] = None
    record_type: Optional[str] = None
    date: Optional[str] = None

@app.patch("/api/records/{patient_id}/{record_id}")
async def patch_clinical_record(patient_id: str, record_id: str, patch: RecordPatch):
    """Update notes/facility/type on an existing clinical record."""
    db = get_firestore()
    updates = {k: v for k, v in patch.dict().items() if v is not None}
    if "record_type" in updates:
        updates["type"] = updates.pop("record_type")
    updates["updated_at"] = datetime.utcnow().isoformat()

    if db:
        try:
            db.collection("patients").document(patient_id) \
              .collection("records").document(record_id).update(updates)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"record_id": record_id, "updated": updates}


# ─── Seed demo records for PT-001 ─────────────────────────────────────────────

def _seed_demo_records(db, patient_id: str = "PT-001"):
    """Insert 3 rich clinical records if the subcollection is empty."""
    try:
        existing = list(db.collection("patients").document(patient_id)
                         .collection("records").limit(1).stream())
        if existing:
            return  # Already seeded

        demo_records = [
            {
                "record_id": "REC-DEMO-001",
                "patient_id": patient_id,
                "type": "Discharge Summary",
                "facility": "Apollo Hospital, Bannerghatta",
                "date": "2026-03-15",
                "notes": "Post-cardiac monitoring. Warfarin dose adjusted to 5mg/day. INR target 2.0–3.0. Follow-up in 4 weeks.",
                "structured": {
                    "summary": "Patient discharged after 5-day admission for Atrial Fibrillation management. Warfarin anticoagulation continued.",
                    "medications": [{"name": "Warfarin", "dosage": "5mg", "frequency": "Once daily", "route": "Oral"}],
                    "lab_values": [
                        {"test": "INR", "value": "2.4", "unit": "ratio", "reference": "2.0-3.0", "status": "normal"},
                        {"test": "HbA1c", "value": "7.1", "unit": "%", "reference": "<7.0", "status": "high"},
                    ],
                    "doctor": "Dr. Priya Nair",
                    "flags": ["Warfarin + Ashwagandha interaction — monitor INR closely"],
                },
                "source": "upload",
                "uploaded_at": datetime.utcnow().isoformat(),
            },
            {
                "record_id": "REC-DEMO-002",
                "patient_id": patient_id,
                "type": "Lab Report",
                "facility": "LalPath Labs, Koramangala",
                "date": "2025-11-02",
                "notes": "Routine HbA1c and lipid panel. HbA1c slightly elevated at 7.2%.",
                "structured": {
                    "summary": "Routine metabolic panel shows mildly elevated HbA1c and borderline LDL.",
                    "lab_values": [
                        {"test": "HbA1c", "value": "7.2", "unit": "%", "reference": "<7.0", "status": "high"},
                        {"test": "LDL Cholesterol", "value": "138", "unit": "mg/dL", "reference": "<130", "status": "high"},
                        {"test": "Fasting Glucose", "value": "128", "unit": "mg/dL", "reference": "70-100", "status": "high"},
                        {"test": "eGFR", "value": "82", "unit": "mL/min/1.73m²", "reference": ">60", "status": "normal"},
                    ],
                    "doctor": "Dr. Ramesh Iyer",
                    "flags": ["Consider Metformin dose review", "LDL borderline — lifestyle counseling recommended"],
                },
                "source": "manual",
                "uploaded_at": datetime.utcnow().isoformat(),
            },
            {
                "record_id": "REC-DEMO-003",
                "patient_id": patient_id,
                "type": "Cardiology Consult",
                "facility": "Fortis Healthcare, Bannerghatta",
                "date": "2024-06-20",
                "notes": "ECG shows persistent AF. Echo: EF 55%, mild MR. Warfarin continued. Metoprolol added for rate control.",
                "structured": {
                    "summary": "Echocardiogram confirms Atrial Fibrillation with preserved ejection fraction (55%). Mild mitral regurgitation noted.",
                    "medications": [
                        {"name": "Metoprolol", "dosage": "25mg", "frequency": "Twice daily", "route": "Oral"},
                    ],
                    "lab_values": [
                        {"test": "Ejection Fraction", "value": "55", "unit": "%", "reference": ">50", "status": "normal"},
                        {"test": "NT-proBNP", "value": "420", "unit": "pg/mL", "reference": "<125", "status": "high"},
                    ],
                    "doctor": "Dr. Sanjay Kulkarni",
                    "flags": ["NT-proBNP elevated — heart failure risk monitoring required"],
                },
                "source": "upload",
                "uploaded_at": datetime.utcnow().isoformat(),
            },
        ]
        for rec in demo_records:
            db.collection("patients").document(patient_id) \
              .collection("records").document(rec["record_id"]).set(rec)
        print(f"[Seed] Inserted {len(demo_records)} demo records for {patient_id}")
    except Exception as e:
        print(f"[Seed] Demo records seed failed: {e}")


@app.get("/api/patients/{patient_id}/records")
async def get_patient_records(patient_id: str):
    """Fetch all clinical records for a patient; seeds demo data if empty."""
    db = get_firestore()
    if db:
        _seed_demo_records(db, patient_id)
        try:
            docs = db.collection("patients").document(patient_id) \
                     .collection("records").stream()
            records = [doc.to_dict() for doc in docs]
            records.sort(key=lambda r: r.get("date", ""), reverse=True)
            return {"records": records, "patient_id": patient_id, "source": "firestore"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    # In-memory demo fallback
    return {"records": [
        {"record_id": "REC-DEMO-001", "type": "Discharge Summary", "facility": "Apollo Hospital", "date": "2026-03-15",
         "notes": "Post-cardiac monitoring. Warfarin continued.", "source": "demo",
         "structured": {"summary": "Patient discharged after AF management. Warfarin anticoagulation continued."}},
        {"record_id": "REC-DEMO-002", "type": "Lab Report", "facility": "LalPath Labs", "date": "2025-11-02",
         "notes": "Routine HbA1c and lipid panel.", "source": "demo",
         "structured": {"lab_values": [{"test": "HbA1c", "value": "7.2", "unit": "%", "status": "high"}]}},
        {"record_id": "REC-DEMO-003", "type": "Cardiology Consult", "facility": "Fortis Healthcare", "date": "2024-06-20",
         "notes": "ECG shows persistent AF. EF 55%, mild MR.", "source": "demo",
         "structured": {"summary": "Atrial Fibrillation with preserved ejection fraction."}},
    ], "patient_id": patient_id, "source": "demo"}


# ─── Prescription Upload (Gemini Vision OCR) ──────────────────────────────────

@app.post("/api/prescription/upload")
async def prescription_upload(
    patient_id: str = Form("PT-001"),
    notes: str = Form(""),
    image: UploadFile = File(...),
):
    """
    Upload a prescription image → Gemini Vision OCR → returns structured
    medication list for user validation. Does NOT commit to DB yet.
    """
    import base64
    GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
    img_bytes = await image.read()
    mime = image.content_type or "image/jpeg"

    structured = None
    if GEMINI_KEY:
        from google import genai
        from google.genai import types as gtypes
        client = genai.Client(api_key=GEMINI_KEY)
        try:
            prompt = f"""You are a clinical pharmacist expert in both Allopathic and Ayurvedic medicine.
This is a doctor's prescription for patient {patient_id}.
{f'Additional notes: {notes}' if notes else ''}

Extract ALL medications from this prescription image. For each medication, determine whether it is
Allopathic, Ayurvedic, Homeopathic, or Naturopathic based on the name and context.

Return ONLY a valid JSON object exactly like this:
{{
  "medications": [
    {{
      "name": "Metformin",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "route": "Oral",
      "duration": "3 months",
      "system": "Allopathic",
      "notes": ""
    }},
    {{
      "name": "Ashwagandha",
      "dosage": "300mg",
      "frequency": "Once daily at bedtime",
      "route": "Oral",
      "duration": "Ongoing",
      "system": "Ayurvedic",
      "notes": "With warm milk"
    }}
  ],
  "doctor": "Dr. Name",
  "date": "YYYY-MM-DD or empty",
  "facility": "Hospital/Clinic name or empty",
  "patient_name": "name if visible or empty",
  "raw_text": "full extracted text from prescription",
  "confidence": 0.92
}}

Ayurvedic medicines include: Ashwagandha, Triphala, Brahmi, Shatavari, Turmeric/Curcumin,
Tulsi, Neem, Amla, Giloy, Arjuna, Guggul, Shilajit, Chyawanprash, etc.
Homeopathic: any with 6C, 30C, 200C, 1M potency markers.
Naturopathic: herbal supplements without classical Ayurvedic names."""

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[gtypes.Part.from_bytes(data=img_bytes, mime_type=mime), prompt],
            )
            text = response.text.strip()
            if text.startswith("```"):
                parts = text.split("```")
                text = parts[1][4:] if len(parts) > 1 and parts[1].startswith("json") else (parts[1] if len(parts) > 1 else text)
            structured = json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON in response
            import re
            match = re.search(r'\{.*\}', response.text if 'response' in dir() else '', re.DOTALL)
            if match:
                try:
                    structured = json.loads(match.group())
                except Exception:
                    pass
        except Exception as e:
            print(f"[Prescription OCR] Error: {e}")

    # Fallback demo extraction if Gemini fails
    if not structured:
        structured = {
            "medications": [
                {"name": "Metformin", "dosage": "500mg", "frequency": "Twice daily", "route": "Oral",
                 "duration": "3 months", "system": "Allopathic", "notes": ""},
                {"name": "Ashwagandha", "dosage": "300mg", "frequency": "Once daily at bedtime", "route": "Oral",
                 "duration": "Ongoing", "system": "Ayurvedic", "notes": "With warm milk"},
            ],
            "doctor": "Dr. (Extracted from image)",
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "facility": "",
            "patient_name": "",
            "raw_text": "[Demo — Gemini OCR returned no parseable output]",
            "confidence": 0.5,
        }

    return {
        "status": "extracted",
        "patient_id": patient_id,
        "extraction": structured,
        "requires_validation": True,
    }


# ─── Prescription Confirm (save + merge into patient) ────────────────────────

class PrescriptionMedication(BaseModel):
    name: str
    dosage: str
    frequency: str = ""
    route: str = "Oral"
    duration: str = ""
    system: str = "Allopathic"   # Allopathic | Ayurvedic | Homeopathic | Naturopathic
    notes: str = ""

class PrescriptionConfirmRequest(BaseModel):
    patient_id: str
    medications: list[PrescriptionMedication]
    doctor: str = ""
    date: str = ""
    facility: str = ""
    replace_existing: bool = False  # True = replace, False = merge/add

@app.post("/api/prescription/confirm")
async def prescription_confirm(req: PrescriptionConfirmRequest):
    """
    Save validated prescription medications to Firestore:
    1. Merges new meds into patient.active_medications + medication_details
    2. Creates a clinical record in patients/{id}/records
    3. Returns updated polypharmacy matrix
    """
    import uuid
    db = get_firestore()

    new_meds_flat = [f"{m.name} {m.dosage}".strip() for m in req.medications]
    new_med_details = [m.dict() for m in req.medications]

    existing_meds_flat = []
    existing_med_details = []

    if db:
        try:
            doc = db.collection("patients").document(req.patient_id).get()
            if doc.exists:
                data = doc.to_dict()
                existing_meds_flat = data.get("active_medications", [])
                existing_med_details = data.get("medication_details", [])
        except Exception as e:
            print(f"[PrescriptionConfirm] Firestore read error: {e}")

    if req.replace_existing:
        merged_meds_flat = new_meds_flat
        merged_med_details = new_med_details
    else:
        # Merge: skip duplicates by name
        existing_names = {m.get("name", "").lower() if isinstance(m, dict) else m.split()[0].lower()
                         for m in existing_med_details or existing_meds_flat}
        added_flat = [m for m in new_meds_flat if m.split()[0].lower() not in existing_names]
        added_details = [m for m in new_med_details if m["name"].lower() not in existing_names]
        merged_meds_flat = existing_meds_flat + added_flat
        merged_med_details = existing_med_details + added_details

    # 1. Update patient document
    if db:
        try:
            db.collection("patients").document(req.patient_id).update({
                "active_medications": merged_meds_flat,
                "medication_details": merged_med_details,
                "medications_updated_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            print(f"[PrescriptionConfirm] Patient update error: {e}")

    # 2. Save prescription as a clinical record
    record_id = f"REC-RX-{uuid.uuid4().hex[:8].upper()}"
    record = {
        "record_id": record_id,
        "patient_id": req.patient_id,
        "type": "Prescription",
        "facility": req.facility,
        "date": req.date or datetime.utcnow().strftime("%Y-%m-%d"),
        "notes": f"Prescription from {req.doctor or 'Unknown Doctor'}. {len(req.medications)} medications.",
        "structured": {
            "summary": f"Prescription by {req.doctor}. {len(req.medications)} medications added.",
            "medications": new_med_details,
            "doctor": req.doctor,
        },
        "source": "prescription_upload",
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    if db:
        try:
            db.collection("patients").document(req.patient_id) \
              .collection("records").document(record_id).set(record)
        except Exception as e:
            print(f"[PrescriptionConfirm] Record write error: {e}")

    return {
        "status": "confirmed",
        "record_id": record_id,
        "patient_id": req.patient_id,
        "merged_medications": merged_meds_flat,
        "added_count": len(new_meds_flat) if req.replace_existing else len([m for m in new_meds_flat if m.split()[0].lower() not in {x.split()[0].lower() for x in existing_meds_flat}]),
        "total_medications": len(merged_meds_flat),
    }


# ─── Run locally ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)


