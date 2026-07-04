# Beck Recruiting — Football Recruiting Distribution Service

**Mission:** Get high school football athletes' complete recruiting profiles — film, measurables, GPA, SAT/ACT — in front of as many relevant college coaches as possible, use AI to personalize every touch, and prove to families that coaches actually saw it.

---

## 0. How This Fits the PTF / College Pathways Plan

Coach Beck's business plan (College Pathways by PTF) and this platform are **two halves of one business, not two businesses.** His plan sells trust, relationships, and truth-telling at boutique prices ($250 Truth Talk → $8k Full-Cycle Advocacy). Its stated constraint is **his time**. This platform is the leverage layer that removes that constraint without diluting the promise:

| PTF plan element | What this platform does for it |
|---|---|
| Tier 1 "Game Plan" target-school list | The AI matcher generates the realistic/reach/safety board in minutes; Coach Beck edits and blesses it. His judgment stays the product; the software does the drafting. |
| Tier 2 "Full-Cycle Advocacy" | His personal calls go to the 10–15 schools where his relationships are live. The platform runs the *other* 100+ realistic programs with AI-personalized email — so the boutique promise ("I work the phones for you") is backed by full-coverage distribution no competitor's call-center matches. |
| "Did anything actually happen?" (the #1 family anxiety) | The engagement dashboard — "Coach Smith at App State opened twice and watched film Thursday" — is the weekly proof-of-work artifact for every paying family. NCSA can't show this; it's the retention engine for a $6–10k engagement. |
| School/club B2B retainers | Whole-roster uploads → one campaign per athlete. Pure platform leverage on a single relationship sale. |
| Affiliate evaluators (Year 2–3 scaling) | Affiliates get platform seats: same coach database, same outreach engine, same dashboards, PTF branding. The platform *is* the franchise kit. |
| The coach database itself | Coach Beck's network keeps it honest (which emails are real, which coordinators actually read inbound) — a data-quality moat nobody scraping alone can match. |

**Strategic implication:** don't sell this as standalone software initially. Sell PTF's trust-first packages at premium prices; use the platform to (a) multiply how many families each hour of Coach Beck's time serves, and (b) generate the proof-of-engagement reporting that justifies the price. Software-as-product (selling seats to other advisors/schools) is the Phase 3 upside. His compliance lines apply verbatim here: flat fees only, never a % of scholarship/NIL, never guarantee placement, no paid clients until his coaching-role conflict clears (Aug 2026), and every outreach email is honest about who the athlete is — the platform enforces the "never invent numbers" rule in the AI composer's instructions.

## 1. The Product in One Paragraph

A family (or high school coach) uploads an athlete's profile: Hudl film link, verified measurables, academics, contact info. The service maintains a continuously-updated database of every college football coaching staff (FBS, FCS, D2, D3, NAIA, JUCO — ~900 programs, ~11,000 coaches). AI matches the athlete to realistic target schools, writes a personalized email to each relevant position coach / recruiting coordinator, sends it from a warmed-up sending domain, and tracks opens and film-link clicks so the family gets a dashboard: *"Coach Smith at App State opened your email twice and watched your film Thursday night."*

## 2. Why This Works (Market Reality)

- Recruiting exposure services (NCSA, SportsRecruits, FieldLevel) charge families **$500–$4,000+**. Most are CRM tools that make the *family* do the outreach. An AI-driven "we do the outreach for you, and prove delivery" service is a real differentiator.
- Coaches *can* receive recruiting materials at any time. NCAA contact rules restrict when **coaches** may initiate contact with recruits — there is no rule against an athlete/service sending film to a coach. Inbound film is how small-school rosters get built.
- The 2025–26 coaching carousel produced 5,000–11,000 staff changes per cycle. **Data freshness is the moat.** A stale email list bounces; a fresh one lands.

**Initial wedge:** target the under-served middle — D2/D3/FCS/NAIA-caliber athletes. FBS recruits get found anyway; the kid who belongs at a D3 school is the one nobody is emailing for.

## 3. Data Strategy — Building & Maintaining the Coach Database

This is the hard part and the core asset. No single free public API has every assistant coach's email. Use a layered approach:

### Layer 1 — CollegeFootballData API (free, public, implemented in this repo)
- `https://api.collegefootballdata.com` — free tier: 1,000 calls/month with an API key.
- `GET /teams` → every FBS/FCS program: school, mascot, conference, division, location, colors.
- `GET /coaches?year=YYYY` → head coaches with school history.
- Gives us the **school skeleton and head-coach layer**, kept current for ~2 API calls per sync.

### Layer 2 — Athletic-site staff directories (scraper, skeleton implemented)
- ~80% of college athletic sites run on Sidearm Sports with a predictable page shape (`/sports/football/coaches` or `/staff-directory/football`), listing every assistant with title and usually a `mailto:` email.
- Build one generic Sidearm adapter + per-site overrides. Re-crawl monthly, and immediately for any school where Layer 1 shows a head-coach change (staff turnover cascades).
- Respect robots.txt and rate-limit crawls; contact info published on a public staff directory is intended to be reached.

### Layer 3 — Commercial datasets (paid, buy-vs-build accelerator)
- ContactCollegeCoaches.com (~$100–200 one-time, ~10,400 contacts, all 6 levels), collegesport.us (35k contacts, weekly updates). Buy one at launch to bootstrap, then let Layers 1–2 + bounce feedback keep it fresh.

### Layer 4 — Feedback loops (free, compounding)
- Every hard bounce marks a contact stale → triggers a re-scrape of that school.
- Every reply confirms a contact is live (`last_verified_at`).
- AI-assisted verification: when a scrape is ambiguous, have Claude reconcile the scraped page against the existing record (name matching, title normalization, position-group tagging).

**Coach record:** school, name, title, normalized position group (QB/RB/WR/OL/DL/LB/DB/ST/RC), email, phone, Twitter/X, source, last-verified date. Position-group tagging matters: a RB's film goes to the RB coach + recruiting coordinator, not just a generic inbox.

## 4. How AI Gets Kids in Front of Coaches

1. **School fit matching.** Claude scores athlete ↔ school fit (level realism from measurables/academics, geography, roster need by position, academic fit from GPA/test scores) and produces a ranked target list of 50–150 realistic schools with rationale. Families see *why* each school is on the list.
2. **Personalized outreach at scale.** One email per coach, written by Claude: references the coach by name and title, the program (conference, scheme, geography), leads with the 2–3 numbers that matter for that position, links film high in the message, includes academics (GPA/SAT/ACT matter enormously at D3/Ivy/NESCAC — high-academic schools get the academic-forward version). Short — coaches read on phones. Volume runs go through the **Batches API at 50% cost**.
3. **Film intelligence (phase 2).** Parse Hudl metadata; generate a "scouting blurb" (e.g. "4.6 forty on verified laser timing; 22 pancakes as a junior") so the subject line and first sentence carry substance, not spam.
4. **Reply triage.** Classify coach replies (interested / needs transcript / camp invite / not a fit / auto-reply) and alert the family with a suggested response. A coach reply is the conversion event — never let one sit.
5. **Freshness agent.** Scheduled job diffs staff directories against the DB, flags changes, drafts the updates for human approval.

## 5. Delivery & "Did They See It" Tracking

- **Open tracking:** unique 1×1 pixel per message (`/t/o/:token.gif`). Caveat honestly in the dashboard: Apple Mail Privacy Protection auto-fires opens, so opens are a *signal*, not proof.
- **Click tracking:** the film link in every email is a unique redirect (`/t/c/:token` → Hudl). **A film click is the money metric** — it can't be faked by a mail proxy and means a human engaged.
- **Reply detection:** inbound parse on the sending domain (Resend/SendGrid inbound webhook) → logged per message → family notification.
- **Deliverability discipline (this decides whether the business works):**
  - Dedicated sending domain (e.g. `mail.beckrecruiting.com`) with SPF, DKIM, DMARC; warm it up gradually.
  - One athlete's campaign = 50–150 sends spread over hours/days, not a blast.
  - Emails come "from" the athlete (reply-to athlete/family), sent via the platform — this is genuinely one-to-one correspondence, and reads that way.
  - CAN-SPAM: real physical address in footer, working opt-out, honor suppressions across all campaigns. A coach who opts out is suppressed forever, for every athlete.

## 6. Compliance Notes

- **NCAA:** sending materials *to* coaches is permitted at any time; contact-period rules bind the coach's response, not the athlete's outreach. Never impersonate the athlete deceptively — "sent on behalf of" via reply-to is clean.
- **NAIA/JUCO:** looser rules; same pipeline works.
- **Minors' data:** athletes are 14–18. Get parent/guardian consent at signup, minimize stored PII, don't sell data. COPPA applies under 13 (rare here but gate signup at 13+).
- **FERPA:** applies to schools, not us, but treat transcripts/GPA as sensitive: encrypt at rest, share only in the outreach the family requested.

## 7. Architecture (what's scaffolded in this repo)

```
src/
  db/            SQLite schema + migration (→ Postgres when multi-user)
  sync/
    cfbd.ts      CollegeFootballData sync (schools + head coaches)
    staffDirectory.ts  Generic Sidearm staff-page scraper (emails/titles)
  ai/
    composer.ts  Claude-written personalized coach emails (structured output)
    matcher.ts   Claude school-fit scoring for an athlete
  outreach/
    sender.ts    Provider-agnostic send (console for dev, Resend for prod)
    tracking.ts  Open-pixel + click-redirect token plumbing
  routes/        REST API: athletes, schools, coaches, campaigns, tracking, reports
```

- **Runtime:** Node 20+ / TypeScript / Fastify. SQLite via better-sqlite3 for zero-config dev; schema is portable to Postgres.
- **AI:** Anthropic SDK, `claude-opus-4-8`, adaptive thinking, JSON-schema structured outputs so email/matching responses are machine-safe. Falls back to a plain template when no API key is set, so the pipeline runs end-to-end in dev.
- **Email:** `EMAIL_PROVIDER=console` logs sends in dev; `resend` sends real mail.

## 8. Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — This repo** | Schema, CFBD sync, scraper skeleton, AI composer/matcher, send + open/click tracking, campaign API | End-to-end campaign runs locally |
| **1 — MVP (4–6 wks)** | Buy a contact dataset, run Sidearm scraper across FCS/D2/D3, Resend + domain warmup, simple family dashboard (Next.js), reply webhook | 5 real athletes campaigned; ≥40% open, ≥8% film-click, ≥1 coach reply each |
| **2 — Product (2–3 mo)** | Auth/multi-tenant (→ Postgres), Stripe ($299–499/season target), fit-ranked target boards, reply triage, freshness agent on cron, batch API for volume | 50 paying families; deliverability >97% |
| **3 — Scale** | HS coach team accounts (whole-roster uploads = distribution channel), camp/showcase matching, coach-side portal (search inbound athletes — flips the marketplace), SMS/Twitter DM channels | Coach-side pull > push |

**Go-to-market:** don't sell to families one at a time first — sell to **high school coaches and 7v7/showcase programs** who bring 20–60 athletes at once and lend credibility. They're also the verification layer for measurables.

## 9. Cost Envelope (MVP)

| Item | Cost |
|---|---|
| CFBD API | Free tier (1k calls/mo) covers sync easily |
| Contact dataset bootstrap | ~$150 one-time |
| Resend/SendGrid | ~$20/mo at MVP volume |
| Claude API | ~100 emails/athlete × ~1.5k tokens ≈ pennies per athlete; batch API halves it |
| Hosting (Fly/Railway/VPS) + domain | ~$10–25/mo |

Per-athlete marginal cost is a few dollars against a $300+ price point.

## 10. Honest Risks

1. **Deliverability collapse** if sending looks like spam → the pacing, warmup, and one-to-one framing above are non-negotiable.
2. **Coach fatigue / blowback** — quality gate every profile (real film, real measurables). A garbage profile burns the domain for everyone.
3. **Data staleness** — the carousel never stops; the freshness agent + bounce loop is a permanent job, not a one-time scrape.
4. **Incumbents** — NCSA has brand and coach relationships. Compete on "we actually send it, AI-personalized, and prove engagement," and on price.
