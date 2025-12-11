import { Router } from 'express';
import { db } from '../db/index.js';
import { apps, chats } from '../db/schema.js';
import { authMiddleware, type AuthRequest } from '../auth/middleware.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all apps for the current user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    const userApps = await db.query.apps.findMany({
      where: eq(apps.userId, userId),
      orderBy: [desc(apps.updatedAt)],
    });

    res.json({ apps: userApps });
  } catch (error) {
    console.error('Get apps error:', error);
    res.status(500).json({ error: 'Failed to get apps' });
  }
});

// Get a specific app
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const appId = parseInt(req.params.id);

    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.userId, userId)),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    res.json({ app });
  } catch (error) {
    console.error('Get app error:', error);
    res.status(500).json({ error: 'Failed to get app' });
  }
});

// Create a new app
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'App name is required' });
    }

    // Create a unique path for the app
    const appPath = path.join(
      __dirname,
      '../../data/apps',
      userId.toString(),
      uuidv4()
    );

    // Ensure the directory exists
    fs.mkdirSync(appPath, { recursive: true });

    // Create the app in the database
    const result = await db.insert(apps).values({
      userId,
      name,
      path: appPath,
    }).returning();

    const app = result[0];

    // Create an initial chat for this app
    const chatResult = await db.insert(chats).values({
      appId: app.id,
      title: 'New Chat',
    }).returning();

    const chat = chatResult[0];

    res.json({
      app,
      chatId: chat.id,
    });
  } catch (error) {
    console.error('Create app error:', error);
    res.status(500).json({ error: 'Failed to create app' });
  }
});

// Update an app
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const appId = parseInt(req.params.id);

    // Verify ownership
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.userId, userId)),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Update the app
    const result = await db
      .update(apps)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId))
      .returning();

    res.json({ app: result[0] });
  } catch (error) {
    console.error('Update app error:', error);
    res.status(500).json({ error: 'Failed to update app' });
  }
});

// Delete an app
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const appId = parseInt(req.params.id);

    // Verify ownership
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.userId, userId)),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Delete the app directory if it exists
    if (fs.existsSync(app.path)) {
      fs.rmSync(app.path, { recursive: true, force: true });
    }

    // Delete from database (cascades to chats and messages)
    await db.delete(apps).where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete app error:', error);
    res.status(500).json({ error: 'Failed to delete app' });
  }
});

export default router;
