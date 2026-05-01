import { useState, useEffect, useRef } from "react"
import { useMedPilotStore } from "@/store/medpilotStore"
import { Pill, AlertTriangle, Leaf, Coffee, Camera, UploadCloud, Loader2, Plus, Trash2, CheckCircle2, FileImage, Sparkles, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PrescriptionMedication } from "@/types"

const SYSTEMS = ["Allopathic", "Ayurvedic", "Homeopathic", "Naturopathic"] as const
const SYSTEM_ICONS: Record<string, string> = {
  Allopathic: "💊", Ayurvedic: "🌿", Homeopathic: "🌱", Naturopathic: "🧪"
}

export default function InteractionsTab() {
  const { activePatient, addLog, setAgentStatus } = useMedPilotStore()
  const [matrixData, setMatrixData] = useState<{ medications: any[], matrix: any[][] } | null>(null)
  const [loadingMatrix, setLoadingMatrix] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ row: number, col: number } | null>(null)
  const [foodText, setFoodText] = useState("")
  const [foodResult, setFoodResult] = useState<any>(null)
  const [scanningFood, setScanningFood] = useState(false)
  const foodFileRef = useRef<HTMLInputElement>(null)
  const rxFileRef = useRef<HTMLInputElement>(null)
  const [activePanel, setActivePanel] = useState<"matrix"|"simulate"|"food"|"rx">("matrix")
  // Rx Scanner state
  const [rxFile, setRxFile] = useState<File | null>(null)
  const [rxNotes, setRxNotes] = useState("")
  const [rxLoading, setRxLoading] = useState(false)
  const [rxExtraction, setRxExtraction] = useState<any>(null)
  const [rxMeds, setRxMeds] = useState<PrescriptionMedication[]>([])
  const [rxConfirming, setRxConfirming] = useState(false)
  const [rxDone, setRxDone] = useState(false)
  // Manual add med
  const [manualName, setManualName] = useState("")
  const [manualDosage, setManualDosage] = useState("")
  const [manualDosageTime, setManualDosageTime] = useState("Morning")
  const [manualSystem, setManualSystem] = useState<string>("Allopathic")

  const [intervalData, setIntervalData] = useState<{ drug_a: string, drug_b: string, interval_hours: number, reasoning: string, clinical_note: string } | null>(null)
  const [loadingInterval, setLoadingInterval] = useState(false)

  const [simulateMeds, setSimulateMeds] = useState<{name: string, dosage: string, dosage_time: string, system: string}[]>([])
  const [simulateName, setSimulateName] = useState("")
  const [simulateDosage, setSimulateDosage] = useState("")
  const [simulateDosageTime, setSimulateDosageTime] = useState("Morning")
  const [simulateSystem, setSimulateSystem] = useState<string>("Allopathic")
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    if (activePatient) loadPolypharmacyMatrix()
  }, [activePatient])

  async function loadPolypharmacyMatrix() {
    if (!activePatient) return
    setLoadingMatrix(true)
    setAgentStatus("polypharmacy", "active")
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "Polypharmacy", action: `Building N×N matrix for ${activePatient.name}`, status: "Info" })
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/polypharmacy/${activePatient.patient_id}`)
      if (res.ok) {
        const data = await res.json()
        setMatrixData(data)
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "Polypharmacy", action: `Matrix built: ${data.medications?.length} medications`, status: "Success" })
      }
    } catch (err) { console.error(err) }
    setAgentStatus("polypharmacy", "idle")
    setLoadingMatrix(false)
  }

  async function handleSimulateMatrix() {
    if (!activePatient || simulateMeds.length === 0) return
    
    // Front-end Validation before sending data
    for (const med of simulateMeds) {
      if (!med.name.trim() || med.name.length < 2) {
        alert("Validation Error: Medication names must be at least 2 characters long.")
        return
      }
      if (!med.dosage.trim()) {
        alert(`Validation Error: Please provide a dosage for ${med.name}.`)
        return
      }
    }

    setLoadingMatrix(true)
    setSimulating(true)
    setActivePanel("matrix")
    setAgentStatus("polypharmacy", "active")
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "Polypharmacy", action: `Simulating matrix with ${simulateMeds.length} new medications`, status: "Info" })
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/polypharmacy/simulate/${activePatient.patient_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_medications: simulateMeds })
      })
      if (res.ok) {
        const data = await res.json()
        // Post-validation check
        if (!data.matrix || !data.medications) {
          throw new Error("Invalid response schema returned from agent.")
        }
        setMatrixData(data)
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "Polypharmacy", action: `Simulation Matrix built: ${data.medications?.length} total medications`, status: "Success" })
      } else {
        const err = await res.json()
        alert(`Server Validation Error: ${err.detail}`)
      }
    } catch (err: any) { 
      console.error(err)
      alert(err.message)
    }
    setAgentStatus("polypharmacy", "idle")
    setSimulating(false)
    setLoadingMatrix(false)
  }

  function addSimulateMed() {
    if (!simulateName || !simulateDosage) return
    setSimulateMeds(prev => [...prev, { name: simulateName, dosage: simulateDosage, dosage_time: simulateDosageTime, system: simulateSystem }])
    setSimulateName("")
    setSimulateDosage("")
  }

  async function handleFoodScan(file?: File) {
    if (!activePatient || (!foodText && !file)) return
    setScanningFood(true)
    setAgentStatus("dietary_guard", "active")
    const formData = new FormData()
    formData.append("patient_id", activePatient.patient_id)
    if (foodText) formData.append("text_input", foodText)
    if (file) formData.append("image", file)
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "DietaryGuard", action: `Analyzing food ${file ? "image" : "input"} for interactions`, status: "Info" })
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/food-scan`, { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        setFoodResult(data)
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "DietaryGuard", action: `Food scan complete: Risk ${data.overall_risk}`, status: data.overall_risk === "safe" ? "Success" : "Warning" })
      }
    } catch (err) { console.error(err) }
    setAgentStatus("dietary_guard", "idle")
    setScanningFood(false)
  }

  async function handleRxUpload() {
    if (!activePatient || !rxFile) return
    setRxLoading(true)
    addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "DataIntegrity", action: `Scanning prescription image via Gemini Vision`, status: "Info" })
    const formData = new FormData()
    formData.append("patient_id", activePatient.patient_id)
    formData.append("image", rxFile)
    if (rxNotes) formData.append("notes", rxNotes)
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/prescription/upload`, { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        setRxExtraction(data.extraction)
        setRxMeds(data.extraction?.medications || [])
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "DataIntegrity", action: `Extracted ${data.extraction?.medications?.length || 0} medications (confidence: ${((data.extraction?.confidence || 0) * 100).toFixed(0)}%)`, status: "Success" })
      }
    } catch (err) { console.error(err) }
    setRxLoading(false)
  }

  async function handleRxConfirm() {
    if (!activePatient || rxMeds.length === 0) return
    setRxConfirming(true)
    try {
      const payload = { patient_id: activePatient.patient_id, medications: rxMeds, doctor: rxExtraction?.doctor || "", date: rxExtraction?.date || "", facility: rxExtraction?.facility || "" }
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ""}/api/prescription/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (res.ok) {
        const data = await res.json()
        addLog({ id: Date.now().toString(), timestamp: new Date(), agent_name: "System", action: `Prescription confirmed: ${data.added_count} meds added, total ${data.total_medications}`, status: "Success" })
        setRxDone(true)
        await loadPolypharmacyMatrix()
      }
    } catch (err) { console.error(err) }
    setRxConfirming(false)
  }

  function updateRxMed(idx: number, field: string, value: string) {
    setRxMeds(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }
  function deleteRxMed(idx: number) { setRxMeds(prev => prev.filter((_, i) => i !== idx)) }
  function addRxMed() {
    if (!manualName || !manualDosage) {
      alert("Validation Error: Please provide both drug name and dosage.")
      return
    }
    setRxMeds(prev => [...prev, { name: manualName, dosage: manualDosage, frequency: manualDosageTime, route: "Oral", duration: "", system: manualSystem as any, notes: "" }])
    setManualName(""); setManualDosage("")
  }

  if (!activePatient) return <div className="text-slate-400">No patient selected.</div>

  const colors: Record<string, string> = { none: "bg-surface-200 border-white/5 text-slate-500", mild: "bg-info/10 border-info/30 text-info", moderate: "bg-warning/20 border-warning/50 text-warning", major: "bg-critical/20 border-critical/50 text-critical", unknown: "bg-surface-300 border-white/10 text-slate-500" }

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col space-y-4">
      <h2 className="text-2xl font-medium text-white">Interactions Analysis</h2>
      {/* Tab Bar */}
      <div className="flex gap-3">
        {[["matrix","💊 Polypharmacy Matrix"],["simulate","🧪 Simulate Meds"],["food","🍽 Dietary Guard"],["rx","📷 Rx Scanner"]] .map(([key, label]) => (
          <button key={key} onClick={() => setActivePanel(key as any)} className={cn("px-4 py-2 rounded-xl text-sm font-semibold transition-all border", activePanel === key ? "bg-accent/20 text-accent border-accent/30 shadow-glow" : "bg-surface-200 text-slate-400 border-white/5 hover:bg-surface-300")}>{label}</button>
        ))}
      </div>

      {/* Simulate Panel */}
      {activePanel === "simulate" && (
        <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass flex flex-col flex-1 min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-accent" /> Simulate Polypharmacy Toxicity</h3>
          </div>
          <p className="text-sm text-slate-400 mb-4">Add hypothetical medications to test against the patient's current active medications before actually prescribing them.</p>
          
          <div className="flex gap-2 items-center mb-6 border p-4 border-white/10 rounded-2xl bg-surface-200/50">
            <input className="flex-1 bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Drug name..." value={simulateName} onChange={e => setSimulateName(e.target.value)} />
            <input className="w-24 bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm" placeholder="Dosage..." value={simulateDosage} onChange={e => setSimulateDosage(e.target.value)} />
            <select className="bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm" value={simulateDosageTime} onChange={e => setSimulateDosageTime(e.target.value)}>
              {["Morning", "Afternoon", "Night", "After Meals", "Before Meals", "SOS"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="bg-surface-200 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm" value={simulateSystem} onChange={e => setSimulateSystem(e.target.value)}>
              {SYSTEMS.map(s => <option key={s} value={s}>{SYSTEM_ICONS[s]} {s}</option>)}
            </select>
            <button onClick={addSimulateMed} disabled={!simulateName || !simulateDosage} className="flex items-center gap-1.5 px-5 py-2.5 bg-surface-200 border border-white/10 text-white hover:bg-surface-300 rounded-xl text-sm transition-colors font-medium disabled:opacity-50"><Plus className="w-4 h-4" /> Add</button>
          </div>

          <div className="flex-1 overflow-y-auto mb-4 border border-white/5 rounded-2xl bg-surface-200/30 p-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Proposed Medications to Test ({simulateMeds.length})</h4>
            {simulateMeds.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No new medications added to simulation.</div>
            ) : (
              <div className="space-y-2">
                {simulateMeds.map((med, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-surface-200 p-3 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{SYSTEM_ICONS[med.system]}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{med.name} <span className="text-slate-400 font-normal">({med.dosage})</span></p>
                        <p className="text-xs text-slate-400">{med.system} · {med.dosage_time}</p>
                      </div>
                    </div>
                    <button onClick={() => setSimulateMeds(prev => prev.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-critical p-2 rounded-lg hover:bg-critical/10"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleSimulateMatrix} disabled={simulateMeds.length === 0 || simulating} className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-light disabled:opacity-50 transition-colors">
            {simulating ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Toxicity Matrix...</> : <><Sparkles className="w-5 h-5" /> Generate Toxicity Matrix</>}
          </button>
        </div>
      )}

      {/* Polypharmacy Matrix Panel */}
      {activePanel === "matrix" && (
        <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass flex flex-col flex-1 min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Pill className="w-5 h-5 text-info" /> N×N Polypharmacy Matrix</h3>
            <div className="flex items-center gap-2">
              {loadingMatrix && <Loader2 className="w-4 h-4 text-info animate-spin" />}
              <button onClick={loadPolypharmacyMatrix} disabled={loadingMatrix} className="text-xs px-3 py-1.5 rounded-lg bg-surface-200 border border-white/10 text-slate-400 hover:text-white transition-colors">Refresh from Record</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {!matrixData ? (
              <div className="h-full flex items-center justify-center text-slate-500">{loadingMatrix ? "Generating N×N analysis..." : "No data available"}</div>
            ) : (
              <div className="inline-block min-w-full">
                <div className="flex">
                  <div className="w-24 flex-shrink-0" />
                  {matrixData.medications.map((m: any, i: number) => (
                    <div key={i} className="w-24 p-2 text-[10px] text-center font-semibold text-slate-400 break-words flex flex-col items-center gap-1">
                      {m.system === "Ayurvedic" && <Leaf className="w-3 h-3 text-emerald-500" />}
                      {m.name}
                    </div>
                  ))}
                </div>
                {matrixData.matrix.map((row: any[], i: number) => (
                  <div key={i} className="flex">
                    <div className="w-24 p-2 text-[10px] font-semibold text-slate-400 flex items-center gap-1 break-words">
                      {matrixData.medications[i].system === "Ayurvedic" && <Leaf className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                      {matrixData.medications[i].name}
                    </div>
                    {row.map((cell: any, j: number) => {
                      const isSelected = selectedCell?.row === i && selectedCell?.col === j
                      const color = colors[cell.severity as keyof typeof colors] || colors.unknown
                      if (i === j) return <div key={j} className="w-24 h-12 m-0.5 rounded-lg bg-surface-300 border border-white/5 opacity-50 flex items-center justify-center"><div className="w-8 h-[1px] bg-white/20 rotate-45" /></div>
                      return (
                        <button key={j} onClick={async () => {
                          setSelectedCell({ row: i, col: j })
                          setIntervalData(null)
                          if (cell.severity === 'major' || cell.severity === 'moderate') {
                            setLoadingInterval(true)
                            try {
                              const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/polypharmacy/interval`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  drug_a: matrixData!.medications[i].name,
                                  drug_b: matrixData!.medications[j].name,
                                  severity: cell.severity,
                                  patient_id: activePatient!.patient_id
                                })
                              })
                              if (res.ok) setIntervalData(await res.json())
                            } catch(e) { console.error(e) }
                            setLoadingInterval(false)
                          }
                        }} className={cn("w-24 h-12 m-0.5 rounded-lg border flex flex-col items-center justify-center transition-all hover:scale-105", color, isSelected && "ring-2 ring-white ring-offset-2 ring-offset-surface-100")}>
                          <span className="text-xs font-bold capitalize">{cell.severity}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedCell && matrixData && selectedCell.row !== selectedCell.col && (() => {
            const cell = matrixData.matrix[selectedCell.row][selectedCell.col]
            const drugA = matrixData.medications[selectedCell.row].name
            const drugB = matrixData.medications[selectedCell.col].name
            const isToxic = cell.severity === 'major' || cell.severity === 'moderate'
            return (
              <div className="mt-4 space-y-3">
                {/* Interaction Detail Card */}
                <div className="p-4 rounded-xl bg-surface-200 border border-white/10 relative">
                  <button onClick={() => { setSelectedCell(null); setIntervalData(null) }} className="absolute top-2 right-2 text-slate-500 hover:text-white">✕</button>
                  <p className="text-xs text-slate-400 mb-1">
                    <span className="text-white font-semibold">{drugA}</span>{" + "}<span className="text-white font-semibold">{drugB}</span>
                  </p>
                  <p className={cn("text-sm font-bold mb-2 capitalize", {
                    "text-critical": cell.severity === "major",
                    "text-warning":  cell.severity === "moderate",
                    "text-info":     cell.severity === "mild",
                    "text-slate-400":cell.severity === "none"
                  })}>{cell.severity} Interaction</p>
                  <p className="text-sm text-slate-300">{cell.summary}</p>
                  <p className="text-xs text-slate-500 mt-2 italic">{cell.mechanism}</p>
                </div>

                {/* Dosing Interval Recommendation (major/moderate only) */}
                {isToxic && (
                  <div className={cn(
                    "p-4 rounded-xl border",
                    cell.severity === 'major'
                      ? "bg-critical/10 border-critical/30"
                      : "bg-warning/10 border-warning/30"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{cell.severity === 'major' ? '🚨' : '⚠️'}</span>
                      <p className={cn("text-sm font-bold", cell.severity === 'major' ? 'text-critical' : 'text-warning')}>
                        Safe Dosing Interval Recommendation
                      </p>
                      {loadingInterval && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-auto" />}
                    </div>
                    {loadingInterval && !intervalData && (
                      <p className="text-xs text-slate-400 animate-pulse">Calculating safe interval via clinical AI...</p>
                    )}
                    {intervalData && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="text-center px-4 py-2 rounded-xl bg-surface-300/50 border border-white/10">
                            <p className="text-2xl font-bold text-white">{intervalData.interval_hours}h</p>
                            <p className="text-[10px] text-slate-400">Min. gap</p>
                          </div>
                          <p className="text-sm text-slate-300 flex-1">{intervalData.reasoning}</p>
                        </div>
                        {intervalData.clinical_note && (
                          <p className="text-xs text-slate-400 bg-surface-300/30 px-3 py-2 rounded-lg border border-white/5 italic">
                            💡 {intervalData.clinical_note}
                          </p>
                        )}
                      </div>
                    )}
                    {!loadingInterval && !intervalData && (
                      <p className="text-xs text-slate-500">Click the interaction cell to load interval data.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Dietary Guard Panel */}
      {activePanel === "food" && (
        <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass flex flex-col flex-1">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Coffee className="w-5 h-5 text-warning" /> Dietary Guard Scanner</h3>
          <input type="text" placeholder="E.g. Palak Paneer, Grapefruit juice, Dal rice..." className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent mb-2" value={foodText} onChange={e => setFoodText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFoodScan()} />
          <div className="flex items-center gap-2 mb-4">
            <input type="file" accept="image/*" className="hidden" ref={foodFileRef} onChange={e => e.target.files?.[0] && handleFoodScan(e.target.files[0])} />
            <button onClick={() => foodFileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-surface-200 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors text-xs"><UploadCloud className="w-4 h-4" /> Upload</button>
            <button onClick={() => { if (foodFileRef.current) { foodFileRef.current.setAttribute("capture","environment"); foodFileRef.current.click(); setTimeout(() => foodFileRef.current?.removeAttribute("capture"), 1000) } }} className="flex items-center gap-1.5 px-3 py-2 bg-surface-200 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors text-xs"><Camera className="w-4 h-4" /> Camera</button>
            <button onClick={() => handleFoodScan()} disabled={!foodText || scanningFood} className="ml-auto flex items-center gap-2 px-5 py-2 bg-accent text-white font-semibold rounded-xl hover:bg-accent-light disabled:opacity-50 transition-colors text-sm">{scanningFood ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{scanningFood ? "Analyzing..." : "Analyze Food"}</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-surface-200/50 rounded-2xl border border-white/5 p-4">
            {!foodResult && !scanningFood ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2"><Coffee className="w-8 h-8 opacity-50" /><p className="text-sm">Scan a meal or type ingredients</p></div>
            ) : scanningFood ? (
              <div className="h-full flex flex-col items-center justify-center text-accent gap-3"><Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm font-medium">Analyzing dietary composition...</p></div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Identified Foods</p><p className="text-sm text-white font-medium">{foodResult.food_items?.join(", ")}</p></div>
                  <div className={cn("px-3 py-1 rounded-full text-xs font-bold border capitalize", { "bg-safe/20 border-safe/40 text-safe": foodResult.overall_risk === "safe", "bg-warning/20 border-warning/40 text-warning": foodResult.overall_risk === "caution", "bg-critical/20 border-critical/40 text-critical": foodResult.overall_risk === "avoid" })}>{foodResult.overall_risk}</div>
                </div>
                {foodResult.interactions?.map((int: any, i: number) => (
                  <div key={i} className={cn("p-3 rounded-xl border", { "bg-warning/10 border-warning/30": int.risk === "caution", "bg-critical/10 border-critical/30": int.risk === "avoid", "bg-safe/10 border-safe/30": int.risk === "safe" })}>
                    <div className="flex items-start gap-2"><AlertTriangle className={cn("w-4 h-4 mt-0.5", { "text-warning": int.risk === "caution", "text-critical": int.risk === "avoid", "text-safe": int.risk === "safe" })} /><div><p className="text-sm font-semibold text-white">{int.food} <span className="text-slate-400 font-normal">↔</span> {int.medication}</p><p className="text-xs text-slate-300 mt-1">{int.reason}</p></div></div>
                  </div>
                ))}
                {foodResult.ayurvedic_notes && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30"><p className="text-xs font-bold text-emerald-400 flex items-center gap-1 mb-1"><Leaf className="w-3 h-3" /> Ayurvedic Context</p><p className="text-xs text-slate-300">{foodResult.ayurvedic_notes}</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rx Scanner Panel */}
      {activePanel === "rx" && (
        <div className="bg-surface-100 rounded-3xl border border-white/5 p-6 shadow-glass flex flex-col flex-1 space-y-5">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><FileImage className="w-5 h-5 text-accent" /> Prescription Scanner</h3>
          {rxDone ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <div className="w-16 h-16 rounded-full bg-safe/20 border border-safe/40 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-safe" /></div>
              <p className="text-white font-semibold text-lg">Prescription Confirmed!</p>
              <p className="text-slate-400 text-sm">Medications merged. Polypharmacy matrix refreshed.</p>
              <button onClick={() => { setRxDone(false); setRxFile(null); setRxExtraction(null); setRxMeds([]) }} className="px-5 py-2.5 bg-accent text-white rounded-xl font-semibold hover:bg-accent-light transition-colors">Scan Another</button>
            </div>
          ) : !rxExtraction ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center hover:border-accent/40 hover:bg-accent/5 transition-all cursor-pointer" onClick={() => rxFileRef.current?.click()}>
                <input type="file" accept="image/*,.pdf" className="hidden" ref={rxFileRef} onChange={e => { if (e.target.files?.[0]) setRxFile(e.target.files[0]) }} />
                {rxFile ? (
                  <div className="text-center"><FileImage className="w-10 h-10 text-accent mx-auto mb-2" /><p className="text-white font-medium">{rxFile.name}</p><p className="text-xs text-slate-400 mt-1">{(rxFile.size / 1024).toFixed(0)} KB</p></div>
                ) : (
                  <div className="text-center"><UploadCloud className="w-10 h-10 text-slate-400 mb-3" /><p className="text-white font-medium mb-1">Upload or photograph prescription</p><p className="text-xs text-slate-400">JPEG, PNG, PDF supported</p></div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (rxFileRef.current) { rxFileRef.current.setAttribute("capture","environment"); rxFileRef.current.click(); setTimeout(() => rxFileRef.current?.removeAttribute("capture"), 1000) } }} className="flex items-center gap-2 px-4 py-2.5 bg-surface-200 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors text-sm"><Camera className="w-4 h-4" /> Camera</button>
                <input className="flex-1 bg-surface-200 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500" placeholder="Optional notes for AI..." value={rxNotes} onChange={e => setRxNotes(e.target.value)} />
              </div>
              <button onClick={handleRxUpload} disabled={!rxFile || rxLoading} className="w-full flex items-center justify-center gap-2 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-light disabled:opacity-50 transition-colors">
                {rxLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning with Gemini Vision...</> : <><Sparkles className="w-4 h-4" /> Scan Prescription</>}
              </button>
            </div>
          ) : (
            <div className="flex flex-col flex-1 space-y-4 overflow-auto">
              <div className="grid grid-cols-3 gap-3">
                {[["Doctor", rxExtraction.doctor],["Date", rxExtraction.date],["Facility", rxExtraction.facility]].map(([label, val]) => (
                  <div key={label} className="bg-surface-200 rounded-xl p-3 border border-white/5"><p className="text-[10px] text-slate-500 uppercase">{label}</p><p className="text-xs text-white mt-0.5 font-medium truncate">{val || "—"}</p></div>
                ))}
              </div>
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-white">Extracted Medications ({rxMeds.length})</h4><span className="text-[10px] text-slate-400 bg-surface-200 px-2 py-1 rounded-lg">Confidence: {((rxExtraction.confidence || 0)*100).toFixed(0)}%</span></div>
              <div className="space-y-2 overflow-y-auto max-h-64">
                {rxMeds.map((med, idx) => (
                  <div key={idx} className="bg-surface-200 border border-white/5 rounded-xl p-3 grid grid-cols-12 gap-2 items-center">
                    <input className="col-span-3 bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={med.name} onChange={e => updateRxMed(idx, "name", e.target.value)} placeholder="Drug name" />
                    <input className="col-span-2 bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={med.dosage} onChange={e => updateRxMed(idx, "dosage", e.target.value)} placeholder="Dosage" />
                    <input className="col-span-3 bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={med.frequency} onChange={e => updateRxMed(idx, "frequency", e.target.value)} placeholder="Frequency" />
                    <select className="col-span-3 bg-surface-300 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={med.system} onChange={e => updateRxMed(idx, "system", e.target.value)}>
                      {SYSTEMS.map(s => <option key={s} value={s}>{SYSTEM_ICONS[s]} {s}</option>)}
                    </select>
                    <button onClick={() => deleteRxMed(idx)} className="col-span-1 p-1.5 rounded-lg text-slate-500 hover:text-critical hover:bg-critical/10 transition-colors flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 items-center border-t border-white/5 pt-3">
                <input className="flex-1 bg-surface-200 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" placeholder="Drug name" value={manualName} onChange={e => setManualName(e.target.value)} />
                <input className="w-16 bg-surface-200 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" placeholder="Dosage" value={manualDosage} onChange={e => setManualDosage(e.target.value)} />
                <select className="w-28 bg-surface-200 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" value={manualDosageTime} onChange={e => setManualDosageTime(e.target.value)}>
                  {["Morning", "Afternoon", "Night", "After Meals", "Before Meals", "SOS"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="w-28 bg-surface-200 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs" value={manualSystem} onChange={e => setManualSystem(e.target.value)}>
                  {SYSTEMS.map(s => <option key={s} value={s}>{SYSTEM_ICONS[s]} {s}</option>)}
                </select>
                <button onClick={addRxMed} className="flex items-center gap-1 px-3 py-1.5 bg-surface-200 border border-white/10 text-slate-400 hover:text-white rounded-lg text-xs transition-colors"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
              <button onClick={handleRxConfirm} disabled={rxMeds.length === 0 || rxConfirming} className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-accent to-accent-light text-white font-bold rounded-xl disabled:opacity-50 transition-all hover:shadow-glow">
                {rxConfirming ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving &amp; Running Interaction Analysis...</> : <><CheckCircle2 className="w-4 h-4" /> Confirm &amp; Analyze ({rxMeds.length} medications)</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
