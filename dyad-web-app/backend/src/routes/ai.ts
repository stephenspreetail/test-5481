import { Router } from 'express';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { db } from '../db/index.js';
import { chats, messages, apps } from '../db/schema.js';
import { authMiddleware, type AuthRequest } from '../auth/middleware.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Helper function to get the AI model
function getModel(provider: string, modelName: string) {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelName || 'claude-3-5-sonnet-20241022');
    case 'openai':
      return openai(modelName || 'gpt-4o');
    case 'google':
      return google(modelName || 'gemini-1.5-pro');
    default:
      return anthropic('claude-3-5-sonnet-20241022');
  }
}

// Stream chat completion
router.post('/stream', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const {
      chatId,
      prompt,
      provider = 'anthropic',
      modelName,
    } = req.body;

    if (!chatId || !prompt) {
      return res.status(400).json({ error: 'Chat ID and prompt are required' });
    }

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        app: true,
        messages: {
          orderBy: [messages.createdAt],
        },
      },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Save user message
    await db.insert(messages).values({
      chatId,
      role: 'user',
      content: prompt,
    });

    // Build conversation history
    const conversationMessages = chat.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the new user message
    conversationMessages.push({
      role: 'user',
      content: prompt,
    });

    // Get the AI model
    const model = getModel(provider, modelName);

    // System prompt for the AI builder
    const systemPrompt = `You are an expert AI app builder assistant. You help users create web applications by understanding their requirements and generating clean, modern code using React, TypeScript, and other modern web technologies.

When building apps:
1. Write clean, well-structured code
2. Use modern best practices
3. Include helpful comments
4. Create responsive, accessible interfaces
5. Suggest improvements when appropriate

Always provide complete, working code examples when requested.`;

    // Stream the response
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: conversationMessages,
      temperature: 0.7,
    });

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    // Stream the response to the client
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }

    // Save assistant message
    await db.insert(messages).values({
      chatId,
      role: 'assistant',
      content: fullResponse,
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Stream error:', error);

    // Try to send error through SSE if headers not sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream response' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`);
      res.end();
    }
  }
});

// Non-streaming chat completion (for compatibility)
router.post('/chat', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const {
      chatId,
      prompt,
      provider = 'anthropic',
      modelName,
    } = req.body;

    if (!chatId || !prompt) {
      return res.status(400).json({ error: 'Chat ID and prompt are required' });
    }

    // Get the chat and verify ownership
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        app: true,
        messages: {
          orderBy: [messages.createdAt],
        },
      },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.app.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Save user message
    const userMessage = await db.insert(messages).values({
      chatId,
      role: 'user',
      content: prompt,
    }).returning();

    // Build conversation history
    const conversationMessages = chat.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the new user message
    conversationMessages.push({
      role: 'user',
      content: prompt,
    });

    // Get the AI model
    const model = getModel(provider, modelName);

    // System prompt
    const systemPrompt = `You are an expert AI app builder assistant. You help users create web applications.`;

    // Get completion
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: conversationMessages,
      temperature: 0.7,
    });

    // Get the full text
    const fullText = await result.text;

    // Save assistant message
    const assistantMessage = await db.insert(messages).values({
      chatId,
      role: 'assistant',
      content: fullText,
    }).returning();

    res.json({
      userMessage: userMessage[0],
      assistantMessage: assistantMessage[0],
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

export default router;
