import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Cpu, Wifi, Clock, ShieldCheck, Sun, Moon } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { formatTime } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useTheme } from '@/hooks/useTheme'

export default function Header() {
  const { emergencyState, activePatient } = useMedPilotStore()
  const [time, setTime] = useState(new Date())
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="relative z-50 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-surface-200/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 border border-accent/30">
          <Activity className="w-5 h-5 text-accent" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent animate-ping-slow" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white leading-none">MedPilot OS</h1>
          <p className="text-[10px] text-slate-500 leading-none mt-0.5">Clinical Intelligence Platform</p>
        </div>
      </div>

      {/* Emergency banner */}
      <AnimatePresence>
        {emergencyState.active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-critical/20 border border-critical/50 animate-glow-pulse"
          >
            <span className="w-2 h-2 rounded-full bg-critical animate-ping" />
            <span className="text-xs font-bold text-critical uppercase tracking-widest">
              Emergency Cascade Active
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right status strip */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        {/* Active patient */}
        {activePatient && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span className="text-white font-medium">{activePatient.name}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono text-[10px]">{activePatient.abha_id}</span>
          </div>
        )}
        {/* System status */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>System Active</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <Wifi className="w-3 h-3" />
          <span>Cloud Run</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <Clock className="w-3 h-3" />
          <span>{formatTime(time)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-accent" />
          <span className="text-accent font-semibold">12 Agents</span>
        </div>

        {/* ── Theme Toggle ── */}
        <button
          onClick={toggle}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="flex items-center justify-center w-8 h-8 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-200 group"
        >
          <AnimatePresence mode="wait" initial={false}>
            {theme === 'dark' ? (
              <motion.span
                key="sun"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Sun className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300" />
              </motion.span>
            ) : (
              <motion.span
                key="moon"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Moon className="w-3.5 h-3.5 text-accent" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </header>
  )
}
