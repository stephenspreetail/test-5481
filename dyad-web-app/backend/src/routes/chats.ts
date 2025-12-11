import { Router } from 'express';
import { db } from '../db/index.js';
import { chats, messages, apps } from '../db/schema.js';
import { authMiddleware, type AuthRequest } from '../auth/middleware.js';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all chats for a specific app
router.get('/app/:appId', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const appId = parseInt(req.params.appId);

    // Verify the user owns the app
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.userId, userId)),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get all chats for this app
    const appChats = await db.query.chats.findMany({
      where: eq(chats.appId, appId),
      orderBy: [desc(chats.createdAt)],
    });

    res.json({ chats: appChats });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

// Get a specific chat with messages
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id);

    // Get the chat
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        app: true,
        messages: {
          orderBy: [desc(messages.createdAt)],
        },
      },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify the user owns the app
    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ chat });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

// Create a new chat
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { appId, title } = req.body;

    if (!appId) {
      return res.status(400).json({ error: 'App ID is required' });
    }

    // Verify the user owns the app
    const app = await db.query.apps.findFirst({
      where: and(eq(apps.id, appId), eq(apps.userId, userId)),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Create the chat
    const result = await db.insert(chats).values({
      appId,
      title: title || 'New Chat',
    }).returning();

    res.json({ chat: result[0] });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Update a chat
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id);

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Update the chat
    const result = await db
      .update(chats)
      .set(req.body)
      .where(eq(chats.id, chatId))
      .returning();

    res.json({ chat: result[0] });
  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

// Delete a chat
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id);

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete the chat (cascades to messages)
    await db.delete(chats).where(eq(chats.id, chatId));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// Get messages for a chat
router.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id);

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get messages
    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: [messages.createdAt],
    });

    res.json({ messages: chatMessages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Add a message to a chat
router.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const chatId = parseInt(req.params.id);
    const { role, content } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Create the message
    const result = await db.insert(messages).values({
      chatId,
      role,
      content,
    }).returning();

    res.json({ message: result[0] });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

export default router;
