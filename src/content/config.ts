import { defineCollection, z } from 'astro:content';

const projects = defineCollection({
  type: 'content', // markdown/MDX files in src/content/projects/
  schema: z.object({
    title: z.string(),         // e.g. "01 — Unfolding Flowers"
    order: z.number(),         // controls position in the drawer
    cover: z.string().optional(),   // optional cover image for the card
    accent: z.string().optional(),  // optional per-project accent color
  }),
});

export const collections = { projects };