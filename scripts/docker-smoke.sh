#!/usr/bin/env bash
# Isolated synthetic workspace only. Never uses the normal Compose project volumes.
set -euo pipefail
cd "$(dirname "$0")/.."
export OUTLINE_PORT="${OUTLINE_SMOKE_PORT:-14317}"
export OPENAI_API_KEY='' ANTHROPIC_API_KEY=''
project="outline-smoke-$(date +%s)-$$"
compose=(docker compose -p "$project" -f compose.yaml)
cleanup() { "${compose[@]}" down -v --remove-orphans; }
trap cleanup EXIT
wait_ready() {
  for attempt in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:$OUTLINE_PORT/healthz" >/dev/null; then return; fi
    sleep 2
  done
  "${compose[@]}" logs
  return 1
}
"${compose[@]}" up -d --build
wait_ready
base="http://127.0.0.1:$OUTLINE_PORT"
curl -fsS "$base/api/setup" | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{if(!JSON.parse(b).required)process.exit(1)})'
curl -fsS -H 'Content-Type: application/json' -d '{"profile":{"name":"Docker Test"},"targetRole":"Engineer","resume":"## Experience\nSynthetic persistence check"}' "$base/api/setup" >/dev/null
curl -fsS -H 'Content-Type: application/json' -d '{"name":"Example Company","role":"Engineer"}' "$base/api/company" >/dev/null
# Exercise Korean PDF rendering, the Python runtime and fonts inside the image.
"${compose[@]}" exec -T outline node --input-type=module -e 'import {Store} from "./lib/store.mjs";import {exportDocument} from "./lib/export.mjs";const s=new Store(process.env.OUTLINE_DATA_DIR);const d=await s.document("common","resume");await exportDocument(s,"common","resume","pdf",d.version);'
# SDK auth configuration must survive recreation too; this is a dummy file, never a real credential.
"${compose[@]}" exec -T outline sh -c 'printf synthetic > /home/node/.outline-volume-test'
"${compose[@]}" down
"${compose[@]}" up -d --force-recreate
wait_ready
curl -fsS "$base/api/state" | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{const s=JSON.parse(b);if(s.setup.required||s.profile.name!=="Docker Test"||!s.companies.some(c=>c.name==="Example Company"))process.exit(1)})'
curl -fsS "$base/api/document?target=common&doc=resume" | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{if(!JSON.parse(b).markdown.includes("Synthetic persistence check"))process.exit(1)})'
"${compose[@]}" exec -T outline sh -c 'test "$(cat /home/node/.outline-volume-test)" = synthetic'
echo 'Docker smoke passed: onboarding, PDF, document/company and SDK-home volume persistence.'
