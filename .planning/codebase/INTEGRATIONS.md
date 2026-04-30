# External Integrations

**Analysis Date:** 2026-04-30

## APIs & External Services

**AI & LLM Services:**
- Google Vertex AI / Gemini API - Core intelligence for 12+ agents.
  - SDK/Client: `google-genai`, `vertexai` Python packages.
  - Auth: `GEMINI_API_KEY` or GCP Service Account.
  - Models: `gemini-2.5-flash` (experimental), `gemini-1.5-pro`.

**Medical & Clinical Data:**
- NHA Sandbox (ABHA/PM-JAY) - Healthcare ID and benefits verification.
  - Integration method: MCP NHA Server (custom).
  - Auth: Client ID/Secret via `NHA_SANDBOX_CLIENT_ID/SECRET`.
- PK-DB - Pharmacokinetics database for drug interaction validation.
  - Integration method: REST API via `httpx`.
  - Endpoint: `https://pk-db.com/api/v1/outputs/`.
- PubMed / OpenFDA - Evidence-based research and drug data (implied).

**Communication:**
- WhatsApp Business API - Emergency SOS alerts and patient notifications.
  - SDK/Client: MCP WhatsApp Server (custom).
  - Auth: `WHATSAPP_BUSINESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.

**Maps & Location:**
- Google Maps Platform - Hospital search and ETA calculation.
  - SDK/Client: `@react-google-maps/api` (Frontend), MCP Maps Server (Backend).
  - Auth: `GOOGLE_MAPS_API_KEY`.

## Data Storage

**Databases:**
- Google Cloud Firestore (Firebase) - Primary persistent store for patient data, logs, and agent traces.
  - Connection: `firebase-admin` SDK.
  - Auth: `FIREBASE_ADMIN_CREDENTIALS` (JSON) or service account file.

**File Storage:**
- Google Cloud Storage (GCS) - Medical document storage (images/PDFs).
  - SDK/Client: `google-cloud-storage`.
  - Auth: GCP Service Account.
  - Buckets: `{GCP_PROJECT_ID}-documents`.

## Authentication & Identity

**Auth Provider:**
- Firebase Authentication - User sign-in and session management.
  - Implementation: `firebase` Client SDK (Frontend).
  - Token storage: Managed by Firebase SDK.

## Monitoring & Observability

**Agent Logs:**
- Custom Firestore-based logging - Full audit trail of agent reasoning and actions.
  - Collection: `agent_logs`.
  - Content: Query IDs, intent, model metadata, and step-by-step trace.

## CI/CD & Deployment

**Hosting:**
- Google Cloud Run - Containerized backend execution.
  - Deployment: `Dockerfile` based, port 8080.
- Firebase Hosting - Frontend web deployment (implied by `.firebaserc` and `firebase.json`).

## Environment Configuration

**Development:**
- Required env vars (Backend): `GCP_PROJECT_ID`, `GEMINI_API_KEY`, `FIREBASE_ADMIN_CREDENTIALS`.
- Required env vars (Frontend): `VITE_API_URL` (implied).

## Webhooks & Callbacks

**Incoming:**
- WhatsApp Webhooks - For receiving patient responses (implied by communication flow).

---
*Integration audit: 2026-04-30*
