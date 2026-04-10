#!/bin/bash
# Start server in background, wait for it, then curl
cd /Users/sherif/Projects/SemsarAi/backend

npm run start &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  sleep 1
done

echo ""
echo "=== POST /onboarding/start ==="
curl -s -X POST http://localhost:3000/onboarding/start \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test-user-001"}' | python3 -m json.tool

echo ""
echo "=== GET /onboarding/question ==="
curl -s "http://localhost:3000/onboarding/question?userId=test-user-001" | python3 -m json.tool

# Kill server
kill $SERVER_PID 2>/dev/null
