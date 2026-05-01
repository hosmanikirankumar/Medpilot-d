import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, FileText, FlaskConical, Pill, BookOpen, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { confirmHITLEntry } from '@/lib/firestoreApi'
import { cn } from '@/lib/utils'
import type { ProposedEntry } from '@/types'

interface Props { entry: ProposedEntry }

export default function HITLConfirmationGate({ entry }: Props) {
  const { removeProposedEntry, addLog } = useMedPilotStore()
  const [expanded, setExpanded] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)

  async function handleConfirm() {
    setCommitting(true)
    try {
      await confirmHITLEntry(entry.entry_id, entry.patient_id)
      addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        agent_name: 'System',
        action: `✅ HITL Commit: Entry ${entry.entry_id} committed to patients/${entry.patient_id}/records`,
        status: 'Success',
      })
      setCommitted(true)
      setTimeout(() => removeProposedEntry(entry.entry_id), 2000)
    } catch (err) {
      console.error(err)
      addLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        agent_name: 'System',
        action: `❌ HITL Commit Failed for Entry ${entry.entry_id}`,
        status: 'Error',
      })
      setCommitting(false)
    }
  }

  function handleReject() {
    addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      agent_name: 'System',
      action: `❌ HITL Reject: Entry ${entry.entry_id} rejected by clinician`,
      status: 'Warning',
    })
    removeProposedEntry(entry.entry_id)
  }

  const confidence = entry.extracted_data.confidence
  const confColor = confidence >= 0.9 ? 'text-accent' : confidence >= 0.75 ? 'text-warning' : 'text-critical'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'rounded-2xl border-2 overflow-hidden',
        entry.warnings.length > 0
          ? 'border-warning/50 bg-warning/5 shadow-glow-amber'
          : 'border-accent/40 bg-accent/5 shadow-glow'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning/20 border border-warning/30">
          <AlertTriangle className="w-4 h-4 text-warning" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-bold text-white">HITL Confirmation Gate</p>
          <p className="text-[10px] text-slate-500">Entry {entry.entry_id} · Patient {entry.patient_id}</p>
        </div>
        <span className={cn('text-xs font-mono font-bold', confColor)}>
          {(confidence * 100).toFixed(0)}% confidence
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>

      <AnimatePresence>
        {expanded && !committed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/10">

              {/* Educational Banner */}
              <div className="mt-3 p-3 rounded-xl bg-info/10 border border-info/20 flex items-start gap-2">
                <Info className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
                <p className="text-xs text-info/90 leading-relaxed">
                  <strong>Why review this?</strong> AI agents can occasionally hallucinate or misinterpret complex medical text. This Human-in-the-Loop (HITL) gate ensures no data enters the patient's Electronic Health Record (EHR) without explicit clinical verification.
                </p>
              </div>

              {/* Warnings */}
              {entry.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {entry.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Extracted medications */}
              {entry.extracted_data.medications && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Pill className="w-3 h-3" /> Extracted Medications
                  </p>
                  <div className="space-y-1">
                    {entry.extracted_data.medications.map((med, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
                        <span className="text-white font-medium">{med.name} <span className="text-slate-400 font-normal">{med.dosage}</span></span>
                        <span className="text-slate-500">{med.frequency} · {med.route}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lab values */}
              {entry.extracted_data.lab_values && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" /> Lab Values
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {entry.extracted_data.lab_values.map((lab, i) => {
                      const isAbnormal = lab.test === 'INR' && lab.value > 3
                      return (
                        <div key={i} className={cn(
                          'px-3 py-2 rounded-lg border text-xs',
                          isAbnormal
                            ? 'bg-critical/10 border-critical/30'
                            : 'bg-white/5 border-white/10'
                        )}>
                          <p className="text-slate-400">{lab.test}</p>
                          <p className={cn('text-base font-bold font-mono', isAbnormal ? 'text-critical' : 'text-white')}>
                            {lab.value} <span className="text-xs font-normal text-slate-500">{lab.unit}</span>
                          </p>
                          <p className="text-[9px] text-slate-600">Ref: {lab.reference_range}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI Reasoning trace */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> AI Reasoning Trace
                </p>
                <div className="space-y-0.5 font-mono text-[10px] max-h-24 overflow-y-auto">
                  {entry.ai_reasoning_trace.map((line, i) => (
                    <p key={i} className={cn(
                      'text-slate-500 leading-relaxed',
                      line.includes('⚠️') && 'text-warning',
                      line.includes('CRITICAL') && 'text-critical',
                    )}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              {/* PMID links */}
              {entry.pmid_links.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <BookOpen className="w-3 h-3 text-info" />
                  {entry.pmid_links.map((link, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-info/10 border border-info/20 text-info font-mono">
                      {link}
                    </span>
                  ))}
                </div>
              )}

              {/* CTA buttons */}
              <div className="flex gap-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirm}
                  disabled={committing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold shadow-glow hover:bg-accent-light transition-all disabled:opacity-60"
                >
                  {committing ? (
                    <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Committing...</>
                  ) : (
                    <><CheckCircle className="w-3.5 h-3.5" />Confirm to DB</>
                  )}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleReject}
                  disabled={committing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-critical/40 text-critical text-xs font-bold hover:bg-critical/10 transition-all disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5" />Reject
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Success state */}
        {committed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-4 py-4 flex items-center gap-3 text-accent"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">Committed to patient record ✓</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
