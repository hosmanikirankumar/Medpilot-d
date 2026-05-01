import { collection, doc, getDocs, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from './firebase'
import type { Patient, ProposedEntry, AgentLog, EmergencyState } from '@/types'

// Fallback to fetch from backend if needed
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

// ─── Patients ───────────────────────────────────────────────────────────────

export async function fetchPatients(): Promise<Patient[]> {
  try {
    const q = query(collection(db, 'patients'))
    const snap = await getDocs(q)
    return snap.docs.map(d => d.data() as Patient)
  } catch (err) {
    console.error('Failed to fetch patients from Firestore:', err)
    // Fallback: fetch from backend
    try {
      const res = await fetch(`${BACKEND_URL}/api/patients`)
      if (res.ok) {
         return await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch patients from backend:', e)
    }
    return []
  }
}

// ─── Proposed Entries (Real-time) ───────────────────────────────────────────

export function subscribeToProposedEntries(callback: (entries: ProposedEntry[]) => void) {
  const q = query(
    collection(db, 'proposed_entries'),
    where('validation_status', '==', 'PENDING_HUMAN_REVIEW'),
    orderBy('created_at', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ ...d.data(), created_at: d.data().created_at?.toDate?.() || d.data().created_at }) as ProposedEntry))
  }, (err) => {
    console.error('Proposed entries subscription error:', err)
  })
}

// ─── Agent Logs (Real-time) ─────────────────────────────────────────────────

export function subscribeToAgentLogs(callback: (logs: AgentLog[]) => void) {
  const q = query(
    collection(db, 'agent_logs'),
    orderBy('timestamp', 'desc'),
    limit(50)
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        agent_name: data.agent_name,
        action: data.action,
        status: data.status,
        timestamp: data.timestamp?.toDate?.() || data.timestamp || new Date(),
      } as AgentLog
    }))
  }, (err) => {
    console.error('Agent logs subscription error:', err)
  })
}

// ─── Emergency State (Real-time) ────────────────────────────────────────────

export function subscribeToEmergencyState(patientId: string | null, callback: (state: EmergencyState | null) => void) {
  if (!patientId) return () => {}
  const docRef = doc(db, 'emergency_state', patientId)
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data()
      callback({
        ...data,
        vitals: data.vitals ? {
          ...data.vitals,
          timestamp: data.vitals.timestamp?.toDate?.() || data.vitals.timestamp || new Date()
        } : null
      } as EmergencyState)
    } else {
      callback(null)
    }
  }, (err) => {
    console.error('Emergency state subscription error:', err)
  })
}

// ─── HTTP API Calls to Backend ──────────────────────────────────────────────

export async function confirmHITLEntry(entryId: string, patientId: string, clinicianUid: string = 'CLINICIAN-001') {
  const res = await fetch(`${BACKEND_URL}/api/hitl/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_id: entryId, patient_id: patientId, clinician_uid: clinicianUid })
  })
  if (!res.ok) throw new Error('Failed to confirm HITL entry')
  return await res.json()
}

export async function checkEligibility(abhaId: string, patientId: string) {
  const res = await fetch(`${BACKEND_URL}/api/eligibility/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ abha_id: abhaId, patient_id: patientId })
  })
  if (!res.ok) throw new Error('Failed to check eligibility')
  return await res.json()
}
