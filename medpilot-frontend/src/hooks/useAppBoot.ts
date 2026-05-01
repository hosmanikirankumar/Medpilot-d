import { useEffect } from 'react'
import { useMedPilotStore } from '@/store/medpilotStore'
import { BOOT_LOGS, MOCK_PROPOSED_ENTRY, MOCK_PATIENTS } from '@/data/mockData'
import { uid } from '@/lib/utils'
import { fetchPatients, subscribeToAgentLogs, subscribeToProposedEntries, subscribeToEmergencyState } from '@/lib/firestoreApi'
import type { AgentLog } from '@/types'
import type { AgentName } from '@/store/medpilotStore'

function makeLog(agentName: string, action: string, status: AgentLog['status'] = 'Success'): AgentLog {
  return { id: uid(), timestamp: new Date(), agent_name: agentName, action, status }
}

export function useAppBoot() {
  const { 
    addLog, 
    setAgentStatus, 
    setProposedEntry, 
    setActivePatient, 
    setEmergencyMode,
    setPatients,
    setIsLiveMode,
    activePatient
  } = useMedPilotStore()

  // ── Boot sequence ─────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function boot() {
      // 1. Show boot logs
      let delay = 200
      for (const log of BOOT_LOGS) {
        setTimeout(() => addLog({ ...log, id: uid(), timestamp: new Date() }), delay)
        delay += 600
      }

      // 2. Try fetching real patients
      try {
        const patients = await fetchPatients()
        if (!isMounted) return

        if (patients.length > 0) {
          setIsLiveMode(true)
          setPatients(patients)
          setActivePatient(patients[0])
          addLog(makeLog('System', 'Connected to real-time clinical database', 'Success'))
        } else {
          // Fallback to demo mode
          throw new Error('No patients found')
        }
      } catch (err) {
        if (!isMounted) return
        setIsLiveMode(false)
        setPatients(MOCK_PATIENTS)
        setActivePatient(MOCK_PATIENTS[0])
        addLog(makeLog('System', 'Running in DEMO mode (Mock Data)', 'Warning'))
        
        // Inject mock HITL entry
        setTimeout(() => {
          setProposedEntry(MOCK_PROPOSED_ENTRY.entry_id, MOCK_PROPOSED_ENTRY)
          addLog(makeLog('DataIntegrity', 'Proposed entry staged → HITL Confirmation Gate triggered', 'Warning'))
        }, 5000)
      }
    }

    boot()

    return () => { isMounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Real-time Subscriptions (Live Mode) ──────────────────────────────────
  useEffect(() => {
    const { isLiveMode } = useMedPilotStore.getState()
    if (!isLiveMode) return

    let unsubLogs: (() => void) | undefined
    let unsubProposed: (() => void) | undefined
    let unsubEmergency: (() => void) | undefined

    // Listen to Agent Logs
    unsubLogs = subscribeToAgentLogs((logs) => {
      // In a real app we'd sync the store logs with firestore logs.
      // For this demo, let's just make agents active when new logs arrive.
      logs.forEach(log => {
        const agentKey = log.agent_name.toLowerCase().replace(/ /g, '_') as AgentName
        if (Object.keys(useMedPilotStore.getState().agentStatuses).includes(agentKey)) {
          setAgentStatus(agentKey, log.status === 'Error' ? 'error' : 'active')
          setTimeout(() => setAgentStatus(agentKey, 'idle'), 2500)
        }
      })
    })

    // Listen to Proposed Entries
    unsubProposed = subscribeToProposedEntries((entries) => {
      // Clear existing, then set new
      const currentEntries = useMedPilotStore.getState().proposedEntries
      Object.keys(currentEntries).forEach(id => {
         // simplistic clear
         useMedPilotStore.getState().removeProposedEntry(id)
      })
      entries.forEach(entry => setProposedEntry(entry.entry_id, entry))
    })

    return () => {
      if (unsubLogs) unsubLogs()
      if (unsubProposed) unsubProposed()
      if (unsubEmergency) unsubEmergency()
    }
  }, []) // empty deps for singleton effect (rely on isLiveMode from getState inside if needed, but here it's fine since boot calls it once)

  useEffect(() => {
      const { isLiveMode } = useMedPilotStore.getState()
      if (!isLiveMode || !activePatient) return

      const unsubEmergency = subscribeToEmergencyState(activePatient.patient_id, (state) => {
        if (state && state.active) {
            setEmergencyMode(state)
        } else {
            useMedPilotStore.getState().clearEmergency()
        }
      })

      return () => {
          if (unsubEmergency) unsubEmergency()
      }
  }, [activePatient])



}
