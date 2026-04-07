# User Features

Per-user feature module system. Each user can have different features enabled, delivered as isolated UI modules that mount into predefined slots.

## Creating a new user feature module

1. Create a directory: `src/features/user-features/u_<user-slug>--<feature-name>/`
2. Add a `component.tsx` exporting a default React component:
   ```tsx
   export default function MyFeature({ config }: { config: Record<string, unknown> }) {
     return <div>...</div>;
   }
   ```
3. Register it in `registry.ts`:
   ```ts
   import dynamic from 'next/dynamic';
   // ...
   'u_johndoe--study-timer': dynamic(() => import('./u_johndoe--study-timer/component')),
   ```
4. Insert a row into `user_features` table with the matching `feature_module` key and `mount_point`.

## How it works

- `useUserFeatures()` hook loads the current user's enabled features from Supabase
- `<UserFeatureSlot name="flashcard-tools" />` renders any features targeting that mount point
- The registry maps `feature_module` strings to lazy-loaded React components
- Features degrade gracefully: missing modules render nothing, errors are caught

## Mount points

| Slot name | Location | Purpose |
|---|---|---|
| `flashcard-tools` | Flashcard page | Extra tools below flashcard content |
| `quiz-controls` | Quiz page | Controls above quiz question area |
| `reader-sidebar` | Reader page | Sidebar content in the reader |
| `global-overlay` | Root layout | Global floating elements |

## Auto-build agent

The auto-build agent creates modules by:
1. Generating `component.tsx` in the user feature directory
2. Adding the entry to `registry.ts`
3. Inserting the `user_features` row via service role
