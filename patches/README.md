# Mol* label rendering

`molstar@5.11.0.patch` removes raw HTML rendering from the ESM and CommonJS
Plugin UI, including hover, measurement history/entries, toasts and help.
Mol* formatting tags are stripped with its existing `stripTags` helper and
the result is passed as React text. **React text escaping is the security
boundary; tag stripping is only presentation cleanup.** Native CIF bytes and
parsed scientific identifiers remain unchanged.

Multiline hover labels also render as text instead of Markdown, preventing
embedded images from fetching remote resources. Labels lose inline HTML
formatting but retain ordinary readable text.

Bun applies the version-pinned patch through `patchedDependencies` during
installation, including `bun install --frozen-lockfile`. Preserve or replace
this protection before changing Mol* versions. Unit checks cover both builds
and all Plugin UI HTML sinks; an offline browser regression exercises a
synthetic custom CCD identifier through the real parser and label components.
