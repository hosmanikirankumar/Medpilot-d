# Testing Practices

**Analysis Date:** 2026-04-30

## Testing Strategy

The project primarily uses **functional integration testing** for the backend agent workforce and **manual verification** for the frontend UI.

## Backend Testing

### Automated Test Scripts
The project includes several standalone Python scripts for verifying specific subsystems:
- `test_agents.py`: Exercises the full 16-agent LangGraph pipeline with sample clinical queries. Verifies intent classification and log integrity.
- `test_mcp.py`: Validates communication with MCP servers (Maps, WhatsApp, NHA).
- `test_api_keys.py`: Sanity check for environment variables and API connectivity (Gemini, Vertex).
- `test_vertex_direct.py`: Verifies raw Vertex AI / Gemini SDK calls.

### Test Execution
Tests are run using the standard Python interpreter from the backend root:
```bash
python test_agents.py
```
These scripts use standard Python `assert` statements and print color-coded logs to the console for verification.

### Mocking vs. Live Data
- **Firestore:** Scripts check for `FIREBASE_ADMIN_CREDENTIALS`. If missing, the system falls back to "demo mode" with hardcoded mock data.
- **LLM:** Tests require a valid `GEMINI_API_KEY`.

## Frontend Testing

### Manual Verification
- Testing is performed manually using the Vite dev server (`npm run dev`).
- The **Agent Trace Terminal** in the dashboard serves as a live debugging tool, allowing developers to see agent reasoning and tool calls in real-time.

### Automated Testing
- No automated test frameworks (Jest, Vitest, Cypress, Playwright) were detected in the `package.json`.

## CI/CD Integration
- While a `Dockerfile` is present for deployment, there are no CI workflow files (e.g., `.github/workflows`) currently visible that execute tests on push.

## Recommended Improvements
- Implement **Vitest** for frontend component testing.
- Migrate backend test scripts to **Pytest** for better reporting and test discovery.
- Add a CI pipeline to run `test_agents.py` on every PR.

---
*Testing analysis: 2026-04-30*
