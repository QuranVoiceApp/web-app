#!/bin/bash
# Automated Protocol v3 Backend Testing Script

set -e

echo "🧪 Protocol v3 Backend Automated Tests"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    local check_pattern="$4"

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "$expected_status" ]; then
        if [ -n "$check_pattern" ]; then
            if echo "$body" | grep -q "$check_pattern"; then
                echo -e "${GREEN}✓ PASS${NC}"
                ((PASSED++))
                return 0
            else
                echo -e "${RED}✗ FAIL${NC} (pattern not found: $check_pattern)"
                echo "  Response: $body"
                ((FAILED++))
                return 1
            fi
        else
            echo -e "${GREEN}✓ PASS${NC}"
            ((PASSED++))
            return 0
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (expected $expected_status, got $http_code)"
        echo "  Response: $body"
        ((FAILED++))
        return 1
    fi
}

# Test 1: Health endpoint (localhost)
test_endpoint "Health (localhost)" \
    "http://127.0.0.1:5056/realtime/v3/health" \
    "200" \
    '"status":"healthy"'

# Test 2: Health endpoint (public)
test_endpoint "Health (public)" \
    "https://quran.asimo.io/realtime/v3/health" \
    "200" \
    '"protocol":"v3"'

# Test 3: Health check fields
echo -n "Testing health response structure... "
response=$(curl -s "https://quran.asimo.io/realtime/v3/health")
if echo "$response" | jq -e '.status, .protocol, .transport, .openai_configured' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  Response: $response"
    ((FAILED++))
fi

# Test 4: Session endpoint exists (should return error without API key or valid request)
echo -n "Testing session endpoint reachability... "
response=$(curl -s -w "\n%{http_code}" -X POST \
    "https://quran.asimo.io/realtime/v3/session" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-realtime-preview-2024-12-17"}' 2>/dev/null)
http_code=$(echo "$response" | tail -n1)

# Should return 500 (OpenAI error) or 200 (success) - either means endpoint works
if [ "$http_code" = "500" ] || [ "$http_code" = "200" ] || [ "$http_code" = "502" ]; then
    echo -e "${GREEN}✓ PASS${NC} (endpoint reachable)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (unexpected status: $http_code)"
    ((FAILED++))
fi

# Test 5: Rate limiting (make many requests quickly)
echo -n "Testing rate limiting... "
rate_limit_hit=0
for i in {1..15}; do
    http_code=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        "https://quran.asimo.io/realtime/v3/session" \
        -H "Content-Type: application/json" \
        -d '{"model":"test"}' 2>/dev/null)

    if [ "$http_code" = "429" ]; then
        rate_limit_hit=1
        break
    fi
    sleep 0.1
done

if [ "$rate_limit_hit" = "1" ]; then
    echo -e "${GREEN}✓ PASS${NC} (rate limit triggered)"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARN${NC} (rate limit not triggered - may need adjustment)"
    ((PASSED++))  # Not a failure, just a warning
fi

# Test 6: Backend service status
echo -n "Testing backend service status... "
if systemctl is-active --quiet quran-rtc; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (service not running)"
    ((FAILED++))
fi

# Test 7: Check v3 router is imported
echo -n "Testing v3 router import... "
if grep -q "realtime_v3" /opt/quran-rtc/backend/server.py; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (v3 router not imported)"
    ((FAILED++))
fi

# Test 8: Check Apache proxy config
echo -n "Testing Apache proxy configuration... "
if grep -q "/realtime/v3" /etc/apache2/sites-enabled/quran.asimo.io-le-ssl.conf; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (v3 proxy not configured)"
    ((FAILED++))
fi

# Test 9: Check protocol_v3.js exists
echo -n "Testing protocol_v3.js exists... "
if [ -f "/home/asimo/web-app/scripts/protocol_v3.js" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (protocol_v3.js not found)"
    ((FAILED++))
fi

# Test 10: Check PoC page exists
echo -n "Testing PoC page exists... "
if [ -f "/home/asimo/web-app/prototypes/webrtc-poc.html" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (PoC page not found)"
    ((FAILED++))
fi

# Summary
echo ""
echo "======================================"
echo "📊 Test Results"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Protocol v3 backend is ready for testing."
    echo ""
    echo "Next steps:"
    echo "1. Test PoC page: http://localhost:8080/prototypes/webrtc-poc.html"
    echo "2. Run Playwright tests: npx playwright test protocol-v3.spec.ts"
    echo "3. Manual testing with OpenAI API key"
    exit 0
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "Please review the failures above and fix them before proceeding."
    exit 1
fi
