---
status: accepted
---

# Add administrator-managed runtime configuration

BioModals adds an Administrator role and a protected Admin interface. An
Administrator is an ordinary User with additional authorization; the backend,
not the visibility of frontend navigation, enforces that authorization. The
User menu links Administrators to `/admin/users`, while `/admin/modal` owns
Modal-related service and Tool configuration.

The API CLI bootstraps the first Administrator with `create-user --admin` and
supports promotion and demotion. The backend rejects disabling or demoting the
last active Administrator. These invariants are transactional in SQLite and
apply equally to CLI and HTTP administration.

## User administration

The Users page lists every User and supports provisioning, enabling, disabling,
issuing a fresh Password Link, granting or removing Administrator access, and
changing the User Active Job Limit. Disabling a User continues to revoke their
Sessions and Password Links. Password Links are shown once for delivery through
a trusted channel; no email service is introduced.

The User Active Job Limit counts all non-terminal Jobs owned by one User across
all Tools. Its default is copied onto the User at provisioning and the resulting
per-User value is stored in SQLite.

Table mutations are serialized so one shared mutation cannot reassign an
earlier failure to a different User row. Create-form errors remain with the
Create User form, and row mutation errors remain with the initiating row.

## Modal administration

The Modal page has Environment and Tools sections. Environment displays the
Modal service-user token ID, the effective Modal Environment, and the Global
Active Job Limit. It never returns or stores the Modal token secret.

The Tools section is a three-column table containing the user-facing Tool name,
editable deployed Modal app name, and a combined running Jobs / Tool Active Job
Limit field. The frontend derives the display name from its typed Tool Catalog
using the fixed API workload key. The workload key remains code-owned because
workload routes and compute adapters are registered code, not dynamic catalog
records.

Tool-row saves are likewise serialized and display failures in the initiating
row. Environment-setting failures remain inside the Environment section.
Each save sends only fields whose values actually changed. A restore control
inside every editable setting removes that field's Administrator override and
reveals its configured-file or built-in default. Restore controls and
provenance are field-specific: changing or restoring a Tool Active Job Limit
does not turn its deployed Modal app name into an Administrator setting.

The Tool Active Job Limit counts non-terminal Jobs for one workload across all
Users. The Global Active Job Limit counts non-terminal Jobs across all Users and
Tools. Admission reads the User limit and database-backed Runtime Settings,
checks User, Tool, and Global counts, and writes the Job snapshot within the
same SQLite write transaction. Reusing an idempotency key still returns the
original Job before applying current limits.

These policies reject excess Submissions with
`409 active_job_limit_reached`. They are admission controls, not Capacity
Limits: the backend still does not retain uploaded Input for later dispatch,
and therefore does not claim to provide a durable execution queue or an exact
cross-Tool running-call concurrency cap.

## Configuration sources and secrets

`BIOMODALS_API_CONF_ENV` names an explicit `.env` file. For service and Tool
Runtime Settings, effective precedence is:

1. an explicit process environment variable;
2. an Administrator value stored in SQLite;
3. a value from the configured `.env` file;
4. a built-in default.

An explicit process environment variable makes the corresponding Admin field
read-only. Database edits otherwise take effect immediately. The configured
file is parsed without overwriting process environment values.

For the Admin PATCH contract, omission means unchanged and an explicit JSON
`null` means remove that one database override. The interface does not render
the built-in default or Administrator source as a badge. It uses the in-field
restore control for editable overrides and plain explanatory text only when a
configuration file or process environment controls the effective value.

`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are exceptions because they are
secrets/bootstrap credentials rather than Runtime Settings. They must come
from the process environment or configured `.env` file, are never stored in
SQLite, and both are required for API startup. Only the token ID appears in the
Administrator API.

`BIOMODALS_PUBLIC_URL` is the single static public browser origin. It constructs
Password Links and defines the accepted browser Origin. The frontend continues
to use relative `/api` URLs: Vite supplies the development proxy, while the
production reverse proxy serves the SPA and API under one origin. No backend
URL is embedded in the frontend or stored as an Administrator setting.

## Live changes and existing Jobs

Modal Environment and deployed app changes apply to newly admitted Jobs. Each
Job stores a Modal Configuration Snapshot at admission. Submission and later
Volume access use that snapshot, so existing Jobs remain attached to the
environment and app under which they were accepted.

The OpenAPI document includes the Administrator flag, all Admin operations,
setting provenance, and editable state. Generated TypeScript remains the only
frontend API schema; the frontend does not maintain a parallel hand-written
contract.

## Pre-release persistence reset

The current pre-release SQLite schema is version 6. Version 5 development
databases receive the additive stage-history column automatically; older
pre-release state may still be discarded and initialized fresh as allowed by
ADR 0005. The first new User must be provisioned as an Administrator. This
reset allowance ends at the first release.
