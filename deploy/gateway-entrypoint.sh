#!/bin/sh
# Prepare the ERP test checkout and Crewloom config, then start the Gateway.
set -eu

ERP="${CREWLOOM_QA_CHECKOUT:-/srv/zyora-erp}"
# Git reads the token from the environment at fetch time; it is never written to disk.
HELPER='!f() { echo username=x-access-token; echo "password=${CREWLOOM_GITHUB_TOKEN}"; }; f'

if [ ! -d "$ERP/.git" ]; then
  if [ -n "${CREWLOOM_GITHUB_TOKEN:-}" ]; then
    git -c credential.helper="$HELPER" clone --quiet https://github.com/dihaxn/Zyora-erp.git "$ERP"
    git -C "$ERP" config credential.helper "$HELPER"
  else
    echo "CREWLOOM_GITHUB_TOKEN is not set: skipping the Zyora-erp checkout (crewloom_run_checks will be unavailable)." >&2
  fi
fi

if [ -d "$ERP/.git" ]; then export CREWLOOM_QA_CHECKOUT="$ERP"; else unset CREWLOOM_QA_CHECKOUT; fi
CREWLOOM_ROOT=/opt/crewloom OPENCLAW_BIN=/usr/local/bin/openclaw-cli node /opt/crewloom/scripts/setup-gateway.mjs

exec node /app/dist/index.js gateway --bind "${OPENCLAW_GATEWAY_BIND:-lan}" --port 18789
