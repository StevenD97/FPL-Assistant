import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/shared/layout/PageContainer";
import { BlogCover } from "@/features/blog/BlogCover";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";
import { getAllPosts, getPost, formatBlogDate } from "@/shared/lib/blog";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return { title: post ? `${post.title} - xFPL Blog` : "Blog - xFPL" };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <PageContainer>
      <Link href="/blog" className="text-xs font-medium text-text-primary hover:underline">
        &larr; Back to blog
      </Link>
      <article className="mx-auto max-w-3xl">
        <div className="mb-4">
          <BlogCover cover={post.cover} size="hero" />
        </div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium">
              {tag}
            </span>
          ))}
        </div>
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-text-primary">{post.title}</h1>
        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
      <div className="mx-auto mt-8 max-w-3xl">
        <DiscordCTA />
      </div>
    </PageContainer>
  );
}
