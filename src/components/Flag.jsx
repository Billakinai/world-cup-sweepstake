import { flagUrl } from "../lib/flags";
import { flagOf } from "../lib/predict"; // read-only emoji fallback, never blank

/** Round flag image. Falls back to the existing emoji if we don't have an ISO
 *  code for the team, so it's never empty. Display only. */
export default function Flag({ team, size = 28, ring = true }) {
  const url = flagUrl(team);
  if (!url) {
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{flagOf(team)}</span>;
  }
  return (
    <img
      src={url}
      alt={team}
      title={team}
      loading="lazy"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flex: "none",
        display: "inline-block",
        verticalAlign: "middle",
        border: ring ? "2px solid rgba(255,255,255,.22)" : "none",
        boxShadow: "0 2px 6px rgba(0,0,0,.3)",
        background: "rgba(255,255,255,.06)",
      }}
    />
  );
}
