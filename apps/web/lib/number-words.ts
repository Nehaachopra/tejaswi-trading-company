// an amount as people say it, to the number typed: "twenty five thousand" → 25000, "1 lakh 25 thousand" → 125000,
// "two crore" → 20000000, "fifteen hundred" → 1500, "twelve point five" → 12.5, "25,000 rupees" → 25000, and in
// Hindi too ("paanch lakh teen sau chauranbe" → 500394, "पच्चीस हज़ार" → 25000, mixed with English or digits). Kannada
// ones and scales; digits in any script. Null when it isn't a number
const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = {
  thousand: 1_000, thousands: 1_000,
  // and the ways Chrome mishears lakh and crore
  lakh: 1_00_000, lakhs: 1_00_000, lac: 1_00_000, lacs: 1_00_000, lack: 1_00_000, lacks: 1_00_000, lak: 1_00_000, luck: 1_00_000, lao: 1_00_000, lakha: 1_00_000, laakh: 1_00_000,
  crore: 1_00_00_000, crores: 1_00_00_000, core: 1_00_00_000, cores: 1_00_00_000, karore: 1_00_00_000, crorepati: 1_00_00_000,
  million: 1_000_000, millions: 1_000_000,
};
// digits as Hindi (०-९) and Kannada (೦-೯) speech comes back, as 0-9
export const asciiDigits = (text: string) => text.replace(/[\u0966-\u096f]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/[\u0ce6-\u0cef]/g, (d) => String(d.charCodeAt(0) - 0x0ce6));

// Hindi numbers 1-99 written in Latin letters (as Chrome writes "paanch lakh teen sau chauranbe"); looked up by their
// shape, so spellings close to these match too ("chaurannve", "pachees")
const HINDI_LATIN: Record<string, number> = { "shunya": 0, "sunya": 0, "shoonya": 0, "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10, "gyarah": 11, "barah": 12, "terah": 13, "chaudah": 14, "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19, "bees": 20, "ikkis": 21, "bais": 22, "teis": 23, "chaubis": 24, "pachchis": 25, "chhabbis": 26, "sattais": 27, "atthais": 28, "untis": 29, "tees": 30, "iktis": 31, "battis": 32, "taintis": 33, "chauntis": 34, "paintis": 35, "chhattis": 36, "saintis": 37, "adtis": 38, "untalis": 39, "chalis": 40, "iktalis": 41, "bayalis": 42, "taintalis": 43, "chavalis": 44, "paintalis": 45, "chhiyalis": 46, "saintalis": 47, "adtalis": 48, "unchas": 49, "pachas": 50, "ikyavan": 51, "bavan": 52, "tirpan": 53, "chauvan": 54, "pachpan": 55, "chhappan": 56, "sattavan": 57, "atthavan": 58, "unsath": 59, "saath": 60, "iksath": 61, "basath": 62, "tirsath": 63, "chausath": 64, "painsath": 65, "chhiyasath": 66, "sadsath": 67, "adsath": 68, "unhattar": 69, "sattar": 70, "ikhattar": 71, "bahattar": 72, "tihattar": 73, "chauhattar": 74, "pachhattar": 75, "chhihattar": 76, "satattar": 77, "athhattar": 78, "unasi": 79, "assi": 80, "ikyasi": 81, "bayasi": 82, "tirasi": 83, "chaurasi": 84, "pachasi": 85, "chhiyasi": 86, "sattasi": 87, "atthasi": 88, "navasi": 89, "nabbe": 90, "ikyanve": 91, "baanve": 92, "tiranve": 93, "chauranve": 94, "pachanve": 95, "chhiyanve": 96, "sattanve": 97, "atthanve": 98, "ninyanve": 99, "chaar": 4, "panch": 5, "paach": 5, "che": 6, "chah": 6, "chhah": 6, "sat": 7, "ath": 8, "nao": 9, "dus": 10, "gyara": 11, "bara": 12, "tera": 13, "chauda": 14, "pandra": 15, "sola": 16, "satra": 17, "athara": 18, "unnees": 19, "bis": 20, "pachis": 25, "pacchis": 25, "tis": 30, "chalees": 40, "pachaas": 50, "sath": 60, "assee": 80, "nabbey": 90, "chauranbe": 94, "baanbe": 92, "nabe": 90 };

// the other common Latin spellings of Hindi numbers, as Chrome writes them ("biyanbe" 92, "ikkees" 21, "nawasi" 89)
const HINDI_VARIANTS: Record<string, number> = { "ikkees": 21, "ekkis": 21, "baaees": 22, "baais": 22, "teyis": 23, "teis": 23, "tes": 23, "chaubees": 24, "chobis": 24, "chhabbees": 26, "chabbis": 26, "sattaees": 27, "sattayis": 27, "atthaees": 28, "athais": 28, "athhais": 28, "untees": 29, "unatees": 29, "unatis": 29, "iktees": 31, "ekattis": 31, "ikattis": 31, "battees": 32, "tentees": 33, "taintees": 33, "tetis": 33, "chauntees": 34, "chautis": 34, "paintees": 35, "pentis": 35, "chhattees": 36, "chattis": 36, "saintees": 37, "sentis": 37, "adtees": 38, "artees": 38, "artis": 38, "untaalis": 39, "unchaalis": 39, "iktaalis": 41, "ektalis": 41, "bayaalis": 42, "biyalis": 42, "biyaalis": 42, "tentaalis": 43, "taitalis": 43, "chavaalis": 44, "chawalis": 44, "chauvalis": 44, "paintaalis": 45, "pentalis": 45, "chhiyaalis": 46, "chiyalis": 46, "saintaalis": 47, "sentalis": 47, "adtaalis": 48, "artalis": 48, "artaalis": 48, "unchaas": 49, "unchas": 49, "ikyaavan": 51, "ekyavan": 51, "ikyawan": 51, "baavan": 52, "bawan": 52, "baawan": 52, "tirepan": 53, "tirpan": 53, "tiraepan": 53, "chauvan": 54, "chauwan": 54, "chovan": 54, "pachpan": 55, "pachapan": 55, "chhappan": 56, "chappan": 56, "sattavan": 57, "sattawan": 57, "atthavan": 58, "athawan": 58, "atthawan": 58, "unsaath": 59, "unsath": 59, "iksaath": 61, "eksath": 61, "baasath": 62, "basaath": 62, "tiresath": 63, "tirsath": 63, "tirsaath": 63, "chaunsath": 64, "chausath": 64, "painsath": 65, "pensath": 65, "chhiyasath": 66, "chhiyasaath": 66, "chiyasath": 66, "sadsath": 67, "sarsath": 67, "adsath": 68, "arsath": 68, "unhattar": 69, "ikhattar": 71, "ekhattar": 71, "bahattar": 72, "behattar": 72, "tihattar": 73, "chauhattar": 74, "chohattar": 74, "pachhattar": 75, "pachattar": 75, "chhihattar": 76, "chihattar": 76, "sathattar": 77, "satattar": 77, "sathhattar": 77, "athhattar": 78, "athattar": 78, "unaasi": 79, "unyaasi": 79, "unasee": 79, "ikyaasi": 81, "ekyasi": 81, "bayaasi": 82, "biyasi": 82, "biyaasi": 82, "tiraasi": 83, "tirasee": 83, "chauraasi": 84, "chaurasee": 84, "pachaasi": 85, "pachasee": 85, "chhiyaasi": 86, "chiyasi": 86, "sattaasi": 87, "sattasee": 87, "atthaasi": 88, "athasi": 88, "navaasi": 89, "nawasi": 89, "nawaasi": 89, "navve": 90, "nabbe": 90, "nabbey": 90, "ikyanve": 91, "ikyanbe": 91, "ekyanve": 91, "ikkyanve": 91, "baanve": 92, "banve": 92, "biyanve": 92, "biyanbe": 92, "bayanve": 92, "bayanbe": 92, "bannve": 92, "tiranve": 93, "tiranbe": 93, "tirayanve": 93, "chauranve": 94, "chauranbe": 94, "chaurannve": 94, "pachanve": 95, "pachanbe": 95, "pachhanve": 95, "pachyanve": 95, "chhiyanve": 96, "chhiyanbe": 96, "chiyanve": 96, "chhayanve": 96, "sattanve": 97, "sattanbe": 97, "satanve": 97, "atthanve": 98, "atthanbe": 98, "athanve": 98, "atthaanve": 98, "ninyanve": 99, "ninyanbe": 99, "ninanve": 99, "ninnyanve": 99 };

// shapes a Latin-letter Hindi word down, so spellings of one word meet: doubled letters, long vowels (aa, ee, oo), a
// trailing h, w for v and "nbe"/"nve" endings come out the same (th and t stay apart: saath 60, saat 7)
const shape = (w: string) =>
  w
    .replace(/w/g, "v")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/(nbe|nve|nnve|nbey)$/, "nve")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/(?<=[aeiou])h$/, "")
    .replace(/ey$/, "e");
const HINDI_SHAPES = new Map([...Object.entries(HINDI_LATIN), ...Object.entries(HINDI_VARIANTS)].map(([w, n]) => [shape(w), n]));

// how many letters two words are apart (insert, delete or change one)
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length]!;
}

// a Hindi number spelt one letter off from every spelling known (a long word only, and only when exactly one number is
// that close, so it never picks between two)
function nearHindi(w: string): number | null {
  const sw = shape(w);
  if (sw.length < 5 || !/^[a-z]+$/.test(sw)) return null;
  const near = new Set<number>();
  for (const [known, n] of HINDI_SHAPES) if (Math.abs(known.length - sw.length) <= 1 && distance(sw, known) <= 1) near.add(n);
  return near.size === 1 ? [...near][0]! : null;
}

// numbers in Devanagari and Kannada words, as Chrome writes them in Hindi or Kannada
const NATIVE: Record<string, number> = {
  "शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "छे": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15, "पन्द्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20,
  "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90, "चौरानबे": 94, "चौरानवे": 94,
  "ಸೊನ್ನೆ": 0, "ಒಂದು": 1, "ಎರಡು": 2, "ಮೂರು": 3, "ನಾಲ್ಕು": 4, "ಐದು": 5, "ಆರು": 6, "ಏಳು": 7, "ಎಂಟು": 8, "ಒಂಬತ್ತು": 9, "ಹತ್ತು": 10,
};

// Kannada numbers 1-99, in Kannada script (with the joined forms, ಇಪ್ಪತ್ತೈದು 25) and in Latin letters (ippattaidu)
const KANNADA: Record<string, number> = { "ಇಪ್ಪತ್ಮೂರು": 23, "ಇಪ್ಪತ್ನಾಲ್ಕು": 24, "ಮೂವತ್ಮೂರು": 33, "ಮೂವತ್ನಾಲ್ಕು": 34, "ನಲವತ್ಮೂರು": 43, "ನಲವತ್ನಾಲ್ಕು": 44, "ಐವತ್ಮೂರು": 53, "ಐವತ್ನಾಲ್ಕು": 54, "ಅರವತ್ಮೂರು": 63, "ಅರವತ್ನಾಲ್ಕು": 64, "ಎಪ್ಪತ್ಮೂರು": 73, "ಎಪ್ಪತ್ನಾಲ್ಕು": 74, "ಎಂಬತ್ಮೂರು": 83, "ಎಂಬತ್ನಾಲ್ಕು": 84, "ತೊಂಬತ್ಮೂರು": 93, "ತೊಂಬತ್ನಾಲ್ಕು": 94, "ಹನ್ನೊಂದು": 11, "ಹನ್ನೆರಡು": 12, "ಹದಿಮೂರು": 13, "ಹದಿನಾಲ್ಕು": 14, "ಹದಿನೈದು": 15, "ಹದಿನಾರು": 16, "ಹದಿನೇಳು": 17, "ಹದಿನೆಂಟು": 18, "ಹತ್ತೊಂಬತ್ತು": 19, "ಇಪ್ಪತ್ತು": 20, "ಇಪ್ಪತ್ತೊಂದು": 21, "ಇಪ್ಪತ್ತೆರಡು": 22, "ಇಪ್ಪತ್ತ್ಮೂರು": 23, "ಇಪ್ಪತ್ತುಮೂರು": 23, "ಇಪ್ಪತ್ತ್ನಾಲ್ಕು": 24, "ಇಪ್ಪತ್ತುನಾಲ್ಕು": 24, "ಇಪ್ಪತ್ತೈದು": 25, "ಇಪ್ಪತ್ತಾರು": 26, "ಇಪ್ಪತ್ತೇಳು": 27, "ಇಪ್ಪತ್ತೆಂಟು": 28, "ಇಪ್ಪತ್ತೊಂಬತ್ತು": 29, "ಮೂವತ್ತು": 30, "ಮೂವತ್ತೊಂದು": 31, "ಮೂವತ್ತೆರಡು": 32, "ಮೂವತ್ತ್ಮೂರು": 33, "ಮೂವತ್ತುಮೂರು": 33, "ಮೂವತ್ತ್ನಾಲ್ಕು": 34, "ಮೂವತ್ತುನಾಲ್ಕು": 34, "ಮೂವತ್ತೈದು": 35, "ಮೂವತ್ತಾರು": 36, "ಮೂವತ್ತೇಳು": 37, "ಮೂವತ್ತೆಂಟು": 38, "ಮೂವತ್ತೊಂಬತ್ತು": 39, "ನಲವತ್ತು": 40, "ನಲವತ್ತೊಂದು": 41, "ನಲವತ್ತೆರಡು": 42, "ನಲವತ್ತ್ಮೂರು": 43, "ನಲವತ್ತುಮೂರು": 43, "ನಲವತ್ತ್ನಾಲ್ಕು": 44, "ನಲವತ್ತುನಾಲ್ಕು": 44, "ನಲವತ್ತೈದು": 45, "ನಲವತ್ತಾರು": 46, "ನಲವತ್ತೇಳು": 47, "ನಲವತ್ತೆಂಟು": 48, "ನಲವತ್ತೊಂಬತ್ತು": 49, "ಐವತ್ತು": 50, "ಐವತ್ತೊಂದು": 51, "ಐವತ್ತೆರಡು": 52, "ಐವತ್ತ್ಮೂರು": 53, "ಐವತ್ತುಮೂರು": 53, "ಐವತ್ತ್ನಾಲ್ಕು": 54, "ಐವತ್ತುನಾಲ್ಕು": 54, "ಐವತ್ತೈದು": 55, "ಐವತ್ತಾರು": 56, "ಐವತ್ತೇಳು": 57, "ಐವತ್ತೆಂಟು": 58, "ಐವತ್ತೊಂಬತ್ತು": 59, "ಅರವತ್ತು": 60, "ಅರವತ್ತೊಂದು": 61, "ಅರವತ್ತೆರಡು": 62, "ಅರವತ್ತ್ಮೂರು": 63, "ಅರವತ್ತುಮೂರು": 63, "ಅರವತ್ತ್ನಾಲ್ಕು": 64, "ಅರವತ್ತುನಾಲ್ಕು": 64, "ಅರವತ್ತೈದು": 65, "ಅರವತ್ತಾರು": 66, "ಅರವತ್ತೇಳು": 67, "ಅರವತ್ತೆಂಟು": 68, "ಅರವತ್ತೊಂಬತ್ತು": 69, "ಎಪ್ಪತ್ತು": 70, "ಎಪ್ಪತ್ತೊಂದು": 71, "ಎಪ್ಪತ್ತೆರಡು": 72, "ಎಪ್ಪತ್ತ್ಮೂರು": 73, "ಎಪ್ಪತ್ತುಮೂರು": 73, "ಎಪ್ಪತ್ತ್ನಾಲ್ಕು": 74, "ಎಪ್ಪತ್ತುನಾಲ್ಕು": 74, "ಎಪ್ಪತ್ತೈದು": 75, "ಎಪ್ಪತ್ತಾರು": 76, "ಎಪ್ಪತ್ತೇಳು": 77, "ಎಪ್ಪತ್ತೆಂಟು": 78, "ಎಪ್ಪತ್ತೊಂಬತ್ತು": 79, "ಎಂಬತ್ತು": 80, "ಎಂಬತ್ತೊಂದು": 81, "ಎಂಬತ್ತೆರಡು": 82, "ಎಂಬತ್ತ್ಮೂರು": 83, "ಎಂಬತ್ತುಮೂರು": 83, "ಎಂಬತ್ತ್ನಾಲ್ಕು": 84, "ಎಂಬತ್ತುನಾಲ್ಕು": 84, "ಎಂಬತ್ತೈದು": 85, "ಎಂಬತ್ತಾರು": 86, "ಎಂಬತ್ತೇಳು": 87, "ಎಂಬತ್ತೆಂಟು": 88, "ಎಂಬತ್ತೊಂಬತ್ತು": 89, "ತೊಂಬತ್ತು": 90, "ತೊಂಬತ್ತೊಂದು": 91, "ತೊಂಬತ್ತೆರಡು": 92, "ತೊಂಬತ್ತ್ಮೂರು": 93, "ತೊಂಬತ್ತುಮೂರು": 93, "ತೊಂಬತ್ತ್ನಾಲ್ಕು": 94, "ತೊಂಬತ್ತುನಾಲ್ಕು": 94, "ತೊಂಬತ್ತೈದು": 95, "ತೊಂಬತ್ತಾರು": 96, "ತೊಂಬತ್ತೇಳು": 97, "ತೊಂಬತ್ತೆಂಟು": 98, "ತೊಂಬತ್ತೊಂಬತ್ತು": 99, "ondu": 1, "eradu": 2, "mooru": 3, "naalku": 4, "aidu": 5, "aaru": 6, "elu": 7, "entu": 8, "ombattu": 9, "sonne": 0, "hannondu": 11, "hanneradu": 12, "hadimooru": 13, "hadinaalku": 14, "hadinaidu": 15, "hadinaaru": 16, "hadinelu": 17, "hadinentu": 18, "hattombattu": 19, "hattu": 10, "ippattu": 20, "ippattondu": 21, "ippattuondu": 21, "ippatteradu": 22, "ippattueradu": 22, "ippattmooru": 23, "ippattumooru": 23, "ippattnaalku": 24, "ippattunaalku": 24, "ippattaidu": 25, "ippattuaidu": 25, "ippattaaru": 26, "ippattuaaru": 26, "ippattelu": 27, "ippattuelu": 27, "ippattentu": 28, "ippattuentu": 28, "ippattombattu": 29, "ippattuombattu": 29, "moovattu": 30, "moovattondu": 31, "moovattuondu": 31, "moovatteradu": 32, "moovattueradu": 32, "moovattmooru": 33, "moovattumooru": 33, "moovattnaalku": 34, "moovattunaalku": 34, "moovattaidu": 35, "moovattuaidu": 35, "moovattaaru": 36, "moovattuaaru": 36, "moovattelu": 37, "moovattuelu": 37, "moovattentu": 38, "moovattuentu": 38, "moovattombattu": 39, "moovattuombattu": 39, "nalavattu": 40, "nalavattondu": 41, "nalavattuondu": 41, "nalavatteradu": 42, "nalavattueradu": 42, "nalavattmooru": 43, "nalavattumooru": 43, "nalavattnaalku": 44, "nalavattunaalku": 44, "nalavattaidu": 45, "nalavattuaidu": 45, "nalavattaaru": 46, "nalavattuaaru": 46, "nalavattelu": 47, "nalavattuelu": 47, "nalavattentu": 48, "nalavattuentu": 48, "nalavattombattu": 49, "nalavattuombattu": 49, "aivattu": 50, "aivattondu": 51, "aivattuondu": 51, "aivatteradu": 52, "aivattueradu": 52, "aivattmooru": 53, "aivattumooru": 53, "aivattnaalku": 54, "aivattunaalku": 54, "aivattaidu": 55, "aivattuaidu": 55, "aivattaaru": 56, "aivattuaaru": 56, "aivattelu": 57, "aivattuelu": 57, "aivattentu": 58, "aivattuentu": 58, "aivattombattu": 59, "aivattuombattu": 59, "aravattu": 60, "aravattondu": 61, "aravattuondu": 61, "aravatteradu": 62, "aravattueradu": 62, "aravattmooru": 63, "aravattumooru": 63, "aravattnaalku": 64, "aravattunaalku": 64, "aravattaidu": 65, "aravattuaidu": 65, "aravattaaru": 66, "aravattuaaru": 66, "aravattelu": 67, "aravattuelu": 67, "aravattentu": 68, "aravattuentu": 68, "aravattombattu": 69, "aravattuombattu": 69, "eppattu": 70, "eppattondu": 71, "eppattuondu": 71, "eppatteradu": 72, "eppattueradu": 72, "eppattmooru": 73, "eppattumooru": 73, "eppattnaalku": 74, "eppattunaalku": 74, "eppattaidu": 75, "eppattuaidu": 75, "eppattaaru": 76, "eppattuaaru": 76, "eppattelu": 77, "eppattuelu": 77, "eppattentu": 78, "eppattuentu": 78, "eppattombattu": 79, "eppattuombattu": 79, "embattu": 80, "embattondu": 81, "embattuondu": 81, "embatteradu": 82, "embattueradu": 82, "embattmooru": 83, "embattumooru": 83, "embattnaalku": 84, "embattunaalku": 84, "embattaidu": 85, "embattuaidu": 85, "embattaaru": 86, "embattuaaru": 86, "embattelu": 87, "embattuelu": 87, "embattentu": 88, "embattuentu": 88, "embattombattu": 89, "embattuombattu": 89, "tombattu": 90, "tombattondu": 91, "tombattuondu": 91, "tombatteradu": 92, "tombattueradu": 92, "tombattmooru": 93, "tombattumooru": 93, "tombattnaalku": 94, "tombattunaalku": 94, "tombattaidu": 95, "tombattuaidu": 95, "tombattaaru": 96, "tombattuaaru": 96, "tombattelu": 97, "tombattuelu": 97, "tombattentu": 98, "tombattuentu": 98, "tombattombattu": 99, "tombattuombattu": 99 };

// the Kannada hundreds, each its own word, and as said inside a bigger number (ಇನ್ನೂರು/ಇನ್ನೂರ 200, ಐನೂರು 500;
// innooru, ainoora)
const KANNADA_HUNDREDS: Record<string, number> = { "ಇನ್ನೂರ": 200, "ಮುನ್ನೂರ": 300, "ನಾನೂರ": 400, "ಐನೂರ": 500, "ಆರುನೂರ": 600, "ಏಳುನೂರ": 700, "ಎಂಟುನೂರ": 800, "ಒಂಬೈನೂರ": 900, "innoora": 200, "munnoora": 300, "naanoora": 400, "ainoora": 500, "aarunoora": 600, "elunoora": 700, "entunoora": 800, "ombainoora": 900, "ನೂರು": 100, "ಇನ್ನೂರು": 200, "ಮುನ್ನೂರು": 300, "ನಾನೂರು": 400, "ಐನೂರು": 500, "ಆರುನೂರು": 600, "ಏಳುನೂರು": 700, "ಎಂಟುನೂರು": 800, "ಒಂಬೈನೂರು": 900, "ನೂರ": 100, "nooru": 100, "innooru": 200, "munnooru": 300, "naanooru": 400, "ainooru": 500, "aarunooru": 600, "elunooru": 700, "entunooru": 800, "ombainooru": 900, "noora": 100 };

// a Kannada number word as it's said inside a bigger one ("ಐದು ಲಕ್ಷದ ಐವತ್ತು ಸಾವಿರದ…", "lakshada", "saavirada"): its
// "of" ending taken off
const plainKannada = (w: string) =>
  w
    .replace(/(ಲಕ್ಷ|ಸಾವಿರ|ಕೋಟಿ)(ದ|ಯ|ದಾ)$/, "$1")
    .replace(/^(laksha|lakh|saavira|savira|koti)(da|ya)$/, "$1");

// scale words in Hindi (Latin and Devanagari) and Kannada
const NATIVE_SCALES: Record<string, number> = {
  sau: 100, so: 100, "सौ": 100, "ನೂರು": 100, "ನೂರ": 100,
  hazaar: 1_000, hazar: 1_000, hajaar: 1_000, hajar: 1_000, "हज़ार": 1_000, "हजार": 1_000, "ಸಾವಿರ": 1_000,
  "लाख": 1_00_000, "ಲಕ್ಷ": 1_00_000, laksha: 1_00_000, saavira: 1_000, savira: 1_000, koti: 1_00_00_000,
  karod: 1_00_00_000, karor: 1_00_00_000, "करोड़": 1_00_00_000, "करोड": 1_00_00_000, "ಕೋಟಿ": 1_00_00_000,
};

// a word's value as a number from 0 to 99, in English, Latin-letter Hindi, Devanagari or Kannada
const oneWord = (w: string): number | null =>
  ONES[w] ?? TENS[w] ?? NATIVE[w] ?? KANNADA[w] ?? HINDI_LATIN[w] ?? HINDI_VARIANTS[w] ?? HINDI_SHAPES.get(shape(w)) ?? nearHindi(w);

// how Hindi says halves and quarters before lakh, crore, thousand or hundred: dedh (1½) and dhai (2½) stand alone;
// saadhe (+½), sawa (+¼) and paune (−¼) change the number after them ("saadhe teen lakh" → 3,50,000)
const WHOLE_FRACTIONS: Record<string, number> = { dedh: 1.5, derh: 1.5, "डेढ़": 1.5, "डेढ": 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, "ढाई": 2.5 };
const FRACTION_SHIFT: Record<string, number> = { saadhe: 0.5, sadhe: 0.5, saade: 0.5, "साढ़े": 0.5, "साढे": 0.5, sawa: 0.25, sava: 0.25, "सवा": 0.25, paune: -0.25, pone: -0.25, "पौने": -0.25 };

// words that only dress an amount up
const FILLER = new Set(["rupees", "rupee", "rs", "inr", "only", "and", "a", "an", "of", "₹", "rupaye", "rupaiye", "rupay", "रुपये", "रुपए", "रुपया", "ರೂಪಾಯಿ", "aur", "और"]);

// a whole number or a decimal written in digits ("25,000" → 25000)
const asDigits = (word: string) => {
  const clean = word.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
};

// a number grouped as India writes it (1,000 · 25,000 · 5,50,650 · 1,00,00,000), or with no commas at all
const INDIAN_GROUPING = /^\d{1,3}$|^\d{1,2}(,\d{2})*,\d{3}$|^\d+$/;

// Chrome writes "fifty thousand six fifty" as "50,000,650": two numbers glued with a comma. A number not grouped the
// Indian way is split after each group of three zeros ("50,000" and "650"), so the parts add up as they were said
function unglue(word: string): string[] {
  const plain = word.replace(/\.\d+$/, "");
  // Chrome writes lakh and crore as words, so plain digits stay under a lakh; more than 5 digits ending in thousands
  // and then up to three more ("45000678") is two numbers run together: 45000 and 678
  const run = /^(\d+000)([1-9]\d{0,2})$/.exec(plain);
  if (run && plain.length > 5 && !word.includes(".")) return [run[1]!, run[2]!];
  if (!plain.includes(",") || INDIAN_GROUPING.test(plain)) return [word];
  const parts: string[] = [];
  let piece = "";
  for (const group of word.split(",")) {
    piece = piece ? `${piece},${group}` : group;
    if (group === "000") {
      parts.push(piece);
      piece = "";
    }
  }
  if (piece) parts.push(piece);
  return parts;
}

// "and" is only said after hundreds ("two hundred and seven"); when Chrome drops the "hundred" ("2 and 7"), a lone
// 1-9 right before the "and" gets it back
function hundredBeforeAnd(raw: string[]) {
  return raw.flatMap((w, i) => {
    const d = /^\d$/.test(w) ? Number(w) : oneWord(w);
    const before = raw[i - 1];
    const afterScale = before !== undefined && (before === "hundred" || before in SCALES || before in NATIVE_SCALES);
    return raw[i + 1] === "and" && d !== null && d >= 1 && d <= 9 && !afterScale ? [w, "hundred"] : [w];
  });
}

export function wordsToNumber(spoken: string): number | null {
  const words = hundredBeforeAnd(
    asciiDigits(spoken)
      .toLowerCase()
      .replace(/₹/g, " ")
      .replace(/-/g, " ")
      .split(/\s+/)
      .filter((w) => w !== ""),
  )
    .filter((w) => !FILLER.has(w))
    .map(plainKannada)
    .flatMap(unglue);
  if (words.length === 0) return null;

  // digits said one after another ("one two three", "aath nau shunya", "1 2 3") are one number, digit by digit: 123
  const single = words.map((w) => {
    if (/^\d$/.test(w)) return Number(w);
    const d = oneWord(w);
    return d !== null && d < 10 ? d : null;
  });
  if (words.length > 1 && single.every((d) => d !== null)) return Number(single.join(""));

  // groups of digits: added when they read as an amount's parts, each bigger one ending in zeros enough for the next
  // ("5800000 35000 721" → 58,35,721), else joined as said ("89 481 9755" → 894819755)
  if (words.length > 1 && words.every((w) => /^\d+$/.test(w))) {
    const zeros = (w: string) => w.length - w.replace(/0+$/, "").length;
    const parts = words.every((w, i) => i === words.length - 1 || zeros(w) >= words[i + 1]!.length);
    if (!parts) return Number(words.join(""));
  }

  let total = 0;
  let current = 0;
  let decimals = "";
  let afterPoint = false;
  let any = false;
  // a saadhe, sawa or paune waiting for its number
  let shift = 0;
  // the last thing added was a lone number from 1 to 19 (so a tens after it means hundreds: "six fifty" → 650)
  let lone = 0;

  for (const w of words) {
    // after "point": each digit word (or digits) adds a decimal place
    if (afterPoint) {
      const d = oneWord(w) ?? asDigits(w);
      if (d === null || d === undefined) return null;
      decimals += String(d);
      continue;
    }
    if (w === "point" || w === "dot") {
      afterPoint = true;
      continue;
    }
    if (w in FRACTION_SHIFT) {
      shift = FRACTION_SHIFT[w]!;
      continue;
    }
    if (w in WHOLE_FRACTIONS) {
      current += WHOLE_FRACTIONS[w]!;
      any = true;
      continue;
    }
    const digits = asDigits(w);
    const word = digits === null ? oneWord(w) : null;
    const value = digits ?? word;
    // "six fifty", "twelve fifty", "6 50": hundreds and then tens, the way prices are said
    if (value !== null && lone && value >= 20 && value <= 90 && value % 10 === 0) {
      current = current - lone + lone * 100 + value;
      lone = 0;
      any = true;
      continue;
    }
    lone = value !== null && value >= 1 && value <= 19 ? value : 0;
    if (digits !== null) {
      current += digits + shift;
      shift = 0;
      any = true;
    } else if (w in KANNADA_HUNDREDS && KANNADA_HUNDREDS[w]! > 100) {
      // ಐನೂರು (500): a number of hundreds in one word
      current += KANNADA_HUNDREDS[w]!;
      any = true;
    } else if (w === "hundred" || w === "hundreds" || NATIVE_SCALES[w] === 100 || KANNADA_HUNDREDS[w] === 100) {
      current = (current || 1 + shift) * 100;
      shift = 0;
      any = true;
    } else if (w in SCALES || w in NATIVE_SCALES) {
      // "sawa lakh" (1¼), "paune lakh" (¾): a shift with no number of its own is on one
      total += (current || 1 + shift) * (SCALES[w] ?? NATIVE_SCALES[w]!);
      shift = 0;
      current = 0;
      any = true;
    } else if (word !== null) {
      current += word + shift;
      shift = 0;
      any = true;
    } else {
      return null;
    }
  }
  if (!any) return null;
  const whole = total + current;
  // a half or quarter can leave paise-free fractions of a rupee from rounding: keep two places
  return decimals ? Number(`${whole}.${decimals}`) : Math.round(whole * 100) / 100;
}

// a phone number as said digit by digit ("nine eight four five 1 2 7 4 9", "aath nau shunya…", "double five"); digit
// words in English, Hindi (Latin or Devanagari) or Kannada, and digits in any script
export function spokenDigits(spoken: string): string {
  let out = "";
  let repeat = 1;
  for (const w of asciiDigits(spoken).toLowerCase().replace(/[-,.+()]/g, " ").split(/\s+/)) {
    if (w === "double") repeat = 2;
    else if (w === "triple") repeat = 3;
    else if (/^\d+$/.test(w)) {
      out += w.repeat(repeat);
      repeat = 1;
    } else if (oneWord(w) !== null && oneWord(w)! < 10) {
      out += String(oneWord(w)).repeat(repeat);
      repeat = 1;
    }
  }
  // a number said with its country code (+91) or a leading 0 is the 10 digits after it
  if (out.length === 12 && out.startsWith("91")) return out.slice(2);
  if (out.length === 11 && out.startsWith("0")) return out.slice(1);
  return out;
}

// whether what's been heard so far is a whole phone number: 10 digits, or 12 with +91 in front, or 11 with a 0 (a
// number that itself starts 91 or 0 is taken once a quiet spell ends the listening)
export function wholePhone(heard: string, soFar = "") {
  let raw = "";
  for (const w of asciiDigits(heard).toLowerCase().replace(/[-,.+()]/g, " ").split(/\s+/)) {
    if (/^\d+$/.test(w)) raw += w;
    else if (oneWord(w) !== null && oneWord(w)! < 10) raw += String(oneWord(w));
  }
  const digits = soFar + raw;
  if (digits.startsWith("91")) return digits.length >= 12;
  if (digits.startsWith("0")) return digits.length >= 11;
  return digits.length >= 10;
}
