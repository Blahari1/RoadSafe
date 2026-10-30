# RoadSafe

Roadside-assistance app: React (Vite) client in `client/`, Express + MongoDB + Socket.IO API in `server/`.

## Setup

```bash
# server
cd server
cp .env.example .env      # then fill in real values (never commit .env)
npm install
npm run dev

# client (new terminal)
cd client
cp .env.example .env
npm ci
npm run dev
```

## Creating the first admin account

There is intentionally **no** public way to become an admin. `/api/auth/register`
always creates a `customer` and `/api/mechanics/register` always creates a
`mechanic`. Admins are created only from the command line, on a machine that has
your `server/.env` (and therefore database access):

```bash
cd server
ADMIN_NAME="Site Admin" ADMIN_EMAIL="admin@example.com" \
ADMIN_PHONE="9999999999" ADMIN_PASSWORD="a-long-unique-password" \
npm run create-admin
```

The password must be at least 12 characters. The script refuses to run if the
email already exists, and it does not change existing accounts. Log in at
`/login`; admins land on `/admin`, where they approve or reject mechanics.

## Mechanic lifecycle

1. A mechanic registers (`pending`, unavailable).
2. An admin approves the profile. Approval always leaves the mechanic unavailable.
3. The approved mechanic turns **Availability** on from their profile page.
   Only approved mechanics can become available; anyone can switch off.
4. Customers' "nearby mechanics" search lists only mechanics who could actually
   accept a request at the searched point (see **Request distribution** below).

## Request distribution (who sees and can accept a request)

One shared rule set (`server/utils/eligibility.js`) is used by the mechanic request
list, the accept endpoint, new-request notifications and the customer nearby search,
so they cannot disagree. A mechanic is eligible for a request only when **all** hold:

1. Verification status is `approved`.
2. Availability is on.
3. The request's service type is one of the mechanic's services.
4. Distance rule (approximate **straight-line / haversine** distance, not driving
   distance and not an ETA):

| Request pinned? | Mechanic has saved coordinates? | Result |
|---|---|---|
| Yes | Yes | Eligible only if distance <= maximum radius; the real distance is shown |
| Yes | No | **Not eligible.** The mechanic is told to save a location in their profile and sees how many pinned requests are hidden |
| No (typed address only) | Any | Eligible with **distance unknown** (`null`, never estimated), because nobody could be distance-checked and hiding it would strand the customer |

**What "pinned" means.** A request is pinned only when it stores a latitude **and** a
longitude that are both numbers, finite and in range (-90..90, -180..180). Anything else
is treated as *unpinned*: a missing coordinate, only one of the two, `null`, a string, NaN,
Infinity or an out-of-range value. Such legacy/malformed records follow the "No" row (eligible
for every approved, available, service-matching mechanic, distance unknown). The same
definition is used by notifications, the list's database prefilter, the hidden-request
count and accepting, so they cannot disagree. **New** requests are validated more strictly:
creation rejects (400) a latitude without a longitude, the reverse, `null`, non-numeric and
out-of-range values; only both-valid or neither is accepted.

**Maximum radius:** `MECHANIC_MAX_RADIUS_KM` in `server/.env` (default **25 km**, hard
ceiling 500; missing, zero, negative or non-numeric values fall back to 25). The customer
nearby search lets customers narrow the radius but caps it at the same maximum and
reports `radiusCapped`. The free-text `serviceArea` field is informational only; it is
not used for matching.

**Listing (`GET /api/mechanics/requests`):** the database query is *not* capped. It selects
pending requests with a matching service whose location is either missing or inside the
radius's latitude/longitude bounding box (a guaranteed superset of the circle, handles the
antimeridian and poles; backed by an index on `status`, `serviceType`, coordinates). Only
lightweight fields are loaded for those candidates, the exact rules are applied in code, the
result is sorted nearest-first (unknown distances last, newest first within ties), and only
then is the page capped at 100 requests. The response always reports `totalEligible`,
`listLimit` and `truncated`, and the mechanic page shows "Showing the nearest N of M" when
truncated, so valid requests are never omitted silently. (An earlier version limited the
newest 200 pending requests *before* filtering, which could hide eligible older ones; this is
fixed and covered by regression tests.)

**Accepting:** `PATCH /api/mechanics/requests/:id/accept` runs three steps:

1. Check approval/availability, load the still-open request and apply the rules above
   (403 with a `reason` such as `out_of_range` or `mechanic_location_missing`).
2. One atomic `findOneAndUpdate` filtered on `status: "pending"` and `mechanicId: null`.
   When several mechanics accept at once, exactly one update matches; the others get 409.
3. **Re-validate after claiming (fail-closed).** The mechanic's availability/approval/location
   live in a different collection, so they cannot be part of that single-document atomic
   update. After a successful claim the mechanic is re-read:
   - no longer eligible -> the claim is rolled back and the response is 409
     `eligibility_changed`;
   - eligibility **cannot be verified** (the re-read fails) -> the claim is also rolled back
     and the response is a retryable 503 `verification_unavailable`;
   - the rollback is conditional (it requires this mechanic and status `accepted`, so it can
     never undo someone else's claim) and is attempted twice to ride out a transient error.

   The customer and other mechanics are notified only after verification passes.
   If a database failure makes the rollback itself impossible, the claim may still be stored:
   when the mechanic is known to be ineligible the response is 503 `release_failed`
   (customer not notified, support needed); when verification was merely impossible the
   mechanic was eligible at the pre-check moments earlier, so the acceptance is reported
   truthfully as accepted with `eligibilityVerified: false`, and the customer is notified.
   See the limitations below.

**Notifications:** when a request is created, only mechanics who pass the same eligibility
rules receive a socket event, sent to their private `user:<id>` room. The payload contains
only a request id, status and a short message ("New Towing request is waiting"): never the
address, coordinates, problem description or customer details. Requests without coordinates
follow the documented fallback (all approved, available, service-matching mechanics are
notified). When a request is accepted, rolled back or cancelled, a data-free
`available_requests_changed` ping is sent to the shared `mechanics` room so lists refresh;
list contents are always re-fetched through the eligibility-checked API.

**Mechanic location:** mechanics save it in *My Profile → Edit profile* (use-my-location
button, tap on a map, or type coordinates; latitude first). The map shows the pin so a
swapped latitude/longitude is visible. The API accepts only numeric, in-range coordinates,
requires both, and rejects exactly 0, 0. Registration does **not** collect a location; until
a mechanic saves one they receive only requests without a pinned location, see a banner with
a count of hidden pinned requests, and the verification page prompts them to add it.

## Tests: what is and is not covered

`cd server && npm test` runs 151 tests with Node's built-in runner, no database needed:

- **Pure unit tests** (`utils.test.js`, `eligibility.test.js`): validators, haversine,
  status transitions, radius parsing, all eligibility rules and edge cases.
- **Mocked controller tests** (`mechanicRequests.test.js`, `mechanicDistribution.test.js`,
  `legacyCoordinates.test.js`, `passwordReset.test.js`; the password-reset ones also use a fake
  mailer and stand-ins for bcryptjs/jsonwebtoken):
  controllers run against in-memory fake models (`tests/helpers/fakes.js`) that implement
  the query operators the code uses. They cover the 200-request regression, cap/truncation,
  antimeridian, bounding-box superset property, accept races (exactly one winner), post-claim
  rollback, fail-closed verification (re-read failure, rollback retry, rollback failure,
  never touching another mechanic's claim), notifications and payload contents, the profile
  location save path, and notification/list/accept consistency for legacy or malformed
  stored coordinates (15 shapes plus a mechanic x request matrix). They prove our logic and the atomic-update *contract*; they do **not**
  run MongoDB, so real index usage, real `findOneAndUpdate` atomicity and Mongoose
  behaviour are **not integration-tested**.
- **Not covered by any automated test:** real MongoDB behaviour, Socket.IO delivery in a
  browser, and every React page/component (map picker, forms, banners). The client was
  never lint-checked or built in the environment where this was authored (no network).

## Known limitations — request distribution and notifications

- Distribution is **radius-based, not routed**: no road distance, ETA, traffic or
  automatic dispatch. Requests are visible to every eligible mechanic; none is
  addressed to a specific mechanic, and a response time is not guaranteed.
- **Accept consistency is not a multi-document transaction.** Eligibility is checked before
  the claim and re-checked after it, with rollback. The remaining effects: (a) for a very
  short moment between the claim and a rollback, the request is stored as `accepted`, so a
  customer who loads their request at that instant may briefly see it accepted (no
  notification is sent); (b) if two mechanics race and the first claimant is rolled back, the
  second receives 409 even though the request is pending again and must retry; (c) if the
  post-claim re-read fails, the claim is rolled back and a retryable 503 is returned, **but if
  the database is also unavailable for the rollback** the claim cannot be removed: it is then
  reported as accepted with `eligibilityVerified: false` (verification impossible) or as 503
  `release_failed` (mechanic known ineligible), and a request can remain assigned to a mechanic
  who became ineligible until someone resolves it (the failure is logged server-side);
  (d) a change that lands *after* the re-read is treated as happening after acceptance.
  True all-or-nothing behaviour would need a MongoDB transaction (replica set required).
- The "valid pin" prefilter relies on MongoDB's documented behaviour that numeric range
  operators only match numeric values (not strings or null). The tests model this in a fake;
  it has **not** been verified against a real MongoDB server.
- Notified mechanics see a request in their list unless the 100-request cap truncates the
  list (the response then reports `truncated`).
- The list shows at most 100 eligible requests per response (nearest first); the rest are
  counted and reported but not paged yet.
- The radius is one platform-wide value, not per mechanic.
- Real-time notifications use Socket.IO and have not been tested against a live
  database and browser.

---

# Phase 12 update — history, ratings, invoices, mechanic & admin portals

## Run locally

```bash
# Backend (port 1910)
cd server
cp .env.example .env        # then set MONGO_URI and a long random JWT_SECRET
npm ci
npm run dev                 # or: npm start
npm test                    # 151 unit + mocked-controller tests (no DB needed)

# Create the first administrator (public registration can never create one)
ADMIN_NAME="Site Admin" ADMIN_EMAIL=admin@example.com ADMIN_PHONE=9999999999 ADMIN_PASSWORD="a-long-unique-password" npm run create-admin

# Frontend (port 5173)
cd ../client
cp .env.example .env
npm ci
npm run dev
```

## Roles and landing pages

| Role | After login |
|------|-------------|
| Customer | `/dashboard` |
| Approved mechanic | `/mechanic/requests` |
| Pending / rejected mechanic | `/mechanic/verification` (status page, no error loop) |
| Admin | `/admin` |

A saved "return to" URL is only honoured if it belongs to the user's own role area.
Registration: `/register` (customer) and `/mechanic/register` (mechanic) are offered side by side
and linked from the login page. The register endpoint ignores any `role` in the request body.

## New / changed API endpoints

| Method & path | Who | Notes |
|---|---|---|
| `POST /api/service-requests/:id/review` | owning customer | completed only, one per request (unique index), mechanic taken from the request |
| `POST /api/invoices/request/:requestId` | assigned mechanic | completed only, one per request (unique index), total computed server-side, immutable afterwards |
| `GET /api/invoices/:id`, `GET /api/invoices/request/:requestId` | owning customer / assigned mechanic / admin | others get 404 |
| `GET /api/invoices` | admin | paginated |
| `GET /api/admin/overview` | admin | live counts |
| `GET /api/admin/service-requests` | admin | filters `status`, `serviceType`, `search`; pagination `page`, `limit` |
| `GET /api/admin/service-requests/:id` | admin | read-only |
| `GET /api/admin/customers` | admin | no password fields |
| `GET /api/mechanics/me/reviews` | mechanic | reviews about the logged-in mechanic |
| `GET /api/mechanics/requests` | approved mechanic | eligible pending requests only (service + radius rules); returns `maxRadiusKm`, `locationMissing`, `hiddenWithoutLocation`, `totalEligible`, `listLimit`, `truncated` |

### Request ↔ mechanic data model
`ServiceRequest.mechanicId` references the **User** collection. Experience, services, service area
and verification status live in the separate **Mechanic** collection (keyed by `userId`).
`populate("mechanicId")` therefore only yields name/contact; `utils/requestExtras.js`
performs one batched `Mechanic.find({ userId: { $in } })` and attaches it as `mechanicProfile`.

### Concurrency
Accepting a request first applies the eligibility rules, then runs a single
`findOneAndUpdate` whose filter requires `status: "pending"`, `mechanicId: null` and a matching
service. Only one concurrent mechanic's update can match. Cancelling uses the same pattern (`status: "pending"` in the filter).

### Invoices and pricing
RoadSafe has no pricing model and **no payment workflow**. The assigned mechanic enters the actual
charges (1–10 line items) after completing a job; the server validates them and sums in paise.
Invoices store a snapshot of customer/mechanic/vehicle/location details, have no edit route, and
display "Payment status: Not recorded". Nothing is ever marked as paid. A zero-total invoice is
rejected, so "no charge" jobs simply have no invoice.

## Known limitations — Phase 12 features
- **No ETA / travel-time prediction.** Distances are approximate straight-line (haversine) values; matching uses the configurable radius described above.
- No automatic dispatch and no response-time guarantee; mechanics choose to accept.
- Downtime reduction is not measured; the app provides the workflow, not evidence.
- No payment gateway; invoices are records of charges only.
- Reviews cannot be edited or deleted after submission (deliberate).
- Admin pages are read-only for requests (no reassignment / status override, by design).
- Requests created before this update have no per-status timestamps; the timeline shows "Time not recorded".
- Rejecting a mechanic who has an in-flight job blocks them from updating it; the admin should resolve that manually.
- Customers can only have one open request per vehicle (duplicate-submission guard).
- Invoice numbers are sequential per year; a failed creation may leave a gap, never a duplicate.
- Phases 13 (full testing), 14 (deployment) and 15 (documentation/report) are **not** done.


---

# Forgot password / secure password reset

Works for **customer, mechanic and admin** accounts; nobody has to re-register. Login has a
**Forgot Password?** link next to the password field.

## Flow

1. `/forgot-password`: user enters the registered email. The server answers with the *same*
   generic message whether or not an account exists, and (if one does) emails a 6-digit code.
2. `/verify-reset-otp`: user enters the code (5-minute lifetime, 5 attempts). A correct code
   returns a one-time **reset token** (10-minute lifetime).
3. `/reset-password`: user enters the new password twice. On success all reset records are
   deleted, live sockets are disconnected, and the user is sent to `/login` with a success message.

A password can never be changed with just an email address: step 3 requires the reset token,
which only exists after step 2 succeeded.

## API (all public, JSON)

| Method & path | Body | Success | Notable errors |
|---|---|---|---|
| `POST /api/auth/forgot-password` | `{ email }` | 200 generic message, `expiresInSeconds`, `resendAfterSeconds` | 400 bad email format; 429 rate limited (`Retry-After`); **503 email not configured** |
| `POST /api/auth/verify-reset-otp` | `{ email, otp }` | 200 `{ resetToken, expiresInSeconds }` | 400 invalid/expired/used/exhausted code (one identical message); 429 |
| `POST /api/auth/reset-password` | `{ resetToken, newPassword, confirmPassword }` | 200 | 400 mismatch / weak password (token kept) / invalid or expired token (token spent); 429 |

## Environment variables (`server/.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | SMTP server (e.g. `smtp.gmail.com` / `587`) |
| `SMTP_SECURE` | `true` for port 465, `false` for 587 (STARTTLS) |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials (set both or neither). Never commit them |
| `SMTP_FROM` | Sender, e.g. `"RoadSafe <no-reply@your-domain>"` |
| `OTP_HMAC_SECRET` | Optional; key for hashing OTPs. Defaults to `JWT_SECRET` |
| `TRUST_PROXY` | Optional; number of reverse proxies in front of the API so rate limits see real client IPs |

### Email setup

1. `cd server && npm install` (installs `nodemailer`; see the lockfile note below), then
   copy the SMTP block from `.env.example` into `.env`.
2. Provider examples: **Gmail** (`smtp.gmail.com`, 587, `SMTP_SECURE=false`; needs 2-step
   verification and an *app password* as `SMTP_PASS`), **Mailtrap/Ethereal** for development
   inboxes, or any transactional provider's SMTP credentials (SendGrid, SES, Brevo...).
3. Restart the server and use *Forgot Password?* with a real account's email.
4. If SMTP is not configured the endpoint returns **503** and the server logs which
   setting names are missing (never their values). Nothing is sent and no code is created.

## Security design

- **OTP**: `crypto.randomInt` (CSPRNG), 6 digits. Stored only as `HMAC-SHA256(secret, userId:otp)`,
  never in plaintext, compared in constant time. The OTP appears only in the email body: not in
  API responses, headers or logs. (A plain hash of a 6-digit code is brute-forceable offline if
  the database leaks; the server-side key prevents that.)
- **Reset token**: 256-bit random, stored only as a SHA-256 hash.
- **No account enumeration**: identical status/body for known and unknown emails; email sending
  runs in the background so timing and failures cannot reveal accounts; email-keyed rate limits
  apply whether or not an account exists.
- **Atomicity**: each attempt is counted *before* the comparison inside the same conditional
  `findOneAndUpdate` that checks the limit (parallel guesses cannot exceed 5); OTP redemption and
  token redemption are each one conditional update, so only one concurrent request can succeed.
  If saving the password fails after the token was claimed, the claim is released for a retry.
- **Rate limits** (DB-backed, shared across instances, fail closed): code requests 10/hour per IP,
  5/hour and 1 per 60 s per email; verification 30 per 15 min per IP and 15 per 15 min per email;
  reset 20 per 15 min per IP. Counters store hashed emails only.
- **Password rules** (server-side): 8+ characters, at most 72 bytes (bcrypt limit), a letter and a
  number, not a common password, not the email. Hashed with the existing `bcryptjs` cost 10.
- **Only `password` and `passwordChangedAt` are updated**: role, profile and mechanic
  verification cannot change through this flow, and nothing from the request body reaches the update.
- **Sessions**: `passwordChangedAt` is checked in `protect` and in the Socket.IO handshake, so every
  JWT issued before the reset is rejected, and live sockets are disconnected at reset time.
- **Cleanup**: TTL indexes exist only on the `passwordresets` (`purgeAt`) and `ratelimits`
  (`expiresAt`) collections; the `users` collection has no expiry. Expiry is also enforced
  explicitly in every query (TTL deletion lags by up to ~60 s).
- **Frontend**: the email and the one-time token live only in React Router state (memory/history),
  never in `localStorage`/`sessionStorage`; the OTP is never shown; the existing `api` client is used.

## Known limitations of the password-reset feature

- **Email send failures are not shown to the user.** To avoid revealing which emails have accounts,
  a delivery failure for a real account still returns the generic success message (the unusable code is
  deleted and the failure is logged server-side without the OTP). During an SMTP outage a user simply
  receives nothing and can retry after the cooldown. Missing configuration *is* reported (503).
- Timing is equalised by background sending, but the registered-account path still performs a few
  more database writes than the unknown-email path; a very precise timing attack could in theory
  notice. Rate limits make it impractical at scale.
- An attacker can use up an email address's request quota (5/hour) to delay a victim's reset; the
  quota expires after an hour.
- Tokens issued in the *same second* as the reset (before it) are not distinguishable (JWT `iat` has
  1-second resolution). Other devices' existing JWTs are rejected on their next request.
- The `nodemailer` entry in `server/package-lock.json` was added **by hand without an integrity
  hash** (the authoring environment had no network). Run `npm install` in `server` once and commit
  the regenerated lockfile.
- No "your password was changed" notification email and no CAPTCHA are implemented.
- Real SMTP delivery, real bcrypt, real MongoDB behaviour (TTL indexes, unique indexes, atomic
  updates under real concurrency), the React pages in a browser, and the client lint/build were
  **not verified** where this was authored; see the test notes above for what the automated tests do cover.


## Persistent two-way service notifications

RoadSafe stores service-request notifications in MongoDB and delivers them immediately
to the authenticated recipient's Socket.IO room (`user:<userId>`). If the recipient is
offline, the notification remains available from `GET /api/notifications` after login.

- A new request creates one `service_request_received` notification for each approved,
  available mechanic who passes the same service/radius eligibility rules used by the
  mechanic request queue. It includes service type, vehicle label, location and time.
- A successful atomic mechanic acceptance creates one `service_request_accepted`
  notification for the owning customer, including the mechanic name and service type.
- A unique `(recipientId, dedupeKey)` index prevents duplicate records on retries.
- `PATCH /api/notifications/:id/read` marks one of the current user's notifications read.
- `PATCH /api/notifications/read-all` marks all of the current user's notifications read.
- The notification routes require authentication and customer/mechanic roles; every
  query/update is scoped to the authenticated recipient.

The customer and mechanic layouts share the notification-centre component. It loads
persisted notifications on login, listens for `notification:new`, shows unread count,
and opens the associated service-request screen when clicked.
