export const GAMES_DATA = [
  {
    id: "pubg-mobile",
    name: "ببجي موبايل (PUBG Mobile)",
    category: "mobile",
    badge: "الأكثر طلباً",
    deliveryTime: "تسليم فوري تلقائي",
    minPrice: 0.99,
    currency: "$",
    type: "شحن مباشر عبر الـ ID",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "p-60", name: "60 شدة (UC)", price: 0.99, originalPrice: 1.20 },
      { id: "p-325", name: "325 شدة (UC)", price: 4.80, originalPrice: 5.50 },
      { id: "p-660", name: "660 شدة (UC)", price: 8.99, originalPrice: 10.50, bestValue: true },
      { id: "p-1800", name: "1800 شدة (UC)", price: 23.50, originalPrice: 27.00 },
      { id: "p-3850", name: "3850 شدة (UC)", price: 46.99, originalPrice: 54.00 }
    ],
    idFieldLabel: "معرّف اللاعب (Player ID)",
    idPlaceholder: "مثال: 5123456789"
  },
  {
    id: "free-fire",
    name: "فري فاير (Free Fire)",
    category: "mobile",
    badge: "شحن مباشر",
    deliveryTime: "تنفيذ فوري عبر API",
    minPrice: 1.10,
    currency: "$",
    type: "شحن عبر الـ UID",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "ff-100", name: "100+10 جوهرة", price: 1.10, originalPrice: 1.35 },
      { id: "ff-310", name: "310+31 جوهرة", price: 3.25, originalPrice: 3.90 },
      { id: "ff-520", name: "520+52 جوهرة", price: 5.40, originalPrice: 6.50, bestValue: true },
      { id: "ff-1060", name: "1060+106 جوهرة", price: 10.80, originalPrice: 13.00 },
      { id: "ff-2180", name: "2180+218 جوهرة", price: 21.50, originalPrice: 25.50 }
    ],
    idFieldLabel: "معرّف حساب فري فاير (UID)",
    idPlaceholder: "مثال: 987654321"
  },
  {
    id: "roblox",
    name: "روبلوكس (Roblox Robux)",
    category: "pc",
    badge: "رائج الآن",
    deliveryTime: "كود رقمي فوري",
    minPrice: 4.99,
    currency: "$",
    type: "كودات رقمية معتمدة",
    image: "https://images.unsplash.com/photo-1612287232230-6819ebba232b?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "rb-400", name: "400 Robux", price: 4.99, originalPrice: 6.00 },
      { id: "rb-800", name: "800 Robux", price: 9.99, originalPrice: 12.00, bestValue: true },
      { id: "rb-1700", name: "1,700 Robux", price: 19.99, originalPrice: 24.00 },
      { id: "rb-4500", name: "4,500 Robux", price: 49.99, originalPrice: 58.00 }
    ],
    idFieldLabel: "اسم المستخدم (Roblox Username)",
    idPlaceholder: "مثال: GamerHero2026"
  },
  {
    id: "fc-mobile",
    name: "إي إيه سبورتس FC Mobile",
    category: "mobile",
    badge: "تنفيذ فوري",
    deliveryTime: "شحن فوري مؤتمت",
    minPrice: 2.50,
    currency: "$",
    type: "نقاط FC Points عبر الـ ID",
    image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "fc-100", name: "100 FC Points", price: 2.50, originalPrice: 3.00 },
      { id: "fc-500", name: "500 FC Points", price: 11.50, originalPrice: 13.50 },
      { id: "fc-1050", name: "1,050 FC Points", price: 23.00, originalPrice: 27.00, bestValue: true },
      { id: "fc-2200", name: "2,200 FC Points", price: 46.50, originalPrice: 54.00 }
    ],
    idFieldLabel: "معرّف حساب FC (User ID)",
    idPlaceholder: "مثال: FC9921448"
  },
  {
    id: "valorant",
    name: "فالورانت (Valorant VP)",
    category: "pc",
    badge: "كود فوري",
    deliveryTime: "أكواد فورية معتمدة",
    minPrice: 5.50,
    currency: "$",
    type: "شحن سيرفرات الشرق الأوسط وأوروبا",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "val-500", name: "500 VP", price: 5.50, originalPrice: 6.50 },
      { id: "val-1150", name: "1,150 VP", price: 12.00, originalPrice: 14.00 },
      { id: "val-2400", name: "2,400 VP", price: 24.50, originalPrice: 28.50, bestValue: true },
      { id: "val-5400", name: "5,400 VP", price: 54.00, originalPrice: 62.00 }
    ],
    idFieldLabel: "معرّف Riot ID (#Tagline)",
    idPlaceholder: "مثال: Kiro#PRO"
  },
  {
    id: "playstation",
    name: "بطاقات بلايستيشن (PlayStation)",
    category: "cards",
    badge: "كود رقمي",
    deliveryTime: "تسليم فوري في حسابك",
    minPrice: 10.00,
    currency: "$",
    type: "بطاقات ستور رقمية",
    image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80",
    popular: true,
    packages: [
      { id: "psn-10", name: "بطاقة 10$ ستور", price: 10.00, originalPrice: 11.00 },
      { id: "psn-20", name: "بطاقة 20$ ستور", price: 19.80, originalPrice: 22.00, bestValue: true },
      { id: "psn-50", name: "بطاقة 50$ ستور", price: 49.00, originalPrice: 53.00 },
      { id: "psn-100", name: "بطاقة 100$ ستور", price: 97.00, originalPrice: 105.00 }
    ],
    idFieldLabel: "البريد الإلكتروني لاستلام الكود",
    idPlaceholder: "name@example.com"
  },
  {
    id: "steam",
    name: "بطاقات ستيم (Steam Wallet)",
    category: "cards",
    badge: "عالمي",
    deliveryTime: "تسليم فوري",
    minPrice: 5.00,
    currency: "$",
    type: "رصيد محفظة ستيم المباشر",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
    popular: false,
    packages: [
      { id: "steam-5", name: "بطاقة ستيم 5$", price: 5.00, originalPrice: 6.00 },
      { id: "steam-10", name: "بطاقة ستيم 10$", price: 9.80, originalPrice: 11.50, bestValue: true },
      { id: "steam-25", name: "بطاقة ستيم 25$", price: 24.50, originalPrice: 28.00 },
      { id: "steam-50", name: "بطاقة ستيم 50$", price: 48.50, originalPrice: 55.00 }
    ],
    idFieldLabel: "البريد الإلكتروني لاستلام الكود",
    idPlaceholder: "name@example.com"
  },
  {
    id: "discord-nitro",
    name: "اشتراك ديسكورد نيترو (Discord Nitro)",
    category: "subscriptions",
    badge: "تفعيل مباشر",
    deliveryTime: "رابط تفعيل فوري",
    minPrice: 4.50,
    currency: "$",
    type: "اشتراكات رقمية رسمية",
    image: "https://images.unsplash.com/photo-1614680376593-902f749f7ffc?auto=format&fit=crop&w=800&q=80",
    popular: false,
    packages: [
      { id: "nitro-basic", name: "نيترو بيسك (شهر)", price: 4.50, originalPrice: 5.50 },
      { id: "nitro-full-1m", name: "نيترو كامل مع بوست (شهر)", price: 9.80, originalPrice: 11.50, bestValue: true },
      { id: "nitro-full-1y", name: "نيترو كامل مع بوست (سنة)", price: 95.00, originalPrice: 110.00 }
    ],
    idFieldLabel: "حساب ديسكورد / البريد الإلكتروني",
    idPlaceholder: "مثال: kiro#0001"
  }
];

export const CATEGORIES = [
  { id: "all", name: "الكل", count: 8 },
  { id: "mobile", name: "ألعاب الجوال", count: 3 },
  { id: "pc", name: "ألعاب البي سي", count: 2 },
  { id: "cards", name: "بطاقات الهدايا", count: 2 },
  { id: "subscriptions", name: "الاشتراكات الرقمية", count: 1 }
];
