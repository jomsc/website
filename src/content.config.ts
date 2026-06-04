import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  // Astro 6: collections use a loader; the old `type: 'content'` is gone.
  // This glob picks up every .md / .mdx file in src/content/projects,
  // ignoring files that start with an underscore.
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    cover: z.string().optional(),
    accent: z.string().optional(),
    draft: z.boolean().optional(),  // true = greyed-out "coming soon" card
  }),
});

export const collections = { projects };