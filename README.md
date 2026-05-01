# MedPilot OS

> 12-Agent Clinical Operating System — 2026 Google APAC Gen AI Hackathon

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Python 3.11+**
- A Google Cloud project with Firestore + Vertex AI enabled

---

### Frontend

```bash
cd medpilot-frontend

# Install dependencies
npm install

# Copy env and fill in your Firebase config
copy .env.example .env

# Start dev server
npm run dev
```
Open → **http://localhost:5173**

---

### Backend (local)

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Copy env vars
copy .env.example .env

# Run dev server
uvicorn main:app --reload --port 8080
```
API docs → **http://localhost:8080/docs**

---

## 📁 Project Structure

```
medpilot-os/
├── backend/
│   ├── main.py                  # FastAPI — 5 route groups
│   ├── mock_firestore_init.py   # Seed Firestore with 3 patients
│   ├── requirements.txt
│   └── Dockerfile
└── medpilot-frontend/
    ├── src/
    │   ├── App.tsx              # Root — 60/40 layout
    │   ├── components/
    │   │   ├── Header.tsx
    │   │   ├── MapView.tsx      # Leaflet + CartoDB dark tiles
    │   │   ├── AgentHeartbeat.tsx
    │   │   ├── AgentTraceTerminal.tsx
    │   │   ├── HITLConfirmationGate.tsx
    │   │   ├── PatientPanel.tsx
    │   │   ├── RightSidebar.tsx
    │   │   └── EmergencyBanner.tsx
    │   ├── hooks/
    │   │   ├── useInterval.ts
    │   │   └── useSimulation.ts  # Demo engine — drives all live data
    │   ├── store/
    │   │   └── medpilotStore.ts  # Zustand — 12-agent heartbeat
    │   ├── data/
    │   │   └── mockData.ts       # Patients, agent meta, boot logs
    │   ├── lib/
    │   │   ├── firebase.ts
    │   │   └── utils.ts
    │   └── types/index.ts
    ├── tailwind.config.js
    └── package.json
```

---

## 🔑 Environment Variables

```env
# medpilot-frontend/.env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_BACKEND_URL=http://localhost:8080

# backend/.env
GCP_PROJECT_ID=medpilot-os-2026
FIREBASE_ADMIN_CREDENTIALS={"type":"service_account",...}
VERTEX_AI_LOCATION=us-central1
GOOGLE_MAPS_API_KEY=...
WHATSAPP_BUSINESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
NHA_SANDBOX_CLIENT_ID=...
NHA_SANDBOX_CLIENT_SECRET=...
```

---

## ☁️ Deploy to Cloud Run

```bash
# Build and push backend
cd backend
gcloud builds submit --tag gcr.io/medpilot-os-2026/medpilot-backend
gcloud run deploy medpilot-backend \
  --image gcr.io/medpilot-os-2026/medpilot-backend \
  --platform managed --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="FIREBASE_ADMIN_CREDENTIALS=FIREBASE_ADMIN_CREDENTIALS:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest"
```
