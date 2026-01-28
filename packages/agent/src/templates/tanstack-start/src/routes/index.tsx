import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">
          Welcome to {{PROJECT_NAME}}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Built with TanStack Start and Spreeform
        </p>
      </div>
    </div>
  )
}
