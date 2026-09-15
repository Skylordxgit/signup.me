"use client";

/**
 * The single fixed phone frame component used by the admin page builder.
 *
 * Fixed 9:16 aspect ratio, border radius, padding, and centered positioning
 * are maintained identically across all builder tabs and content states.
 * Scrolling is strictly internal via .phoneScreen, preventing device resizing.
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

