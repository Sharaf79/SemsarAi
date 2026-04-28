#!/bin/bash

# Semsar AI - Run System on Browser
# This script starts both backend and frontend services

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🚀 Starting Semsar AI System..."
echo ""

# Start Backend
echo "📦 Starting Backend (NestJS)..."
cd "$BACKEND_DIR"
npm run start:dev &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo ""

# Start Frontend
echo "🎨 Starting Frontend (React + Vite)..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo ""

# Display URLs
echo "✅ Services started!"
echo ""
echo "📱 Open your browser at: http://localhost:5173/"
echo ""
echo "📋 Running services:"
echo "   • Backend:  http://localhost:3000 (PID: $BACKEND_PID)"
echo "   • Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "To stop all services, press Ctrl+C or run:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo ""

# Keep script alive
wait
