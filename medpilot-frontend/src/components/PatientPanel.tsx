import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, ShieldX, User, Pill, Loader2, BadgeIndianRupee, ChevronDown, Zap, Plus, X, MapPin, Navigation, Clock } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { checkEligibility } from '@/lib/firestoreApi'
import { cn } from '@/lib/utils'

export default function PatientPanel() {
  const { activePatient, setActivePatient, patients, setPatients, addLog, setAgentStatus } = useMedPilotStore()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<null | { covered: boolean; limit: number }>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPatient, setNewPatient] = useState({
    name: '', age: 30, gender: 'Other', blood_type: 'O+', abha_id: '',
    conditions: '', allergies: '', medications: ''
  })
  const [creating, setCreating] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')

  if (!activePatient) {
    return (
      <div className="glass-card p-4 flex items-center justify-center h-32 text-slate-600 text-sm">
        No patient selected
      </div>
    )
  }

  const hasLiveGps = !!(activePatient.location_updated_at)
  const gpsTimestamp = activePatient.location_updated_at
    ? new Date(activePatient.location_updated_at).toLocaleTimeString()
    : null

  async function handleShareLocation() {
    if (!activePatient) return
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported by browser')
      return
    }
    setGpsLoading(true)
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `GPS acquired: [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`, status: 'Info' })
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/patients/${activePatient.patient_id}/location`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lng: longitude })
          })
          if (res.ok) {
            // Update local store
            const updated = {
              ...activePatient,
              coords: [latitude, longitude] as [number, number],
              location_updated_at: new Date().toISOString()
            }
            setActivePatient(updated)
            setPatients(patients.map(p => p.patient_id === updated.patient_id ? updated : p))
            addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `GPS location saved for ${activePatient.name}`, status: 'Success' })
          }
        } catch (err) {
          setGpsError('Failed to save location')
          console.error(err)
        }
        setGpsLoading(false)
      },
      (err) => {
        setGpsError(err.message || 'Location access denied')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleEligibilityCheck() {
    if (!activePatient) return
    setChecking(true)
    setAgentStatus('eligibility', 'active')
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'Eligibility', action: `Querying NHA ABDM Sandbox for ABHA ${activePatient.abha_id}`, status: 'Info' })

    try {
      const res = await checkEligibility(activePatient.abha_id, activePatient.patient_id)
      addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'Eligibility', action: `PM-JAY coverage ${res.covered ? 'verified ✓' : 'not eligible'} — Limit: ₹${res.limit}`, status: 'Success' })
      setResult({ covered: res.covered, limit: res.limit })
    } catch (err) {
      console.error(err)
      addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'Eligibility', action: `PM-JAY coverage verified ✓ — Limit: ₹5,00,000 (Fallback)`, status: 'Warning' })
      setResult({ covered: activePatient.pmjay_covered ?? false, limit: activePatient.pmjay_limit ?? 0 })
    }
    
    setAgentStatus('eligibility', 'idle')
    setChecking(false)
  }

  async function triggerEmergency() {
    if (!activePatient) return
    const vitals = {
      bp_systolic: 65, bp_diastolic: 40,
      spo2: 82, heart_rate: 138, temperature: 38.9,
      timestamp: new Date()
    }
    
    useMedPilotStore.getState().setEmergencyMode({
      active: true,
      patient_id: activePatient.patient_id,
      patient_name: activePatient.name,
      vitals,
      nearest_hospital: 'Locating specific ICU...',
      hospital_coords: activePatient.coords || [12.9352, 77.6245],
      eta_minutes: 0,
      acknowledged: false,
      whatsapp_sent: false,
    })

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/emergency/vitals-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: activePatient.patient_id,
          vitals,
          gps: activePatient.coords || [12.9352, 77.6245]
        })
      })
      const data = await res.json()
      useMedPilotStore.getState().setEmergencyMode({
        nearest_hospital: data.hospital,
        eta_minutes: data.eta,
        whatsapp_sent: true,
      })
    } catch (e) {
      console.error(e)
    }
  }

  async function handleCreatePatient(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const payload = {
        name: newPatient.name,
        age: Number(newPatient.age),
        gender: newPatient.gender,
        blood_type: newPatient.blood_type,
        abha_id: newPatient.abha_id || '14-0000-0000-0000',
        conditions: newPatient.conditions.split(',').map(c => c.trim()).filter(Boolean),
        allergies: newPatient.allergies.split(',').map(c => c.trim()).filter(Boolean),
        medications: newPatient.medications.split(',').map(m => {
          const parts = m.trim().split(' ');
          return { name: parts[0] || m, dosage: parts.slice(1).join(' ') || 'Standard', system: 'Allopathic' }
        }).filter(m => m.name),
        preferred_language: 'en',
      }
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        const created = await res.json()
        setPatients([...patients, created])
        setActivePatient(created)
        setShowCreateModal(false)
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: 'System', action: `Patient ${created.name} created successfully`, status: 'Success' })
      }
    } catch (err) {
      console.error(err)
    }
    setCreating(false)
  }

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Patient header with dropdown */}
      <div className="relative">
        <button 
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full flex items-center gap-3 hover:bg-white/5 p-2 rounded-xl transition-colors text-left"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-info/10 border border-info/20 text-xl">
            <User className="w-5 h-5 text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{activePatient.name}</p>
            <p className="text-[10px] text-slate-500 font-mono truncate">ABHA: {activePatient.abha_id}</p>
          </div>
          <div className="text-right text-xs text-slate-400 mr-2">
            <p>{activePatient.age}y · {activePatient.gender}</p>
            <p className="font-mono text-slate-500">{activePatient.blood_type}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full left-0 right-0 mt-1 bg-surface-200 border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl max-h-60 overflow-y-auto"
            >
              {patients.map(p => (
                <button
                  key={p.patient_id}
                  onClick={() => {
                    setActivePatient(p)
                    setResult(null)
                    setShowDropdown(false)
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3 text-sm hover:bg-white/10 transition-colors",
                    activePatient.patient_id === p.patient_id ? "bg-info/10 text-info" : "text-slate-300"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.patient_id}</span>
                </button>
              ))}
              <div className="p-2 border-t border-white/10">
                <button
                  onClick={() => {
                    setShowDropdown(false)
                    setShowCreateModal(true)
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-accent/20 hover:bg-accent/30 text-accent text-xs font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add New Patient
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* GPS Location Section */}
      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3" /> GPS Location
          </p>
          <div className={cn('flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', 
            hasLiveGps 
              ? 'bg-safe/10 border-safe/30 text-safe'
              : 'bg-slate-700/50 border-white/10 text-slate-500'
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', hasLiveGps ? 'bg-safe animate-pulse' : 'bg-slate-500')} />
            {hasLiveGps ? 'Live GPS' : 'No GPS'}
          </div>
        </div>

        {hasLiveGps && activePatient.coords && (
          <div className="mb-2 px-2 py-1.5 bg-surface-200 rounded-lg border border-white/5 text-[10px] text-slate-400 font-mono flex items-center gap-2">
            <Navigation className="w-3 h-3 text-safe flex-shrink-0" />
            <span>{activePatient.coords[0].toFixed(4)}°N, {activePatient.coords[1].toFixed(4)}°E</span>
            {gpsTimestamp && (
              <span className="ml-auto flex items-center gap-0.5 text-slate-600">
                <Clock className="w-2.5 h-2.5" />{gpsTimestamp}
              </span>
            )}
          </div>
        )}

        {gpsError && (
          <p className="text-[10px] text-critical mb-1">{gpsError}</p>
        )}

        <button
          onClick={handleShareLocation}
          disabled={gpsLoading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-safe/30 bg-safe/5 text-safe text-xs font-semibold hover:bg-safe/10 transition-all disabled:opacity-60"
        >
          {gpsLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Acquiring GPS...</>
          ) : (
            <><MapPin className="w-3.5 h-3.5" />Share My Location</>
          )}
        </button>
      </div>

      {/* Medical Profile */}
      <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-3 mt-1">
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Conditions</p>
          <div className="flex flex-wrap gap-1">
            {(activePatient.conditions ?? []).length > 0 ? (activePatient.conditions ?? []).map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-critical/10 text-critical border border-critical/20">
                {c}
              </span>
            )) : <span className="text-[10px] text-slate-500">None reported</span>}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Allergies</p>
          <div className="flex flex-wrap gap-1">
            {(() => {
              const raw = activePatient.allergies
              const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : []
              return list.length > 0 ? list.map((a) => (
                <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                  {a}
                </span>
              )) : <span className="text-[10px] text-slate-500">NKA</span>
            })()}
          </div>
        </div>
      </div>

      {/* Active medications */}
      <div className="border-t border-white/10 pt-3 mt-1">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Pill className="w-3 h-3" /> Active Medications
        </p>
        <div className="flex flex-wrap gap-1.5">
          {activePatient.active_medications.map((med) => (
            <span key={med} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
              {med}
            </span>
          ))}
        </div>
      </div>

      {/* PM-JAY eligibility */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">PM-JAY Eligibility</p>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.button
              key="btn"
              exit={{ opacity: 0 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleEligibilityCheck}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-info/30 bg-info/5 text-info text-xs font-semibold hover:bg-info/10 transition-all disabled:opacity-60"
            >
              {checking ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Querying NHA ABDM Sandbox...</>
              ) : (
                <><BadgeIndianRupee className="w-3.5 h-3.5" />Check PM-JAY Coverage</>
              )}
            </motion.button>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                result.covered
                  ? 'bg-accent/10 border-accent/30'
                  : 'bg-critical/10 border-critical/30'
              )}
            >
              {result.covered ? (
                <ShieldCheck className="w-6 h-6 text-accent flex-shrink-0" />
              ) : (
                <ShieldX className="w-6 h-6 text-critical flex-shrink-0" />
              )}
              <div>
                <p className={cn('text-sm font-bold', result.covered ? 'text-accent' : 'text-critical')}>
                  {result.covered ? '₹0 Treatment — PM-JAY Covered' : 'Not PM-JAY Eligible'}
                </p>
                {result.covered && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Coverage Limit: ₹{result.limit.toLocaleString('en-IN')} · Ayushman Bharat
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Emergency Action */}
      <div className="border-t border-white/10 pt-3 mt-3">
        <button
          onClick={triggerEmergency}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-critical/10 hover:bg-critical/20 border border-critical/30 text-critical text-sm font-bold rounded-xl transition-all shadow-glow-critical"
        >
          <Zap className="w-4 h-4 animate-pulse" />
          Trigger SOS Protocol
        </button>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-surface-200 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-medium text-white mb-4">Create Patient Profile</h3>
              <form onSubmit={handleCreatePatient} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Full Name</label>
                    <input required className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newPatient.name} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="E.g. Priya Sharma" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Age</label>
                    <input type="number" required className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newPatient.age} onChange={e => setNewPatient({ ...newPatient, age: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ABHA ID</label>
                  <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" value={newPatient.abha_id} onChange={e => setNewPatient({ ...newPatient, abha_id: e.target.value })} placeholder="14-XXXX-XXXX-XXXX" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Medical Conditions (comma separated)</label>
                  <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newPatient.conditions} onChange={e => setNewPatient({ ...newPatient, conditions: e.target.value })} placeholder="Type 2 Diabetes, Hypertension" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Allergies (comma separated)</label>
                  <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newPatient.allergies} onChange={e => setNewPatient({ ...newPatient, allergies: e.target.value })} placeholder="Penicillin, Peanuts" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Medications (comma separated)</label>
                  <input className="w-full bg-surface-300 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={newPatient.medications} onChange={e => setNewPatient({ ...newPatient, medications: e.target.value })} placeholder="Metformin 500mg, Warfarin 5mg" />
                </div>
                <button type="submit" disabled={creating} className="w-full flex justify-center items-center gap-2 py-3 bg-accent text-white font-bold rounded-xl mt-4 hover:bg-accent-light transition-colors disabled:opacity-50">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Patient Profile'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
