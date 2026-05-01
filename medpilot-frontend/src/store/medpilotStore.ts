import { create } from 'zustand'
import type { AgentStatus, AgentLog, ProposedEntry, EmergencyState, Patient, ClinicalRecord } from '@/types'

// ─── Agent names ────────────────────────────────────────────────────────────
export const AGENT_NAMES = [
  'orchestrator',
  'data_integrity',
  'validation',
  'polypharmacy',
  'dietary_guard',
  'symptom_trajectory',
  'clinical_memory',
  'emergency_cascade',
  'logistics',
  'eligibility',
  'clinical_deep_dive',
  'evidence_research',
] as const

export type AgentName = typeof AGENT_NAMES[number]

// ─── Store shape ─────────────────────────────────────────────────────────────
interface MedPilotStore {
  // 12-agent heartbeat
  agentStatuses: Record<AgentName, AgentStatus>
  setAgentStatus: (agent: AgentName, status: AgentStatus) => void
  setAgentsBulk: (updates: Partial<Record<AgentName, AgentStatus>>) => void

  // Live agent trace logs (ring buffer — max 50)
  agentLogs: AgentLog[]
  addLog: (log: AgentLog) => void

  // HITL proposed entries
  proposedEntries: Record<string, ProposedEntry>
  setProposedEntry: (id: string, entry: ProposedEntry) => void
  removeProposedEntry: (id: string) => void

  // Active patient
  activePatient: Patient | null
  setActivePatient: (patient: Patient | null) => void

  // Patients list
  patients: Patient[]
  setPatients: (patients: Patient[]) => void

  // Patient clinical records (loaded per active patient)
  patientRecords: ClinicalRecord[]
  setPatientRecords: (records: ClinicalRecord[]) => void
  upsertRecord: (record: ClinicalRecord) => void

  // Live mode
  isLiveMode: boolean
  setIsLiveMode: (live: boolean) => void

  // Emergency mode
  emergencyState: EmergencyState
  setEmergencyMode: (state: Partial<EmergencyState>) => void
  clearEmergency: () => void

  // UI state
  sidebarTab: 'trace' | 'hitl' | 'eligibility'
  setSidebarTab: (tab: 'trace' | 'hitl' | 'eligibility') => void
}

const DEFAULT_EMERGENCY: EmergencyState = {
  active: false,
  patient_id: null,
  patient_name: null,
  vitals: null,
  nearest_hospital: null,
  hospital_coords: null,
  eta_minutes: null,
  acknowledged: false,
  whatsapp_sent: false,
}

// ─── Zustand store ───────────────────────────────────────────────────────────
export const useMedPilotStore = create<MedPilotStore>((set) => ({
  agentStatuses: Object.fromEntries(
    AGENT_NAMES.map((n) => [n, 'idle'])
  ) as Record<AgentName, AgentStatus>,

  setAgentStatus: (agent, status) =>
    set((s) => ({ agentStatuses: { ...s.agentStatuses, [agent]: status } })),

  setAgentsBulk: (updates) =>
    set((s) => ({ agentStatuses: { ...s.agentStatuses, ...updates } })),

  agentLogs: [],
  addLog: (log) =>
    set((s) => ({
      agentLogs: [log, ...s.agentLogs].slice(0, 50), // ring buffer
    })),

  proposedEntries: {},
  setProposedEntry: (id, entry) =>
    set((s) => ({ proposedEntries: { ...s.proposedEntries, [id]: entry } })),
  removeProposedEntry: (id) =>
    set((s) => {
      const next = { ...s.proposedEntries }
      delete next[id]
      return { proposedEntries: next }
    }),

  activePatient: null,
  setActivePatient: (patient) => set({ activePatient: patient }),

  patients: [],
  setPatients: (patients) => set({ patients }),

  patientRecords: [],
  setPatientRecords: (patientRecords) => set({ patientRecords }),
  upsertRecord: (record) =>
    set((s) => {
      const idx = s.patientRecords.findIndex(r => r.record_id === record.record_id)
      if (idx >= 0) {
        const next = [...s.patientRecords]
        next[idx] = record
        return { patientRecords: next }
      }
      return { patientRecords: [record, ...s.patientRecords] }
    }),

  isLiveMode: false,
  setIsLiveMode: (isLiveMode) => set({ isLiveMode }),

  emergencyState: DEFAULT_EMERGENCY,
  setEmergencyMode: (partial) =>
    set((s) => ({ emergencyState: { ...s.emergencyState, ...partial } })),
  clearEmergency: () => set({ emergencyState: DEFAULT_EMERGENCY }),

  sidebarTab: 'trace',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
}))
