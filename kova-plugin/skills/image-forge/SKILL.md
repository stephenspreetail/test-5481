---
name: image-forge
description: Analyze UI mockups, screenshots, wireframes, or design images and generate a detailed app planning document. Use when given an image file (.png, .jpg, .jpeg, .gif, .webp) that represents a user interface or application design. Triggers on requests like "analyze this image", "build an app from this screenshot", or "create app from this design".
---

# Image Forge - UI Image to App Planner

Analyze UI images (mockups, screenshots, wireframes, designs) and generate comprehensive app planning documents that describe how to build a functional web application from the image.

## Supported Image Types

- **Screenshots**: Captured images of existing applications or websites
- **Mockups**: Design mockups from tools like Figma, Sketch, Adobe XD
- **Wireframes**: Low-fidelity sketches or wireframe diagrams
- **Hand-drawn sketches**: Photos of hand-drawn UI concepts
- **Design compositions**: High-fidelity visual designs

## Analysis Process

1. **Read the image** using the Read tool to visually analyze it
2. **Identify UI components** - buttons, inputs, cards, navigation, modals, etc.
3. **Determine layout structure** - grid system, spacing, responsive patterns
4. **Catalog visual elements** - colors, typography, icons, imagery
5. **Infer functionality** - what actions, flows, and data are represented
6. **Document interactions** - hover states, click actions, form submissions

## Output Format

**Write the documentation to a markdown file** named `{ImageName}_app_plan.md` in the same directory as the source image.

Follow the template in [references/output-template.md](references/output-template.md).

Key sections:
- App overview (purpose, target users, key features)
- Component inventory (all identified UI elements)
- Layout structure (page hierarchy and responsive design)
- Interaction map (user actions and expected behaviors)
- Data model (inferred data structures and state)
- Implementation guide (component breakdown and build order)

## Analysis Guidelines

### Component Detection
- **Navigation**: Header bars, sidebars, tab bars, breadcrumbs
- **Content**: Cards, lists, tables, grids, carousels
- **Forms**: Inputs, selects, checkboxes, radio buttons, date pickers
- **Actions**: Buttons, links, icons, menus, dropdowns
- **Feedback**: Alerts, toasts, modals, loading states
- **Media**: Images, videos, avatars, icons

### Layout Analysis
- Identify the overall page structure (header/main/footer, sidebar layouts)
- Note column/grid patterns and their breakpoints
- Document spacing patterns (margins, padding, gaps)
- Identify fixed vs scrollable regions

### Visual Design Extraction
- Primary and secondary colors (provide hex codes when possible)
- Typography hierarchy (headings, body text, captions)
- Border radius, shadow patterns
- Icon style (outlined, filled, custom)

### Interaction Inference
- What happens when each button is clicked?
- What data do forms collect and where does it go?
- How does navigation flow between pages/views?
- What loading and error states should exist?

## Example Trigger Phrases

- "Analyze this image and plan an app"
- "Build an app that looks like this screenshot"
- "Create a planning doc for this UI design"
- "Turn this mockup into an app specification"
- "What would it take to build this interface?"

## Skill Integration

When generating the app plan:

1. **Map components to Spreeform**: For each UI element identified, note the corresponding Spreeform component (load `/spreeform` for the full reference)
2. **Use semantic tokens**: Map colors to Spreeform tokens (`primary`, `muted`, `destructive`) instead of hex values
3. **Reference TanStack patterns**: Note routing and data fetching needs for `/tanstack`

After generating the plan, the build workflow is:
1. `/init-project [app-name]` - Scaffold the project
2. `/spreeform` - Component implementation reference
3. `/tanstack` - Routing and data patterns

## Related Skills

- **/init-project** - Scaffold TanStack Start + Spreeform project
- **/spreeform** - Component library reference
- **/tanstack** - TanStack Router, Query, Table patterns
