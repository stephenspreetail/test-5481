import { and, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { config } from "../../config/index.js";
import { db } from "../../db/index.js";
import { apps, chats } from "../../db/schema.js";
import { appContainerService } from "../../services/app-container.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const createWorkflowAppSchema = z.object({
  workflowType: z.enum(["excel-workflow", "image-forge", "data-platform"]),
  file: z.string(), // base64 encoded
  fileName: z.string(),
});

interface CreateWorkflowAppResponse {
  appId: number;
  chatId: number;
  initialPrompt: string;
  workflowDocFilename: string;
}

/**
 * Resolve the apps base path to an absolute path
 */
function resolveAppsBasePath(): string {
  const basePath = config.APPS_BASE_PATH;
  if (path.isAbsolute(basePath)) {
    return basePath;
  }
  return path.resolve(process.cwd(), basePath);
}

/**
 * Get the planning prompt for a workflow type
 * Simple prompt - the skill handles all the instructions.
 * Includes explicit output filename to ensure deterministic naming.
 */
function getPlanningPrompt(workflowType: string, fileName: string, outputFilename: string): string {
  switch (workflowType) {
    case "excel-workflow":
      return `document the workflow in '${fileName}' and write the documentation to '${outputFilename}'`;
    case "image-forge":
      return `analyze the UI image '${fileName}' and create an app planning document, writing it to '${outputFilename}'`;
    case "data-platform":
      return `Analyze the data platform configuration`;
    default:
      return `Analyze the uploaded file '${fileName}'`;
  }
}

export async function workflowAppRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * POST /api/workflows/create-app
   * Create a new app from a workflow file
   * - Creates app record in DB
   * - Starts container
   * - Writes file to container workspace
   * - Returns app/chat IDs and planning prompt
   */
  app.post(
    "/create-app",
    async (
      request: FastifyRequest<{ Body: z.infer<typeof createWorkflowAppSchema> }>,
      reply: FastifyReply
    ): Promise<CreateWorkflowAppResponse> => {
      const user = request.user!;
      const body = createWorkflowAppSchema.parse(request.body);
      const { workflowType, file, fileName } = body;

      const appsBasePath = resolveAppsBasePath();

      try {
        // 1. Create app record in DB
        const workbookName = fileName.replace(/\.[^/.]+$/, "");
        const timestamp = Date.now();
        const tempPath = `${user.userId}/temp-${timestamp}`;

        const appResult = await db
          .insert(apps)
          .values({
            userId: user.userId,
            name: workbookName,
            path: tempPath,
          })
          .returning();

        const insertedApp = appResult[0];

        // Update path to use the actual app ID
        const finalPath = `${user.userId}/${insertedApp.id}-${timestamp}`;
        const updatedAppResult = await db
          .update(apps)
          .set({ path: finalPath })
          .where(eq(apps.id, insertedApp.id))
          .returning();

        const newApp = updatedAppResult[0];

        // 2. Create initial chat for this app
        const chatResult = await db
          .insert(chats)
          .values({
            appId: newApp.id,
            title: "New Chat",
          })
          .returning();

        const chatId = chatResult[0].id;

        // 3. Create app directory and write file
        const appDir = path.join(appsBasePath, finalPath);
        if (!fs.existsSync(appDir)) {
          fs.mkdirSync(appDir, { recursive: true });
        }

        // Remove data URL prefix if present
        const base64Data = file.includes(",") ? file.split(",")[1] : file;
        const buffer = Buffer.from(base64Data, "base64");

        // Write file to app workspace
        const filePath = path.join(appDir, fileName);
        fs.writeFileSync(filePath, buffer);
        app.log.info(`Wrote workflow file to ${filePath}`);

        // 4. Start container for this app
        await appContainerService.startContainer({
          appId: newApp.id,
          userId: user.userId,
          appPath: finalPath,
        });

        app.log.info(`Started container for app ${newApp.id}`);

        // 5. Copy workflow file into container workspace
        const localFilePath = path.join(appDir, fileName);
        await appContainerService.copyFileToContainer(
          newApp.id,
          localFilePath,
          `/workspace/${fileName}`
        );

        app.log.info(`Copied workflow file to container for app ${newApp.id}`);

        // 6. Build the planning prompt and workflow doc filename
        const workflowDocFilename = workflowType === "image-forge"
          ? `${workbookName}_app_plan.md`
          : `${workbookName}_workflow.md`;
        const initialPrompt = getPlanningPrompt(workflowType, fileName, workflowDocFilename);

        return {
          appId: newApp.id,
          chatId,
          initialPrompt,
          workflowDocFilename,
        };
      } catch (error) {
        app.log.error(error, "Failed to create workflow app");
        reply.status(500);
        return {
          error: "Failed to create workflow app",
          details: (error as Error).message,
        } as unknown as CreateWorkflowAppResponse;
      }
    }
  );
}
