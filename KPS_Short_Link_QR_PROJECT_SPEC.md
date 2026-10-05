# KPS Short Link & QR Manager

> Project specification for Codex  
> Stack: GitHub Pages + Vite + Vanilla JavaScript + Google Apps Script + Google Sheets  
> Goal: Fast, free, lightweight URL shortener and dynamic QR code manager for school use.

---

## 1. Project Goal

Build a web application for:

- Shortening long URLs
- Generating QR Codes from short URLs
- Copying and downloading QR codes
- Updating destination URLs without changing the QR Code
- Viewing short-link history
- Tracking basic click statistics
- Enabling / disabling links
- Setting optional expiration dates
- Creating custom aliases
- Running almost entirely on free services
- Keeping page load and redirect performance as fast as possible

Primary use cases:

- Google Forms
- Google Drive files
- School announcements
- Worksheets
- Surveys
- Activity registrations
- Posters
- Classroom materials
- Internal school systems

---

# 2. System Architecture

```text
┌────────────────────────────────────┐
│          GitHub Pages              │
│                                    │
│ Vite + Vanilla JS + Tailwind CSS   │
│                                    │
│ - Create short links               │
│ - Generate QR Code                 │
│ - Dashboard                        │
│ - Link history                     │
│ - Statistics                       │
└──────────────────┬─────────────────┘
                   │
                   │ HTTPS / fetch
                   ▼
┌────────────────────────────────────┐
│       Google Apps Script API       │
│                                    │
│ - createLink                       │
│ - updateLink                       │
│ - disableLink                      │
│ - getLinks                         │
│ - getStats                         │
│ - resolveLink                      │
└──────────────────┬─────────────────┘
                   │
             CacheService
                   │
                   ▼
┌────────────────────────────────────┐
│          Google Sheets             │
│                                    │
│ - links                            │
│ - click_logs                       │
│ - settings                         │
└────────────────────────────────────┘
```

---

# 3. Design Principles

## 3.1 Static First

All UI must be served from GitHub Pages.

Google Apps Script must NOT be used to render the main web interface.

GAS is only a lightweight API and redirect service.

Benefits:

- Faster page loads
- Lower GAS execution usage
- Better scalability
- Easier deployment
- Lower latency for repeat visits

---

## 3.2 Client-Side QR Generation

QR codes should be generated entirely in the browser.

Recommended package:

```bash
npm install qrcode
```

Example:

```javascript
import QRCode from "qrcode";

await QRCode.toCanvas(canvas, shortUrl, {
  width: 512,
  errorCorrectionLevel: "M"
});
```

Do NOT call GAS or an external QR API to render QR images.

QR export formats:

- PNG
- SVG

Recommended QR sizes:

- 256 × 256
- 512 × 512
- 1024 × 1024

---

# 4. Recommended Project Structure

```text
kps-shortlink/
│
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── README.md
│
├── src/
│   ├── main.js
│   ├── app.js
│   │
│   ├── api/
│   │   └── gas-api.js
│   │
│   ├── pages/
│   │   ├── home.js
│   │   ├── links.js
│   │   ├── link-detail.js
│   │   └── dashboard.js
│   │
│   ├── components/
│   │   ├── navbar.js
│   │   ├── link-form.js
│   │   ├── link-card.js
│   │   ├── qr-modal.js
│   │   ├── stat-card.js
│   │   ├── toast.js
│   │   └── loading.js
│   │
│   ├── utils/
│   │   ├── qrcode.js
│   │   ├── clipboard.js
│   │   ├── validation.js
│   │   ├── date.js
│   │   └── storage.js
│   │
│   └── styles/
│       └── main.css
│
└── gas/
    ├── Code.gs
    ├── Config.gs
    ├── Links.gs
    ├── Redirect.gs
    ├── Stats.gs
    ├── Cache.gs
    └── Utils.gs
```

---

# 5. Google Sheets Database Design

Create one spreadsheet with three sheets.

---

## Sheet: links

Columns:

| Column | Field | Description |
|---|---|---|
| A | id | numeric internal ID |
| B | code | short code |
| C | alias | optional custom alias |
| D | target_url | destination URL |
| E | title | user-defined title |
| F | created_at | ISO date-time |
| G | updated_at | ISO date-time |
| H | expires_at | optional expiration |
| I | status | active / disabled / expired |
| J | clicks | cached total clicks |
| K | last_clicked_at | latest click |
| L | created_by | optional creator ID |

Example:

```text
1 | aB7x2 | math2569 | https://forms.gle/... | แบบทดสอบคณิตศาสตร์ | 2026-10-05T10:00:00 | ... | | active | 125 | ...
```

---

## Sheet: click_logs

Columns:

```text
timestamp
code
date
hour
referer
user_agent_group
```

Do NOT store sensitive personal information.

Do NOT store full IP addresses.

For normal school use, basic aggregate analytics is enough.

---

## Sheet: settings

Columns:

```text
key
value
```

Recommended values:

```text
APP_NAME            KPS Short Link
BASE_REDIRECT_URL   <GAS Web App URL>
DEFAULT_QR_SIZE     512
MAX_LINKS_RETURNED  100
CACHE_TTL_SECONDS   21600
```

---

# 6. Short Code Generation

Use Base62 characters:

```text
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
```

Recommended approach:

```text
numeric ID
    ↓
Base62 encode
    ↓
short code
```

Example:

```text
15284
↓
Base62
↓
3Yc
```

Advantages:

- No collision search
- Short code generation is deterministic
- No full-sheet scan
- Very fast

Recommended minimum visible code length:

```text
5-7 characters
```

If encoded value is too short, optionally prepend a fixed random namespace or salt strategy.

Do not expose sensitive internal IDs if this becomes important.

---

# 7. API Design

GAS Web App endpoint:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

---

## 7.1 Create Link

Request:

```text
POST /exec?action=createLink
```

Body:

```json
{
  "targetUrl": "https://example.com/very-long-url",
  "title": "Example",
  "alias": "",
  "expiresAt": null
}
```

Response:

```json
{
  "success": true,
  "data": {
    "code": "aB7x2",
    "shortUrl": "https://script.google.com/macros/s/.../exec?id=aB7x2",
    "targetUrl": "https://example.com/very-long-url"
  }
}
```

---

## 7.2 Get Links

```text
GET /exec?action=getLinks&limit=100
```

Response:

```json
{
  "success": true,
  "data": []
}
```

---

## 7.3 Get Link

```text
GET /exec?action=getLink&code=aB7x2
```

---

## 7.4 Update Link

```text
POST /exec?action=updateLink
```

Body:

```json
{
  "code": "aB7x2",
  "targetUrl": "https://new-destination.com",
  "title": "Updated title",
  "expiresAt": null
}
```

The short URL and QR Code must remain unchanged.

---

## 7.5 Disable Link

```text
POST /exec?action=disableLink
```

Body:

```json
{
  "code": "aB7x2"
}
```

---

## 7.6 Enable Link

```text
POST /exec?action=enableLink
```

---

## 7.7 Get Statistics

```text
GET /exec?action=getStats&code=aB7x2
```

Example response:

```json
{
  "success": true,
  "data": {
    "totalClicks": 1286,
    "todayClicks": 84,
    "lastClickedAt": "2026-10-05T10:20:00"
  }
}
```

---

# 8. Redirect Flow

Short URL:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?id=aB7x2
```

Flow:

```text
User scans QR
      ↓
GAS doGet(e)
      ↓
Read code
      ↓
CacheService lookup
      ↓
Cache HIT
      ↓
Get destination
      ↓
Redirect

Cache MISS
      ↓
Find link in Google Sheet
      ↓
Validate status / expiration
      ↓
Store destination in cache
      ↓
Redirect
```

Redirect path must contain as little logic as possible.

Do NOT load dashboard data during redirect.

Do NOT scan the full sheet if avoidable.

---

# 9. Cache Strategy

Use:

```javascript
CacheService.getScriptCache()
```

Recommended cache key:

```text
link:aB7x2
```

Cached payload:

```json
{
  "url": "https://example.com",
  "status": "active",
  "expiresAt": null
}
```

Recommended TTL:

```text
21600 seconds
```

= 6 hours

When a link is updated or disabled:

```text
delete cache immediately
```

---

# 10. Click Tracking Strategy

Redirect speed has higher priority than exact real-time statistics.

Do NOT perform many expensive spreadsheet operations per click.

Preferred strategy:

```text
Request
↓
Resolve URL
↓
Redirect immediately
↓
Basic lightweight analytics update
```

Possible optimization:

- Store temporary click counts in CacheService
- Flush counts periodically
- Batch write click data
- Keep `links.clicks` as a cached aggregate value

For MVP:

A single lightweight increment is acceptable for low to moderate traffic.

For higher traffic:

Use buffered or batched analytics.

---

# 11. Frontend Pages

## 11.1 Home

Purpose:

Create short links quickly.

UI:

```text
┌────────────────────────────────────┐
│ KPS Link                           │
│                                    │
│ วางลิงก์ที่ต้องการย่อ             │
│ [ https://...................... ] │
│                                    │
│ ชื่อ                               │
│ [ แบบทดสอบคณิตศาสตร์          ]   │
│                                    │
│ Custom alias (optional)            │
│ [ math2569                     ]   │
│                                    │
│ [ สร้างลิงก์สั้น ]                │
└────────────────────────────────────┘
```

Result:

```text
kps.link/aB7x2

[ Copy ]

┌───────────────┐
│               │
│    QR CODE    │
│               │
└───────────────┘

[ Download PNG ]
[ Download SVG ]
```

---

## 11.2 Links

Table:

```text
ชื่อ
Short URL
ปลายทาง
Clicks
สถานะ
วันที่สร้าง
Actions
```

Actions:

- Copy
- QR
- Edit
- Disable
- Details

Search:

```text
ค้นหาจาก:
- title
- code
- alias
- target URL
```

Filters:

```text
ทั้งหมด
Active
Disabled
Expired
```

---

## 11.3 Link Detail

Show:

```text
Title

Short URL
Target URL

QR Code

Total clicks
Clicks today
Created at
Last clicked
Expiration

[Edit destination]
[Download QR]
[Disable link]
```

---

## 11.4 Dashboard

Cards:

```text
ลิงก์ทั้งหมด
ลิงก์ใช้งานอยู่
คลิกทั้งหมด
คลิกวันนี้
```

Charts are optional.

If charts are implemented, use lightweight rendering.

Recommended:

```text
Chart.js
```

Do not load chart libraries on pages where they are unused.

---

# 12. Dynamic QR Principle

QR must encode the SHORT URL.

Correct:

```text
QR
↓
short URL
↓
redirect
↓
destination
```

Wrong:

```text
QR
↓
final Google Drive URL
```

Reason:

If the destination changes later, users should edit only the destination.

The printed QR stays valid forever unless disabled.

---

# 13. Frontend Performance Requirements

Target:

```text
Initial JS payload < 150 KB where practical
```

Rules:

- Do not use React unless truly necessary
- Prefer Vanilla JS for this project
- Lazy load large optional modules
- QR library may load only when required
- Charts only load on dashboard
- Avoid large icon libraries
- Use Lucide icons selectively
- Avoid unnecessary UI frameworks

Use browser caching for static files.

---

# 14. Browser Cache / Local Storage

Use localStorage only for non-sensitive UI cache.

Example:

```text
links_cache
dashboard_cache
```

Dashboard strategy:

```text
open page
↓
render cached data immediately
↓
fetch fresh API data
↓
replace UI
↓
update local cache
```

This gives a stale-while-revalidate feel.

Do NOT treat localStorage as authoritative data.

---

# 15. URL Validation

Before saving:

Allow only:

```text
http://
https://
```

Reject:

```text
javascript:
data:
file:
```

Example validation:

```javascript
function isValidUrl(value) {
  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
```

---

# 16. Alias Validation

Recommended custom alias:

```text
3-40 characters
```

Allowed:

```text
a-z
A-Z
0-9
-
_
```

Regex:

```javascript
/^[A-Za-z0-9_-]{3,40}$/
```

Aliases must be unique.

Reserved aliases:

```text
admin
api
dashboard
login
logout
links
settings
stats
health
```

---

# 17. Security

Minimum requirements:

- Validate all URLs server-side
- Validate alias server-side
- Do not trust frontend input
- Escape user-visible text
- Do not inject HTML from Sheet values
- Use `textContent`, not `innerHTML`, where possible
- Rate-limit link creation where possible
- Do not expose Spreadsheet ID in frontend source
- Do not place secrets in GitHub Pages
- Store backend configuration in GAS Script Properties

Use:

```javascript
PropertiesService.getScriptProperties()
```

For:

```text
SPREADSHEET_ID
ADMIN_TOKEN
APP_SECRET
```

---

# 18. Admin Security

For an MVP, dashboard editing can use an admin token.

Better future approach:

```text
Google Sign-In
↓
verify allowed school email
↓
permit create/edit/delete
```

Recommended future whitelist:

```text
@school-domain.ac.th
```

Do not implement insecure password checks purely in frontend JavaScript.

---

# 19. CORS

Because frontend is hosted on GitHub Pages and backend is GAS:

Ensure API responses work with browser fetch.

Return JSON with:

```javascript
ContentService
  .createTextOutput(JSON.stringify(data))
  .setMimeType(ContentService.MimeType.JSON);
```

If browser CORS limitations become a problem, structure requests around supported GAS Web App behavior.

Avoid unnecessary custom request headers because they may trigger preflight requests.

Prefer:

```text
GET
POST with simple payload
```

---

# 20. GAS Concurrency

Where writes may happen simultaneously:

Use:

```javascript
LockService.getScriptLock()
```

Example:

```javascript
const lock = LockService.getScriptLock();

lock.waitLock(5000);

try {
  // create ID
  // append row
} finally {
  lock.releaseLock();
}
```

Use locking only around critical write sections.

Do NOT lock read-only redirect operations.

---

# 21. Spreadsheet Performance

Never do this repeatedly:

```javascript
sheet.getRange(row, col).getValue();
sheet.getRange(row, col2).getValue();
sheet.getRange(row, col3).getValue();
```

Prefer:

```javascript
const values = sheet.getDataRange().getValues();
```

For writes:

```javascript
setValues()
```

or:

```javascript
appendRow()
```

depending on use case.

For larger datasets, maintain lookup strategies instead of scanning all rows.

---

# 22. Future Performance Upgrade

If link volume grows significantly:

Create a lookup index in CacheService or Script Properties.

Example:

```text
code -> sheet row
```

Then:

```text
code
↓
cache lookup row number
↓
read one row only
```

Avoid full sheet scans.

---

# 23. UI Design Direction

Theme:

```text
Modern
Minimal
Fast
Professional
School-friendly
```

Suggested colors:

```text
Primary: violet / purple
Accent: yellow / gold
Background: #F8FAFC
Cards: white
```

Use:

- Rounded cards
- Soft shadows
- Large whitespace
- Clear typography
- Mobile-first layout
- Responsive tables
- Toast notifications

Avoid excessive animation.

---

# 24. Mobile UX

Primary users may create links from phones.

Minimum mobile requirements:

- Touch targets ≥ 44px
- QR preview fits screen
- Copy button next to short URL
- Download actions visible
- URL input supports paste easily
- Table becomes cards on small screens

---

# 25. PWA Optional Feature

Future enhancement:

Make frontend installable as a PWA.

Features:

```text
Add to Home Screen
Offline shell
Fast repeat launch
```

Do NOT cache API responses aggressively enough to show outdated redirect destinations.

PWA is optional for v1.

---

# 26. Error Handling

Standard API shape:

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ALIAS_EXISTS",
    "message": "Alias already exists"
  }
}
```

Suggested error codes:

```text
INVALID_URL
INVALID_ALIAS
ALIAS_EXISTS
LINK_NOT_FOUND
LINK_DISABLED
LINK_EXPIRED
UNAUTHORIZED
RATE_LIMITED
INTERNAL_ERROR
```

Frontend must display friendly Thai error messages.

---

# 27. Loading UX

Do not block the whole page.

When creating a short URL:

```text
button becomes loading
```

Example:

```text
กำลังสร้าง...
```

Disable duplicate submit until request finishes.

Use optimistic UI only where safe.

---

# 28. QR Download

PNG:

```javascript
const dataUrl = canvas.toDataURL("image/png");
```

SVG:

```javascript
QRCode.toString(shortUrl, {
  type: "svg",
  errorCorrectionLevel: "M"
});
```

Filename:

```text
kps-link-{code}.png
kps-link-{code}.svg
```

---

# 29. GitHub Pages Deployment

Recommended:

```bash
npm run build
```

Output:

```text
dist/
```

Deploy via:

```text
GitHub Actions
```

Vite config example:

```javascript
import { defineConfig } from "vite";

export default defineConfig({
  base: "/REPOSITORY_NAME/"
});
```

If using a custom domain:

```javascript
base: "/"
```

---

# 30. Environment Configuration

Frontend:

```text
src/config.js
```

Example:

```javascript
export const CONFIG = {
  API_URL: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
  APP_NAME: "KPS Link"
};
```

Do not store secrets here.

Public API endpoint is okay.

Secrets must stay in GAS Script Properties.

---

# 31. GAS Configuration

`Config.gs`

```javascript
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    spreadsheetId: props.getProperty("SPREADSHEET_ID"),
    cacheTtl: 21600
  };
}
```

---

# 32. Basic GAS Router

Example concept:

```javascript
function doGet(e) {
  const action = e.parameter.action;

  if (e.parameter.id) {
    return resolveShortLink(e.parameter.id);
  }

  switch (action) {
    case "getLinks":
      return getLinks(e);

    case "getLink":
      return getLink(e);

    case "getStats":
      return getStats(e);

    default:
      return jsonResponse({
        success: false,
        error: {
          code: "INVALID_ACTION",
          message: "Invalid action"
        }
      });
  }
}
```

---

# 33. Redirect Implementation Note

Google Apps Script Web Apps have limitations around true HTTP 301/302 responses.

If direct server redirect behavior is not available in the desired form, return a minimal HTML redirect page:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=TARGET_URL">
<script>
location.replace("TARGET_URL");
</script>
</head>
<body></body>
</html>
```

Keep this page extremely small.

Escape the target URL safely before embedding it.

---

# 34. Suggested Development Phases

## Phase 1 — MVP

Implement:

- Create short link
- Auto-generated code
- QR preview
- Copy short URL
- Download PNG
- Google Sheets storage
- Redirect
- Basic link list

Do not add analytics complexity yet.

---

## Phase 2 — Management

Add:

- Edit destination
- Custom alias
- Enable / disable
- Expiration
- Link detail page
- Search
- Filters

---

## Phase 3 — Analytics

Add:

- Total clicks
- Clicks today
- Last clicked
- Basic daily chart

Avoid collecting unnecessary personal data.

---

## Phase 4 — Authentication

Add:

- Google login
- Authorized users
- Admin permissions
- User ownership

---

## Phase 5 — Custom Domain

Preferred future URLs:

```text
go.kps.ac.th/math2569
```

or:

```text
link.kps.ac.th/aB7x2
```

If custom-domain routing cannot point cleanly to GAS, consider adding a lightweight edge redirect layer later.

Possible future upgrade:

```text
Cloudflare Worker
```

while keeping:

```text
GitHub Pages
Google Sheets
GAS admin API
```

---

# 35. Performance Targets

Frontend:

```text
First usable render: as fast as possible
Main page JS: ideally < 150 KB
No unnecessary framework runtime
```

Create link:

```text
Target UX: < 1-2 seconds in normal conditions
```

QR generation:

```text
< 100 ms on modern devices where practical
```

Redirect:

```text
Minimize backend work
Cache destination aggressively
Avoid full-sheet scan on hot paths
```

---

# 36. Non-Goals

Do NOT build in v1:

- Complex user tracking
- Marketing analytics
- Device fingerprinting
- IP geolocation
- Large reporting engine
- PDF generation
- Server-side QR rendering
- Social media previews
- Heavy React SPA architecture

Keep the product small and reliable.

---

# 37. Codex Implementation Rules

Codex should follow these rules while generating code:

1. Prefer simple code over abstraction.
2. Do not add dependencies unless necessary.
3. Frontend should remain framework-light.
4. Do not move UI rendering to GAS.
5. QR generation happens in browser.
6. Validate URL both client-side and server-side.
7. Never expose secrets to GitHub Pages.
8. Use batch spreadsheet operations.
9. Use CacheService for short-link lookup.
10. Use LockService only for critical writes.
11. Avoid full sheet scans in redirect path where possible.
12. Keep redirect code separate from dashboard API code.
13. Use reusable API response helpers.
14. Use Thai UI labels.
15. Keep code readable for future school maintenance.
16. Do not introduce paid services.
17. Optimize for mobile devices.
18. Keep accessibility in mind.
19. All errors must have predictable error codes.
20. Update README after major architecture changes.

---

# 38. Suggested First Codex Task

Use this prompt:

```text
Read PROJECT_SPEC.md completely.

Create the first working MVP of KPS Short Link & QR Manager.

Requirements:
- Vite + Vanilla JavaScript
- GitHub Pages compatible
- Mobile-first UI
- Thai interface
- Google Apps Script backend
- Google Sheets database
- Create short URLs
- Base62 short code
- QR generated in browser
- Download QR as PNG and SVG
- Copy short URL
- Redirect short URL to target URL
- Use CacheService
- Validate URLs client-side and server-side
- Separate frontend and gas code
- Do not add authentication yet
- Do not add complex analytics yet

Generate:
1. complete folder structure
2. frontend code
3. GAS backend files
4. Google Sheet setup function
5. README setup instructions
6. deployment instructions for GAS
7. GitHub Pages deployment workflow

Keep the implementation minimal, fast, and easy to maintain.
```

---

# 39. Definition of Done — MVP

MVP is complete when:

- [ ] User can paste a valid URL
- [ ] User can create a short link
- [ ] Short code is stored in Google Sheets
- [ ] Short URL can be copied
- [ ] QR is generated in browser
- [ ] QR can be downloaded as PNG
- [ ] QR can be downloaded as SVG
- [ ] Scanning QR opens the short URL
- [ ] Short URL resolves to destination
- [ ] Disabled links do not redirect
- [ ] Invalid URLs are rejected
- [ ] Main frontend is hosted on GitHub Pages
- [ ] Backend is deployed as GAS Web App
- [ ] No secrets exist in frontend repository
- [ ] UI works on phone
- [ ] README contains setup instructions

---

# 40. Final Architecture Recommendation

For the first production version:

```text
Frontend
Vite + Vanilla JavaScript
Tailwind CSS
QR package

Hosting
GitHub Pages

Backend
Google Apps Script

Database
Google Sheets

Caching
GAS CacheService

Concurrency
GAS LockService

Analytics
Basic aggregated click tracking

Authentication
None in MVP
Google Sign-In later

Cost
Target: 0 THB/month
```

The system should prioritize:

```text
Speed
↓
Reliability
↓
Simple maintenance
↓
Low quota usage
↓
Extra features
```

Do not sacrifice redirect performance for unnecessary analytics.
