// ─── Firebase config ─────────────────────────────────────────────────────────
// For demo, we use a mock Firestore that simulates real-time updates locally.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, type Auth, connectAuthEmulator } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'demo-api-key',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'medpilot-os-2026.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? 'medpilot-os-2026',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? 'medpilot-os-2026.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? '1:000000000000:web:000000000000',
}

let app: FirebaseApp
let db: Firestore
let auth: Auth

if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApps()[0]
}

db = getFirestore(app)
auth = getAuth(app)

// Use emulators if configured
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  console.log('Connecting to Firebase Emulators...')
  connectFirestoreEmulator(db, '127.0.0.1', 8082)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099')
}

export { app, db, auth }
