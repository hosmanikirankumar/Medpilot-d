# Coding Conventions

**Analysis Date:** 2026-04-30

## Language-Specific Standards

### Python (Backend)
- **Style:** Follows standard PEP 8 conventions.
- **Documentation:** Files begin with a triple-quoted docstring explaining the module's purpose.
- **Asynchrony:** Uses `async/await` throughout for non-blocking I/O (FastAPI, LangGraph, HTTPX).
- **Orchestration Pattern:** Every agent implementation usually includes a `[name]_node` function that takes and returns `MedPilotState`.
- **Imports:** Absolute imports from the project root or relative imports within pods.

### TypeScript / React (Frontend)
- **Imports:** Uses the `@/` alias (configured in `vite.config.ts`) to refer to the `src` directory.
- **Components:** Functional components using React Hooks (`useState`, `useEffect`).
- **Styling:** TailwindCSS utilities. Dynamic class merging is handled by the `cn` utility (wrapper for `clsx` and `twMerge`).
- **Icons:** Standardized on `lucide-react`.
- **Animations:** Standardized on `framer-motion` for transitions and state changes.

## General Patterns

### State Management
- **Backend:** LangGraph `StateGraph` with a shared `MedPilotState` TypedDict.
- **Frontend:** Zustand store (`medpilotStore.ts`) for global application state.

### Error Handling
- **Backend:** `try/except` blocks around external API calls and Firestore operations. Returns `HTTPException` in FastAPI routes.
- **Frontend:** Errors are usually caught in hooks/store and reflected in the UI (e.g., via the Agent Trace terminal).

### Logging & Auditing
- **Agent Logs:** A core convention is the `agent_logs` array. Each agent appends a dictionary with `agent_name`, `action`, and `status`.
- **Firestore:** Logs are persisted to the `agent_logs` collection for multi-agent integrity audits.

## Naming Conventions
- **Variables/Functions:** camelCase in TypeScript, snake_case in Python.
- **Components:** PascalCase (e.g., `MapView.tsx`).
- **Files:** snake_case for Python (`main.py`, `clinical_memory.py`), PascalCase or camelCase for TypeScript (`App.tsx`, `medpilotStore.ts`).

---
*Convention analysis: 2026-04-30*
