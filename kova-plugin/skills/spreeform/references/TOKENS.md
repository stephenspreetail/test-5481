# Spreeform Design Tokens

Complete reference for Spreeform's design tokens: colors, typography, spacing, and sizing.

## Color System

### Semantic Tokens (USE THESE)

Always use semantic tokens instead of raw color values. These automatically adapt to light/dark themes.

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `background` | white | neutral-950 | Page/surface background |
| `foreground` | neutral-900 | neutral-50 | Primary text |
| `primary` | teal-600 | teal-400 | Primary brand/action |
| `primary-foreground` | white | neutral-950 | Text on primary |
| `secondary` | neutral-100 | neutral-800 | Secondary elements |
| `secondary-foreground` | neutral-900 | neutral-50 | Text on secondary |
| `muted` | neutral-100 | neutral-800 | Muted/subtle elements |
| `muted-foreground` | neutral-500 | neutral-400 | Muted text |
| `accent` | neutral-100 | neutral-800 | Accent elements |
| `accent-foreground` | neutral-900 | neutral-50 | Text on accent |
| `destructive` | red-600 | red-500 | Error/danger actions |
| `destructive-foreground` | white | neutral-50 | Text on destructive |
| `successful` | green-300 | green-400 | Success states |
| `warning` | yellow-400 | yellow-400 | Warning states |
| `border` | neutral-200 | neutral-800 | Border color |
| `input` | neutral-200 | neutral-800 | Input borders |
| `ring` | neutral-900 | neutral-300 | Focus ring |
| `link` | teal-600 | teal-400 | Link text |

### Using Semantic Colors

```tsx
// Backgrounds
<div className="bg-background" />      // Page background
<div className="bg-primary" />         // Primary color (teal)
<div className="bg-secondary" />       // Secondary (neutral)
<div className="bg-muted" />           // Muted background
<div className="bg-destructive" />     // Error/danger (red)

// Text
<span className="text-foreground" />   // Primary text
<span className="text-primary" />      // Primary color text
<span className="text-muted-foreground" /> // Muted text
<span className="text-destructive" />  // Error text

// Borders
<div className="border-border" />      // Standard border
<div className="border-primary" />     // Primary border
<div className="border-input" />       // Input border

// Focus
<div className="ring-ring" />          // Focus ring
<div className="focus:ring-primary" /> // Primary focus ring
```

### Accent Colors (for badges, charts, etc.)

| Token | Usage |
|-------|-------|
| `orange` | Orange accent |
| `blue` | Blue accent |
| `violet` | Violet accent |
| `pink` | Pink accent |
| `chart-1` through `chart-5` | Data visualization |

### Raw Color Palette (DO NOT USE DIRECTLY)

These exist for theming but should not be used in components. Use semantic tokens instead.

| Scale | Steps |
|-------|-------|
| `neutral` | 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 |
| `red` | 50 - 950 |
| `orange` | 50 - 950 |
| `yellow` | 50 - 950 |
| `green` | 50 - 950 |
| `teal` | 50 - 950 (primary brand color) |
| `blue` | 50 - 950 |
| `violet` | 50 - 950 |
| `pink` | 50 - 950 |

---

## Typography

### Font Families

| Font | Usage | CSS |
|------|-------|-----|
| Gilroy | Headings | `font-sans` (configured as default) |
| Open Sans | Body text | `font-sans` |

### Typography Utilities

Use these built-in typography classes:

```tsx
// Headings
<h1 className="h1">Heading 1</h1>
<h2 className="h2">Heading 2</h2>
<h3 className="h3">Heading 3</h3>
<h4 className="h4">Heading 4</h4>
<h5 className="h5">Heading 5</h5>

// Paragraphs
<p className="p">Regular paragraph</p>
<p className="p-lead">Lead paragraph (larger)</p>
<p className="p-large">Large paragraph</p>
<p className="p-small">Small paragraph</p>
<p className="p-muted">Muted paragraph</p>

// Other
<blockquote className="blockquote">Quote</blockquote>
<ul className="ul">List</ul>
<code className="inline-code">Code</code>
<a className="link">Link</a>
```

### Font Sizes (Tailwind Classes)

| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | 12px | Small labels, captions |
| `text-sm` | 14px | Secondary text, descriptions |
| `text-base` | 16px | Body text (default) |
| `text-lg` | 18px | Emphasized body |
| `text-xl` | 20px | Small headings |
| `text-2xl` | 24px | Section headings |
| `text-3xl` | 30px | Page headings |
| `text-4xl` | 36px | Large titles |

### Font Weights

| Class | Weight | Usage |
|-------|--------|-------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Slightly emphasized |
| `font-semibold` | 600 | Subheadings, buttons |
| `font-bold` | 700 | Headings, strong emphasis |

---

## Spacing

### Spacing Scale

Spreeform uses Tailwind's default spacing scale:

| Token | Value | Tailwind Classes |
|-------|-------|------------------|
| 0 | 0px | `p-0`, `m-0`, `gap-0` |
| px | 1px | `p-px`, `m-px` |
| 0.5 | 2px | `p-0.5`, `m-0.5` |
| 1 | 4px | `p-1`, `m-1`, `gap-1` |
| 2 | 8px | `p-2`, `m-2`, `gap-2` |
| 3 | 12px | `p-3`, `m-3`, `gap-3` |
| 4 | 16px | `p-4`, `m-4`, `gap-4` |
| 5 | 20px | `p-5`, `m-5`, `gap-5` |
| 6 | 24px | `p-6`, `m-6`, `gap-6` |
| 8 | 32px | `p-8`, `m-8`, `gap-8` |
| 10 | 40px | `p-10`, `m-10` |
| 12 | 48px | `p-12`, `m-12` |
| 16 | 64px | `p-16`, `m-16` |
| 20 | 80px | `p-20`, `m-20` |
| 24 | 96px | `p-24`, `m-24` |

### Recommended Spacing Usage

| Context | Value | Class |
|---------|-------|-------|
| Page side margins | 48px | `px-12` |
| Card padding | 24px | `p-6` |
| Related components | 16px | `gap-4` |
| Unrelated sections | 32px | `gap-8` |
| Inner-element spacing | 8px | `gap-2` |
| Tight spacing | 4px | `gap-1` |

### Common Spacing Patterns

```tsx
// Page container
<div className="px-12 py-8">...</div>

// Card content
<div className="p-6">...</div>

// Form fields
<div className="space-y-4">
  <Input />
  <Input />
</div>

// Button group
<div className="flex gap-2">
  <Button>Cancel</Button>
  <Button>Submit</Button>
</div>

// Section spacing
<section className="mt-8 mb-12">...</section>
```

---

## Sizing

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-none` | 0 | No rounding |
| `rounded-sm` | 4px | Subtle rounding |
| `rounded` | 6px | Default (inputs, buttons) |
| `rounded-md` | 8px | Cards, dialogs |
| `rounded-lg` | 10px | Large cards |
| `rounded-xl` | 12px | Modals |
| `rounded-2xl` | 16px | Hero sections |
| `rounded-full` | 9999px | Pills, avatars |

### Standard Component Sizes

| Component | Size | Class |
|-----------|------|-------|
| Button (sm) | 32px height | `size="sm"` |
| Button (default) | 40px height | `size="default"` |
| Button (lg) | 48px height | `size="lg"` |
| Input | 40px height | Default |
| Avatar (sm) | 32px | - |
| Avatar (default) | 40px | - |
| Avatar (lg) | 48px | - |
| Icon (sm) | 16px | `size={16}` |
| Icon (default) | 20px | `size={20}` |
| Icon (lg) | 24px | `size={24}` |

### Width Utilities

```tsx
// Fixed widths
<div className="w-64" />   // 256px
<div className="w-96" />   // 384px

// Responsive widths
<div className="w-full max-w-md" />  // Full width, max 448px
<div className="w-full max-w-lg" />  // Full width, max 512px
<div className="w-full max-w-xl" />  // Full width, max 576px
<div className="w-full max-w-2xl" /> // Full width, max 672px

// Percentage widths
<div className="w-1/2" />  // 50%
<div className="w-1/3" />  // 33.333%
<div className="w-2/3" />  // 66.667%
```

---

## Theming

### Dark Mode

Dark mode is controlled by the `.dark` class on a parent element:

```tsx
// In your app root
<ThemeProvider defaultTheme="system">
  <App />
</ThemeProvider>

// Manual toggle
const { setTheme } = useTheme();
setTheme("dark");  // or "light" or "system"
```

### Extending the Theme

Add custom tokens in your CSS:

```css
@import '@spreetail/spreeform';

:root {
  --brand: var(--color-purple-600);
  --brand-foreground: var(--color-white);
}

.dark {
  --brand: var(--color-purple-400);
  --brand-foreground: var(--color-black);
}

@theme inline {
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
}
```

Then use in components:

```tsx
<div className="bg-brand text-brand-foreground">Custom branded content</div>
```

---

## Responsive Breakpoints

| Breakpoint | Min Width | Usage |
|------------|-----------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

### Usage

```tsx
// Responsive padding
<div className="p-4 md:p-6 lg:p-8">...</div>

// Responsive layout
<div className="flex flex-col md:flex-row">...</div>

// Responsive visibility
<div className="hidden md:block">Desktop only</div>
<div className="md:hidden">Mobile only</div>

// Responsive text
<h1 className="text-2xl md:text-3xl lg:text-4xl">Heading</h1>
```
