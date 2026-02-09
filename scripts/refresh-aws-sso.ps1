# =============================================================================
# AWS SSO Credential Refresh Script (PowerShell)
# =============================================================================
# This script logs into AWS SSO and exports temporary credentials as
# environment variables that can be used by Kova's backend and app containers.
#
# Usage:
#   1. Edit this script to set your AWS_PROFILE
#   2. Run in PowerShell: .\scripts\refresh-aws-sso.ps1
#   3. Start Kova: bun run dev:full
#
# Note: SSO credentials typically expire after 8-12 hours. Re-run this script
#       when you see authentication errors.
# =============================================================================

# Stop on errors
$ErrorActionPreference = "Stop"

# =============================================================================
# Setup and Configuration
# =============================================================================

# -----------------------------------------------------------------------------
# Configuration Defaults
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
$DEFAULT_AWS_PROFILE = "spreetail-dev"
$DEFAULT_AWS_REGION = "us-east-1"
$DEFAULT_CLAUDE_CODE_USE_BEDROCK = "1"    # Enable Bedrock integration
$DEFAULT_AWS_AUTH_MODE = "explicit"       # Local dev uses explicit credentials
$DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

$AWS_PROFILE = if ($env:AWS_SSO_PROFILE) { $env:AWS_SSO_PROFILE } else { $DEFAULT_AWS_PROFILE }
$AWS_REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { $DEFAULT_AWS_REGION }
$BEDROCK_MODEL = if ($env:BEDROCK_MODEL) { $env:BEDROCK_MODEL } else { $DEFAULT_BEDROCK_MODEL }

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

# =============================================================================
# Main script
# =============================================================================
Write-Host "==============================================================================" -ForegroundColor Yellow
Write-Host "AWS SSO Credential Refresh" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Yellow
Write-Host ""

# -----------------------------------------------------------------------------
# Step 1: Check if AWS CLI is installed
# -----------------------------------------------------------------------------
try {
    $null = Get-Command aws -ErrorAction Stop
} catch {
    Write-Error "Error: AWS CLI is not installed"
    Write-Host "Install it from: https://aws.amazon.com/cli/"
    exit 1
}

# -----------------------------------------------------------------------------
# Step 2: Login with AWS SSO
# -----------------------------------------------------------------------------
Write-Success "Step 2: Logging into AWS SSO..."
Write-Host "Profile: $AWS_PROFILE"
Write-Host ""

try {
    aws sso login --profile $AWS_PROFILE
} catch {
    Write-Error "Error: AWS SSO login failed"
    exit 1
}

Write-Host ""
Write-Success "[OK] AWS SSO login successful"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 3: Export credentials as environment variables
# -----------------------------------------------------------------------------
Write-Success "Step 3: Exporting credentials to environment..."
Write-Host ""

try {
    # Get credentials in env format
    $credentialsJson = aws configure export-credentials --profile $AWS_PROFILE --format env-no-export 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to export credentials"
    }

    # Parse and set environment variables
    # This will set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN
    $credentialsJson -split "`n" | ForEach-Object {
        if ($_ -match '^(AWS_[^=]+)=(.+)$') {
            $varName = $matches[1]
            $varValue = $matches[2]
            Set-Item -Path "env:$varName" -Value $varValue
        }
    }
} catch {
    Write-Error "Error: Failed to export credentials"
    Write-Error $_.Exception.Message
    exit 1
}

# Set additional required variables
$env:CLAUDE_CODE_USE_BEDROCK = $DEFAULT_CLAUDE_CODE_USE_BEDROCK
$env:AWS_AUTH_MODE = $DEFAULT_AWS_AUTH_MODE
$env:AWS_REGION = $AWS_REGION
$env:AGENT_MODEL = $BEDROCK_MODEL

Write-Success "[OK] Credentials exported"
Write-Host ""

# -----------------------------------------------------------------------------
# Step 4: Verify credentials are working
# -----------------------------------------------------------------------------
Write-Success "Step 4: Verifying credentials..."
Write-Host ""

try {
    $callerIdentity = aws sts get-caller-identity 2>&1 | ConvertFrom-Json

    Write-Success "[OK] Credentials verified"
    Write-Host ""
    Write-Host "Account: $($callerIdentity.Account)"
    Write-Host "User: $($callerIdentity.Arn)"
    Write-Host ""
} catch {
    Write-Error "Error: Credential verification failed"
    exit 1
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Info "=============================================================================="
Write-Success "[OK] AWS SSO credentials are ready!"
Write-Info "=============================================================================="
Write-Host ""
Write-Host "Environment variables set:"
Write-Host "  CLAUDE_CODE_USE_BEDROCK=$env:CLAUDE_CODE_USE_BEDROCK"
Write-Host "  AWS_AUTH_MODE=$env:AWS_AUTH_MODE"
Write-Host "  AWS_REGION=$env:AWS_REGION"
Write-Host "  AGENT_MODEL=$env:AGENT_MODEL"
Write-Host "  AWS_ACCESS_KEY_ID=$($env:AWS_ACCESS_KEY_ID.Substring(0, 10))... (hidden)"
Write-Host "  AWS_SECRET_ACCESS_KEY=$($env:AWS_SECRET_ACCESS_KEY.Substring(0, 3))*** (hidden)"
Write-Host "  AWS_SESSION_TOKEN=$($env:AWS_SESSION_TOKEN.Substring(0, 10))... (hidden)"
Write-Host ""
Write-Success "Next steps:"
Write-Host "  1. Run: bun run dev:full"
Write-Host "  2. Create an app in Kova - it will use Bedrock!"
Write-Host ""
Write-Info "Note: These credentials expire in 8-12 hours."
Write-Info "Re-run this script when you see authentication errors."
Write-Host ""
