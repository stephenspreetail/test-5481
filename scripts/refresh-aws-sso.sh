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

# =============================================================================
# Setup and Configuration
# =============================================================================

# -----------------------------------------------------------------------------
# A: Configuration Defaults
# -----------------------------------------------------------------------------
# Available models:
#   us.anthropic.claude-sonnet-4-5-20250929-v1:0
#   us.anthropic.claude-sonnet-4-20250514-v1:0
#   us.anthropic.claude-opus-4-5-20251101-v1:0
#
# AWS Authentication Mode:
# - "explicit" (default, set by script): Pass credentials explicitly (local dev with SSO).
# - "pod-identity": Let containers discover credentials (EKS/K8s with Pod Identity).
#   For EKS deployment, set AWS_AUTH_MODE=pod-identity in your ConfigMap/Deployment.
# -----------------------------------------------------------------------------
DEFAULT_AWS_PROFILE="spreetail-dev"
DEFAULT_AWS_REGION="us-east-1"
DEFAULT_CLAUDE_CODE_USE_BEDROCK="1"    # Enable Bedrock integration
DEFAULT_AWS_AUTH_MODE="explicit"       # Local dev uses explicit credentials
DEFAULT_BEDROCK_MODEL="us.anthropic.claude-sonnet-4-5-20250929-v1:0"

AWS_PROFILE="${AWS_SSO_PROFILE:-$DEFAULT_AWS_PROFILE}"
AWS_REGION="${AWS_REGION:-$DEFAULT_AWS_REGION}"
BEDROCK_MODEL="${BEDROCK_MODEL:-$DEFAULT_BEDROCK_MODEL}"

# -----------------------------------------------------------------------------
# B: Color output
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Main script
# =============================================================================
echo -e "${YELLOW}==============================================================================${NC}"
echo -e "${YELLOW}AWS SSO Credential Refresh${NC}"
echo -e "${YELLOW}==============================================================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Check if AWS CLI is installed
# -----------------------------------------------------------------------------
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install it with: pip install awscli"
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: Login with AWS SSO
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 2: Logging into AWS SSO...${NC}"
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
# Step 3: Export credentials as environment variables
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 3: Exporting credentials to environment...${NC}"
echo ""

# Export credentials - this sets AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
if ! eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"; then
    echo -e "${RED}Error: Failed to export credentials${NC}"
    exit 1
fi

# Set additional required variables
export CLAUDE_CODE_USE_BEDROCK=$DEFAULT_CLAUDE_CODE_USE_BEDROCK
export AWS_REGION="$AWS_REGION"
export AGENT_MODEL="$BEDROCK_MODEL"
export AWS_AUTH_MODE=$DEFAULT_AWS_AUTH_MODE

echo -e "${GREEN}✓ Credentials exported${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 4: Verify credentials are working
# -----------------------------------------------------------------------------
echo -e "${GREEN}Step 4: Verifying credentials...${NC}"
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
echo "  CLAUDE_CODE_USE_BEDROCK=$CLAUDE_CODE_USE_BEDROCK"
echo "  AWS_AUTH_MODE=$AWS_AUTH_MODE"
echo "  AWS_REGION=$AWS_REGION"
echo "  AGENT_MODEL=$AGENT_MODEL"
echo "  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:0:10}... (hidden)"
echo "  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:0:3}*** (hidden)"
echo "  AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN:0:10}... (hidden)"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Run: bun run dev:full"
echo "  2. Create an app in Kova - it will use Bedrock!"
echo ""
echo -e "${YELLOW}Note: These credentials expire in 8-12 hours.${NC}"
echo -e "${YELLOW}Re-run this script when you see authentication errors.${NC}"
echo ""
