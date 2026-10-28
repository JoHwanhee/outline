# Contributing

1. Use Node.js 22 and Python 3.11+; install `npm ci` and the PDF dependencies described in README.
2. Use an isolated `OUTLINE_DATA_DIR` for development. Never commit your data folder, `.env`, credentials, generated documents, or SDK session directories.
3. Run `npm test` and `npm run check:release` before proposing a change. For Docker changes, run `bash scripts/docker-smoke.sh` on a machine with Docker.
4. Keep test resumes fictional. Include first-run and existing-volume behavior in storage changes.
5. Keep AI provider calls behind `lib/sdk-client.mjs`, and preserve the version/evidence checks before applying document edits.

Open a pull request with a concise behavior description and the checks you ran. Changes to third-party resources must retain their notices.
