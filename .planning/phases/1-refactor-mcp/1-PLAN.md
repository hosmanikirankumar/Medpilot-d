---
wave: 1
depends_on: []
files_modified:
  - backend/agents/llm.py
  - backend/agents/emergency.py
  - backend/agents/logistics.py
  - backend/agents/eligibility.py
  - backend/agents/research.py
  - backend/agents/workspace.py
autonomous: false
---

# Phase 1: Refactor Agents to use Google MCP Client

## Objective
Refactor the MedPilot OS agents to use true Model Context Protocol (MCP) tool calling via Gemini (`generate_with_mcp_tools`) rather than hardcoding function invocations. This empowers the LLM to autonomously decide when and how to call external systems (Maps, WhatsApp, NHA, PubMed) and reduces brittle imperative logic.

## Tasks

```xml
<task>
  <action>
    Modify `backend/agents/llm.py` to ensure `generate_with_mcp_tools` properly captures and logs tool executions so the frontend Agent Trace Terminal still receives updates when Gemini autonomously calls an MCP tool. This may require disabling `automatic_function_calling` and implementing a manual tool-call loop to intercept and log the tool invocations.
  </action>
  <read_first>
    - backend/agents/llm.py
  </read_first>
  <acceptance_criteria>
    - `generate_with_mcp_tools` can accept `FastMCP` tool functions.
    - Tool calls are intercepted, logged to a provided `logs` array, and results are passed back to the model.
  </acceptance_criteria>
</task>

<task>
  <action>
    Refactor `backend/agents/emergency.py`. Remove the hardcoded calls to `find_nearest_hospital` and `send_sos_message`. Instead, pass these function objects into `generate_with_mcp_tools(prompt, tools=[...], logs=logs)`. Update the system prompt so the LLM knows it is responsible for extracting the coordinates, querying the hospital, and dispatching the SOS.
  </action>
  <read_first>
    - backend/agents/emergency.py
    - backend/mcp_servers/maps_server.py
  </read_first>
  <acceptance_criteria>
    - `find_nearest_hospital` is no longer awaited directly in `emergency_cascade_node`.
    - `generate_with_mcp_tools` is used with the tools list.
  </acceptance_criteria>
</task>

<task>
  <action>
    Refactor `backend/agents/eligibility.py`, `backend/agents/logistics.py`, `backend/agents/research.py`, and `backend/agents/workspace.py` to follow the exact same pattern: delete the imperative `await tool_function()` logic and delegate to `generate_with_mcp_tools`.
  </action>
  <read_first>
    - backend/agents/eligibility.py
    - backend/agents/logistics.py
    - backend/agents/research.py
    - backend/agents/workspace.py
  </read_first>
  <acceptance_criteria>
    - All 4 agent files use `generate_with_mcp_tools`.
    - Imperative tool calling logic is replaced by robust system prompts.
  </acceptance_criteria>
</task>
```

## Verification
- Run `python backend/test_agents.py` and ensure the full clinical and emergency queries still succeed.
- Verify the Agent Trace logs still populate properly during autonomous tool execution.
