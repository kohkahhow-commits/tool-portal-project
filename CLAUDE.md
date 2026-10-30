# CLAUDE.md

## Tech Stack

- Plain HTML, CSS, and JavaScript only.
- No frameworks or libraries (no React, Vue, Tailwind, jQuery, etc.).
- No build step: files are served and opened as they are written.

## Project Structure

- `CLAUDE.md` — this file.
- `index.html` — the homepage, with the grid of tool cards.
- `css/style.css` — shared styles and the light/dark color settings.
- `js/theme.js` — the theme toggle, used by every page.
- `tools/tool-1/` — placeholder tool page, to be replaced by the
  Robot Arm Picker.

Update this section as files and folders are added.

## Key Requirements

1. Every page must be responsive and work on desktop, tablet, and phone.
2. Users can toggle between a light and a dark theme. The default is the light theme.
3. Text must stay easy to read, with good contrast, in both the light and the dark theme.

## Feature Plan

A Robotics web portal where students try out small, interactive tools.
Each tool explains its results in plain language.

### Portal structure

- **Homepage** (`index.html`): a short intro and a grid of tool cards.
  Each card has a name, a one-line description, and a link to the tool.
- **Opening a tool**: clicking a card opens that tool's own page.
- **Getting back**: every tool page has the same header as the homepage.
  It includes the site title, a "← All tools" link to the homepage,
  and the theme toggle.
- **Adding a tool later**: create a folder `tools/<tool-name>/` with its
  own `index.html` (plus its CSS/JS if needed). Then add one card for it
  on the homepage. Shared styles and the theme toggle live in `css/` and
  `js/`, and every page reuses them.

### Phases

**Phase 1: Portal + first tool**
- [x] Portal: homepage, shared header, light/dark theme toggle,
  responsive layout (with a placeholder "Tool 1 — coming soon" card).
- [ ] Robot Arm Picker: a 2D side view of a two-joint arm that picks up a
  block and drops it in a bin.
  - Sliders mode: set the joint angles and see where the tip goes
    (forward kinematics).
  - Click-target mode: click a point and the arm works out its angles
    (inverse kinematics).
  - A live readout and a short "How it works" note for students.

**Phase 2: More tools**
- Add 1–2 more robotics tools, using the "Adding a tool later" steps.
- Tools to be decided together before building.

**Phase 3: Polish**
- Improvements based on feedback (e.g. adjustable arm lengths,
  obstacles, better explanations).

## Rules for Claude

- Explain technical terms in plain language.
- Ask before making big changes.
- When something is unclear, ask rather than guess.
