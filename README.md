# AI TestGen: AI-Powered Test Generation Platform

A full-stack examination platform that bridges traditional paper-based assessments and computer-based testing.
Admins upload study material and **AI (Google Gemini) writes the question paper**. Students take the test **online** in a timed,
government-exam-style interface **or offline** on paper (a branded PDF paper plus an answer-sheet upload). Answers are graded
automatically, and the results appear in dashboards for students and admins.

---

## Table of contents

1. [Tech stack](#1-tech-stack)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Running the app](#4-running-the-app)
5. [Demo accounts](#5-demo-accounts)
6. [Configuration (`backend/.env`)](#6-configuration-backendenv)
7. [Adding your Gemini API key](#7-adding-your-gemini-api-key)
8. [How to use AI in the app](#8-how-to-use-ai-in-the-app)
9. [Feature guide](#9-feature-guide)
10. [Demo script (about 5 minutes)](#10-demo-script-about-5-minutes)
11. [Project structure](#11-project-structure)
12. [Data model](#12-data-model)
13. [API endpoints](#13-api-endpoints)
14. [Security notes](#14-security-notes)
15. [Troubleshooting](#15-troubleshooting)
16. [Submitting / sharing the project](#16-submitting--sharing-the-project)

---

## 1. Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Next.js 14 (React, App Router), Axios, Recharts, plain CSS · runs on port **3000** |
| Backend   | Python · FastAPI · PyMongo · JWT auth (PyJWT + bcrypt) · runs on port **5000** |
| Database  | MongoDB (`localhost:27017`), with automatic in-memory fallback (mongomock) when MongoDB is not installed |
| AI        | Google Gemini via `google-genai`: question generation, AI grading, handwriting / scanned-PDF reading |
| OCR       | pypdf (PDF text layer) · Tesseract via pytesseract (if installed) · Gemini vision fallback |
| PDF       | ReportLab (branded question papers and answer keys) |
| Email     | SMTP (e.g. Gmail app password); emails are printed to the console when SMTP is not configured |

Everything used is **free**: Gemini has a free tier, and Tesseract and MongoDB Community are open source.

---

## 2. Prerequisites

| Requirement | Version | Check with |
|---|---|---|
| Node.js | 18 or newer | `node -v` |
| Python | 3.10 or newer | `python --version` |
| MongoDB Community *(optional)* | any recent | needed only if you want data to survive restarts |
| Tesseract OCR *(optional)* | 5.x | needed only for local image OCR ([Windows installer](https://github.com/UB-Mannheim/tesseract/wiki)) |

---

## 3. Installation

From the project folder, run once:

```powershell
cd "D:\Capstone project"
npm run setup
```

This installs the root and frontend Node packages and creates `backend\.venv` with all Python dependencies.

Then create the backend config file (skip this if `backend\.env` already exists):

```powershell
copy backend\.env.example backend\.env
```

Open `backend\.env` and set `JWT_SECRET` to any long random string.

<details>
<summary>Manual installation (if <code>npm run setup</code> fails)</summary>

```powershell
npm install
npm install --prefix frontend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```
</details>

---

## 4. Running the app

### Development mode (auto-reload while editing code)

```powershell
npm run dev
```

### Production mode (faster; best for demos)

```powershell
npm run start
```

This builds the frontend once and then runs both servers. Every page opens instantly.

> In **development mode** each page is compiled the first time you open it, so the first click on a page can take a few
> seconds. A loading spinner shows while it compiles. Use `npm run start` for demos.

Then open:

| URL | What |
|---|---|
| http://localhost:3000 | The web app |
| http://localhost:5000/docs | Interactive API documentation (Swagger) |
| http://localhost:5000/api/health | Status of the database, Gemini, Tesseract and email |

### Running the two parts separately

```powershell
# Terminal 1 - backend
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 5000

# Terminal 2 - frontend
cd frontend
npm run dev
```

When the backend starts, its log shows what is enabled:

```
[db] Connected to MongoDB ...            (or: Using IN-MEMORY database ...)
[ai] Gemini: enabled (gemini-2.5-flash)  (or: not configured - using offline template generator)
[ocr] Tesseract: found                   (or: not found)
[mail] SMTP smtp.gmail.com               (or: console mode)
```

---

## 5. Demo accounts

When the database is empty (first start, or every start in in-memory mode) demo data is created automatically:
an institution, a team, two students, an uploaded biology note and a published test.

| Role    | Email              | Password      |
|---------|--------------------|---------------|
| Admin   | `admin@demo.com`   | `password123` |
| Student | `student@demo.com` | `password123` |
| Student | `riya@demo.com`    | `password123` |

The login page also has **Admin** / **Student** buttons that fill these in.

---

## 6. Configuration (`backend/.env`)

The app works **with no keys at all**. Each integration falls back gracefully:

| Setting | Without it | With it |
|---|---|---|
| `MONGO_URI` (MongoDB reachable) | In-memory database. **All data is lost when the backend restarts** | Persistent storage. Install [MongoDB Community](https://www.mongodb.com/try/download/community) or use a MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Questions come from the offline *template generator*; written answers get a provisional keyword-match score for the teacher to confirm; uploaded answer sheets wait for manual grading | Real AI-written questions, AI grading with feedback, AI reading of handwriting and scanned PDFs (see [section 7](#7-adding-your-gemini-api-key)) |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` | Any Gemini model, e.g. `gemini-2.5-pro` |
| Tesseract installed / `TESSERACT_CMD` | Images are read by Gemini (or not at all without a key) | Local OCR for images. Set `TESSERACT_CMD` to the path of `tesseract.exe` if it is not on PATH |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Invitation, credential and new-test emails are printed in the backend console; invite links are shown in the app to copy | Real emails. For Gmail: `smtp.gmail.com`, port `587`, your Gmail address, and an [app password](https://myaccount.google.com/apppasswords) |
| `JWT_SECRET` | Must be set | Secret used to sign login tokens; use a long random string |
| `FRONTEND_URL` | `http://localhost:3000` | Used in email links and CORS |

The frontend can optionally use `frontend/.env.local` with `NEXT_PUBLIC_API_URL` (default `http://localhost:5000`).

**After changing `.env`, restart the backend.** It reads the file only on startup.

---

## 7. Adding your Gemini API key

1. **Get a free key** at https://aistudio.google.com/apikey: sign in with a Google account, click **Create API key** and copy it (it starts with `AIza...`).
2. **Open the config file:**
   ```powershell
   notepad "D:\Capstone project\backend\.env"
   ```
3. **Paste the key** with no quotes or spaces:
   ```
   GEMINI_API_KEY=AIzaSy...your-key...
   ```
4. **Restart the backend** (Ctrl+C, then `npm run dev` or `npm run start`).
5. **Check it worked:**
   - the backend log shows `[ai] Gemini: enabled (gemini-2.5-flash)`
   - the yellow "No Gemini API key" warning on the admin dashboard is gone
   - http://localhost:5000/api/health shows `"gemini": true`

> ⚠️ Keep the key private. `backend/.env` is listed in `.gitignore`, so it is never committed. Never paste the key into
> code, screenshots or reports. If it leaks, delete it at https://aistudio.google.com/apikey and create a new one.

> ℹ️ Restarting while in in-memory mode resets all data to the demo data. Install MongoDB to keep your data.

---

## 8. How to use AI in the app

With a Gemini key configured, AI is used in four places.

### 8.1 Generating a test from your study material (main feature)

1. Log in as **admin**, then open **Content** in the sidebar.
2. **Upload your material** by dragging in PDFs, `.txt`/`.md` notes or photos of textbook pages. Text is extracted automatically.
   Click **View / edit text** to check the result and fix any OCR mistakes, because this text is exactly what the AI reads.
3. Go to **Tests**, then click **+ New test**.
4. Fill in the form:
   - **1 · Basics:** title, difficulty (easy / medium / hard / mixed), duration, total marks, optional due date, offline mode on/off
   - **2 · Source material:** tick the uploads to use. The **Focus topic** box takes plain-English instructions,
     e.g. *"focus on chapter 3"*, *"Class 10 level"*, *"application-based questions"*. You can also skip uploads and
     enter only a topic, and the AI will use its general knowledge.
   - **3 · Sections & question types:** for each section, how many *multiple choice*, *fill in the blank*,
     *match the following*, *short answer* and *long answer* questions to create.
5. Click **✨ Generate questions** and wait 10–60 seconds while Gemini writes the paper. Marks are distributed automatically
   so they add up to your total.
6. **Review and edit** on the test page: change any question text, option, correct answer, marks, concept tag or
   explanation, delete or reorder questions, or add your own. Click **Save changes**.
   - Not happy? Click **✨ Regenerate with AI** for a completely new set, or change the focus topic in **Settings** first.
   - **Rescale marks** redistributes marks to a new total.
7. Open **Assign & publish**, tick a team (or individual students), click **Save assignment**, then click **Publish**.
   Assigned students are emailed.
8. Optionally download the **🖨 Question paper** (branded PDF) and the **🔑 Answer key**.

The line under the test title shows *"generated with Gemini AI"*. If it says *"template generator"*, the key is not
being picked up (see [Troubleshooting](#15-troubleshooting)).

### 8.2 AI grading of written answers (automatic)

When a student submits an online test:

- **MCQ, fill-in-the-blank and match** questions are graded exactly, without AI (match questions get partial credit per correct pair).
- **Short and long answers** are sent to Gemini, which compares them with the model answer, awards partial marks
  (in steps of 0.5) and writes 1–2 sentences of feedback for the student.

Admins can review every AI score under **Tests → (test) → Submissions → View** and click **✏️ Adjust grades** to
override any score or feedback. The student then sees the teacher's final grade.

### 8.3 AI reading of handwritten answer sheets (offline mode)

1. The student opens the test, then chooses **📝 Or do it on paper**.
2. They download the PDF question paper, write their answers by hand and take photos (or scan to PDF).
3. They upload the files and click **Submit answer sheet**.

Gemini reads the handwriting, matches each answer to its question number, grades it and gives feedback. The admin sees
the uploaded images and the AI's transcription of each answer, and can adjust any score.

### 8.4 AI OCR for scanned PDFs and images

When you upload a scanned PDF (no selectable text), Gemini reads the pages. Images go to Tesseract first (if installed),
then to Gemini.

### Without a Gemini key

Everything still works so the app can be demonstrated anywhere:

| Feature | Fallback behaviour |
|---|---|
| Question generation | Offline template generator builds questions from sentences and keywords in your material |
| Written-answer grading | Keyword-overlap estimate, marked *provisional*; the admin is asked to review and save |
| Offline answer sheets | Stored and marked *awaiting teacher grading*; the admin enters the marks |
| Scanned PDFs | A warning asks you to add a key or upload page images (with Tesseract installed) |

> **Free-tier limits:** the free Gemini tier allows only a few requests per minute. If you see
> *"Gemini request failed … quota / 429"*, wait a minute and retry.

---

## 9. Feature guide

### Admin

| Area | What you can do |
|---|---|
| **Dashboard** | KPIs (students, tests, submissions, average score), score distribution, average per test, recent submissions, top students, weakest concepts |
| **Content** | Upload PDF / TXT / MD / PNG / JPG / WEBP (up to 20 MB each); see the extraction method; view and correct extracted text; delete |
| **Tests** | Create (wizard), AI-generate, edit questions, rescale marks, assign, publish / unpublish, download paper and answer key, delete |
| **Test → Submissions** | See every attempt (online / offline, auto-submitted flag), review and grade, reset a submission to allow a retake |
| **Test → Analytics** | Attempts, average / highest / lowest, score distribution, accuracy by concept, accuracy per question, ranking |
| **Teams** | Create teams, invite students by **email link** (they set their own password) or **create accounts with temporary passwords** (forced change on first login); copy invite links; cancel invites; remove members |
| **Students** | All your students with teams, tests taken and average; reset a password; delete a student |
| **Analytics** | Class-wide distribution, performance by question type (radar), concept mastery, per-test table |
| **Branding** | Institution name, tagline and logo, used on every printed question paper |

### Student

| Area | What you can do |
|---|---|
| **Joining** | Accept the email invitation link and set a password, or log in with credentials from the admin (then change the temporary password) |
| **My tests** | Pending tests (with due dates and overdue flags), in-progress tests to resume, completed tests with scores |
| **Online exam** | Server-enforced countdown timer · question palette (answered / marked for review / not answered / not visited) · mark for review · clear response · autosave every 15 s · resume after closing the browser · auto-submit when time runs out · confirmation summary before submitting |
| **Offline exam** | Download the branded paper, then upload photos or a PDF of the answer sheet |
| **Results** | Score ring, correct / unanswered / accuracy, per-question review with your answer, the correct answer, AI or teacher feedback and an explanation |
| **Performance** | Score trend vs class average, performance by question type, concept mastery, strengths and focus areas, history |
| **Password** | Change password at any time |

### Question types

| Type | Student answers by | Graded by |
|---|---|---|
| Multiple choice | Selecting one of 4 options | Exact match |
| Fill in the blank | Typing the missing word(s) | Case/punctuation-insensitive match, tolerant of small spelling mistakes |
| Match the following | Choosing a match for each term from a shuffled list | Partial credit per correct pair |
| Short answer | Writing 2–4 sentences | Gemini vs model answer (or provisional keyword estimate) |
| Long answer | Writing a detailed answer | Gemini vs model answer (or provisional keyword estimate) |

---

## 10. Demo script (about 5 minutes)

1. **Admin:** log in as `admin@demo.com`, go to **Content** and upload a chapter (PDF or notes).
2. Go to **Tests → + New test**: 5 MCQ, 2 fill-in-the-blank, 1 match in Section A; 1 short and 1 long in Section B.
   Tick the upload and click **✨ Generate questions**.
3. Edit one question to show the teacher stays in control, then click **Save changes**.
4. In **Assign & publish**, tick *Class 10 - Science*, save, then **Publish**. Download the **Question paper** PDF to show the branding.
5. **Student:** in a private/incognito window, log in as `student@demo.com` and open the test, then **Start test**.
   Show the timer and palette, mark a question for review, and give a half-correct answer to the long question. Submit.
6. The **result page** shows instant grading, with the AI's partial marks and feedback on the written answers.
7. Open **Performance** to show the student's charts.
8. **Admin:** open **Tests → (test) → Submissions → View**, adjust a grade, then show **Analytics** and the **Dashboard**.

---

## 11. Project structure

```
Capstone project/
├── package.json             root scripts: setup, dev, start, seed
├── README.md
├── backend/                 Python FastAPI API (port 5000)
│   ├── .env.example         configuration template (copy to .env)
│   ├── requirements.txt
│   ├── uploads/             stored files: content/, submissions/, logos/
│   └── app/
│       ├── main.py          app setup, CORS, routers, /uploads static files, startup seeding
│       ├── config.py        reads .env
│       ├── db.py            MongoDB connection, in-memory fallback, indexes
│       ├── security.py      bcrypt hashing, JWT tokens, require_admin / require_student
│       ├── utils.py         ObjectId helpers, JSON serialisation
│       ├── seed.py          demo data
│       ├── routers/
│       │   ├── auth.py          register, login, me, change password, invitations, branding
│       │   ├── uploads.py       content upload + text extraction
│       │   ├── tests.py         test CRUD, AI generation, questions, publish, assign, PDF, student paper
│       │   ├── submissions.py   start / autosave / submit, offline upload, results, admin grading
│       │   ├── teams.py         teams, invitations, student management
│       │   └── analytics.py     student, admin overview and per-test analytics
│       └── services/
│           ├── gemini.py        Gemini client (JSON generation, vision OCR)
│           ├── questions.py     prompt building, validation, mark allocation, generation pipeline
│           ├── mock_gen.py      offline template question generator
│           ├── grading.py       objective grading, AI / heuristic subjective grading, answer-sheet grading
│           ├── ocr.py           PDF / image text extraction
│           ├── pdf.py           branded question paper / answer key (ReportLab)
│           └── mailer.py        SMTP / console email
└── frontend/                Next.js app (port 3000)
    ├── app/
    │   ├── page.js              landing page
    │   ├── login/, register/, change-password/, invite/[token]/
    │   ├── admin/               dashboard, uploads, tests (list, new, [id]), teams ([id]), students,
    │   │                        submissions/[id], analytics, settings (branding)
    │   ├── student/             dashboard, tests/[id] (intro + offline), results/[id], analytics
    │   └── exam/[id]/           full-screen online exam
    ├── components/          Shell (sidebar), ui, Charts, QuestionEditor, TestConfigForm, ResultView
    └── lib/                 api.js (axios + JWT), auth.js (auth context), format.js
```

---

## 12. Data model

MongoDB collections:

| Collection | Fields |
|---|---|
| **users** | name, email, password (bcrypt hash), role (`admin` / `student`), adminId, teamIds, mustChangePassword, institution {name, tagline, logoPath} |
| **teams** | name, description, adminId, students[], invites[{email, name, token, status, sentAt}] |
| **uploads** | originalName, adminId, filePath, mimeType, size, extractedText, extractionMethod, extractionWarning |
| **tests** | title, description, adminId, uploadIds, topicHint, duration, totalMarks, difficulty, sections[{name, instructions, counts}], assignedTeams, assignedStudents, status (`draft` / `published`), allowOffline, dueDate, generatedWith |
| **questions** | testId, section, order, type, text, options, pairs[{left, right}], correctAnswer, marks, concept, difficulty, explanation |
| **submissions** | testId, studentId, mode (`online` / `offline`), answers[{questionId, response, score, maxScore, isCorrect, feedback, gradedBy}], files, extractedText, totalScore, maxScore, status (`in_progress` / `submitted` / `graded`), needsReview, overallFeedback, startedAt, submittedAt, autoSubmitted |

---

## 13. API endpoints

All endpoints are prefixed with `/api`. Authenticated requests send `Authorization: Bearer <token>`.
Full interactive docs are at http://localhost:5000/docs.

| Method | Path | Access |
|---|---|---|
| POST | `/auth/register-admin`, `/auth/login` | public |
| GET / POST | `/auth/invite/{token}`, `/auth/accept-invite` | public |
| GET / POST | `/auth/me`, `/auth/change-password` | logged in |
| PUT / POST | `/auth/institution`, `/auth/institution/logo` | admin |
| GET, POST, PUT, DELETE | `/uploads`, `/uploads/{id}` | admin |
| GET, POST, PUT, DELETE | `/tests`, `/tests/{id}` | admin |
| POST | `/tests/{id}/generate`, `/tests/{id}/publish`, `/tests/{id}/assign` | admin |
| PUT | `/tests/{id}/questions` | admin |
| GET | `/tests/{id}/pdf` (`?answers=true` for the answer key, admin only) | admin / assigned student |
| GET | `/tests/assigned`, `/tests/{id}/paper` | student |
| POST | `/submissions/start/{testId}`, `/submissions/{id}/submit`, `/submissions/offline/{testId}` | student |
| PUT | `/submissions/{id}/answers` (autosave) | student |
| GET | `/submissions/mine` | student |
| GET | `/submissions/{id}` | owning student / admin |
| GET | `/submissions/test/{testId}` | admin |
| PUT / DELETE | `/submissions/{id}/grade`, `/submissions/{id}` | admin |
| GET, POST, PUT, DELETE | `/teams`, `/teams/{id}`, `/teams/{id}/invite`, `/teams/{id}/students/{sid}`, `/teams/{id}/invites/{iid}` | admin |
| GET, POST, DELETE | `/students`, `/students/{id}/reset-password`, `/students/{id}` | admin |
| GET | `/analytics/me` | student |
| GET | `/analytics/overview`, `/analytics/test/{id}` | admin |
| GET | `/health` | public |

---

## 14. Security notes

- Passwords are hashed with **bcrypt**; sessions use **JWT** tokens that expire after 7 days.
- Role-based access control: admin routes reject students and vice versa.
- Every admin query is scoped to that admin's own data; students see only published tests assigned to them.
- Correct answers are never sent to students before they submit.
- The time limit is enforced **on the server** (2-minute grace period); late answers are ignored and expired attempts are auto-submitted.
- Questions lock once any student has attempted the test.
- Uploaded files are stored under random, unguessable names. For production, serve them behind authentication, use HTTPS, set a strong `JWT_SECRET`, and restrict CORS to your domain.
- API keys and secrets live only in `backend/.env`, which is git-ignored.

---

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| `npm run dev` → `EJSONPARSE` | `package.json` was edited incorrectly; Windows paths in it need double backslashes (`.venv\\Scripts\\python`) |
| Clicking a page seems slow the first time | Normal in development mode (each page compiles on first visit). Use `npm run start` for demos |
| "Cannot reach the server at http://localhost:5000" | The backend isn't running, or crashed. Check the `[api]` lines in the terminal |
| Dashboard says "In-memory database" | MongoDB isn't running. Install/start MongoDB Community, or accept that data resets on restart |
| Data disappeared after restart | Same as above (in-memory mode) |
| Test says "generated with template generator" | `GEMINI_API_KEY` is empty or the backend wasn't restarted after adding it. Check http://localhost:5000/api/health |
| "Gemini request failed (… 429 / quota …)" | Free-tier rate limit; wait a minute and click **Regenerate** |
| "Gemini request failed (… API key not valid …)" | Key mistyped; copy it again from AI Studio (no quotes or spaces) |
| Uploaded image shows "No text" | Install Tesseract, or add a Gemini key |
| Scanned PDF shows a warning | Add a Gemini key, or upload the pages as images with Tesseract installed |
| Invitation emails not arriving | SMTP not configured: emails are printed in the backend console, and the invite link can be copied from the team page. For Gmail use an app password, not your normal password |
| Port 3000 or 5000 already in use | Stop the other process, or change `PORT` in `backend/.env` and `NEXT_PUBLIC_API_URL` in `frontend/.env.local` |
| Narrow window: no sidebar | Below 900 px wide, the sidebar opens from the ☰ button at the top left |

---

## 16. Submitting / sharing the project

**The API key is not needed for submission and must not be included.** The project runs without it (see the
[fallbacks](#without-a-gemini-key)). Whoever runs it can add their own free key by following [section 7](#7-adding-your-gemini-api-key).

Before zipping or uploading:

1. **Exclude `backend/.env`** (or empty its `GEMINI_API_KEY=` and `SMTP_PASS=` lines). `backend/.env.example` contains every
   setting with blank secrets. When using Git, `.env` is already ignored.
2. **Exclude generated folders.** They are large and are recreated by `npm run setup`:
   - `node_modules/` (root and `frontend/`)
   - `frontend/.next/`
   - `backend/.venv/`
   - files inside `backend/uploads/` (keep the folder)
3. If a key was ever committed or shared publicly, **revoke it** at https://aistudio.google.com/apikey.

**To run the submitted project:**

```powershell
npm run setup
copy backend\.env.example backend\.env      # then optionally add a GEMINI_API_KEY
npm run start                               # or: npm run dev
```

Then open http://localhost:3000 and log in with the [demo accounts](#5-demo-accounts).

> Tip: without a key, evaluators see template-generated questions. To show the AI features, include screenshots or a
> short screen recording made with your key enabled, or demonstrate them live.
