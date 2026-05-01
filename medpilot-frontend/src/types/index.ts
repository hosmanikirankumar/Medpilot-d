// ─── MedPilot OS Types ──────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'active' | 'warning' | 'error'
export type RiskStatus = 'Safe' | 'Warning' | 'Critical'
export type MedicineSystem = 'Allopathic' | 'Ayurvedic' | 'Homeopathic' | 'Naturopathic'

export interface AgentLog {
  id: string
  timestamp: Date
  agent_name: string
  action: string
  status: 'Success' | 'Warning' | 'Error' | 'Info'
}

export interface Patient {
  patient_id: string
  name: string
  abha_id: string
  age: number
  gender?: string
  blood_type?: string
  conditions?: string[]
  allergies?: string[] | string
  active_medications: string[]
  medication_details?: Array<{ name: string; dosage: string; system: string }>
  pmjay_covered: boolean | null
  pmjay_limit: number | null
  coords?: [number, number]
  emergency_contact?: string
  preferred_language?: string
  location_updated_at?: string  // ISO timestamp of last GPS update
}

export interface ProposedEntry {
  entry_id: string
  patient_id: string
  extracted_data: {
    medications?: Array<{ name: string; dosage: string; frequency: string; route: string }>
    lab_values?: Array<{ test: string; value: number; unit: string; reference_range: string }>
    diagnosis_codes?: string[]
    confidence: number
  }
  source_image_url: string
  validation_status: 'PENDING_VALIDATION' | 'PENDING_HUMAN_REVIEW' | 'COMMITTED' | 'REJECTED'
  ai_reasoning_trace: string[]
  warnings: string[]
  pmid_links: string[]
  created_at: Date
}

export interface Vitals {
  bp_systolic: number
  bp_diastolic: number
  spo2: number
  heart_rate: number
  temperature: number
  timestamp: Date
}

export interface EmergencyState {
  active: boolean
  patient_id: string | null
  patient_name: string | null
  vitals: Vitals | null
  nearest_hospital: string | null
  hospital_coords: [number, number] | null
  eta_minutes: number | null
  acknowledged: boolean
  whatsapp_sent: boolean
}

export interface LabValue {
  test: string
  value: string | number
  unit: string
  reference?: string
  status?: 'normal' | 'high' | 'low' | 'critical'
}

export interface ClinicalRecord {
  record_id: string
  patient_id: string
  type: string
  facility: string
  date: string
  notes?: string
  source: 'upload' | 'manual' | 'prescription_upload' | 'demo'
  structured?: {
    summary?: string
    medications?: Array<{ name: string; dosage: string; frequency?: string; route?: string; system?: string }>
    lab_values?: LabValue[]
    doctor?: string
    flags?: string[]
  }
  uploaded_at?: string
  updated_at?: string
}

export interface PrescriptionMedication {
  name: string
  dosage: string
  frequency: string
  route: string
  duration: string
  system: MedicineSystem
  notes: string
}

export interface PrescriptionExtraction {
  medications: PrescriptionMedication[]
  doctor: string
  date: string
  facility: string
  patient_name: string
  raw_text: string
  confidence: number
}
