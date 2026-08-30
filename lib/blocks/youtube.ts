// lib/blocks/youtube.ts
/**
 * YouTube URL handling, in one place.
 *
 * The video block already parsed ids inline. The slider needs the same thing,
 * and a second copy of "get the id out of a YouTube URL" is how one of them
 * ends up handling youtu.be or /shorts/ and the other does not.
 */

/**
 * The eleven-character id from any of the shapes a person actually pastes:
 * a watch URL, a share link, an embed URL, a Shorts URL, or the bare id.
 *
 * Returns null rather than guessing. A slide with an unusable link should show
 * nothing rather than an embed of whatever the last path segment happened to
 * be — which is what splitting on "/" and taking the tail used to do for a
 * channel URL.
 */
export function youTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // A bare id, already extracted or typed by hand.
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);

  const candidate =
    host === 'youtu.be'
      ? segments[0]
      : host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')
        ? (url.searchParams.get('v') ??
          (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'v'
            ? segments[1]
            : undefined))
        : undefined;

  return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : null;
}

/**
 * A privacy-preserving embed URL.
 *
 * -nocookie so the player does not set tracking cookies before a visitor has
 * consented to anything. `loop` needs `playlist` set to the same id — a lone
 * loop=1 is ignored for a single video, which is a documented YouTube quirk
 * rather than an oversight.
 */
export function youTubeEmbedUrl(
  id: string,
  { autoplay = false, muted = true, controls = true } = {}
): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    controls: controls ? '1' : '0',
    loop: '1',
    playlist: id,
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}

/** Still frame, used when a visitor has asked for reduced motion. */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg`;
}
