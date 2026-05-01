# MedPilot OS: Comprehensive Project Documentation

## 1. Project Overview
MedPilot OS is a 16-Agent Clinical Operating System designed for the 2026 Google APAC Gen AI Hackathon. It acts as a comprehensive clinical decision support system, tailored specifically for Indian healthcare. It features real-time patient tracking, polypharmacy checking across different medical systems (Allopathic, Ayurvedic, Homeopathic, etc.), an AI-driven prescription intake pipeline, emergency cascade protocols, and deep integrations with Google Workspace, NHA ABDM, and NIH RxNav APIs via the Model Context Protocol (MCP).

## 2. Architecture & Technology Stack
### Backend
- **Framework**: FastAPI (Python 3.13)
- **Agent Orchestration**: LangGraph (StateGraph based 16-agent network)
- **LLM Engine**: Google Gemini (gemini-2.5-flash for both routing and complex synthesis, with multimodal/vision capabilities for document processing and TTS for patient briefings)
- **Database**: Firebase Admin SDK (Firestore)
- **Tool Protocol**: MCP (Model Context Protocol) via FastMCP for standardizing external API integrations.

### Frontend
- **Framework**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Routing & Maps**: React Leaflet, React Google Maps API
- **Animation**: Framer Motion

---

## 3. The 16-Agent Network (LangGraph)
The system operates using a state machine (`MedPilotState`) orchestrated by LangGraph. The agents are divided into "Pods".

### Entry Point
**1. Orchestrator Agent (`orchestrator.py`)**
- Acts as the main router.
- Classifies user intents (e.g., `CLINICAL_QUERY`, `DOCUMENT_INTAKE`, `EMERGENCY_VITALS`, etc.).
- Routes the state to the appropriate specialist agent in the graph.

### Pod A: Core Management & Extraction
**2. Data Integrity / Intake Agent**
- Uses Gemini Vision (gemini-2.5-flash) to extract structured JSON (medications, lab values) from uploaded medical documents/prescriptions via Google Cloud Storage URLs.

**3. Validation Agent (`validation.py`)**
- Validates extracted data against pharmacokinetic databases (PK-DB) and checks if lab values (e.g., INR) are within therapeutic ranges.
- Stages proposed entries for Human-In-The-Loop (HITL) review.

### Pod B: Clinical Analysis & Safety
**4. Clinical Memory Agent (`clinical.py`)**
- Retrieves patient history, OCRs and indexes medical documents into Firestore, and handles general clinical queries.

**5. Polypharmacy Matrix Agent (`clinical.py`)**
- Builds a real N×N drug interaction matrix for all patient medications.
- Uses MCP RxNav server for drug-drug interactions and Gemini for drug-herb interactions.

**6. Dietary Guard Agent (`clinical.py`)**
- Analyzes food-drug interactions, specifically aware of the Indian diet pattern.

**7. Food Scanner Agent (`food_scanner.py`)**
- Multimodal agent that accepts text or image inputs to analyze food interactions across ALL medicine systems (Allopathic, Ayurvedic, Unani, etc.).

**8. Symptom Trajectory Forecaster (`trajectory.py`)**
- Performs proactive 2–3 hour health-state prediction using a multi-variable phase-space analysis (HR, SpO2, MAP, RR).
- Automatically triggers Emergency Cascade if trajectory enters the Critical Zone.

### Pod C: Emergency & External Integrations
**9. Emergency Cascade Agent (`emergency.py`)**
- Triggered by critical vitals or trajectory deterioration.
- Uses MCP Maps Server to find the nearest ICU.
- Uses MCP WhatsApp Server to dispatch an SOS alert to emergency contacts.
- Generates a clinical summary of the emergency.

**10. Logistics & Routing Agent (`logistics.py` - conceptual within graph)**
- Computes optimal ambulance routing and provides map data for the frontend.

**11. Eligibility Agent (`eligibility.py`)**
- Integrates with NHA ABDM Sandbox via MCP to verify PM-JAY/Ayushman Bharat insurance eligibility and ABHA profiles.

### Pod D: Deep Reasoning & Patient Engagement
**12. Clinical Deep-Dive Agent (`deep_dive.py`)**
- Summarizes dense specialist reports (MRI, Pathology, Echo, CT, Oncology) into 5-point actionable summaries for primary care physicians.

**13. Evidence Research Agent (`research.py`)**
- Queries PubMed and OpenFDA via MCP Pharma Server to return evidence-grounded clinical summaries with real PMID citations and black-box warnings.

**14. Patient Briefing Agent (`briefing.py`)**
- Translates discharge plans into simple, jargon-free summaries.
- Supports 10 Indian languages.
- Generates Text-to-Speech (TTS) audio using Gemini's audio capabilities (`gemini-2.5-flash-preview-tts`).

**15. Doctor Brief Agent (`doctor_brief.py`)**
- Generates a 60-second pre-consultation clinical brief.
- Grounded in real PubMed evidence, formats a clean agenda, polypharmacy score, and health trajectory.

### Pod E: Proactive Intelligence & Scheduling
**16. Google Workspace Agent (`workspace.py`)**
- Manages medications, appointments, and tasks via Google Calendar, Google Tasks, and Gmail.
- Powered by MCP Google Workspace server with OAuth 2.0.

---

## 4. MCP Servers (Model Context Protocol)
MedPilot utilizes the FastMCP library to expose standard tools to the LLMs.

**1. Maps Server (`maps_server.py`)**
- Integrates Google Maps Places & Distance Matrix API.
- Tools: `find_nearest_hospital`, `get_multiple_hospitals`, `get_eta`.

**2. Google Workspace Server (`google_workspace_server.py`)**
- Integrates Google Calendar, Tasks, and Gmail APIs using OAuth 2.0.
- Tools: `add_calendar_event`, `list_calendar_events`, `add_health_task`, `list_health_tasks`, `send_clinical_email`.

**3. NHA ABDM Server (`nha_server.py`)**
- Integrates National Health Authority APIs.
- Tools: `get_nha_token`, `search_abha`, `check_pmjay_eligibility`.

**4. Pharma Server (`pharma_server.py`)**
- Integrates PK-DB, PubMed E-utilities, and OpenFDA.
- Tools: `get_pharmacokinetics`, `get_drug_interventions`, `search_pubmed`, `query_openfda_adverse_events`.

**5. RxNav Server (`rxnav_server.py`)**
- Integrates NIH RxNav REST API.
- Tools: `resolve_rxcui`, `check_drug_interactions`.

**6. WhatsApp Server (`whatsapp_server.py`)**
- Integrates Meta Graph API for WhatsApp Business.
- Tools: `send_sos_message`, `send_template_message`.

---

## 5. Frontend UI/UX Architecture
The React application (`App.tsx`) is designed with a modern, glassmorphism-inspired aesthetic, featuring interactive sidebars and live monitoring components.

### Key Tabs & Views
- **Assistant Chat (`AssistantChat.tsx`)**: The main interface to interact with the MedPilot OS orchestrator.
- **Doctor Summary (`DoctorSummaryTab.tsx`)**: Displays the 60-second generated clinical brief.
- **Interactions (`InteractionsTab.tsx`)**: Visualizes the N×N Polypharmacy Matrix.
- **Trajectory (`TrajectoryTab.tsx`)**: Graphs the live multi-variable health state vector and predicts patient decline.
- **Workspace (`WorkspaceTab.tsx`)**: Calendar and Task synchronization interface.
- **Symptoms & Clinical Memory (`SymptomsTab.tsx`, `ClinicalMemoryTab.tsx`)**: For tracking history and viewing uploaded lab reports / documents.
- **Live Map (`MapView.tsx`)**: Real-time patient GPS tracking and hospital routing.
- **Agent Network (`AgentNetworkView.tsx`)**: A dynamic visualization of all 16 agents and their current status (Idle/Active/Success/Warning).
- **HITL Gate (`HITLConfirmationGate.tsx`)**: Human-In-The-Loop review screen for approving AI-extracted data before it commits to Firestore.
- **Patient Panel (`PatientPanel.tsx`)**: Editable patient demographics, vitals, and ABHA ID integration.

### Always-Visible Components
- **Agent Trace Terminal (`AgentTraceTerminal.tsx`)**: A right-sidebar terminal that streams real-time execution logs from the backend LangGraph, showing exactly which agents are acting, thinking, or fetching API data.
- **Emergency Banner (`EmergencyBanner.tsx`)**: Flashes red across the UI when the Emergency Cascade agent triggers an SOS.

---

## 6. Firestore Database Architecture
The backend uses Google Cloud Firestore for persistent storage.

### Collections:
- `patients`: Core demographics, active medications, conditions, real-time coords.
    - Subcollection `records`: Clinical history, uploaded lab reports, validated prescriptions.
- `proposed_entries`: Staging area for AI-extracted data awaiting Human-In-The-Loop (HITL) clinician approval.
- `agent_logs`: Audit trail for every AI agent action, intent classification, and API call, mapped by `query_id`.
- `emergency_state`: Real-time emergency cascade data.
- `trajectory_alerts`: Logs of proactive risk scores and alert levels over time.

---

## 7. Execution Flows
### Example 1: Prescription Upload (Document Intake)
1. User uploads a prescription image.
2. `Orchestrator` routes to `Data Integrity`.
3. Gemini Vision extracts medications and dosages.
4. `Validation` queries `RxNav` and `PK-DB`.
5. Data is staged in `proposed_entries` (Firestore).
6. Frontend displays `HITL Gate` notification.
7. Clinician reviews and clicks "Commit", moving data to `patients/{id}/records`.

### Example 2: Emergency Alert
1. UI sends critical vitals (e.g., SpO2 < 88%, BP low).
2. `Trajectory Agent` calculates danger score and triggers `Emergency Cascade`.
3. `Emergency Cascade` calls `Maps MCP` to find nearest ICU and ETA.
4. `Emergency Cascade` calls `WhatsApp MCP` to send an SOS.
5. Frontend switches to Emergency Mode (Red UI + Banner).

### Example 3: Dietary Check
1. User asks: "Can the patient eat a grapefruit and spinach salad?"
2. `Orchestrator` routes to `Food Scanner`.
3. Agent fetches patient meds (e.g., Warfarin).
4. Identifies Vitamin K in spinach and CYP3A4 inhibition in grapefruit.
5. Returns a structured JSON flag indicating `CRITICAL` severity, citing the mechanism.

---

## 8. Development & Deployment
- **API Keys Required**: Gemini (`GEMINI_API_KEY`), Google Maps (`GOOGLE_MAPS_API_KEY`), Firebase Service Account, WhatsApp Business Token, NHA Sandbox Credentials, Google Workspace OAuth Credentials.
- **Run Backend**: `uvicorn main:app --reload --port 8000`
- **Run Frontend**: `npm run dev` (Vite dev server)
- **Fallback Mechanism**: The system is highly robust. If any API key is missing (e.g., NHA Sandbox, Maps, Workspace), the MCP servers intelligently fallback to returning realistic Demo/Mock data, allowing the UI to remain fully functional for demonstration purposes without crashing.

## Conclusion
MedPilot OS is a fully realized, production-ready GenAI agentic architecture. It moves beyond simple chat interfaces by employing 16 specialized agents acting autonomously, securely accessing databases, and executing real-world API calls while keeping the clinician safely in the loop for critical commits.
