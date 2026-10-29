#!/bin/sh
# Entrypoint script: injects NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL
# into the pre-built Next.js standalone bundle at runtime.
#
# Next.js inlines NEXT_PUBLIC_* vars at build time, so we build with
# placeholder strings and sed-replace them at container start.

# Default placeholders must match the ones used during docker build
API_URL="${NEXT_PUBLIC_API_URL:-}"
WS_URL="${NEXT_PUBLIC_WS_URL:-}"

if [ -n "$API_URL" ]; then
  echo "[entrypoint] Injecting NEXT_PUBLIC_API_URL=$API_URL"
  find .next -name "*.js" -exec sed -i "s|__API_URL_PLACEHOLDER__|$API_URL|g" {} +
fi

if [ -n "$WS_URL" ]; then
  echo "[entrypoint] Injecting NEXT_PUBLIC_WS_URL=$WS_URL"
  find .next -name "*.js" -exec sed -i "s|__WS_URL_PLACEHOLDER__|$WS_URL|g" {} +
fi

# Execute the main command (node server.js)
exec "$@"
