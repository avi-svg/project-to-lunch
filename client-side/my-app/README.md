This is a Next.js frontend for an Express + PostgreSQL backend.

## Environment

Create a `.env.local` file from `.env.example`.

```bash
cp .env.example .env.local
```

Required values:

- `AUTH_SECRET`: random secret for Auth.js sessions
- `NEXTAUTH_SECRET`: optional alternative name for the same secret when using NextAuth v4 conventions
- `NEXTAUTH_URL`: frontend base URL, for local dev use `http://localhost:3001`
- `AUTH_GOOGLE_ID`: Google OAuth client ID
- `AUTH_GOOGLE_SECRET`: Google OAuth client secret
- `API_BASE_URL`: Express backend base URL used by the Auth.js server callback
- `NEXT_PUBLIC_API_BASE_URL`: Express backend base URL used by browser API calls
- `INTERNAL_API_KEY`: shared secret used by Next server code when calling protected Express endpoints like `GET /users`

Set the Google OAuth callback URL to:

```text
http://localhost:3001/api/auth/callback/google
```

## Getting Started

Install dependencies and run the frontend:

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser.

If you see `[next-auth][error][CLIENT_FETCH_ERROR] ... Unexpected token '<'`, it usually means the `/api/auth/session` request returned an HTML error page instead of JSON. The most common cause is missing auth environment variables. Make sure `.env.local` exists, restart `npm run dev`, and verify:

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_SECRET` or `NEXTAUTH_SECRET`
- `NEXTAUTH_URL=http://localhost:3001`

## Auth Flow

1. The user clicks `Continue with Google`.
2. Auth.js redirects the user to Google and completes OAuth in the Next.js app.
3. After a successful sign-in, the Auth.js JWT callback extracts the Google `email` and `name`.
4. The frontend server sends that profile to the Express backend at `POST /users/oauth`.
5. The Express backend finds the PostgreSQL user by email:
   - if found, it returns the existing row
   - if not found, it inserts a new row and returns it
6. The returned PostgreSQL `id` is stored in the Auth.js session.
7. Future frontend API calls reuse `session.user.id`, so the UI no longer asks users to type their `userId`.

## Expected Express Endpoint

The frontend expects this backend contract:

```http
POST /users/oauth
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "Jane Doe"
}
```

Expected response:

```json
{
  "id": "db-user-id",
  "email": "user@example.com",
  "name": "Jane Doe"
}
```

Example SQL logic on the Express side:

```sql
SELECT id, email, name
FROM users
WHERE email = $1;
```

If no row exists:

```sql
INSERT INTO users (email, name)
VALUES ($1, $2)
RETURNING id, email, name;
```

## Dashboard Schema

Example PostgreSQL schema for a personal dashboard:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booked_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booked_for_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX appointments_booked_by_user_id_idx
  ON appointments (booked_by_user_id);

CREATE INDEX appointments_booked_for_user_id_idx
  ON appointments (booked_for_user_id);
```

Each appointment is linked to the authenticated user through
`booked_by_user_id` or `booked_for_user_id`.

## Dashboard Endpoints

The new Next.js dashboard page expects the Express backend to expose:

```http
GET /users/:userId/appointments
```

Example response:

```json
{
  "bookedByUser": [
    {
      "id": "appt-1",
      "startTime": "2026-03-30T09:00:00.000Z",
      "endTime": "2026-03-30T09:30:00.000Z",
      "serviceName": "Dental cleaning",
      "counterpartyName": "Dr. Cohen",
      "status": "confirmed",
      "relationship": "bookedByUser"
    }
  ],
  "forUser": [
    {
      "id": "appt-2",
      "startTime": "2026-04-02T11:00:00.000Z",
      "endTime": "2026-04-02T11:45:00.000Z",
      "serviceName": "Consultation",
      "counterpartyName": "Sarah Levi",
      "status": "pending",
      "relationship": "forUser"
    }
  ]
}
```

Cancel endpoint:

```http
PATCH /appointments/:appointmentId/cancel
Content-Type: application/json

{
  "userId": "db-user-id"
}
```

Example Express query for the dashboard:

```sql
SELECT
  a.id,
  a.start_time AS "startTime",
  a.end_time AS "endTime",
  a.service_name AS "serviceName",
  u.name AS "counterpartyName",
  a.status,
  'bookedByUser' AS relationship
FROM appointments a
JOIN users u ON u.id = a.booked_for_user_id
WHERE a.booked_by_user_id = $1

UNION ALL

SELECT
  a.id,
  a.start_time AS "startTime",
  a.end_time AS "endTime",
  a.service_name AS "serviceName",
  u.name AS "counterpartyName",
  a.status,
  'forUser' AS relationship
FROM appointments a
JOIN users u ON u.id = a.booked_by_user_id
WHERE a.booked_for_user_id = $1;
```

The Next.js app now exposes these protected internal routes:

- `GET /api/dashboard/appointments`
- `PATCH /api/dashboard/appointments/:appointmentId/cancel`

These routes resolve the logged-in user from the NextAuth session and forward
secure requests to the Express backend.

## Internal Users Access

The manage-users page loads the users directory from Express through server-side
Next.js code. To allow this securely, configure the same `INTERNAL_API_KEY` in
both apps and have Express accept it via the `x-internal-api-key` header for
`GET /users` (or `GET /user`).

Example Next.js request shape:

```http
GET /users
x-internal-api-key: <INTERNAL_API_KEY>
```

## OTP Verification Flow

Before an appointment is created, the app now sends an email verification code
and creates the appointment only after the code is confirmed.

Suggested PostgreSQL table:

```sql
CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  appointment_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX verification_codes_user_id_idx
  ON verification_codes (user_id);
```

Backend endpoints used by the frontend:

- `POST /appointments/verification/request`
- `GET /appointments/verification/:id`
- `POST /appointments/verification/resend`
- `POST /appointments/verification/confirm`

Next.js internal protected routes:

- `POST /api/appointments/request-verification`
- `GET /api/appointments/verification/pending`
- `POST /api/appointments/verification/resend`
- `POST /api/appointments/verify`

Environment variables required on the Express side:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `OTP_LENGTH`
- `OTP_EXPIRY_MINUTES`
- `OTP_MAX_ATTEMPTS`
- `OTP_RESEND_COOLDOWN_SECONDS`

## Notes

- The backend remains in Express.
- PostgreSQL remains the source of truth for app users.
- The Auth.js session stores the PostgreSQL user ID for future API calls.
