# Account Email and Password Recovery

## Local development

No mail account is required for local testing. With `NODE_ENV` unset or set to `development`, auth links are printed in the backend terminal. Register with a test email, copy the verification URL from that terminal into your browser, and follow the link. The URL uses a fragment so the token is not sent in ordinary HTTP requests.

Password reset links are printed the same way after requesting a reset for a verified account.

## SMTP configuration

For real email delivery, set these values in `backend/.env` and restart the backend:

```dotenv
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=Roundwise <no-reply@example.com>
```

Use port 465 with `SMTP_SECURE=true` when required by your provider. In production, SMTP host and sender configuration must be provided; the backend does not print account tokens to logs there.

## Token behavior

- New accounts cannot sign in until their email is verified.
- Verification links expire after 24 hours; resending invalidates the previous link.
- Password-reset links expire after 30 minutes and can only be used once.
- Resetting a password invalidates existing Roundwise sessions.
- Existing accounts are preserved as verified by the automatic database migration.
- Auth endpoints are rate-limited; when testing repeatedly, wait for the limit window to pass.
