"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { configMarcador } from "./esquemaBloques";
import { embedUrl } from "@/lib/embed";

/**
 * Bloque "bookmark": tarjeta con el título, la descripción y la imagen del enlace.
 * Si el enlace es un vídeo de YouTube o Vimeo, se incrusta el reproductor.
 */
export const BookmarkBlock = createReactBlockSpec(
  configMarcador,
  {
    render: ({ block }) => <Bookmark {...block.props} />,
    // En Markdown y HTML exportado, un enlace normal.
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>{block.props.title || block.props.url}</a>
      </p>
    ),
  },
);

function Bookmark({
  url,
  title,
  description,
  image,
  siteName,
}: {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}) {
  const embed = embedUrl(url);
  if (embed) {
    return (
      <div contentEditable={false} className="my-2 w-full overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="relative w-full pt-[56.25%]">
          <iframe
            src={embed}
            title={title || "Vídeo"}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      contentEditable={false}
      className="my-2 flex w-full items-stretch gap-3 overflow-hidden rounded-xl border border-[var(--border)] no-underline transition hover:border-brand"
    >
      <span className="min-w-0 flex-1 p-3">
        <span className="block truncate font-medium">{title || url}</span>
        {description && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-[var(--muted)]">{description}</span>
        )}
        <span className="mt-1 block truncate text-xs text-[var(--muted)]">{siteName || url}</span>
      </span>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="hidden w-40 shrink-0 object-cover sm:block" />
      )}
    </a>
  );
}
