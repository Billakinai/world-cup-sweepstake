/* Tiny dependency-free confetti burst. Respects reduced-motion. */

const COLORS = ["#ff3d7f", "#2de2ff", "#ffc83d", "#ffffff", "#19d97c", "#5b2fd1"];

export function confettiBurst(count = 90) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const layer = document.createElement("div");
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(layer);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const duration = 1800 + Math.random() * 1600;
    const delay = Math.random() * 250;
    const rotate = Math.random() * 720 - 360;
    const drift = (Math.random() - 0.5) * 30;
    piece.style.cssText = `
      position:absolute; top:-4vh; left:${left}vw;
      width:${size}px; height:${size * (Math.random() > 0.5 ? 0.45 : 1)}px;
      background:${COLORS[i % COLORS.length]};
      border-radius:${Math.random() > 0.6 ? "50%" : "2px"};
      opacity:0.95;
    `;
    piece.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${drift}vw, 110vh) rotate(${rotate}deg)`,
          opacity: 0.85,
        },
      ],
      { duration, delay, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" }
    );
    layer.appendChild(piece);
  }

  setTimeout(() => layer.remove(), 4200);
}
