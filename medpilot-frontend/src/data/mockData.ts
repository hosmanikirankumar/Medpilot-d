import { Brain, Search, CheckCircle, Pill, Utensils, TrendingUp, Archive, AlertTriangle, Route, Hospital, Microscope, BookOpen } from 'lucide-react'
import type { Patient, AgentLog, ProposedEntry } from '@/types'
import type { AgentName } from '@/store/medpilotStore'

// ─── Initial Patients ────────────────────────────────────────────────────────
export const MOCK_PATIENTS: Patient[] = [
  {
    patient_id: 'PT-001',
    name: 'Rajan Pillai',
    abha_id: '14-2948-3821-7710',
    age: 62,
    gender: 'Male',
    blood_type: 'B+',
    active_medications: ['Warfarin 5mg', 'Metformin 500mg', 'Ashwagandha (Ayurvedic)'],
    pmjay_covered: true,
    pmjay_limit: 500000,
  },
  {
    patient_id: 'PT-002',
    name: 'Meena Krishnamurthy',
    abha_id: '14-5512-9934-1102',
    age: 45,
    gender: 'Female',
    blood_type: 'O+',
    active_medications: ['Lisinopril 10mg', 'Triphala Churna (Ayurvedic)'],
    pmjay_covered: false,
    pmjay_limit: null,
  },
  {
    patient_id: 'PT-003',
    name: 'Dr. Arjun Nair',
    abha_id: '14-7723-4456-8801',
    age: 38,
    gender: 'Male',
    blood_type: 'A+',
    active_medications: ['Atorvastatin 20mg'],
    pmjay_covered: null,
    pmjay_limit: null,
  },
]

// ─── Agent display metadata ───────────────────────────────────────────────────
export const AGENT_META: Record<AgentName, { label: string; pod: string; icon: any; model: string }> = {
  orchestrator:         { label: 'Orchestrator',       pod: 'Pod A', icon: Brain, model: 'Gemini 2.0 Pro'   },
  data_integrity:       { label: 'Data Integrity',     pod: 'Pod A', icon: Search, model: 'Gemini 2.0 Flash' },
  validation:           { label: 'Validation',         pod: 'Pod A', icon: CheckCircle, model: 'Gemini 2.0 Flash' },
  polypharmacy:         { label: 'Polypharmacy Matrix', pod: 'Pod B', icon: Pill, model: 'Gemini 2.0 Pro'  },
  dietary_guard:        { label: 'Dietary Guard',      pod: 'Pod B', icon: Utensils, model: 'Gemini 2.0 Flash' },
  symptom_trajectory:  { label: 'Symptom Trajectory',  pod: 'Pod B', icon: TrendingUp, model: 'Vertex AI TS'    },
  clinical_memory:     { label: 'Clinical Memory',     pod: 'Pod B', icon: Archive, model: 'Gemini 2.0 Pro'  },
  emergency_cascade:   { label: 'Emergency Cascade',   pod: 'Pod C', icon: AlertTriangle, model: 'Gemini 2.0 Flash' },
  logistics:           { label: 'Logistics & Routing', pod: 'Pod C', icon: Route, model: 'Maps API'         },
  eligibility:         { label: 'PM-JAY Eligibility',  pod: 'Pod C', icon: Hospital, model: 'NHA Sandbox'      },
  clinical_deep_dive:  { label: 'Clinical Deep-Dive',  pod: 'Pod D', icon: Microscope, model: 'Gemini 2.0 Pro'   },
  evidence_research:   { label: 'Evidence & Research', pod: 'Pod D', icon: BookOpen, model: 'PubMed RAG'        },
}

// ─── Mock proposed entry (pre-loaded for demo) ───────────────────────────────
export const MOCK_PROPOSED_ENTRY: ProposedEntry = {
  entry_id: 'ENTRY-DEMO-001',
  patient_id: 'PT-001',
  extracted_data: {
    medications: [
      { name: 'Warfarin',       dosage: '5mg',   frequency: 'Once daily',  route: 'Oral' },
      { name: 'Ashwagandha',    dosage: '300mg', frequency: 'Twice daily', route: 'Oral' },
    ],
    lab_values: [
      { test: 'INR', value: 3.8, unit: 'ratio', reference_range: '2.0 – 3.0' },
      { test: 'HbA1c', value: 7.2, unit: '%',  reference_range: '< 7.0' },
    ],
    confidence: 0.92,
  },
  source_image_url: 'https://placehold.co/400x300/0f172a/10b981?text=Lab+Report',
  validation_status: 'PENDING_HUMAN_REVIEW',
  ai_reasoning_trace: [
    'Orchestrator: Routed DOCUMENT_INTAKE to DataIntegrity agent',
    'DataIntegrity: Gemini Flash extracted 2 medications, 2 lab values (confidence: 0.92)',
    'Validation: Querying PK-DB for Warfarin half-life → 40 hours',
    'Validation: Querying RxNav for Warfarin interactions → 3 results',
    'Polypharmacy: Ashwagandha may potentiate Warfarin anticoagulant effect (PMID: 28349297)',
    'Validation: INR 3.8 is ABOVE therapeutic range (2.0–3.0) — flagged for clinician review',
    'System: Proposed entry staged. Awaiting HITL confirmation.',
  ],
  warnings: [
    'Ashwagandha + Warfarin interaction: May increase bleeding risk (PMID: 28349297)',
    'INR 3.8 exceeds therapeutic range — dosage adjustment may be required',
  ],
  pmid_links: ['PMID: 28349297', 'PMID: 31567234'],
  created_at: new Date(),
}

// ─── Simulated log bursts (for demo) ─────────────────────────────────────────
export const BOOT_LOGS: Omit<AgentLog, 'id'>[] = [
  { timestamp: new Date(), agent_name: 'System',       action: 'MedPilot OS v1.0 initializing...', status: 'Info' },
  { timestamp: new Date(), agent_name: 'System',       action: 'Firebase Firestore connected',      status: 'Success' },
  { timestamp: new Date(), agent_name: 'System',       action: 'Vertex AI endpoint online',          status: 'Success' },
  { timestamp: new Date(), agent_name: 'Orchestrator', action: 'Agent graph compiled — 12 nodes ready', status: 'Success' },
  { timestamp: new Date(), agent_name: 'Eligibility',  action: 'NHA ABDM Sandbox connection verified', status: 'Success' },
  { timestamp: new Date(), agent_name: 'Logistics',    action: 'Google Maps API authenticated',      status: 'Success' },
  { timestamp: new Date(), agent_name: 'System',       action: 'All systems nominal. Awaiting input.', status: 'Info' },
]
