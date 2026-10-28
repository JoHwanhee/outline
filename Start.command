#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo 'Node.js 20 이상이 필요합니다. 설치 후 다시 실행해 주세요.'
  read -r -p 'Enter를 누르면 닫힙니다.'
  exit 1
fi
if [ ! -d node_modules/@openai/codex-sdk ]; then
  echo '필요한 패키지를 설치합니다…'
  export PATH="$(dirname "$NODE_BIN"):$PATH"
  npm ci || exit 1
fi
APP_PORT="${PORT:-4317}"
APP_URL="http://127.0.0.1:$APP_PORT"
if curl --silent --fail "$APP_URL/api/state" | grep -q '"app":"outline"'; then
  open "$APP_URL"
  exit 0
fi
"$NODE_BIN" server.mjs &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null' EXIT INT TERM
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --silent --fail "$APP_URL/api/state" >/dev/null; then
    open "$APP_URL"
    echo "Outline 작업실: $APP_URL"
    echo '이 터미널을 닫으면 작업실 서버가 종료됩니다.'
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    read -r -p '실행하지 못했습니다. 위 오류를 확인하고 Enter를 누르세요.'
    exit 1
  fi
  sleep 1
done
wait "$APP_PID"
