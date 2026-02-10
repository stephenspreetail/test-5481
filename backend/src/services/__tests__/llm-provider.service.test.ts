import { describe, it, expect } from "vitest";
import {
  buildLlmEnvironment,
  type LlmProviderConfig,
} from "../llm-provider.service.js";

describe("llm-provider.service", () => {
  describe("buildLlmEnvironment", () => {
    it("should build environment for anthropic provider", () => {
      const config: LlmProviderConfig = {
        provider: "anthropic",
        apiKey: "sk-ant-test-key",
        model: "claude-opus-4-6",
      };

      const env = buildLlmEnvironment(config);

      expect(env).toEqual({
        ANTHROPIC_API_KEY: "sk-ant-test-key",
        AGENT_MODEL: "claude-opus-4-6",
        ANTHROPIC_MODEL: "claude-opus-4-6",
        // Model alias mappings (Anthropic full model names)
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5-20250929",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-5-20250929",
      });
    });

    it("should build environment for azure provider", () => {
      const config: LlmProviderConfig = {
        provider: "azure",
        apiKey: "azure-foundry-key",
        baseUrl: "https://foundry.openai.azure.com/anthropic",
        model: "claude-opus-4-6",
      };

      const env = buildLlmEnvironment(config);

      expect(env).toEqual({
        ANTHROPIC_API_KEY: "azure-foundry-key",
        ANTHROPIC_BASE_URL: "https://foundry.openai.azure.com/anthropic",
        AGENT_MODEL: "claude-opus-4-6",
        ANTHROPIC_MODEL: "claude-opus-4-6",
        // Model alias mappings (Azure deployment names)
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-5",
      });
    });

    it("should build environment for bedrock provider with explicit auth", () => {
      const config: LlmProviderConfig = {
        provider: "bedrock",
        model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        awsRegion: "us-east-1",
        awsAuthMode: "explicit",
        awsAccessKeyId: "AKIATEST",
        awsSecretAccessKey: "secret-key",
        awsSessionToken: "session-token",
      };

      const env = buildLlmEnvironment(config);

      expect(env).toEqual({
        CLAUDE_CODE_USE_BEDROCK: "1",
        AGENT_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        ANTHROPIC_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIATEST",
        AWS_SECRET_ACCESS_KEY: "secret-key",
        AWS_SESSION_TOKEN: "session-token",
        // Model alias mappings (Bedrock inference profile ARNs)
        ANTHROPIC_DEFAULT_OPUS_MODEL: "us.anthropic.claude-opus-4-6-v1:0",
        ANTHROPIC_DEFAULT_SONNET_MODEL:
          "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "us.anthropic.claude-haiku-4-5-v1:0",
        CLAUDE_CODE_SUBAGENT_MODEL:
          "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      });
    });

    it("should build environment for bedrock provider with pod-identity auth", () => {
      const config: LlmProviderConfig = {
        provider: "bedrock",
        model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        awsRegion: "us-east-1",
        awsAuthMode: "pod-identity",
        // Credentials should NOT be passed in pod-identity mode
        awsAccessKeyId: "AKIATEST",
        awsSecretAccessKey: "secret-key",
      };

      const env = buildLlmEnvironment(config);

      expect(env).toEqual({
        CLAUDE_CODE_USE_BEDROCK: "1",
        AGENT_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        ANTHROPIC_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        AWS_REGION: "us-east-1",
        // Model alias mappings (Bedrock inference profile ARNs)
        ANTHROPIC_DEFAULT_OPUS_MODEL: "us.anthropic.claude-opus-4-6-v1:0",
        ANTHROPIC_DEFAULT_SONNET_MODEL:
          "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "us.anthropic.claude-haiku-4-5-v1:0",
        CLAUDE_CODE_SUBAGENT_MODEL:
          "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        // No AWS credentials
      });
    });

    it("should handle missing optional fields", () => {
      const config: LlmProviderConfig = {
        provider: "anthropic",
        model: "claude-opus-4-6",
        // No API key
      };

      const env = buildLlmEnvironment(config);

      expect(env).toEqual({
        AGENT_MODEL: "claude-opus-4-6",
        ANTHROPIC_MODEL: "claude-opus-4-6",
        // Model alias mappings are still set
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5-20250929",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-5-20250929",
        // No ANTHROPIC_API_KEY key in output
      });
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    });
  });
});
