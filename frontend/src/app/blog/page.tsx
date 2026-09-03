import Link from "next/link";
import { Card } from "@/shared/ui/Card";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { BlogCover } from "@/features/blog/BlogCover";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";
import { getAllPosts, formatBlogDate } from "@/shared/lib/blog";

export const metadata = { title: "Blog - xFPL" };

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const latest = posts[0]?.date ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="Blog"
        subtitle="Squad-planning notes and gameweek analysis. Written by hand, so it appears when there is something worth saying rather than on a schedule - the numbers that update every week live on the rest of the site."
        action={
          latest ? (
            <span className="text-xs text-text-muted">
              Last post <time dateTime={latest}>{formatBlogDate(latest)}</time>
            </span>
          ) : undefined
        }
      />

      <DiscordCTA className="mb-5" />

      {posts.length === 0 ? (
        <p className="text-sm text-text-muted">No posts yet - check back soon.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
              <Card padded={false} className="overflow-hidden transition-colors group-hover:border-brand/40">
                <BlogCover cover={post.cover} />
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                    {post.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-1.5 text-md font-semibold text-text-primary group-hover:underline">{post.title}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{post.excerpt}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
