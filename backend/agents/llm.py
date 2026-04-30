"""
MedPilot OS — Gemini LLM helper
Uses google-genai SDK with API key (billing-enabled project).
Loads .env before reading any keys so hot-reload always works.

Model selection (as of 2026):
  gemini-2.5-flash  -> routing / simple Q&A AND synthesis (confirmed working)
  NOTE: gemini-2.0-flash is deprecated for new API keys — do NOT use it.
"""
import os
import json
import re

# ── Load .env FIRST before any os.getenv ─────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(override=True)   # override=True ensures reloads pick up new values

from google import genai
from google.genai import types

# ── Model names ───────────────────────────────────────────────────────────────
# gemini-2.5-flash works for all API key types (no models/ prefix needed)
_MODEL_LITE = "gemini-2.5-flash"          # Fast routing / intent classification
_MODEL_FULL = "gemini-2.5-flash"          # Synthesis, research, polypharmacy
_MODEL      = _MODEL_LITE

# ── Client factory (never caches a broken client) ────────────────────────────
_client = None
_last_key = ""

def _get_client():
    global _client, _last_key
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set in backend/.env — "
            "get a key at https://aistudio.google.com/app/apikey"
        )
    # Re-create client if key changed or not yet created
    if _client is None or api_key != _last_key:
        _client = genai.Client(api_key=api_key)
        _last_key = api_key
        print(f"[LLM] Gemini client initialised — lite={_MODEL_LITE} | full={_MODEL_FULL}")
    return _client


def get_llm_status() -> dict:
    api_key = os.getenv("GEMINI_API_KEY", "")
    return {
        "mode":        "api_key" if api_key else "unconfigured",
        "model":       _MODEL,
        "model_lite":  _MODEL_LITE,
        "model_full":  _MODEL_FULL,
        "api_key_set": bool(api_key),
    }


# ── Core generation ───────────────────────────────────────────────────────────

async def generate_text(prompt: str, model: str = _MODEL) -> str:
    """Call Gemini and return raw text. Retries on transient errors."""
    import asyncio
    last_error = None
    for attempt in range(3):
        try:
            client = _get_client()  # fresh check every attempt
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.15,
                    max_output_tokens=4096,
                ),
            )
            return response.text or ""
        except Exception as e:
            err = str(e)
            last_error = err
            transient = any(x in err for x in (
                "SSL", "EOF", "ConnectionReset", "RemoteDisconnected",
                "timeout", "503", "500", "UNAVAILABLE", "overloaded"
            ))
            if transient:
                wait = 2.0 * (attempt + 1)
                print(f"[LLM] Transient error (attempt {attempt+1}/3): {err[:120]} — retrying in {wait}s…")
                await asyncio.sleep(wait)
                continue
            print(f"[LLM] generate_text error ({model}): {err[:300]}")
            raise RuntimeError(f"Gemini error: {err[:300]}")
    raise RuntimeError(f"Gemini error after 3 retries: {last_error[:300]}")


async def ghost_generate(prompt: str) -> str:
    """
    Ghost Mode: ephemeral Gemini call — no DB writes, no agent logs.
    Used by Ghost Mode chat to answer without leaving any audit trail.
    """
    return await generate_text(prompt, model=_MODEL_FULL)


async def generate_text_full(prompt: str) -> str:
    """Use the full flash model for complex synthesis."""
    return await generate_text(prompt, model=_MODEL_FULL)


async def generate_json(prompt: str, model: str = _MODEL) -> dict:
    """Call Gemini and parse JSON from the response."""
    text = await generate_text(prompt, model)
    text = text.strip()
    # Strip markdown fences
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


# ── MCP Tool calling via google-genai ────────────────────────────────────────

async def generate_with_mcp_tools(
    prompt: str,
    tools: list,
    model: str = _MODEL_FULL,
    max_remote_calls: int = 5,
    logs: list = None,
) -> str:
    """
    Call Gemini with MCP tools (google.genai agentic tool-use).
    Handles automatic function-call / response loop until text is returned.
    Falls back to plain generate_text if tools list is empty or MCP unavailable.
    """
    if logs is None:
        logs = []

    if not tools:
        return await generate_text(prompt, model)

    client = _get_client()
    try:
        import inspect
        chat = client.chats.create(
            model=model,
            config=types.GenerateContentConfig(
                tools=tools,
                temperature=0.1,
                max_output_tokens=2048,
            )
        )
        response = chat.send_message(prompt)

        calls = 0
        while response.function_calls and calls < max_remote_calls:
            calls += 1
            parts = []
            for call in response.function_calls:
                func_name = call.name
                func_args = call.args
                # Find matching tool by name (ignoring fastmcp wrapper nuances)
                tool_func = next((t for t in tools if getattr(t, "__name__", "") == func_name or (hasattr(t, "name") and t.name == func_name)), None)
                
                if tool_func:
                    logs.append({
                        "agent_name": "MCP Tool Engine",
                        "action": f"⚙️ Autonomously executing: {func_name}",
                        "status": "Info"
                    })
                    
                    if inspect.iscoroutinefunction(tool_func):
                        result = await tool_func(**func_args)
                    else:
                        result = tool_func(**func_args)
                        
                    parts.append(types.Part.from_function_response(
                        name=func_name,
                        response={"result": result}
                    ))
                else:
                    logs.append({
                        "agent_name": "MCP Tool Engine",
                        "action": f"⚠️ LLM tried to call unknown tool: {func_name}",
                        "status": "Warning"
                    })
                    parts.append(types.Part.from_function_response(
                        name=func_name,
                        response={"error": "Tool not found"}
                    ))
                    
            if parts:
                response = chat.send_message(parts)
            else:
                break

        return response.text or ""
    except Exception as e:
        print(f"[LLM-MCP] Tool call failed ({model}): {str(e)[:200]} — falling back to plain text")
        return await generate_text(prompt, model)


# ── Model routing helper ──────────────────────────────────────────────────────

def pick_model(task: str) -> str:
    """Return the appropriate model for a given task type."""
    full_tasks = {"polypharmacy", "doctor_brief", "research", "deep_dive",
                  "food_scanner", "trajectory", "workspace"}
    return _MODEL_FULL if task in full_tasks else _MODEL_LITE
