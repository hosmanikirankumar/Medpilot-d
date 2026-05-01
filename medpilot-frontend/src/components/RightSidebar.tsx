import { AnimatePresence } from 'framer-motion'
import { Terminal, ShieldAlert, Activity } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import AgentTraceTerminal from './AgentTraceTerminal'
import HITLConfirmationGate from './HITLConfirmationGate'
import PatientPanel from './PatientPanel'
import AgentHeartbeat from './AgentHeartbeat'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'trace',       label: 'Agent Trace', icon: Terminal },
  { id: 'hitl',        label: 'HITL Gate',   icon: ShieldAlert },
  { id: 'eligibility', label: 'Patient',     icon: Activity },
] as const

export default function RightSidebar() {
  const { sidebarTab, setSidebarTab, proposedEntries } = useMedPilotStore()
  const pendingCount = Object.keys(proposedEntries).length

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">
      {/* Agent heartbeat — always visible */}
      <AgentHeartbeat />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-50/50 border border-white/10 flex-shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSidebarTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-200',
              sidebarTab === id
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
            {id === 'hitl' && pendingCount > 0 && (
              <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-warning text-[9px] font-bold text-surface">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
        {sidebarTab === 'trace' && (
          <div className="h-full min-h-[300px]">
            <AgentTraceTerminal />
          </div>
        )}

        {sidebarTab === 'hitl' && (
          <AnimatePresence>
            {Object.values(proposedEntries).length > 0 ? (
              Object.values(proposedEntries).map((entry) => (
                <HITLConfirmationGate key={entry.entry_id} entry={entry} />
              ))
            ) : (
              <div className="glass-card p-6 flex flex-col items-center gap-2 text-slate-600 text-xs text-center">
                <ShieldAlert className="w-8 h-8 text-slate-700" />
                <p>No pending entries.</p>
                <p className="text-slate-700">AI agents will stage proposed records here for your review.</p>
              </div>
            )}
          </AnimatePresence>
        )}

        {sidebarTab === 'eligibility' && (
          <PatientPanel />
        )}
      </div>
    </div>
  )
}
