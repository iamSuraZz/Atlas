# UX PLAN
**Part F**

---

## 1. The test every screen must pass

Your §47, applied strictly. Every screen answers exactly **one** of:

`WHAT DO I DO NOW?` · `HOW AM I DOING?` · `WHAT CAN I PROVE?` · `WHERE AM I GOING?`

A screen answering two is doing too much and gets split. A screen answering none gets deleted.

## 2. Navigation — six items, flat

```
TODAY      what do I do now            ← default, the app opens here
SKILLS     how am I doing
PROJECTS   my systems + deep dives
INTERVIEW  practice + real loop records
CAREER     target, résumé, evidence, JDs
JOURNAL    decisions, incidents, reviews
```

No nested navigation. No settings in the sidebar (⌘K or avatar menu). Command palette (⌘K) for everything — start a mission, log evidence, record a decision, jump to a skill.

Rejected: a dashboard that aggregates all six. Aggregation dashboards optimise for *feeling informed*, which is the opposite of acting. TODAY is the dashboard.

## 3. Screens

### 3.1 TODAY — the whole product in one screen

```
┌──────────────────────────────────────────────────────────────┐
│  Thursday, 18 September        NORMAL ▾        ⌘K            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  PRIMARY                                      25 min   │  │
│  │                                                        │  │
│  │  Why does this query do a sequential scan?             │  │
│  │  postgres / indexing · DEBUG                           │  │
│  │                                                        │  │
│  │  Last reviewed 11d ago · Blocks 3 skills incl.         │  │
│  │  system-design/scalability · Confidence 2/5 last time  │  │
│  │                                                        │  │
│  │                                    [  Start  →  ]      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  THEN                                                        │
│  ○  Explain idempotency to a PM          EXPLAIN     10 min  │
│  ○  Two-pointer: container with most water  BUILD    20 min  │
│  ○  Review: React reconciliation          REVIEW      8 min  │
│  ○  Design: rate limiter for a public API  DESIGN    25 min  │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│  88 min planned  ·  Month 2: PostgreSQL + backend            │
└──────────────────────────────────────────────────────────────┘
```

Decisions, and why:

- **One primary, the rest collapsed.** Five equal cards produce a choice; a choice produces delay.
- **The "why" is always visible on the primary.** Not a tooltip, not an expander. It is the motivation mechanism and it is free.
- **Intensity is one control in the header.** Changing it regenerates instantly.
- **No streak. No XP. No backlog count.** Nothing on this screen grows while you are away.
- **No progress bar for the day.** A 4/5 bar at 11pm creates pressure to do a bad fifth mission.
- After completion: *"Done for today."* Same words for LIGHT, NORMAL and DEEP.

### 3.2 Mission runner

Full-screen, chrome removed. Left: brief and context. Right: work surface — editor, SQL console, text area, or recorder depending on format. Timer visible but not counting down aggressively (elapsed, not remaining — remaining creates panic).

On submit: objective result first if one exists (tests, query plan, correct answer), then rubric feedback, then **one** specific next action. Not a wall of feedback. One thing.

Then a 5-second reflection: confidence 1–5, one optional line. This feeds the scheduler and takes almost no time — which is why it actually gets done.

### 3.3 SKILLS

Default view: **the weak list, not the graph.** A force-directed graph of 90 nodes is beautiful and useless for deciding what to do.

```
NEEDS WORK
  postgres / transactions      DEVELOPING    last: 12d    ▸
  testing / integration        INTRODUCED    last: 5d     ▸
  distributed / consistency    UNASSESSED    —            ▸

MOVING
  postgres / indexing          PRACTICAL ↑   3 evidence   ▸
  typescript / generics        PRACTICAL ↑   5 evidence   ▸

SOLID
  react / hooks                INTERVIEW_READY            ▸
```

The graph view exists behind a toggle, for the one genuine use: seeing what a skill unblocks.

Skill detail shows state, the **evidence chain** (every artifact that justified the current level), the audit history of transitions, next review date, and — most importantly — **exactly what would raise it**: *"Needs 1 objective artifact. Suggested: optimise a real query and record before/after."*

### 3.4 PROJECTS

Per project: the knowledge base (facts, decisions, trade-offs, incidents), the classification badge, and a single prominent action — **Start deep dive**.

Post-session: what you answered well, where you were vague, which questions you could not answer, and which of those became missions. Strong answers get a one-click **Save to story bank**.

### 3.5 INTERVIEW

Two halves, deliberately: **Practice** (simulator modes) and **Real** (actual loops, outcomes, post-mortems).

The readiness matrix renders as 13 rows, never one number:

```
CATEGORY            STATE             EVIDENCE   LAST    RAISE IT BY
System Design       PRACTICAL         8          3d      2 mocks on unfamiliar domains
DSA                 DEVELOPING        41         1d      Graphs — 4/9 failed
Project Deep Dive   INTERVIEW_READY   12         2d      —
Behavioural         INTRODUCED        3          14d     Build story bank to 20
```

Practice results show `PRACTICAL` at most. `INTERVIEW_READY` requires a real loop, and the UI says so where you'd expect the upgrade. This is the honest-readiness requirement made visible rather than merely promised.

### 3.6 CAREER

Target, positioning, résumé, evidence ledger, JDs.

The résumé editor is the most opinionated surface: every bullet shows its evidence chain, and bullets with unsupported metrics render a visible **`[NEEDS EVIDENCE]`** marker that cannot be dismissed — only resolved by linking evidence or removing the claim. The app will not write a number it cannot source.

### 3.7 JOURNAL

Fast entry — under 60 seconds, ⌘K-reachable. Decision, incident, learning, reflection.

The distinguishing feature: **revisits.** A decision logged today resurfaces at +30 and +90 days asking "was it right?" Almost nothing else does this, and calibration is a genuine senior skill.

Weekly and monthly reviews live here.

## 4. Design direction

Premium tool, not LMS. Reference points: Linear, Vercel dashboard, Things. Anti-references: Duolingo, Coursera, anything with a mascot.

| | |
|---|---|
| Base | Dark-first. `#0A0A0B` background, `#111113` surfaces, `#1C1C1F` raised |
| Text | `#F5F5F7` primary, `#A1A1A8` secondary, `#6E6E76` tertiary |
| Accent | **One.** Amber `#E8A33D` — used only for the primary action and state transitions. Scarcity is what makes it read as important |
| Semantic | Green for objective pass, red for fail, blue for informational. Never for decoration |
| Type | Inter (UI), JetBrains Mono (code, metrics, timers). Generous scale: 13/15/18/24/32 |
| Density | Spacious. This is a focus tool, not an admin panel |
| Motion | 150ms ease-out, transitions only. No celebratory animation, no confetti |
| Radius | 8px cards, 6px controls |

Mastery states use a consistent visual language everywhere — a 6-segment bar with the earned segments filled, so the state reads at a glance without a legend.

**Light theme** ships from day one, properly. Not an afterthought.

## 5. Responsive

| | Desktop | Tablet | Mobile |
|---|---|---|---|
| Today | Full | Full | Full |
| Mission: EXPLAIN, REVIEW, TEACH, DEFEND | ✅ | ✅ | ✅ |
| Mission: BUILD, QUERY, READ_CODE | ✅ | ⚠️ | ❌ *"Needs a keyboard — saved for later"* |
| Interview | ✅ | ✅ | ✅ |
| Skills, Evidence, Journal | ✅ | ✅ | ✅ read + quick add |
| Résumé editor | ✅ | ⚠️ | ❌ |

Mobile is for review, explanation drills, evidence capture and journal entries — the things you do in ten spare minutes. It refuses code missions honestly rather than offering a bad version.

## 6. Accessibility

Radix primitives via shadcn handle dialogs, menus, tabs and focus trapping. What needs explicit work:

- **Mission runner keyboard flow**: `⌘⏎` submit, `Esc` exit with confirm, `Tab` order verified manually
- **Streaming AI output** in an `aria-live="polite"` region, with a "response complete" announcement — otherwise screen readers get an unreadable stream
- **Timers** must not be the only signal for anything
- **AA contrast in both themes**, verified in CI with an automated check
- Visible focus rings, never removed
- Every form input labelled; errors associated via `aria-describedby`
- `prefers-reduced-motion` respected

## 7. Copy rules

| Never | Instead |
|---|---|
| "Great job! 🎉" | "Done for today." |
| "You're on fire! 12-day streak!" | (nothing — streaks don't exist) |
| "You've mastered PostgreSQL!" | "postgres/indexing → PRACTICAL. 3 evidence items." |
| "You're ready for Google!" | "System design: PRACTICAL. To reach INTERVIEW_READY: 2 mocks in unfamiliar domains." |
| "You missed 4 days!" | (nothing — the plan is just smaller) |
| "Keep it up!" | (nothing) |

Tone: a competent senior colleague. Direct, unsentimental, never disappointed in you. Credit is specific or absent; there is no generic praise anywhere in the product, because generic praise from software is worthless and both of us know it.
