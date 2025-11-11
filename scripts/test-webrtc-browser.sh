#!/bin/bash
# Browser-based WebRTC Test
# Tests the PoC page with actual browser environment

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Protocol v3 Browser WebRTC Test                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}❌ OPENAI_API_KEY not set${NC}"
    echo -e "${RED}   Please export OPENAI_API_KEY before running this test${NC}"
    exit 1
fi

echo -e "${GREEN}✅ API key found${NC}"
echo ""

# Start local HTTP server in background
echo -e "${BLUE}🚀 Starting local HTTP server...${NC}"
cd /home/asimo/web-app

# Kill any existing server on port 8080
pkill -f "python3 -m http.server 8080" 2>/dev/null || true
sleep 1

# Start server
python3 -m http.server 8080 >/dev/null 2>&1 &
SERVER_PID=$!
echo -e "${GREEN}   Server started (PID: $SERVER_PID)${NC}"
sleep 2

# Verify server is running
if curl -sf http://localhost:8080 >/dev/null; then
    echo -e "${GREEN}✅ Local server accessible${NC}"
else
    echo -e "${RED}❌ Local server not accessible${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo -e "${BLUE}🧪 Running Playwright tests...${NC}"
echo ""

# Run Playwright tests with API key
OPENAI_API_KEY="$OPENAI_API_KEY" npx playwright test protocol-v3-integration.spec.ts --reporter=list 2>&1 | tee /tmp/playwright-webrtc-results.txt

# Capture exit code
TEST_EXIT_CODE=${PIPESTATUS[0]}

# Stop server
echo ""
echo -e "${BLUE}🛑 Stopping local server...${NC}"
kill $SERVER_PID 2>/dev/null || true
echo -e "${GREEN}   Server stopped${NC}"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Summary                                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Count passed/failed tests
PASSED=$(grep -c "✓" /tmp/playwright-webrtc-results.txt || echo "0")
FAILED=$(grep -c "✘" /tmp/playwright-webrtc-results.txt || echo "0")

echo -e "Tests Passed: ${GREEN}$PASSED${NC}"
echo -e "Tests Failed: ${RED}$FAILED${NC}"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All browser tests passed!${NC}"
    echo ""
    echo -e "${GREEN}Protocol v3 WebRTC is fully functional in browser environment.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed or were skipped${NC}"
    echo ""
    echo -e "${YELLOW}Review the output above for details.${NC}"
    exit 1
fi
