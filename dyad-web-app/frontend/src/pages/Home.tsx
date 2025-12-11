import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { appsApi } from '@/lib/api';
import { generateCuteAppName } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Sparkles } from 'lucide-react';

const INSPIRATION_PROMPTS = [
  { label: 'Todo App', icon: '📝' },
  { label: 'Weather Dashboard', icon: '🌤️' },
  { label: 'Recipe Manager', icon: '🍳' },
];

export function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) return;

    setLoading(true);

    try {
      // Create the app
      const result = await appsApi.create(generateCuteAppName());

      // Navigate to chat with the initial prompt
      navigate(`/chat/${result.chatId}`, { state: { initialPrompt: prompt } });
    } catch (error) {
      console.error('Failed to create app:', error);
      alert('Failed to create app. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold">Dyad</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="outline" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
            Build AI Apps, Instantly
          </h2>
          <p className="text-xl text-muted-foreground">
            Describe your app and watch it come to life with AI
          </p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>What do you want to build?</CardTitle>
            <CardDescription>
              Tell me about the app you'd like to create
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Build me a..."
                  className="text-lg h-12"
                  disabled={loading}
                />
                <Button type="submit" size="lg" disabled={loading || !prompt.trim()}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </form>

            {/* Inspiration Prompts */}
            <div className="mt-6">
              <p className="text-sm text-muted-foreground mb-3">
                Try one of these:
              </p>
              <div className="flex flex-wrap gap-2">
                {INSPIRATION_PROMPTS.map((item, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    onClick={() => setPrompt(`Build me a ${item.label}`)}
                    disabled={loading}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">⚡ Fast</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Get your app up and running in minutes, not days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">🔒 Private</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Your data stays yours. Full control over your apps
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">🎨 Beautiful</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Modern, responsive designs out of the box
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
