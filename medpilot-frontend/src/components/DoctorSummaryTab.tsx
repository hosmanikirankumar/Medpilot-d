import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMedPilotStore } from '@/store/medpilotStore'
import {
  Stethoscope, RefreshCw, Loader2, User, Pill, AlertTriangle,
  FlaskConical, Heart, Calendar, FileText, ClipboardList,
  ChevronDown, ChevronUp, Sparkles, Shield, Activity,
  TrendingUp, BookOpen, Download
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BriefSection {
  icon: any
  title: string
  color: string
  content: string | string[]
  type: 'text' | 'list' | 'badges'
}

interface ParsedBrief {
  patient_name?: string
  age?: string
  conditions?: string[]
  medications?: string[]
  allergies?: string[]
  critical_flags?: string[]
  recent_labs?: string[]
  risk_assessment?: string
  recommendations?: string[]
  summary?: string
  raw: string
}

function parseBriefText(text: string, patient: any): ParsedBrief {
  // Extract structured info from AI response
  const parsed: ParsedBrief = { raw: text }

  if (patient) {
    parsed.patient_name = patient.name
    parsed.age = `${patient.age}y · ${patient.gender || 'N/A'} · ${patient.blood_type || 'N/A'}`
    parsed.conditions = patient.conditions || []
    parsed.medications = patient.active_medications || []
    parsed.allergies = Array.isArray(patient.allergies) ? patient.allergies : patient.allergies ? [patient.allergies] : []
  }

  // Try to extract flags and recommendations from AI text
  const lines = text.split('\n').filter(Boolean)
  parsed.critical_flags = lines
    .filter(l => l.toLowerCase().includes('⚠') || l.toLowerCase().includes('critical') || l.toLowerCase().includes('warning') || l.toLowerCase().includes('flag'))
    .slice(0, 4)
    .map(l => l.replace(/^[-•*]\s*/, '').trim())

  parsed.recommendations = lines
    .filter(l => l.toLowerCase().includes('recommend') || l.toLowerCase().includes('consider') || l.toLowerCase().includes('advise') || l.toLowerCase().includes('monitor'))
    .slice(0, 5)
    .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())

  // Grab a summary block — first 3 non-empty lines that seem like a summary
  const summaryLines = lines.filter(l => l.length > 40 && !l.startsWith('#')).slice(0, 2)
  parsed.summary = summaryLines.join(' ')

  return parsed
}

export default function DoctorSummaryTab() {
  const { activePatient, addLog, setAgentStatus } = useMedPilotStore()
  const [loading, setLoading] = useState(false)
  const [brief, setBrief] = useState<string | null>(null)
  const [parsedBrief, setParsedBrief] = useState<ParsedBrief | null>(null)
  const [agentLogs, setAgentLogs] = useState<any[]>([])
  const [expandedRaw, setExpandedRaw] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generateBrief() {
    if (!activePatient) return
    setLoading(true)
    setError(null)
    setAgentStatus('orchestrator', 'active')
    addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      agent_name: 'DoctorBrief',
      action: `Generating pre-consultation summary for ${activePatient.name}`,
      status: 'Info'
    })

    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || ''}/api/brief/${activePatient.patient_id}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const briefText = data.brief || ''
      setBrief(briefText)
      setParsedBrief(parseBriefText(briefText, activePatient))
      setAgentLogs(data.logs || [])
      setLastGenerated(new Date())
      addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        agent_name: 'DoctorBrief',
        action: `Doctor summary generated for ${activePatient.name}`,
        status: 'Success'
      })
    } catch (err: any) {
      setError(err.message || 'Failed to generate brief')
      addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        agent_name: 'DoctorBrief',
        action: `Summary generation failed: ${err.message}`,
        status: 'Error'
      })
    }

    setAgentStatus('orchestrator', 'idle')
    setLoading(false)
  }

  // Auto-generate when patient changes
  useEffect(() => {
    if (activePatient) {
      setBrief(null)
      setParsedBrief(null)
      setLastGenerated(null)
      generateBrief()
    }
  }, [activePatient?.patient_id])

  function downloadBrief() {
    if (!brief || !activePatient) return
    const blob = new Blob([
      `MedPilot Doctor Brief — ${activePatient.name}\n`,
      `Generated: ${lastGenerated?.toLocaleString()}\n`,
      `${'─'.repeat(60)}\n\n`,
      brief
    ], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `DoctorBrief_${activePatient.patient_id}_${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!activePatient) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
        <Stethoscope className="w-10 h-10 opacity-30" />
        <p className="text-sm">Select a patient to generate a doctor summary</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium text-white flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-accent" />
            Doctor Pre-Consultation Brief
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            AI-synthesized clinical summary for{' '}
            <span className="text-white font-medium">{activePatient.name}</span>
            {lastGenerated && (
              <span className="ml-2 text-xs text-slate-500">
                · Generated {lastGenerated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {brief && (
            <button
              onClick={downloadBrief}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-200 border border-white/10 text-slate-400 hover:text-white text-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          <button
            onClick={generateBrief}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 text-sm font-medium transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {loading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && !brief && (
        <div className="space-y-4">
          <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-5 h-5 text-accent animate-pulse" />
              <span className="text-sm text-accent font-medium animate-pulse">
                Synthesizing patient data via Gemini 2.5 Flash…
              </span>
            </div>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-4 bg-white/5 rounded-full animate-pulse" style={{ width: `${85 - i * 8}%` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-critical/10 border border-critical/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-critical flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-critical">Generation Failed</p>
            <p className="text-xs text-slate-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {parsedBrief && !loading && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Patient Identity Card */}
            <div className="bg-gradient-to-br from-accent/10 to-info/10 rounded-3xl border border-accent/20 p-6 shadow-glass">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                  <User className="w-7 h-7 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{parsedBrief.patient_name}</h3>
                  <p className="text-sm text-slate-400 mt-0.5">{parsedBrief.age}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">ABHA: {activePatient.abha_id}</p>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-xs font-bold text-accent">
                    <Sparkles className="w-3 h-3" />
                    AI Generated
                  </div>
                  {lastGenerated && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      {lastGenerated.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 3-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Conditions */}
              <SummaryCard
                icon={Heart}
                title="Active Conditions"
                color="text-critical"
                borderColor="border-critical/20"
                bgColor="bg-critical/5"
              >
                {parsedBrief.conditions && parsedBrief.conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parsedBrief.conditions.map((c, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-critical/20 border border-critical/30 text-critical">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No conditions recorded</p>
                )}
              </SummaryCard>

              {/* Medications */}
              <SummaryCard
                icon={Pill}
                title="Active Medications"
                color="text-info"
                borderColor="border-info/20"
                bgColor="bg-info/5"
              >
                <div className="space-y-1.5">
                  {parsedBrief.medications?.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0" />
                      <span className="text-xs text-slate-300">{m}</span>
                    </div>
                  )) || <p className="text-xs text-slate-500">None</p>}
                </div>
              </SummaryCard>

              {/* Allergies */}
              <SummaryCard
                icon={Shield}
                title="Known Allergies"
                color="text-warning"
                borderColor="border-warning/20"
                bgColor="bg-warning/5"
              >
                {parsedBrief.allergies && parsedBrief.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parsedBrief.allergies.map((a, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-warning/20 border border-warning/30 text-warning">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No Known Allergies (NKA)</p>
                )}
              </SummaryCard>
            </div>

            {/* Critical Flags */}
            {parsedBrief.critical_flags && parsedBrief.critical_flags.length > 0 && (
              <div className="bg-critical/5 rounded-3xl border border-critical/20 p-5 shadow-glass">
                <h4 className="text-sm font-bold text-critical flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4" />
                  Clinical Flags & Alerts
                </h4>
                <div className="space-y-2">
                  {parsedBrief.critical_flags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-critical mt-0.5 flex-shrink-0">⚠</span>
                      <p className="text-xs text-slate-300">{flag}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Full Brief */}
            <div className="bg-surface-100 rounded-3xl border border-white/5 shadow-glass overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-accent" />
                  Full AI Clinical Narrative
                </h4>
                <button
                  onClick={() => setExpandedRaw(!expandedRaw)}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  {expandedRaw ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              <AnimatePresence>
                {expandedRaw && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-5">
                      <div className="prose prose-invert prose-sm max-w-none">
                        {brief?.split('\n').map((line, i) => {
                          if (!line.trim()) return <br key={i} />
                          if (line.startsWith('#')) {
                            return <h3 key={i} className="text-white font-bold text-sm mt-4 mb-2">{line.replace(/^#+\s*/, '')}</h3>
                          }
                          if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={i} className="text-white font-semibold text-sm">{line.replace(/\*\*/g, '')}</p>
                          }
                          if (line.match(/^[-•*]\s/)) {
                            return (
                              <div key={i} className="flex items-start gap-2 my-1">
                                <span className="text-accent mt-1 flex-shrink-0">•</span>
                                <p className="text-xs text-slate-300">{line.replace(/^[-•*]\s/, '')}</p>
                              </div>
                            )
                          }
                          return <p key={i} className="text-xs text-slate-300 my-1">{line}</p>
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Always-visible summary preview */}
              {!expandedRaw && (
                <div className="p-5">
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-4">{parsedBrief.summary || brief?.slice(0, 300)}</p>
                  <button
                    onClick={() => setExpandedRaw(true)}
                    className="mt-3 text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    <ChevronDown className="w-3 h-3" /> Show full narrative
                  </button>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {parsedBrief.recommendations && parsedBrief.recommendations.length > 0 && (
              <div className="bg-accent/5 rounded-3xl border border-accent/15 p-5 shadow-glass">
                <h4 className="text-sm font-bold text-accent flex items-center gap-2 mb-3">
                  <ClipboardList className="w-4 h-4" />
                  AI Recommendations for Consultation
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {parsedBrief.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-xl bg-accent/5 border border-accent/10">
                      <span className="text-accent text-xs font-bold mt-0.5">{i + 1}.</span>
                      <p className="text-xs text-slate-300">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Logs */}
            {agentLogs.length > 0 && (
              <div className="bg-surface-100 rounded-3xl border border-white/5 p-5 shadow-glass">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  Agent Execution Trace
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {agentLogs.map((log: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', {
                        'bg-safe': log.status === 'Success',
                        'bg-warning': log.status === 'Warning',
                        'bg-critical': log.status === 'Error',
                        'bg-info': log.status === 'Info',
                      })} />
                      <span className="text-slate-600">[{log.agent_name}]</span>
                      <span>{log.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  title,
  color,
  borderColor,
  bgColor,
  children
}: {
  icon: any
  title: string
  color: string
  borderColor: string
  bgColor: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-3xl border p-5 shadow-glass', bgColor, borderColor)}>
      <h4 className={cn('text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2', color)}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h4>
      {children}
    </div>
  )
}
