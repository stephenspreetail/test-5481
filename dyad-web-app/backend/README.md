# Dyad Web - Backend API

This is the backend API server for the Dyad Web application - a web-based version of the Dyad AI app builder.

## Features

- **Authentication**: JWT-based user authentication
- **Apps Management**: Create, read, update, and delete apps
- **Chat System**: Multi-chat support with conversation history
- **AI Integration**: Streaming AI responses using Anthropic Claude, OpenAI GPT, and Google Gemini
- **Database**: SQLite with Drizzle ORM

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Add your AI API keys to `.env`:
```env
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
GOOGLE_API_KEY=your-key-here
```

4. Generate and push the database schema:
```bash
npm run db:generate
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The server will run on `http://localhost:3001`.

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

### Apps
- `GET /api/apps` - Get all apps
- `GET /api/apps/:id` - Get a specific app
- `POST /api/apps` - Create a new app
- `PATCH /api/apps/:id` - Update an app
- `DELETE /api/apps/:id` - Delete an app

### Chats
- `GET /api/chats/app/:appId` - Get all chats for an app
- `GET /api/chats/:id` - Get a chat with messages
- `POST /api/chats` - Create a new chat
- `PATCH /api/chats/:id` - Update a chat
- `DELETE /api/chats/:id` - Delete a chat
- `GET /api/chats/:id/messages` - Get messages for a chat
- `POST /api/chats/:id/messages` - Add a message to a chat

### AI
- `POST /api/ai/stream` - Stream AI responses (Server-Sent Events)
- `POST /api/ai/chat` - Get AI response (non-streaming)

## Database

The application uses SQLite with Drizzle ORM. The database file is stored in `data/dyad.db`.

To view and edit the database:
```bash
npm run db:studio
```

## Development

```bash
npm run dev  # Start with hot reload
npm run build  # Build for production
npm start  # Run production build
```

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite + Drizzle ORM
- **AI SDKs**: Vercel AI SDK with Anthropic, OpenAI, and Google providers
- **Authentication**: JWT with bcrypt
