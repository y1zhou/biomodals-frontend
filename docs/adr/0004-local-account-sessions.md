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

Password Links expire one hour after issuance. Admin link-creation responses
include the absolute expiration timestamp so the handoff UI and CLI can show
when delivery is still useful; the URL itself remains non-refetchable.

User Status is explicit. A provisioned User starts `pending_setup`, cannot
authenticate or submit Jobs, and becomes `enabled` after successful Password
Setup. A `disabled` User cannot authenticate, use Password Links, or create
Submissions. Re-enabling a User returns them to `enabled` when a password
already exists and otherwise to `pending_setup`. Administrator role is
separate from User Status, but only an enabled Administrator satisfies the
last-administrator safeguard.

Disabling a User does not cancel Jobs that were already admitted. They continue
through reconciliation and finalization, retain their owner, and consume the
applicable Active Job Limits until they finish or become blocked. Their Results
remain inaccessible while the User is disabled and become available again
after re-enabling. Disabling never grants an Administrator access to those Jobs.

Offline account bootstrap and recovery use `biomodals api admin` against the
same configured SQLite state as the service. Those commands enforce the same
transactional User Status and last-enabled-Administrator invariants but do not
start the API, initialize reconciliation, require Modal credentials, or perform
Modal resource preflight. Creating a Password Link still requires the shared
public URL configuration.

Self-service signup, authenticated password changes, email-based recovery,
OIDC, and other external identity providers are deferred until the environment
demonstrates a need for them.
