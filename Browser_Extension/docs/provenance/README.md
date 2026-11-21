# Image Provenance Check

This feature reads the selected image's file bytes locally to verify C2PA Content
Credentials and inspect unsigned generator metadata. It is independent of the
detector provider, its API key, and its success or failure.

Select/upload an image in the side panel and read **Provenance (file
credentials)** below the detector. Re-check repeats the local check. URLs may need
existing site access; upload the original file when downloading fails.

A valid signature does not prove the content is true. Missing credentials do not
prove authenticity. Unsigned metadata can be edited or forged.

See [architecture](ARCHITECTURE.md), [result contract](RESULT_CONTRACT.md),
[security](SECURITY_AND_PRIVACY.md), [testing](TESTING.md), [issues](ISSUES_MAP.md),
and [future-agent briefing](LLM_CONTEXT.md). Implementation follows the seven
commits listed in the issue map. Browser checks are explicitly manual.

Implementation and automated Node checks are complete. The user's manual Chrome
acceptance is pending. [PR_HANDOFF.md](PR_HANDOFF.md) contains a filled repository
PR template, issue-number mapping, review/merge steps, CI limits and conflict guide.

The existing Copy Report action is unchanged and does not export provenance.
Nothing from this feature is saved to history or chrome.storage. Supported file
containers are JPEG, PNG and WebP, up to 8 MiB. GIF and other formats receive
Unsupported format. A remote manifest link is reported but never downloaded.

Ordinary supported images without credentials normally show No credentials found.
Unavailable means a read/startup/verification failure, with a specific safe message;
it must not be interpreted as no metadata. If a web URL is blocked, upload its
original downloaded file. The browser SDK's null-reader absence result is handled
explicitly, including larger unsigned JPEGs that require an SDK read.
