/** Real flag images (display only — no scoring/logic lives here).
 *  flagOf() in predict.js stays the source of truth and the emoji fallback;
 *  this just maps team names → ISO codes so we can show round flag <img>s
 *  instead of emoji (which render as letters on Chrome/Windows). */

export const TEAM_ISO = {
  // star teams (draw.js PRESET_BIG_TEAMS)
  argentina: "ar", brazil: "br", france: "fr", england: "gb-eng", spain: "es",
  germany: "de", portugal: "pt", netherlands: "nl", belgium: "be", croatia: "hr",
  uruguay: "uy", colombia: "co", morocco: "ma", japan: "jp", usa: "us",
  mexico: "mx", switzerland: "ch", senegal: "sn", "south korea": "kr", ecuador: "ec",
  austria: "at", australia: "au", iran: "ir", "türkiye": "tr", turkiye: "tr", turkey: "tr",
  // underdogs (draw.js PRESET_LESSER_TEAMS)
  scotland: "gb-sct", norway: "no", sweden: "se", czechia: "cz", "czech republic": "cz",
  "bosnia & herzegovina": "ba", bosnia: "ba", canada: "ca", panama: "pa", haiti: "ht",
  "curaçao": "cw", curacao: "cw", paraguay: "py", egypt: "eg", algeria: "dz",
  tunisia: "tn", "ivory coast": "ci", ghana: "gh", "south africa": "za",
  "cape verde": "cv", "saudi arabia": "sa", qatar: "qa", uzbekistan: "uz",
  jordan: "jo", iraq: "iq", "dr congo": "cd", "new zealand": "nz",
};

/** Strip accents so "Türkiye"/"Curaçao" match their plain keys too. */
function strip(name) {
  return name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function isoOf(team) {
  if (!team) return null;
  const raw = team.trim().toLowerCase();
  if (TEAM_ISO[raw]) return TEAM_ISO[raw];
  return TEAM_ISO[strip(team)] || null;
}

export function flagUrl(team, w = 160) {
  const i = isoOf(team);
  return i ? `https://flagcdn.com/w${w}/${i}.png` : null;
}
