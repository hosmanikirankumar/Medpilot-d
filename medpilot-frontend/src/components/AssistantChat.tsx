import { useState, useRef, useEffect } from 'react'
import { Mic, Send, Paperclip, Bot, User, Loader2, AlertTriangle, MicOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMedPilotStore } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

// Use relative paths — Vite proxy forwards /api/* to http://localhost:8080

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  intent?: string
  priority?: string
  timestamp: Date
}

import { Zap } from 'lucide-react'

export default function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [listening, setListening] = useState(false)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const recogRef   = useRef<any>(null)
  const { addLog, setAgentStatus } = useMedPilotStore()

  // ── Check backend health ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? setBackendOnline(true) : setBackendOnline(false))
      .catch(() => setBackendOnline(false))
  }, [])

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Voice recognition ─────────────────────────────────────────────────────
  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recogRef.current?.stop()
      setListening(false)
      return
    }

    const recog = new SpeechRecognition()
    recog.lang = 'en-IN'
    recog.continuous = false
    recog.interimResults = false
    recog.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      setQuery(transcript)
      setListening(false)
    }
    recog.onerror = () => setListening(false)
    recog.onend   = () => setListening(false)
    recogRef.current = recog
    recog.start()
    setListening(true)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const msg = (text ?? query).trim()
    if (!msg || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setQuery('')
    setLoading(true)

    // Show agents as active in the heartbeat
    setAgentStatus('orchestrator', 'active')
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `User query received: "${msg.slice(0, 60)}..."`, status: 'Info' })

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, patient_id: useMedPilotStore.getState().activePatient?.patient_id || 'PT-001' }),
      })

      if (!res.ok) throw new Error(`Backend error ${res.status}`)
      const data = await res.json()

      // Push agent logs to store
      for (const log of data.agent_logs ?? []) {
        addLog({
          id: Date.now().toString() + Math.random(),
          timestamp: new Date(),
          agent_name: log.agent_name,
          action: log.action,
          status: log.status ?? 'Success',
        })
      }

      if (data.proposed_entry) {
        const entry = {
          ...data.proposed_entry,
          created_at: data.proposed_entry.created_at
            ? new Date(data.proposed_entry.created_at)
            : new Date(),
        }
        useMedPilotStore.getState().setProposedEntry(entry.entry_id, entry)
        useMedPilotStore.getState().setSidebarTab('hitl')
        addLog({
          id: Date.now().toString() + Math.random(),
          timestamp: new Date(),
          agent_name: 'System',
          action: `📋 Staged proposed entry ${data.proposed_entry.entry_id} for HITL review`,
          status: 'Warning',
        })
      }

      // Activate agents based on intent
      const intentAgentMap: Record<string, string> = {
        CLINICAL_QUERY:    'clinical_memory',
        DIETARY_CHECK:     'dietary_guard',
        ELIGIBILITY_CHECK: 'eligibility',
        EMERGENCY_VITALS:  'emergency_cascade',
        DOCUMENT_INTAKE:   'data_integrity',
      }
      const targetAgent = intentAgentMap[data.intent]
      if (targetAgent) {
        setAgentStatus(targetAgent as any, 'active')
        setTimeout(() => setAgentStatus(targetAgent as any, 'idle'), 3000)
      }
      setAgentStatus('orchestrator', 'idle')

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        intent: data.intent,
        priority: data.priority,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])

    } catch (err) {
      // Fallback: smart local mock
      setAgentStatus('orchestrator', 'idle')
      const fallback = getMockResponse(msg)
      addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: 'Backend offline — running local mock', status: 'Warning' })
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallback,
        intent: 'CLINICAL_QUERY',
        timestamp: new Date(),
      }])
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  async function triggerEmergencyFromChat() {
    const activePatient = useMedPilotStore.getState().activePatient;
    if (!activePatient) return;
    const vitals = {
      bp_systolic: 65, bp_diastolic: 40,
      spo2: 82, heart_rate: 138, temperature: 38.9,
      timestamp: new Date()
    };
    
    // Optimistic UI update
    useMedPilotStore.getState().setEmergencyMode({
      active: true,
      patient_id: activePatient.patient_id,
      patient_name: activePatient.name,
      vitals,
      nearest_hospital: 'Locating specific ICU...',
      hospital_coords: [12.9352, 77.6245],
      eta_minutes: 0,
      acknowledged: false,
      whatsapp_sent: false,
    });

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/emergency/vitals-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: activePatient.patient_id,
          vitals,
          gps: [12.9352, 77.6245]
        })
      });
      const data = await res.json();
      useMedPilotStore.getState().setEmergencyMode({
        nearest_hospital: data.hospital,
        eta_minutes: data.eta,
        whatsapp_sent: true,
      });
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-100 rounded-3xl border border-white/5 overflow-hidden shadow-glass">

      {/* Backend status bar */}
      {backendOnline === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Backend offline — running in demo mode. Start the FastAPI server to enable real AI responses.</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          /* Empty state — hero landing */
          <div className="flex flex-col items-center justify-center h-full gap-8 px-4">

            {/* Animated logo pulse */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-full bg-accent/10 animate-ping-slow" />
              <div className="absolute w-16 h-16 rounded-full bg-accent/15 animate-pulse" />
              <div className="relative w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center shadow-glow">
                <span className="text-2xl">⚕️</span>
              </div>
            </div>

            {/* Headline */}
            <div className="text-center max-w-2xl">
              <h2 className="text-4xl font-bold text-white mb-2 tracking-tight leading-snug">
                Every second counts.<br />
                <span className="text-accent">MedPilot</span> is already thinking.
              </h2>
              <p className="text-slate-400 text-base mt-3 leading-relaxed">
                Your autonomous clinical co-pilot — drug interactions, lab analysis, PM-JAY eligibility,<br />
                emergency routing, and predictive trajectories. All in one command.
              </p>
            </div>

            {/* Capability pills */}
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {[
                { icon: '💊', label: 'Polypharmacy Check' },
                { icon: '🧪', label: 'Lab Analysis' },
                { icon: '🗺️', label: 'Emergency Routing' },
                { icon: '📋', label: 'ABDM Record Lookup' },
                { icon: '🏥', label: 'PM-JAY Eligibility' },
                { icon: '📈', label: 'Health Trajectory' },
                { icon: '🥗', label: 'Dietary Interactions' },
                { icon: '🔬', label: 'Prescription OCR' },
              ].map(({ icon, label }) => (
                <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-200 border border-white/8 text-slate-300 hover:border-accent/30 hover:text-accent transition-all cursor-default">
                  {icon} {label}
                </span>
              ))}
            </div>

            {/* Prompt starters */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {[
                '🧬 Check Warfarin + Ashwagandha interaction',
                '🚑 Find nearest emergency cardiac centre',
                '📊 Analyse latest CBC and flag anomalies',
                '💡 Is this patient eligible for PM-JAY?',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => {
                    const clean = q.replace(/^[\S]+\s/, '')
                    const input = document.querySelector('textarea,input[type=text]') as HTMLInputElement | null
                    if (input) { input.value = clean; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })) }
                  }}
                  className="text-left px-4 py-3 rounded-2xl text-xs text-slate-400 bg-surface-200/60 border border-white/5 hover:border-accent/25 hover:text-slate-200 hover:bg-surface-200 transition-all leading-relaxed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation thread */
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={cn('flex gap-4', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
              >
                {/* Avatar */}
                <div className={cn(
                  'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
                  msg.role === 'assistant' ? 'bg-accent/15 border border-accent/25' : 'bg-surface-200 border border-white/10'
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-5 h-5 text-accent" />
                    : <User className="w-5 h-5 text-slate-300" />
                  }
                </div>

                {/* Bubble */}
                <div className={cn(
                  'max-w-[75%] rounded-3xl px-5 py-4 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-surface-50 border border-white/8 text-slate-200 rounded-tr-lg'
                    : 'bg-surface-200 border border-white/5 text-slate-100 rounded-tl-lg'
                )}>
                  {/* Intent badge */}
                  {msg.intent && msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className={cn(
                        'text-[10px] px-2.5 py-0.5 rounded-full font-medium border',
                        msg.priority === 'high'
                          ? 'bg-warning/15 text-warning border-warning/25'
                          : 'bg-accent/10 text-accent border-accent/20'
                      )}>
                        {msg.intent.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                  {/* Render markdown-like line breaks */}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </motion.div>
            ))}

            {/* Thinking indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-accent" />
                </div>
                <div className="bg-surface-200 border border-white/5 rounded-3xl rounded-tl-lg px-5 py-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  <span className="text-sm text-slate-400">Agents processing your query...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-surface-200/60 border-t border-white/5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 bg-surface-300 rounded-full border border-white/8 px-3 py-2 focus-within:border-accent/30 transition-colors">
            <button className="p-2.5 text-slate-500 hover:text-slate-300 transition-colors rounded-full hover:bg-white/5">
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask MedPilot AI Agent a clinical question..."
              className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-slate-500 py-1"
              disabled={loading}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleVoice}
                className={cn(
                  'p-2.5 rounded-full transition-all',
                  listening
                    ? 'text-critical bg-critical/15 animate-pulse'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                )}
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                onClick={() => sendMessage()}
                disabled={loading || !query.trim()}
                className="p-2.5 bg-accent text-surface-300 rounded-full hover:bg-accent-light transition-all disabled:opacity-40 shadow-glow"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          <button
            onClick={triggerEmergencyFromChat}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-critical/10 hover:bg-critical/20 border border-critical/30 text-critical text-sm font-bold rounded-full transition-all shadow-glow-critical"
          >
            <Zap className="w-4 h-4 animate-pulse" />
            SOS
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-2">
          MedPilot AI assists licensed clinicians. Always verify AI suggestions with clinical judgement.
        </p>
      </div>
    </div>
  )
}

// ── Local mock fallback (no backend) ──────────────────────────────────────────
function getMockResponse(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('warfarin') || m.includes('ashwagandha') || m.includes('interaction'))
    return 'Ashwagandha may potentiate Warfarin\'s anticoagulant effect by inhibiting platelet aggregation and altering CYP2C9 metabolism. A clinical study (PMID: 28349297) observed a significant INR increase with concurrent use. **Recommendation:** Monitor INR closely (target 2.0–3.0). Consider dose reduction if INR exceeds 3.5.'
  if (m.includes('lab') || m.includes('inr') || m.includes('hba1c') || m.includes('result'))
    return 'Recent labs for Rajan Pillai (PT-001):\n- **INR: 3.8** — above therapeutic range (2.0–3.0). Warfarin dose review advised.\n- **HbA1c: 7.2%** — slightly above target (<7.0%). Consider Metformin dose optimisation.\n\nNext scheduled review: 2 weeks.'
  if (m.includes('pm-jay') || m.includes('pmjay') || m.includes('eligib'))
    return 'PM-JAY eligibility confirmed for Rajan Pillai (ABHA: 14-2948-3821-7710).\n- Scheme: Ayushman Bharat — PM-JAY Gold\n- Annual coverage limit: **Rs. 5,00,000**\n- e-KYC status: Authenticated\n- No co-pay required for listed procedures.'
  if (m.includes('hospital') || m.includes('icu') || m.includes('nearest') || m.includes('map'))
    return 'Nearest ICU-equipped hospitals from patient location (Bengaluru):\n1. **Apollo Hospital, Bannerghatta Rd** — 4.2 km · ETA 8 min\n2. **Manipal Hospital, Whitefield** — 7.1 km · ETA 14 min\n3. **Fortis Hospital, Bannerghatta** — 5.8 km · ETA 11 min\n\nAll three have confirmed ICU availability.'
  return 'I\'m MedPilot OS, your AI clinical assistant. I can help with drug interaction checks, lab analysis, PM-JAY eligibility, emergency routing, and more. Please start the FastAPI backend for full AI-powered responses, or ask a specific question about your current patient.'
}
