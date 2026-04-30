# System Architecture

**Analysis Date:** 2026-04-30

## Overview
MedPilot OS is a multi-agent healthcare operating system designed for clinical orchestration, patient monitoring, and emergency response. It uses a pod-based agent architecture powered by **LangGraph** on the backend and a high-fidelity **React** dashboard on the frontend.

## Backend Architecture

### Core Orchestration
- **LangGraph Workflow:** The system uses a stateful directed graph (`MedPilotState`) to manage transitions between 16 specialized agents.
- **Orchestrator-First Routing:** Every query enters through the `Orchestrator` node, which classifies intent (e.g., Clinical, Emergency, Logistics) and routes to the appropriate Pod.

### Agent Pods
1. **Pod A: Core Management & Extraction**
   - `Orchestrator`: Intent classification and global routing.
   - `Validation`: Integrity checks and PK-DB pharmacokinetics verification.
2. **Pod B: Clinical Analysis & Safety**
   - `Clinical Memory`: RAG-based patient history retrieval.
   - `Polypharmacy`: Multi-drug interaction analysis.
   - `Dietary Guard` / `Food Scanner`: Nutritional safety and restricted ingredient detection.
3. **Pod C: Emergency & External Integrations**
   - `Emergency Cascade`: Critical vitals response and SOS dispatch.
   - `Logistics`: Hospital routing and ETA calculation via MCP.
   - `Eligibility`: ABHA/PM-JAY benefits verification via MCP.
4. **Pod D: Deep Reasoning & Patient Engagement**
   - `Deep Dive`: specialist report summarization (MRI, Pathology).
   - `Research`: PubMed/OpenFDA evidence gathering.
   - `Briefing` / `Doctor Brief`: Patient/Clinician summary generation.
5. **Pod E: Proactive Intelligence & Scheduling**
   - `Workspace`: Google Calendar/Tasks/Gmail automation.
   - `Trajectory`: Predictive health forecasting.

## Frontend Architecture

### UI Design System
- **Layout:** Three-pane dashboard (Navigation | Main Content | Agent Trace).
- **State Management:** `Zustand` for global application state (patients, logs, emergency status).
- **Asynchrony:** `React Query` for managing API calls and polling.

### Key Workflows
- **Assistant Chat:** Primary interface for clinician-agent interaction.
- **Agent Trace Terminal:** Real-time visibility into agent reasoning and MCP tool calls.
- **HITL Gate:** Human-in-the-loop review for clinical data extraction before persistence.

## Data Flow
1. **Input:** Natural language (chat) or Structured Vitals (emergency).
2. **Orchestration:** Backend classifies intent and activates specific agent pods.
3. **Integration:** Agents call MCP servers (Maps, WhatsApp, NHA) as needed.
4. **Persistence:** Agent reasoning and clinical outcomes are logged to Firestore.
5. **Feedback:** UI reflects agent steps and results in real-time via WebSockets/Polling.

## Infrastructure
- **Compute:** Containerized on Google Cloud Run.
- **Storage:** Firebase Firestore (JSON logs) and GCS (Images).
- **Intelligence:** Vertex AI / Gemini 2.x API.

---
*Architecture analysis: 2026-04-30*
