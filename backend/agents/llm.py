"""
MedPilot OS — Gemini LLM helper
Uses google-genai SDK with API key (billing-enabled project).
Loads .env before reading any keys so hot-reload always works.

Model selection (as of 2026):
  gemini-2.5-flash  -> routing / simple Q&A AND synthesis (confirmed working)
  NOTE: gemini-2.0-flash is deprecated for new API keys — do NOT use it.

FIXES applied:
  1. generate_with_mcp_tools() now wraps Python callables as proper
     types.Tool / types.FunctionDeclaration objects so Gemini actually
     recognises and calls them (previously plain callables were silently ignored).
  2. Tool-call loop now uses async send_message_async() — no more event loop blocking.
  3. Added generate_with_google_mcp() — uses fastmcp.Client to connect to a
     running FastMCP server and passes native MCP tools to Gemini.
"""
import os
import json
import re
import inspect
import asyncio

# ── Load .env FIRST before any os.getenv ─────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(override=True)   # override=True ensures reloads pick up new values

from google import genai
from google.genai import types

# ── Model names ───────────────────────────────────────────────────────────────
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
    """Call Gemini and return raw text. Uses async API to avoid blocking the event loop."""
    last_error = None
    for attempt in range(3):
        try:
            client = _get_client()  # fresh check every attempt
            # CRITICAL: use client.aio (async) not client (sync) — sync blocks the event loop
            response = await client.aio.models.generate_content(
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

def _build_function_declaration(func) -> types.FunctionDeclaration | None:
    """
    Build a google.genai FunctionDeclaration from a Python callable.

    The google-genai SDK requires tools to be declared with a JSON schema —
    it cannot accept bare Python callables directly. This helper introspects
    the function signature and docstring to generate the declaration.

    Returns None if the function cannot be reliably introspected.
    """
    try:
        sig = inspect.signature(func)
        doc = inspect.getdoc(func) or f"Call {func.__name__}"

        # Build parameter properties from type annotations
        properties: dict = {}
        required: list = []

        # Type mapping: Python types → JSON Schema types
        _type_map = {
            str:   "string",
            int:   "integer",
            float: "number",
            bool:  "boolean",
            list:  "array",
            dict:  "object",
        }

        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue

            annotation = param.annotation
            if annotation is inspect.Parameter.empty:
                json_type = "string"
            else:
                # Handle Optional[X] and list[X] from typing
                origin = getattr(annotation, "__origin__", None)
                if origin is list:
                    json_type = "array"
                elif hasattr(annotation, "__args__"):
                    # Optional[X] has NoneType as one of the args
                    inner = [a for a in annotation.__args__ if a is not type(None)]
                    json_type = _type_map.get(inner[0], "string") if inner else "string"
                else:
                    json_type = _type_map.get(annotation, "string")

            # Extract per-param description from docstring Args: block
            param_desc = _extract_param_doc(doc, param_name)

            prop: dict = {"type": json_type, "description": param_desc}
            properties[param_name] = prop

            # Required if no default value
            if param.default is inspect.Parameter.empty:
                required.append(param_name)

        parameters = types.Schema(
            type="object",
            properties={k: types.Schema(**v) for k, v in properties.items()},
            required=required if required else None,
        )

        return types.FunctionDeclaration(
            name=func.__name__,
            description=doc[:500],   # Gemini limit
            parameters=parameters,
        )
    except Exception as e:
        print(f"[LLM] Could not build FunctionDeclaration for {getattr(func, '__name__', '?')}: {e}")
        return None


def _extract_param_doc(docstring: str, param_name: str) -> str:
    """Extract a parameter's description from a Google-style docstring."""
    try:
        lines = docstring.splitlines()
        in_args = False
        for line in lines:
            stripped = line.strip()
            if stripped.lower().startswith("args:"):
                in_args = True
                continue
            if in_args:
                if stripped.startswith(param_name + ":"):
                    return stripped[len(param_name) + 1:].strip()
                if stripped and not stripped.startswith(" ") and ":" in stripped:
                    # New section header (Returns:, Raises:, etc.) → stop
                    in_args = False
    except Exception:
        pass
    return f"Parameter: {param_name}"


async def generate_with_mcp_tools(
    prompt: str,
    tools: list,
    model: str = _MODEL_FULL,
    max_remote_calls: int = 5,
    logs: list = None,
) -> str:
    """
    Call Gemini with MCP tools (google.genai agentic tool-use).

    FIX: Previously this passed raw Python callables to Gemini which silently
    ignored them. Now we:
      1. Build a proper types.FunctionDeclaration for each callable
      2. Pass them as a types.Tool object Gemini actually understands
      3. Use async send_message_async() to avoid blocking the event loop

    Falls back to plain generate_text if tools list is empty.
    """
    if logs is None:
        logs = []

    if not tools:
        return await generate_text(prompt, model)

    # ── Step 1: Build FunctionDeclarations for all tools ─────────────────────
    func_map: dict[str, callable] = {}
    declarations: list[types.FunctionDeclaration] = []

    for func in tools:
        decl = _build_function_declaration(func)
        if decl:
            declarations.append(decl)
            func_map[func.__name__] = func
        else:
            print(f"[LLM-MCP] Skipping tool {getattr(func, '__name__', '?')} — could not build declaration")

    if not declarations:
        print("[LLM-MCP] No valid FunctionDeclarations — falling back to plain text")
        return await generate_text(prompt, model)

    gemini_tools = [types.Tool(function_declarations=declarations)]

    # ── Step 2: Send prompt + tools to Gemini ────────────────────────────────
    client = _get_client()
    try:
        # Use async API to avoid blocking uvicorn's event loop
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=gemini_tools,
                temperature=0.1,
                max_output_tokens=2048,
            ),
        )

        # ── Step 3: Agentic tool-call loop ────────────────────────────────────
        calls = 0
        while calls < max_remote_calls:
            # Collect any function calls from this response
            fn_calls = []
            if hasattr(response, "candidates") and response.candidates:
                for candidate in response.candidates:
                    if hasattr(candidate, "content") and candidate.content:
                        for part in candidate.content.parts:
                            if hasattr(part, "function_call") and part.function_call:
                                fn_calls.append(part.function_call)

            if not fn_calls:
                break  # No more tool calls — we have the final text response

            calls += 1
            tool_response_parts = []

            for fn_call in fn_calls:
                func_name = fn_call.name
                func_args = dict(fn_call.args) if fn_call.args else {}
                tool_func = func_map.get(func_name)

                if tool_func:
                    logs.append({
                        "agent_name": "MCP Tool Engine",
                        "action": f"⚙️ Executing MCP tool: {func_name}({', '.join(f'{k}={repr(v)[:40]}' for k, v in func_args.items())})",
                        "status": "Info",
                    })
                    try:
                        if inspect.iscoroutinefunction(tool_func):
                            result = await tool_func(**func_args)
                        else:
                            result = tool_func(**func_args)
                        tool_response_parts.append(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"result": result},
                            )
                        )
                        logs.append({
                            "agent_name": "MCP Tool Engine",
                            "action": f"✅ {func_name} → {str(result)[:100]}",
                            "status": "Success",
                        })
                    except Exception as tool_err:
                        logs.append({
                            "agent_name": "MCP Tool Engine",
                            "action": f"❌ {func_name} failed: {str(tool_err)[:120]}",
                            "status": "Error",
                        })
                        tool_response_parts.append(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"error": str(tool_err)[:200]},
                            )
                        )
                else:
                    logs.append({
                        "agent_name": "MCP Tool Engine",
                        "action": f"⚠️ Gemini called unknown tool: {func_name}",
                        "status": "Warning",
                    })
                    tool_response_parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"error": "Tool not found"},
                        )
                    )

            # Send tool results back to Gemini for the next turn
            if tool_response_parts:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=[
                        types.Content(role="user", parts=[types.Part(text=prompt)]),
                        response.candidates[0].content,
                        types.Content(role="user", parts=tool_response_parts),
                    ],
                    config=types.GenerateContentConfig(
                        tools=gemini_tools,
                        temperature=0.1,
                        max_output_tokens=2048,
                    ),
                )
            else:
                break

        return response.text or ""

    except Exception as e:
        err_str = str(e)
        print(f"[LLM-MCP] Tool call failed ({model}): {err_str[:200]} — falling back to plain text")
        return await generate_text(prompt, model)


# ── Google MCP native integration (fastmcp.Client → Gemini) ──────────────────

async def generate_with_google_mcp(
    prompt: str,
    mcp_server_path: str,
    model: str = _MODEL_FULL,
    logs: list = None,
) -> str:
    """
    Call Gemini using Google's official MCP integration pattern.

    Connects to a FastMCP server via fastmcp.Client and passes its tools
    directly to the Gemini model using the native MCP tool format.
    This is the correct pattern from the google-genai + fastmcp docs (2026).

    Args:
        prompt: The user query / system prompt
        mcp_server_path: Path to the FastMCP server script (e.g. "mcp_servers/google_mcp_server.py")
        model: Gemini model to use
        logs: Agent log list to append to

    Returns:
        str: The final text response from Gemini after all tool calls
    """
    if logs is None:
        logs = []

    try:
        from fastmcp import Client as MCPClient

        client = _get_client()

        async with MCPClient(mcp_server_path) as mcp_session:
            # Retrieve all tools from the MCP server
            mcp_tools = await mcp_session.get_tools()

            logs.append({
                "agent_name": "Google MCP Bridge",
                "action": f"🔗 Connected to MCP server — {len(mcp_tools)} tools available: {[t.name for t in mcp_tools]}",
                "status": "Info",
            })

            # Pass MCP tools natively to Gemini (google-genai SDK supports this directly)
            response = await client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=mcp_tools,
                    temperature=0.1,
                    max_output_tokens=2048,
                ),
            )

            # Agentic loop — execute tool calls until Gemini returns final text
            calls = 0
            max_calls = 5
            while calls < max_calls:
                fn_calls = []
                if hasattr(response, "candidates") and response.candidates:
                    for candidate in response.candidates:
                        if hasattr(candidate, "content") and candidate.content:
                            for part in candidate.content.parts:
                                if hasattr(part, "function_call") and part.function_call:
                                    fn_calls.append(part.function_call)

                if not fn_calls:
                    break

                calls += 1
                tool_response_parts = []

                for fn_call in fn_calls:
                    func_name = fn_call.name
                    func_args = dict(fn_call.args) if fn_call.args else {}

                    logs.append({
                        "agent_name": "Google MCP Bridge",
                        "action": f"⚙️ MCP tool call: {func_name}",
                        "status": "Info",
                    })

                    try:
                        # Execute the tool via the MCP session
                        result = await mcp_session.call_tool(func_name, func_args)
                        tool_response_parts.append(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"result": str(result)},
                            )
                        )
                        logs.append({
                            "agent_name": "Google MCP Bridge",
                            "action": f"✅ {func_name} → {str(result)[:100]}",
                            "status": "Success",
                        })
                    except Exception as tool_err:
                        logs.append({
                            "agent_name": "Google MCP Bridge",
                            "action": f"❌ {func_name} failed: {str(tool_err)[:120]}",
                            "status": "Error",
                        })
                        tool_response_parts.append(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"error": str(tool_err)[:200]},
                            )
                        )

                if tool_response_parts:
                    response = await client.aio.models.generate_content(
                        model=model,
                        contents=[
                            types.Content(role="user", parts=[types.Part(text=prompt)]),
                            response.candidates[0].content,
                            types.Content(role="user", parts=tool_response_parts),
                        ],
                        config=types.GenerateContentConfig(
                            tools=mcp_tools,
                            temperature=0.1,
                            max_output_tokens=2048,
                        ),
                    )
                else:
                    break

            return response.text or ""

    except ImportError:
        print("[LLM-MCP] fastmcp package not installed — falling back to generate_with_mcp_tools")
        return await generate_text(prompt, model)
    except Exception as e:
        print(f"[LLM-MCP] Google MCP integration failed: {str(e)[:200]} — falling back to plain text")
        return await generate_text(prompt, model)


# ── Model routing helper ──────────────────────────────────────────────────────

def pick_model(task: str) -> str:
    """Return the appropriate model for a given task type."""
    full_tasks = {"polypharmacy", "doctor_brief", "research", "deep_dive",
                  "food_scanner", "trajectory", "workspace"}
    return _MODEL_FULL if task in full_tasks else _MODEL_LITE
