# Smart Recruitment Platform

Smart Recruitment Platform is a modern full-stack web application for AI-powered recruitment and career development. It helps users build a profile, match with jobs, identify missing skills, generate a career roadmap, and improve interview/resume readiness.

## Tech Stack

- Frontend: Next.js (React) + Tailwind CSS
- Backend: FastAPI (Python)
- Authentication: JWT-based auth

## Project Structure

```text
smart-recruitment-platform/
  backend/
    app/
      core/
      data/
      services/
      main.py
  frontend/
    app/
    components/
    lib/
```

## Features Implemented

- Landing page with hero, feature highlights, and auth entry points.
- User authentication (Sign up / Login) with JWT.
- Protected dashboard with sidebar navigation and responsive layout.
- User profile management (skills, interests, education, experience, target career, career goal).
- Job matching page with match score and required skills.
- Skill gap analysis page with missing skills and learning steps.
- Career path roadmap generation page.
- Course recommendation page.
- Resume builder with strict validation, live ATS preview, print-based PDF export, and SQLite-backed soft-delete/restore for resume sections.
- AI mock interview with random questions, answer recording, and feedback.
- Floating AI chat assistant in dashboard pages.
- Job feed page with real remote-job API fallback to local sample listings.

## Backend API Overview

### Auth

- `POST /auth/signup`
- `POST /auth/login`

### User

- `GET /users/me`
- `PUT /users/me/profile`

### Analysis

- `POST /analysis/job-matching`
- `POST /analysis/skill-gap`
- `POST /analysis/career-path`

### Other

- `GET /courses/recommendations`
- `GET /jobs/feed`
- `POST /resume/improve`
- `POST /interview/feedback`

### Resume Builder API

- `POST /api/resume-builder/generate`
- `GET /api/resume-builder`
- `PUT /api/resume-builder`
- `GET /api/resume-builder/sections/deleted`
- `POST /api/resume-builder/sections/:sectionKey/soft-delete`
- `POST /api/resume-builder/sections/:sectionKey/restore`
- `POST /api/resume-builder/rewrite`

## Run Locally

## 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 2. Frontend (Next.js)

```bash
cd frontend
npm install
# create .env.local and set:
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_RESUME_API_URL=http://localhost:8000
# NEXT_PUBLIC_RESUME_AI_API_URL=http://localhost:8000
npm run dev
```

Frontend runs on `http://localhost:3000` by default.

## Notes

- The FastAPI app persists resume-builder section state in SQLite for soft delete and restore flows.
- For production, replace with a real database and stronger secret management.
- Job feed tries a live source first and falls back automatically if unavailable.
