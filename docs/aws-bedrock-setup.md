# AWS Bedrock Setup Guide

This guide explains how to configure Kova to use AWS Bedrock instead of the direct Anthropic API for Claude Agent SDK authentication.

## Why Use Bedrock?

- **Existing AWS Infrastructure**: Use your organization's AWS accounts and billing
- **AWS SSO Integration**: Leverage existing SSO/IAM authentication
- **Cost Management**: Track costs through AWS Cost Explorer
- **Compliance**: Keep all API calls within your AWS environment

## Prerequisites

1. **AWS CLI installed**: `aws --version` should work
2. **AWS SSO configured**: You have an SSO profile set up
3. **Bedrock access**: Your AWS account has Claude models enabled in Bedrock

To check Bedrock access:
```bash
aws bedrock list-foundation-models --region us-east-1 | grep claude
```

## Setup Steps

### 1. Configure Your AWS Profile

Edit the helper script for your platform:

**Linux/macOS:**
```bash
# Edit scripts/refresh-aws-sso.sh
AWS_PROFILE="your-sso-profile-name"  # Change this
AWS_REGION="us-east-1"               # Change if needed
```

**Windows:**
```powershell
# Edit scripts/refresh-aws-sso.ps1
$AWS_PROFILE = "your-sso-profile-name"  # Change this
$AWS_REGION = "us-east-1"               # Change if needed
```

### 2. Run the Credential Refresh Script

**Linux/macOS:**
```bash
# Important: Use 'source' so environment variables persist in your shell
source ./scripts/refresh-aws-sso.sh
```

**Windows PowerShell:**
```powershell
# Run the PowerShell script
.\scripts\refresh-aws-sso.ps1
```

This will:
1. Open your browser for AWS SSO login
2. Export temporary credentials to your shell
3. Set `CLAUDE_CODE_USE_BEDROCK=1`
4. Set `AWS_AUTH_MODE=explicit` (for local dev)
5. Set `AGENT_MODEL` to Bedrock Sonnet 4.5 (default)
6. Verify credentials are working

### 3. Update Model Configuration (Optional)

The script uses **Claude Sonnet 4.5** by default. To use a different model, edit the script or set `BEDROCK_MODEL` before running:

**Linux/macOS:**
```bash
# Override model before running script
export BEDROCK_MODEL=us.anthropic.claude-opus-4-5-20251101-v1:0
source ./scripts/refresh-aws-sso.sh
```

**Windows PowerShell:**
```powershell
# Override model before running script
$env:BEDROCK_MODEL = "us.anthropic.claude-opus-4-5-20251101-v1:0"
.\scripts\refresh-aws-sso.ps1
```

Available Bedrock model IDs:
- `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Sonnet 4.5)
- `us.anthropic.claude-sonnet-4-20250514-v1:0` (Sonnet 4)
- `us.anthropic.claude-opus-4-5-20251101-v1:0` (Opus 4.5, if available)

### 4. Start Kova

**All Platforms:**
```bash
bun run dev:full
```

## Verification

Check the backend logs for Bedrock usage:

```bash
# Look for these indicators:
# - "CLAUDE_CODE_USE_BEDROCK" environment variable set
# - AWS credentials present in container environment
# - Successful Bedrock API calls
```

## Credential Expiration

AWS SSO credentials typically expire after **8-12 hours**.

**Symptoms of expired credentials:**
- Authentication errors in logs
- "ExpiredToken" errors
- Agent queries failing

**Solution:**

**Linux/macOS:**
```bash
source ./scripts/refresh-aws-sso.sh
bun run dev:full
```

**Windows:**
```powershell
.\scripts\refresh-aws-sso.ps1
bun run dev:full
```

## Architecture

### How Credentials Flow

```
┌─────────────────────────────────────────────┐
│  HOST (Your Machine)                        │
│                                             │
│  1. Run helper script (platform-specific)   │
│     Linux/macOS: source ./scripts/...sh    │
│     Windows:     .\scripts\...ps1          │
│     ↓                                       │
│  2. Script does aws sso login              │
│     ↓                                       │
│  3. Credentials cached in ~/.aws/sso/      │
│     ↓                                       │
│  4. Script exports to environment:         │
│     AWS_ACCESS_KEY_ID                      │
│     AWS_SECRET_ACCESS_KEY                  │
│     AWS_SESSION_TOKEN                      │
│     CLAUDE_CODE_USE_BEDROCK=1              │
│     ↓                                       │
│  4. Backend reads environment variables    │
│     ↓                                       │
│  5. Passes to containers via envArray      │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  CONTAINER: app-4                   │   │
│  │                                     │   │
│  │  • Has AWS credentials              │   │
│  │  • CLAUDE_CODE_USE_BEDROCK=1        │   │
│  │  • Claude Agent SDK detects Bedrock │   │
│  │  • Routes all calls through Bedrock │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Security Benefits

- ✅ **No ~/.aws/ mount**: Containers don't access host filesystem
- ✅ **Scoped credentials**: Containers only get current session's creds
- ✅ **Time-limited**: Credentials auto-expire
- ✅ **Isolated**: Each container has independent credential set
- ✅ **Auditable**: CloudTrail tracks all API calls

## Troubleshooting

### "aws: command not found"

Install AWS CLI:
```bash
# macOS
brew install awscli

# Linux
pip install awscli

# Windows
# Download from: https://aws.amazon.com/cli/
```

### "SSO session is invalid or expired"

Run the refresh script again:

**Linux/macOS:**
```bash
source ./scripts/refresh-aws-sso.sh
```

**Windows:**
```powershell
.\scripts\refresh-aws-sso.ps1
```

### "Unable to locate credentials"

**Linux/macOS:**
Make sure you used `source` (not just `./`):
```bash
# Wrong - exports won't persist
./scripts/refresh-aws-sso.sh

# Correct - exports persist in shell
source ./scripts/refresh-aws-sso.sh
```

**Windows:**
PowerShell scripts automatically set environment variables in the current session:
```powershell
# This is correct - just run the script
.\scripts\refresh-aws-sso.ps1
```

### "Model not found" or "Access denied"

Your AWS account may not have access to Claude models in Bedrock:

1. Go to AWS Console → Bedrock → Model access
2. Request access to Anthropic Claude models
3. Wait for approval (usually instant for most accounts)

### Credentials work in terminal but not in container

Check that backend is reading environment variables:
```bash
# In backend logs, look for:
console.log(config.CLAUDE_CODE_USE_BEDROCK)
console.log(config.AWS_REGION)
# Should show: '1' and 'us-east-1'
```

## References

- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [AWS Bedrock Claude Models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids-arns.html)
- [AWS SSO CLI Guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
