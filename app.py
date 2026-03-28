import os
import json
import requests
from datetime import datetime, timezone
from flask import Flask, jsonify, request, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app)

# ── Gemini ────────────────────────────────────────────────────────────────────
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
gemini = genai.GenerativeModel("gemini-2.5-flash")

# ── Google Calendar ───────────────────────────────────────────────────────────
def get_calendar_service():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_WORKSPACE_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_WORKSPACE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_WORKSPACE_CLIENT_SECRET"],
        scopes=["https://www.googleapis.com/auth/calendar"],
    )
    return build("calendar", "v3", credentials=creds)


# ── Data fetchers ─────────────────────────────────────────────────────────────
def fetch_devpost_hackathons(limit=12):
    url = "https://devpost.com/api/hackathons"
    params = {"challenge_listed": "true", "status[]": "upcoming",
              "order_by": "deadline", "per_page": limit}
    headers = {"User-Agent": "Mozilla/5.0 OpporTune/1.0"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        results = []
        for h in r.json().get("hackathons", []):
            themes = [t["name"] for t in h.get("themes", [])]
            results.append({
                "id": f"devpost_{h['id']}",
                "title": h.get("title", "Untitled"),
                "type": "Hackathon",
                "source": "Devpost",
                "source_url": h.get("url", ""),
                "location": h.get("displayed_location", {}).get("location", "Online"),
                "deadline": h.get("submission_period_dates", ""),
                "organizer": h.get("organization_name", ""),
                "tags": themes,
                "prize": h.get("prize_amount", ""),
                "raw_summary": _build_raw_summary(h),
            })
        return results
    except Exception as e:
        print(f"[Devpost] Error: {e}")
        return []


def _build_raw_summary(h):
    parts = []
    if h.get("organization_name"):
        parts.append(f"Organized by {h['organization_name']}.")
    if h.get("prize_amount"):
        parts.append(f"Prize pool: {h['prize_amount']}.")
    loc = h.get("displayed_location", {}).get("location", "")
    if loc:
        parts.append(f"Location: {loc}.")
    if h.get("submission_period_dates"):
        parts.append(f"Dates: {h['submission_period_dates']}.")
    if h.get("registrations_count"):
        parts.append(f"{h['registrations_count']} participants registered.")
    return " ".join(parts) or "No description available."


def fetch_hackernews(limit=8):
    try:
        top_ids = requests.get(
            "https://hacker-news.firebaseio.com/v0/topstories.json", timeout=8
        ).json()[:40]
        results = []
        for sid in top_ids:
            if len(results) >= limit:
                break
            item = requests.get(
                f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=5
            ).json()
            if not item or item.get("type") != "story":
                continue
            title = item.get("title", "")
            if any(x in title for x in ["Ask HN", "Show HN"]):
                continue
            if item.get("score", 0) < 80:
                continue
            ts = item.get("time", 0)
            dt = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%b %d, %Y") if ts else ""
            url = item.get("url") or f"https://news.ycombinator.com/item?id={sid}"
            results.append({
                "id": f"hn_{sid}",
                "title": title,
                "type": "Industry News",
                "source": "Hacker News",
                "source_url": url,
                "location": "Online",
                "deadline": dt,
                "organizer": "",
                "tags": ["Tech", "Startup", "Industry"],
                "prize": "",
                "raw_summary": f"Trending on Hacker News with {item.get('score', 0)} points. Posted {dt}.",
            })
        return results
    except Exception as e:
        print(f"[HackerNews] Error: {e}")
        return []


# ── Gemini: personalized scripts ──────────────────────────────────────────────
def generate_personalized_scripts(profile, opportunities):
    """Generate a warm, personalized broadcast script for each opportunity."""
    name       = profile.get("name", "there")
    major      = profile.get("major", "your field")
    interests  = ", ".join(profile.get("interests", [])) or "general interests"
    activities = ", ".join(profile.get("activity_forms", [])) or "various activities"
    school     = profile.get("school", "")
    edu_level  = profile.get("edu_level", "student")

    opps_text = "\n".join([
        f"{i+1}. [{o['type']}] {o['title']}\n"
        f"   Location: {o['location']} | Dates: {o['deadline']}\n"
        f"   Tags: {', '.join(o.get('tags', []))}\n"
        f"   Info: {o['raw_summary']}"
        for i, o in enumerate(opportunities)
    ])

    prompt = f"""You are OpporTune, a friendly and knowledgeable career guide.
You are about to narrate a personalized opportunity briefing for this student:

Name: {name}
Major/Field: {major}
Education level: {edu_level}
School: {school}
Interests: {interests}
Preferred activity types: {activities}

Here are {len(opportunities)} opportunities to brief them on:
{opps_text}

For EACH opportunity, write a 2-3 sentence personalized broadcast script.
- Address them by first name
- Specifically explain WHY this opportunity is relevant for THEIR major/interests
- Be warm, conversational, and encouraging — like a knowledgeable friend
- For non-tech majors, highlight non-technical roles (design, marketing, business, research, etc.)
- Keep it concise but personal

Return ONLY valid JSON in this exact format:
{{
  "scripts": {{
    "1": "script for opportunity 1...",
    "2": "script for opportunity 2...",
    ...
  }}
}}"""

    try:
        response = gemini.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip()).get("scripts", {})
    except Exception as e:
        print(f"[Gemini scripts] Error: {e}")
        return {}


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/opportunities")
def get_opportunities():
    hackathons = fetch_devpost_hackathons(limit=10)
    news       = fetch_hackernews(limit=8)
    all_opps   = hackathons + news
    return jsonify({"opportunities": all_opps, "count": len(all_opps)})


@app.route("/api/personalize", methods=["POST"])
def personalize():
    """Generate personalized scripts for all opportunities given a user profile."""
    data    = request.json
    profile = data.get("profile", {})
    opps    = data.get("opportunities", [])
    if not opps or not profile:
        return jsonify({"scripts": {}})
    scripts = generate_personalized_scripts(profile, opps)
    return jsonify({"scripts": scripts})


@app.route("/api/chat", methods=["POST"])
def chat():
    """Streaming chat endpoint — AI answers questions about an opportunity."""
    data        = request.json
    profile     = data.get("profile", {})
    opportunity = data.get("opportunity", {})
    messages    = data.get("messages", [])   # [{role, content}, ...]
    user_msg    = data.get("message", "")

    name      = profile.get("name", "the student")
    major     = profile.get("major", "their field")
    interests = ", ".join(profile.get("interests", [])) or "various topics"

    system = f"""You are OpporTune, a friendly and knowledgeable career guide.
You are helping {name}, a {major} student interested in {interests}.

Currently discussing this opportunity:
Title: {opportunity.get('title', 'N/A')}
Type: {opportunity.get('type', 'N/A')}
Date/Deadline: {opportunity.get('deadline', 'N/A')}
Location: {opportunity.get('location', 'N/A')}
Details: {opportunity.get('raw_summary', '')}
Source: {opportunity.get('source_url', '')}

Be conversational, warm, and concise (2-4 sentences per reply).
Give practical, specific advice relevant to their background.
If they ask about applying, eligibility, or relevance — answer directly."""

    # Build conversation history
    history = []
    for m in messages[-6:]:  # keep last 6 messages for context
        role    = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})

    full_prompt = system + "\n\nConversation so far:\n"
    for m in messages[-6:]:
        full_prompt += f"{m['role'].upper()}: {m['content']}\n"
    full_prompt += f"\nUSER: {user_msg}\nAssistant:"

    def generate():
        try:
            for chunk in gemini.generate_content(full_prompt, stream=True):
                if chunk.text:
                    yield f"data: {json.dumps({'text': chunk.text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'text': f'Sorry, I hit an error: {e}'})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/calendar/add", methods=["POST"])
def add_to_calendar():
    data           = request.json
    title          = data.get("title", "Opportunity")
    deadline       = data.get("deadline", "")
    location       = data.get("location", "")
    summary        = data.get("personalized_script") or data.get("raw_summary", "")
    source_url     = data.get("source_url", "")
    reminder_min   = data.get("reminder_minutes", 1440)

    event_date = None
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            event_date = datetime.strptime(deadline.split(" - ")[-1].strip(), fmt)
            break
        except Exception:
            continue
    if not event_date:
        event_date = datetime.now()

    event_body = {
        "summary": title,
        "location": location,
        "description": f"{summary}\n\nSource: {source_url}",
        "start": {
            "dateTime": event_date.replace(hour=9, minute=0, second=0)
                                  .strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "America/New_York",
        },
        "end": {
            "dateTime": event_date.replace(hour=10, minute=0, second=0)
                                  .strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "America/New_York",
        },
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": reminder_min}],
        },
    }
    try:
        svc     = get_calendar_service()
        created = svc.events().insert(calendarId="primary", body=event_body).execute()
        return jsonify({"success": True, "event_id": created.get("id"),
                        "link": created.get("htmlLink")})
    except HttpError as e:
        return jsonify({"success": False, "error": str(e)}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"Oppor Tune running at http://localhost:{port}")
    app.run(debug=True, port=port)
