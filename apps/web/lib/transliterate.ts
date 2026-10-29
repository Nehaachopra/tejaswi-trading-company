// names and towns, typed in English letters, written in Kannada or Hindi letters for the screen (nothing is stored;
// the English stays the record). Common words and the towns around Hiriyur come from a list, so they're spelt right;
// anything else goes by sound, which can be off for some names

export type Script = "kn" | "hi";

// how a sound is written in each script: the vowel on its own, the vowel's sign after a consonant ("" for the a every
// consonant already carries), the consonants, and the marks that join or close them
type Table = {
  vowels: Record<string, string>;
  signs: Record<string, string>;
  consonants: Record<string, string>;
  virama: string;
  anusvara: string;
  // whether a word may end on a bare consonant (Hindi does: स्टोर्स; Kannada closes it: ಸ್ಟೋರ್ಸ್)
  bareEnd: boolean;
};

const TABLES: Record<Script, Table> = {
  kn: {
    vowels: { a: "ಅ", aa: "ಆ", i: "ಇ", ii: "ಈ", u: "ಉ", uu: "ಊ", e: "ಏ", ai: "ಐ", o: "ಓ", au: "ಔ" },
    signs: { a: "", aa: "ಾ", i: "ಿ", ii: "ೀ", u: "ು", uu: "ೂ", e: "ೇ", ai: "ೈ", o: "ೋ", au: "ೌ" },
    consonants: {
      ksh: "ಕ್ಷ", chh: "ಛ", sh: "ಶ", ch: "ಚ", th: "ತ", dh: "ಧ", kh: "ಖ", gh: "ಘ", jh: "ಝ", ph: "ಫ", bh: "ಭ",
      k: "ಕ", g: "ಗ", c: "ಕ", j: "ಜ", t: "ಟ", d: "ದ", n: "ನ", p: "ಪ", f: "ಫ", b: "ಬ", m: "ಮ", y: "ಯ", r: "ರ",
      l: "ಲ", v: "ವ", w: "ವ", s: "ಸ", h: "ಹ", z: "ಜ", q: "ಕ", x: "ಕ್ಸ",
    },
    virama: "್",
    anusvara: "ಂ",
    bareEnd: false,
  },
  hi: {
    vowels: { a: "अ", aa: "आ", i: "इ", ii: "ई", u: "उ", uu: "ऊ", e: "ए", ai: "ऐ", o: "ओ", au: "औ" },
    signs: { a: "", aa: "ा", i: "ि", ii: "ी", u: "ु", uu: "ू", e: "े", ai: "ै", o: "ो", au: "ौ" },
    consonants: {
      ksh: "क्ष", chh: "छ", sh: "श", ch: "च", th: "त", dh: "ध", kh: "ख", gh: "घ", jh: "झ", ph: "फ", bh: "भ",
      k: "क", g: "ग", c: "क", j: "ज", t: "ट", d: "द", n: "न", p: "प", f: "फ़", b: "ब", m: "म", y: "य", r: "र",
      l: "ल", v: "व", w: "व", s: "स", h: "ह", z: "ज़", q: "क", x: "क्स",
    },
    virama: "्",
    anusvara: "ं",
    bareEnd: true,
  },
};

// words whose sound-out reads wrong: shop words, honorifics, common names and the towns around Hiriyur
const WORDS: Record<string, [kn: string, hi: string]> = {
  sri: ["ಶ್ರೀ", "श्री"],
  shri: ["ಶ್ರೀ", "श्री"],
  shree: ["ಶ್ರೀ", "श्री"],
  traders: ["ಟ್ರೇಡರ್ಸ್", "ट्रेडर्स"],
  trader: ["ಟ್ರೇಡರ್", "ट्रेडर"],
  trading: ["ಟ್ರೇಡಿಂಗ್", "ट्रेडिंग"],
  company: ["ಕಂಪನಿ", "कंपनी"],
  stores: ["ಸ್ಟೋರ್ಸ್", "स्टोर्स"],
  store: ["ಸ್ಟೋರ್", "स्टोर"],
  general: ["ಜನರಲ್", "जनरल"],
  agencies: ["ಏಜೆನ್ಸೀಸ್", "एजेंसीज़"],
  agency: ["ಏಜೆನ್ಸಿ", "एजेंसी"],
  enterprises: ["ಎಂಟರ್‌ಪ್ರೈಸಸ್", "एंटरप्राइजेज़"],
  hotel: ["ಹೋಟೆಲ್", "होटल"],
  depot: ["ಡಿಪೋ", "डिपो"],
  wholesale: ["ಹೋಲ್‌ಸೇಲ್", "होलसेल"],
  trust: ["ಟ್ರಸ್ಟ್", "ट्रस्ट"],
  mill: ["ಮಿಲ್", "मिल"],
  mills: ["ಮಿಲ್ಸ್", "मिल्स"],
  oil: ["ಆಯಿಲ್", "ऑयल"],
  rice: ["ರೈಸ್", "राइस"],
  provision: ["ಪ್ರಾವಿಷನ್", "प्रोविज़न"],
  provisions: ["ಪ್ರಾವಿಷನ್ಸ್", "प्रोविज़न्स"],
  kirana: ["ಕಿರಾಣಿ", "किराना"],
  bhandar: ["ಭಂಡಾರ್", "भंडार"],
  and: ["ಅಂಡ್", "एंड"],
  sons: ["ಸನ್ಸ್", "संस"],
  lakshmi: ["ಲಕ್ಷ್ಮೀ", "लक्ष्मी"],
  mahalakshmi: ["ಮಹಾಲಕ್ಷ್ಮೀ", "महालक्ष्मी"],
  venkateshwara: ["ವೆಂಕಟೇಶ್ವರ", "वेंकटेश्वर"],
  venkatesh: ["ವೆಂಕಟೇಶ್", "वेंकटेश"],
  manjunatha: ["ಮಂಜುನಾಥ", "मंजुनाथ"],
  ganesh: ["ಗಣೇಶ್", "गणेश"],
  renuka: ["ರೇಣುಕಾ", "रेणुका"],
  raghavendra: ["ರಾಘವೇಂದ್ರ", "राघवेंद्र"],
  ramswamy: ["ರಾಮಸ್ವಾಮಿ", "रामस्वामी"],
  annapoorna: ["ಅನ್ನಪೂರ್ಣ", "अन्नपूर्णा"],
  sharada: ["ಶಾರದಾ", "शारदा"],
  basaveshwara: ["ಬಸವೇಶ್ವರ", "बसवेश्वर"],
  siddeshwara: ["ಸಿದ್ಧೇಶ್ವರ", "सिद्धेश्वर"],
  kaveri: ["ಕಾವೇರಿ", "कावेरी"],
  kumar: ["ಕುಮಾರ್", "कुमार"],
  hiriyur: ["ಹಿರಿಯೂರು", "हिरियूर"],
  chitradurga: ["ಚಿತ್ರದುರ್ಗ", "चित्रदुर्ग"],
  challakere: ["ಚಳ್ಳಕೆರೆ", "चल्लकेरे"],
  hosadurga: ["ಹೊಸದುರ್ಗ", "होसदुर्ग"],
  holalkere: ["ಹೊಳಲ್ಕೆರೆ", "होलल्केरे"],
  molakalmuru: ["ಮೊಳಕಾಲ್ಮೂರು", "मोलकालमूरु"],
  hosakote: ["ಹೊಸಕೋಟೆ", "होसकोटे"],
  davanagere: ["ದಾವಣಗೆರೆ", "दावणगेरे"],
  davangere: ["ದಾವಣಗೆರೆ", "दावणगेरे"],
  tumakuru: ["ತುಮಕೂರು", "तुमकुरु"],
  tumkur: ["ತುಮಕೂರು", "तुमकुरु"],
  sira: ["ಶಿರಾ", "सिरा"],
  bengaluru: ["ಬೆಂಗಳೂರು", "बेंगलुरु"],
  bangalore: ["ಬೆಂಗಳೂರು", "बेंगलुरु"],
  mysuru: ["ಮೈಸೂರು", "मैसूरु"],
  mysore: ["ಮೈಸೂರು", "मैसूरु"],
  shivamogga: ["ಶಿವಮೊಗ್ಗ", "शिवमोग्गा"],
  bellary: ["ಬಳ್ಳಾರಿ", "बल्लारी"],
  ballari: ["ಬಳ್ಳಾರಿ", "बल्लारी"],
};

// the sounds, longest first so "ksh" is taken before "k"
const VOWEL_KEYS = ["aa", "ee", "ii", "oo", "uu", "ai", "au", "a", "e", "i", "o", "u"];
const VOWEL_OF: Record<string, string> = { ee: "ii", oo: "uu" };
const CONSONANT_KEYS = ["ksh", "chh", "sh", "ch", "th", "dh", "kh", "gh", "jh", "ph", "bh", "k", "g", "c", "j", "t", "d", "n", "p", "f", "b", "m", "y", "r", "l", "v", "w", "s", "h", "z", "q", "x"];

type Sound = { kind: "vowel" | "consonant"; key: string };

// a word as its sounds; a y ending a word after a consonant is the vowel i (bakery), and an a ending a word is long,
// as names say it (Neha, Chopra)
function soundsOf(word: string): Sound[] | null {
  const out: Sound[] = [];
  if (/[^aeiou]y$/.test(word)) word = `${word.slice(0, -1)}i`;
  let i = 0;
  while (i < word.length) {
    const vowel = VOWEL_KEYS.find((k) => word.startsWith(k, i));
    if (vowel) {
      out.push({ kind: "vowel", key: VOWEL_OF[vowel] ?? vowel });
      i += vowel.length;
      continue;
    }
    const consonant = CONSONANT_KEYS.find((k) => word.startsWith(k, i));
    if (!consonant) return null;
    out.push({ kind: "consonant", key: consonant });
    i += consonant.length;
  }
  const last = out[out.length - 1];
  if (last?.kind === "vowel" && last.key === "a" && out.length > 2) last.key = "aa";
  return out;
}

// one word by sound: a consonant takes the next vowel's sign, or joins the next consonant with a virama; an n or m
// before another consonant is the nasal dot
function soundOut(word: string, t: Table) {
  const sounds = soundsOf(word);
  if (!sounds) return word;
  let out = "";
  sounds.forEach((s, i) => {
    const next = sounds[i + 1];
    if (s.kind === "vowel") {
      const prev = sounds[i - 1];
      out += prev?.kind === "consonant" ? t.signs[s.key] : t.vowels[s.key];
      return;
    }
    if ((s.key === "n" || s.key === "m") && next?.kind === "consonant" && sounds[i - 1]?.kind === "vowel") {
      out += t.anusvara;
      return;
    }
    out += t.consonants[s.key];
    if (next?.kind === "consonant") out += t.virama;
    else if (!next && !t.bareEnd) out += t.virama;
  });
  return out;
}

// a name or town in Kannada or Hindi letters, word by word; anything that isn't plain letters (digits, &, short
// names like SRT) stays as it is
export function transliterate(text: string, script: Script) {
  const t = TABLES[script];
  return text.replace(/[A-Za-z]+/g, (word) => {
    // an all-caps short form (SRT, MK) reads as letters, so it stays
    if (word.length <= 4 && word === word.toUpperCase()) return word;
    const lower = word.toLowerCase();
    const known = WORDS[lower];
    if (known) return known[script === "kn" ? 0 : 1];
    return soundOut(lower, t);
  });
}
