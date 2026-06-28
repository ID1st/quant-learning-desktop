import type { PropsWithChildren } from "react";

interface PlaceholderPageProps extends PropsWithChildren {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <article className="placeholder-page">
      <header>
        <p>第三阶段基础框架</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </header>
      {children}
    </article>
  );
}
