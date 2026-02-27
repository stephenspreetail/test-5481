import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the config module before importing the service
vi.mock("../../config/index.js", () => ({
  config: {
    K8S_ENVIRONMENT: undefined,
    K8S_CONTEXT: undefined,
    K8S_NAMESPACE: undefined,
    PREVIEW_DOMAIN: undefined,
    PREVIEW_PORT: undefined,
    CONTAINER_IMAGE: "kova-app-container:latest",
    KOVA_INSTANCE_ID: undefined,
    PREVIEW_URL_MODE: undefined,
  },
}));

// Mock app-identifiers to return a stable default instance ID
vi.mock("../../utils/app-identifiers.js", () => ({
  getDefaultInstanceId: () => "test-host",
}));

import {
  buildK8sEnvironmentConfig,
  detectK8sEnvironment,
} from "../k8s-environment.service.js";
import { config } from "../../config/index.js";

// Cast config to any for testing
const mockConfig = config as any;

describe("k8s-environment.service", () => {
  beforeEach(() => {
    // Reset config before each test
    mockConfig.K8S_ENVIRONMENT = undefined;
    mockConfig.K8S_CONTEXT = undefined;
    mockConfig.K8S_NAMESPACE = undefined;
    mockConfig.PREVIEW_DOMAIN = undefined;
    mockConfig.PREVIEW_PORT = undefined;
    mockConfig.CONTAINER_IMAGE = "kova-app-container:latest";
    mockConfig.KOVA_INSTANCE_ID = undefined;
    mockConfig.PREVIEW_URL_MODE = undefined;
  });

  describe("detectK8sEnvironment", () => {
    it("should default to local if not set", () => {
      expect(detectK8sEnvironment()).toBe("local");
    });

    it("should use explicit environment if set", () => {
      mockConfig.K8S_ENVIRONMENT = "eks-dev" as any;
      expect(detectK8sEnvironment()).toBe("eks-dev");
    });
  });

  describe("buildK8sEnvironmentConfig", () => {
    it("should use local environment defaults", () => {
      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig).toMatchObject({
        environment: "local",
        context: "k3d-kova-dev",
        namespace: "kova-apps",
        previewDomain: "dev.toolkit.co",
        previewPort: 8443,
        isEKS: false,
        storageClass: "local-path",
        instanceId: "test-host",
        previewUrlMode: "prefixed",
      });
    });

    it("should use eks-dev environment defaults", () => {
      mockConfig.K8S_ENVIRONMENT = "eks-dev" as any;

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.environment).toBe("eks-dev");
      expect(envConfig.context).toBe("dev01-eks-kova");
      expect(envConfig.namespace).toBe("kova-apps");
      expect(envConfig.previewDomain).toBe("kova.eks.dev01.tk.dev");
      expect(envConfig.previewPort).toBe(443);
      expect(envConfig.isEKS).toBe(true);
    });

    it("should allow overriding context", () => {
      mockConfig.K8S_CONTEXT = "custom-context";

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.context).toBe("custom-context");
      // Other defaults still apply
      expect(envConfig.namespace).toBe("kova-apps");
    });

    it("should allow overriding namespace", () => {
      mockConfig.K8S_NAMESPACE = "custom-namespace";

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.namespace).toBe("custom-namespace");
      // Other defaults still apply
      expect(envConfig.context).toBe("k3d-kova-dev");
    });

    it("should allow overriding preview domain and port", () => {
      mockConfig.PREVIEW_DOMAIN = "custom.domain.com";
      mockConfig.PREVIEW_PORT = 9443 as any;

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.previewDomain).toBe("custom.domain.com");
      expect(envConfig.previewPort).toBe(9443);
    });

    it("should allow multiple overrides simultaneously", () => {
      mockConfig.K8S_ENVIRONMENT = "eks-dev" as any;
      mockConfig.K8S_CONTEXT = "custom-context";
      mockConfig.K8S_NAMESPACE = "custom-namespace";

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.environment).toBe("eks-dev");
      expect(envConfig.context).toBe("custom-context");
      expect(envConfig.namespace).toBe("custom-namespace");
      // Preview settings still use eks-dev defaults
      expect(envConfig.previewPort).toBe(443);
    });

    it("should use KOVA_INSTANCE_ID when set", () => {
      mockConfig.KOVA_INSTANCE_ID = "my-instance";

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.instanceId).toBe("my-instance");
    });

    it("should default instanceId from getDefaultInstanceId", () => {
      const envConfig = buildK8sEnvironmentConfig();
      expect(envConfig.instanceId).toBe("test-host");
    });

    it("should use PREVIEW_URL_MODE when set", () => {
      mockConfig.PREVIEW_URL_MODE = "slug";

      const envConfig = buildK8sEnvironmentConfig();

      expect(envConfig.previewUrlMode).toBe("slug");
    });
  });
});
