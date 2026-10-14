# Authentication Flow

## 1. Login
- User enters their phone number.
- Only phone numbers registered by the admin are allowed.
- Send SMS OTP to the registered number.
- Verify OTP and create an authenticated session.
- Unknown or inactive users must be rejected. Never create accounts automatically.

## 2. Access Control
- `/admin/*` requires the `admin` role and successful passkey authentication.
- All other routes require a valid session and appropriate role permissions.
- Enforce authorization on the server/API, not just in the frontend.

## 3. Admin Passkey Verification
- When an admin accesses any `/admin/*` route, require passkey authentication.
- After successful verification, grant elevated admin access for 15 minutes.
- Reuse the elevation across `/admin/*` pages while valid.
- When elevation expires, require passkey verification again.
- A normal login session alone must never grant access to `/admin/*`.

## 4. Passkey Management
- Allow admins to register, list, rename, and revoke their passkeys.
- Require appropriate reauthentication before removing passkeys or changing security settings.

## 5. Session and Security Rules
- No trusted-device flow.
- Rate-limit OTP requests and verification attempts.
- OTPs must expire and be single-use.
- Provide a secure account recovery process.

## Flow Summary

1. Phone number → SMS OTP → authenticated session.
2. Normal routes → session + role authorization.
3. `/admin/*` → admin role check → passkey verification → 15-minute elevated access.
4. Expired elevation → passkey verification again.
5. Unknown or inactive account → access denied.