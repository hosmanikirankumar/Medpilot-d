import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, MapPin, MessageSquare, Clock, X } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

export default function EmergencyBanner() {
  const { emergencyState, clearEmergency, setEmergencyMode, addLog } = useMedPilotStore()
  const { active, patient_name, vitals, nearest_hospital, eta_minutes, acknowledged, whatsapp_sent } = emergencyState

  function handleAcknowledge() {
    setEmergencyMode({ acknowledged: true })
    useMedPilotStore.getState().addLog({
      id: Date.now().toString(),
      timestamp: new Date(),
      agent_name: 'System',
      action: `✅ Emergency acknowledged by clinician. Rerouting to ${nearest_hospital}`,
      status: 'Success',
    })
    setTimeout(() => clearEmergency(), 4000)
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="overflow-hidden"
        >
          <div className={cn(
            'relative mx-4 mt-3 rounded-2xl border-2 p-4',
            'bg-critical/10 border-critical/50 shadow-glow-red',
            'animate-glow-pulse'
          )}>
            {/* Dismiss */}
            <button
              onClick={() => clearEmergency()}
              className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-wrap items-start gap-4">
              {/* Alert icon */}
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-critical/20 border border-critical/40">
                <AlertTriangle className="w-6 h-6 text-critical animate-pulse" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-critical uppercase tracking-wider">
                    ⚠ Critical Emergency — High Alert
                  </span>
                  {!acknowledged && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-critical/20 border border-critical/40 text-critical animate-pulse">
                      ACTION REQUIRED
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-300 mb-2">
                  <span className="text-white font-semibold">{patient_name}</span>
                  {' '}— Critical vitals detected.
                  {vitals && (
                    <span className="text-critical font-mono ml-1">
                      BP {vitals.bp_systolic}/{vitals.bp_diastolic} · SPO₂ {vitals.spo2}% · HR {vitals.heart_rate}bpm
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-info" />
                    <span className="text-slate-300">{nearest_hospital}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-warning" />
                    <span className="text-warning font-semibold">ETA {eta_minutes} min</span>
                  </span>
                  {whatsapp_sent && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-accent" />
                      <span className="text-accent">WhatsApp SOS sent</span>
                    </span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="flex-shrink-0">
                {!acknowledged ? (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleAcknowledge}
                    className="btn-critical text-sm"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Execute AI Reroute to Cold Storage
                  </motion.button>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 border border-accent/30 text-accent text-sm font-semibold">
                    <span>✓ Acknowledged — Rerouting</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
