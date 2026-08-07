# CADENCE Report — Physics Wallah Vidyapeeth

A client-side (no-build) reporting dashboard for tracking **counselling cadence** — daily **1-1 & Training meetings** and **audits** submitted by counsellors / center leads (CL), rolled up by Branch Heads (BH), Regional Center Leads (RCL), Regional Branch Heads (RBH) and Administrators.

**Every feature is front-end only.** There is no backend server. All data lives in **Google Sheets** and is read/written through **Google Apps Script web apps**.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no bundler) |
| Charts | Chart.js 4.4.0 (CDN) |
| Icons | Font Awesome 6.5.0 (CDN) |
| Fonts | Inter (Google Fonts) |
| "Database" | Google Sheets (published CSV endpoints) |
| "API" | Google Apps Script Web Apps (deployed with "Anyone" access) |
| Session / persistence | `localStorage` |
| Hosting | GitHub Pages (`.github/workflows` Jekyll action just copies static files) |

---

## 2. Architecture at a Glance

```
┌─────────────────────────────┐
│  Browser (static site)      │
│  login.html → index.html    │
│  settings.html              │
└──────────────┬──────────────┘
               │
        ┌──────┴───────────────┐
        │   Google Sheets      │
        │  (published CSV)     │
        └──────┬───────────────┘
               │
        ┌──────┴──────────────────────────┐
        │  Google Apps Script Web Apps    │
        │  · form-submit.gs  (POST/GET)   │
        │  · otp.gs           (POST + GET)    │
        └─────────────────────────────────┘
```

There is no CORS preflight problem because:
- Sheet CSV fetches are plain `GET` (`Access-Control-Allow-Origin: *` is served by Google).
- Apps Script POSTs use `Content-Type: text/plain` (a "simple" request, no OPTIONS preflight) with a JSON string body.

---

## 3. Repo Structure

| File | Purpose |
|---|---|
| `index.html` | Main dashboard: Summary tab (filters, KPIs, summary table, charts, org tree) + inline Counselling form tab |
| `script.js` | All dashboard logic: org-data building, role-based visibility, filters, charts, summary table, recent activity, top/bottom performers |
| `style.css` | Dashboard + shared styles (theme variables) |
| `login.html` / `login.js` / `login.css` | Login, forgot-password (OTP), reset-password flows |
| `users.js` | **User database layer** — fetches sheets, builds users, authenticates, OTP send/verify, password change |
| `settings.html` / `settings.js` / `settings.css` | Appearance, profile, notifications, security (password change w/ OTP), language/region, data storage & export/import |
| `counselling-form.html` | Standalone copy of the counselling form (older duplicate; the live form is inside `index.html`) |
| `counselling-form.js` | Form logic: dropdowns, validation, IST timestamps, POST to Apps Script |
| `otp.gs` | Apps Script web app: OTP send/verify (Sheet2 column H) + password rewrite in Sheet2; answers GET and POST |
| `assets/pw-logo.svg` | Logo |
| `.github/workflows/` | GitHub Pages deployment (Jekyll action, works fine for static files) |

> ⚠️ `counselling-form.html` is a legacy duplicate. `index.html` contains the same form inline. Keep both in sync if you edit the form markup, or remove the standalone file.

---

## 4. The Google Sheets Backend

### 4.1 Hierarchy / Users Sheet (Sheet1) — `SHEET_CSV_URL` (in `users.js`)

Published as CSV. One row per **center** with columns (used by code):

| Column | Meaning |
|---|---|
| `mail_id` | Email of the CL/CM at that center |
| `employee_type` | `CL`, `CM` (→ CL), `BH`, `RCL`, `RBH`, `ADMIN` |
| `Region` | Region name |
| `Center` | Center name |
| `RBH` | Email of Regional Branch Head over this row |
| `RCL` | Email of Regional Center Lead |
| `BH` | Email of Branch Head |
| `Vertical` | (optional, carried along) |

Published CSV URL format:
`https://docs.google.com/spreadsheets/d/e/<SHEET_ID>/pub?output=csv`

### 4.2 Roles & Passwords Sheet (Sheet2) — `SHEET2_CSV_URL`

Separate tab (gid `1181913691`) that is the **source of truth for login**:

| Column | Meaning |
|---|---|
| `mail_id` | Allowed login email |
| `role` | `admin` / `rbh` / `rcl` / `bh` / `cl` |
| `password` | Password for that id |
| `H` (8) | **OTP code** (written by `otp.gs` on every send, cleared after password change) |
| `I` (9) | **OTP sent-at timestamp** (used for the 5-minute expiry check) |

**Strict-login rule (important):** when Sheet2 has rows, **only emails listed in Sheet2 can log in**. Hierarchy emails that exist only in Sheet1 are removed from the user DB. So Sheet1 defines *who is in the org chart*, Sheet2 defines *who can log in and with what role/password*.

### 4.3 Form Responses Sheet (Sheet3)

Written by the Apps Script `sheet-form-submit.gs`. Columns used by the dashboard:

| Column | Meaning |
|---|---|
| `Form Type` | `Audits` or `1-1 & Training` |
| `Submitted By` | Email of the person who submitted |
| `Submitted At` | ISO timestamp (IST, `+05:30`) |
| `Audit Date` / `Meeting Date` | `dd/mm/yyyy` (for the summary table) |
| `Region (Audit)` / `Region (1-1)` | Region name (for charts) |
| `Center (Audit)` / `Center (1-1)` | Center name (for activity feed) |

---

## 5. Google Apps Script Endpoints

Both are configured as **constants at the top of the JS files**. If the Apps Script web app is ever re-deployed (new `/exec` URL), these MUST be updated:

| Constant | File | Used for |
|---|---|---|
| `FORM_CONFIG.WEBAPP_URL` | `counselling-form.js` | POST new form responses |
| `SUMMARY_CONFIG.WEBAPP_URL` | `script.js` | GET `?action=responses` → JSON list of all responses |
| `OTP_MAIL_ENDPOINT` | `users.js` | POST `{action:'send', email, otp, purpose}`, `{action:'verify', email, otp}`, `{action:'updatePassword', email, newPassword, otp}` |

The OTP web app (`otp.gs`, repo root) answers **both GET and POST** with the same actions:

- `send` → writes the OTP into **Sheet2 column H** (timestamp in column I) next to the email, then emails it.
- `verify` → checks the OTP against Sheet2 column H (5-min expiry via column I).
- `updatePassword` → (optional OTP cross-check against H) **rewrites the password column in Sheet2**, then clears the used OTP.
- GET form: `?action=send&email=…&otp=…` etc. (POST is preferred; GET is handy for testing / status: `?action=status`).

Expected Apps Script behaviors (based on how the frontend calls them):

1. **Form submit** — `POST` body = `JSON.stringify({formType, meetingRegion, ..., submittedBy, submittedAt})`. Returns `{success:true}` (JSON) on success.
2. **Responses fetch** — `GET ?action=responses` returns `{success:true, data:[{...row per response...}]}`.
3. **OTP mail** — `POST` `{action:'send', email, otp, purpose}` sends an email from the Apps Script owner's Gmail; `{action:'verify', ...}` marks the OTP-log row as verified (optional; the local OTP check works without it).

---

## 6. Auth Flow (`login.html` + `users.js`)

1. User submits email + password.
2. `buildUsersDatabase()` is built from **Sheet1** (hierarchy) → overridden by **Sheet2** (roles + passwords) → **Sheet2 strict login** filters out non-listed emails → **localStorage `cadence-users`** password overrides applied last (manually-changed passwords win).
3. `authenticateUser(email, password)` checks `users[email].password === password`.
4. On success a session object is saved to `localStorage['cadence-session']`:

```js
{
  email, name, role, region, vertical, center,
  rcl, bh, rbh,           // manager emails from the sheet
  isDefaultPassword,      // true until changed
  loginTime               // ISO; login page auto-redirects if < 24h old
}
```

### Forgot / change password (OTP)

- `generateOTP()` → 6-digit random code.
- `sendOTP()` stores the OTP locally (`cadence-otp`) AND calls the Apps Script mail endpoint, which also writes the OTP into Sheet2 column H.
- `verifyOTP()` checks locally, enforces **5-minute expiry**, clears it, then notifies the mail script (server-side verify checks Sheet2 H).
- `changeUserPassword()` writes the new password into `localStorage['cadence-users']` (per-user override) **and** calls the web app's `updatePassword` action so the password is **rewritten in Sheet2** — the sheet stays the source of truth. If the sheet sync fails, a `warning` is returned and surfaced as an info toast.

> 🔐 **Security note:** passwords are stored in plain text (sheet + localStorage). This is acceptable only for an internal tool; do not reuse these patterns for anything public.

---

## 7. Role Hierarchy & Data Visibility (`script.js`)

### 7.1 Roles

```js
ROLES = {
  admin: { level: 5, label: 'Admin', canSee: 'everything' },
  rbh:   { level: 4, label: 'RBH',   canSee: 'all_rcl_bh_cl' },
  rcl:   { level: 3, label: 'RCL',   canSee: 'bh_cl_only' },
  bh:    { level: 2, label: 'BH',    canSee: 'own_centers' },
  cl:    { level: 1, label: 'CL',    canSee: 'own_center_only' }
};
```

### 7.2 Who sees what (`getVisibleData`)

| Role | Can see |
|---|---|
| **CL** (level 1) | Only their own center |
| **BH** (level 2) | Their own BH's centers |
| **RCL** (level 3) | Their managed BHs (from `managedBHs` or region RCL → BH links) |
| **RBH** (level 4) | Their managed BHs + managed RCLs, restricted to their region |
| **Admin** (level 5) | Everything |

### 7.3 Org tree building

`updateTeamList()` groups CLs under **BH** and **RCL** nodes, which sit under an **RBH** node. Each node shows:

- `Team` — count of people below (subtree emails)
- `Forms` — total forms by the subtree
- `Audits` / `1-1` — split of those forms

Counts come from `_formCountByEmail` (rebuilt from the current unit + date filtered rows on every filter change, so the tree follows the top filters).

---

## 8. Dashboard Logic (`script.js`)

### 8.1 Filter cascade

`Region → BH → RCL → Center → CL`, implemented by `onFilterChange()`:

- Choosing a region repopulates BH/RCL/Center/CL dropdowns.
- Single-option dropdowns are auto-selected (`autoSelectOrShow`).
- Filters **locked by role** are disabled (`applyRoleRestrictions`), e.g. a BH can never change Region or BH.

### 8.2 Unified top filters

The **top filter bar** — `customStartDate` / `customEndDate` + Region / BH / RCL / Center / CL — drives **every** dashboard block. All blocks re-render on any filter change (and on date changes) via `refreshAllFromFilters()`, which reads the filter state once through `getTopFilterState()` and reuses a cached copy of the raw response rows (`_summaryCache`), so no re-fetch is needed:

- **Summary table** — role-based visible emails (`getSummaryVisibleEmails`) ∩ rows passing the unified row filter (`rowMatchesUnifiedFilters`, unit + date).
- **KPI cards, trend/region charts, Top/Bottom 10** — row-level filtering via `rowMatchesUnifiedFilters` (date + unit scope).
- **Cadence overview chart** — same unified row filter applied per row.
- **Recent activity** — respects the unit scope (Region/BH/RCL/Center/CL) but is inherently "today", so the date range is not applied.
- **Org-tree form counts** (`_formCountByEmail`) — rebuilt from unit + date filtered rows.

`rowMatchesUnifiedFilters(row)` maps a row to the hierarchy using:
- Date — the row's `Audit Date` / `Meeting Date`.
- Region — the row's own `Region (Audit)` / `Region (1-1)` field (fallback: submitter's Sheet2 region).
- BH / RCL — the submitter's Sheet2 `BH` / `RCL` (fallback: the row's center name → Sheet2 mapping).
- Center — the row's center (or submitter's center) matching the selected center's name.
- CL — the submitter email equals the selected CL.

The default date range is month-to-date (`1st of current month → today`), set by `initCounsellingSummary`; empty date fields mean "no date filter".

### 8.3 KPI cards (custom dashboard)

| KPI | Meaning |
|---|---|
| Filtered Submissions | Rows in the current unit scope (Region/BH/RCL/Center/CL) **and** within the start/end date range |
| Overall Submissions | Rows in the current unit scope, any date |
| MTD Submissions | Rows in the current calendar month within the unit scope |
| Members (BH+CL+RCL+RBH) | Distinct roles among the date-filtered rows |
| Submitted by Me | Rows submitted by the logged-in user **within the filter scope** (unit + date) |
| 1-1 Meetings Done by Me | The logged-in user's `1-1 & Training` rows within the filter scope |
| Audits Done by Me | The logged-in user's `Audits` rows within the filter scope |

### 8.4 Charts

1. **Daily Form Submissions Trend** (`customTrendChart`) — line chart of audits vs 1-1 per day within the unified filter scope.
2. **Region-Wise Form Submissions** (`customRegionChart`) — bar chart of filtered submissions per region; **when a Region filter is set it switches to center-wise** (one bar per center in that region) and the card title changes to "Center-Wise Form Submissions".
3. **Cadence Overview** (`cadenceChart`) — monthly/weekly/quarterly lines:
   - Region Audits, Region 1-1 & Training
   - "Me" (current user's submissions)
   - "Selected BH/RCL/CL" (whichever filter is set)
4. **Top / Bottom 10 Performers** — users with roles `BH/CL/RCL/CM`, ranked by submissions within the unified filter scope (MTD shown too).

### 8.5 Recent Activity

Lists today's submissions (from `Submitted At`) newest-first, max 10, within the current unit scope, with avatar, action text, center, and relative time (`getTimeAgo`).

---

## 9. Counselling Summary Table (the core report)

Fetched from `SUMMARY_CONFIG.WEBAPP_URL + '?action=responses'`, then processed in `processResponses()`.

### Visibility (`getSummaryVisibleEmails`)

- **Admin:** every email.
- **RBH:** everyone whose RBH = session email (also via BH chains).
- **RCL:** everyone whose RCL = session email.
- **BH:** everyone whose BH = session email.
- **CL:** only themselves.

### Columns computed per user

| Column | Formula |
|---|---|
| No of Audits | count of `Audits` rows |
| Audits Daily Avg | `auditsTotal / max(1, distinct audit dates)` |
| Audit Status (Day) | BH ≥ 2/day, CL ≥ 4/day, RCL ≥ 3/day → `On Track`, else `Off track` |
| Audits Weekly Avg | `past audits / distinct past weeks` (current week excluded) |
| Audit Status (Week) | BH ≥ 12/wk, CL ≥ 24/wk, RCL ≥ 18/wk → `On Track` |
| No of Meetings | count of `1-1 & Training` rows |
| 1-1 Daily Avg | `meetingsTotal / max(1, distinct meeting dates)` |
| 1-1 Status (Day) | BH ≥ 1/day, CL ≥ 1/day, RCL ≥ 2/day → `On Track` |
| 1-1 Weekly Avg | `past meetings / distinct past weeks` |
| 1-1 Status (Week) | BH ≥ 6/wk, CL ≥ 6/wk, RCL ≥ 12/wk → `On Track` |

Notes:
- Weeks use **ISO week numbers starting Monday** (`getISOWeekString`).
- The **current week is excluded** from weekly averages (so the "past week" is a complete week).
- Dates are parsed flexibly: `dd/mm/yyyy` or ISO (`parseDateFlexible`).
- The From/To date inputs default to **first of current month → today**.
- **Responsive table:** the **Email** and **Role** columns are frozen (sticky) and stay visible while the rest of the table scrolls horizontally inside the card on narrow screens (`min-width: 1420px` on the table, `overflow-x: auto` on the card). Headers wrap (`white-space: normal`) and the frozen columns use opaque backgrounds + a 2px separator on the Role column.

---

## 10. Counselling Form (`counselling-form.js`)

Two form types:

### 1-1 & Training
- Region, Center, Meeting Date, Meeting Type (`One on One` / `Team Meet`), Attendees (comma-separated emails, validated), Discussion Summary/MOM, Recording Link.

### Audits
- Region, Center, Audit Date, Lead Link, Counsellor Email (validated), Audit Remarks, Audit Score (`Good` / `Average` / `Below Average`).

### Behavior
- Region/Center dropdowns come from the sheet (`buildFormOrgData`); a user's role restricts which region/center they can pick (`prefillUserData`) — CLs get their own center locked, admins get all.
- Dates default to **today**.
- Submission payload:

```js
{
  formType, ..., submittedBy: session.email,
  submittedAt: getISTTimestamp()   // ISO with +05:30, e.g. 2026-08-07T18:30:00+05:30
}
```

- Sent via `sendToWebApp()`: `POST` with `Content-Type: text/plain` to avoid CORS preflight.
- Success shows an inline success panel; failures show a toast.

---

## 11. Settings Page (`settings.js`)

| Section | What it does (persisted to localStorage) |
|---|---|
| Appearance | 5 themes: `dark, light, blue, green, purple` → `cadence-theme` on `<html data-theme>` |
| Profile | Edit name (updates session), job title, phone |
| Notifications | Toggles (`cadence-notif*`), quiet hours + range |
| Security | Change password: **current password auth → send OTP → verify OTP → change** |
| Language & Region | language, date format, timezone, currency (stored, cosmetic) |
| Data | Storage meter, clear cache (keeps session/theme/prefs), export CSV/JSON (CSV is demo), import (demo), delete account (clears localStorage) |

---

## 12. Setup / Configuration Checklist

For a fresh copy of this project:

1. **Sheets** — make sure the hierarchy sheet and Sheet2 are *Published to the web as CSV* and the URLs in `users.js` (`SHEET_CSV_URL`, `SHEET2_CSV_URL`) point to them. (Sheet2 `gid` in the URL must match the roles tab.)
2. **Apps Script web apps** — deploy `sheet-form-submit.gs` and `otp.gs` (repo root) with **"Anyone" access**, paste the `/exec` URLs into:
   - `counselling-form.js` → `FORM_CONFIG.WEBAPP_URL`
   - `script.js` → `SUMMARY_CONFIG.WEBAPP_URL`
   - `users.js` → `OTP_MAIL_ENDPOINT`
3. **Admins** — either add emails to `ADMIN_EMAILS` in `users.js` or mark `employee_type = ADMIN` in Sheet1, or `role = admin` in Sheet2.
4. **Default password** — `DEFAULT_PASSWORD` (`Acer@1234`) is a fallback for users without an explicit Sheet2 password.
5. **Deploy** — push to `main`; GitHub Actions deploys to GitHub Pages.

---

## 13. Local Development

No build step. Any static server works:

```bash
# Python
python3 -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080/login.html`. (Opening `file://` directly usually works too, but a server is safer for fetch calls.)

---

## 14. Known Limitations / TODOs

- **PDF / Excel export** in Settings are stubs ("coming soon"); CSV export is a demo placeholder.
- **Import** in Settings is a demo (no real file parsing).
- **Passwords are plain text** — fine for an internal tool, not for production auth.
- `counselling-form.html` duplicates the form markup already inside `index.html`.
- `reafdme.md` is a leftover typo file (junk content).
- All thresholds (daily/weekly averages per role) are hardcoded in `processResponses()` — change them there if business rules change.
- Summary table and activity/charts fetch the **full** response set on every load (no pagination).

---

## 15. Quick Debugging Tips

- Open the browser console: login and dashboard print styled `%c CADENCE ... Loaded` banners.
- Sheet fetch failures fall back to `localStorage` caches (`cadence-sheet-data`, `cadence-sheet2-data`).
- If OTP mail doesn't arrive, check the Apps Script execution log (`otp.gs`) and spam folder; the OTP is also printed to the browser console as a dev fallback.
- If submissions "succeed" but don't appear: confirm `action=responses` returns the new rows and that `Submitted By`/dates match the visibility rules of the logged-in role.
