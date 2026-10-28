# Security and data handling

Outline is a single-user local application. Compose binds only to `127.0.0.1`; the app does not provide multi-user accounts or an Internet-facing authentication boundary. Do not expose its port publicly without adding a trusted access/authentication layer.

The data volume contains private documents, source files, chat history, generated pages and optional API keys. API keys are stored locally with mode 0600 and are not returned by settings endpoints. SDK authentication and transcripts are stored in a separate persistent home volume. Protect backups of both volumes as private data.

AI requests send the selected documents and relevant source material to the selected provider. Link imports fetch public HTTP/HTTPS pages. Outline blocks private-address imports, unsafe rendered links and cross-origin writes. Completed AI edits and evaluation improvements use document/evidence versions to avoid overwriting later work.

If reporting a vulnerability, do not attach real resumes, keys, tokens or transcripts. Use synthetic reproductions. Until this project has a dedicated private reporting address, do not post active secrets or exploit details affecting real users in public issues.
