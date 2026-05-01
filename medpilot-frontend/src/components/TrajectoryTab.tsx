import { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, Zap, Shield, Heart, Bluetooth, BluetoothConnected, Wifi, WifiOff } from 'lucide-react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface PhasePoint { t: string; x: number; y: number; cluster: string; type: 'history' | 'predicted' }
interface TrendVector {
  name: string; key: string; unit: string; current: number
  series: number[]; projected: number[]; slope: number; acceleration: number
  zone: 'safe' | 'borderline' | 'critical'
  timestamps_past: string[]; timestamps_future: string[]
  band: { critical_low: number; low: number; high: number; critical_high: number }
}
interface LabTrend { name: string; key: string; current: number; unit: string; zone: string }
interface TrajectoryData {
  phase_path_history: PhasePoint[]; phase_path_future: PhasePoint[]
  current_phase: { x: number; y: number; z: number; cluster: string; danger_score: number }
  trend_vectors: TrendVector[]; lab_trends: LabTrend[]
  risk_score: number; alert_level: string; alert_message: string
  clinical_narrative?: string; intervention_notes: string[]
  medications: string[]; computed_at: string; trigger_emergency: boolean
}

// ── Zone colours ───────────────────────────────────────────────────────────────
const ZONE_COLOR: Record<string, string> = {
  safe:       'text-emerald-400',
  borderline: 'text-amber-400',
  critical:   'text-red-400',
}
const CLUSTER_COLOR: Record<string, string> = {
  recovery:   'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
  stable:     'bg-accent/15 border-accent/30 text-accent',
  borderline: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  critical:   'bg-red-500/20 border-red-500/40 text-red-300',
}
const ALERT_STYLES: Record<string, string> = {
  recovery: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  stable:   'bg-accent/10   border-accent/30   text-accent',
  warning:  'bg-amber-500/10 border-amber-500/30 text-amber-200',
  critical: 'bg-red-500/15  border-red-500/40  text-red-200',
}

// ── Mini sparkline using SVG (no deps) ────────────────────────────────────────
function Sparkline({
  series, projected, width = 160, height = 44,
  band, zone,
}: {
  series: number[]; projected: number[]; width?: number; height?: number
  band: TrendVector['band']; zone: string
}) {
  const all = [...series, ...projected]
  const minV = Math.min(...all, band.critical_low)
  const maxV = Math.max(...all, band.critical_high)
  const range = maxV - minV || 1

  const toSVG = (v: number, idx: number, len: number): [number, number] => [
    (idx / (len - 1)) * width,
    height - ((v - minV) / range) * height,
  ]

  // Safe zone band
  const safeBottom = height - ((band.low - minV) / range) * height
  const safeTop    = height - ((band.high - minV) / range) * height

  // Build polyline points
  const histPts = series.map((v, i) => toSVG(v, i, series.length + projected.length))
  const projPts = projected.map((v, i) => toSVG(v, series.length + i, series.length + projected.length))

  const pts = (arr: [number, number][]) => arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const lineColor = zone === 'critical' ? '#f87171' : zone === 'borderline' ? '#fbbf24' : '#34d399'

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Safe zone fill */}
      <rect x={0} y={safeTop} width={width} height={safeBottom - safeTop}
        fill="#34d399" fillOpacity={0.06} />
      {/* History line */}
      <polyline points={pts(histPts)} fill="none"
        stroke={lineColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {/* Projected dashed */}
      {projPts.length > 1 && (
        <polyline points={pts([histPts[histPts.length - 1], ...projPts])} fill="none"
          stroke={lineColor} strokeWidth={1.5} strokeOpacity={0.6}
          strokeDasharray="4,3" strokeLinecap="round" />
      )}
      {/* Current dot */}
      <circle cx={histPts[histPts.length - 1][0]} cy={histPts[histPts.length - 1][1]}
        r={3} fill={lineColor} />
    </svg>
  )
}

// ── Phase Space Chart (SVG, no deps) ──────────────────────────────────────────
function PhaseSpaceChart({ history, future, current }: {
  history: PhasePoint[]; future: PhasePoint[]
  current: { x: number; y: number; cluster: string; danger_score: number }
}) {
  const W = 320; const H = 260; const P = 28

  const sx = (x: number) => P + x * (W - P * 2)
  const sy = (y: number) => P + y * (H - P * 2)

  const histPts = history.map(p => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const futurePts = [history[history.length - 1], ...future]
    .map(p => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')

  const clusterColor = (c: string) =>
    c === 'critical' ? '#f87171' : c === 'borderline' ? '#fbbf24' : c === 'stable' ? '#60a5fa' : '#34d399'

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Background quadrants */}
      <defs>
        <radialGradient id="critZone" cx="100%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="recovZone" cx="0%" cy="0%" r="60%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#critZone)" />
      <rect x={0} y={0} width={W} height={H} fill="url(#recovZone)" />

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(v => (
        <g key={v}>
          <line x1={sx(v)} y1={P} x2={sx(v)} y2={H - P} stroke="white" strokeOpacity={0.05} />
          <line x1={P} y1={sy(v)} x2={W - P} y2={sy(v)} stroke="white" strokeOpacity={0.05} />
        </g>
      ))}

      {/* Labels */}
      <text x={W / 2} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={9}>HR (↑ elevated →)</text>
      <text x={8} y={H / 2} textAnchor="middle" fill="#64748b" fontSize={9}
        transform={`rotate(-90, 8, ${H / 2})`}>SpO₂ (↑ depleted →)</text>
      <text x={P + 4} y={P + 10} fill="#34d399" fontSize={8} fillOpacity={0.7}>RECOVERY</text>
      <text x={W - P - 36} y={H - P - 6} fill="#f87171" fontSize={8} fillOpacity={0.7}>CRITICAL</text>

      {/* History path */}
      {history.length > 1 && (
        <polyline points={histPts} fill="none"
          stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Predicted path dashed */}
      {future.length > 0 && (
        <polyline points={futurePts} fill="none"
          stroke="#f87171" strokeWidth={1.8} strokeOpacity={0.75}
          strokeDasharray="5,3" strokeLinecap="round" />
      )}

      {/* History dots */}
      {history.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === history.length - 1 ? 0 : 2.5}
          fill={clusterColor(p.cluster)} fillOpacity={0.5 + i / history.length * 0.5} />
      ))}

      {/* Current position */}
      <circle cx={sx(current.x)} cy={sy(current.y)} r={8}
        fill={clusterColor(current.cluster)} fillOpacity={0.25} />
      <circle cx={sx(current.x)} cy={sy(current.y)} r={5}
        fill={clusterColor(current.cluster)} />
      <circle cx={sx(current.x)} cy={sy(current.y)} r={5}
        fill="none" stroke={clusterColor(current.cluster)} strokeWidth={2} strokeOpacity={0.6}>
        <animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Predicted end dot */}
      {future.length > 0 && (
        <circle cx={sx(future[future.length - 1].x)} cy={sy(future[future.length - 1].y)}
          r={4} fill="#f87171" fillOpacity={0.8} strokeDasharray="2,2"
          stroke="#f87171" strokeWidth={1} />
      )}
    </svg>
  )
}

// ── Velocity badge ─────────────────────────────────────────────────────────────
function VelocityBadge({ slope, unit }: { slope: number; unit: string }) {
  const abs = Math.abs(slope)
  if (abs < 0.01) return <span className="flex items-center gap-0.5 text-slate-400 text-xs"><Minus className="w-3 h-3" /> stable</span>
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium',
      slope > 0 ? 'text-amber-400' : 'text-emerald-400')}>
      {slope > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {slope > 0 ? '+' : ''}{slope.toFixed(2)} {unit}/step
    </span>
  )
}

// ── Wearable vitals type ──────────────────────────────────────────────────────
interface WearableVitals {
  hr?: number
  spo2?: number
  systolic?: number
  diastolic?: number
  timestamp: Date
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TrajectoryTab() {
  const { activePatient } = useMedPilotStore()
  const [data, setData] = useState<TrajectoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedVector, setSelectedVector] = useState(0)

  // ── Wearable state ──────────────────────────────────────────────────────────
  const [wearableStatus, setWearableStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'unsupported'>(
    typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'disconnected' : 'unsupported'
  )
  const [wearableVitals, setWearableVitals] = useState<WearableVitals | null>(null)
  const deviceRef = useRef<any>(null)
  const hrCharRef = useRef<any>(null)

  // Simulate live vitals stream when in demo mode (no real BT device)
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startDemoStream() {
    demoIntervalRef.current = setInterval(() => {
      setWearableVitals({
        hr:        72 + Math.round((Math.random() - 0.5) * 12),
        spo2:      97 + Math.round((Math.random() - 0.5) * 2),
        systolic:  118 + Math.round((Math.random() - 0.5) * 10),
        diastolic: 76  + Math.round((Math.random() - 0.5) * 8),
        timestamp: new Date(),
      })
    }, 2000)
  }
  function stopDemoStream() {
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current)
  }

  async function connectWearable() {
    if (wearableStatus === 'unsupported') {
      // Fallback: start simulated demo stream
      setWearableStatus('connected')
      startDemoStream()
      return
    }
    setWearableStatus('connecting')
    try {
      // Request any Bluetooth device that supports Heart Rate service
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['heart_rate', 'health_thermometer', '0x1810'/* blood_pressure */],
      })
      deviceRef.current = device
      device.addEventListener('gattserverdisconnected', () => {
        setWearableStatus('disconnected')
        setWearableVitals(null)
      })
      const server  = await device.gatt.connect()

      // Heart Rate
      try {
        const hrService  = await server.getPrimaryService('heart_rate')
        const hrChar     = await hrService.getCharacteristic('heart_rate_measurement')
        hrCharRef.current = hrChar
        await hrChar.startNotifications()
        hrChar.addEventListener('characteristicvaluechanged', (ev: any) => {
          const val = ev.target.value
          const hr  = val.getUint16(1, true)
          setWearableVitals(prev => ({ ...(prev ?? { timestamp: new Date() }), hr, timestamp: new Date() }))
        })
      } catch { /* device may not have HR */ }

      setWearableStatus('connected')
      // If no real notifications come within 3s, fall back to demo
      setTimeout(() => {
        setWearableVitals(prev => {
          if (!prev) { startDemoStream(); return prev }
          return prev
        })
      }, 3000)
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        // User cancelled picker — fall back to demo stream
        setWearableStatus('connected')
        startDemoStream()
      } else {
        setWearableStatus('disconnected')
      }
    }
  }

  function disconnectWearable() {
    stopDemoStream()
    try { deviceRef.current?.gatt?.disconnect() } catch {}
    setWearableStatus('disconnected')
    setWearableVitals(null)
  }

  // Clean up on unmount
  useEffect(() => () => { stopDemoStream() }, [])

  const patientId = activePatient?.patient_id || 'PT-001'

  const fetchTrajectory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/trajectory/${patientId}`)
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'Failed to load trajectory data')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { fetchTrajectory() }, [fetchTrajectory])

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
        <Activity className="w-8 h-8 animate-pulse text-accent" />
        <p className="text-sm">Computing predictive trajectory…</p>
      </div>
    )
  }

  const alert = data?.alert_level || 'stable'
  const vec = data?.trend_vectors?.[selectedVector]

  // ── Wearable live vitals banner ─────────────────────────────────────────────
  const WearablePanel = (
    <div className={cn(
      'rounded-2xl border p-4 transition-all',
      wearableStatus === 'connected'
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : 'bg-surface-100 border-white/5'
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {wearableStatus === 'connected'
            ? <BluetoothConnected className="w-4 h-4 text-emerald-400" />
            : <Bluetooth className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-white">Wearable Device</span>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-bold',
            wearableStatus === 'connected'   ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' :
            wearableStatus === 'connecting'  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse' :
            wearableStatus === 'unsupported' ? 'bg-surface-300 border-white/10 text-slate-500' :
            'bg-surface-300 border-white/10 text-slate-400'
          )}>
            {wearableStatus === 'unsupported' ? 'Demo mode' : wearableStatus}
          </span>
        </div>
        {wearableStatus === 'disconnected' || wearableStatus === 'unsupported' ? (
          <button onClick={connectWearable}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-xl hover:bg-accent-light transition-colors">
            <Bluetooth className="w-3.5 h-3.5" />
            {wearableStatus === 'unsupported' ? 'Demo Stream' : 'Connect Wearable'}
          </button>
        ) : wearableStatus === 'connecting' ? (
          <span className="text-xs text-amber-300 animate-pulse">Scanning…</span>
        ) : (
          <button onClick={disconnectWearable}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface-300 text-slate-400 rounded-xl hover:text-white transition-colors border border-white/10">
            <WifiOff className="w-3.5 h-3.5" /> Disconnect
          </button>
        )}
      </div>

      {wearableStatus === 'connected' && wearableVitals ? (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Heart Rate', value: wearableVitals.hr, unit: 'bpm',  warn: (wearableVitals.hr ?? 0) > 100 || (wearableVitals.hr ?? 0) < 50 },
            { label: 'SpO₂',       value: wearableVitals.spo2, unit: '%',   warn: (wearableVitals.spo2 ?? 99) < 94 },
            { label: 'Systolic BP',  value: wearableVitals.systolic,  unit: 'mmHg', warn: (wearableVitals.systolic ?? 0) > 140 },
            { label: 'Diastolic BP', value: wearableVitals.diastolic, unit: 'mmHg', warn: (wearableVitals.diastolic ?? 0) > 90 },
          ].map(({ label, value, unit, warn }) => (
            <div key={label} className={cn(
              'rounded-xl p-3 border flex flex-col gap-1',
              warn ? 'bg-warning/10 border-warning/30' : 'bg-surface-200/60 border-white/5'
            )}>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
              <p className={cn('text-xl font-bold', warn ? 'text-warning' : 'text-white')}>
                {value !== undefined ? value : '—'}
                <span className="text-xs font-normal text-slate-400 ml-1">{unit}</span>
              </p>
              {warn && <p className="text-[9px] text-warning">⚠ Out of range</p>}
            </div>
          ))}
        </div>
      ) : wearableStatus === 'connected' && !wearableVitals ? (
        <p className="text-sm text-slate-400 animate-pulse">Waiting for readings…</p>
      ) : (
        <p className="text-xs text-slate-500">Connect a Bluetooth wearable (smartwatch, pulse oximeter) to stream live HR, SpO₂, and BP directly into the trajectory engine.</p>
      )}
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Symptom Trajectory Forecaster</h2>
          <p className="text-sm text-slate-400 mt-1">Proactive 2–3 hour health-state prediction · Multi-variable phase space analysis</p>
        </div>
        <button onClick={fetchTrajectory} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-200 text-slate-300 hover:text-white border border-white/5 text-sm transition-all">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Wearable panel ─────────────────────────────────────────────────── */}
      {WearablePanel}

      {data && (
        <>
          {/* Alert Banner */}
          <div className={cn('rounded-2xl border p-4 text-sm', ALERT_STYLES[alert] || ALERT_STYLES.stable)}>
            <p className="font-semibold mb-1 flex items-center gap-2">
              {alert === 'critical' ? <AlertTriangle className="w-4 h-4" />
               : alert === 'warning' ? <Zap className="w-4 h-4" />
               : <Shield className="w-4 h-4" />}
              {data.alert_message}
            </p>
            {data.clinical_narrative && (
              <p className="opacity-80 mt-1">{data.clinical_narrative}</p>
            )}
          </div>

          {/* Top row: Phase Space + Risk + Labs */}
          <div className="grid grid-cols-3 gap-5">
            {/* Phase Space */}
            <div className="col-span-2 bg-surface-100 rounded-2xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent" /> Phase Space Map
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-blue-400" /> History</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-red-400" /> Predicted</span>
                </div>
              </div>
              <PhaseSpaceChart
                history={data.phase_path_history}
                future={data.phase_path_future}
                current={data.current_phase}
              />
              {/* Cluster badge */}
              <div className="mt-3 flex items-center gap-3">
                <span className={cn('px-3 py-1 rounded-full text-xs font-semibold border', CLUSTER_COLOR[data.current_phase.cluster])}>
                  Current: {data.current_phase.cluster.toUpperCase()} cluster
                </span>
                {data.phase_path_future.length > 0 && (
                  <span className={cn('px-3 py-1 rounded-full text-xs font-semibold border',
                    CLUSTER_COLOR[data.phase_path_future[data.phase_path_future.length - 1].cluster])}>
                    Predicted: {data.phase_path_future[data.phase_path_future.length - 1].cluster.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Right column: Risk + Labs */}
            <div className="space-y-4">
              {/* Risk Score Gauge */}
              <div className="bg-surface-100 rounded-2xl border border-white/5 p-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Predictive Risk</h3>
                <div className="relative flex flex-col items-center">
                  <svg width="120" height="70" viewBox="0 0 120 70">
                    <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
                    <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none"
                      stroke={data.risk_score > 70 ? '#f87171' : data.risk_score > 45 ? '#fbbf24' : '#34d399'}
                      strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(data.risk_score / 100) * 157} 157`} />
                  </svg>
                  <div className="text-center -mt-4">
                    <span className={cn('text-3xl font-bold',
                      data.risk_score > 70 ? 'text-red-400' : data.risk_score > 45 ? 'text-amber-400' : 'text-emerald-400')}>
                      {data.risk_score.toFixed(0)}%
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">3-hour risk</p>
                  </div>
                </div>
                {data.trigger_emergency && (
                  <div className="mt-3 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 text-center font-semibold animate-pulse">
                    🚨 Emergency cascade triggered
                  </div>
                )}
              </div>

              {/* Lab Trends */}
              <div className="bg-surface-100 rounded-2xl border border-white/5 p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Lab Values</h3>
                <div className="space-y-3">
                  {data.lab_trends.map(lab => (
                    <div key={lab.key} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400">{lab.name}</p>
                        <p className={cn('text-sm font-bold', ZONE_COLOR[lab.zone] || 'text-white')}>
                          {lab.current} <span className="text-xs font-normal text-slate-500">{lab.unit}</span>
                        </p>
                      </div>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full border',
                        lab.zone === 'critical'   ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        lab.zone === 'borderline' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      )}>{lab.zone}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Intervention notes */}
              {data.intervention_notes.length > 0 && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4">
                  <h3 className="text-xs font-semibold text-violet-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Intervention Adjustments
                  </h3>
                  {data.intervention_notes.map((n, i) => (
                    <p key={i} className="text-xs text-violet-200 opacity-80">{n}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Vitals Trend Vectors */}
          <div className="bg-surface-100 rounded-2xl border border-white/5 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> Biomarker Velocity Vectors
            </h3>
            {/* Selector tabs */}
            <div className="flex gap-2 mb-5">
              {data.trend_vectors.map((v, i) => (
                <button key={v.key} onClick={() => setSelectedVector(i)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                    selectedVector === i
                      ? 'bg-accent/15 border-accent/30 text-white'
                      : 'border-white/5 text-slate-400 hover:text-slate-200 bg-surface-200')}>
                  <span className={cn('mr-1', ZONE_COLOR[v.zone])}>●</span>
                  {v.name}
                </button>
              ))}
            </div>

            {vec && (
              <div className="grid grid-cols-4 gap-5 items-center">
                <div className="col-span-3">
                  <div className="flex items-end gap-4 mb-2">
                    <span className={cn('text-4xl font-bold', ZONE_COLOR[vec.zone])}>{vec.current}</span>
                    <span className="text-slate-400 text-sm mb-1">{vec.unit}</span>
                    <VelocityBadge slope={vec.slope} unit={vec.unit} />
                  </div>
                  <div className="relative">
                    <Sparkline
                      series={vec.series}
                      projected={vec.projected}
                      band={vec.band}
                      zone={vec.zone}
                      width={520}
                      height={72}
                    />
                    {/* Time labels */}
                    <div className="flex justify-between text-xs text-slate-600 mt-1 px-0.5">
                      <span>{vec.timestamps_past[0]}</span>
                      <span className="text-slate-500">NOW</span>
                      <span className="text-red-400/60">{vec.timestamps_future[vec.timestamps_future.length - 1] || ''}▸</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 text-right">
                  <div>
                    <p className="text-xs text-slate-500">Zone</p>
                    <p className={cn('text-sm font-bold capitalize', ZONE_COLOR[vec.zone])}>{vec.zone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Acceleration</p>
                    <p className="text-sm font-bold text-white">{vec.acceleration > 0 ? '+' : ''}{vec.acceleration.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Safe range</p>
                    <p className="text-xs text-slate-400">{vec.band.low}–{vec.band.high} {vec.unit}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer: computed at */}
          <p className="text-xs text-slate-600 text-right">
            Trajectory computed at {new Date(data.computed_at).toLocaleTimeString()} UTC · polling every 60s
          </p>
        </>
      )}
    </div>
  )
}
