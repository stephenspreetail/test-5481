# Dyad Web App

A web-based version of the Dyad AI app builder. Build AI-powered applications through natural language conversations, just like the original Dyad Electron app, but running entirely in your browser.

![Dyad Web](https://via.placeholder.com/800x400?text=Dyad+Web+App)

## ✨ Features

- **🤖 AI-Powered**: Create apps using natural language with Claude, GPT-4, or Gemini
- **💬 Chat Interface**: Conversational UI for building and iterating on your apps
- **🔐 Secure**: JWT-based authentication with bcrypt password hashing
- **⚡ Real-time Streaming**: Server-sent events for live AI responses
- **📦 Modern Stack**: React + TypeScript + Vite frontend, Express + SQLite backend
- **🎨 Beautiful UI**: Built with Tailwind CSS and Radix UI components
- **🌐 Web-Based**: No desktop installation required - works in any modern browser

## 🏗️ Architecture

```
dyad-web-app/
├── backend/          # Express API server
│   ├── src/
│   │   ├── routes/   # API endpoints (auth, apps, chats, ai)
│   │   ├── db/       # Database schema and connection
│   │   └── auth/     # JWT authentication
│   └── drizzle/      # Database migrations
│
└── frontend/         # React + Vite app
    ├── src/
    │   ├── pages/    # Page components (Home, Login, Chat)
    │   ├── components/ # Reusable UI components
    │   ├── contexts/ # React contexts (Auth)
    │   └── lib/      # Utilities and API client
    └── public/
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- At least one AI provider API key (OpenAI, Anthropic, or Google)

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd dyad-web-app
```

2. **Set up the backend**
```bash
cd backend
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env and add your AI API keys
```

3. **Initialize the database**
```bash
cd backend
npm run db:generate
npm run db:push
```

4. **Set up the frontend**
```bash
cd frontend
npm install

# Copy environment file
cp .env.example .env
```

5. **Start the development servers**

In one terminal (backend):
```bash
cd backend
npm run dev
```

In another terminal (frontend):
```bash
cd frontend
npm run dev
```

6. **Open your browser**

Navigate to `http://localhost:5173`

## 🔑 Configuration

### Backend Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=./data/dyad.db

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-jwt-key-change-this

# AI Provider API Keys (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# CORS Origins
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:3001
```

## 📖 Usage

1. **Sign up** for a new account or **login** if you already have one
2. **Describe your app** in natural language on the home page
3. **Chat with the AI** to build and refine your application
4. **Iterate** on your design through conversation

Example prompts:
- "Build me a todo list app with drag and drop"
- "Create a weather dashboard that shows the forecast"
- "Make a recipe manager with search and categories"

## 🛠️ Development

### Backend Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm start            # Run production build
npm run db:generate  # Generate database migrations
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio (database GUI)
```

### Frontend Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## 🐳 Docker Deployment

### Using Docker Compose

```bash
# From the root directory
docker-compose up -d
```

This will start both the backend and frontend services.

### Manual Docker Build

**Backend:**
```bash
cd backend
docker build -t dyad-backend .
docker run -p 3001:3001 -v $(pwd)/data:/app/data dyad-backend
```

**Frontend:**
```bash
cd frontend
docker build -t dyad-frontend .
docker run -p 5173:5173 dyad-frontend
```

## 📊 API Documentation

### Authentication

- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/login` - Login and receive JWT token
- `GET /api/auth/me` - Get current user info

### Apps

- `GET /api/apps` - List all apps for current user
- `GET /api/apps/:id` - Get specific app
- `POST /api/apps` - Create new app
- `PATCH /api/apps/:id` - Update app
- `DELETE /api/apps/:id` - Delete app

### Chats

- `GET /api/chats/app/:appId` - Get all chats for an app
- `GET /api/chats/:id` - Get chat with messages
- `POST /api/chats` - Create new chat
- `PATCH /api/chats/:id` - Update chat
- `DELETE /api/chats/:id` - Delete chat
- `GET /api/chats/:id/messages` - Get messages for chat
- `POST /api/chats/:id/messages` - Add message to chat

### AI

- `POST /api/ai/stream` - Stream AI responses (SSE)
- `POST /api/ai/chat` - Get AI response (non-streaming)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Original [Dyad](https://github.com/dyad-sh/dyad) Electron app by the Dyad team
- [Vercel AI SDK](https://sdk.vercel.ai/) for AI provider integrations
- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Drizzle ORM](https://orm.drizzle.team/) for database management

## 🐛 Known Issues & Limitations

- This is a simplified web version - some advanced features from the Electron app may not be available
- File system operations are limited compared to the desktop version
- No offline support (requires internet connection)

## 🗺️ Roadmap

- [ ] App preview panel
- [ ] Code editor integration
- [ ] GitHub integration
- [ ] Vercel deployment integration
- [ ] Template library
- [ ] Collaborative editing
- [ ] Export to various frameworks

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-repo/issues) page
2. Create a new issue if your problem isn't already listed
3. Provide as much detail as possible about the problem

---

Made with ❤️ by the community
