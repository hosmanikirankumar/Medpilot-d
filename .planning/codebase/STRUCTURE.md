# Directory Structure

**Analysis Date:** 2026-04-30

## Root Layout
```text
.
├── backend/                # FastAPI / LangGraph backend
├── medpilot-frontend/      # Vite / React frontend
├── firebase.json           # Firebase configuration
├── .firebaserc             # Firebase project mapping
├── README.md               # Project overview
└── .planning/              # GSD & Project planning documents
```

## Backend Structure (`/backend`)
```text
backend/
├── agents/                 # Agent workforce implementation
│   ├── graph.py            # LangGraph definition & pod wiring
│   ├── orchestrator.py     # Intent classification & routing
│   ├── state.py            # Shared MedPilotState definition
│   └── [agent_name].py     # Individual agent implementations
├── mcp_servers/            # Model Context Protocol service adapters
│   ├── maps_server.py      # Google Maps integration
│   ├── nha_server.py       # ABHA/PM-JAY sandbox integration
│   └── whatsapp_server.py  # WhatsApp Business API integration
├── main.py                 # FastAPI entry point & API routes
├── Dockerfile              # Containerization config
├── requirements.txt        # Python dependencies
└── .env                    # Secrets (GCP, Gemini, Firebase)
```

## Frontend Structure (`/medpilot-frontend`)
```text
medpilot-frontend/
├── src/
│   ├── components/         # UI Components (Header, Map, Chat)
│   ├── hooks/              # Custom React hooks (useAppBoot)
│   ├── store/              # Zustand state (medpilotStore.ts)
│   ├── lib/                # Utilities (cn, utils)
│   ├── types/              # TypeScript definitions
│   ├── App.tsx             # Root Layout & Navigation
│   └── main.tsx            # Entry point
├── tailwind.config.js      # CSS styling configuration
├── vite.config.ts          # Build & proxy configuration
└── package.json            # Node.js dependencies
```

## Key File Locations
- **API Entry Point:** `backend/main.py`
- **Agent Orchestration:** `backend/agents/graph.py`
- **Frontend Store:** `medpilot-frontend/src/store/medpilotStore.ts`
- **Theme/Global CSS:** `medpilot-frontend/src/index.css`
- **MCP Connectors:** `backend/mcp_servers/`

## Naming Conventions
- **Agents:** `[name].py` in `backend/agents/`, usually containing a `[name]_node` function.
- **Components:** PascalCase (e.g., `AssistantChat.tsx`).
- **Store:** CamelCase (e.g., `medpilotStore.ts`).
- **Types:** Usually in `types/` or co-located with state/components.

---
*Structure analysis: 2026-04-30*
