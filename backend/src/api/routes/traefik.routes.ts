/**
 * Traefik Routes
 * Serves dynamic Traefik configuration for the HTTP provider
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config/index.js";
import { appContainerService } from "../../services/app-container.service.js";

// Track last heartbeat log time and container count for change detection
let lastHeartbeatLog = 0;
let lastContainerCount = 0;
const TRAEFIK_HEARTBEAT_INTERVAL_MS = config.TRAEFIK_HEARTBEAT_INTERVAL_MS;

/**
 * Generate Traefik HTTP provider configuration for all running app containers
 */
function generateTraefikConfig(): object {
  const runningContainers = appContainerService.getRunningContainers();

  const routers: Record<string, object> = {};
  const services: Record<string, object> = {};

  for (const [appId, containerInfo] of runningContainers) {
    const routerName = `app-${appId}`;
    const serviceName = `app-${appId}`;

    // Router configuration
    routers[routerName] = {
      rule: `Host(\`${containerInfo.containerName}.${config.PREVIEW_DOMAIN}\`)`,
      entryPoints: ["preview"],
      service: serviceName,
    };

    // Service configuration - route to container on docker network
    services[serviceName] = {
      loadBalancer: {
        servers: [
          {
            url: `http://${containerInfo.containerName}:${config.DEV_SERVER_PORT}`,
          },
        ],
      },
    };
  }

  return {
    http: {
      routers,
      services,
    },
  };
}

export async function traefikRoutes(app: FastifyInstance): Promise<void> {
  // Serve Traefik dynamic configuration
  // This endpoint is polled by Traefik's HTTP provider every 2 seconds
  // We suppress logging to reduce noise - only log heartbeat once per minute
  // or when container count changes
  app.get(
    "/config",
    {
      // Disable request logging for this endpoint
      logLevel: "silent",
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const traefikConfig = generateTraefikConfig();
      const containerCount = appContainerService.getRunningContainers().size;
      const now = Date.now();

      // Log if container count changed or heartbeat interval passed
      const timestamp = new Date().toLocaleString();
      if (containerCount !== lastContainerCount) {
        console.log(
          `[${timestamp}] [Traefik] Route config updated: ${containerCount} container(s) active`,
        );
        lastContainerCount = containerCount;
        lastHeartbeatLog = now;
      } else if (now - lastHeartbeatLog >= TRAEFIK_HEARTBEAT_INTERVAL_MS) {
        console.log(
          `[${timestamp}] [Traefik] ${containerCount} container(s) active`,
        );
        lastHeartbeatLog = now;
      }

      return reply.send(traefikConfig);
    },
  );
}
