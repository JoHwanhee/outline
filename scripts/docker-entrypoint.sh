#!/bin/sh
set -eu
umask 077
mkdir -p "${OUTLINE_DATA_DIR:-/app/data}"
if [ ! -w "${OUTLINE_DATA_DIR:-/app/data}" ] || [ ! -w "${HOME:-/home/node}" ]; then
  echo 'Outline needs writable data and SDK-home volumes.' >&2
  echo 'For bind mounts, grant container UID 1000 access to the selected directory; see docs/docker.md.' >&2
  exit 1
fi
exec "$@"
