---
name: spreeform
description: Build UI with Spreeform, Spreetail's React component library built on shadcn/ui and Radix UI. Use when building user interfaces, creating components, or when the user mentions UI, buttons, forms, cards, dialogs, modals, navigation, or any visual elements.
---

# Spreeform UI Component Library

> **Package Version:** 0.0.39 | **Last Updated:** 2026-01-27 | **Refresh:** `/refresh-spreeform`

Spreeform is Spreetail's official React component library built on Radix UI primitives, shadcn/ui patterns, and Tailwind CSS v4.

## Quick Start

### 1. Install Dependencies

```bash
bun add @spreetail/spreeform tailwindcss@^4 tw-animate-css @tailwindcss/vite lucide-react
```

### 2. Configure CSS

Replace your `styles.css` (or `index.css`) with:

```css
@import '@spreetail/spreeform';

@source '../node_modules/@spreetail/spreeform/';
@source './**/*.{ts,tsx}';
```

**CRITICAL**: The `@source` directives are REQUIRED - they tell Tailwind v4 to scan Spreeform for utility classes.

### 3. Configure Vite

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
})
```

## Most Common Components

### Button

```tsx
import { Button } from "@spreetail/spreeform";

<Button variant="default" size="default">Click me</Button>
```

**Variants**: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
**Sizes**: `default`, `sm`, `lg`, `icon`

### Card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@spreetail/spreeform";

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Dialog (Modal)

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@spreetail/spreeform";

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    <div>Content</div>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button>Continue</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Select

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@spreetail/spreeform";

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
    <SelectItem value="2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Input & Form

```tsx
import { Input, Label } from "@spreetail/spreeform";

<div>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="Enter email..." />
</div>
```

### Table

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@spreetail/spreeform";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item 1</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## Page Layout

For full-page layouts with sidebar:

```tsx
import {
  Page, PageBody, PageContainer, PageHeader, PageHeaderContainer,
  PageHeaderContent, PageHeaderTitle, PageHeaderActions,
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarProvider,
  ThemeProvider, Toaster
} from "@spreetail/spreeform";

<ThemeProvider defaultTheme="system">
  <SidebarProvider>
    <Sidebar>
      <SidebarHeader>My App</SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>Dashboard</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
    <Page>
      <PageHeader>
        <PageHeaderContainer>
          <PageHeaderContent>
            <PageHeaderTitle>Dashboard</PageHeaderTitle>
          </PageHeaderContent>
          <PageHeaderActions>
            <Button>Action</Button>
          </PageHeaderActions>
        </PageHeaderContainer>
      </PageHeader>
      <PageBody>
        <PageContainer>Content</PageContainer>
      </PageBody>
    </Page>
  </SidebarProvider>
  <Toaster />
</ThemeProvider>
```

## Hooks

| Hook | Purpose |
|------|---------|
| `useTheme()` | Get/set current theme (`light`, `dark`, `system`) |
| `useSidebar()` | Control sidebar state (open, collapsed, toggle) |
| `useIsMobile()` | Detect mobile viewport |
| `useFormField()` | Access form field state in react-hook-form |

## Utilities

```tsx
import { cn, info, error } from "@spreetail/spreeform";

// Compose class names
<div className={cn("base", isActive && "active")} />

// Toast notifications
info("Info message");
error("Error message");
```

## Design Tokens

### Use Semantic Colors (NOT raw colors)

```tsx
// CORRECT - Use semantic tokens
<div className="bg-primary text-primary-foreground" />
<div className="bg-background text-foreground" />
<div className="bg-destructive text-destructive-foreground" />

// WRONG - Don't use raw color values
<div className="bg-teal-600" />  // Avoid this
```

### Available Semantic Tokens

| Token | Purpose |
|-------|---------|
| `background` / `foreground` | Page background and text |
| `primary` / `primary-foreground` | Primary actions (teal) |
| `secondary` / `secondary-foreground` | Secondary elements |
| `muted` / `muted-foreground` | Muted/subtle elements |
| `destructive` / `destructive-foreground` | Errors/danger (red) |
| `successful` | Success states (green) |
| `warning` | Warning states (yellow) |
| `border` | Border color |
| `ring` | Focus ring |

## Best Practices

1. **Use Spreeform components first** - Don't create custom components when Spreeform has one
2. **Use semantic tokens** - `bg-primary` not `bg-teal-600`
3. **Favor composition** - Components use composition pattern (Dialog + DialogTrigger + DialogContent)
4. **Preserve accessibility** - Built on Radix UI, maintains ARIA attributes

## Related Files

- **references/COMPONENTS.md** - Full component reference with all variants and props
- **references/TOKENS.md** - Complete design token reference (colors, typography, spacing)

## Maintenance

- **/refresh-spreeform** - Project-level command (in `.claude/skills/`) to refresh this documentation when the package is updated
