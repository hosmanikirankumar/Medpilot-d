import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header from '@/components/Header'
import MapView from '@/components/MapView'
import AgentNetworkView from '@/components/AgentNetworkView'
import AgentTraceTerminal from '@/components/AgentTraceTerminal'
import HITLConfirmationGate from '@/components/HITLConfirmationGate'
import PatientPanel from '@/components/PatientPanel'
import EmergencyBanner from '@/components/EmergencyBanner'
import AssistantChat from '@/components/AssistantChat'
import { useAppBoot } from '@/hooks/useAppBoot'
import { useMedPilotStore } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'
import { Map, Activity, ShieldAlert, User, MessageSquare, Pill, TrendingUp, Archive, Stethoscope, CalendarDays, LineChart } from 'lucide-react'
import InteractionsTab from '@/components/InteractionsTab'
import SymptomsTab from '@/components/SymptomsTab'
import ClinicalMemoryTab from '@/components/ClinicalMemoryTab'
import DoctorSummaryTab from '@/components/DoctorSummaryTab'
import WorkspaceTab from '@/components/WorkspaceTab'
import TrajectoryTab from '@/components/TrajectoryTab'

const APP_TABS = [
  { id: 'agent',           label: 'AI Agent',            icon: MessageSquare },
  { id: 'doctor_summary',  label: 'Doctor Summary',       icon: Stethoscope },
  { id: 'interactions',    label: 'Interactions',         icon: Pill },
  { id: 'trajectory',      label: 'Trajectory',           icon: LineChart },
  { id: 'workspace',       label: 'Workspace',            icon: CalendarDays },
  { id: 'symptoms',        label: 'Symptom Timeline',     icon: TrendingUp },
  { id: 'clinical_memory', label: 'Clinical Memory',      icon: Archive },
  { id: 'map',             label: 'Live Map',             icon: Map },
  { id: 'agents',          label: 'Agent Network',        icon: Activity },
  { id: 'hitl',            label: 'HITL Gate',            icon: ShieldAlert },
  { id: 'patient',         label: 'Patient Panel',        icon: User },
] as const

export default function App() {
  const { emergencyState, proposedEntries } = useMedPilotStore()
  const pendingCount = Object.keys(proposedEntries).length
  const [activeTab, setActiveTab] = useState<typeof APP_TABS[number]['id']>('agent')

  useAppBoot()

  useEffect(() => {
    if (emergencyState.active) {
      document.body.classList.add('emergency-mode')
    } else {
      document.body.classList.remove('emergency-mode')
    }
  }, [emergencyState.active])

  return (
    <div className={cn(
      'flex flex-col h-screen overflow-hidden transition-all duration-700 bg-surface',
      emergencyState.active && 'bg-critical/10'
    )}>
      <Header />

      <AnimatePresence>
        {emergencyState.active && <EmergencyBanner />}
      </AnimatePresence>

      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <nav className="w-64 flex-shrink-0 border-r border-white/5 bg-surface-100 p-4 flex flex-col gap-2">
          {APP_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-3 py-3 px-4 rounded-2xl text-sm font-medium transition-all duration-200',
                activeTab === id
                  ? 'bg-accent/15 text-accent border border-accent/20 shadow-glow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-50 border border-transparent'
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
              {id === 'hitl' && pendingCount > 0 && (
                <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-warning text-[10px] font-bold text-surface-300">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Main Center Content Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-surface/50 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: activeTab === 'agent' ? 1 : 0, scale: activeTab === 'agent' ? 1 : 0.98 }}
            className={cn("h-full", activeTab === 'agent' ? "block" : "hidden")}
          >
            <AssistantChat />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'doctor_summary' ? 1 : 0, y: activeTab === 'doctor_summary' ? 0 : 10 }} className={cn("h-full", activeTab === 'doctor_summary' ? "block" : "hidden")}>
            <DoctorSummaryTab />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'interactions' ? 1 : 0, y: activeTab === 'interactions' ? 0 : 10 }} className={cn("h-full", activeTab === 'interactions' ? "block" : "hidden")}>
            <InteractionsTab />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'trajectory' ? 1 : 0, y: activeTab === 'trajectory' ? 0 : 10 }} className={cn("h-full overflow-y-auto", activeTab === 'trajectory' ? "block" : "hidden")}>
            <TrajectoryTab />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'workspace' ? 1 : 0, y: activeTab === 'workspace' ? 0 : 10 }} className={cn("h-full overflow-y-auto", activeTab === 'workspace' ? "block" : "hidden")}>
            <WorkspaceTab />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'symptoms' ? 1 : 0, y: activeTab === 'symptoms' ? 0 : 10 }} className={cn("h-full", activeTab === 'symptoms' ? "block" : "hidden")}>
            <SymptomsTab />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: activeTab === 'clinical_memory' ? 1 : 0, y: activeTab === 'clinical_memory' ? 0 : 10 }} className={cn("h-full", activeTab === 'clinical_memory' ? "block" : "hidden")}>
            <ClinicalMemoryTab />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: activeTab === 'map' ? 1 : 0, y: activeTab === 'map' ? 0 : 10 }}
            className={cn("h-full flex flex-col gap-2", activeTab === 'map' ? "flex" : "hidden")}
          >
            <h2 className="text-2xl font-medium text-white flex-shrink-0">Live Clinical Map</h2>
            <div className="flex-1 min-h-0">
              <MapView />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: activeTab === 'agents' ? 1 : 0, y: activeTab === 'agents' ? 0 : 10 }}
            className={cn("h-full overflow-y-auto", activeTab === 'agents' ? "block" : "hidden")}
          >
            <AgentNetworkView />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: activeTab === 'hitl' ? 1 : 0, y: activeTab === 'hitl' ? 0 : 10 }}
            className={cn("max-w-3xl mx-auto h-full flex-col", activeTab === 'hitl' ? "flex" : "hidden")}
          >
            <h2 className="text-2xl font-medium text-white mb-6">Human-in-the-Loop Review</h2>
            <div className="space-y-4">
              <AnimatePresence>
                {Object.values(proposedEntries).length > 0 ? (
                  Object.values(proposedEntries).map((entry) => (
                    <HITLConfirmationGate key={entry.entry_id} entry={entry} />
                  ))
                ) : (
                  <div className="bg-surface-100 rounded-3xl border border-white/5 p-16 flex flex-col items-center gap-4 text-slate-500 text-center shadow-glass">
                    <ShieldAlert className="w-16 h-16 text-surface-50" />
                    <p className="text-xl text-slate-300">No pending entries</p>
                    <p className="text-sm">AI agents will stage proposed records here for your review.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: activeTab === 'patient' ? 1 : 0, y: activeTab === 'patient' ? 0 : 10 }}
            className={cn("max-w-2xl mx-auto h-full flex-col", activeTab === 'patient' ? "flex" : "hidden")}
          >
            <h2 className="text-2xl font-medium text-white mb-6">Patient Profile</h2>
            <PatientPanel />
          </motion.div>
        </div>

        {/* Right Sidebar - ALWAYS VISIBLE Agent Trace */}
        <aside className="w-96 flex-shrink-0 bg-surface-100 border-l border-white/5 p-4 flex flex-col">
          <AgentTraceTerminal />
        </aside>
      </main>

      <footer className="flex-shrink-0 flex items-center justify-center gap-2 py-2 bg-surface-300 border-t border-white/5 text-xs text-slate-500">
        <span>Built for</span>
        <span className="text-slate-400 font-semibold">2026 Google APAC Gen AI Hackathon</span>
        <span>·</span>
        <span className="text-accent/50">Powered by Gemini 2.0 · Vertex AI · Firebase · Cloud Run</span>
      </footer>
    </div>
  )
}
