import { useState, useEffect } from 'react'
import { Calendar, CheckSquare, Mail, Clock, Pill, RefreshCw, Plus, Send, AlertCircle } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  title: string
  start: string
  end?: string
  description?: string
  source?: string
  event_id?: string
}

interface HealthTask {
  title: string
  notes?: string
  due?: string
  completed?: boolean
  source?: string
}

interface WorkspaceData {
  events: CalendarEvent[]
  tasks: HealthTask[]
  auth_status: { configured: boolean; authenticated: boolean; source: string }
}

type ActionType = 'list_schedule' | 'schedule_medication' | 'create_appointment' | 'send_email'

const ACTION_OPTIONS: { id: ActionType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'list_schedule',        label: 'View Schedule',         icon: Calendar,    color: 'text-accent' },
  { id: 'schedule_medication',  label: 'Schedule Medications',  icon: Pill,        color: 'text-emerald-400' },
  { id: 'create_appointment',   label: 'Book Appointment',      icon: Plus,        color: 'text-violet-400' },
  { id: 'send_email',           label: 'Email Summary',         icon: Send,        color: 'text-amber-400' },
]

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso }
}

function MedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium border border-accent/20">
      <Pill className="w-3 h-3" /> {label}
    </span>
  )
}

export default function WorkspaceTab() {
  const { activePatient } = useMedPilotStore()
  const [schedule, setSchedule] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionType>('list_schedule')
  const [note, setNote] = useState('')
  const [lastResult, setLastResult] = useState<string>('')
  const [agentLogs, setAgentLogs] = useState<{ agent_name: string; action: string; status: string }[]>([])
  const [error, setError] = useState('')

  const patientId = activePatient?.patient_id || 'PT-001'

  const fetchSchedule = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/workspace/${patientId}/schedule`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSchedule(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSchedule() }, [patientId])

  const handleAction = async () => {
    setActionLoading(true)
    setLastResult('')
    setAgentLogs([])
    setError('')
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, action: activeAction, note }),
      })
      const data = await res.json()
      setLastResult(data.summary || '')
      setAgentLogs(data.agent_logs || [])
      await fetchSchedule()
    } catch (e: any) {
      setError(e.message || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const meds = activePatient?.active_medications || ['Warfarin 5mg', 'Metformin 500mg', 'Ashwagandha 300mg']

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Google Workspace Agent</h2>
          <p className="text-sm text-slate-400 mt-1">Medications · Appointments · Calendar · Gmail — powered by Gemini</p>
        </div>
        <div className="flex items-center gap-2">
          {schedule?.auth_status && (
            <span className={cn(
              'text-xs px-3 py-1 rounded-full font-medium border',
              schedule.auth_status.authenticated
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            )}>
              {schedule.auth_status.authenticated ? '🔗 Google Connected' : '📋 Demo Mode'}
            </span>
          )}
          <button onClick={fetchSchedule} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-200 text-slate-300 hover:text-white border border-white/5 text-sm transition-all">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Active Medications row */}
      <div className="bg-surface-100 rounded-2xl border border-white/5 p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Pill className="w-4 h-4 text-accent" /> Active Medications
        </h3>
        <div className="flex flex-wrap gap-2">
          {meds.map((m) => <MedBadge key={m} label={m} />)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Action Panel */}
        <div className="col-span-1 space-y-4">
          <div className="bg-surface-100 rounded-2xl border border-white/5 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {ACTION_OPTIONS.map(({ id, label, icon: Icon, color }) => (
                <button key={id} onClick={() => setActiveAction(id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all border',
                    activeAction === id
                      ? 'bg-accent/15 border-accent/30 text-white'
                      : 'border-transparent bg-surface-200 text-slate-400 hover:text-slate-200 hover:bg-surface-50'
                  )}>
                  <Icon className={cn('w-4 h-4', activeAction === id ? 'text-accent' : color)} />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note or instruction for Gemini..."
                rows={3}
                className="w-full bg-surface-200 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 placeholder-slate-500 resize-none focus:outline-none focus:border-accent/40"
              />
            </div>
            <button
              onClick={handleAction}
              disabled={actionLoading}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/80 disabled:opacity-50 transition-all">
              {actionLoading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
                : <><Send className="w-4 h-4" /> Run Agent</>}
            </button>
          </div>

          {/* Agent Logs */}
          {agentLogs.length > 0 && (
            <div className="bg-surface-100 rounded-2xl border border-white/5 p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Agent Trace</h3>
              <div className="space-y-2">
                {agentLogs.map((log, i) => (
                  <div key={i} className="text-xs text-slate-400 flex items-start gap-2">
                    <span className={cn('mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                      log.status === 'Success' ? 'bg-emerald-400'
                      : log.status === 'Warning' ? 'bg-amber-400'
                      : 'bg-slate-500'
                    )} />
                    <span className="text-slate-300 font-medium">{log.agent_name}:</span>
                    <span>{log.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Calendar + Tasks */}
        <div className="col-span-2 space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-critical/10 border border-critical/30 rounded-xl text-sm text-critical">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {lastResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-sm text-emerald-300">
              {lastResult}
            </div>
          )}

          {/* Calendar Events */}
          <div className="bg-surface-100 rounded-2xl border border-white/5 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" /> Upcoming Schedule (7 days)
            </h3>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 bg-surface-200 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : schedule?.events?.length ? (
              <div className="space-y-2">
                {schedule.events.map((evt, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 bg-surface-200 rounded-xl border border-white/5 hover:border-accent/20 transition-all">
                    <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{evt.title}</p>
                      <p className="text-xs text-slate-400">{formatTime(evt.start)}</p>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
                      evt.source === 'demo'
                        ? 'bg-slate-700/50 text-slate-400 border-white/5'
                        : 'bg-accent/10 text-accent border-accent/20'
                    )}>
                      {evt.source === 'demo' ? 'demo' : 'live'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
                <Calendar className="w-8 h-8" />
                <p className="text-sm">No upcoming events</p>
              </div>
            )}
          </div>

          {/* Health Tasks */}
          <div className="bg-surface-100 rounded-2xl border border-white/5 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" /> Health Tasks
            </h3>
            {schedule?.tasks?.length ? (
              <div className="space-y-2">
                {schedule.tasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 bg-surface-200 rounded-xl border border-white/5">
                    <div className={cn('w-4 h-4 rounded border-2 flex-shrink-0',
                      task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'
                    )} />
                    <div className="flex-1">
                      <p className={cn('text-sm font-medium', task.completed ? 'line-through text-slate-500' : 'text-white')}>
                        {task.title}
                      </p>
                      {task.due && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> Due: {task.due}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
                <CheckSquare className="w-8 h-8" />
                <p className="text-sm">No pending tasks</p>
              </div>
            )}
          </div>

          {/* Gmail Hint */}
          <div className="bg-surface-100 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
            <Mail className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Gmail Integration</p>
              <p className="text-xs text-slate-400">Use "Email Summary" action to send clinical summaries, doctor briefs, or appointment confirmations via Gmail API.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
