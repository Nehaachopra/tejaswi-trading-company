"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import { BANKS } from "~/components/account/bank/bank-list";

import { titleCase } from "./format";

// each listed bank's English name as it's written (HDFC Bank, State Bank of India), by its stored lowercase name
const ENGLISH = new Map<string, string>(BANKS.map((n) => [n.toLowerCase(), n]));

// each bank's name in Hindi and Kannada, by its stored (lowercase) English name, as the bank itself or the IFSC
// directory writes it. A bank not here, or a name typed in, shows in English
const BANK_NAMES: Record<string, { hi: string; kn: string }> = {
  // public sector
  "state bank of india": { hi: "भारतीय स्टेट बैंक", kn: "ಭಾರತೀಯ ಸ್ಟೇಟ್ ಬ್ಯಾಂಕ್" },
  "bank of baroda": { hi: "बैंक ऑफ़ बड़ौदा", kn: "ಬ್ಯಾಂಕ್ ಆಫ್ ಬರೋಡಾ" },
  "bank of india": { hi: "बैंक ऑफ़ इंडिया", kn: "ಬ್ಯಾಂಕ್ ಆಫ್ ಇಂಡಿಯಾ" },
  "bank of maharashtra": { hi: "बैंक ऑफ़ महाराष्ट्र", kn: "ಬ್ಯಾಂಕ್ ಆಫ್ ಮಹಾರಾಷ್ಟ್ರ" },
  "canara bank": { hi: "केनरा बैंक", kn: "ಕೆನರಾ ಬ್ಯಾಂಕ್" },
  "central bank of india": { hi: "सेंट्रल बैंक ऑफ़ इंडिया", kn: "ಸೆಂಟ್ರಲ್ ಬ್ಯಾಂಕ್ ಆಫ್ ಇಂಡಿಯಾ" },
  "indian bank": { hi: "इंडियन बैंक", kn: "ಇಂಡಿಯನ್ ಬ್ಯಾಂಕ್" },
  "indian overseas bank": { hi: "इंडियन ओवरसीज़ बैंक", kn: "ಇಂಡಿಯನ್ ಓವರ್‌ಸೀಸ್ ಬ್ಯಾಂಕ್" },
  "punjab and sind bank": { hi: "पंजाब एंड सिंध बैंक", kn: "ಪಂಜಾಬ್ ಅಂಡ್ ಸಿಂಧ್ ಬ್ಯಾಂಕ್" },
  "punjab national bank": { hi: "पंजाब नैशनल बैंक", kn: "ಪಂಜಾಬ್ ನ್ಯಾಷನಲ್ ಬ್ಯಾಂಕ್" },
  "uco bank": { hi: "यूको बैंक", kn: "ಯುಕೋ ಬ್ಯಾಂಕ್" },
  "union bank of india": { hi: "यूनियन बैंक ऑफ़ इंडिया", kn: "ಯೂನಿಯನ್ ಬ್ಯಾಂಕ್ ಆಫ್ ಇಂಡಿಯಾ" },
  // private
  "axis bank": { hi: "ऐक्सिस बैंक", kn: "ಆಕ್ಸಿಸ್ ಬ್ಯಾಂಕ್" },
  "bandhan bank": { hi: "बंधन बैंक", kn: "ಬಂಧನ್ ಬ್ಯಾಂಕ್" },
  "csb bank": { hi: "सीएसबी बैंक", kn: "ಸಿಎಸ್‌ಬಿ ಬ್ಯಾಂಕ್" },
  "city union bank": { hi: "सिटी यूनियन बैंक", kn: "ಸಿಟಿ ಯೂನಿಯನ್ ಬ್ಯಾಂಕ್" },
  "dcb bank": { hi: "डीसीबी बैंक", kn: "ಡಿಸಿಬಿ ಬ್ಯಾಂಕ್" },
  "dhanlaxmi bank": { hi: "धनलक्ष्मी बैंक", kn: "ಧನಲಕ್ಷ್ಮಿ ಬ್ಯಾಂಕ್" },
  "federal bank": { hi: "फ़ेडरल बैंक", kn: "ಫೆಡರಲ್ ಬ್ಯಾಂಕ್" },
  "hdfc bank": { hi: "एचडीएफ़सी बैंक", kn: "ಎಚ್‌ಡಿಎಫ್‌ಸಿ ಬ್ಯಾಂಕ್" },
  "icici bank": { hi: "आईसीआईसीआई बैंक", kn: "ಐಸಿಐಸಿಐ ಬ್ಯಾಂಕ್" },
  "idbi bank": { hi: "आईडीबीआई बैंक", kn: "ಐಡಿಬಿಐ ಬ್ಯಾಂಕ್" },
  "idfc first bank": { hi: "आईडीएफ़सी फ़र्स्ट बैंक", kn: "ಐಡಿಎಫ್‌ಸಿ ಫಸ್ಟ್ ಬ್ಯಾಂಕ್" },
  "indusind bank": { hi: "इंडसइंड बैंक", kn: "ಇಂಡಸ್‌ಇಂಡ್ ಬ್ಯಾಂಕ್" },
  "jammu and kashmir bank": { hi: "जम्मू एंड कश्मीर बैंक", kn: "ಜಮ್ಮು ಅಂಡ್ ಕಾಶ್ಮೀರ್ ಬ್ಯಾಂಕ್" },
  "karnataka bank": { hi: "कर्नाटक बैंक", kn: "ಕರ್ಣಾಟಕ ಬ್ಯಾಂಕ್" },
  "karur vysya bank": { hi: "करूर वैश्य बैंक", kn: "ಕರೂರ್ ವೈಶ್ಯ ಬ್ಯಾಂಕ್" },
  "kotak mahindra bank": { hi: "कोटक महिंद्रा बैंक", kn: "ಕೋಟಕ್ ಮಹೀಂದ್ರಾ ಬ್ಯಾಂಕ್" },
  "nainital bank": { hi: "नैनीताल बैंक", kn: "ನೈನಿತಾಲ್ ಬ್ಯಾಂಕ್" },
  "rbl bank": { hi: "आरबीएल बैंक", kn: "ಆರ್‌ಬಿಎಲ್ ಬ್ಯಾಂಕ್" },
  "south indian bank": { hi: "साउथ इंडियन बैंक", kn: "ಸೌತ್ ಇಂಡಿಯನ್ ಬ್ಯಾಂಕ್" },
  "tamilnad mercantile bank": { hi: "तमिलनाड मर्केंटाइल बैंक", kn: "ತಮಿಳುನಾಡು ಮರ್ಕೆಂಟೈಲ್ ಬ್ಯಾಂಕ್" },
  "yes bank": { hi: "यस बैंक", kn: "ಯೆಸ್ ಬ್ಯಾಂಕ್" },
  // small finance
  "au small finance bank": { hi: "एयू स्मॉल फ़ाइनेंस बैंक", kn: "ಎಯು ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "capital small finance bank": { hi: "कैपिटल स्मॉल फ़ाइनेंस बैंक", kn: "ಕ್ಯಾಪಿಟಲ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "equitas small finance bank": { hi: "इक्विटास स्मॉल फ़ाइनेंस बैंक", kn: "ಈಕ್ವಿಟಾಸ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "esaf small finance bank": { hi: "ईसाफ़ स्मॉल फ़ाइनेंस बैंक", kn: "ಇಸಾಫ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "jana small finance bank": { hi: "जना स्मॉल फ़ाइनेंस बैंक", kn: "ಜನ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "north east small finance bank": { hi: "नॉर्थ ईस्ट स्मॉल फ़ाइनेंस बैंक", kn: "ನಾರ್ತ್ ಈಸ್ಟ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "shivalik small finance bank": { hi: "शिवालिक स्मॉल फ़ाइनेंस बैंक", kn: "ಶಿವಾಲಿಕ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "suryoday small finance bank": { hi: "सूर्योदय स्मॉल फ़ाइनेंस बैंक", kn: "ಸೂರ್ಯೋದಯ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "ujjivan small finance bank": { hi: "उज्जीवन स्मॉल फ़ाइनेंस बैंक", kn: "ಉಜ್ಜೀವನ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "unity small finance bank": { hi: "यूनिटी स्मॉल फ़ाइनेंस बैंक", kn: "ಯೂನಿಟಿ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  "utkarsh small finance bank": { hi: "उत्कर्ष स्मॉल फ़ाइनेंस बैंक", kn: "ಉತ್ಕರ್ಷ್ ಸ್ಮಾಲ್ ಫೈನಾನ್ಸ್ ಬ್ಯಾಂಕ್" },
  // payments
  "airtel payments bank": { hi: "एयरटेल पेमेंट्स बैंक", kn: "ಏರ್‌ಟೆಲ್ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  "fino payments bank": { hi: "फ़िनो पेमेंट्स बैंक", kn: "ಫಿನೋ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  "india post payments bank": { hi: "इंडिया पोस्ट पेमेंट्स बैंक", kn: "ಇಂಡಿಯಾ ಪೋಸ್ಟ್ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  "jio payments bank": { hi: "जियो पेमेंट्स बैंक", kn: "ಜಿಯೋ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  "nsdl payments bank": { hi: "एनएसडीएल पेमेंट्स बैंक", kn: "ಎನ್‌ಎಸ್‌ಡಿಎಲ್ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  "paytm payments bank": { hi: "पेटीएम पेमेंट्स बैंक", kn: "ಪೇಟಿಎಂ ಪೇಮೆಂಟ್ಸ್ ಬ್ಯಾಂಕ್" },
  // regional rural and co-operative
  "karnataka gramin bank": { hi: "कर्नाटक ग्रामीण बैंक", kn: "ಕರ್ನಾಟಕ ಗ್ರಾಮೀಣ ಬ್ಯಾಂಕ್" },
  "karnataka vikas grameena bank": { hi: "कर्नाटक विकास ग्रामीण बैंक", kn: "ಕರ್ನಾಟಕ ವಿಕಾಸ ಗ್ರಾಮೀಣ ಬ್ಯಾಂಕ್" },
  "karnataka state co-operative apex bank": { hi: "कर्नाटक राज्य सहकारी शीर्ष बैंक", kn: "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಸಹಕಾರ ಅಪೆಕ್ಸ್ ಬ್ಯಾಂಕ್" },
  "the saraswat co-operative bank": { hi: "सारस्वत सहकारी बैंक", kn: "ಸಾರಸ್ವತ್ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
  "the cosmos co-operative bank": { hi: "कॉसमॉस सहकारी बैंक", kn: "ಕಾಸ್ಮಾಸ್ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
  "abhyudaya co-operative bank": { hi: "अभ्युदय सहकारी बैंक", kn: "ಅಭ್ಯುದಯ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
  "bharat co-operative bank (mumbai)": { hi: "भारत सहकारी बैंक (मुंबई)", kn: "ಭಾರತ್ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್ (ಮುಂಬೈ)" },
  "janata sahakari bank": { hi: "जनता सहकारी बैंक", kn: "ಜನತಾ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
  "tjsb sahakari bank": { hi: "टीजेएसबी सहकारी बैंक", kn: "ಟಿಜೆಎಸ್‌ಬಿ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
  "the shamrao vithal co-operative bank": { hi: "शामराव विट्ठल सहकारी बैंक", kn: "ಶಾಮರಾವ್ ವಿಠ್ಠಲ್ ಸಹಕಾರಿ ಬ್ಯಾಂಕ್" },
};

// a bank's name in the language picked, from its stored name (in English as the bank writes it; a name typed in
// starts each word with a capital)
export function bankNameIn(name: string, locale: string) {
  const own = BANK_NAMES[name.trim().toLowerCase()];
  if (own && (locale === "hi" || locale === "kn")) return own[locale];
  return ENGLISH.get(name.trim().toLowerCase()) ?? titleCase(name);
}

// the same, for a screen: follows the language staff switched to
export function useBankName() {
  const locale = useLocale();
  return useCallback((name: string) => bankNameIn(name, locale), [locale]);
}
