# Paveer System Health

A production-ready status page that monitors uptime for **[paveer.com](https://paveer.com)**, logs incidents via Betterstack, and notifies users when the system goes down or recovers.

**Public repository:** https://github.com/sisikelelwegomo/Paveer-System-Health

---

## What this monitors

This system performs continuous uptime checks against **https://paveer.com** and reports:

- Current system status (Operational / Degraded / Down)
- Historical incidents from the past 24 hours, with timestamps and descriptions
- Real-time recovery status when paveer.com comes back online

---

## Features

- HTTP uptime monitoring for https://paveer.com on a configurable interval
- Automatic incident creation and updates in Betterstack
- Public status page showing current status and recent incident history
- Email alerts (DOWN and RECOVERED) with timestamps via EmailJS
- Failure simulation support for testing detection and logging end-to-end

---

## Tech stack

| Layer | Tool | Why |
|---|---|---|
| Status page UI | Next.js | Fast UI iteration, built-in API routes, deploys easily |
| Hosting | Vercel | Best-in-class Next.js support, straightforward CI/CD |
| Uptime monitoring | Betterstack | Free tier, built-in monitors, clean REST API |
| Incident management | Betterstack Incidents API | Source of truth for incident timelines and history |
| Email alerts | EmailJS | Send transactional emails for alerts |

> **Note on incident.io:** The original brief specified incident.io, but its API requires a paid Team plan. Betterstack provides equivalent incident management functionality (create, update, and close incidents with full timelines) on a free tier, making it the practical choice for this project.

---

## Architecture

```
+-------------------+
| End users         |
+---------+---------+
          | HTTPS
          v
+-------------------+        +--------------------+
| Next.js status UI  | -----> | Status API routes  |
| (public website)   |        | (/api/...)         |
+---------+---------+        +---------+----------+
                                        |
                    +-------------------+-------------------+
                    |                                       |
                    v                                       v
          +-------------------+                   +-------------------+
          | Betterstack       |                   | App storage       |
          | (incidents)       |                   | (optional cache)  |
          +---------+---------+                   +-------------------+
                    ^
                    | creates/updates incidents
      +-------------+-----------------------------+
      | Monitoring job (scheduled)               |
      | - HTTP checks → https://paveer.com       |
      | - state transitions + incident updates   |
      +-------------+-----------------------------+
                    |
                    v
          +-------------------+
          | EmailJS           |
          | (DOWN/RECOVERED)  |
          +-------------------+
```

### Data flow

1. Monitoring job runs every `CHECK_INTERVAL_SECONDS` and performs an HTTP check against https://paveer.com
2. Results map to a status:
   - **Operational** — checks succeed within SLO threshold
   - **Degraded** — high latency or intermittent errors
   - **Down** — repeated failures or hard timeouts
3. On state change:
   - Incident created or updated in Betterstack (start time, impact, description)
   - Email sent via EmailJS with timestamp and status change
4. Status page reads incident data from Betterstack API and renders current state + incident history

### Reliability design

- **Flap prevention** — requires N consecutive failures before marking DOWN, and N consecutive successes before marking RECOVERED
- **Idempotency** — monitoring job stores the active incident ID so re-runs don't duplicate incidents
- **Observability** — lightweight log of check results and state transitions for debugging

---

## Local setup

### Prerequisites

- Node.js 18+
- A Betterstack account with an API key (free tier)
- An EmailJS account with a configured email service + template
- (Optional) A cron provider for scheduled monitoring in production

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/sisikelelwegomo/Paveer-System-Health.git
cd Paveer-System-Health

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Fill in your values in .env.local

# 4. Start the development server
npm run dev
```

The status page will be available at http://localhost:3000.

To run the monitoring job locally:

```bash
npm run monitor
```

---

## API keys required

This project needs three API keys. Here is what each one is, where to get it, and what it is used for:

### 1. Betterstack API key
- **What it is:** A personal API token that authenticates your app with the Betterstack Uptime API
- **Where to get it:** Log in to Betterstack → **Settings** → **API tokens** → **Create token**
- **What it does:** Allows the monitoring job to create, update, and fetch incidents programmatically
- **Permissions needed:** Read + Write access to Uptime
- **Environment variable:** `BETTERSTACK_API_KEY`

### 2. Betterstack Monitor ID
- **What it is:** The unique ID of the monitor you set up in Betterstack for https://paveer.com
- **Where to get it:** Betterstack dashboard → **Monitors** → click your paveer.com monitor → copy the ID from the URL or monitor detail page
- **What it does:** Ties incident creation to the specific paveer.com monitor
- **Environment variable:** `BETTERSTACK_MONITOR_ID`

### 3. EmailJS keys
- **What it is:** Credentials that allow the monitoring job to send DOWN and RECOVERED alert emails via EmailJS
- **Where to get it:** EmailJS dashboard → Email Services + Email Templates + Account keys
- **Environment variables:** `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`

> **Security reminder:** Never commit any of these keys to GitHub. Always store them as environment variables in your hosting platform (Vercel dashboard → Settings → Environment Variables).

---

## Environment variables

Create a `.env.local` file (or set these in your hosting platform):

```env
# Monitoring
MONITOR_TARGET_URL=https://paveer.com
CHECK_INTERVAL_SECONDS=60

# Betterstack
BETTERSTACK_API_KEY=your_betterstack_api_key
BETTERSTACK_MONITOR_ID=your_betterstack_monitor_id

# Email (EmailJS)
EMAIL_PROVIDER=emailjs
EMAILJS_SERVICE_ID=your_emailjs_service_id
EMAILJS_TEMPLATE_ID=your_emailjs_template_id
EMAILJS_PUBLIC_KEY=your_emailjs_public_key
EMAILJS_PRIVATE_KEY=your_emailjs_private_key
EMAIL_FROM=you@example.com
EMAIL_TO=alerts@example.com
```

A `.env.example` file with all required keys (no values) is included in the repository.

---

## Email notifications

Alerts are sent via EmailJS when paveer.com changes state:

- **DOWN email** — sent when the site fails N consecutive checks
- **RECOVERED email** — sent when the site passes N consecutive checks after being down

**Email format:**

- **Subject:** `Paveer System Health: DOWN` or `Paveer System Health: RECOVERED`
- **Body:** Monitored URL (https://paveer.com), timestamp, new status, link to incident in Betterstack

### EmailJS setup

1. Create an EmailJS account at https://www.emailjs.com
2. Add an Email Service (Gmail/Outlook/etc.) in EmailJS
3. Create an Email Template and note its Template ID
4. Copy the Service ID + Public Key (+ Private Key if strict mode is enabled) into your environment variables

---

## Simulating failures

To test the full detection and alerting pipeline:

```bash
# Simulate a DOWN event (point monitor at a failing endpoint)
MONITOR_TARGET_URL=https://paveer.com/simulate-down npm run monitor

# Or use the built-in failure simulator
npm run simulate:down

# Restore and trigger RECOVERED
npm run simulate:recover
```

**What to verify after a failure simulation:**

- Incident created in Betterstack with a start timestamp and description
- DOWN email received with correct timestamp
- Incident updated/closed in Betterstack with end timestamp and resolution note
- RECOVERED email received with correct timestamp

---

## Deployment

The status page is deployed to Vercel and publicly accessible at:

**https://status.sisikelelwegomo.com** *(fill in)*

### Deployment checklist

- [ ] Environment variables set in Vercel (not committed to the repo)
- [ ] Monitoring job scheduled (via Vercel Cron, GitHub Actions, or a cron provider)
- [ ] Status page is publicly reachable and returns HTTP 200
- [ ] Test DOWN → RECOVERED cycle verified on the live deployment

### Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Deliverables

| Item | Link |
|---|---|
| Live status page | *(fill in)* |
| Public GitHub repository | https://github.com/sisikelelwegomo/Paveer-System-Health |
| Incident log evidence | *(fill in — screenshot or Betterstack link)* |
| DOWN email example | *(fill in — screenshot with timestamp)* |
| RECOVERED email example | *(fill in — screenshot with timestamp)* |

---

## Betterstack API integration

The monitoring job uses three Betterstack API calls:

### Create an incident (site goes DOWN)
```js
POST https://uptime.betterstack.com/api/v2/incidents
Authorization: Bearer BETTERSTACK_API_KEY

{
  "name": "paveer.com is down",
  "summary": "HTTP check failed for https://paveer.com",
  "started_at": "2024-01-01T12:00:00Z"
}
```

### Update an incident (site RECOVERS)
```js
PATCH https://uptime.betterstack.com/api/v2/incidents/{incident_id}
Authorization: Bearer BETTERSTACK_API_KEY

{
  "resolved_at": "2024-01-01T12:30:00Z",
  "summary": "paveer.com recovered after 30 minutes"
}
```

### Fetch incidents (status page display)
```js
GET https://uptime.betterstack.com/api/v2/incidents
Authorization: Bearer BETTERSTACK_API_KEY
```

---

## References

- [Betterstack](https://betterstack.com) — uptime monitoring and incident management
- [Betterstack API docs](https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/) — REST API reference
- [EmailJS docs](https://www.emailjs.com/docs/) — email API documentation
- [paveer.com](https://paveer.com) — monitored target
