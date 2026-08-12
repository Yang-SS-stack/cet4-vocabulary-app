# LinguaJet Particle Transition Implementation Plan

**Goal:** Turn the visible welcome-page text into particles after a click, then gather those particles into the left navigation logo as the study page appears.

**Architecture:** `SplashScreen` records the rendered positions and typography of its visible text before it begins leaving. A fixed, transparent `ParticleTextTransition` canvas receives those snapshots plus the mounted `LinguaJet` logo target, animates through scatter and gather phases, then lets the normal logo appear.

**Global constraints:** Preserve the typed welcome sequence, waves, click-anywhere entry, navigation behavior, and reduced-motion support. Add no dependency. Keep particle logic isolated from `App.jsx` and the navigation component.

## Tasks

### Task 1: Add the particle transition component

- [ ] Write a failing component test for the transparent particle layer.
- [ ] Build `ParticleTextTransition.jsx` and its CSS with a fixed canvas, scatter phase, gather phase, particle cap, and reduced-motion completion.
- [ ] Run the focused component test.

### Task 2: Connect the startup and learning surfaces

- [ ] Write a failing application test that a welcome click starts a particle transition and temporarily conceals the real `LinguaJet` logo.
- [ ] Have `SplashScreen` capture its rendered visible text before leaving.
- [ ] Mount the learning surface behind the splash, supply its logo position to the particle layer, and reveal the real logo after the transition completes.
- [ ] Run the focused application test.

### Task 3: Verify the complete interaction

- [ ] Run all tests, linting, production build, diff check, and the UI detector.
- [ ] Inspect the completed particle transition at desktop and mobile viewport sizes for clipping, text overflow, duplicate logos, and interaction blocking.
