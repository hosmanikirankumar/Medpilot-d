# Technical Concerns & Debt

**Analysis Date:** 2026-04-30

## Security & Privacy

- **CORS Configuration:** `backend/main.py` uses `allow_origins=["*"]`. This is overly permissive for a production clinical application and should be restricted to the frontend domain.
- **Authentication:** While the frontend uses Firebase Auth, many backend API endpoints (e.g., `/api/chat`, `/api/patients`) do not explicitly verify the user's JWT on every request in the current FastAPI implementation.
- **Secret Management:** The system relies on `.env` files. While standard, care must be taken not to commit these. The `get_firestore()` helper has multiple fallback mechanisms for credentials, which is convenient but could be brittle.

## Fragility & Reliability

- **External Dependency Density:** The system is heavily integrated with external APIs (Vertex AI, NHA Sandbox, Google Maps, WhatsApp, PK-DB). Outages in any of these services will degrade specific agent pods (e.g., Emergency Cascade, Eligibility).
- **Demo Mode Fallbacks:** Many functions (like `get_firestore`) fall back to "demo mode" with mock data if credentials are missing. While great for DX, it creates a risk of silent failures in production if a credential becomes invalid.
- **Agent Orchestration Complexity:** The 16-agent LangGraph is a powerful but complex "brain." Debugging race conditions or logic loops between agents (e.g., Polypharmacy -> Validation) requires deep understanding of the `MedPilotState` flow.

## Technical Debt

- **Monolithic API File:** `backend/main.py` has grown to over 1,900 lines, handling everything from routing to document processing and emergency cascades. This should be refactored into modular routers (e.g., `routes/patients.py`, `routes/emergency.py`).
- **Testing Coverage:**
  - **Frontend:** Zero automated test coverage (no unit or E2E tests).
  - **Backend:** Testing is limited to manual execution of functional scripts (`test_agents.py`). No integrated CI/CD test gate.
- **Hardcoded Demo Data:** Large blocks of demo patient data are hardcoded in `backend/main.py`. These should be moved to a separate seed script or a dedicated JSON/Firestore store.

## Performance

- **Sequential Mapping passes:** (Meta-debt) Codebase mapping was performed sequentially in one context, which is slower than the parallelized approach used by dedicated GSD agents.
- **Frontend State:** `zustand` is used effectively, but as the patient record history grows, the store's memory footprint should be monitored.

## Maintainability

- **Agent Implementations:** Agents are co-located in `backend/agents/`. Some agents (like `clinical.py`) are significantly larger and more complex than others, suggesting a need for internal sub-modularization.
- **MCP Server Management:** MCP servers are located in `backend/mcp_servers/`. These are effectively "mini-backends" and should be treated with the same rigorous versioning and testing as the main API.

---
*Concern audit: 2026-04-30*
