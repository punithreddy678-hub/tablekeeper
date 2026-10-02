# 🍷 Tablekeeper — Restaurant Reservation & Management Platform

A high-performance, production-style restaurant reservation and partner management platform built with Python (Flask) and SQLite. Features server-side `BEGIN IMMEDIATE` transaction serialization in SQLite WAL mode to eliminate double-bookings during traffic surges, idempotency key safeguards, real Google OAuth authentication, and a dedicated Restaurant Owner Portal for accepting and declining table requests.

![Tablekeeper Interface](https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=85)

---

## ✨ Features

- **Guest Table Discovery & Search**: Filter restaurants by cuisine, neighborhood, guest party size, date, and preferred time slot.
- **Interactive Floor Plan Selection**: Choose specific table numbers with real-time capacity and overlap validation.
- **Restaurant Owner Management Portal**:
  - Dedicated login for restaurant hosts and owners.
  - Live metric counters for **Pending Approval**, **Confirmed Bookings**, **Declined**, and **Total Tables**.
  - Single-click **Accept** (`confirmed`) or **Decline** (`declined`) actions for incoming requests.
- **Real Google OAuth 2.0 Integration**: Authenticate with real Google Accounts powered by Google Identity Services (GIS) and server-side JWT ID token verification.
- **Concurrency & Idempotency Lab**: Built-in developer tools to simulate 10, 20, or 50 simultaneous booking attempts against SQLite transaction locks, demonstrating zero double-bookings.
- **Transaction Safety**: All booking writes execute inside SQLite `BEGIN IMMEDIATE` transactions with unique idempotency keys.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11+, Flask 3.0+
- **Database**: SQLite 3 (WAL Mode, `PRAGMA foreign_keys=ON`)
- **Authentication**: Google Identity Services (GIS), `google-auth`, Flask Sessions
- **Frontend**: HTML5, CSS3 (Modern Glassmorphism & Custom Properties), Vanilla ES6 JavaScript

---

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/punithreddy678-hub/tablekeeper.git
cd tablekeeper
```

### 2. Set Up Virtual Environment & Dependencies
```bash
python -m venv .venv

# On macOS/Linux:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate

pip install -r requirements.txt
```

### 3. (Optional) Set Google OAuth Client ID
Set environment variable for live Google Sign-In:
```bash
export GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
```
*(Or enter your Client ID directly in the in-app Sign In modal!)*

### 4. Run Application
```bash
python app.py
```
Open `http://localhost:5000` in your web browser.

---

## 🔑 Demo Credentials (Owner Portal)

| Restaurant | Owner Email | Password |
|---|---|---|
| **The Olive Garden** | `olive@tablekeeper.local` | `owner123` |
| **Juniper & Co.** | `juniper@tablekeeper.local` | `owner123` |
| **Saffron House** | `saffron@tablekeeper.local` | `owner123` |
| **Kumo** | `kumo@tablekeeper.local` | `owner123` |
| **Casa Verde** | `casa@tablekeeper.local` | `owner123` |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/restaurants` | List all restaurants (supports `?q=` search and `?cuisine=`) |
| `GET` | `/api/restaurants/:id` | Get restaurant details and live table availability |
| `GET` | `/api/reservations` | Fetch guest reservations |
| `POST` | `/api/reservations` | Create reservation (requires `Idempotency-Key` header) |
| `POST` | `/api/reservations/:id/cancel` | Cancel booking |
| `POST` | `/api/auth/google` | Verify Google ID token and sign in user |
| `POST` | `/api/owner/login` | Authenticate restaurant owner |
| `GET` | `/api/owner/reservations` | Fetch owner restaurant bookings |
| `POST` | `/api/owner/reservations/:id/accept` | Accept pending reservation |
| `POST` | `/api/owner/reservations/:id/decline` | Decline reservation |
| `POST` | `/api/concurrency-test` | Run multi-threaded concurrency simulation |
| `POST` | `/api/idempotency-test` | Run 5-retry idempotency test |

---

## 📜 License

MIT License © 2026 Tablekeeper Inc.
