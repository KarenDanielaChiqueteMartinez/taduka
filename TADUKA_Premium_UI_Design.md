---
brand:
  audience: Small neighborhood grocery stores in Culiacán, Mexico
  name: TADUKA
  product: Responsive web application
colors:
  accent: "#B7EC4B"
  background: "#F7F6F1"
  border: "#E1E6E1"
  danger: "#B93838"
  danger-soft: "#FDE8E7"
  primary: "#075747"
  primary-hover: "#06483C"
  primary-soft: "#DCEFE7"
  success: "#247A52"
  surface: "#FFFFFF"
  surface-muted: "#F1F3EF"
  text-primary: "#17211D"
  text-secondary: "#66736C"
  warning: "#A96812"
  warning-soft: "#FFF2D8"
description: Design system for a modern, mobile-first inventory and
  expiration tracking web app.
name: TADUKA --- Premium Responsive Web UI
rounded:
  card: 16px
  control: 10px
  panel: 20px
  pill: 9999px
spacing:
  base: 4px
  card-padding-desktop: 24px
  card-padding-mobile: 16px
  page-padding-desktop: 32px
  page-padding-mobile: 16px
  section-gap: 28px
typography:
  body: Geist, Inter, system-ui, sans-serif
  display: Geist, Inter, system-ui, sans-serif
  label: Geist, Inter, system-ui, sans-serif
version: taduka-premium-ui-2026-10
---

# TADUKA --- Premium Responsive Web UI

## 1. Purpose

Create a polished, modern web application for **TADUKA**, a tool that
helps neighborhood grocery stores track products, lots, expiration
dates, physical counts, and inventory adjustments.

The interface must feel intentionally designed: confident typography,
purposeful whitespace, clear information hierarchy, refined details, and
efficient everyday workflows. Avoid generic admin templates, repetitive
cards, excessive gradients, and decorative elements that get in the way
of work.

This file is the visual and interaction source of truth for TADUKA.
Adapt the principles of a premium mobile dashboard to inventory
management; do not reuse the original motorcycle-purchase content.

## 2. Product context and business rules

TADUKA helps store owners follow product expiration dates and manage
inventory through physical counts.

-   TADUKA is **not** a point-of-sale system and does not track
    individual sales.
-   A difference between recorded and counted stock is an inventory
    adjustment, not proof of a sale.
-   Expiration dates belong to individual lots, not to the generic
    product.
-   One product can have several lots with different expiration dates.
-   Users manually enter or confirm dates and quantities.
-   Never claim that TADUKA guarantees savings or has proven commercial
    results.
-   Use real database data for implemented screens. Mark mock data
    clearly when it is only for a design preview.

## 3. Current implementation scope

Focus on **interfaces and database connectivity**.

In scope: - Responsive app shell and navigation. - Authentication
screens. - Dashboard connected to real data. - Product catalog: list,
create, edit, deactivate. - Lots: create, view, update quantities and
expiration dates. - Inventory movements: physical counts, adjustments,
write-offs. - Loading, empty, error, success, and confirmation states. -
Database integration and access control.

Out of scope for now: - OCR, invoice/receipt scanning, or AI. - Push
notifications or automatic background alerts. - Payments, subscriptions,
or offline synchronization. - Unimplemented analytics or claims about
waste reduction.

Do not show future functionality as if it were active.

## 4. Visual direction

### Style

Use a **contemporary premium product aesthetic**: minimal, confident,
editorial, and practical.

-   Strong typographic hierarchy and intentional whitespace.
-   Distinctive layouts instead of a wall of identical cards.
-   Compact, scannable operational details.
-   Subtle borders and shadows; avoid heavy elevation.
-   Clear status labels and restrained color accents.
-   Consistent icons, preferably Lucide.
-   Subtle transitions that never slow down routine tasks.

### Brand personality

Trustworthy, practical, modern, friendly but not childish, efficient,
and understandable to nontechnical users.

### Avoid

-   Generic SaaS dashboards where every section is the same card.
-   Large gradients, glassmorphism, neon glow, decorative blobs, and
    excessive blur.
-   Too many pills, badges, or accent colors.
-   Oversized titles that push useful content below the fold on mobile.
-   Low-contrast text or tiny metadata.
-   Tables that overflow mobile screens.
-   Fake analytics, fabricated inventory metrics, and meaningless
    charts.

## 5. Color system

Use semantic tokens instead of scattering raw values through components.

  --------------------------------------------------------------------------
  Token                      Value                   Use
  -------------------------- ----------------------- -----------------------
  `--color-primary`          `#075747`               Main brand, key
                                                     actions, active
                                                     navigation

  `--color-primary-hover`    `#06483C`               Hover/pressed primary
                                                     actions

  `--color-primary-soft`     `#DCEFE7`               Selected states and
                                                     soft highlights

  `--color-accent`           `#B7EC4B`               Small, selective
                                                     highlights only

  `--color-background`       `#F7F6F1`               Main page background

  `--color-surface`          `#FFFFFF`               Cards, forms, dialogs

  `--color-surface-muted`    `#F1F3EF`               Secondary panels

  `--color-text-primary`     `#17211D`               Main text and headings

  `--color-text-secondary`   `#66736C`               Supporting text and
                                                     metadata

  `--color-border`           `#E1E6E1`               Borders and dividers

  `--color-success`          `#247A52`               Success/confirmed
                                                     states

  `--color-warning`          `#A96812`               Expiring soon /
                                                     attention needed

  `--color-warning-soft`     `#FFF2D8`               Warning backgrounds

  `--color-danger`           `#B93838`               Expired lots,
                                                     destructive actions,
                                                     errors

  `--color-danger-soft`      `#FDE8E7`               Error and expired
                                                     backgrounds
  --------------------------------------------------------------------------

Rules: - Green is the main brand color, but do not paint every surface
green. - Use lime only for small highlights, not as the dominant
background. - Never communicate status through color alone; add a label
or icon. - Maintain accessible contrast. - Distinguish "expires soon"
(warning) from "expired" (danger).

## 6. Typography, spacing, and shapes

Use **Geist** or **Inter**, with a system sans-serif fallback. Reuse an
existing working font setup instead of adding dependencies
unnecessarily.

-   Desktop page title: approximately 28--36px.
-   Mobile page title: approximately 24--30px.
-   Body: generally 14--16px.
-   Labels: concise and medium-weight.
-   Use monospaced text only for lot IDs or technical codes when
    helpful.
-   Avoid oversized 64px titles on operational screens.

Spacing: - Base scale: 4px. - Form field gaps: 12--16px. - Section gaps:
24--32px. - Page padding: 24--32px desktop, 16px mobile. - Card padding:
20--24px desktop, 14--16px mobile.

Radius: - Inputs/buttons: 10px. - Cards: 16px. - Grouped panels: 20px. -
Pills: fully rounded only when appropriate.

Prefer borders for separation. Use shadows sparingly for overlays,
menus, dialogs, and floating actions.

## 7. App shell and navigation

### Desktop

-   Compact left sidebar with TADUKA name/logo, primary navigation, and
    account area.
-   Clear page title, optional short description, and consistently
    placed primary action.
-   Comfortable content width; do not stretch tables and forms
    unnecessarily.
-   Quiet sidebar that does not compete with the active page.

Suggested navigation: 1. Inicio 2. Productos 3. Lotes 4. Movimientos 5.
Configuración

Only show routes that exist and are implemented.

### Mobile

-   Use a compact top bar and a clear bottom navigation or another
    justified mobile pattern.
-   Keep primary actions easy to reach.
-   Never squeeze a desktop sidebar into a narrow viewport.
-   Forms and dialogs must fit small screens and scroll when needed.
-   Avoid horizontal page scrolling.

Use the existing TADUKA logo if available. Otherwise use a clean
wordmark placeholder; do not invent a complex logo.

## 8. Core screens

### Authentication

Provide sign-in, sign-up, and password recovery screens connected to
session-based auth. Keep them focused and accessible. Show understandable
Spanish error and success messages. Never simulate successful
authentication.

### Dashboard

Help the store owner immediately understand what needs attention.
Prioritize: - Store context and concise welcome. - Summary of active
lots and lots requiring attention, calculated from real data. - One
useful primary action, such as "Registrar producto". - A focused list of
lots approaching expiration. - A separate view of expired lots with
remaining stock, when applicable.

Do not add meaningless charts. If there is no data, show a deliberate
empty state and a useful next step.

### Product catalog

Include page title, "Nuevo producto" action, search, and filters only
when supported by the data model. Show product name, category, unit, and
active/inactive status. Provide view, edit, and deactivate actions.

On mobile, replace wide tables with readable stacked rows or compact
list items. Keep key information visible and move secondary actions into
a menu if needed.

### Product form

Fields: name, category, unit of measure, and status when applicable.
Include validation, loading, success/error feedback, and a safe cancel
action. Preserve entered values after recoverable errors. Do not place
lot-specific expiration dates in the generic product form.

### Lots

Show product, internal lot ID, optional supplier lot code, entry date,
expiration date, initial quantity, remaining quantity, and status. Make
it easy to distinguish multiple lots of the same product.

### Lot form

Include product selection, optional supplier lot code, entry date,
expiration date, initial quantity, and unit. Only allow direct editing
of remaining stock when the workflow supports it; otherwise change stock
through a movement.

Validate dates and non-negative quantities. Expiration dates must be
entered or confirmed by the user. Never silently change stock.

### Inventory movements

Support physical counts, adjustments, and write-offs. Show product/lot,
movement type, quantity, reason when applicable, date/time, and
before/after quantities when relevant.

Require clear confirmation for consequential stock changes. Preserve
history. Never label a stock difference as a sale.

### Settings

Only show implemented settings, such as store details, user profile, or
expiration lead time if it is supported. Never show nonfunctional
controls or claim that unsaved settings were saved.

## 9. Data-driven states

Every database-connected screen must handle:

-   Loading: visible progress without layout jumps.
-   Empty: explain the empty state and provide a relevant next action.
-   Success: concise confirmation after a completed operation.
-   Validation error: identify the field and explain how to fix it.
-   Network/server error: useful message and retry path when
    appropriate.
-   Permission denied: do not expose data.
-   Missing/stale data: never display misleading values.

Do not present hardcoded placeholder values as real inventory. Mock data
is acceptable only when explicitly identified as a design preview or
development fixture.

## 10. Interaction and accessibility

-   Buttons: default, hover, focus, active, disabled, and loading
    states.
-   Inputs: visible focus, validation, and disabled states.
-   Short transitions for color, border, and opacity; no excessive
    animation.
-   Respect reduced-motion preferences.
-   Confirm before deactivating products or performing consequential
    stock actions.
-   Prevent double submissions.
-   Use consistent feedback patterns.
-   Use semantic HTML, accessible labels, keyboard navigation, and
    visible focus.
-   Aim for touch targets around 44px where practical.
-   Test phone, tablet, and desktop widths.
-   Do not rely on color alone for status.

## 11. Technical rules

-   Use reusable components and semantic design tokens.
-   Keep UI, data access, and business logic reasonably separated.
-   Follow current Next.js App Router conventions.
-   Use supported patterns for Next.js and server-side
    authentication.
-   Never expose secret keys or the database credentials in
    browser code.
-   Enforce store isolation in every query and test it (no RLS in MariaDB).
-   Validate mutations on the server; client validation is
    supplementary.
-   Store dates consistently and format them for Spanish-language users.
-   Connect implemented screens to real database queries.
-   Avoid unnecessary dependencies and state-management libraries.
-   Keep the app in Spanish, with Mexican context and MXN currency where
    currency is eventually needed.
-   Do not implement OCR, AI, push notifications, offline sync,
    payments, or subscriptions in this phase.

## 12. Implementation workflow

For each screen: 1. Inspect the existing project and reuse working code.
2. Identify the required data and schema. 3. Build the interface using
this design system. 4. Connect it to the database after schema and
permissions are ready. 5. Implement loading, empty, error, success, and
validation states. 6. Check mobile and desktop layouts. 7. Check
keyboard access and contrast. 8. Run available lint and TypeScript
checks. 9. Report changed files and tests actually performed.

Do not rebuild the entire app for a small visual change. Do not add
unrelated features or change the design system silently.

## 13. Final guardrails

-   Preserve TADUKA's identity and product context.
-   Modernize the UI without turning it into a generic template.
-   Do not reuse the original motorcycle-purchase content.
-   Do not invent inventory metrics or business results.
-   Do not claim that TADUKA guarantees savings.
-   Do not present future features as implemented.
-   Prefer thoughtful composition over more cards.
-   Prefer clarity and speed over decoration.
-   Keep all screens visually consistent and useful for real inventory
    tasks.

**Success criterion:** TADUKA looks like a polished, recognizable modern
product; works on mobile and desktop; and uses real,
permission-protected database data for each implemented workflow.
