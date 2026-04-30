"""
MedPilot OS — Patient Briefing Agent (Pod D)
Translates complex clinical discharge plans into simple, multi-language
summaries using Gemini text generation.
Supports text output + optional Gemini TTS audio synthesis.
"""
import os
import base64
from .state import MedPilotState
from .llm import generate_text

SUPPORTED_LANGUAGES = {
    "en":    "English",
    "hi":    "Hindi",
    "ta":    "Tamil",
    "te":    "Telugu",
    "kn":    "Kannada",
    "ml":    "Malayalam",
    "mr":    "Marathi",
    "bn":    "Bengali",
    "gu":    "Gujarati",
    "pa":    "Punjabi",
}

BRIEFING_PROMPT = """
You are MedPilot OS — Patient Briefing Agent.
Your task: translate a complex clinical discharge plan into a simple, friendly,
culturally relevant summary that a patient with no medical training can understand.

Patient name: {patient_name}
Language requested: {language_name}
Clinical discharge plan:
{discharge_plan}
Patient's active medications:
{medications}

Rules:
- Write in {language_name} (if not English, write entirely in that language)
- Use simple vocabulary (Grade 6 reading level equivalent)
- Avoid all medical jargon — if you must use a term, explain it immediately
- Be warm, reassuring, and respectful
- Structure as:
  1. 📋 What happened (1-2 sentences)
  2. 💊 Your medicines (list each with when/how to take)
  3. ⚠️ Warning signs (when to call doctor immediately)
  4. 🏡 Home care tips (diet, rest, activity)
  5. 📅 Follow-up (when and where)
- Keep total under 300 words
"""

AUDIO_SCRIPT_PROMPT = """
Convert the following patient briefing into a natural, spoken script suitable for
text-to-speech (TTS) audio. Remove all markdown formatting (bullets, asterisks, headers).
Write as continuous, spoken sentences. Pause naturally between sections.

Patient briefing:
{briefing_text}

Return ONLY the spoken script, no other text.
"""


async def _generate_tts_audio(text: str) -> str | None:
    """
    Attempt to generate TTS audio using Gemini's audio capabilities.
    Returns base64-encoded WAV/MP3 string, or None if unavailable.
    This is a best-effort call — gracefully degrades to text-only.
    """
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            return None

        client = genai.Client(api_key=api_key)

        # Use Gemini TTS model (gemini-2.5-flash-preview-tts when available)
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Kore"  # Clear, professional voice
                        )
                    )
                ),
            ),
        )

        # Extract audio data from response
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("audio/"):
                return base64.b64encode(part.inline_data.data).decode("utf-8")

    except Exception as e:
        print(f"[Patient Briefing] TTS generation skipped: {e}")

    return None


async def briefing_node(state: MedPilotState) -> MedPilotState:
    """
    Patient Briefing Agent:
    1. Determines requested language from state or patient context
    2. Generates simplified, multi-language patient discharge summary via Gemini
    3. Attempts TTS audio synthesis via Gemini Live audio capabilities
    4. Returns text briefing + optional base64 audio
    """
    ctx       = state.get("patient_context", {})
    logs      = state.get("agent_logs", [])
    raw_input = state.get("raw_input", "")

    # Determine language
    lang_code    = ctx.get("preferred_language", state.get("language", "en")).lower()
    language_name = SUPPORTED_LANGUAGES.get(lang_code, "English")
    patient_name  = ctx.get("name", "Patient")
    meds          = ctx.get("active_medications", [])

    logs.append({
        "agent_name": "Patient Briefing",
        "action": f"🌐 Generating patient briefing in {language_name} for {patient_name}",
        "status": "Info"
    })

    # ── Step 1: Generate simplified text briefing ─────────────────────────────
    prompt = BRIEFING_PROMPT.format(
        patient_name=patient_name,
        language_name=language_name,
        discharge_plan=raw_input,
        medications="\n".join(f"- {m}" for m in meds) if meds else "None specified",
    )
    briefing_text = await generate_text(prompt)

    logs.append({
        "agent_name": "Patient Briefing",
        "action": f"✅ {language_name} briefing generated — {len(briefing_text.split())} words",
        "status": "Success"
    })

    # ── Step 2: Prepare TTS script ────────────────────────────────────────────
    tts_script = ""
    audio_b64  = None

    if lang_code in SUPPORTED_LANGUAGES:
        script_prompt = AUDIO_SCRIPT_PROMPT.format(briefing_text=briefing_text)
        tts_script    = await generate_text(script_prompt)

        # ── Step 3: TTS audio synthesis ───────────────────────────────────────
        logs.append({
            "agent_name": "Patient Briefing",
            "action": "🎙️ Attempting Gemini TTS audio synthesis...",
            "status": "Info"
        })
        audio_b64 = await _generate_tts_audio(tts_script)

        if audio_b64:
            logs.append({
                "agent_name": "Patient Briefing",
                "action": f"🔊 TTS audio generated successfully ({language_name})",
                "status": "Success"
            })
        else:
            logs.append({
                "agent_name": "Patient Briefing",
                "action": "TTS audio unavailable (Gemini TTS model not accessible) — text-only mode",
                "status": "Warning"
            })

    briefing_result = {
        "language":        language_name,
        "language_code":   lang_code,
        "patient_name":    patient_name,
        "briefing_text":   briefing_text,
        "tts_script":      tts_script,
        "audio_base64":    audio_b64,
        "audio_available": audio_b64 is not None,
    }

    return {
        **state,
        "briefing_result": briefing_result,
        "final_response":  briefing_text,
        "agent_logs":      logs,
    }
