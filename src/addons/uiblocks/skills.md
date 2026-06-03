# UIBlocks Skills Guide

This reference guide provides a complete overview of the `uiblocks` spatial UI toolkit, designed to help developers and AI agents build interactive spatial user interfaces in `xrblocks` projects.

`uiblocks` wraps the `@pmndrs/uikit` Flexbox yoga-layout engine and Three.js capabilities, offering unified layout components, rich styling (gradients, borders, shadows), and spatial behaviors.

---

## 1. Setup & Bootstrap

### 1.1 HTML Import Map & Boilerplate Setup

To use `uiblocks` in an HTML container, configure the import map to load the builds of `xrblocks` and `uiblocks` alongside their peer dependencies (such as `@pmndrs/uikit`, `three`, and `yoga-layout`).

The import map must match the definitions and versions in the core bootstrap sample exactly. Refer to that sample for the complete HTML skeleton, stylesheet setup, and script bootstrap boilerplate:

- **Bootstrap Sample**: [samples/uiblocks/index.html](../../../samples/uiblocks/index.html)

> [!NOTE]
> Adjust the relative paths of `uiblocks` and `xrblocks` in the import map depending on the depth of your implementation folder relative to the repository root.

---

## 2. Canvas Mounting & Lifecycle

### 2.1 UICore

Acts as the central entry point for the UI lifecycle. Automatically adds/removes cards from the parent script group.

- `createCard(config: UICardOutProperties): UICard`
- `createAdditiveCard(config: UICardOutProperties): AdditiveUICard`
- `unregister(card: UICard): void`
- `clear(): void`

### 2.2 UICard

A `UICard` represents the physical spatial canvas in 3D space. It is grabbable by default if it has behaviors attached.

- **Position & Rotation**: Set using `position: THREE.Vector3` and `rotation: THREE.Quaternion`.
- **Dimensions**: Configured via absolute boundaries `sizeX` and `sizeY` (in meters).
- **Resolution (`pixelSize`)**: Defines the physical size of exactly 1 flexbox layout pixel (default: `0.002` meters per pixel).
- **Anchors**: Anchoring alignment in local space: `anchorX` (`'left'`, `'right'`, `'center'`, or number) and `anchorY` (`'bottom'`, `'top'`, `'center'`, or number).
- **Flexbox Layout**: Because `UICard` inherits from `@pmndrs/uikit`'s `Container` (via `ManipulationPanel`), it natively supports all standard Flexbox layout properties (e.g. `flexDirection`, `justifyContent`, `alignItems`, `gap`, `padding`) in its configuration to manage child positioning.

> [!TIP]
> For complete card mounting, sizing, anchoring, and density configs, refer to the cards sample: [samples/basic/cards/](./samples/basic/cards/).

---

## 3. Primitives & Elements API

`uiblocks` exposes several primitives derived from standard `@pmndrs/uikit` classes and enhanced with spatial features. The underlying source code definitions for these components are located in the [core source directory](./src/core/).

### 3.1 UIPanel

The generic layout container (equivalent to an HTML `<div>`). It is the primary element used for grouping, styling, layout configuration, and capturing user interactions.

#### 3.1.1 Flexbox Layout System

Layout arrangement inside panels is driven by the Yoga Flexbox engine, allowing elements to size and position dynamically.

- **Layout flow**: Position children dynamically using `flexDirection: 'row' | 'column'`.
- **Alignment & Distribution**: Align children using `justifyContent` (primary axis distribution) and `alignItems` (cross axis alignment).
- **Spacing**: Use `gap` to specify distance between child nodes, or individual `padding` / `margin` overrides.
- **Sizing constraints**: Control proportions using `flexGrow`, `flexShrink`, and percent-based or absolute widths and heights.

> [!TIP]
> For complete layouts, flex alignments, and responsive element scaling examples, refer to the layouts sample: [samples/basic/layouts/](./samples/basic/layouts/).

#### 3.1.2 Strokes, Corners & Shadows

Panels natively support custom borders, corner rounding, and shadows that follow the corner clipping.

- **Strokes (Borders)**: Configured using `strokeWidth`, `strokeColor`, and `strokeAlign: 'inside' | 'outside' | 'center'`.
- **Corner Rounding**: Adjust corner clipping bounds using `cornerRadius`.
- **Drop Shadows**: Configured using `dropShadowColor` (color or gradient), `dropShadowBlur` (radius), `dropShadowPosition` (`[x, y]` or `THREE.Vector2`), `dropShadowSpread`, and `dropShadowFalloff`.
- **Inner Shadows**: Configured using `innerShadowColor` (color or gradient), `innerShadowBlur` (radius), `innerShadowPosition` (`[x, y]` or `THREE.Vector2`), `innerShadowSpread`, and `innerShadowFalloff`.

> [!IMPORTANT]
> **Anti-Pattern:** Never use standard CSS-like `borderWidth` or `borderColor` properties on `UIPanel`. Using them forces a rigid rectangular border that ignores `cornerRadius`, causing sharp, non-rounded outline rendering.
> **Correct Practice:** Always use `strokeWidth` and `strokeColor` when adding borders that must follow the panel's corner clipping correctly.

#### 3.1.3 Linear/Radial Gradients

Fills (`fillColor`) and strokes (`strokeColor`) can accept detailed multi-stop gradient configuration objects.

- **gradientType**: `'linear'` or `'radial'`.
- **rotation**: Angle in degrees (for linear gradients).
- **stops**: Array of `{ position: number, color: string }`.

> [!TIP]
> For complete styling configuration details, including stroke outlines, drop/inner shadows, and gradients, refer to the panels sample: [samples/basic/panels/](./samples/basic/panels/).

#### 3.1.4 Interactions & Reactivity

Panels can receive pointer and controller raycast input interactions.

- **Hover States**: Tracked via `onHoverEnter` and `onHoverExit`.
- **Select/Click Action**: Triggered via `onClick` when the controller trigger/select finishes on the panel.
- **Event Handlers**: Must follow strict return types (returning `true` to indicate the event has been handled and suppress downstream fallback clicks).

> [!TIP]
> For complete interactive element setups, button configurations, and laser pointer hover/click response examples, refer to the interactions sample: [samples/basic/interactions/](./samples/basic/interactions/).

### 3.2 UIText

Renders multi-channel signed distance field (MSDF) text.

- **Properties**: `fontSize` (in pixels), `fontWeight` (`'normal'`, `'bold'`, or numeric), `color`, `textAlign` (`'left'`, `'right'`, `'center'`), `maxWidth`, `lineHeight`.
- **Methods**:
  - `setText(text: string)`
  - `setFontSize(size: number)`
  - `setColor(color: ColorRepresentation)`
  - `setOpacity(opacity: number)`

### 3.3 UIImage

Renders static 2D images or textures.

- **Properties**: Accepts standard image properties plus custom color overlays/tints.
- **Methods**:
  - `setSrc(src: string | THREE.Texture)`
  - `setColor(color: ColorRepresentation)`
  - `setOpacity(opacity: number)`
  - `setBorderRadius(radius: number)`

### 3.4 UIIcon

A reactive material design vector icon loader querying CDN repositories.

- **Properties**: `icon` (snake_case name, e.g. `'star'`), `iconStyle` (`'outlined'`, `'rounded'`, `'sharp'`), `iconWeight` (100-700), `iconFill` (0 or 1).
- **Methods**:
  - `setIcon(icon: string)`
  - `setIconStyle(style: string)`
  - `setIconWeight(weight: number | string)`
  - `setIconFill(fill: number)`
  - `setColor(color: ColorRepresentation)`

> [!TIP]
> For details and code examples on creating texts, loading images, and using material iconography, refer to the elements sample: [samples/basic/elements/](./samples/basic/elements/).

---

## 4. Spatial Behaviors

Spatial behaviors extend `UICardBehavior` and attach to cards to manage positioning relative to the user camera, controllers, or other objects.

### 4.1 HeadLeashBehavior

Makes the card gently follow the user's camera view.

- **offset** (`THREE.Vector3`): Position offset relative to camera space.
- **posLerp** (`number`): Position follow smoothing factor (default: `0.1`).
- **rotLerp** (`number`): Rotation follow smoothing factor (default: `0.1`).

### 4.2 BillboardBehavior

Forces the card's rotation to continuously face the camera.

- **mode** (`'cylindrical' | 'spherical'`): Cylindrical locks rotation to the Y-axis. Spherical follows on all 3 axes.
- **lerpFactor** (`number`): Rotation speed smoothing factor.

### 4.3 ManipulationBehavior

Provides 3DOF grabbable drag-and-drop operations using controller rays.

- **draggable** (`boolean`): Enables grabbing.
- **faceCamera** (`boolean`): Forces the card to face the camera while dragged.
- **manipulationMargin** (`number`): Border expansion area (in pixels) for grabbing without hitting elements directly.
- **manipulationCornerRadius** (`number`): Corner rounding of the draggable border.

### 4.4 ObjectAnchorBehavior

Locks the card's position/pose directly to another `THREE.Object3D` or coordinate structure in the scene.

- **target**: An object providing a `position` (and optional `quaternion`).
- **mode** (`'position' | 'rotation' | 'pose'`): Sets which axes are synchronized.
- **positionOffset** (`THREE.Vector3`): Local translation offset.
- **rotationOffset** (`THREE.Quaternion`): Local rotation offset.

### 4.5 ToggleAnimationBehavior

Provides scale animations when cards are shown, hidden, or toggled.

- **showAnimation**: `'scale'`
- **hideAnimation**: `'scale'`
- **duration** (`number`): Speed in seconds.

> [!TIP]
> For complete examples on configuring and attaching spatial behaviors (head-leashing, billboarding, controller grabbing, object anchoring, and show/hide scale transitions), refer to the behaviors sample: [samples/basic/behaviors/](./samples/basic/behaviors/).

---

## 5. Gotchas & Best Practices

### 5.1 Default Sizing and Flex Centering

By default, `uiCore.createCard()` sets the root layout box width to `200` layout pixels and configures `alignItems: 'stretch'`.

- **Quirk**: If a nested child has a custom `maxWidth` lower than `200`, it will be aligned to the left edge of the card, not the center.
- **Solution**: Pass `width: 'auto'` and `alignItems: 'center'` directly to `createCard()` config options to shrink-wrap components and center them on the card's pivot point.

### 5.2 SVG Asset Color Tinting

When using `UIImage` with a custom `color` property to overlay vector icon highlights, the SVG asset source paths must use pure white values (`fill="#FFFFFF"` or `stroke="#FFFFFF"`). Using hardcoded grey values multiplies the texture overlay and results in darkened, muted color tints.

### 5.3 Creating Buttons

Since `uiblocks` does not provide a built-in "button" class, buttons are created by using a `UIPanel` as the container (handling dimensions, background styles, and interaction event hooks) and adding a `UIText`, `UIIcon`, or `UIImage` inside it as a child. Detailed hover styling, click handlers, and transition effects can be seen in the [interactions sample](./samples/basic/interactions/).

### 5.4 Multi-Section UI Layouts

- **Typical Case**: In most cases, you only need one centered section under one `UICard` (configured by setting the card to `width: 'auto'` and `alignItems: 'center'`).
- **Complex Layouts**: For complicated scenarios requiring multiple distinct sections (such as a sidebar, header, or grid area) under a single spatial pivot:
  - **One Canvas (`UICard`)**: Do not spawn multiple individual `UICard` instances for each section. This is resource-intensive and creates spatial alignment drift.
  - **Flexbox Partitioning**: Instead, configure the layout flow on the root `UICard` itself (e.g. `flexDirection: 'row'`, `gap: 20`, `padding: 40`), and add child `UIPanel` instances to represent each layout section.
  - **Proportions**: Use `flexGrow` or percentage-based widths/heights on the child `UIPanel` sections to scale them dynamically to fill the card's layout bounds.

---

## 6. Troubleshooting & Developer Dialog Guide

When developers report that their UI is not rendering, styling is incorrect, or interactions are not firing, the AI agent should first use code investigation tools (e.g. `view_file` or `grep_search`) to perform a self-check before asking questions.

Only ask developers for information that cannot be determined from the code files (such as visual simulator outputs, headset behavior, console logs, or design intent).

### Dialog Guidelines & Rules

- **Request Screenshots**: If the layout or visual rendering is broken in a way that code analysis cannot explain, ask the developer to share a screenshot or video recording of the browser/simulator view.
- **Escalate Library Limitations**: If you suspect a bug or issue is caused by a feature limitation or an internal bug within the `uiblocks` library itself (rather than developer setup code), **stop debugging**, generate a short summary detailing the developer's target need and the potential gap/limitation identified in the library, and prompt the developer: _"I suspect this is a limitation of the current uiblocks library. Please share the summary below with the core engineering team for support."_

### 6.1 Interaction & Input Failures

- **Symptom**: Clicks, selections, or hovers are not triggering on panels or button compositions.
- **Agent Self-Check Actions**:
  1. Inspect the script files (specifically the script's `init()` method) to verify if `xb.core.input.raycaster.sortFunction = raycastSortFunction` is assigned.
  2. Inspect the bootstrap setup module (e.g. `main.ts`, `index.html`) to verify that `options.enableUI()` and `options.uikit.enable(uikit)` are called.
  3. Traverse the panel/card configuration in the code to ensure `pointerEvents: 'none'` is not blocking inputs.
  4. Inspect the hierarchy of elements under the target `UICard` in the code to verify there are no overlapping/blocking sibling elements, panels, or layout cards physically masking or overlaying the interactive component.

### 6.2 Styling & Render Failures

- **Symptom**: Shadows, strokes, or corner radiuses are not rendering as expected.
- **Agent Self-Check Actions**:
  1. Inspect panel properties in code to verify `borderWidth` and `borderColor` are not being used in place of `strokeWidth` and `strokeColor`.
  2. Verify that shadow properties (`dropShadowBlur`, `innerShadowBlur`) are defined and set to non-zero values.
  3. Verify Z-axis offsets of nested elements (e.g. `transformTranslateZ` or `position.z = 0.001`) to rule out Z-fighting.
  4. Verify color definition values (e.g. `fillColor`, `strokeColor`, `dropShadowColor`). Check if they are defined in unsupported formats (e.g. functional CSS strings like `rgba(255,255,255,0.5)` or `hsla(...)`) instead of standard hex strings (e.g. `'#ffffff'` or `'#fff'`) or Three.js Color instances.
- **User Clarification Questions (Only ask if code checks pass)**:
  - _"If your styling issues involve background colors or shadow colors, are they formatted as hex strings (e.g., '#ffffff')? If they are using rgba/hsla format, please convert them to standard hex strings or three.js Color objects."_

### 6.3 Sizing & Flexbox Layout Failures

- **Symptom**: Elements are squished to zero size, overflowing bounds, or misaligned.
- **Agent Self-Check Actions**:
  1. Verify the dimensions (`sizeX`/`sizeY` or `width`/`height`) of the parent `UICard` in the code.
  2. Check if the parent card is configured with `width: 'auto'` and `alignItems: 'center'` to avoid default stretching.
  3. Inspect `pixelSize` on the card to ensure pixel measurements on child elements map correctly.
- **User Clarification Questions (Only ask if code checks pass)**:
  - _"What are the target physical dimensions (in meters, e.g., `sizeX`/`sizeY`) and `pixelSize` scale factor you expect for the root `UICard`?"_
  - _"What are the specific pixel dimensions (width/height in layout pixels), padding, margins, and flex alignment settings you expect for the nested elements (like `UIPanel`, `UIText`, or `UIImage`)?"_
  - _"Do you have a design spec or specific pixel dimensions (e.g. from Figma) you want this layout to align with?"_
