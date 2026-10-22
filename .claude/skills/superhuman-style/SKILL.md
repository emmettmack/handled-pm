---
name: superhuman-style
description: Design and interaction reference modeled on Superhuman (superhuman.com). Use when building or restyling UI to feel fast, calm, premium and keyboard-first, such as approval queues, inboxes, triage lists, and dashboards. Applies to this PMAUTO app's work order list and approval cards.
---

# Superhuman-style UI

Written from general knowledge of Superhuman's public design, not a pixel-for-pixel capture. Treat values as starting points and compare against the live site.

## Core principle
Speed and focus. One thing at a time, the next action obvious, nothing decorative. The user should feel they are clearing a queue, not managing software.

## Interaction rules
- **Triage mode:** show one item in full (summary, draft, reasoning) with the primary action under it. Approving advances to the next item automatically; show "Inbox zero" with a calm illustration or a single line when empty.
- **Keyboard first:** every action has a single key, shown as a small key hint on the button. Suggested: `Enter` approve, `E` edit, `R` reject, `J`/`K` next/previous, `Cmd+K` command palette, `Esc` back, `?` shortcut sheet.
- **Command palette (Cmd+K):** fuzzy search over work orders, vendors, and actions ("Approve", "Simulate text", "Go to vendors").
- **Instant feel:** optimistic updates, no spinners for local actions, transitions 100 to 150 ms, never blocking modals for routine actions. Offer **Undo** in a toast for 5 seconds instead of confirm dialogs.
- **Split pane:** list on the left (compact rows), detail on the right; selection moves with J/K.

## Visual language
- **Palette:** mostly neutral. Off-white (`#FAFAF9`) or near-black (`#0E0E11`) backgrounds, text in two grays, hairline borders (`1px`, ~6% opacity). One restrained accent (Superhuman uses a purple/violet gradient for brand moments); use it only for the primary action and selection. Status colors stay muted; red only for true emergencies.
- **Type:** a clean grotesk or humanist sans (Inter, or a Super-like face), 13 to 15 px body, generous line height, medium weight for titles instead of bold. Tight negative tracking on large headings.
- **Space:** airy. 16 to 24 px padding in cards, 8 px grid, wide gutters; content column max ~720 px for reading views.
- **Surfaces:** flat with very soft, large-radius shadows (radius 10 to 14 px). Avoid heavy borders, gradients on cards, and icon-in-circle decorations.
- **Chips and key hints:** small rounded-rect keycaps (`font-size 11px`, light border, slight inset) beside action labels.
- **Motion:** subtle slide/fade between items (translateY 4 to 8 px, 120 ms ease-out). Respect `prefers-reduced-motion`.
- **Dark mode:** first-class, not an afterthought; same hierarchy using elevation by lightness.

## Copy tone
Short, confident, human. "You're all caught up." "3 to review." No jargon, no exclamation marks, no filler.

## Applying to this app (PMAUTO)
1. Replace the Home layout with a split view: compact work order list left, selected ApprovalCard right (`client/src/pages/Home.jsx`, `components/ApprovalCard.jsx`).
2. Add a global key handler and a key-hint component; wire Enter/E/R/J/K to the existing approve, edit and reject handlers.
3. Add a Cmd+K palette over tickets and actions.
4. Retheme tokens in `client/src/styles.css` (`:root` variables): neutral surfaces, hairline borders, one accent, softer shadows; add a dark theme via `prefers-color-scheme`.
5. Swap confirm dialogs and success toasts for undoable toasts.
6. Keep the product's safety rules visible: nothing sends until approved, emergencies stay red and pinned, owner-approval requests keep their label.

## Don'ts
- Don't copy Superhuman's logo, name, illustrations, or copy; replicate feel, not assets.
- Don't add motion or color that competes with the primary action.
- Don't hide the "why" (AI reasoning) behind extra clicks; keep it one glance away.
