"""
MedPilot OS — Food Scanner Agent (Pod B)
Analyzes food-drug interactions across ALL medicine systems:
Allopathic, Ayurvedic, Homeopathic, Unani, Siddha.
Covers Indian diet patterns. Powered by Gemini + real drug context.
"""
from .state import MedPilotState
from .llm import generate_text, generate_json

FOOD_SCAN_PROMPT = """
You are MedPilot OS Food Scanner Agent — an expert in drug-food interactions across
ALL medicine systems: Allopathic, Ayurvedic, Homeopathic, Unani, and Siddha.

Patient profile:
{patient_context}

Active medications (all systems):
{medications}

Food / meal described:
{food_input}

Analyze EVERY food item against EVERY medication. Structure your response as:

## 🚨 Critical Interactions
[Food] + [Drug] — [Mechanism] — [Action required]
(Only if CRITICAL severity)

## ⚠️ Moderate Interactions  
[Food] + [Drug] — [Concern] — [Recommendation]

## ✅ Safe to Eat
[Food] — [Brief note if relevant]

## 🌿 Ayurvedic / Traditional Medicine Notes
Special considerations for Ayurvedic herbs or traditional preparations in the meal.

## 📋 Overall Verdict
One sentence: is this meal SAFE / CAUTION / AVOID and why?

Rules:
- Flag CYP enzyme interactions (especially CYP3A4, CYP2C9 for allopathic drugs)
- Flag Vitamin K foods for anticoagulants (Warfarin, Acenocoumarol)
- Flag Indian foods specifically: dal, rice, palak (spinach), methi, amla, haldi (turmeric),
  grapefruit, pomegranate, chai (tea), pickle, coconut, banana, papaya, garlic, ginger
- Ayurvedic interactions: triphala, ashwagandha, brahmi, neem, giloy with allopathic meds
- Homeopathic: camphor, coffee, mint interfere with most remedies
- Cite a PMID if available for any major interaction
- Keep total response under 400 words
"""


async def food_scanner_node(state: MedPilotState) -> MedPilotState:
    """
    Food Scanner Agent:
    1. Parses food description from user query
    2. Checks interactions against all active medications (all medicine systems)
    3. Returns color-coded interaction analysis via Gemini
    """
    ctx   = state.get("patient_context", {})
    query = state.get("raw_input", "")
    meds  = ctx.get("active_medications", [])
    logs  = state.get("agent_logs", [])

    # Extract food from query (everything after any food-indicating keyword)
    food_input = query
    food_keywords = ["food", "eat", "meal", "drink", "take with", "have", "khana", "pina", "kha"]
    for kw in food_keywords:
        if kw in query.lower():
            idx = query.lower().index(kw)
            food_input = query[idx:].strip()
            break

    logs.append({
        "agent_name": "Food Scanner",
        "action": f"🍽️ Analyzing food-drug interactions for: '{food_input[:80]}'",
        "status": "Info"
    })

    if not meds:
        response = "No active medications found for this patient. Food interaction check requires medication data — please add medications to the patient profile."
        logs.append({
            "agent_name": "Food Scanner",
            "action": "No medications to check — skipping interaction analysis",
            "status": "Warning"
        })
    else:
        # Build medication context with system classification
        med_context = []
        for m in meds:
            if isinstance(m, dict):
                system = m.get("medicine_system", "Allopathic")
                name   = m.get("name", str(m))
                dose   = m.get("dose", "")
                med_context.append(f"- {name} {dose} [{system}]")
            else:
                med_context.append(f"- {m} [Allopathic]")

        prompt = FOOD_SCAN_PROMPT.format(
            patient_context=str(ctx) if ctx else "No patient context",
            medications="\n".join(med_context),
            food_input=food_input,
        )
        response = await generate_text(prompt)

        # Determine severity for logging
        has_critical = "🚨" in response or "critical" in response.lower()
        has_moderate = "⚠️" in response or "moderate" in response.lower()
        log_status   = "Warning" if has_critical else ("Info" if has_moderate else "Success")

        logs.append({
            "agent_name": "Food Scanner",
            "action": f"{'🚨 Critical interaction detected' if has_critical else '⚠️ Moderate interaction' if has_moderate else '✅ No critical interactions found'}",
            "status": log_status
        })

    logs.append({
        "agent_name": "Food Scanner",
        "action": f"✅ Food scan complete — {len(meds)} medication(s) checked",
        "status": "Success"
    })

    return {
        **state,
        "final_response": response,
        "agent_logs": logs,
    }
