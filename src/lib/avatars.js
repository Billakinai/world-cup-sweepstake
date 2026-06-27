// src/lib/avatars.js
// Permanent cartoon avatar for each player. Seed = name, so it never changes.
// Gender just biases hair/beard so faces read right. Add new joiners to GENDER below.

const GENDER = {
  "naz": "f", "b rehman": "m", "zish": "m", "kash": "m", "moona": "f",
  "farhaan": "m", "zak": "m", "shamim": "f", "zakie": "f", "tahreem": "f",
  "tahaira": "f", "safiya": "f", "aadam": "m", "kalsoom": "f", "mariam": "f",
  "big j": "f", "aishah": "f", "aliyah!!": "f", "hashim": "m", "sadiya": "f",
  "javairia": "f", "bk": "m", "imran": "m", "e3esr": "m", "inaaya": "f",
  "shereen": "f", "na": "f",
};

// happy expression for everyone
const HAPPY =
  "&mouth=smile,tongue,twinkle&eyes=happy,wink,default,hearts" +
  "&eyebrows=raisedExcited,raisedExcitedNatural,default,upDown";
const FEMALE =
  "&top=bob,bun,curly,curvy,bigHair,straight01,straight02,straightAndStrand," +
  "longButNotTooLong,miaWallace,frida,fro&facialHairProbability=0&accessoriesProbability=12";
const MALE =
  "&top=shortCurly,shortFlat,shortRound,shortWaved,sides,theCaesar," +
  "theCaesarAndSidePart,dreads01,frizzle&facialHairProbability=55&accessoriesProbability=4";
// Restrict every face to light/medium tones (one is chosen deterministically per name).
const SKIN = "&skinColor=f2d3b1,fdbcb4,ecad80";

export function avatarGender(name) {
  return GENDER[(name || "").trim().toLowerCase()] || "m"; // unknown joiners default to male; add them above
}

export function avatarUrl(name) {
  const seed = encodeURIComponent((name || "").trim());
  const g = avatarGender(name) === "f" ? FEMALE : MALE;
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&radius=50${HAPPY}${g}${SKIN}`;
}
