# Use local accounts with backend sessions

BioModals is deployed on a trusted private network but permits self-service
signup, so the first version uses local username-and-password accounts. FastAPI
owns authentication through a secure, HTTP-only, same-origin session cookie;
the frontend must not store bearer tokens, and backend authorization must
enforce Job ownership rather than trusting network location or identifiers.

Signed-in Users can change their password. Forgotten passwords require an
administrator-assisted reset because the first version has no email or SMTP
dependency and therefore no email-based self-service recovery. OIDC and other
external identity providers are deferred until the environment demonstrates a
need for them.
