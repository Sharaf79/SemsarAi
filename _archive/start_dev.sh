#!/bin/bash
# Local Development Startup Script for SemsarAi Webhook

PORT=8000

echo "🚀 Starting SemsarAi Local Development Environment..."

# 1. Start FastAPI server in the background
echo "📦 Starting FastAPI server with Uvicorn on port $PORT..."
uvicorn src.main:app --reload --port $PORT &
UVICORN_PID=$!

# Wait briefly to ensure it boots up
sleep 2

# Verify ngrok is installed
if ! command -v ngrok &> /dev/null
then
    echo "⚠️  ngrok could not be found. Please install it to test Webhooks globally: https://ngrok.com/download"
    echo "========================================================"
    echo "✅ Your server is running locally on http://localhost:$PORT"
    echo "========================================================"
    
    # Wait for the background process instead of exiting
    wait $UVICORN_PID
    exit
fi

echo "========================================================"
echo "✅ Your server is running locally on http://localhost:$PORT"
echo "🔗 Ngrok will now start inside this terminal."
echo "   1. Copy the Forwarding HTTPS URL from the Ngrok interface"
echo "   2. Paste it in your Meta WhatsApp Dashboard as:"
echo "      <YOUR_NGROK_HTTPS_URL>/webhook"
echo "   3. Add your WEBHOOK_VERIFY_TOKEN from your .env file"
echo "========================================================"
echo "Press Ctrl+C at any time to kill both Ngrok and FastAPI."

# Catch SIGINT (Ctrl+C) to terminate the python process gracefully
trap "echo -e '\n🛑 Stopping FastAPI...'; kill $UVICORN_PID; exit" INT TERM

# Start ngrok
ngrok http $PORT
