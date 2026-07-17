# Use administrator-provisioned local accounts

BioModals is deployed on a trusted private network, so the first version uses
local email-and-password accounts provisioned by an administrator. There is no
self-service signup. The administrator gives a new User a one-time Password
Link for initial Password Setup.

FastAPI owns authentication through a secure, HTTP-only, same-origin session
cookie; the frontend must not store bearer tokens, and backend authorization
must enforce Job ownership rather than trusting network location or
identifiers.

The MVP has no signed-in password-change interface. Forgotten or compromised
passwords require an administrator-assisted reset because the first version has
no email or SMTP dependency. The administrator issues a new one-time Password
Link. Successful Password Setup or reset revokes the User's prior Sessions and
establishes a fresh Session. Consuming the Password Link, replacing the
password hash, revoking prior Sessions, and creating that Session are one
atomic database transition.

Self-service signup, authenticated password changes, email-based recovery,
OIDC, and other external identity providers are deferred until the environment
demonstrates a need for them.
