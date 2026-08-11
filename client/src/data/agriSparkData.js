// ─── AgriSpark Static Data ───────────────────────────────────────
// Import what you need: import { PRICES, GREETING_FLOWS, ... } from './agriSparkData';

// ─── GREETING FLOWS (per language) ──────────────────────────────
export const GREETING_FLOWS = {
  en: [
    { text: "Selam! 👋 Welcome to AgriSpark.", delay: 600, typing: 800 },
    { text: "I'm your AI assistant for Ethiopia's agricultural marketplace — here to help buyers, farmers, and anyone in between. 🌾", delay: 1200, typing: 1100 },
    { text: "Before we start — are you a **Buyer** looking to order, or a **Farmer** wanting to sell?", delay: 1400, typing: 900, showRoles: true },
  ],
  am: [
    { text: "ሰላም! 👋 ወደ AgriSpark እንኳን ደህና መጡ።", delay: 600, typing: 800 },
    { text: "እኔ የኢትዮጵያ የግብርና ዲጂታል ገበያ AI ረዳትዎ ነኝ — ለገዢዎች፣ ለገበሬዎች እና ለሁሉም ሰው ሕዝቤ ነኝ። 🌾", delay: 1200, typing: 1100 },
    { text: "ከምንጀምር በፊት — ትዕዛዝ ለመስጠት የመጡ **ገዢ** ነዎት፣ ወይስ ምርት ለሚሸጥ **ገበሬ**?", delay: 1400, typing: 900, showRoles: true },
  ],
  oro: [
    { text: "Nagaatti! 👋 AgriSpark isin simata.", delay: 600, typing: 800 },
    { text: "Ani AI gargaaraa gabaa qonnaa Itoophiyaa kee — bittootaaf, qonnaan bulootaaf, hundaaf dhaabbadha. 🌾", delay: 1200, typing: 1100 },
    { text: "Jalqabuuf — **Bitaa** ajaja kennu barbaadaa, moo **Qonnaan bulaa** gurguruuf?", delay: 1400, typing: 900, showRoles: true },
  ],
  tig: [
    { text: "ሰላም! 👋 ናብ AgriSpark እንኳን ብደሓን መጻእኩም።", delay: 600, typing: 800 },
    { text: "ኣነ ናይ ዕዳጋ ሕርሻ ኢትዮጵያ AI ሓጋዚ ኢየ — ንገዛእቲ፣ ንሓረስቶት፣ ንኹሉ ሰብ ዝሕግዝ። 🌾", delay: 1200, typing: 1100 },
    { text: "ቅድሚ ምጅማርና — ትዕዛዝ ንምሃብ ዝመጻእኩም **ሸማቒ** ዲኹም ወይ ምሻጥ ዘድልዮ **ሓረስታይ**?", delay: 1400, typing: 900, showRoles: true },
  ],
};

// ─── ROLE LABELS ─────────────────────────────────────────────────
export const ROLE_LABELS = {
  en:  { buyer: "🛒 I'm a Buyer",   farmer: "🌾 I'm a Farmer",  both: "💬 Just browsing" },
  am:  { buyer: "🛒 ገዢ ነኝ",        farmer: "🌾 ገበሬ ነኝ",        both: "💬 ብቻ ማሰስ" },
  oro: { buyer: "🛒 Bitaa dha",     farmer: "🌾 Qonnaan bulaa",  both: "💬 Laaluu qofa" },
  tig: { buyer: "🛒 ሸማቲ እየ",       farmer: "🌾 ሓረስታይ እየ",     both: "💬 ጥራይ ምርኣይ" },
};

// ─── ROLE FOLLOW-UP MESSAGES ─────────────────────────────────────
export const ROLE_FOLLOWUP = {
  en: {
    buyer:  "Great! 🛒 As a buyer, you can browse products, place orders, and chat directly with farmers.\n\nWhat would you like to do first?",
    farmer: "Perfect! 🌾 As a farmer, you can list your products, manage incoming orders, and connect with buyers.\n\nWhat would you like to do first?",
    both:   "No problem! 😊 Feel free to ask about prices, how the app works, or anything else. What's on your mind?",
  },
  am: {
    buyer:  "ጥሩ! 🛒 እንደ ገዢ፣ ምርቶችን ማሰስ፣ ትዕዛዝ መስጠት እና ከገበሬዎች ጋር ቀጥታ ማውራት ይችላሉ።\n\nከምን ልጀምር?",
    farmer: "ጥሩ! 🌾 እንደ ገበሬ፣ ምርቶችዎን ማስተዋወቅ፣ ትዕዛዞችን ማስተዳደር እና ከገዢዎች ጋር መገናኘት ይችላሉ።\n\nከምን ልጀምር?",
    both:   "እሺ! 😊 ስለ ዋጋ፣ ስለ አፕ አጠቃቀም ወይም ሌላ ጥያቄ ቢኖርዎ ይጠይቁ። ምን ይፈልጋሉ?",
  },
  oro: {
    buyer:  "Gaarii! 🛒 Bitaadhaan, oomisha ilaaluu, ajaja kennuu, fi qonnaan bulaatiin kallattiin dubbachuu dandeessa.\n\nEessa jalqabuu barbaadda?",
    farmer: "Gaarii! 🌾 Qonnaan bulaadhaan, oomisha kee galchuu, ajaja too'achuu, fi bittootaan walqunnamuu dandeessa.\n\nEessa jalqabuu barbaadda?",
    both:   "Dhugaa dha! 😊 Gatii, app faayyadamuu, ykn waa'ee kamiiyyuu gaafachuu dandeessa. Maal barbaadda?",
  },
  tig: {
    buyer:  "ጽቡቕ! 🛒 ከም ሸማቒ፣ ፍርያት ምርኣይ፣ ትእዛዝ ምሃብ፣ ምስ ሓረስቶት ቀጥታ ምዝርራብ ትኽእል።\n\nካበይ ክጅምር?",
    farmer: "ጽቡቕ! 🌾 ከም ሓረስታይ፣ ፍርያትካ ምዝርዛር፣ ትእዛዛት ምምሕዳር፣ ምስ ሸማቕቲ ምትሕብባር ትኽእል።\n\nካበይ ክጅምር?",
    both:   "ሕራይ! 😊 ብዛዕባ ዋጋ፣ ኣጠቓቕማ ኣፕ ወይ ካልእ ሕቶ ሕተት። እንታይ ትደሊ?",
  },
};

// ─── QUICK SUGGESTION CHIPS BY ROLE ─────────────────────────────
export const ROLE_QUICK = {
  en: {
    buyer: [
      { label: "How do I place an order?", icon: "🛒" },
      { label: "How do I find products near me?", icon: "📍" },
      { label: "How do I chat with a farmer?", icon: "💬" },
      { label: "What are teff prices today?", icon: "💰" },
    ],
    farmer: [
      { label: "How do I list my products?", icon: "📦" },
      { label: "How do I accept an order?", icon: "✅" },
      { label: "How do I upload product photos?", icon: "📷" },
      { label: "Current wheat prices?", icon: "💰" },
    ],
    both: [
      { label: "What are teff prices today?", icon: "💰" },
      { label: "Show me vegetable prices", icon: "🥦" },
      { label: "How does AgriSpark work?", icon: "❓" },
      { label: "I'm a Buyer — how do I order?", icon: "🛒" },
    ],
  },
  am: {
    buyer: [
      { label: "ትዕዛዝ እንዴት እሰጣለሁ?", icon: "🛒" },
      { label: "ምርቶቼ አቅራቢ ላቅ ያሉ ምርቶችን ምን ሁኔታ?", icon: "📍" },
      { label: "ከገበሬ ጋር እንዴት እወያያለሁ?", icon: "💬" },
      { label: "የጤፍ ዋጋ ዛሬ ስንት ነው?", icon: "💰" },
    ],
    farmer: [
      { label: "ምርቴን እንዴት ዘርዝራለሁ?", icon: "📦" },
      { label: "ትዕዛዝ እንዴት ተቀበላለሁ?", icon: "✅" },
      { label: "ፎቶ እንዴት እጭናለሁ?", icon: "📷" },
      { label: "ዛሬ የስንዴ ዋጋ ምን ያህል ነው?", icon: "💰" },
    ],
    both: [
      { label: "የጤፍ ዋጋ ዛሬ ስንት ነው?", icon: "💰" },
      { label: "የአትክልት ዋጋ አሳይኝ", icon: "🥦" },
      { label: "AgriSpark እንዴት ይሰራል?", icon: "❓" },
      { label: "ገዢ ነኝ — እንዴት ትዕዛዝ እሰጣለሁ?", icon: "🛒" },
    ],
  },
  oro: {
    buyer: [
      { label: "Akkamitti ajaja kennaa?", icon: "🛒" },
      { label: "Oomisha naannoo koo akkamitti argadha?", icon: "📍" },
      { label: "Qonnaan bulaatiin akkamitti dubbadha?", icon: "💬" },
      { label: "Gatii xaafii har'a meeqa?", icon: "💰" },
    ],
    farmer: [
      { label: "Oomisha koo akkamitti galchaa?", icon: "📦" },
      { label: "Ajaja akkamitti fudhachuu?", icon: "✅" },
      { label: "Suuraa akkamitti olkaa'uu?", icon: "📷" },
      { label: "Gatii biqilaa har'a meeqa?", icon: "💰" },
    ],
    both: [
      { label: "Gatii xaafii har'a meeqa?", icon: "💰" },
      { label: "Gatii kuduraa naa agarsiisi", icon: "🥦" },
      { label: "AgriSpark akkamitti hojjeta?", icon: "❓" },
      { label: "Bitaa dha — akkamitti ajaja kennaa?", icon: "🛒" },
    ],
  },
  tig: {
    buyer: [
      { label: "ትእዛዝ ከመይ ይሃብ?", icon: "🛒" },
      { label: "ፍርያት ናብ ቀረባ ኸባቢ ከመይ ይርከብ?", icon: "📍" },
      { label: "ምስ ሓረስታይ ከመይ ይዝረብ?", icon: "💬" },
      { label: "ዋጋ ጣፍ ሎሚ ክንደይ?", icon: "💰" },
    ],
    farmer: [
      { label: "ፍርያተይ ከምይ ዘርዝር?", icon: "📦" },
      { label: "ትእዛዝ ከምይ ይቀበል?", icon: "✅" },
      { label: "ስእሊ ከምይ ይጽዕን?", icon: "📷" },
      { label: "ዋጋ ስርናይ ሎሚ ክንደይ?", icon: "💰" },
    ],
    both: [
      { label: "ዋጋ ጣፍ ሎሚ ክንደይ?", icon: "💰" },
      { label: "ዋጋ ኣሕምልቲ ኣርኣዩኒ", icon: "🥦" },
      { label: "AgriSpark ከምይ ይሰርሕ?", icon: "❓" },
      { label: "ሸማቒ እየ — ከምይ ትእዛዝ ይህብ?", icon: "🛒" },
    ],
  },
};

// ─── PRICE DATA ──────────────────────────────────────────────────
export const PRICES = [
  { key: "teff_w",   name: "White Teff",      am: "ነጭ ጤፍ",       unit: "100kg", low: 10500, high: 11750, cat: "Grains",     trend: "↓"  },
  { key: "teff_m",   name: "Mixed Teff",       am: "ሰርገኛ ጤፍ",    unit: "100kg", low: 8500,  high: 9500,  cat: "Grains",     trend: "→"  },
  { key: "wheat",    name: "Wheat",            am: "ስንዴ",          unit: "100kg", low: 8000,  high: 8250,  cat: "Grains",     trend: "↑↑" },
  { key: "maize",    name: "Maize",            am: "በቆሎ",          unit: "100kg", low: 4800,  high: 5000,  cat: "Grains",     trend: "↑"  },
  { key: "sorghum",  name: "Sorghum",          am: "ማሽላ",          unit: "100kg", low: 4000,  high: 4500,  cat: "Grains",     trend: "↑"  },
  { key: "barley",   name: "Barley",           am: "ጀሞ",           unit: "100kg", low: 4200,  high: 4800,  cat: "Grains",     trend: "↑"  },
  { key: "rice",     name: "Rice",             am: "ሩዝ",           unit: "100kg", low: 7000,  high: 8000,  cat: "Grains",     trend: "↑"  },
  { key: "millet",   name: "Millet",           am: "እባይ",          unit: "100kg", low: 3800,  high: 4200,  cat: "Grains",     trend: "→"  },
  { key: "onion",    name: "Red Onion",        am: "ቀይ ሽንኩርት",   unit: "kg",    low: 30,    high: 90,    cat: "Vegetables", trend: "↑↑" },
  { key: "tomato",   name: "Tomato",           am: "ቲማቲም",         unit: "kg",    low: 40,    high: 80,    cat: "Vegetables", trend: "↑"  },
  { key: "potato",   name: "Potato",           am: "ድንች",          unit: "kg",    low: 20,    high: 40,    cat: "Vegetables", trend: "→"  },
  { key: "cabbage",  name: "Cabbage",          am: "ጥቅል ጎመን",    unit: "kg",    low: 15,    high: 30,    cat: "Vegetables", trend: "→"  },
  { key: "carrot",   name: "Carrot",           am: "ካሮት",          unit: "kg",    low: 20,    high: 35,    cat: "Vegetables", trend: "→"  },
  { key: "garlic",   name: "Garlic",           am: "ነጭ ሽንኩርት",   unit: "kg",    low: 60,    high: 100,   cat: "Vegetables", trend: "↑"  },
  { key: "kale",     name: "Ethiopian Kale",   am: "ጎመን",          unit: "kg",    low: 10,    high: 20,    cat: "Vegetables", trend: "→"  },
  { key: "banana",   name: "Banana",           am: "ሙዝ",           unit: "kg",    low: 15,    high: 30,    cat: "Fruits",     trend: "→"  },
  { key: "mango",    name: "Mango",            am: "ማንጎ",          unit: "kg",    low: 20,    high: 40,    cat: "Fruits",     trend: "↓↑" },
  { key: "avocado",  name: "Avocado",          am: "አቮካዶ",         unit: "kg",    low: 25,    high: 45,    cat: "Fruits",     trend: "↑"  },
  { key: "papaya",   name: "Papaya",           am: "ፓፓያ",          unit: "kg",    low: 12,    high: 25,    cat: "Fruits",     trend: "→"  },
  { key: "lemon",    name: "Lemon",            am: "ሎሚ",           unit: "kg",    low: 20,    high: 35,    cat: "Fruits",     trend: "↑"  },
  { key: "waterml",  name: "Watermelon",       am: "ሐብሐብ",         unit: "kg",    low: 8,     high: 15,    cat: "Fruits",     trend: "→"  },
  { key: "lentil",   name: "Red Lentil",       am: "ምስር",          unit: "100kg", low: 4500,  high: 5500,  cat: "Pulses",     trend: "↑"  },
  { key: "chickpea", name: "Chickpea",         am: "ሽምብራ",         unit: "100kg", low: 6000,  high: 11100, cat: "Pulses",     trend: "↑"  },
  { key: "fababean", name: "Faba Bean",        am: "ባቄላ",          unit: "100kg", low: 4000,  high: 5000,  cat: "Pulses",     trend: "→"  },
  { key: "soybean",  name: "Soybean",          am: "ሶያ",           unit: "100kg", low: 5500,  high: 7000,  cat: "Pulses",     trend: "↑"  },
  { key: "berbere",  name: "Berbere Blend",    am: "በርበሬ",         unit: "kg",    low: 150,   high: 300,   cat: "Spices",     trend: "↑"  },
  { key: "cumin",    name: "Black Cumin",      am: "ጥቁር አዝሙድ",   unit: "kg",    low: 120,   high: 200,   cat: "Spices",     trend: "↑"  },
  { key: "cardamom", name: "Korarima",         am: "ቆራሪማ",         unit: "kg",    low: 600,   high: 1000,  cat: "Spices",     trend: "↑↑" },
  { key: "sesame",   name: "Sesame Seed",      am: "ሰሊጥ",          unit: "kg",    low: 100,   high: 160,   cat: "Spices",     trend: "↑"  },
  { key: "ginger",   name: "Ginger",           am: "ዝንጅብል",        unit: "kg",    low: 80,    high: 130,   cat: "Spices",     trend: "→"  },
  { key: "turmeric", name: "Turmeric",         am: "እርድ",           unit: "kg",    low: 100,   high: 160,   cat: "Spices",     trend: "↑"  },
];

// ─── CATEGORY METADATA ───────────────────────────────────────────
export const CAT_EMOJI = { Grains: "🌾", Vegetables: "🥦", Fruits: "🍋", Pulses: "🫘", Spices: "🌶️" };

export const CAT_COLOR = {
  Grains:     { bg: "#FFF8E7", accent: "#D97706" },
  Vegetables: { bg: "#F0FDF4", accent: "#16A34A" },
  Fruits:     { bg: "#FFF1F2", accent: "#E11D48" },
  Pulses:     { bg: "#EFF6FF", accent: "#2563EB" },
  Spices:     { bg: "#F5F3FF", accent: "#7C3AED" },
};

export const CATS = ["All", "Grains", "Vegetables", "Fruits", "Pulses", "Spices"];

export const trendColor = (t) =>
  t.includes("↑") ? "#15803D" : t.startsWith("↓") ? "#DC2626" : "#6B7280";

// ─── LANGUAGES ───────────────────────────────────────────────────
export const LANGS = [
  { code: "en",  label: "EN",  flag: "🇬🇧" },
  { code: "am",  label: "አማ", flag: "🇪🇹" },
  { code: "oro", label: "ORM", flag: "🌿" },
  { code: "tig", label: "ትግ",  flag: "🌱" },
];

// ─── UI STRINGS ──────────────────────────────────────────────────
export const UI = {
  en:  { tagline: "Ethiopia's Agricultural Marketplace", chatTab: "Chat", pricesTab: "Prices", placeholder: "Type a message…", footer: "Groq · Gemini fallback · ETB 2025–2026", marketTitle: "Market Overview · 2025–2026", disclaimer: "⚠️ Reference wholesale ranges (2025–2026). Actual prices depend on farmer listings and quality.", askAI: "Ask AI about prices", filterAll: "All", perUnit: "per" },
  am:  { tagline: "የኢትዮጵያ የግብርና ዲጂታል ገበያ", chatTab: "ውይይት", pricesTab: "ዋጋዎች", placeholder: "መልዕክት ይጻፉ…", footer: "Groq · Gemini · ETB ዋጋዎች 2025–2026", marketTitle: "የገበያ ሁኔታ · 2025–2026", disclaimer: "⚠️ እነዚህ ዋጋዎች የ2025–2026 ማጣቀሻ ናቸው።", askAI: "AI ን ስለ ዋጋ ጠይቅ", filterAll: "ሁሉም", perUnit: "ለእያንዳንዱ" },
  oro: { tagline: "Gabaa Qonnaa Dijitaalaa Itoophiyaa", chatTab: "Dubbii", pricesTab: "Gatii", placeholder: "Ergaa barreessi…", footer: "Groq · Gemini · Gatii ETB 2025–2026", marketTitle: "Haala Gabaa · 2025–2026", disclaimer: "⚠️ Gatiin kun kan 2025–2026 gabaa Itoophiyaati.", askAI: "AI gatii gaafadhu", filterAll: "Hundumaa", perUnit: "tokkoof" },
  tig: { tagline: "ዕዳጋ ሕርሻ ዲጂታል ኢትዮጵያ", chatTab: "ዝርርብ", pricesTab: "ዋጋታት", placeholder: "መልእኽቲ ጽሓፍ…", footer: "Groq · Gemini · ዋጋ ETB 2025–2026", marketTitle: "ናይ ዕዳጋ ሁኔታ · 2025–2026", disclaimer: "⚠️ እዞም ናይ 2025–2026 ምልክት ዋጋታት እዮም።", askAI: "AI ብዛዕባ ዋጋ ሕተት", filterAll: "ኩሉ", perUnit: "ንዓይነት" },
};

// ─── QUICK LABEL BY LANG ─────────────────────────────────────────
export const QUICK_LABEL = {
  en: "Quick questions:",
  am: "ፈጣን ጥያቄዎች:",
  oro: "Gaaffii gabaabaa:",
  tig: "ቅልጡፍ ሕቶታት:",
};

// ─── DASHBOARD GREETINGS (role-specific) ───────────────────────
export const DASHBOARD_GREETINGS = {
  en: {
    buyer: "Selam! 👋 Hello, Buyer. I can help you find products, compare prices, and place orders quickly.",
    farmer: "Selam! 👋 Hello, Farmer. I can help you manage listings, stock, and incoming orders.",
    admin: "Selam! 👋 Hello, Admin. I can help you review users, products, reports, and platform activity.",
  },
  am: {
    buyer: "ሰላም! 👋 እንኳን ደህና መጡ ገዢ። ምርቶችን ማግኘት፣ ዋጋ ማነፃፀር እና ትዕዛዝ መስጠት ላይ እረዳዎታለሁ።",
    farmer: "ሰላም! 👋 እንኳን ደህና መጡ ገበሬ። ምርት ማስተዳደር፣ ክምችት እና ገቢ ትዕዛዞች ላይ እረዳዎታለሁ።",
    admin: "ሰላም! 👋 እንኳን ደህና መጡ አስተዳዳሪ። ተጠቃሚዎችን፣ ምርቶችን እና ሪፖርቶችን ለመከታተል እረዳዎታለሁ።",
  },
  oro: {
    buyer: "Akkam! 👋 Baga dhuftan Bitaa. Oomisha argachuu, gatii walbira qabu, fi ajaja kennuuf isin gargaara.",
    farmer: "Akkam! 👋 Baga dhuftan Qonnaan Bulaa. Oomisha, kuusaa, fi ajaja dhufu bulchuuf isin gargaara.",
    admin: "Akkam! 👋 Baga dhuftan Bulchaa. Fayyadamtoota, oomishaalee, gabaasota, fi sochii sirnaa hordofuuf isin gargaara.",
  },
  tig: {
    buyer: "ሰላም! 👋 እንኳን ብደሓን መጻእኩም ሸማቒ። ፍርያት ምርካብ፣ ዋጋ ምንጽጻር እና ትእዛዝ ምሃብ ክሕግዘኩም እየ።",
    farmer: "ሰላም! 👋 እንኳን ብደሓን መጻእኩም ሓረስታይ። ፍርያት፣ ክምችት እና እትመጽእ ትእዛዝ ንምምሕዳር ክሕግዘኩም እየ።",
    admin: "ሰላም! 👋 እንኳን ብደሓን መጻእኩም ኣድሚን። ተጠቃሚታት፣ ፍርያትን ሪፖርታትን ንምክትታል ክሕግዘኩም እየ።",
  },
};
