import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMedPilotStore } from '@/store/medpilotStore'
import {
  Archive, FileText, Download, UploadCloud, FileEdit, Loader2,
  Pencil, Check, X, FlaskConical, Stethoscope, HeartPulse, Pill,
  Database, Stethoscope as DocIcon, ShieldAlert, TrendingUp, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClinicalRecord } from '@/types'

const TYPE_META: Record<string, { icon: any; color: string; bg: string }> = {
  'Discharge Summary': { icon: HeartPulse,  color: 'text-critical', bg: 'bg-critical/10' },
  'Lab Report':        { icon: FlaskConical, color: 'text-info',     bg: 'bg-info/10'     },
  'Cardiology Consult':{ icon: Stethoscope,  color: 'text-accent',   bg: 'bg-accent/10'   },
  'Prescription':      { icon: Pill,         color: 'text-warning',  bg: 'bg-warning/10'  },
  'default':           { icon: FileText,     color: 'text-slate-400',bg: 'bg-surface-300' },
}
function getTypeMeta(type: string) {
  for (const key of Object.keys(TYPE_META)) {
    if (type?.toLowerCase().includes(key.toLowerCase())) return TYPE_META[key]
  }
  return TYPE_META['default']
}

// ── Collapsible Section wrapper ──────────────────────────────────────────────
function Section({ title, icon: Icon, color, count, children }: {
  title: string; icon: any; color: string; count?: number; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-surface-100 rounded-2xl border border-white/5 overflow-hidden shadow-glass">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', `${color}/10`)}>
            <Icon className={cn('w-4 h-4', color)} />
          </div>
          <span className="text-sm font-semibold text-white">{title}</span>
          {count !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-300 text-slate-400 border border-white/5">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-white/5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ClinicalMemoryTab() {
  const { activePatient, patientRecords, setPatientRecords, upsertRecord, addLog, setProposedEntry } = useMedPilotStore()
  const [activeView, setActiveView] = useState<'sections' | 'upload' | 'manual'>('sections')
  const [uploading, setUploading] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [recordSource, setRecordSource] = useState<'firestore' | 'demo' | ''>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editFacility, setEditFacility] = useState('')
  const [saving, setSaving] = useState(false)
  const [recordType, setRecordType] = useState('Lab Report')
  const [facility, setFacility] = useState('')
  const [notes, setNotes] = useState('')

  // ── Aggregated data derived from records ──────────────────────────────────
  const [doctorSummary, setDoctorSummary] = useState<string>('')
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    if (activePatient) loadRecords()
  }, [activePatient?.patient_id])

  async function loadRecords() {
    if (!activePatient) return
    setLoadingRecords(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/patients/${activePatient.patient_id}/records`)
      if (res.ok) {
        const data = await res.json()
        setPatientRecords(data.records || [])
        setRecordSource(data.source || '')
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'ClinicalMemory', action: `Loaded ${data.records?.length || 0} records from ${data.source}`, status: 'Success' })
      }
    } catch (err) { console.error('Failed to load records', err) }
    setLoadingRecords(false)
  }

  async function fetchDoctorSummary() {
    if (!activePatient) return
    setLoadingSummary(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/doctor-summary/${activePatient.patient_id}`)
      if (res.ok) {
        const data = await res.json()
        setDoctorSummary(data.summary || data.content || JSON.stringify(data))
      }
    } catch (err) { console.error(err) }
    setLoadingSummary(false)
  }

  useEffect(() => {
    if (activePatient && activeView === 'sections') fetchDoctorSummary()
  }, [activePatient?.patient_id, activeView])

  function startEdit(rec: ClinicalRecord) { setEditingId(rec.record_id); setEditNotes(rec.notes || rec.structured?.summary || ''); setEditFacility(rec.facility || '') }
  function cancelEdit() { setEditingId(null); setEditNotes(''); setEditFacility('') }

  async function saveEdit(rec: ClinicalRecord) {
    if (!activePatient) return
    setSaving(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/records/${activePatient.patient_id}/${rec.record_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes, facility: editFacility })
      })
      if (res.ok) { upsertRecord({ ...rec, notes: editNotes, facility: editFacility }); cancelEdit() }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activePatient) return
    setUploading(true)
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'Orchestrator', action: `Started document intake for ${file.name}`, status: 'Info' })
    const entryId = `ENT-${Math.random().toString(36).substring(2,8).toUpperCase()}`
    let gcsUrl = 'gs://mock-bucket/mock.jpg'
    try {
      const urlRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/intake/upload-url?patient_id=${activePatient.patient_id}&entry_id=${entryId}`, { method: 'POST' })
      if (urlRes.ok) gcsUrl = (await urlRes.json()).gcs_url
    } catch {}
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/intake/process`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: activePatient.patient_id, gcs_url: gcsUrl, entry_id: entryId })
      })
      if (res.ok) {
        const data = await res.json()
        setProposedEntry(entryId, { entry_id: entryId, patient_id: activePatient.patient_id, extracted_data: data.extracted_data, source_image_url: gcsUrl, validation_status: 'PENDING_HUMAN_REVIEW', ai_reasoning_trace: data.reasoning_trace || [], warnings: data.warning_messages || [], pmid_links: [], created_at: new Date() })
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `Staged entry ${entryId} for HITL review`, status: 'Warning' })
        setActiveView('sections'); await loadRecords()
      }
    } catch (err) { console.error(err) }
    setUploading(false)
  }

  async function handleManualEntry(e: React.FormEvent) {
    e.preventDefault(); if (!activePatient) return
    const formData = new FormData()
    formData.append('patient_id', activePatient.patient_id)
    formData.append('record_type', recordType)
    formData.append('facility', facility)
    formData.append('notes', notes)
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/clinical-memory/manual`, { method: 'POST', body: formData })
      if (res.ok) { addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `Saved manual clinical record`, status: 'Success' }); setActiveView('sections'); setNotes(''); setFacility(''); await loadRecords() }
    } catch {}
  }

  if (!activePatient) return <div className="text-slate-400">No patient selected.</div>

  // ── Derived section data (no hardcoding — all from records) ───────────────
  const interactionRecords = patientRecords.filter(r =>
    r.type?.toLowerCase().includes('prescription') ||
    r.type?.toLowerCase().includes('polypharmacy') ||
    (r.structured?.medications?.length ?? 0) > 0
  )
  const symptomRecords = patientRecords.filter(r =>
    r.type?.toLowerCase().includes('consult') ||
    r.type?.toLowerCase().includes('discharge') ||
    r.type?.toLowerCase().includes('note')
  )
  const labRecords = patientRecords.filter(r =>
    r.type?.toLowerCase().includes('lab') ||
    r.type?.toLowerCase().includes('report') ||
    (r.structured?.lab_values?.length ?? 0) > 0
  )
  const allOther = patientRecords.filter(r =>
    !interactionRecords.includes(r) && !symptomRecords.includes(r) && !labRecords.includes(r)
  )

  // ── Record card (reusable inline) ─────────────────────────────────────────
  function RecordCard({ rec }: { rec: ClinicalRecord }) {
    const meta = getTypeMeta(rec.type)
    const Icon = meta.icon
    const isEditing = editingId === rec.record_id
    const labVals = rec.structured?.lab_values || []
    const flags = rec.structured?.flags || []
    return (
      <div className="bg-surface-200 rounded-xl border border-white/5 hover:border-white/10 transition-colors overflow-hidden mt-3">
        <div className="flex items-start gap-3 p-3">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', meta.bg)}>
            <Icon className={cn('w-4 h-4', meta.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-white">{rec.type}</p>
                <p className="text-[10px] text-slate-400">{rec.facility} · {rec.date}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold',
                  rec.source === 'demo' ? 'bg-slate-700/50 border-white/10 text-slate-500' : 'bg-accent/10 border-accent/30 text-accent'
                )}>{rec.source === 'demo' ? 'Demo' : 'Live'}</span>
                {!isEditing && (
                  <button onClick={() => startEdit(rec)} className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-surface-300 transition-all">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {!isEditing ? (
              <>
                {(rec.notes || rec.structured?.summary) && (
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{rec.notes || rec.structured?.summary}</p>
                )}
                {labVals.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {labVals.slice(0, 4).map((lv, i) => (
                      <span key={i} className={cn('text-[10px] px-1.5 py-0.5 rounded border font-mono',
                        lv.status === 'high' ? 'bg-warning/10 border-warning/30 text-warning' :
                        lv.status === 'low' || lv.status === 'critical' ? 'bg-critical/10 border-critical/30 text-critical' :
                        'bg-surface-300 border-white/5 text-slate-400'
                      )}>{lv.test}: {lv.value} {lv.unit}</span>
                    ))}
                  </div>
                )}
                {flags.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {flags.map((flag, i) => (
                      <p key={i} className="text-[10px] text-warning flex items-start gap-1"><span>⚠</span>{flag}</p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 space-y-2">
                <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" placeholder="Facility / Doctor" value={editFacility} onChange={e => setEditFacility(e.target.value)} />
                <textarea rows={2} className="w-full bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs resize-none" placeholder="Notes / Summary" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(rec)} disabled={saving} className="flex items-center gap-1 px-3 py-1 bg-accent text-white text-xs font-semibold rounded-lg hover:bg-accent-light disabled:opacity-50">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </button>
                  <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1 bg-surface-300 text-slate-400 text-xs rounded-lg hover:text-white">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Clinical Memory</h2>
          <p className="text-slate-400 text-sm">Unified longitudinal clinical record — organised by category.</p>
        </div>
        <div className="flex items-center gap-2">
          {recordSource && (
            <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold',
              recordSource === 'firestore' ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-slate-700/50 border-white/10 text-slate-400'
            )}>
              <Database className="w-3 h-3" />
              {recordSource === 'firestore' ? 'Firestore Live' : 'Demo Mode'}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-3">
        {(['sections', 'upload', 'manual'] as const).map(view => (
          <button key={view} onClick={() => setActiveView(view)} className={cn(
            'px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all flex items-center gap-1.5',
            activeView === view ? 'bg-accent/20 text-accent border border-accent/30 shadow-glow' : 'bg-surface-200 text-slate-400 border border-white/5 hover:bg-surface-300'
          )}>
            {view === 'sections' && <Archive className="w-4 h-4" />}
            {view === 'upload' && <UploadCloud className="w-4 h-4" />}
            {view === 'manual' && <FileEdit className="w-4 h-4" />}
            {view === 'sections' ? 'Clinical Record' : view}
          </button>
        ))}
        {activeView === 'sections' && (
          <button onClick={loadRecords} disabled={loadingRecords} className="ml-auto px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white border border-white/5 hover:border-white/20 transition-colors flex items-center gap-1.5">
            {loadingRecords ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Refresh
          </button>
        )}
      </div>

      {/* ── SECTIONS VIEW ──────────────────────────────────────────────────── */}
      {activeView === 'sections' && (
        <div className="space-y-4 flex-1 overflow-y-auto pb-4">

          {/* 1 — Doctor Summary */}
          <Section title="Doctor Summary" icon={DocIcon} color="text-accent" >
            {loadingSummary ? (
              <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating clinical summary...
              </div>
            ) : doctorSummary ? (
              <div className="mt-3 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-surface-200/50 rounded-xl p-4 border border-white/5">
                {doctorSummary}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <p className="text-sm text-slate-500">No summary generated yet.</p>
                <button onClick={fetchDoctorSummary} className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg font-semibold hover:bg-accent-light">
                  Generate
                </button>
              </div>
            )}
          </Section>

          {/* 2 — Drug Interactions & Prescriptions */}
          <Section title="Drug Interactions & Prescriptions" icon={ShieldAlert} color="text-warning" count={interactionRecords.length}>
            {interactionRecords.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No prescription or interaction records found.</p>
            ) : (
              interactionRecords.map(rec => <RecordCard key={rec.record_id} rec={rec} />)
            )}
          </Section>

          {/* 3 — Symptom Timeline / Consults */}
          <Section title="Symptom Timeline & Consults" icon={TrendingUp} color="text-safe" count={symptomRecords.length}>
            {symptomRecords.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No consult or discharge notes found.</p>
            ) : (
              <div className="relative border-l border-white/10 ml-3 mt-4 space-y-5">
                {symptomRecords.map((rec, i) => (
                  <div key={rec.record_id} className="relative pl-5">
                    <div className={cn('absolute w-2.5 h-2.5 rounded-full -left-[5px] top-1',
                      i === 0 ? 'bg-accent shadow-glow' : 'bg-slate-600'
                    )} />
                    <p className="text-[10px] text-slate-500">{rec.date} · {rec.facility}</p>
                    <p className="text-xs font-semibold text-white">{rec.type}</p>
                    {(rec.notes || rec.structured?.summary) && (
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{rec.notes || rec.structured?.summary}</p>
                    )}
                    {(rec.structured?.flags || []).map((f, fi) => (
                      <p key={fi} className="text-[10px] text-warning mt-0.5">⚠ {f}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 4 — Lab Reports */}
          <Section title="Lab Reports & Diagnostics" icon={FlaskConical} color="text-info" count={labRecords.length}>
            {labRecords.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No lab reports found.</p>
            ) : (
              labRecords.map(rec => <RecordCard key={rec.record_id} rec={rec} />)
            )}
          </Section>

          {/* 5 — Other Records */}
          {allOther.length > 0 && (
            <Section title="Other Records" icon={FileText} color="text-slate-400" count={allOther.length}>
              {allOther.map(rec => <RecordCard key={rec.record_id} rec={rec} />)}
            </Section>
          )}

          {patientRecords.length === 0 && !loadingRecords && (
            <div className="text-center py-16 text-slate-500">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No records yet. Upload a document or add a manual entry.</p>
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'upload' && (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-2xl bg-surface-100 hover:border-accent/50 hover:bg-accent/5 transition-all">
          {uploading ? (
            <div className="flex flex-col items-center text-accent">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="font-semibold text-lg">Processing via Gemini Vision...</p>
              <p className="text-xs text-slate-400">Extracting clinical data &amp; routing to validation</p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
              <p className="text-white font-medium text-lg mb-1">Drag &amp; Drop Medical Records</p>
              <p className="text-slate-400 text-sm mb-6">Supports PDF, JPEG, PNG</p>
              <label className="bg-accent text-white px-6 py-2 rounded-xl font-bold cursor-pointer hover:bg-accent-light transition-colors">
                Browse Files
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} />
              </label>
            </>
          )}
        </div>
      )}

      {/* ── MANUAL ENTRY VIEW ─────────────────────────────────────────────────── */}
      {activeView === 'manual' && (
        <form onSubmit={handleManualEntry} className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass space-y-4 max-w-2xl">
          <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-accent" /> Manual Entry
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Record Type</label>
              <select className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white" value={recordType} onChange={e => setRecordType(e.target.value)}>
                <option>Lab Report</option>
                <option>Discharge Summary</option>
                <option>Cardiology Consult</option>
                <option>Prescription</option>
                <option>Radiology Report</option>
                <option>Pathology Report</option>
                <option>Symptom Note</option>
                <option>General Consult</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Facility / Doctor</label>
              <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white" value={facility} onChange={e => setFacility(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Clinical Notes / Summary</label>
            <textarea required rows={5} className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={uploading} className="bg-accent text-white font-bold py-2 px-6 rounded-xl hover:bg-accent-light transition-colors disabled:opacity-50">
            {uploading ? 'Saving...' : 'Save Record'}
          </button>
        </form>
      )}
    </div>
  )
}
