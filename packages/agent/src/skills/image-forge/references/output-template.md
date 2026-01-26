# Output Template: Image Forge App Plan

Use this structure when generating app planning documents from UI images.

---

## Template

```markdown
# [App Name] - App Planning Document

## Overview

**Purpose**: [One sentence describing what this app does]
**Target Users**: [Who will use this app]
**Key Features**: [3-5 main features identified from the image]

---

## Visual Reference

The analyzed image shows: [Brief description of what the image depicts]

---

## Component Inventory

### Navigation Components
| Component | Location | Description | Interactions |
|-----------|----------|-------------|--------------|
| [name]    | [where]  | [what it is]| [click/hover actions] |

### Content Components
| Component | Location | Description | Data Displayed |
|-----------|----------|-------------|----------------|
| [name]    | [where]  | [what it is]| [data type/source] |

### Form Components
| Component | Type | Validation | Purpose |
|-----------|------|------------|---------|
| [name]    | [input/select/etc] | [rules] | [what it collects] |

### Action Components
| Component | Type | Action | Result |
|-----------|------|--------|--------|
| [name]    | [button/link/icon] | [click action] | [what happens] |

---

## Layout Structure

### Page Hierarchy
```
[Page/Screen Name]
├── Header
│   ├── [component]
│   └── [component]
├── Main Content
│   ├── [section]
│   │   └── [components]
│   └── [section]
└── Footer (if present)
    └── [components]
```

### Responsive Behavior
- **Desktop (1200px+)**: [layout description]
- **Tablet (768px-1199px)**: [layout changes]
- **Mobile (<768px)**: [mobile layout]

---

## Design System

### Colors
| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | [color name] | #XXXXXX | [buttons, links, accents] |
| Secondary | [color name] | #XXXXXX | [secondary actions] |
| Background | [color name] | #XXXXXX | [page/card backgrounds] |
| Text | [color name] | #XXXXXX | [body text] |
| Border | [color name] | #XXXXXX | [dividers, outlines] |

### Typography
| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | [size] | [weight] | [page titles] |
| H2 | [size] | [weight] | [section headers] |
| Body | [size] | [weight] | [content text] |
| Caption | [size] | [weight] | [helper text] |

### Spacing & Borders
- Border radius: [small/medium/large values]
- Card shadows: [shadow description]
- Spacing scale: [4px, 8px, 16px, etc.]

---

## Interaction Map

### User Flows
1. **[Flow Name]**: [Step 1] → [Step 2] → [Step 3] → [Result]
2. **[Flow Name]**: [Step 1] → [Step 2] → [Result]

### State Changes
| Trigger | Current State | Next State | Visual Change |
|---------|---------------|------------|---------------|
| [action] | [before] | [after] | [what changes] |

---

## Data Model

### Entities
```typescript
interface [EntityName] {
  id: string;
  [field]: [type]; // [description]
  [field]: [type]; // [description]
}
```

### State Requirements
- [state item]: [description of what needs to be tracked]
- [state item]: [description]

---

## Implementation Guide

### Component Breakdown

**Priority 1 - Core Layout**
1. `[ComponentName]` - [description]
2. `[ComponentName]` - [description]

**Priority 2 - Main Features**
1. `[ComponentName]` - [description]
2. `[ComponentName]` - [description]

**Priority 3 - Enhancement**
1. `[ComponentName]` - [description]

### Suggested Build Order
1. Set up project with React + Tailwind
2. Create layout shell (header, main, footer)
3. Build [core component]
4. Add [feature component]
5. Implement [interaction]
6. Add responsive styles
7. Polish and refine

### External Dependencies
- [library]: [what for]
- [library]: [what for]

---

## Notes

- [Any assumptions made during analysis]
- [Limitations or unclear elements in the image]
- [Suggestions for improvements or alternatives]

---

## App Build Prompt

Create a [App Name] application with the following features:

[Summarize the key components and functionality that should be built, referencing the sections above. This prompt will be sent to the AI to actually build the application.]

Key requirements:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

Use React with TypeScript and Tailwind CSS. Follow the component structure and design system documented above.
```

---

## Guidelines

1. **Be specific** - Include exact colors, sizes, and positions when visible
2. **Infer intelligently** - Make reasonable assumptions about hidden interactions
3. **Stay practical** - Focus on what can realistically be built
4. **Prioritize clarity** - The plan should be actionable by another developer
5. **Include the build prompt** - End with a clear prompt that can build the app
