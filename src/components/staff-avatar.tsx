import { imageUrl } from "@/server/images/store";

type Props = {
  name: string;
  photoId: string | null;
  size?: number;
};

/** Deterministic initials so the same person keeps the same placeholder. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  // `Array.from` rather than indexing: an Arabic or emoji name can hold
  // characters outside the basic plane, where `[0]` splits a surrogate pair.
  return parts.map((part) => Array.from(part)[0] ?? "").join("");
}

/**
 * A staff member's photo, falling back to their initials.
 *
 * A plain `<img>`, not `next/image`: these are already resized and re-encoded to
 * WebP on upload (see `server/images/store.ts`), so the optimiser has nothing
 * left to do, and routing them through it would put a second copy of every photo
 * in the image cache.
 */
export function StaffAvatar({ name, photoId, size = 56 }: Props) {
  const dimension = { width: size, height: size };

  if (!photoId) {
    return (
      <span
        aria-hidden
        style={dimension}
        className="flex shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-sm font-semibold text-muted"
      >
        {initials(name)}
      </span>
    );
  }

  return (
    /* Pre-resized WebP from our own route, so next/image would only add a
       second cached copy of every photo for no saving. See the note above. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(photoId)}
      // The name is already rendered beside every use of this component, so
      // announcing it twice would only add noise for a screen reader.
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={dimension}
      className="shrink-0 rounded-full border border-hairline object-cover"
    />
  );
}
