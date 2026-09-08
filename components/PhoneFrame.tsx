"use client";

/**
 * The single phone frame used by every builder section.
 *
 * Width, height, radius and position come from CSS variables so no section can
 * define its own size: switching between Content, Style, Theme, Profile and
 * Preview must never resize, rescale or move the frame. Sections put their own
 * scrolling content inside `.phoneScreen`; overlay sheets are positioned
 * against `.phoneDevice` so they stay inside the frame.
 */
export function PhoneFrame({
  children,
  label,
  overlays,
}: {
  children: React.ReactNode;
  label?: string;
  overlays?: React.ReactNode;
}) {
  return (
    <div className="phoneStage">
      <section className="phoneDevice" aria-label={label}>
        <div className="phoneScreen">{children}</div>
        {overlays}
      </section>
    </div>
  );
}
