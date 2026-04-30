import { useMemo, useCallback, useState, useEffect } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Polyline, InfoWindow } from '@react-google-maps/api'
import { useMedPilotStore } from '@/store/medpilotStore'
import { MapPin, Hospital, Navigation, Clock, Phone, Star, RefreshCw, Loader2, AlertTriangle, User, LocateFixed } from 'lucide-react'
import { useMedPilotStore as _store } from '@/store/medpilotStore'
import { cn } from '@/lib/utils'

const containerStyle = {
  width: '100%',
  height: '100%'
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
]

interface Hospital {
  name: string
  coords: [number, number]
  vicinity?: string
  rating?: number
  eta_minutes?: number
  distance_km?: number
  open_now?: boolean
  place_id?: string
}

export default function MapView() {
  const { emergencyState, patients, activePatient } = useMedPilotStore()
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || 'AIzaSyAAEmC2uj4CHeEy8EIRM8XXjm-tRBXZdKI'
  })

  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [activeMarker, setActiveMarker] = useState<string | null>(null)
  const [nearbyHospitals, setNearbyHospitals] = useState<Hospital[]>([])
  const [loadingHospitals, setLoadingHospitals] = useState(false)
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [sharingLocation, setSharingLocation] = useState(false)
  const { setActivePatient, setPatients } = _store()

  const centerCoords = useMemo(() => {
    if (activePatient?.coords) return { lat: activePatient.coords[0], lng: activePatient.coords[1] }
    return { lat: 12.9716, lng: 77.5946 }
  }, [activePatient])

  async function fetchHospitals(lat: number, lng: number) {
    setLoadingHospitals(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || ''}/api/maps/hospitals?lat=${lat}&lng=${lng}&radius=15000`
      )
      if (res.ok) {
        const data = await res.json()
        setNearbyHospitals(data.hospitals || [])
        setLastRefreshed(new Date())
      }
    } catch (err) {
      console.error('Failed to fetch hospitals', err)
    }
    setLoadingHospitals(false)
  }

  useEffect(() => {
    fetchHospitals(centerCoords.lat, centerCoords.lng)
  }, [centerCoords.lat, centerCoords.lng])

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)
  }, [])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  // All patient markers
  const patientLocations = useMemo(() => {
    return patients.map(p => {
      const isEmergency = emergencyState.active && p.patient_id === emergencyState.patient_id
      return {
        id: p.patient_id,
        name: p.name,
        coords: { lat: p.coords?.[0] || 12.9716, lng: p.coords?.[1] || 77.5946 },
        status: isEmergency ? 'critical' as const : 'safe' as const,
        detail: isEmergency
          ? `🚨 CRITICAL — ETA: ${emergencyState.eta_minutes} min`
          : `${p.age}y · ${p.gender} · ${p.blood_type}`,
        hospital: isEmergency ? emergencyState.nearest_hospital : null,
        hospitalCoords: emergencyState.active && p.patient_id === emergencyState.patient_id && emergencyState.hospital_coords
          ? { lat: emergencyState.hospital_coords[0], lng: emergencyState.hospital_coords[1] }
          : null,
        raw: p
      }
    })
  }, [patients, emergencyState])

  async function handleShareLocation() {
    if (!activePatient) return
    setSharingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/patients/${activePatient.patient_id}/location`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lng: longitude })
          })
          const updated = { ...activePatient, coords: [latitude, longitude] as [number, number], location_updated_at: new Date().toISOString() }
          setActivePatient(updated)
          const { patients } = _store.getState()
          setPatients(patients.map(p => p.patient_id === updated.patient_id ? updated : p))
          if (map) { map.panTo({ lat: latitude, lng: longitude }); map.setZoom(14) }
        } catch (e) { console.error(e) }
        setSharingLocation(false)
      },
      () => setSharingLocation(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Pan to patient when they're selected
  function panToPatient(p: typeof patientLocations[0]) {
    if (map) {
      map.panTo(p.coords)
      map.setZoom(14)
    }
    setSelectedPatient(p)
    setSelectedHospital(null)
    setActiveMarker(p.id)
  }

  function panToHospital(h: Hospital) {
    if (map) {
      map.panTo({ lat: h.coords[0], lng: h.coords[1] })
      map.setZoom(15)
    }
    setSelectedHospital(h)
    setSelectedPatient(null)
    setActiveMarker(`hospital-${h.name}`)
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-100 rounded-3xl">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm">Loading Google Maps…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left Sidebar Panel */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">

        {/* Active Patients */}
        <div className="bg-surface-100 rounded-2xl border border-white/5 p-3 shadow-glass">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <User className="w-3 h-3" /> Patients ({patients.length})
          </h3>
          <div className="space-y-2">
            {patientLocations.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2">No patients loaded</p>
            )}
            {patientLocations.map(loc => (
              <button
                key={loc.id}
                onClick={() => panToPatient(loc)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all hover:scale-[1.01]',
                  selectedPatient?.id === loc.id
                    ? 'border-accent/40 bg-accent/10'
                    : loc.status === 'critical'
                      ? 'border-critical/30 bg-critical/5 animate-pulse'
                      : 'border-white/5 bg-surface-200 hover:border-white/15'
                )}
              >
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', {
                  'bg-critical shadow-[0_0_6px_#ef4444]': loc.status === 'critical',
                  'bg-safe shadow-[0_0_6px_#10b981]': loc.status === 'safe',
                })} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{loc.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{loc.detail}</p>
                </div>
                <Navigation className="w-3 h-3 text-slate-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Share Location Button */}
        {activePatient && (
          <button
            onClick={handleShareLocation}
            disabled={sharingLocation}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-safe/30 bg-safe/5 text-safe text-xs font-semibold hover:bg-safe/10 transition-all disabled:opacity-60"
          >
            {sharingLocation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
            {sharingLocation ? 'Acquiring GPS...' : 'Share My Location'}
          </button>
        )}

        {/* Nearby Hospitals */}
        <div className="bg-surface-100 rounded-2xl border border-white/5 p-3 shadow-glass flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="text-info">🏥</span> Hospitals ({nearbyHospitals.length})
            </h3>
            <button
              onClick={() => fetchHospitals(centerCoords.lat, centerCoords.lng)}
              disabled={loadingHospitals}
              className="p-1 rounded-lg text-slate-500 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn('w-3 h-3', loadingHospitals && 'animate-spin')} />
            </button>
          </div>

          {loadingHospitals && nearbyHospitals.length === 0 && (
            <div className="flex items-center justify-center py-6 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          <div className="space-y-2">
            {nearbyHospitals.slice(0, 20).map((h, idx) => (
              <button
                key={idx}
                onClick={() => panToHospital(h)}
                className={cn(
                  'w-full flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all hover:scale-[1.01]',
                  selectedHospital?.name === h.name
                    ? 'border-info/40 bg-info/10'
                    : 'border-white/5 bg-surface-200 hover:border-white/15'
                )}
              >
                <span className="text-base flex-shrink-0 mt-0.5">🏥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white leading-tight truncate">{h.name}</p>
                  {h.vicinity && (
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{h.vicinity}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {h.eta_minutes !== undefined && (
                      <span className="text-[10px] text-info flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {h.eta_minutes} min
                      </span>
                    )}
                    {h.rating !== undefined && h.rating > 0 && (
                      <span className="text-[10px] text-warning flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> {h.rating}
                      </span>
                    )}
                    {h.open_now !== undefined && (
                      <span className={cn('text-[10px]', h.open_now ? 'text-safe' : 'text-critical')}>
                        {h.open_now ? '● Open' : '● Closed'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {nearbyHospitals.length === 0 && !loadingHospitals && (
              <div className="text-center py-4 text-xs text-slate-500">
                <p>No hospitals found nearby</p>
                <p className="text-[10px] mt-1">Check Maps API key</p>
              </div>
            )}
          </div>

          {lastRefreshed && (
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10">
        {/* Top badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-200/90 backdrop-blur-sm border border-white/10 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {activePatient ? `${activePatient.name}'s Zone` : 'Bengaluru Clinical Zone'} · Live
        </div>

        {/* Emergency alert badge */}
        {emergencyState.active && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-critical/80 backdrop-blur-sm border border-critical/50 text-xs text-white font-bold animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            EMERGENCY ACTIVE
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-3 z-10 flex flex-col gap-1 px-3 py-2 rounded-lg bg-surface-200/90 backdrop-blur-sm border border-white/10 text-[10px]">
          {[
            { color: '#10b981', label: 'Patient (Safe)' },
            { color: '#ef4444', label: 'Patient (Critical)' },
            { color: '#38bdf8', label: 'Hospital' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Selected Info overlay */}
        {(selectedPatient || selectedHospital) && (
          <div className="absolute bottom-4 right-3 z-10 max-w-[220px] px-3 py-2.5 rounded-xl bg-surface-100/95 backdrop-blur-sm border border-white/10 shadow-xl text-xs">
            <button
              onClick={() => { setSelectedPatient(null); setSelectedHospital(null) }}
              className="absolute top-1.5 right-2 text-slate-500 hover:text-white"
            >✕</button>
            {selectedPatient && (
              <>
                <p className="font-bold text-white mb-1">{selectedPatient.name}</p>
                <p className="text-slate-400">{selectedPatient.detail}</p>
                <p className="text-[10px] text-slate-600 mt-1 font-mono">{selectedPatient.id}</p>
                {selectedPatient.status === 'critical' && selectedPatient.hospital && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-critical font-semibold text-[10px]">🚨 Routing to:</p>
                    <p className="text-slate-300 text-[10px]">{selectedPatient.hospital}</p>
                  </div>
                )}
              </>
            )}
            {selectedHospital && (
              <>
                <p className="font-bold text-white mb-1">{selectedHospital.name}</p>
                {selectedHospital.vicinity && <p className="text-slate-400 text-[10px]">{selectedHospital.vicinity}</p>}
                <div className="flex gap-3 mt-2">
                  {selectedHospital.eta_minutes !== undefined && (
                    <span className="text-info flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedHospital.eta_minutes} min</span>
                  )}
                  {selectedHospital.rating && selectedHospital.rating > 0 && (
                    <span className="text-warning flex items-center gap-1"><Star className="w-3 h-3" /> {selectedHospital.rating}</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={centerCoords}
          zoom={13}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            styles: darkMapStyle,
            disableDefaultUI: true,
            zoomControl: true,
          }}
        >
          {/* Patient markers */}
          {patientLocations.map((loc) => (
            <div key={loc.id}>
              <Marker
                position={loc.coords}
                onClick={() => {
                  setActiveMarker(loc.id)
                  setSelectedPatient(loc)
                  setSelectedHospital(null)
                }}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='19' fill='%23${loc.status === 'critical' ? 'ef444430' : '10b98130'}' stroke='%23${loc.status === 'critical' ? 'ef4444' : '10b981'}' stroke-width='2'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='18'%3E${loc.status === 'critical' ? '🚑' : '👤'}%3C/text%3E%3C/svg%3E`,
                  scaledSize: new window.google.maps.Size(40, 40)
                }}
              >
                {activeMarker === loc.id && (
                  <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                    <div className="min-w-[160px] font-sans">
                      <p className="font-bold text-sm mb-1">{loc.name}</p>
                      <p className="text-xs text-gray-600 mb-1">{loc.detail}</p>
                      {loc.status === 'critical' && (
                        <p className="text-xs text-red-600 font-semibold">🚨 Emergency Active</p>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </Marker>

              {/* Emergency hospital marker + route */}
              {loc.status === 'critical' && loc.hospitalCoords && (
                <>
                  <Marker
                    position={loc.hospitalCoords}
                    icon={{
                      url: `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Crect width='36' height='36' rx='8' fill='%23ef444430' stroke='%23ef4444' stroke-width='2'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='18'%3E🏥%3C/text%3E%3C/svg%3E`,
                      scaledSize: new window.google.maps.Size(36, 36)
                    }}
                  />
                  <Polyline
                    path={[loc.coords, loc.hospitalCoords]}
                    options={{
                      strokeColor: '#ef4444',
                      strokeOpacity: 0.85,
                      strokeWeight: 3,
                      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '60px' }]
                    }}
                  />
                </>
              )}
            </div>
          ))}

          {/* Nearby hospital markers */}
          {nearbyHospitals.map((h, idx) => {
            const isEmergencyTarget = patientLocations.some(loc =>
              loc.status === 'critical' && loc.hospitalCoords &&
              Math.abs(loc.hospitalCoords.lat - h.coords[0]) < 0.001 &&
              Math.abs(loc.hospitalCoords.lng - h.coords[1]) < 0.001
            )
            if (isEmergencyTarget) return null
            const hId = `hospital-${h.name}`
            return (
              <Marker
                key={hId}
                position={{ lat: h.coords[0], lng: h.coords[1] }}
                onClick={() => {
                  setActiveMarker(hId)
                  setSelectedHospital(h)
                  setSelectedPatient(null)
                }}
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2338bdf830' stroke='%2338bdf8' stroke-width='1.5'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='15'%3E🏥%3C/text%3E%3C/svg%3E`,
                  scaledSize: new window.google.maps.Size(32, 32)
                }}
              >
                {activeMarker === hId && (
                  <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                    <div className="min-w-[160px] font-sans">
                      <p className="font-bold text-sm mb-1">{h.name}</p>
                      {h.vicinity && <p className="text-xs text-gray-600 mb-1">{h.vicinity}</p>}
                      {h.eta_minutes !== undefined && (
                        <p className="text-xs text-blue-600">🕐 {h.eta_minutes} min away</p>
                      )}
                      {h.rating && h.rating > 0 && (
                        <p className="text-xs text-yellow-600">⭐ {h.rating}</p>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            )
          })}
        </GoogleMap>
      </div>
    </div>
  )
}
