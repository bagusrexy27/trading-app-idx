#!/usr/bin/env bash
# Linux/macOS equivalent of start-dev.bat — backend :1111 + Vite :5173
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  ========================================"
echo "   IDX Stock Analyzer - Development Mode"
echo "  ========================================"
echo
echo "  Backend  : http://localhost:1111"
echo "  Frontend : http://localhost:5173  (hot reload)"
echo

http_up() {
  curl -sf -o /dev/null --max-time 2 "$1"
}

wait_for() {
  local url="$1" name="$2" tries=30
  for ((i=1; i<=tries; i++)); do
    if http_up "$url"; then
      echo "  $name ready"
      return 0
    fi
    sleep 1
  done
  echo "  WARN: $name did not become ready in ${tries}s" >&2
  return 1
}

if [[ ! -d ui/node_modules ]]; then
  echo "  Installing frontend deps (npm install --legacy-peer-deps)..."
  (cd ui && npm install --legacy-peer-deps)
fi

mkdir -p tmp

if http_up "http://localhost:1111/api/stocks"; then
  echo "  Backend already listening on :1111"
else
  if command -v air >/dev/null 2>&1; then
    echo "  Starting backend with air..."
    nohup air >tmp/backend.log 2>&1 &
    echo $! >tmp/backend.pid
  else
    echo "  air not found — starting with go run ."
    nohup go run . >tmp/backend.log 2>&1 &
    echo $! >tmp/backend.pid
  fi
fi

if http_up "http://localhost:5173/"; then
  echo "  Frontend already listening on :5173"
else
  echo "  Starting frontend (npm run dev)..."
  nohup npm run dev --prefix ui >tmp/frontend.log 2>&1 &
  echo $! >tmp/frontend.pid
fi

wait_for "http://localhost:1111/api/stocks" "Backend" || true
wait_for "http://localhost:5173/" "Frontend" || true

echo
echo "  Open http://localhost:5173"
echo
