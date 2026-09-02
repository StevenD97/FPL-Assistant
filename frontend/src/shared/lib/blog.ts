import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

// Posts live as plain Markdown files with frontmatter in /content/blog, one
// file per post, filename = slug. Authored directly (by request, then
// committed) rather than through an in-app editor - there's no CMS or DB
// table here, just files read at request time.
const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// Cover art is built from the same official CDN images used everywhere else
// in the app (team badges, player photos - see analysis.py's
// team_badge_url/player_photo_url) rather than stock photography, which
// this app has no license for. "gradient" (no external image) is the
// default/fallback for posts with no single team or player to headline.
export type CoverPlayer = { code: number; name: string };
export type BlogCover =
  | { type: "player"; players: CoverPlayer[]; background?: "hero" | "pitch" }
  | { type: "badges"; teamCodes: number[]; background?: "hero" | "pitch" }
  | { type: "gradient"; background?: "hero" | "pitch" };

export type BlogPostMeta = {
  slug: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-26"
  excerpt: string;
  tags: string[];
  cover: BlogCover;
};

export type BlogPost = BlogPostMeta & { html: string };

function slugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function readCover(data: Record<string, unknown>): BlogCover {
  const raw = data.cover as Partial<BlogCover> | undefined;
  if (raw?.type === "player" && Array.isArray((raw as { players?: unknown }).players)) {
    return raw as BlogCover;
  }
  if (raw?.type === "badges" && Array.isArray((raw as { teamCodes?: unknown }).teamCodes)) {
    return raw as BlogCover;
  }
  return { type: "gradient", background: (raw as { background?: "hero" | "pitch" })?.background };
}

function readMeta(slug: string): BlogPostMeta {
  const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), "utf8");
  const { data } = matter(raw);
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    cover: readCover(data),
  };
}

export function getAllPosts(): BlogPostMeta[] {
  return slugs()
    .map(readMeta)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPost(slug: string): BlogPost | null {
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    cover: readCover(data),
    html: marked.parse(content, { async: false }) as string,
  };
}

export function formatBlogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * How old a post can be before the landing page stops featuring it as news.
 *
 * The homepage carried three posts under "From the blog" with no hint of
 * their age; by September they were five weeks old and every one of them was
 * pre-season copy ("preseason transfer watch", "opening fixture swings") about
 * a season that had since started. Stale content presented as current is a
 * stronger signal of abandonment than an empty section, because the reader has
 * to notice the date themselves to work out they were misled.
 *
 * Fourteen days is roughly the beat of an FPL fortnight: within it a post is
 * still about the situation the reader is in. Beyond it, the archive is still
 * at /blog, clearly dated - it just isn't presented as this week's thinking.
 */
export const FEATURED_POST_MAX_AGE_DAYS = 14;

/** Posts recent enough to feature. Empty is a perfectly good answer. */
export function getRecentPosts(limit: number, now: Date = new Date()): BlogPostMeta[] {
  const cutoff = now.getTime() - FEATURED_POST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return getAllPosts()
    .filter((post) => {
      const at = Date.parse(post.date);
      return Number.isFinite(at) && at >= cutoff;
    })
    .slice(0, limit);
}
