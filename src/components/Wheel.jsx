import { useEffect, useMemo, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * A real prize wheel.
 *
 * Fairness model: the winning team is decided BEFORE the spin (passed in as
 * `targetTeam`). The wheel is pure theatre — it always decelerates onto the
 * pre-selected segment, with a little random jitter inside the segment so
 * every landing looks different.
 *
 * Props:
 *   teams      — current pool shown on the wheel
 *   targetTeam — the pre-drawn winner the wheel must land on
 *   spinToken  — increment to trigger a spin
 *   onLanded   — called once the wheel stops
 *   variant    — "gold" (favourites) | "green" (underdogs)
 * ------------------------------------------------------------------------- */

const PALETTES = {
  gold: ["#ff3d7f", "#ffc83d", "#2de2ff", "#5b2fd1", "#ff6a3d", "#19d97c", "#3a6cff", "#e23d5b"],
  green: ["#2de2ff", "#5b2fd1", "#ff3d7f", "#19d97c", "#ffc83d", "#3a6cff", "#ff6a3d", "#9b2fd1"],
};

const SIZE = 320;
const C = SIZE / 2;
const R = 150;

function polar(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return [C + radius * Math.sin(rad), C - radius * Math.cos(rad)];
}

function segmentPath(i, n) {
  const seg = 360 / n;
  const a1 = i * seg + 0.0001;
  const a2 = (i + 1) * seg - 0.0001;
  const [x1, y1] = polar(a1, R);
  const [x2, y2] = polar(a2, R);
  const largeArc = seg > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export default function Wheel({ teams, targetTeam, spinToken, onLanded, variant = "gold" }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const rotRef = useRef(0);
  const landedRef = useRef(null);
  const palette = PALETTES[variant] || PALETTES.gold;
  const n = Math.max(teams.length, 1);
  const seg = 360 / n;
  const showLabels = n <= 16;

  const segments = useMemo(
    () =>
      teams.map((team, i) => ({
        team,
        path: segmentPath(i, n),
        color: palette[i % palette.length],
        mid: (i + 0.5) * seg,
      })),
    [teams.join("|")] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!spinToken || !targetTeam) return;
    const idx = teams.indexOf(targetTeam);
    if (idx < 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const jitter = (Math.random() - 0.5) * seg * 0.55;
    const targetAngle = ((360 - ((idx + 0.5) * seg + jitter)) % 360 + 360) % 360;
    const current = ((rotRef.current % 360) + 360) % 360;
    const delta = ((targetAngle - current) % 360 + 360) % 360;
    const fullTurns = reduceMotion ? 0 : 4 + Math.floor(Math.random() * 2);
    const total = rotRef.current + fullTurns * 360 + delta;
    rotRef.current = total;
    landedRef.current = onLanded;
    setSpinning(true);

    if (reduceMotion) {
      setRotation(total);
      const t = setTimeout(() => {
        setSpinning(false);
        landedRef.current && landedRef.current();
      }, 400);
      return () => clearTimeout(t);
    }
    // Next frame so the transition always fires.
    const raf = requestAnimationFrame(() => setRotation(total));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  function handleTransitionEnd(e) {
    if (e.propertyName !== "transform" || !spinning) return;
    setSpinning(false);
    landedRef.current && landedRef.current();
  }

  return (
    <div className={`wheel-wrap ${spinning ? "is-spinning" : ""}`}>
      <div className="wheel-pointer" aria-hidden="true" />
      <div
        className="wheel-rotor"
        style={{ transform: `rotate(${rotation}deg)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="wheel-svg" role="img" aria-label="Prize wheel">
          <circle cx={C} cy={C} r={R + 6} fill="#150e3d" />
          {segments.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          ))}
          {showLabels &&
            segments.map((s, i) => {
              const label = s.team.length > 12 ? s.team.slice(0, 11) + "…" : s.team;
              const [lx, ly] = polar(s.mid, R * 0.62);
              return (
                <text
                  key={`t${i}`}
                  x={lx}
                  y={ly}
                  className="wheel-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${s.mid + 90} ${lx} ${ly})`}
                >
                  {label}
                </text>
              );
            })}
          <circle cx={C} cy={C} r={30} fill="#150e3d" stroke="#ffc83d" strokeWidth="4" />
          <text x={C} y={C + 1} textAnchor="middle" dominantBaseline="middle" fontSize="26">
            ⚽
          </text>
        </svg>
      </div>
    </div>
  );
}
