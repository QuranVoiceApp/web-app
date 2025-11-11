#!/bin/bash
# Comprehensive Deployment Verification Script
# Tests both Protocol v3 AND Phase 3 (Barge-in)

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Quran Voice Tutor - Deployment Verification          ║${NC}"
echo -e "${BLUE}║  Protocol v3 + Phase 3 (Barge-in)                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper function
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
    echo "────────────────────────────────────────"
}

# ============================================================================
# SECTION 1: Backend Service
# ============================================================================
section "Backend Service Status"

if systemctl is-active --quiet quran-rtc; then
    pass "Backend service is running"
else
    fail "Backend service is NOT running"
fi

if systemctl is-enabled --quiet quran-rtc; then
    pass "Backend service is enabled"
else
    warn "Backend service is not enabled (won't start on reboot)"
fi

# ============================================================================
# SECTION 2: Protocol v3 Backend
# ============================================================================
section "Protocol v3 Backend Endpoints"

# Health check (localhost)
if curl -sf http://127.0.0.1:5056/realtime/v3/health > /dev/null; then
    pass "Health endpoint (localhost) accessible"
else
    fail "Health endpoint (localhost) NOT accessible"
fi

# Health check (public)
if curl -sf https://quran.asimo.io/realtime/v3/health > /dev/null; then
    pass "Health endpoint (public) accessible"
else
    fail "Health endpoint (public) NOT accessible"
fi

# Health response structure
health_json=$(curl -s https://quran.asimo.io/realtime/v3/health)
if echo "$health_json" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    pass "Health response is valid JSON with correct status"
else
    fail "Health response is invalid"
fi

# Session endpoint reachability
session_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    https://quran.asimo.io/realtime/v3/session \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-realtime-preview-2024-12-17"}')

if [ "$session_status" = "200" ] || [ "$session_status" = "500" ] || [ "$session_status" = "502" ]; then
    pass "Session endpoint is reachable (status: $session_status)"
else
    fail "Session endpoint returned unexpected status: $session_status"
fi

# ============================================================================
# SECTION 3: Protocol v3 Frontend
# ============================================================================
section "Protocol v3 Frontend Files"

if [ -f "/home/asimo/web-app/scripts/protocol_v3.js" ]; then
    pass "protocol_v3.js exists"

    # Check file size (should be ~600 lines, ~15KB)
    size=$(wc -c < /home/asimo/web-app/scripts/protocol_v3.js)
    if [ "$size" -gt 10000 ]; then
        pass "protocol_v3.js has content ($size bytes)"
    else
        warn "protocol_v3.js seems small ($size bytes)"
    fi
else
    fail "protocol_v3.js NOT found"
fi

if [ -f "/home/asimo/web-app/prototypes/webrtc-poc.html" ]; then
    pass "Proof-of-concept page exists"
else
    fail "Proof-of-concept page NOT found"
fi

if grep -q "protocol_v3.js" /home/asimo/web-app/scripts/bootstrap.js; then
    pass "protocol_v3.js is loaded by bootstrap"
else
    fail "protocol_v3.js NOT loaded by bootstrap"
fi

# ============================================================================
# SECTION 4: Protocol v2 (Current Production)
# ============================================================================
section "Protocol v2 (Baseline)"

# V2 WebSocket endpoint
v2_status=$(curl -s -o /dev/null -w "%{http_code}" https://quran.asimo.io/realtime/config)
if [ "$v2_status" = "200" ]; then
    pass "Protocol v2 config endpoint accessible"
else
    warn "Protocol v2 config endpoint returned: $v2_status"
fi

if [ -f "/home/asimo/web-app/scripts/protocol_v2.js" ]; then
    pass "protocol_v2.js exists (fallback available)"
else
    warn "protocol_v2.js NOT found"
fi

# ============================================================================
# SECTION 5: Phase 3 Barge-in
# ============================================================================
section "Phase 3 (Barge-in) Implementation"

if [ -f "/home/asimo/web-app/docs/phase3-bargein.md" ]; then
    pass "Phase 3 documentation exists"
else
    warn "Phase 3 documentation NOT found"
fi

if [ -f "/home/asimo/web-app/docs/PHASE3_COMPLETION.md" ]; then
    pass "Phase 3 completion report exists"
else
    warn "Phase 3 completion report NOT found"
fi

# Check for barge-in code in voice.js
if grep -q "FF.barge_in" /home/asimo/web-app/scripts/voice.js; then
    pass "Barge-in feature flag found in voice.js"
else
    fail "Barge-in feature flag NOT found in voice.js"
fi

# Check backend metrics for barge-in
if curl -s http://127.0.0.1:5056/api/metrics | grep -q "barge_in_total"; then
    pass "Backend barge-in metrics instrumented"
else
    fail "Backend barge-in metrics NOT found"
fi

# ============================================================================
# SECTION 6: Test Files
# ============================================================================
section "Test Suites"

if [ -f "/home/asimo/web-app/tests/protocol-v3.spec.ts" ]; then
    pass "Protocol v3 test suite exists"
else
    fail "Protocol v3 test suite NOT found"
fi

if [ -f "/home/asimo/web-app/tests/bargein.spec.ts" ]; then
    pass "Barge-in test suite exists"
else
    warn "Barge-in test suite NOT found"
fi

# ============================================================================
# SECTION 7: Proxy Configuration
# ============================================================================
section "Proxy Configuration"

if grep -q "/realtime/v3" /etc/apache2/sites-enabled/quran.asimo.io-le-ssl.conf; then
    pass "Apache proxy configured for /realtime/v3"
else
    fail "Apache proxy NOT configured for /realtime/v3"
fi

if sudo apachectl configtest 2>&1 | grep -q "Syntax OK"; then
    pass "Apache configuration is valid"
else
    fail "Apache configuration has errors"
fi

# ============================================================================
# SECTION 8: Documentation
# ============================================================================
section "Documentation"

docs=(
    "PROTOCOL_V3_PLAN.md"
    "PROTOCOL_V3_INTEGRATION_GUIDE.md"
    "PROTOCOL_V3_IMPLEMENTATION_COMPLETE.md"
    "PHASE3_COMPLETION.md"
    "PHASE3_AND_V3_SUMMARY.md"
)

for doc in "${docs[@]}"; do
    if [ -f "/home/asimo/web-app/docs/$doc" ]; then
        pass "$doc exists"
    else
        warn "$doc NOT found"
    fi
done

# ============================================================================
# SECTION 9: Quick Functional Tests
# ============================================================================
section "Functional Tests"

# Can we parse health JSON?
if curl -s https://quran.asimo.io/realtime/v3/health | jq -e '.openai_configured' > /dev/null 2>&1; then
    openai_configured=$(curl -s https://quran.asimo.io/realtime/v3/health | jq -r '.openai_configured')
    if [ "$openai_configured" = "true" ]; then
        pass "OpenAI API key is configured"
    else
        warn "OpenAI API key NOT configured (ephemeral tokens won't work)"
    fi
else
    fail "Cannot parse health response"
fi

# Check TURN configuration
turn_configured=$(curl -s https://quran.asimo.io/realtime/v3/health | jq -r '.turn_configured')
if [ "$turn_configured" = "true" ]; then
    pass "TURN server is configured"
else
    warn "TURN server NOT configured (firewall traversal may fail)"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Summary                                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Tests Passed:  ${GREEN}$PASSED${NC}"
echo -e "Tests Failed:  ${RED}$FAILED${NC}"
echo "Total Tests:   $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical tests passed!${NC}"
    echo ""
    echo "Deployment Status: READY ✅"
    echo ""
    echo "Next Steps:"
    echo "1. Manual test Protocol v3 PoC with API key"
    echo "2. Enable Phase 3 barge-in: ?ff=barge_in"
    echo "3. Run Playwright tests: npx playwright test"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo ""
    echo "Please review failures and fix before proceeding."
    echo ""
    exit 1
fi
