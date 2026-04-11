export interface HairstylePrompt {
  id: string;
  nameRo: string;
  nameEn: string;
  prompt: string;
  category: string;
  gender: "male" | "female";
}

export const HAIRSTYLE_PROMPTS: HairstylePrompt[] = [
  // ── MALE ──────────────────────────────────────────────────────────────────
  {
    id: "buzz-cut",
    nameRo: "Buzz Cut",
    nameEn: "Buzz Cut",
    prompt:
      "Edit only the hair: give this person a buzz cut. Hair uniformly short at 3mm length all around the head, including the sides, back, and top. Clean, military-style clipper cut with no taper or fade — same minimal length everywhere. No texture, no styling product, no volume. Scalp slightly visible through the hair. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "male",
  },
  {
    id: "skin-fade",
    nameRo: "Skin Fade",
    nameEn: "Skin Fade",
    prompt:
      "Edit only the hair: give this person a skin fade. The sides and back of the head fade completely down to bare skin at the temple line and nape — zero hair at the base, gradually increasing in density and length as it moves upward. The transition is seamless and smooth, going from exposed skin at the bottom to short hair (roughly 10–15mm) at the top of the sides. The top of the head retains 3–5cm of natural hair with a soft texture. Crisp, clean lines. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "fade",
    gender: "male",
  },
  {
    id: "mid-fade",
    nameRo: "Mid Fade",
    nameEn: "Mid Fade",
    prompt:
      "Edit only the hair: give this person a mid fade. The fade begins at the midpoint of the sides — approximately level with the top of the ear — and blends downward to very short or bare skin below that line. Above the fade line, hair gradually increases in length toward the top of the head. The top has 4–6cm of hair with natural texture. The transition between lengths is smooth and gradual, not abrupt. Neat, clean barbershop finish. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "fade",
    gender: "male",
  },
  {
    id: "low-fade",
    nameRo: "Low Fade",
    nameEn: "Low Fade",
    prompt:
      "Edit only the hair: give this person a low fade. The fade starts just above the ear and along the nape hairline, blending very short — almost to skin — at the very bottom. The fade is conservative and subtle, sitting low on the head, giving more coverage on the sides compared to higher fades. Hair length increases naturally from the fade line up to the top, where 4–6cm of hair rests with a natural or slightly textured finish. Clean, sharp outline around the ears and neck. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "fade",
    gender: "male",
  },
  {
    id: "high-fade",
    nameRo: "High Fade",
    nameEn: "High Fade",
    prompt:
      "Edit only the hair: give this person a high fade. The fade starts very high on the sides — near the top of the head, just below where the hair on top begins — and drops aggressively to bare skin or near-skin by the temple and above the ear. The sides and back are almost entirely faded, leaving only a defined island of hair on top. The top section has 4–6cm of styled hair. The contrast between the bare sides and the hair on top is dramatic and sharp. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "fade",
    gender: "male",
  },
  {
    id: "pompadour",
    nameRo: "Pompadour",
    nameEn: "Pompadour",
    prompt:
      "Edit only the hair: give this person a pompadour. The top hair is swept upward and backward, creating a tall, voluminous crest that rises 6–8cm above the forehead. The front section is the highest point, rolling back smoothly with a glossy, product-held shape. Hair on the sides is tight — either faded or slicked close to the head — creating strong contrast with the voluminous top. The overall shape is structured, polished, and classic. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "volum",
    gender: "male",
  },
  {
    id: "undercut",
    nameRo: "Undercut",
    nameEn: "Undercut",
    prompt:
      "Edit only the hair: give this person an undercut. The sides and back of the head are shaved or clipped very short — close to 1–2mm — with a hard, defined disconnection line separating them from the top. The top hair is significantly longer at 6–10cm and swept back or to the side, lying flat or with slight volume. The contrast between the shaved sides and the longer top is the defining feature — no blending or fading between the two sections. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "clasic",
    gender: "male",
  },
  {
    id: "crew-cut",
    nameRo: "Crew Cut",
    nameEn: "Crew Cut",
    prompt:
      "Edit only the hair: give this person a crew cut. The top of the head has short hair — roughly 2–3cm — combed or brushed forward toward the forehead, lying flat with minimal volume. The front hairline is slightly rounded. The sides and back taper short but are not faded to skin — they blend naturally from the top to a short, uniform length of about 5–8mm. A clean, classic barbershop cut with a tidy, neat appearance. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "male",
  },
  {
    id: "french-crop",
    nameRo: "French Crop",
    nameEn: "French Crop",
    prompt:
      "Edit only the hair: give this person a French crop. The top hair is cut short and sits flat, with a distinct textured fringe falling horizontally across the forehead — blunt or slightly choppy, landing just above the eyebrows. The fringe is a defining feature of this cut. The sides and back are faded or tapered short, often with a skin fade or low fade. The overall shape is boxy and structured from the top, with clean lines. Product may give slight texture. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "male",
  },
  {
    id: "taper",
    nameRo: "Taper",
    nameEn: "Taper",
    prompt:
      "Edit only the hair: give this person a taper cut. Hair gradually decreases in length from the top of the head downward — starting at full length on top (roughly 4–6cm) and tapering evenly shorter toward the nape and around the ears, ending at a very short but not bare length at the hairline. The transition is smooth and gradual, blending each length seamlessly into the next. No hard lines or dramatic contrast — this is a classic, timeless barbershop taper. Natural finish, lightly styled. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "clasic",
    gender: "male",
  },
  {
    id: "quiff",
    nameRo: "Quiff",
    nameEn: "Quiff",
    prompt:
      "Edit only the hair: give this person a quiff. The front section of the hair on top is pushed upward and slightly back, creating a voluminous peak just above the forehead — 5–7cm tall, with natural body and texture. The height is concentrated at the front and gradually lowers toward the crown. The sides are shorter — faded or tapered — providing contrast to the lifted top. The look is slightly tousled but intentional, styled with a matte or light-hold product. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "volum",
    gender: "male",
  },
  {
    id: "mohawk",
    nameRo: "Mohawk",
    nameEn: "Mohawk",
    prompt:
      "Edit only the hair: give this person a mohawk. A narrow strip of hair — roughly 4–6cm wide — runs along the center of the head from the front hairline to the nape. This central strip is left longer (5–8cm) and can be styled upward or left natural. Both sides of the head — everything outside the central strip — are shaved close to the skin or faded to near-bare. The contrast between the shaved sides and the central strip is sharp and dramatic. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "volum",
    gender: "male",
  },
  {
    id: "slick-back",
    nameRo: "Slick Back",
    nameEn: "Slick Back",
    prompt:
      "Edit only the hair: give this person a slick back. All the hair on top is combed straight back from the forehead toward the crown and nape, lying flat and close to the head with a high-shine, wet appearance — as if styled with pomade or gel. There are no loose strands or volume; the hair is plastered smooth and glossy. The sides may be lightly tapered or slicked down as well. The overall look is sleek, polished, and elegant. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "clasic",
    gender: "male",
  },
  {
    id: "chel",
    nameRo: "Chel",
    nameEn: "Bald",
    prompt:
      "Edit only the hair: completely remove all hair from this person's head, making them fully bald. The entire scalp — top, sides, back, temples, nape, and crown — should be completely bare with zero hair, zero stubble, and zero shadow. Smooth, clean-shaven skin across the entire head, matching the person's natural skin tone seamlessly. The scalp should have a natural, healthy-looking matte finish with subtle realistic skin sheen where light hits. No hair follicles visible, no five-o-clock shadow, no peach fuzz — completely smooth bare skin from forehead hairline to nape. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "ras",
    gender: "male",
  },

  // ── FEMALE ────────────────────────────────────────────────────────────────
  {
    id: "bob-clasic",
    nameRo: "Bob Clasic",
    nameEn: "Classic Bob",
    prompt:
      "Edit only the hair: Transform the hair into a classic bob cut. Hair falls straight and smooth to the jawline, blunt-cut ends with no layering, slight inward curl at the tips, center or side part. The length is uniform all the way around — same level at the jaw on both sides and at the back. No volume at the crown, hair lies close and polished. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "female",
  },
  {
    id: "french-bob",
    nameRo: "Bob Scurt / French Bob",
    nameEn: "French Bob",
    prompt:
      "Edit only the hair: Transform the hair into a French bob. Hair is cut blunt and straight, ending just below the cheekbones — shorter than a classic bob, grazing the cheeks. The back is cut level and straight across the nape. A full, blunt fringe falls horizontally across the forehead, landing just above the eyebrows. The overall silhouette is a clean rounded bowl shape. Texture is smooth and straight with no layering. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "female",
  },
  {
    id: "pixie-cut",
    nameRo: "Pixie Cut",
    nameEn: "Pixie Cut",
    prompt:
      "Edit only the hair: Transform the hair into a pixie cut. Hair is cut very short all over — sides and back trimmed close to 1–2cm, tapering neatly around the ears and nape. The top section is slightly longer at 3–5cm, styled forward or swept to one side with a light textured finish. The cut frames the face closely with a clean, feminine silhouette. A few soft pieces may fall toward the forehead. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "female",
  },
  {
    id: "lob",
    nameRo: "Lob / Bob Lung",
    nameEn: "Lob",
    prompt:
      "Edit only the hair: Transform the hair into a lob (long bob). Hair falls straight or with a very slight wave, ending just above the shoulders or at collarbone length. The ends are blunt-cut or very lightly textured for a modern feel. Minimal layering — the weight is kept through the ends. A soft center or side part, with the hair framing the face gently on both sides. Clean, polished, effortlessly chic. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "mediu",
    gender: "female",
  },
  {
    id: "breton-drept",
    nameRo: "Breton Drept",
    nameEn: "Straight Blunt Bangs",
    prompt:
      "Edit only the hair: Add a straight blunt fringe (breton/bangs) to the existing hair length. Cut a thick, horizontal band of hair across the forehead ending just above or at the eyebrows — the fringe is dense, straight, and blunt with no feathering or thinning. The rest of the hair remains at its current length, falling naturally past the shoulders or at mid-length. The fringe is the focal change: heavy, bold, and perfectly straight across. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "mediu",
    gender: "female",
  },
  {
    id: "beach-waves",
    nameRo: "Onduri de Plajă",
    nameEn: "Beach Waves",
    prompt:
      "Edit only the hair: Transform the hair into beach waves. Hair is medium to long — reaching mid-back or below the shoulders — with loose, effortless undulating waves throughout. The waves are irregular and natural-looking, not uniform or tight curls. The texture appears slightly tousled and sun-kissed, as if air-dried after swimming. Volume is distributed evenly from mid-length to the ends. The roots are smooth and the waves open up from about mid-shaft downward. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "ondulat",
    gender: "female",
  },
  {
    id: "balayage",
    nameRo: "Balayage",
    nameEn: "Balayage",
    prompt:
      "Edit only the hair: Apply a balayage color technique to the existing hair length and style. The roots remain the natural base color (dark brown or the person's natural tone). Color transitions gradually and naturally into warm caramel, honey-blonde, or golden highlights from mid-shaft downward, concentrating the lightness at the ends and face-framing sections. The blend is soft and seamless — no harsh lines, no foil-block streaks. The result looks sun-kissed and dimensional. Do not change the haircut or length. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "colorat",
    gender: "female",
  },
  {
    id: "bucle-definite",
    nameRo: "Bucle Definite",
    nameEn: "Defined Curls",
    prompt:
      "Edit only the hair: Transform the hair into defined, bouncy curls. Hair is medium to long length, styled into uniform spiral or ringlet curls throughout — each curl is separate, coiled, and well-defined from root to tip. The texture is springy and full of body, with no frizz or undefined sections. Volume is generous and rounded. The curls are evenly distributed on all sides and fall naturally around the face and shoulders. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "ondulat",
    gender: "female",
  },
  {
    id: "tunsoare-straturi",
    nameRo: "Tunsoare în Straturi",
    nameEn: "Layered Cut",
    prompt:
      "Edit only the hair: Transform the hair into a layered cut. Hair falls to shoulder or mid-back length with multiple graduated layers cut throughout — shorter layers begin around the cheekbone level and longer layers cascade down, each one adding movement and dimension. The layers are blended seamlessly so there are no abrupt transitions. The ends are slightly pointed or feathered, not blunt. The overall shape is full at the top and flows with natural movement toward the ends. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "mediu",
    gender: "female",
  },
  {
    id: "shag-cut",
    nameRo: "Shag Cut",
    nameEn: "Shag Cut",
    prompt:
      "Edit only the hair: Transform the hair into a shag cut. Hair is medium length — reaching the shoulders or just below — with heavy, choppy layers throughout the entire head. The crown has shorter, voluminous layers that give a tousled, lived-in texture. Face-framing curtain layers fall around the cheeks. The ends are textured and slightly wispy, not blunt. A soft, messy fringe optionally frames the forehead. The overall vibe is effortlessly undone, rock-inspired, and full of movement. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "mediu",
    gender: "female",
  },
  {
    id: "curtain-bangs",
    nameRo: "Breton Perdea",
    nameEn: "Curtain Bangs",
    prompt:
      "Edit only the hair: Add curtain bangs to the existing hairstyle. A soft fringe is parted in the center of the forehead and falls diagonally outward to each side, framing the face like parted curtains. The bangs are wispy and feathered — not blunt or heavy — with each side sweeping gently toward the temples and blending into the rest of the hair. The longest point of the bangs reaches approximately cheek level at the outer edges. The rest of the hair remains at its current length. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "mediu",
    gender: "female",
  },
  {
    id: "par-scurt-texturat",
    nameRo: "Păr Scurt Texturat",
    nameEn: "Short Textured Hair",
    prompt:
      "Edit only the hair: Transform the hair into a short textured style. Hair is cut to approximately 5–8cm on top with shorter, tapered sides and back. The top is styled with product to create visible, separated texture — individual strands and pieces are defined, giving the hair a deliberately tousled, piece-y look. The cut has a modern, effortless edge with the ends pointed and disconnected. Clean lines around the ears and nape. The style reads as chic and low-maintenance. Same person, preserve all facial features, same skin tone, same background. Photorealistic result.",
    category: "scurt",
    gender: "female",
  },
];

export function getDefaultPrompt(
  hairstyleName: string,
  gender?: "male" | "female"
): string {
  const found = HAIRSTYLE_PROMPTS.find(
    (h) =>
      (h.nameRo.toLowerCase() === hairstyleName.toLowerCase() ||
        h.nameEn.toLowerCase() === hairstyleName.toLowerCase()) &&
      (gender === undefined || h.gender === gender)
  );
  return (
    found?.prompt ??
    `Edit only the hair: apply a ${hairstyleName} hairstyle. Keep it natural and photorealistic. Same person, preserve all facial features, same skin tone, same background.`
  );
}

export function getHairstylesByGender(
  gender: "male" | "female"
): HairstylePrompt[] {
  return HAIRSTYLE_PROMPTS.filter((h) => h.gender === gender);
}

export function getCategories(gender: "male" | "female"): string[] {
  const styles = getHairstylesByGender(gender);
  return [...new Set(styles.map((s) => s.category))];
}
