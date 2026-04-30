# Technology Stack

**Analysis Date:** 2026-04-30

## Languages

**Primary:**
- Python 3.13 - Backend application code and AI agent orchestration.
- TypeScript 5.x - Frontend application code.

**Secondary:**
- JavaScript - Frontend configuration (PostCSS, Tailwind).
- SQL - Implicit via Firestore/NHA queries (modeled as JSON/REST).

## Runtime

**Environment:**
- Python 3.13 (Backend)
- Node.js (Frontend build-time via Vite)
- Browser (Frontend execution)

**Package Manager:**
- pip (Python) - `requirements.txt` present.
- npm (Node.js) - `package-lock.json` present.

## Frameworks

**Core:**
- FastAPI (Python) - Backend web framework.
- React 18.x (TypeScript) - Frontend UI framework.
- LangGraph 1.x (Python) - Multi-agent orchestration and state management.

**Testing:**
- Custom Python scripts (using `assert` and `asyncio`) for backend agent testing.
- No formal testing framework detected for frontend.

**Build/Dev:**
- Vite 5.x - Frontend build tool and dev server.
- TailwindCSS 3.4 - Frontend styling utility.
- Docker - Containerization for backend deployment.

## Key Dependencies

**Critical:**
- google-genai / vertexai - Gemini 2.x/1.x model integration.
- firebase-admin - Backend Firestore and Firebase service access.
- pydantic - Data validation and settings management.
- httpx - Asynchronous HTTP client for MCP server and external API calls.
- zustand - Frontend state management.
- @tanstack/react-query - Frontend data fetching and caching.

**Infrastructure:**
- uvicorn - ASGI server for FastAPI.
- python-dotenv - Environment variable management.

## Configuration

**Environment:**
- `.env` files in both `backend` and `medpilot-frontend` directories.
- Keys include `GCP_PROJECT_ID`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, etc.

**Build:**
- `vite.config.ts` - Frontend build and proxy configuration.
- `tailwind.config.js` - CSS utility configuration.
- `tsconfig.json` - TypeScript compiler settings.

## Platform Requirements

**Development:**
- Python 3.13+
- Node.js 18+
- Docker (optional for backend)

**Production:**
- Google Cloud Run (implied by `Dockerfile` and PORT env var).
- Firebase / Firestore for persistent storage.

---
*Stack analysis: 2026-04-30*
