# Opportunity Compass US — Development PRD (MVP v1.0)

---

## 1. Product Overview

**Vision:** Opportunity Compass US is an AI-powered opportunity discovery platform that surfaces personalized hackathons, meetups, grants, industry news, and university events for students and early-career professionals in the United States. A background multi-agent pipeline continuously scrapes, cleans, and structures public opportunity data; users open the app to find a pre-computed, ranked checklist tailored to their profile — and can optionally listen to an interruptible voice broadcast of the day's highlights.

**Target Users:** US-based undergraduate/graduate students, PhD candidates, and early-career professionals (0–3 years experience) seeking structured exposure to skill-building and networking opportunities.

**Core Value Prop:** Zero search friction. The user sets a profile once; the system does the discovery. Every morning (or at user-chosen frequency), a personalized, voice-ready checklist is waiting — no manual browsing required.

---

## 2. MVP Scope

### In Scope

- Firebase Authentication (email/password + Google OAuth)
- Professional Profile Card (region, school/company, major/role, education level, interests, activity preferences)
- A2A multi-agent background data pipeline (Hackathon_Agent + Meetup_Agent + News_Agent as MVP agents)
- Gemini-powered extraction, summarization, and tagging of opportunities
- Rule-based + vector-similarity recommendation engine (no ML model in MVP)
- Checklist UI (list view, expand, Save / Ignore / Add to Calendar actions)
- Voice Broadcast (TTS sequential playback, interruptible, STT command recognition)
- Google Calendar OAuth integration (create events from opportunities)
- Post-session checklist summary + optional email delivery
- Interaction logging to Firestore (future ML training signal)
- Cloud Scheduler daily pipeline trigger
- Firebase Hosting deployment

### Out of Scope (MVP)

- ML-based personalized recommendation model (v2+)
- University_Agent (HIGH RISK — anti-scraping, legal grey area)
- Social_Agent / X Twitter API (HIGH RISK — cost, rate limits)
- Grant_Agent (Phase 5, lower user urgency)
- Explicit like/dislike feedback UI (v2+)
- Native mobile app (iOS/Android)
- Team/group collaboration features
- Paid tier / monetization
- Multi-language support (UI is English-only for MVP)
- Cloud Composer orchestration (use Cloud Scheduler + Cloud Functions for MVP)

---

## 3. System Architecture

### 3.1 High-Level Flow

The system is split into two fully decoupled layers:

**Background Layer (async pipeline — runs independently of user sessions):**

```
Cloud Scheduler (cron)
    → triggers Coordinator Agent (Cloud Run)
    → Coordinator publishes task messages to Cloud Pub/Sub (per-agent topics)
    → Specialized Agents (Cloud Run microservices) consume messages
    → Agents scrape/fetch data from external APIs
    → Raw data → Gemini API (extract, clean, summarize, tag)
    → Structured Opportunity objects → written to Firestore (opportunities collection)
    → Coordinator updates agent_cards status in Firestore
```

**Frontend Layer (synchronous read — fast, no live pipeline dependency):**

```
User opens app
    → Firebase Auth validates session
    → Frontend calls Backend API: GET /api/opportunities
    → Backend reads pre-computed, filtered Opportunity docs from Firestore
    → Recommendation engine applies rule-based filter + vector ranking
    → Returns ranked list to Frontend
    → Checklist UI renders (title, badge, date, summary, actions)
    → Optional: user starts Voice Broadcast session
        → TTS reads summaries sequentially
        → STT listens for voice commands
        → Gemini handles follow-up conversational queries
        → Session ends → post-session checklist generated
```

> NOTE: The frontend NEVER triggers agents directly. All agent work is pre-computed. Frontend response time target is <2s.

---

### 3.2 A2A Agent Architecture

#### Core Coordinator Agent (Cloud Run — Python)

- Deployed as a standalone Cloud Run service
- Responsibilities:
  - Receives trigger from Cloud Scheduler (HTTP POST)
  - Reads active agents from `agent_cards` Firestore collection
  - Publishes task request messages to each agent's Pub/Sub request topic
  - Subscribes to each agent's Pub/Sub response topic
  - Deduplicates incoming Opportunity objects (by source_url hash)
  - Calls Gemini API for extraction + summarization on raw data
  - Writes finalized Opportunity objects to Firestore `opportunities` collection
  - Updates `agent_cards` with `last_run` timestamp and `status`

#### Specialized Data Agents (Cloud Run — Python, one service per agent)

Each agent is an independent microservice with its own Cloud Run deployment.

| Agent | Data Sources | Risk Level | MVP Priority |
|-------|-------------|------------|--------------|
| `Hackathon_Agent` | Devpost public API / RSS | LOW | P0 — build first |
| `Meetup_Agent` | Eventbrite API, Meetup API | LOW | P0 |
| `News_Agent` | Google News API, Dev.to RSS, Hacker News API | LOW | P0 |
| `Grant_Agent` | Public scholarship databases (e.g., Fastweb RSS) | MEDIUM | P1 (Phase 5) |
| `University_Agent` | Public university event pages (HTML scraping) | HIGH — anti-scraping, legal grey area | DEPRIORITIZED |
| `Social_Agent` | X/Twitter API v2 | HIGH — expensive tier, rate limits | DEPRIORITIZED — fallback to RSS/Nitter if needed |

**Agent lifecycle per run:**

```
1. Consume task message from Pub/Sub request topic
2. Fetch raw data from external API/RSS (respect robots.txt, rate limits)
3. Parse and normalize raw records into partial Opportunity objects
4. Publish response message (with raw opportunities array) to Pub/Sub response topic
5. Update own agent_cards.status in Firestore
```

**Agent Communication via Cloud Pub/Sub (async):**

- Each agent has a dedicated request topic and response topic
- Coordinator is the sole publisher to request topics
- Agents are the sole publishers to response topics
- Coordinator subscribes to all response topics
- Dead-letter topics configured for failed messages

**Agent Cards stored in Firestore:**

- `agent_cards` collection stores dynamic discovery metadata for each agent
- Coordinator reads this collection at runtime to know which agents are active
- Enables hot-enable/disable of agents without redeployment

---

### 3.3 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Firebase Hosting |
| Backend API | Cloud Run (Node.js or Python — recommend Python FastAPI for consistency) |
| Agent Services | Cloud Run (Python, one service per agent) |
| Coordinator Agent | Cloud Run (Python) |
| Serverless Functions | Cloud Functions (webhooks, lightweight triggers) |
| LLM / NLU / NLG | Gemini API |
| Recommendation (MVP) | Rule-based matching + vector similarity (Gemini text-embedding + cosine similarity; optionally Vertex AI Matching Engine) |
| Recommendation (v2+) | Vertex AI custom ML model |
| STT | Google Cloud Speech-to-Text |
| TTS | Google Cloud Text-to-Speech |
| Primary Database | Firestore |
| File Storage | Google Cloud Storage (GCS) |
| Message Queue | Cloud Pub/Sub |
| Auth | Firebase Authentication |
| Data Pipeline Scheduler | Cloud Scheduler + Cloud Functions (MVP) → Cloud Composer (v2+) |
| Calendar Integration | Google Calendar API |
| Search/Email Auxiliary | Google Custom Search API, Google News API |

---

## 4. Data Models

All collections live in Firestore. Field types follow Firestore conventions. Use Firestore server timestamps for all `timestamp` fields.

### `users`

```
userId: string                        // Firebase UID — document ID
email: string
is_edu_email: boolean                 // detected from email domain on registration
avatar_url: string | null             // GCS public URL or null if preset
profile_card: {
  region: {
    state: string                     // US state code, e.g. "CA"
    city: string                      // e.g. "San Francisco"
  }
  school_or_company: string
  major_or_role: string
  education_level: enum[
    "undergraduate",
    "graduate",
    "phd",
    "professional"
  ]
  work_years: number | null           // 0–3, populated only if education_level = "professional"
  grad_year: number | null            // 4-digit year, populated only if student
  interests: string[]                 // e.g. ["AI/ML", "Fintech", "UI/UX Design"]
  activity_forms: string[]            // e.g. ["Hackathon", "Online Course", "Meetup"]
}
push_frequency: enum["daily","weekly","custom"]
push_time: string                     // "HH:MM" in user's local timezone (24h format)
timezone: string                      // IANA timezone string, e.g. "America/Los_Angeles"
google_calendar_connected: boolean
google_calendar_token: string | null  // encrypted OAuth token stored server-side
created_at: timestamp
updated_at: timestamp
```

### `opportunities`

```
opportunityId: string                 // auto-generated Firestore doc ID
title: string
description: string                   // original raw description from source
summary: string                       // Gemini-generated 2–3 sentence summary
type: enum[
  "Hackathon",
  "Meetup",
  "News",
  "Grant",
  "University Event",
  "Online Course",
  "Competition",
  "Volunteer"
]
source_url: string                    // canonical URL; used for deduplication hash
source_agent: string                  // e.g. "Hackathon_Agent"
start_date: timestamp | null
end_date: timestamp | null
deadline: timestamp | null            // registration/submission deadline
location: string                      // human-readable; "Online" if is_online
is_online: boolean
tags: string[]                        // topical tags, e.g. ["AI", "student", "free"]
region_tags: string[]                 // US state codes this is relevant to, e.g. ["CA", "NY"] or ["ALL"]
collected_at: timestamp               // when agent stored this record
expires_at: timestamp | null          // after this date, mark status = "expired"
status: enum["active","expired","archived"]
```

### `user_opportunity_interactions`

```
interactionId: string                 // auto-generated Firestore doc ID
userId: string
opportunityId: string
interaction_type: enum[
  "view",
  "save",
  "ignore",
  "add_to_calendar",
  "voice_query",
  "voice_skip",
  "voice_repeat",
  "expand_detail"
]
timestamp: timestamp
session_id: string | null             // voice session ID if interaction occurred during broadcast
```

> Index required: `userId` + `timestamp` (DESC) for efficient user history queries.
> Index required: `userId` + `opportunityId` for deduplication on save/ignore.

### `agent_cards`

```
agentId: string                       // e.g. "hackathon_agent" — document ID
name: string                          // e.g. "Hackathon_Agent"
description: string
pubsub_request_topic: string          // full topic path: projects/{project}/topics/{topic}
pubsub_response_topic: string
status: enum["active","degraded","offline"]
last_run: timestamp
```

---

## 5. Functional Requirements

### 5.1 Authentication & Onboarding

- **FR1.1:** Users can register with email and password via Firebase Authentication.
- **FR1.2:** On registration, the backend detects `.edu` email domains and sets `is_edu_email: true`. This grants a visual badge in the UI but does NOT restrict access. No email server scraping occurs — domain suffix check only.
- **FR1.3:** Users can sign in with Google OAuth via Firebase `signInWithPopup` (Google provider).
- **FR1.4:** After first login (new user), the app redirects to the Profile Card setup flow. Returning users with an existing profile go directly to the Checklist view.

### 5.2 Professional Profile Card

- **FR1.5:** Profile Card UI is displayed as an ID-card-style editable form. All fields from the `profile_card` subdocument must be editable in this view.
- **FR1.6:** Avatar upload supported — file uploaded to GCS, public URL stored in `users.avatar_url`. Alternatively, user selects from a set of 8 preset avatar illustrations (no upload required).
- **FR1.7:** `interests` and `activity_forms` are rendered as multi-select chip inputs. Predefined options are provided; user can add custom values.
- **FR1.8:** `education_level` selection conditionally shows `grad_year` (if student) or `work_years` (if professional).
- **FR1.9:** Push frequency selector: Daily / Weekly / Custom. Custom shows a day-of-week multi-select.
- **FR1.10:** Push time selector: time picker in user's local timezone. Stored as `HH:MM` string + `timezone` field.

### 5.3 A2A Data Collection Pipeline

- **FR2.1:** A Coordinator Agent Cloud Run service is deployed and exposed via HTTP. Cloud Scheduler sends a POST request to it on the configured cron schedule.
- **FR2.2:** The Coordinator reads all `agent_cards` with `status = "active"` and publishes one task message per agent to its `pubsub_request_topic`.
- **FR2.3:** Each Specialized Agent consumes its task message, fetches data from its assigned external APIs, and publishes results to its `pubsub_response_topic`.
- **FR2.4:** The Coordinator consumes response messages, deduplicates by `source_url` hash (SHA-256), passes new records through the Gemini processing pipeline, and writes to the `opportunities` Firestore collection.
- **FR2.5:** Data sources per agent:
  - `Hackathon_Agent`: Devpost public listing pages or RSS — stable, no auth required for public data.
  - `Meetup_Agent`: Eventbrite public API (API key auth), Meetup GraphQL API (API key auth).
  - `News_Agent`: Google News API (key auth), Dev.to public API (no auth), Hacker News Algolia API (no auth).
  - `Grant_Agent` (Phase 5): Public scholarship RSS feeds (e.g., Fastweb, Scholarships.com RSS).
  - `University_Agent` (DEPRIORITIZED — HIGH RISK): HTML scraping of public `/events` pages only. Must check `robots.txt` before any request. Implement 3–5 second delay between requests. Never scrape pages requiring login.
  - `Social_Agent` (DEPRIORITIZED — HIGH RISK): X/Twitter API v2 Bearer Token. Only proceed if API access is confirmed affordable. Fallback: curated RSS feeds or Nitter public instances.
- **FR2.6:** Raw data pipeline: fetch → parse → normalize fields → SHA-256 dedup check → Gemini extraction → Gemini summarization → tag classification → write to Firestore.
- **NFR2.1:** All P0 agents (Hackathon, Meetup, News) must run at minimum once daily via Cloud Scheduler.
- **NFR2.2:** All agents must check and respect `robots.txt` before scraping. No ToS violations. HTTP User-Agent must identify the bot (e.g., `OpportunityCompassBot/1.0`).

### 5.4 AI Processing (Coordinator Agent)

- **FR3.1:** Coordinator passes raw opportunity text to Gemini API with a structured extraction prompt. Gemini returns a JSON object with fields: `title`, `description`, `start_date`, `end_date`, `deadline`, `location`, `is_online`, `organizer`, `tags`, `source_url`.
- **FR3.2:** Coordinator calls Gemini with a summarization prompt to generate a `summary` field: 2–3 sentences, plain English, suitable for TTS reading.
- **FR3.3:** Coordinator classifies each opportunity into a `type` enum value and assigns `region_tags` based on location content.

### 5.5 Recommendation Engine (MVP)

MVP does NOT use a trained ML model (insufficient user interaction data at launch — cold start problem). Use the following staged approach:

**Step 1 — Hard Filter (rule-based):**

```python
# Filter opportunities where:
# - opportunity.region_tags overlaps user.profile_card.region.state OR contains "ALL"
# - opportunity.tags overlaps user.profile_card.interests (at least 1 match)
# - opportunity.type is in user.profile_card.activity_forms
# - opportunity.status == "active"
# - opportunity.expires_at > now (if set)
```

**Step 2 — Soft Rank (vector similarity):**

```python
# Generate embedding for user profile string:
# f"{user.major_or_role} {user.interests.join(' ')} {user.activity_forms.join(' ')}"
# Generate embedding for each opportunity:
# f"{opportunity.title} {opportunity.summary} {opportunity.tags.join(' ')}"
# Use Gemini text-embedding-004 model (or Vertex AI Matching Engine for scale)
# Rank by cosine similarity (descending)
```

**Step 3 — Recency Boost:**

```python
# Apply decay factor: score *= (1 - days_since_collected * 0.05)
# Cap decay at 50% to avoid complete suppression of older but relevant items
```

**v2+ upgrade path:** Once sufficient `user_opportunity_interactions` data is collected (target: 10,000+ interaction events), replace Step 2 with a Vertex AI trained collaborative filtering or two-tower model.

### 5.6 Checklist UI

- **FR4.1:** Main view displays a ranked list of Opportunity cards. Each card shows: title, type badge (color-coded by type enum), start date or deadline (whichever is sooner), location or "Online" label, and the 2-sentence Gemini summary.
- **FR4.2:** Tapping/clicking a card expands it to show: full description, organizer, all tags, source URL (opens in new tab), and action buttons.
- **FR4.3:** Actions available on expanded card: **Save** (sets interaction type `save`), **Ignore** (sets `ignore`, removes from list), **Add to Google Calendar** (triggers FR6.1–6.4 flow).
- **FR4.4:** Checklist supports infinite scroll pagination. Default page size: 20 items.

### 5.7 Voice Broadcast & Interaction

- **FR5.1:** User taps "Start Broadcast" button. Backend creates a voice session (returns `session_id`). Frontend calls `GET /api/voice/session/start`.
- **FR5.2:** Backend uses Google TTS to synthesize audio for the first opportunity's summary. Audio returned as base64 or streamed to frontend.
- **FR5.3:** TTS reads each opportunity summary sequentially. After each item, the system pauses 1.5 seconds listening for voice commands before proceeding to the next item.
- **FR5.4:** Voice broadcast is interruptible at any point. User can speak mid-sentence.
- **FR5.5:** Recognized voice commands:

| Command | Action |
|---------|--------|
| "Next" | Skip to next opportunity |
| "Pause" / "Stop" | Pause broadcast |
| "Play" / "Resume" | Resume broadcast |
| "Repeat" / "Say that again" | Replay current item |
| "Tell me more" / "What is this" | Gemini conversational expansion of current item |
| "Add to calendar" | Trigger calendar event creation for current item |
| "Save this" | Save current item |
| "Ignore" / "Skip" | Ignore current item, move to next |

- **FR5.6:** Follow-up questions about the current item ("When does it start?", "Is it free?", "Who organizes this?") are handled by Gemini with the current opportunity's full data as context. Gemini's response is synthesized via TTS and played back.
- **FR5.7:** After voice session ends (user says "Done" or taps Stop), the backend compiles a post-session Checklist of all items the user saved, added to calendar, or interacted with (excluding ignored items).
- **FR5.8:** Post-session, the frontend prompts: "Email me this checklist?" — if confirmed, backend sends a formatted HTML email via Firebase Extensions (Trigger Email) or SendGrid.

### 5.8 Google Calendar Integration

- **FR6.1:** On first "Add to Calendar" action, user is prompted to connect Google Calendar via OAuth 2.0. Redirect to Google OAuth consent screen with `https://www.googleapis.com/auth/calendar.events` scope.
- **FR6.2:** OAuth token stored encrypted in `users.google_calendar_token`. `users.google_calendar_connected` set to `true`.
- **FR6.3:** Backend creates a Google Calendar event with: event name = opportunity title, start/end datetime from opportunity data (all-day event if only date available), location, description = Gemini summary + source URL.
- **FR6.4:** User can set a reminder offset in minutes before event creation. Default: 60 minutes. Stored as a `reminderMinutes` parameter in the API call.

### 5.9 Feedback & Learning

- **FR7.1:** Every user interaction with an opportunity (view, save, ignore, voice commands, expand) is logged as a document in `user_opportunity_interactions`.
- **FR7.2:** Interaction logs are the primary training signal for the v2+ ML recommendation model. No data is discarded.
- **FR7.3 (v2+):** Explicit thumbs-up / thumbs-down feedback UI on each opportunity card. Stored as new interaction_type values `explicit_like` / `explicit_dislike`.

---

## 6. API Contracts

### 6.1 Frontend → Backend REST API

All endpoints require `Authorization: Bearer <Firebase ID Token>` header except `/api/auth/*`.

```
POST   /api/auth/register
       Body: { email: string, password: string }
       Response: { userId, idToken, isNewUser: boolean }

POST   /api/auth/google
       Body: { idToken: string }  // Firebase Google OAuth token
       Response: { userId, isNewUser: boolean }

GET    /api/profile
       Response: { ...users document (minus google_calendar_token) }

PUT    /api/profile
       Body: Partial<users document>
       Response: { updated: true }

GET    /api/opportunities?page=1&limit=20
       Response: { opportunities: Opportunity[], total: number, page: number }

POST   /api/opportunities/:id/interact
       Body: { interaction_type: InteractionType, session_id?: string }
       Response: { interactionId: string }

POST   /api/opportunities/:id/calendar
       Body: { reminder_minutes: number }
       Response: { eventId: string, eventUrl: string }

GET    /api/voice/session/start
       Response: { session_id: string, first_audio: base64string, opportunity: Opportunity }

POST   /api/voice/command
       Body: { audio_blob?: base64string, text_command?: string, session_id: string }
       Response: { action: string, audio_response?: base64string, opportunity?: Opportunity }

POST   /api/voice/session/end
       Body: { session_id: string }
       Response: { session_id: string, checklist: Opportunity[] }

GET    /api/checklist/summary/:session_id
       Response: { saved: Opportunity[], added_to_calendar: Opportunity[], interacted: Opportunity[] }

POST   /api/checklist/email/:session_id
       Body: { email?: string }  // defaults to user's registered email
       Response: { sent: true }
```

### 6.2 Pub/Sub Message Schema (Agent Communication)

```json
// Coordinator → Agent (published to agent's request topic)
{
  "task_id": "uuid-v4",
  "agent": "Hackathon_Agent",
  "filters": {
    "region": ["CA", "NY"],
    "tags": ["AI", "student"]
  },
  "requested_at": "2025-01-01T08:00:00Z"
}
```

```json
// Agent → Coordinator (published to agent's response topic)
{
  "task_id": "uuid-v4",
  "agent": "Hackathon_Agent",
  "status": "success",
  "opportunities": [
    {
      "title": "string",
      "description": "string",
      "source_url": "string",
      "start_date": "ISO8601 | null",
      "end_date": "ISO8601 | null",
      "deadline": "ISO8601 | null",
      "location": "string",
      "is_online": true,
      "tags": ["string"],
      "region_tags": ["CA", "NY"]
    }
  ],
  "completed_at": "2025-01-01T08:02:34Z"
}
```

```json
// status values: "success" | "partial" | "failed"
// "partial" means some records were collected but errors occurred on others
// "failed" means no records were collected — agent should set own status to "degraded"
```

---

## 7. Non-Functional Requirements

| NFR ID | Category | Requirement |
|--------|----------|-------------|
| NFR4.1 | Security | All data encrypted at rest (Firestore default) and in transit (TLS 1.3+). `google_calendar_token` encrypted before storage using Cloud KMS. |
| NFR4.2 | Privacy | CCPA compliant. User data deletion API must be implemented (`DELETE /api/profile`). Explicit consent banner for Calendar OAuth scope. |
| NFR4.3 | Auth | Google Calendar OAuth requires explicit user consent screen. Never request Calendar scope silently or on login. |
| NFR4.4 | Legal | All scrapers MUST check `robots.txt` before any HTTP request. User-Agent header must be set. No scraping of pages behind login walls. |
| NFR5.1 | Performance | Frontend `/api/opportunities` response < 2 seconds. Achieved by reading pre-computed Firestore data; never triggering live agent pipeline from frontend. |
| NFR5.2 | Scalability | All Cloud Run services (agents, coordinator, backend API) configured with auto-scaling. Min instances = 0 for cost efficiency (acceptable cold start for background agents). |
| NFR5.3 | Reliability | Pub/Sub dead-letter topics configured for all agent topics. Failed messages retried up to 5 times before dead-lettering. Coordinator monitors dead-letter queues and updates `agent_cards.status`. |

---

## 8. Build Phases

### Phase 1 — Foundation (Weeks 1–3)

- [ ] Create Firebase project; enable Authentication (Email/Password + Google OAuth)
- [ ] Create Firestore database; define security rules (users can only read/write their own documents)
- [ ] Initialize `users`, `opportunities`, `user_opportunity_interactions`, `agent_cards` collections with schema validation
- [ ] Scaffold React frontend (Create React App or Vite + React); configure Firebase SDK
- [ ] Implement registration flow (email/password + Google OAuth)
- [ ] Implement `.edu` domain detection on registration
- [ ] Build Profile Card UI (all fields, multi-select chips, conditional fields, avatar upload)
- [ ] Wire Profile Card form to Firestore `PUT /api/profile`
- [ ] Deploy frontend to Firebase Hosting
- [ ] Set up Cloud Run backend API service (Python FastAPI); deploy with Cloud Run
- [ ] Configure environment variables in Cloud Run (see Section 10)

### Phase 2 — Data Pipeline (Weeks 4–6)

- [ ] Create Cloud Pub/Sub topics for Coordinator and all planned agents
- [ ] Build Coordinator Agent Cloud Run service (Python)
  - [ ] HTTP trigger endpoint (POST /trigger)
  - [ ] Reads `agent_cards` from Firestore
  - [ ] Publishes task messages to agent request topics
  - [ ] Subscribes to agent response topics (pull subscription)
  - [ ] Deduplication logic (SHA-256 of source_url)
  - [ ] Gemini extraction + summarization pipeline
  - [ ] Writes finalized Opportunity objects to Firestore
- [ ] Build `Hackathon_Agent` Cloud Run service (Python)
  - [ ] Devpost public listing fetch + parse
  - [ ] Pub/Sub consumer + publisher
  - [ ] robots.txt check before any request
- [ ] Build `Meetup_Agent` Cloud Run service (Python)
  - [ ] Eventbrite API integration
  - [ ] Meetup GraphQL API integration
  - [ ] Pub/Sub consumer + publisher
- [ ] Set up Cloud Scheduler job (daily, cron: `0 6 * * *` UTC) → HTTP POST to Coordinator
- [ ] Verify end-to-end pipeline: Scheduler → Coordinator → Agents → Firestore

### Phase 3 — Recommendation + Checklist (Weeks 7–9)

- [ ] Implement rule-based filter in `/api/opportunities` endpoint
  - [ ] Region matching (state overlap or "ALL")
  - [ ] Interest tag overlap
  - [ ] Activity form type match
  - [ ] Status + expiry filter
- [ ] Generate Gemini text-embedding-004 embeddings for user profile on profile update (store in `users.profile_embedding`)
- [ ] Generate embeddings for each new Opportunity on write (store in `opportunities.embedding`)
- [ ] Implement cosine similarity ranking in `/api/opportunities`
- [ ] Implement recency boost decay
- [ ] Build Checklist UI components (OpportunityCard, ExpandedCard, TypeBadge)
- [ ] Implement Save / Ignore / Add to Calendar action buttons
- [ ] Wire all actions to `POST /api/opportunities/:id/interact`
- [ ] Implement infinite scroll pagination
- [ ] Verify interaction logging to `user_opportunity_interactions`

### Phase 4 — Voice + Calendar (Weeks 10–12)

- [ ] Integrate Google Cloud Text-to-Speech API in backend
- [ ] Implement `GET /api/voice/session/start` — creates session, returns first TTS audio
- [ ] Implement `POST /api/voice/command` — handles all voice commands (see FR5.5 table)
- [ ] Integrate Google Cloud Speech-to-Text API (streaming or single-utterance)
- [ ] Implement interruptible broadcast logic (frontend WebSocket or polling)
- [ ] Implement Gemini conversational follow-up for "Tell me more" command
- [ ] Implement `POST /api/voice/session/end` — generates post-session checklist
- [ ] Implement Google Calendar OAuth 2.0 flow
  - [ ] OAuth redirect + callback endpoint
  - [ ] Token encryption (Cloud KMS) + storage in Firestore
  - [ ] Token refresh logic
- [ ] Implement `POST /api/opportunities/:id/calendar` — creates Google Calendar event
- [ ] Implement `POST /api/checklist/email/:session_id` — sends post-session email
- [ ] Build Voice Broadcast UI (play/pause controls, current item display, command hint overlay)

### Phase 5 — Remaining Agents + Hardening (Weeks 13–15)

- [ ] Build `News_Agent` (Google News API + Dev.to public API + Hacker News Algolia API)
- [ ] Build `Grant_Agent` (public scholarship RSS feeds)
- [ ] `University_Agent` (DEPRIORITIZED — implement only if time allows; see risk register)
  - [ ] Limit to 5–10 known public university event calendar URLs
  - [ ] Mandatory robots.txt check; 5-second delay between requests
  - [ ] Legal review before deployment
- [ ] `Social_Agent` (implement ONLY if X/Twitter API access confirmed affordable)
  - [ ] If not: implement curated RSS feed scraping as fallback
- [ ] Load test backend API and Coordinator with realistic data volumes
- [ ] Tune Cloud Run concurrency and memory settings
- [ ] Security audit: Firebase security rules, API authentication, token storage
- [ ] Implement `DELETE /api/profile` (CCPA user data deletion)
- [ ] Final QA pass on all voice commands and Calendar integration

---

## 9. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| X/Twitter API cost / rate limits | HIGH | Default to deprioritized. Fallback: curated RSS feeds, Nitter public API. Implement Social_Agent only after confirming API cost is acceptable. |
| University website anti-scraping | HIGH | Limit to known public calendar URLs only. Mandatory robots.txt compliance. 5-second request delay. Deprioritized to Phase 5. Seek legal review. |
| Gemini API latency in pipeline | MEDIUM | Batch process multiple opportunities per API call. Use async queue (Pub/Sub buffering). Cache summaries — never re-summarize a deduplicated opportunity. |
| Google Calendar OAuth token revocation | MEDIUM | Implement token refresh on every Calendar API call. On refresh failure, clear `google_calendar_token`, set `google_calendar_connected: false`, prompt re-auth in UI. |
| Recommendation cold start (new users) | LOW (mitigated) | MVP uses rule-based + vector similarity only. No ML model until sufficient interaction data. Rule-based matching is effective from first login given profile card data. |
| Pub/Sub message ordering / delivery | LOW | Use Pub/Sub ordering keys where sequence matters. Configure dead-letter topics. Deduplication in Coordinator prevents double-writes. |
| Devpost API changes / rate limits | LOW | Use public RSS endpoints as fallback. Monitor HTTP response codes; set `agent_cards.status = "degraded"` on repeated failures. |

---

## 10. Environment & Config

All secrets stored in Google Cloud Secret Manager. Inject into Cloud Run services as environment variables at deploy time. Never commit secrets to version control.

```bash
# ── Firebase ──────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=

# ── Google Cloud ──────────────────────────────────────────────────
GCP_PROJECT_ID=
GCP_REGION=us-central1
GEMINI_API_KEY=
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_KMS_KEY_ID=                    # for encrypting calendar tokens

# ── Cloud Pub/Sub Topics ──────────────────────────────────────────
# Format: projects/{GCP_PROJECT_ID}/topics/{topic-name}
PUBSUB_COORDINATOR_REQUEST_TOPIC=
PUBSUB_COORDINATOR_RESPONSE_TOPIC=
PUBSUB_HACKATHON_REQUEST_TOPIC=
PUBSUB_HACKATHON_RESPONSE_TOPIC=
PUBSUB_MEETUP_REQUEST_TOPIC=
PUBSUB_MEETUP_RESPONSE_TOPIC=
PUBSUB_NEWS_REQUEST_TOPIC=
PUBSUB_NEWS_RESPONSE_TOPIC=
PUBSUB_GRANT_REQUEST_TOPIC=
PUBSUB_GRANT_RESPONSE_TOPIC=
PUBSUB_UNIVERSITY_REQUEST_TOPIC=
PUBSUB_UNIVERSITY_RESPONSE_TOPIC=
PUBSUB_SOCIAL_REQUEST_TOPIC=
PUBSUB_SOCIAL_RESPONSE_TOPIC=

# ── Third-Party APIs ──────────────────────────────────────────────
EVENTBRITE_API_KEY=
MEETUP_API_KEY=
TWITTER_BEARER_TOKEN=                 # only if Social_Agent is enabled
GOOGLE_NEWS_API_KEY=
DEVPOST_BASE_URL=https://devpost.com

# ── App Config ────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=                  # e.g. https://opportunitycompass.app
PUSH_SCHEDULE_CRON=0 6 * * *         # UTC — 6 AM daily; adjust per target user timezone

# ── Email ─────────────────────────────────────────────────────────
SENDGRID_API_KEY=                     # or use Firebase Trigger Email Extension
EMAIL_FROM_ADDRESS=noreply@opportunitycompass.app
```

---

## 11. Development Notes

<!-- 以下为给人类开发者的中文备注 -->

<!--
  [架构决策]
  - MVP 不训练 ML 模型，冷启动问题规避：直接用规则过滤 + Gemini embedding 向量相似度排序。
    等积累到 1 万条以上的用户交互数据后，再切换到 Vertex AI 自定义模型。
  - 前端只读 Firestore 预计算数据，不触发 Agent 实时抓取。所有 Agent 都是后台异步跑的。

  [高风险提醒]
  - University_Agent 和 Social_Agent 都是高风险，MVP 阶段不要碰，等 Phase 5 再评估。
  - X/Twitter API 的企业级 tier 费用极高，先确认预算再决定是否实现 Social_Agent。
  - University 网站的爬虫法律灰色地带：上线前必须做法律评审。

  [开发顺序建议]
  - 先跑通 Phase 1 的 Auth + Profile Card + Firestore，让前端可以独立测试。
  - Phase 2 的 Hackathon_Agent 是最简单的切入点（Devpost 有公开 RSS），先用它验证整条 Pipeline。
  - Phase 3 的向量相似度排序，如果 Vertex AI Matching Engine 成本太高，
    MVP 可以直接在后端内存里做 cosine similarity 计算（数据量不大时完全够用）。

  [注意事项]
  - Google Calendar Token 必须加密存储，推荐用 Cloud KMS 而不是自己管密钥。
  - 所有 Agent 的 User-Agent 必须带 "OpportunityCompassBot/1.0"，robots.txt 合规是硬性要求。
  - Firestore 安全规则：用户只能读写自己的 users 文档；opportunities 集合用户只读。
-->

---

*PRD Version: 1.0 | Created: 2026-03-26 | Status: Development-Ready*
