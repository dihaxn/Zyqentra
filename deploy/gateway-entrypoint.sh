#!/bin/sh
# Prepare the ERP test checkout and Zyqentra config, then start the Gateway.
set -eu

# OpenClaw's security audit wants the state directory private to the gateway user.
mkdir -p "${OPENCLAW_STATE_DIR:-/home/node/.openclaw}" && chmod 700 "${OPENCLAW_STATE_DIR:-/home/node/.openclaw}"

ERP="${ZYQENTRA_QA_CHECKOUT:-/srv/zyora-erp}"
# Git reads the token from the environment at fetch time; it is never written to disk.
HELPER='!f() { echo username=x-access-token; echo "password=${ZYQENTRA_GITHUB_TOKEN}"; }; f'

if [ ! -d "$ERP/.git" ]; then
  if [ -n "${ZYQENTRA_GITHUB_TOKEN:-}" ]; then
    git -c credential.helper="$HELPER" clone --quiet https://github.com/dihaxn/Zyora-erp.git "$ERP"
    git -C "$ERP" config credential.helper "$HELPER"
  else
    echo "ZYQENTRA_GITHUB_TOKEN is not set: skipping the Zyora-erp checkout (zyqentra_run_checks will be unavailable)." >&2
  fi
fi

if [ -d "$ERP/.git" ]; then export ZYQENTRA_QA_CHECKOUT="$ERP"; else unset ZYQENTRA_QA_CHECKOUT; fi
ZYQENTRA_ROOT=/opt/zyqentra OPENCLAW_BIN=/usr/local/bin/openclaw-cli node /opt/zyqentra/scripts/setup-gateway.mjs

exec node /app/dist/index.js gateway --bind "${OPENCLAW_GATEWAY_BIND:-lan}" --port 18789
