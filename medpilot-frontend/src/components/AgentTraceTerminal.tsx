import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { formatTime, cn } from '@/lib/utils'
import type { AgentLog } from '@/types'

const STATUS_COLOR: Record<AgentLog['status'], string> = {
  Success: 'text-accent',
  Warning: 'text-warning',
  Error:   'text-critical',
  Info:    'text-info',
}

const STATUS_DOT: Record<AgentLog['status'], string> = {
  Success: 'bg-accent',
  Warning: 'bg-warning',
  Error:   'bg-critical',
  Info:    'bg-info',
}

export default function AgentTraceTerminal() {
  const { agentLogs } = useMedPilotStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs.length])

  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 flex-shrink-0">
        <Terminal className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-semibold text-slate-300">Live Agent Trace</span>
        <span className="ml-auto text-[10px] font-mono text-slate-600">
          {agentLogs.length}/50 entries
        </span>
        {/* Traffic lights */}
        <div className="flex gap-1.5 ml-2">
          <span className="w-2.5 h-2.5 rounded-full bg-critical/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
        </div>
      </div>

      {/* Log output — scrollable ring buffer */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-[11px] min-h-0">
        <AnimatePresence initial={false} mode="popLayout">
          {[...agentLogs].reverse().map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-2 py-0.5 leading-relaxed"
            >
              <span className="flex-shrink-0 text-slate-600 tabular-nums">
                {formatTime(log.timestamp)}
              </span>
              <span className={cn('flex-shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full', STATUS_DOT[log.status])} />
              <span className="text-sky-400 flex-shrink-0">[{log.agent_name}]</span>
              <span className={cn('flex-1 break-words', STATUS_COLOR[log.status])}>
                {log.action}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Blinking cursor */}
      <div className="px-4 py-2 border-t border-white/5 font-mono text-[11px] text-accent/60 flex-shrink-0">
        <span className="animate-pulse">▌</span>
        <span className="text-slate-700 ml-1">medpilot@gcp:~$</span>
      </div>
    </div>
  )
}
