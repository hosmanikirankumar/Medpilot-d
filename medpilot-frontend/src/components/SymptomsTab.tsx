import { useState } from 'react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { TrendingUp, Activity, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SymptomsTab() {
  const { activePatient } = useMedPilotStore()

  const [events, setEvents] = useState([
    { id: 1, date: "Today", text: "Mild dizziness reported. Elevated INR detected during routine testing.", type: "recent" },
    { id: 2, date: "14 Days Ago", text: "Started Ashwagandha supplement for stress. No other lifestyle changes.", type: "history" },
    { id: 3, date: "2 Months Ago", text: "Routine follow-up. Warfarin dose adjusted to 5mg OD. Vitals stable.", type: "history" },
  ])
  const [newSymptom, setNewSymptom] = useState("")

  function handleAddSymptom() {
    if (!newSymptom.trim() || newSymptom.length < 5) {
      alert("Validation Error: Please describe the symptom in more detail (at least 5 characters).")
      return
    }
    const newEvent = {
      id: Date.now(),
      date: "Just Now",
      text: newSymptom,
      type: "recent"
    }
    setEvents([newEvent, ...events])
    setNewSymptom("")
  }

  if (!activePatient) {
    return <div className="text-slate-400">No patient selected.</div>
  }

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col space-y-6">
      <h2 className="text-2xl font-medium text-white mb-2">Symptom Trajectory</h2>

      <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass mb-6">
         <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Recent Vitals & Labs
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-200 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider">Blood Pressure</span>
                <span className="text-xl font-bold text-white">130/85 <span className="text-xs text-slate-500 font-normal">mmHg</span></span>
            </div>
            <div className="bg-surface-200 p-4 rounded-2xl border border-warning/20 flex flex-col gap-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider">Heart Rate</span>
                <span className="text-xl font-bold text-warning">98 <span className="text-xs text-warning/50 font-normal">bpm</span></span>
            </div>
            <div className="bg-surface-200 p-4 rounded-2xl border border-critical/30 flex flex-col gap-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider">INR Level</span>
                <span className="text-xl font-bold text-critical">3.8 <span className="text-xs text-critical/50 font-normal">High</span></span>
            </div>
            <div className="bg-surface-200 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                <span className="text-xs text-slate-400 uppercase tracking-wider">HbA1c</span>
                <span className="text-xl font-bold text-white">7.2 <span className="text-xs text-slate-500 font-normal">%</span></span>
            </div>
          </div>
      </div>

      <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass flex-1 flex flex-col">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            Longitudinal Trend
        </h3>

        {/* Add Symptom Section */}
        <div className="mb-6 flex gap-3 items-center bg-surface-200/50 border border-white/10 p-4 rounded-2xl">
          <input
            className="flex-1 bg-surface-300 border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm focus:border-accent/50 outline-none transition-colors"
            placeholder="Log a new symptom or event..."
            value={newSymptom}
            onChange={(e) => setNewSymptom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSymptom()}
          />
          <button 
            onClick={handleAddSymptom}
            className="px-5 py-2.5 bg-accent hover:bg-accent-light text-white font-medium rounded-xl text-sm transition-colors"
          >
            Add to Timeline
          </button>
        </div>

        {/* Trajectory timeline */}
        <div className="relative border-l border-white/10 ml-4 space-y-8 pb-4 flex-1 overflow-y-auto pr-4">
            {events.map((ev, i) => (
              <div key={ev.id} className="relative pl-6">
                  <div className={cn("absolute w-3 h-3 rounded-full -left-[6.5px] top-1.5", ev.type === 'recent' ? "bg-accent shadow-glow" : "bg-slate-500")}></div>
                  <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">{ev.date}</span>
                  </div>
                  <p className={cn("text-sm", ev.type === 'recent' ? "text-white font-medium" : "text-slate-300")}>{ev.text}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
