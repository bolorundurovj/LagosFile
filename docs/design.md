# Design System Specification: The Financial Architect

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Ledger"**
This design system moves beyond the generic "SaaS dashboard" to create an editorial-grade financial environment. It is rooted in the concept of *Physicality and Precision*. We treat the interface not as a collection of pixels, but as a series of high-quality, layered documents. 

To break the "template" look, we utilize **Intentional Asymmetry**. For instance, sidebar navigations are intentionally slim and deep-toned to ground the layout, while the main content area breathes through expansive white space and "floating" data modules. We avoid the rigid 12-column grid in favor of **Tonal Composition**, where importance is dictated by depth and contrast rather than just size.

## 2. Colors: Depth over Boundaries
The palette is anchored in `primary` (#001e40), a deep, authoritative navy that evokes the stability of a central bank. 

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for sectioning. We define space through **Background Shifting**. 
- A `surface-container-low` (#f2f4f6) section should sit directly on a `background` (#f7f9fb) to create a boundary.
- For data-heavy tables, use alternating `surface-container` tiers rather than cell borders to guide the eye.

### Surface Hierarchy & Nesting
Treat the UI as a series of nested physical layers.
- **Base Layer:** `surface` (#f7f9fb) for the main application background.
- **Mid Layer:** `surface-container-low` (#f2f4f6) for secondary content areas or sidebars.
- **Top Layer:** `surface-container-lowest` (#ffffff) for primary interactive cards and data entry modules. This creates a "lifted" effect that signals high-priority focus.

### The "Glass & Gradient" Rule
To add "soul" to the financial rigor:
- **CTAs:** Use a subtle linear gradient from `primary` (#001e40) to `primary_container` (#003366) to give buttons a weighted, premium feel.
- **Floating Overlays:** Use `surface_container_lowest` at 80% opacity with a `16px` backdrop-blur for tooltips and dropdowns. This "Glassmorphism" ensures the interface feels integrated and modern.

## 3. Typography: Editorial Authority
We pair **Manrope** (Display/Headlines) with **Inter** (Body/Labels) to balance character with legibility.

- **Display-LG (Manrope, 3.5rem):** Reserved for high-level summaries, like "Total Tax Payable." It should feel like a headline in a premium financial journal.
- **Title-MD (Inter, 1.125rem):** Used for card titles and section headers. Inter’s high x-height ensures readability for complex Nigerian tax terminology.
- **Label-SM (Inter, 0.6875rem):** Used for metadata and table headers. Must always be in `on_surface_variant` (#43474f) to maintain a secondary hierarchy.

**Data Hierarchy:** Use `headline-sm` for large numerical values to ensure the "money" is the first thing the user sees.

## 4. Elevation & Depth
We eschew traditional shadows for **Tonal Layering**.

- **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-high` background creates a natural visual hierarchy without artificial "glows."
- **Ambient Shadows:** For "Floating" elements (e.g., a multi-step stepper modal), use a shadow with a blur of `40px`, Y-offset of `12px`, and an opacity of 4% using the `on_surface` color. It should feel like a soft atmospheric occlusion, not a drop shadow.
- **The "Ghost Border" Fallback:** If a border is required for accessibility (e.g., input fields), use the `outline_variant` token at **20% opacity**. This keeps the interface "soft" and professional.

## 5. Components

### Multi-Step Steppers
Do not use circles with numbers. Use a **Vertical Progress Strip**. The active state is a `primary` solid bar, while upcoming steps are `surface_container_highest`. This mimics a high-end filing system.

### Data-Heavy Tables
- **Forbid Dividers:** Use `0.9rem` (4) vertical padding and `surface_container_low` for hover states.
- **Expandable Rows:** When expanded, the row should shift to `surface_container_lowest` and gain a `0.5rem` (lg) corner radius to "pop" out from the table.

### Attach Document Buttons
These are not standard buttons. They should be styled as **Drop Zones** using a `dashed` version of the "Ghost Border" (outline-variant at 20%) with a `surface_container_low` background.

### Computation Summaries
Use a "Stacked Paper" aesthetic. The final total should be housed in a `primary_container` (#003366) block with `on_primary_container` (#799dd6) text, creating a high-contrast anchor at the bottom of the calculation.

### Inputs & Cards
- **Cards:** No borders. Use `0.75rem` (xl) corner radius.
- **Inputs:** Use `surface_container_highest` for the background with a 1px "Ghost Border" on focus.

## 6. Do's and Don'ts

### Do:
- Use **Negative Space** as a separator. If in doubt, increase the spacing from `1.1rem` (5) to `1.75rem` (8).
- Use `tertiary` (#381300) and its containers for "Amber" warnings—it provides a sophisticated, burnt-orange warning that feels more professional than "bright yellow."
- Align financial figures to the **right** in all tables to ensure decimal points align.

### Don't:
- **No 100% Black:** Never use #000000. Use `on_surface` (#191c1e) for all text to maintain the "Deep Blue" tonal depth.
- **No Sharp Corners:** Avoid `none` or `sm` roundedness for cards. Use `lg` or `xl` to keep the application feeling approachable and modern.
- **No Grid Bloat:** Avoid putting a border around every single data point. Let the typography and color shifts do the heavy lifting.