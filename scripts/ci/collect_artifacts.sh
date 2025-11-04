#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts}"
shift || true
mkdir -p "$OUT_DIR"

DATE_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SHORT_SHA="$(git rev-parse --short HEAD)"
FULL_SHA="$(git rev-parse HEAD)"
REPO_URL="$(git config --get remote.origin.url)"
DEFAULT_TAG="r$(date -u +%Y.%m.%d)-p2"
VERSION_TAG="${VERSION_TAG:-$DEFAULT_TAG}"
FLAGS="${ACTIVE_FLAGS:-}"

cat <<EOF > "${OUT_DIR}/BUILDINFO.txt"
version=${VERSION_TAG}
commit=${FULL_SHA}
short_sha=${SHORT_SHA}
generated_utc=${DATE_UTC}
repo=${REPO_URL}
flags=${FLAGS}
EOF

if [ $# -gt 0 ]; then
  for path in "$@"; do
    if [ -e "$path" ]; then
      cp -R "$path" "${OUT_DIR}/"
    fi
  done
fi

echo "Collected artifacts in ${OUT_DIR}"
