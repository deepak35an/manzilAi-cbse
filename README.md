# AI-Powered Student Assessment & Training Platform

A production-grade, multi-tenant AI-powered assessment platform using FastAPI, PostgreSQL, Redis, Gemini/Gemma AI, and React.

## Architecture

- **Backend**: FastAPI (async) with SQLAlchemy, PostgreSQL, Redis
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **AI Services**: Gemini (question generation), Gemma via Ollama (grading/summaries), Sarvam AI (STT)
- **Storage**: PostgreSQL (relational data) + Local filesystem (question bank JSONs)

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Docker & Docker Compose
- Ollama (for local Gemma model)

### 1. Start Infrastructure

```bash
docker-compose up -d postgres redis
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 4. (Optional) Start Ollama for Gemma

```bash
ollama pull gemma3:4b
ollama serve
```

## Project Structure

```
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── main.py           # App entry, lifespan, middleware
│   │   ├── config.py         # Environment-based configuration
│   │   ├── database.py       # Async SQLAlchemy engine
│   │   ├── redis_client.py   # Redis connection pool
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── routers/          # API route handlers
│   │   ├── services/         # Business logic layer
│   │   │   └── ai/           # AI client wrappers (Gemini, Gemma)
│   │   ├── middleware/       # Auth + rate limiting
│   │   └── utils/            # Logging, helpers
│   ├── alembic/              # Database migrations
│   └── requirements.txt
├── frontend/          # React SPA
│   └── src/
│       ├── components/       # UI, layout, auth, quiz, analytics, admin, org, job
│       ├── pages/            # Public, student, org, admin pages
│       ├── services/         # API client modules
│       ├── store/            # Zustand state management
│       ├── hooks/            # Custom React hooks
│       ├── lib/              # Constants, utilities, validators
│       └── types/            # TypeScript type definitions
├── data/              # Question bank JSON storage (3 fixed roots)
├── nginx/             # Reverse proxy configuration
└── docker-compose.yml # PostgreSQL + Redis + Backend services
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/auth/send-otp` | POST | Send OTP to phone |
| `/auth/verify-otp` | POST | Verify OTP, get JWT |
| `/auth/me` | GET | Current user profile |
| `/admin/content` | GET | Content tree |
| `/admin/create-subfolder` | POST | Create subfolder |
| `/admin/upload-question-bank` | POST | Upload JSON question bank |
| `/admin/set-visibility` | POST | Set content visibility |
| `/org/request-question-bank` | POST | Generate from PDF |
| `/org/confirm-question-bank` | POST | Confirm generated bank |
| `/quiz/start` | POST | Start adaptive quiz |
| `/quiz/answer` | POST | Submit answer |
| `/quiz/complete` | POST | Complete quiz, get results |
| `/voice/process` | POST | Process voice input |
| `/job/parse` | POST | Parse job description |
| `/job/generate-questions` | POST | Generate skill questions |
| `/student/dashboard` | GET | Student dashboard data |
| `/student/history` | GET | Test history |

## Roles

- **Student**: Take assessments, view results, job readiness evaluation
- **Org Admin**: Manage students, upload PDFs for question generation, view org analytics
- **Super Admin**: Manage content, organizations, platform-wide analytics
