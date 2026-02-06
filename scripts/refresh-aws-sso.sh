#!/bin/bash
# =============================================================================
# AWS SSO Credential Refresh Script
# =============================================================================
# This script logs into AWS SSO and exports temporary credentials as
# environment variables that can be used by Kova's backend and app containers.
#
# Usage:
#   1. Edit this script to set your AWS_PROFILE
#   2. Run: source ./scripts/refresh-aws-sso.sh
#   3. Start Kova: bun run dev:full
#
# Note: SSO credentials typically expire after 8-12 hours. Re-run this script
#       when you see authentication errors.
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration - Edit these values
# -----------------------------------------------------------------------------
AWS_PROFILE="spreetail-dev"
AWS_REGION="us-east-1"

# Bedrock model to use (optional, defaults to Sonnet 4.5)
# Available models:
#   us.anthropic.claude-sonnet-4-5-20250929-v1:0  (recommended - fast, smart)
#   us.anthropic.claude-sonnet-4-20250514-v1:0    (previous Sonnet version)
#   us.anthropic.claude-opus-4-5-20251101-v1:0    (most capable, expensive)
BEDROCK_MODEL="${BEDROCK_MODEL:-us.anthropic.claude-sonnet-4-5-20250929-v1:0}"

# -----------------------------------------------------------------------------
# Color output
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}AWS SSO Credential Refresh${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Check if AWS CLI is installed
# -----------------------------------------------------------------------------
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it with: pip install awscli"
    exit 1
fi

# -----------------------------------------------------------------------------
# Login with AWS SSO
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 1: Logging into AWS SSO...${NC}"
echo "Profile: $AWS_PROFILE"
echo ""

if ! aws sso login --profile "$AWS_PROFILE"; then
    echo -e "${RED}Error: AWS SSO login failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ AWS SSO login successful${NC}"
echo ""

# -----------------------------------------------------------------------------
# Export credentials as environment variables
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 2: Exporting credentials to environment...${NC}"
echo ""

# Export credentials - this sets AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
if ! eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"; then
    echo -e "${RED}Error: Failed to export credentials${NC}"
    exit 1
fi

# Set additional required variables
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION="$AWS_REGION"
export AGENT_MODEL="$BEDROCK_MODEL"
export AWS_AUTH_MODE=explicit  # Local dev uses explicit credentials

echo -e "${GREEN}✓ Credentials exported${NC}"
echo ""

# -----------------------------------------------------------------------------
# Verify credentials are working
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 3: Verifying credentials...${NC}"
echo ""

if aws sts get-caller-identity > /dev/null 2>&1; then
    CALLER_IDENTITY=$(aws sts get-caller-identity)
    echo -e "${GREEN}✓ Credentials verified${NC}"
    echo ""
    echo "Account: $(echo $CALLER_IDENTITY | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)"
    echo "User: $(echo $CALLER_IDENTITY | grep -o '"Arn": "[^"]*"' | cut -d'"' -f4)"
    echo ""
else
    echo -e "${RED}Error: Credential verification failed${NC}"
    exit 1
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${GREEN}✓ AWS SSO credentials are ready!${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""
echo "Environment variables set:"
echo "  CLAUDE_CODE_USE_BEDROCK=1"
echo "  AWS_AUTH_MODE=explicit (local dev mode)"
echo "  AWS_REGION=$AWS_REGION"
echo "  AGENT_MODEL=$AGENT_MODEL"
echo "  AWS_ACCESS_KEY_ID=ASIA... (hidden)"
echo "  AWS_SECRET_ACCESS_KEY=*** (hidden)"
echo "  AWS_SESSION_TOKEN=*** (hidden)"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Run: bun run dev:full"
echo "  2. Create an app in Kova - it will use Bedrock!"
echo ""
echo -e "${YELLOW}Note: These credentials expire in 8-12 hours.${NC}"
echo -e "${YELLOW}Re-run this script when you see authentication errors.${NC}"
echo ""
