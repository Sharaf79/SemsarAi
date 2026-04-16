/**
 * Comprehensive Egypt Locations Seed
 * All 27 governorates → major cities/markaz → key districts/areas
 *
 * Run:  cd backend && npx ts-node prisma/seed-locations.ts
 */
import { PrismaClient, LocationType } from '@prisma/client';

const prisma = new PrismaClient();

interface LocationNode {
  ar: string;
  en: string;
  children?: LocationNode[];
}

/**
 * Complete Egyptian location hierarchy:
 *   GOVERNORATE → CITY (markaz / city) → DISTRICT (hay / area)
 */
const EGYPT: LocationNode[] = [
  // ═══════════════════════════════════════════════════════════════
  // 1. القاهرة — Cairo
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'القاهرة', en: 'Cairo',
    children: [
      {
        ar: 'مدينة نصر', en: 'Nasr City',
        children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي السابع', en: '7th District' },
          { ar: 'الحي الثامن', en: '8th District' },
          { ar: 'الحي العاشر', en: '10th District' },
          { ar: 'المنطقة التاسعة', en: '9th Zone' },
          { ar: 'زهراء مدينة نصر', en: 'Zahraa Nasr City' },
          { ar: 'عباس العقاد', en: 'Abbas El Akkad' },
          { ar: 'مكرم عبيد', en: 'Makram Ebeid' },
          { ar: 'الحي السادس', en: '6th District' },
        ],
      },
      {
        ar: 'المعادي', en: 'Maadi',
        children: [
          { ar: 'المعادي الجديدة', en: 'New Maadi' },
          { ar: 'المعادي القديمة', en: 'Old Maadi' },
          { ar: 'دجلة', en: 'Degla' },
          { ar: 'زهراء المعادي', en: 'Zahraa El Maadi' },
          { ar: 'ثكنات المعادي', en: 'Maadi Sarayat' },
          { ar: 'كورنيش المعادي', en: 'Maadi Corniche' },
        ],
      },
      {
        ar: 'مصر الجديدة', en: 'Heliopolis',
        children: [
          { ar: 'ألماظة', en: 'Almaza' },
          { ar: 'روكسي', en: 'Roxy' },
          { ar: 'النزهة', en: 'El Nozha' },
          { ar: 'ميدان الحجاز', en: 'Hegaz Square' },
          { ar: 'كوربة هليوبوليس', en: 'Korba Heliopolis' },
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'شيراتون', en: 'Sheraton' },
          { ar: 'هليوبوليس الجديدة', en: 'New Heliopolis' },
        ],
      },
      {
        ar: 'التجمع الخامس', en: 'Fifth Settlement',
        children: [
          { ar: 'النرجس', en: 'Narges' },
          { ar: 'اللوتس', en: 'Lotus' },
          { ar: 'الياسمين', en: 'Yasmin' },
          { ar: 'البنفسج', en: 'Banafseg' },
          { ar: 'الأندلس', en: 'Andalus' },
          { ar: 'التسعين الشمالي', en: 'North 90th' },
          { ar: 'التسعين الجنوبي', en: 'South 90th' },
          { ar: 'القطامية', en: 'Katameya' },
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'أبو الهول', en: 'Abu El Hol' },
        ],
      },
      {
        ar: 'المقطم', en: 'Mokattam',
        children: [
          { ar: 'الهضبة الوسطى', en: 'Middle Plateau' },
          { ar: 'الهضبة العليا', en: 'Upper Plateau' },
          { ar: 'محور الأوتوستراد', en: 'Autostrad Axis' },
        ],
      },
      {
        ar: 'شبرا', en: 'Shubra',
        children: [
          { ar: 'شبرا مصر', en: 'Shubra Masr' },
          { ar: 'روض الفرج', en: 'Rod El Farag' },
          { ar: 'الساحل', en: 'El Sahel' },
        ],
      },
      {
        ar: 'حلوان', en: 'Helwan',
        children: [
          { ar: 'حلوان البلد', en: 'Helwan Center' },
          { ar: '15 مايو', en: '15th of May' },
          { ar: 'المعصرة', en: 'El Maasara' },
          { ar: 'التبين', en: 'El Tebbin' },
          { ar: 'عين حلوان', en: 'Ain Helwan' },
        ],
      },
      {
        ar: 'عين شمس', en: 'Ain Shams',
        children: [
          { ar: 'عين شمس الشرقية', en: 'Ain Shams East' },
          { ar: 'عين شمس الغربية', en: 'Ain Shams West' },
          { ar: 'المطرية', en: 'El Matariya' },
          { ar: 'عزبة النخل', en: 'Ezbet El Nakhl' },
        ],
      },
      {
        ar: 'الزيتون', en: 'Zeitoun',
        children: [
          { ar: 'حدائق الزيتون', en: 'Hadayek El Zeitoun' },
          { ar: 'القبة', en: 'El Qubba' },
          { ar: 'حمامات القبة', en: 'Hammamat El Qubba' },
        ],
      },
      {
        ar: 'مدينتي', en: 'Madinaty',
        children: [
          { ar: 'المنطقة الأولى', en: 'Zone 1' },
          { ar: 'المنطقة الثانية', en: 'Zone 2' },
          { ar: 'الحي السكني', en: 'Residential Quarter' },
        ],
      },
      {
        ar: 'الرحاب', en: 'Rehab City',
        children: [
          { ar: 'المرحلة الأولى', en: 'Phase 1' },
          { ar: 'المرحلة الثانية', en: 'Phase 2' },
          { ar: 'الداون تاون', en: 'Downtown' },
        ],
      },
      {
        ar: 'العاصمة الإدارية الجديدة', en: 'New Administrative Capital',
        children: [
          { ar: 'الحي السكني الأول', en: 'R1' },
          { ar: 'الحي السكني الثاني', en: 'R2' },
          { ar: 'الحي السكني الثالث', en: 'R3' },
          { ar: 'الحي السكني الخامس', en: 'R5' },
          { ar: 'الحي السكني السابع', en: 'R7' },
          { ar: 'الحي السكني الثامن', en: 'R8' },
          { ar: 'الحي الحكومي', en: 'Government District' },
          { ar: 'حي المال والأعمال', en: 'CBD' },
          { ar: 'المنطقة الصناعية', en: 'Industrial Zone' },
        ],
      },
      {
        ar: 'بدر', en: 'Badr City',
        children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي السادس', en: '6th District' },
        ],
      },
      {
        ar: 'الشروق', en: 'El Shorouk',
        children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثاني', en: '2nd District' },
          { ar: 'الحي الثالث', en: '3rd District' },
        ],
      },
      {
        ar: 'القاهرة الجديدة', en: 'New Cairo',
        children: [
          { ar: 'التجمع الأول', en: 'First Settlement' },
          { ar: 'التجمع الثالث', en: 'Third Settlement' },
          { ar: 'غرب الجولف', en: 'West Golf' },
          { ar: 'جنوب الأكاديمية', en: 'South Academy' },
        ],
      },
      {
        ar: 'وسط البلد', en: 'Downtown Cairo',
        children: [
          { ar: 'التحرير', en: 'Tahrir' },
          { ar: 'عابدين', en: 'Abdeen' },
          { ar: 'الأزبكية', en: 'Azbakeya' },
          { ar: 'باب اللوق', en: 'Bab El Louk' },
          { ar: 'جاردن سيتي', en: 'Garden City' },
        ],
      },
      {
        ar: 'مصر القديمة', en: 'Old Cairo',
        children: [
          { ar: 'الفسطاط', en: 'El Fustat' },
          { ar: 'المنيل', en: 'El Manial' },
          { ar: 'دار السلام', en: 'Dar El Salam' },
          { ar: 'البساتين', en: 'El Basateen' },
        ],
      },
      {
        ar: 'السلام', en: 'El Salam',
        children: [
          { ar: 'السلام أول', en: 'El Salam 1st' },
          { ar: 'السلام ثاني', en: 'El Salam 2nd' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. الجيزة — Giza
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الجيزة', en: 'Giza',
    children: [
      {
        ar: '6 أكتوبر', en: '6th of October',
        children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثاني', en: '2nd District' },
          { ar: 'الحي الثالث', en: '3rd District' },
          { ar: 'الحي السادس', en: '6th District' },
          { ar: 'الحي الحادي عشر', en: '11th District' },
          { ar: 'الحي الثاني عشر', en: '12th District' },
          { ar: 'المحور المركزي', en: 'Central Axis' },
          { ar: 'أكتوبر الجديدة', en: 'New October' },
          { ar: 'حدائق أكتوبر', en: 'October Gardens' },
        ],
      },
      {
        ar: 'الشيخ زايد', en: 'Sheikh Zayed',
        children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثاني', en: '2nd District' },
          { ar: 'الحي الرابع', en: '4th District' },
          { ar: 'الحي الثامن', en: '8th District' },
          { ar: 'الحي الثالث عشر', en: '13th District' },
          { ar: 'الحي السادس عشر', en: '16th District' },
          { ar: 'بيفرلي هيلز', en: 'Beverly Hills' },
        ],
      },
      {
        ar: 'الهرم', en: 'Haram',
        children: [
          { ar: 'شارع الهرم', en: 'Haram Street' },
          { ar: 'الطالبية', en: 'El Talbiya' },
          { ar: 'المريوطية', en: 'El Mariouteya' },
          { ar: 'ترسا', en: 'Tersa' },
          { ar: 'المنصورية', en: 'El Mansouriya' },
        ],
      },
      {
        ar: 'فيصل', en: 'Faisal',
        children: [
          { ar: 'شارع فيصل', en: 'Faisal Street' },
          { ar: 'الطوابق', en: 'El Tawabek' },
          { ar: 'العشرين', en: 'El Eshreen' },
        ],
      },
      {
        ar: 'الدقي', en: 'Dokki',
        children: [
          { ar: 'ميدان الدقي', en: 'Dokki Square' },
          { ar: 'المساحة', en: 'El Mesaha' },
          { ar: 'شارع التحرير', en: 'Tahrir Street' },
          { ar: 'شارع جامعة الدول', en: 'Gameat El Dowal' },
        ],
      },
      {
        ar: 'العجوزة', en: 'Agouza',
        children: [
          { ar: 'شارع السودان', en: 'Sudan Street' },
          { ar: 'كورنيش النيل', en: 'Nile Corniche' },
          { ar: 'ميدان لبنان', en: 'Lebanon Square' },
        ],
      },
      {
        ar: 'المهندسين', en: 'Mohandessin',
        children: [
          { ar: 'شارع شهاب', en: 'Shehab Street' },
          { ar: 'شارع لبنان', en: 'Lebanon Street' },
          { ar: 'شارع جامعة الدول', en: 'Arab League Street' },
          { ar: 'ميدان أسوان', en: 'Aswan Square' },
          { ar: 'شارع البطل أحمد عبد العزيز', en: 'Batal Ahmed St' },
        ],
      },
      {
        ar: 'إمبابة', en: 'Imbaba',
        children: [
          { ar: 'أرض اللواء', en: 'Ard El Lewa' },
          { ar: 'الوراق', en: 'El Warraq' },
          { ar: 'بولاق الدكرور', en: 'Boulaq El Dakrour' },
        ],
      },
      {
        ar: 'حدائق الأهرام', en: 'Hadayek El Ahram',
        children: [
          { ar: 'البوابة الأولى', en: 'Gate 1' },
          { ar: 'البوابة الثانية', en: 'Gate 2' },
          { ar: 'البوابة الثالثة', en: 'Gate 3' },
          { ar: 'البوابة الرابعة', en: 'Gate 4' },
        ],
      },
      {
        ar: 'أبو رواش', en: 'Abu Rawash', children: [],
      },
      {
        ar: 'الحوامدية', en: 'El Hawamdiyya', children: [],
      },
      {
        ar: 'العياط', en: 'El Ayat', children: [],
      },
      {
        ar: 'البدرشين', en: 'El Badrashein', children: [],
      },
      {
        ar: 'الصف', en: 'El Saff', children: [],
      },
      {
        ar: 'أطفيح', en: 'Atfih', children: [],
      },
      {
        ar: 'الواحات البحرية', en: 'Bahariya Oasis', children: [],
      },
      {
        ar: 'منشأة القناطر', en: 'Manshaet El Qanater', children: [],
      },
      {
        ar: 'أوسيم', en: 'Ausim', children: [],
      },
      {
        ar: 'كرداسة', en: 'Kerdasa', children: [],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. الإسكندرية — Alexandria
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الإسكندرية', en: 'Alexandria',
    children: [
      {
        ar: 'سيدي جابر', en: 'Sidi Gaber',
        children: [
          { ar: 'سيدي جابر الشيخ', en: 'Sidi Gaber El Sheikh' },
          { ar: 'محطة سيدي جابر', en: 'Sidi Gaber Station' },
        ],
      },
      {
        ar: 'المنتزه', en: 'Montaza',
        children: [
          { ar: 'المعمورة', en: 'Maamoura' },
          { ar: 'المندرة', en: 'El Mandara' },
          { ar: 'العصافرة', en: 'Asafra' },
          { ar: 'أبو قير', en: 'Abu Qir' },
        ],
      },
      {
        ar: 'سموحة', en: 'Smouha',
        children: [
          { ar: 'سموحة الرئيسية', en: 'Smouha Main' },
          { ar: 'فيكتوريا', en: 'Victoria' },
          { ar: 'جناكليس', en: 'Gianaclis' },
          { ar: 'زيزينيا', en: 'Zizinia' },
        ],
      },
      {
        ar: 'ستانلي', en: 'Stanley',
        children: [
          { ar: 'كورنيش ستانلي', en: 'Stanley Corniche' },
          { ar: 'الشاطبي', en: 'Shatby' },
        ],
      },
      {
        ar: 'جليم', en: 'Gleem',
        children: [
          { ar: 'سان ستيفانو', en: 'San Stefano' },
          { ar: 'كليوباترا', en: 'Cleopatra' },
        ],
      },
      {
        ar: 'سيدي بشر', en: 'Sidi Bishr',
        children: [
          { ar: 'سيدي بشر قبلي', en: 'Sidi Bishr Qebli' },
          { ar: 'سيدي بشر بحري', en: 'Sidi Bishr Bahary' },
          { ar: 'ميامي', en: 'Miami' },
        ],
      },
      {
        ar: 'محرم بك', en: 'Moharam Bek',
        children: [
          { ar: 'محطة مصر', en: 'Misr Station' },
          { ar: 'كوم الدكة', en: 'Kom El Dikka' },
        ],
      },
      {
        ar: 'بحري', en: 'Bahary',
        children: [
          { ar: 'الأنفوشي', en: 'Anfoushi' },
          { ar: 'رأس التين', en: 'Ras El Tin' },
        ],
      },
      {
        ar: 'العجمي', en: 'Agami',
        children: [
          { ar: 'البيطاش', en: 'El Bitash' },
          { ar: 'الهانوفيل', en: 'Hannoville' },
          { ar: 'الديخيلة', en: 'Dekhela' },
        ],
      },
      {
        ar: 'لوران', en: 'Louran', children: [],
      },
      {
        ar: 'رشدي', en: 'Rushdy', children: [],
      },
      {
        ar: 'كامب شيزار', en: 'Camp Shezar', children: [],
      },
      {
        ar: 'العطارين', en: 'Attarine', children: [],
      },
      {
        ar: 'المنشية', en: 'Manshia', children: [],
      },
      {
        ar: 'العامرية', en: 'Amreya',
        children: [
          { ar: 'العامرية أول', en: 'Amreya 1st' },
          { ar: 'العامرية ثاني', en: 'Amreya 2nd' },
          { ar: 'برج العرب', en: 'Borg El Arab' },
          { ar: 'برج العرب الجديدة', en: 'New Borg El Arab' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. القليوبية — Qalyubia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'القليوبية', en: 'Qalyubia',
    children: [
      {
        ar: 'بنها', en: 'Benha',
        children: [
          { ar: 'وسط بنها', en: 'Benha Center' },
          { ar: 'كفر الجزار', en: 'Kafr El Gazzar' },
        ],
      },
      {
        ar: 'شبرا الخيمة', en: 'Shubra El Kheima',
        children: [
          { ar: 'شبرا الخيمة أول', en: 'Shubra El Kheima 1st' },
          { ar: 'شبرا الخيمة ثاني', en: 'Shubra El Kheima 2nd' },
          { ar: 'مسطرد', en: 'Mostorod' },
        ],
      },
      { ar: 'العبور', en: 'Obour', children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثالث', en: '3rd District' },
          { ar: 'الجولف', en: 'Golf' },
        ],
      },
      { ar: 'الخصوص', en: 'El Khosous', children: [] },
      { ar: 'قليوب', en: 'Qalyoub', children: [] },
      { ar: 'الخانكة', en: 'El Khanka', children: [] },
      { ar: 'القناطر الخيرية', en: 'El Qanatir El Khayriyyah', children: [] },
      { ar: 'طوخ', en: 'Toukh', children: [] },
      { ar: 'كفر شكر', en: 'Kafr Shukr', children: [] },
      { ar: 'شبين القناطر', en: 'Shibin El Qanater', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. الشرقية — Sharqia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الشرقية', en: 'Sharqia',
    children: [
      { ar: 'الزقازيق', en: 'Zagazig', children: [
          { ar: 'وسط الزقازيق', en: 'Zagazig Center' },
          { ar: 'شارع سعد زغلول', en: 'Saad Zaghloul St' },
        ],
      },
      { ar: 'العاشر من رمضان', en: '10th of Ramadan', children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثاني', en: '2nd District' },
          { ar: 'الحي الثالث', en: '3rd District' },
          { ar: 'المجاورة الأولى', en: '1st Neighborhood' },
        ],
      },
      { ar: 'بلبيس', en: 'Bilbeis', children: [] },
      { ar: 'أبو حماد', en: 'Abu Hammad', children: [] },
      { ar: 'فاقوس', en: 'Faqous', children: [] },
      { ar: 'منيا القمح', en: 'Minya El Qamh', children: [] },
      { ar: 'الحسينية', en: 'El Husseiniya', children: [] },
      { ar: 'أبو كبير', en: 'Abu Kebir', children: [] },
      { ar: 'ههيا', en: 'Hehia', children: [] },
      { ar: 'ديرب نجم', en: 'Diyarb Negm', children: [] },
      { ar: 'كفر صقر', en: 'Kafr Saqr', children: [] },
      { ar: 'أولاد صقر', en: 'Awlad Saqr', children: [] },
      { ar: 'الإبراهيمية', en: 'El Ibrahimiya', children: [] },
      { ar: 'مشتول السوق', en: 'Mashtool El Souq', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. الدقهلية — Dakahlia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الدقهلية', en: 'Dakahlia',
    children: [
      { ar: 'المنصورة', en: 'Mansoura', children: [
          { ar: 'حي الجامعة', en: 'University District' },
          { ar: 'توريل', en: 'Toriel' },
          { ar: 'شارع الجمهورية', en: 'Gomhoreya St' },
        ],
      },
      { ar: 'طلخا', en: 'Talkha', children: [] },
      { ar: 'ميت غمر', en: 'Mit Ghamr', children: [] },
      { ar: 'دكرنس', en: 'Dikirnis', children: [] },
      { ar: 'أجا', en: 'Aga', children: [] },
      { ar: 'السنبلاوين', en: 'Sinbillawin', children: [] },
      { ar: 'شربين', en: 'Shirbin', children: [] },
      { ar: 'بلقاس', en: 'Bilqas', children: [] },
      { ar: 'المنزلة', en: 'El Manzala', children: [] },
      { ar: 'تمي الأمديد', en: 'Temi El Amdid', children: [] },
      { ar: 'بني عبيد', en: 'Bani Obeid', children: [] },
      { ar: 'منية النصر', en: 'Minyat El Nasr', children: [] },
      { ar: 'الجمالية', en: 'El Gamaliyya', children: [] },
      { ar: 'نبروه', en: 'Nabaroh', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. البحر الأحمر — Red Sea
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'البحر الأحمر', en: 'Red Sea',
    children: [
      { ar: 'الغردقة', en: 'Hurghada', children: [
          { ar: 'الدهار', en: 'Dahar' },
          { ar: 'سهل حشيش', en: 'Sahl Hasheesh' },
          { ar: 'الجونة', en: 'El Gouna' },
          { ar: 'الممشى السياحي', en: 'Tourist Promenade' },
          { ar: 'الأحياء', en: 'Ahyaa' },
          { ar: 'مبارك', en: 'Mubarak' },
        ],
      },
      { ar: 'سفاجا', en: 'Safaga', children: [] },
      { ar: 'مرسى علم', en: 'Marsa Alam', children: [
          { ar: 'بورت غالب', en: 'Port Ghalib' },
        ],
      },
      { ar: 'القصير', en: 'El Quseir', children: [] },
      { ar: 'رأس غارب', en: 'Ras Ghareb', children: [] },
      { ar: 'الشلاتين', en: 'Shalateen', children: [] },
      { ar: 'حلايب', en: 'Halayeb', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 8. الغربية — Gharbia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الغربية', en: 'Gharbia',
    children: [
      { ar: 'طنطا', en: 'Tanta', children: [
          { ar: 'وسط طنطا', en: 'Tanta Center' },
          { ar: 'شارع الجيش', en: 'El Geish Street' },
          { ar: 'حي أول', en: '1st District' },
          { ar: 'حي ثاني', en: '2nd District' },
        ],
      },
      { ar: 'المحلة الكبرى', en: 'El Mahalla El Kubra', children: [
          { ar: 'وسط المحلة', en: 'Mahalla Center' },
          { ar: 'شبرا بلولة', en: 'Shubra Balula' },
        ],
      },
      { ar: 'كفر الزيات', en: 'Kafr El Zayat', children: [] },
      { ar: 'زفتى', en: 'Zefta', children: [] },
      { ar: 'السنطة', en: 'Santa', children: [] },
      { ar: 'بسيون', en: 'Basyoun', children: [] },
      { ar: 'سمنود', en: 'Samannoud', children: [] },
      { ar: 'قطور', en: 'Qotour', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 9. المنوفية — Monufia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'المنوفية', en: 'Monufia',
    children: [
      { ar: 'شبين الكوم', en: 'Shebin El Kom', children: [] },
      { ar: 'منوف', en: 'Menouf', children: [] },
      { ar: 'السادات', en: 'Sadat City', children: [
          { ar: 'المنطقة الصناعية', en: 'Industrial Zone' },
          { ar: 'الحي السكني', en: 'Residential Quarter' },
        ],
      },
      { ar: 'الباجور', en: 'El Bagour', children: [] },
      { ar: 'أشمون', en: 'Ashmoun', children: [] },
      { ar: 'تلا', en: 'Tala', children: [] },
      { ar: 'قويسنا', en: 'Quesna', children: [] },
      { ar: 'بركة السبع', en: 'Birket El Sab', children: [] },
      { ar: 'الشهداء', en: 'El Shohadaa', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 10. البحيرة — Beheira
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'البحيرة', en: 'Beheira',
    children: [
      { ar: 'دمنهور', en: 'Damanhour', children: [
          { ar: 'وسط دمنهور', en: 'Damanhour Center' },
        ],
      },
      { ar: 'كفر الدوار', en: 'Kafr El Dawwar', children: [] },
      { ar: 'رشيد', en: 'Rosetta', children: [] },
      { ar: 'إدكو', en: 'Idku', children: [] },
      { ar: 'أبو المطامير', en: 'Abu El Matamir', children: [] },
      { ar: 'حوش عيسى', en: 'Hosh Eissa', children: [] },
      { ar: 'شبراخيت', en: 'Shubrakhit', children: [] },
      { ar: 'كوم حمادة', en: 'Kom Hamada', children: [] },
      { ar: 'إيتاي البارود', en: 'Itay El Barud', children: [] },
      { ar: 'الدلنجات', en: 'El Delengat', children: [] },
      { ar: 'المحمودية', en: 'El Mahmoudiyya', children: [] },
      { ar: 'الرحمانية', en: 'El Rahmaniyya', children: [] },
      { ar: 'النوبارية الجديدة', en: 'New Nubaria', children: [] },
      { ar: 'وادي النطرون', en: 'Wadi El Natrun', children: [] },
      { ar: 'أبو حمص', en: 'Abu Hummus', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 11. كفر الشيخ — Kafr El Sheikh
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'كفر الشيخ', en: 'Kafr El Sheikh',
    children: [
      { ar: 'كفر الشيخ مركز', en: 'Kafr El Sheikh Center', children: [] },
      { ar: 'دسوق', en: 'Desouk', children: [] },
      { ar: 'فوة', en: 'Fuwwah', children: [] },
      { ar: 'بلطيم', en: 'Baltim', children: [] },
      { ar: 'مطوبس', en: 'Metobas', children: [] },
      { ar: 'الحامول', en: 'El Hamoul', children: [] },
      { ar: 'بيلا', en: 'Bella', children: [] },
      { ar: 'الرياض', en: 'Riyadh', children: [] },
      { ar: 'سيدي سالم', en: 'Sidi Salem', children: [] },
      { ar: 'قلين', en: 'Qellin', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 12. دمياط — Damietta
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'دمياط', en: 'Damietta',
    children: [
      { ar: 'دمياط مركز', en: 'Damietta Center', children: [
          { ar: 'وسط دمياط', en: 'Damietta Downtown' },
          { ar: 'كورنيش دمياط', en: 'Damietta Corniche' },
        ],
      },
      { ar: 'دمياط الجديدة', en: 'New Damietta', children: [
          { ar: 'الحي الأول', en: '1st District' },
          { ar: 'الحي الثاني', en: '2nd District' },
        ],
      },
      { ar: 'رأس البر', en: 'Ras El Bar', children: [] },
      { ar: 'فارسكور', en: 'Faraskour', children: [] },
      { ar: 'الزرقا', en: 'Zarqa', children: [] },
      { ar: 'كفر سعد', en: 'Kafr Saad', children: [] },
      { ar: 'كفر البطيخ', en: 'Kafr El Batikh', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 13. بورسعيد — Port Said
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'بورسعيد', en: 'Port Said',
    children: [
      { ar: 'حي الشرق', en: 'East District', children: [] },
      { ar: 'حي العرب', en: 'Arab District', children: [] },
      { ar: 'حي المناخ', en: 'Manakh District', children: [] },
      { ar: 'حي الزهور', en: 'Zohour District', children: [] },
      { ar: 'حي الضواحي', en: 'Suburban District', children: [] },
      { ar: 'حي الجنوب', en: 'South District', children: [] },
      { ar: 'بورفؤاد', en: 'Port Fouad', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 14. الإسماعيلية — Ismailia
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الإسماعيلية', en: 'Ismailia',
    children: [
      { ar: 'الإسماعيلية مركز', en: 'Ismailia Center', children: [
          { ar: 'حي أول', en: '1st District' },
          { ar: 'حي ثاني', en: '2nd District' },
          { ar: 'حي ثالث', en: '3rd District' },
        ],
      },
      { ar: 'فايد', en: 'Fayed', children: [] },
      { ar: 'القنطرة شرق', en: 'Qantara East', children: [] },
      { ar: 'القنطرة غرب', en: 'Qantara West', children: [] },
      { ar: 'التل الكبير', en: 'El Tal El Kebir', children: [] },
      { ar: 'أبو صوير', en: 'Abu Suweir', children: [] },
      { ar: 'القصاصين', en: 'Qassasin', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 15. السويس — Suez
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'السويس', en: 'Suez',
    children: [
      { ar: 'حي السويس', en: 'Suez District', children: [] },
      { ar: 'حي الأربعين', en: 'Arbaeen District', children: [] },
      { ar: 'حي عتاقة', en: 'Ataka District', children: [] },
      { ar: 'حي فيصل', en: 'Faisal District', children: [] },
      { ar: 'العين السخنة', en: 'Ain Sokhna', children: [
          { ar: 'الزعفرانة', en: 'Zafarana' },
          { ar: 'العين السخنة الساحل', en: 'Sokhna Coast' },
          { ar: 'بورتو السخنة', en: 'Porto Sokhna' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 16. شمال سيناء — North Sinai
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'شمال سيناء', en: 'North Sinai',
    children: [
      { ar: 'العريش', en: 'El Arish', children: [] },
      { ar: 'الشيخ زويد', en: 'Sheikh Zuweid', children: [] },
      { ar: 'رفح', en: 'Rafah', children: [] },
      { ar: 'بئر العبد', en: 'Bir El Abd', children: [] },
      { ar: 'الحسنة', en: 'El Hasana', children: [] },
      { ar: 'نخل', en: 'Nakhl', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 17. جنوب سيناء — South Sinai
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'جنوب سيناء', en: 'South Sinai',
    children: [
      { ar: 'شرم الشيخ', en: 'Sharm El Sheikh', children: [
          { ar: 'نعمة باي', en: 'Naama Bay' },
          { ar: 'هضبة أم السيد', en: 'Hadaba Om El Sid' },
          { ar: 'خليج نبق', en: 'Nabq Bay' },
          { ar: 'شرم القديمة', en: 'Old Sharm' },
          { ar: 'رأس نصراني', en: 'Ras Nasrani' },
        ],
      },
      { ar: 'دهب', en: 'Dahab', children: [] },
      { ar: 'نويبع', en: 'Nuweiba', children: [] },
      { ar: 'طابا', en: 'Taba', children: [] },
      { ar: 'سانت كاترين', en: 'Saint Catherine', children: [] },
      { ar: 'الطور', en: 'El Tur', children: [] },
      { ar: 'رأس سدر', en: 'Ras Sedr', children: [] },
      { ar: 'أبو رديس', en: 'Abu Redis', children: [] },
      { ar: 'أبو زنيمة', en: 'Abu Zenima', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 18. بني سويف — Beni Suef
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'بني سويف', en: 'Beni Suef',
    children: [
      { ar: 'بني سويف مركز', en: 'Beni Suef Center', children: [] },
      { ar: 'الواسطى', en: 'El Wasta', children: [] },
      { ar: 'ناصر', en: 'Nasser', children: [] },
      { ar: 'إهناسيا', en: 'Ehnasia', children: [] },
      { ar: 'ببا', en: 'Beba', children: [] },
      { ar: 'الفشن', en: 'El Fashn', children: [] },
      { ar: 'سمسطا', en: 'Samasta', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 19. الفيوم — Fayoum
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الفيوم', en: 'Fayoum',
    children: [
      { ar: 'الفيوم مركز', en: 'Fayoum Center', children: [] },
      { ar: 'الفيوم الجديدة', en: 'New Fayoum', children: [] },
      { ar: 'إبشواي', en: 'Ibsheway', children: [] },
      { ar: 'طامية', en: 'Tamiya', children: [] },
      { ar: 'سنورس', en: 'Sennoures', children: [] },
      { ar: 'يوسف الصديق', en: 'Youssef El Seddik', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 20. المنيا — Minya
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'المنيا', en: 'Minya',
    children: [
      { ar: 'المنيا مركز', en: 'Minya Center', children: [] },
      { ar: 'المنيا الجديدة', en: 'New Minya', children: [] },
      { ar: 'ملوي', en: 'Mallawi', children: [] },
      { ar: 'سمالوط', en: 'Samalout', children: [] },
      { ar: 'المطاهرة', en: 'El Matahara', children: [] },
      { ar: 'أبو قرقاص', en: 'Abu Qurqas', children: [] },
      { ar: 'بني مزار', en: 'Beni Mazar', children: [] },
      { ar: 'مغاغة', en: 'Maghagha', children: [] },
      { ar: 'العدوة', en: 'El Edwa', children: [] },
      { ar: 'دير مواس', en: 'Deir Mawas', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 21. أسيوط — Asyut
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'أسيوط', en: 'Asyut',
    children: [
      { ar: 'أسيوط مركز', en: 'Asyut Center', children: [] },
      { ar: 'أسيوط الجديدة', en: 'New Asyut', children: [] },
      { ar: 'ديروط', en: 'Dairut', children: [] },
      { ar: 'القوصية', en: 'El Qusia', children: [] },
      { ar: 'منفلوط', en: 'Manfalut', children: [] },
      { ar: 'أبنوب', en: 'Abnoub', children: [] },
      { ar: 'أبو تيج', en: 'Abu Tig', children: [] },
      { ar: 'الغنايم', en: 'El Ghanayem', children: [] },
      { ar: 'ساحل سليم', en: 'Sahel Selim', children: [] },
      { ar: 'البداري', en: 'El Badari', children: [] },
      { ar: 'صدفا', en: 'Sadfa', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 22. سوهاج — Sohag
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'سوهاج', en: 'Sohag',
    children: [
      { ar: 'سوهاج مركز', en: 'Sohag Center', children: [] },
      { ar: 'سوهاج الجديدة', en: 'New Sohag', children: [] },
      { ar: 'أخميم', en: 'Akhmim', children: [] },
      { ar: 'جرجا', en: 'Girga', children: [] },
      { ar: 'المراغة', en: 'El Maragha', children: [] },
      { ar: 'طهطا', en: 'Tahta', children: [] },
      { ar: 'المنشاة', en: 'El Monshaa', children: [] },
      { ar: 'البلينا', en: 'El Balyana', children: [] },
      { ar: 'ساقلتة', en: 'Saqulta', children: [] },
      { ar: 'دار السلام', en: 'Dar El Salam', children: [] },
      { ar: 'جهينة', en: 'Juhayna', children: [] },
      { ar: 'طما', en: 'Tama', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 23. قنا — Qena
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'قنا', en: 'Qena',
    children: [
      { ar: 'قنا مركز', en: 'Qena Center', children: [] },
      { ar: 'قنا الجديدة', en: 'New Qena', children: [] },
      { ar: 'نجع حمادي', en: 'Nag Hammadi', children: [] },
      { ar: 'دشنا', en: 'Dishna', children: [] },
      { ar: 'قوص', en: 'Qus', children: [] },
      { ar: 'فرشوط', en: 'Farshout', children: [] },
      { ar: 'نقادة', en: 'Naqada', children: [] },
      { ar: 'أبو تشت', en: 'Abu Tesht', children: [] },
      { ar: 'الوقف', en: 'El Waqf', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 24. الأقصر — Luxor
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الأقصر', en: 'Luxor',
    children: [
      { ar: 'الأقصر مركز', en: 'Luxor City', children: [
          { ar: 'وسط الأقصر', en: 'Downtown Luxor' },
          { ar: 'الكرنك', en: 'Karnak' },
          { ar: 'البر الغربي', en: 'West Bank' },
        ],
      },
      { ar: 'الأقصر الجديدة', en: 'New Luxor', children: [] },
      { ar: 'إسنا', en: 'Esna', children: [] },
      { ar: 'أرمنت', en: 'Armant', children: [] },
      { ar: 'القرنة', en: 'Qurna', children: [] },
      { ar: 'الطود', en: 'El Tod', children: [] },
      { ar: 'الزينية', en: 'El Ziniyya', children: [] },
      { ar: 'البياضية', en: 'El Bayadiyya', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 25. أسوان — Aswan
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'أسوان', en: 'Aswan',
    children: [
      { ar: 'أسوان مركز', en: 'Aswan City', children: [
          { ar: 'وسط أسوان', en: 'Downtown Aswan' },
          { ar: 'كورنيش أسوان', en: 'Aswan Corniche' },
        ],
      },
      { ar: 'أسوان الجديدة', en: 'New Aswan', children: [] },
      { ar: 'كوم أمبو', en: 'Kom Ombo', children: [] },
      { ar: 'إدفو', en: 'Edfu', children: [] },
      { ar: 'دراو', en: 'Daraw', children: [] },
      { ar: 'نصر النوبة', en: 'Nasr El Nuba', children: [] },
      { ar: 'أبو سمبل', en: 'Abu Simbel', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 26. مطروح — Matrouh
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'مطروح', en: 'Matrouh',
    children: [
      { ar: 'مرسى مطروح', en: 'Marsa Matrouh', children: [
          { ar: 'وسط مطروح', en: 'Matrouh Center' },
          { ar: 'الكورنيش', en: 'Corniche' },
        ],
      },
      { ar: 'الحمام', en: 'El Hammam', children: [] },
      { ar: 'العلمين', en: 'El Alamein', children: [] },
      { ar: 'العلمين الجديدة', en: 'New Alamein', children: [
          { ar: 'الداون تاون', en: 'Downtown' },
          { ar: 'الحي اللاتيني', en: 'Latin District' },
          { ar: 'الأبراج', en: 'Towers' },
        ],
      },
      { ar: 'الضبعة', en: 'El Dabaa', children: [] },
      { ar: 'سيوة', en: 'Siwa', children: [] },
      { ar: 'الساحل الشمالي', en: 'North Coast', children: [
          { ar: 'مارينا', en: 'Marina' },
          { ar: 'مراسي', en: 'Marassi' },
          { ar: 'هاسيندا', en: 'Hacienda' },
          { ar: 'سيدي عبد الرحمن', en: 'Sidi Abdel Rahman' },
          { ar: 'الكيلو 21', en: 'KM 21' },
        ],
      },
      { ar: 'سيدي براني', en: 'Sidi Barrani', children: [] },
      { ar: 'السلوم', en: 'Salloum', children: [] },
      { ar: 'النجيلة', en: 'El Negela', children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 27. الوادي الجديد — New Valley
  // ═══════════════════════════════════════════════════════════════
  {
    ar: 'الوادي الجديد', en: 'New Valley',
    children: [
      { ar: 'الخارجة', en: 'El Kharga', children: [] },
      { ar: 'الداخلة', en: 'El Dakhla', children: [] },
      { ar: 'الفرافرة', en: 'El Farafra', children: [] },
      { ar: 'باريس', en: 'Paris', children: [] },
      { ar: 'بلاط', en: 'Balat', children: [] },
    ],
  },
];


// ═══════════════════════════════════════════════════════════════════
// Seeding Logic
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 Seeding comprehensive Egypt locations…');

  // Clear existing locations
  const existing = await prisma.location.count();
  if (existing > 0) {
    console.log(`  🗑  Deleting ${existing} existing locations…`);
    await prisma.$executeRawUnsafe('DELETE FROM locations');
    // Reset auto-increment so IDs start fresh
    await prisma.$executeRawUnsafe('ALTER TABLE locations AUTO_INCREMENT = 1');
  }

  let govCount = 0, cityCount = 0, distCount = 0;

  for (let gi = 0; gi < EGYPT.length; gi++) {
    const gov = EGYPT[gi];
    const govRow = await prisma.location.create({
      data: {
        nameAr: gov.ar,
        nameEn: gov.en,
        type: LocationType.GOVERNORATE,
        parentId: null,
        sortOrder: gi + 1,
        isActive: true,
      },
    });
    govCount++;

    const cities = gov.children ?? [];
    for (let ci = 0; ci < cities.length; ci++) {
      const city = cities[ci];
      const cityRow = await prisma.location.create({
        data: {
          nameAr: city.ar,
          nameEn: city.en,
          type: LocationType.CITY,
          parentId: govRow.id,
          sortOrder: ci + 1,
          isActive: true,
        },
      });
      cityCount++;

      const districts = city.children ?? [];
      for (let di = 0; di < districts.length; di++) {
        const dist = districts[di];
        await prisma.location.create({
          data: {
            nameAr: dist.ar,
            nameEn: dist.en,
            type: LocationType.DISTRICT,
            parentId: cityRow.id,
            sortOrder: di + 1,
            isActive: true,
          },
        });
        distCount++;
      }
    }
  }

  console.log(`  ✅ ${govCount} governorates`);
  console.log(`  ✅ ${cityCount} cities`);
  console.log(`  ✅ ${distCount} districts`);
  console.log(`  📊 Total: ${govCount + cityCount + distCount} locations`);
  console.log('🎉 Done!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
