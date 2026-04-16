/**
 * Prisma Seed Script — Populates the database with realistic Egyptian property data.
 * Run: npx ts-node prisma/seed.ts
 */
import { PrismaClient, PropertyType, PropertyKind, PropertyStatus, MediaType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database…');

  // ─── 1. Seed Locations ────────────────────────────────────────
  const locationCount = await prisma.location.count();
  if (locationCount === 0) {
    console.log('  → Seeding locations…');
    await prisma.$executeRawUnsafe(`
      INSERT INTO locations (name_ar, name_en, type, parent_id, sort_order, is_active) VALUES
      ('القاهرة','Cairo','GOVERNORATE',NULL,1,1),
      ('الجيزة','Giza','GOVERNORATE',NULL,2,1),
      ('الإسكندرية','Alexandria','GOVERNORATE',NULL,3,1),
      ('القليوبية','Qalyubia','GOVERNORATE',NULL,4,1),
      ('الشرقية','Sharqia','GOVERNORATE',NULL,5,1),
      ('الدقهلية','Dakahlia','GOVERNORATE',NULL,6,1),
      ('البحر الأحمر','Red Sea','GOVERNORATE',NULL,7,1)
    `);
    // Cairo cities
    await prisma.$executeRawUnsafe(`
      INSERT INTO locations (name_ar, name_en, type, parent_id, sort_order, is_active) VALUES
      ('مدينة نصر','Nasr City','CITY',1,1,1),
      ('المعادي','Maadi','CITY',1,2,1),
      ('مصر الجديدة','Heliopolis','CITY',1,3,1),
      ('التجمع الخامس','Fifth Settlement','CITY',1,4,1),
      ('المقطم','Mokattam','CITY',1,5,1),
      ('شبرا','Shubra','CITY',1,6,1)
    `);
    // Giza cities
    await prisma.$executeRawUnsafe(`
      INSERT INTO locations (name_ar, name_en, type, parent_id, sort_order, is_active) VALUES
      ('6 أكتوبر','6th of October','CITY',2,1,1),
      ('الشيخ زايد','Sheikh Zayed','CITY',2,2,1),
      ('الهرم','Haram','CITY',2,3,1),
      ('فيصل','Faisal','CITY',2,4,1)
    `);
    // Alexandria cities
    await prisma.$executeRawUnsafe(`
      INSERT INTO locations (name_ar, name_en, type, parent_id, sort_order, is_active) VALUES
      ('سموحة','Smouha','CITY',3,1,1),
      ('المنتزه','Montazah','CITY',3,2,1),
      ('سيدي بشر','Sidi Bishr','CITY',3,3,1),
      ('ستانلي','Stanley','CITY',3,4,1)
    `);
    console.log('  ✅ Locations seeded');
  } else {
    console.log('  ⏭ Locations already exist, skipping');
  }

  // ─── 2. Create seed users ────────────────────────────────────
  const seedUser = await prisma.user.upsert({
    where: { phone: '+201000000001' },
    update: {},
    create: {
      phone: '+201000000001',
      name: 'أحمد سمسار',
      email: 'ahmed@semsar.ai',
      isPhoneVerified: true,
    },
  });

  const seedUser2 = await prisma.user.upsert({
    where: { phone: '+201000000002' },
    update: {},
    create: {
      phone: '+201000000002',
      name: 'محمد عقارات',
      email: 'mohamed@semsar.ai',
      isPhoneVerified: true,
    },
  });

  console.log('  ✅ Seed users created');

  // ─── 3. Create sample properties ─────────────────────────────
  const properties = [
    // ── APARTMENTS — SALE ──
    {
      userId: seedUser.id,
      title: 'شقة للبيع في التجمع الخامس',
      description: 'شقة مميزة بموقع ممتاز في قلب التجمع الخامس، قريبة من الجامعة الأمريكية.',
      price: 3500000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 180,
      governorate: 'القاهرة',
      city: 'التجمع الخامس',
      district: 'النرجس',
      apartmentType: 'شقة',
      finishingType: 'سوبر لوكس',
      floorLevel: 'الدور الخامس',
      paymentMethod: 'كاش أو تقسيط',
      isNegotiable: true,
      adTitle: 'شقة 180م² سوبر لوكس — التجمع الخامس',
      adDescription: 'شقة تشطيب سوبر لوكس، 3 غرف و2 حمام، موقع مميز بالقرب من الجامعة الأمريكية. فرصة لا تعوض!',
    },
    {
      userId: seedUser.id,
      title: 'شقة للبيع في مدينة نصر',
      description: 'شقة بموقع حيوي في مدينة نصر بالقرب من سيتي ستارز.',
      price: 2200000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 120,
      governorate: 'القاهرة',
      city: 'مدينة نصر',
      district: 'الحي الثامن',
      apartmentType: 'شقة',
      finishingType: 'لوكس',
      floorLevel: 'الدور الثالث',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'شقة 120م² لوكس — مدينة نصر',
      adDescription: 'شقة بتشطيب لوكس في مدينة نصر، 2 غرفة نوم، قريبة من سيتي ستارز ومحطة المترو.',
    },
    {
      userId: seedUser2.id,
      title: 'شقة للبيع في 6 أكتوبر',
      description: 'شقة واسعة في مدينة 6 أكتوبر، تطل على حدائق.',
      price: 1800000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 160,
      governorate: 'الجيزة',
      city: '6 أكتوبر',
      district: 'الحي الأول',
      apartmentType: 'شقة',
      finishingType: 'نصف تشطيب',
      floorLevel: 'الدور الثاني',
      paymentMethod: 'تقسيط',
      isNegotiable: false,
      adTitle: 'شقة 160م² بإطلالة رائعة — 6 أكتوبر',
      adDescription: 'شقة 3 غرف نوم في 6 أكتوبر، تطل على حدائق، نصف تشطيب، مناسبة للتقسيط.',
    },
    // ── APARTMENTS — RENT ──
    {
      userId: seedUser.id,
      title: 'شقة للإيجار في المعادي',
      description: 'شقة مفروشة بالكامل للإيجار الشهري في المعادي الجديدة.',
      price: 12000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 100,
      governorate: 'القاهرة',
      city: 'المعادي',
      district: 'المعادي الجديدة',
      apartmentType: 'شقة',
      finishingType: 'سوبر لوكس',
      floorLevel: 'الدور الرابع',
      isFurnished: true,
      rentRateType: 'شهري',
      isNegotiable: true,
      adTitle: 'شقة مفروشة 100م² — المعادي الجديدة',
      adDescription: 'شقة مفروشة بالكامل، 2 غرفة نوم، تشطيب سوبر لوكس، إيجار شهري.',
    },
    {
      userId: seedUser2.id,
      title: 'شقة للإيجار في مصر الجديدة',
      description: 'شقة حديثة في مصر الجديدة بالقرب من كوربة هليوبوليس.',
      price: 15000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 150,
      governorate: 'القاهرة',
      city: 'مصر الجديدة',
      district: 'كوربة هليوبوليس',
      apartmentType: 'شقة',
      finishingType: 'سوبر لوكس',
      floorLevel: 'الدور السادس',
      isFurnished: false,
      rentRateType: 'شهري',
      isNegotiable: true,
      adTitle: 'شقة 150م² — مصر الجديدة كوربة',
      adDescription: 'شقة 3 غرف نوم بتشطيب ممتاز بالقرب من كوربة هليوبوليس. الإيجار قابل للتفاوض.',
    },
    // ── VILLAS ──
    {
      userId: seedUser.id,
      title: 'فيلا للبيع في الشيخ زايد',
      description: 'فيلا فاخرة مستقلة في كمبوند بيفرلي هيلز.',
      price: 15000000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.VILLA,
      bedrooms: 5,
      bathrooms: 4,
      areaM2: 450,
      governorate: 'الجيزة',
      city: 'الشيخ زايد',
      district: 'بيفرلي هيلز',
      finishingType: 'سوبر لوكس',
      paymentMethod: 'كاش أو تقسيط',
      isNegotiable: true,
      adTitle: 'فيلا فاخرة 450م² — الشيخ زايد',
      adDescription: 'فيلا مستقلة 5 غرف نوم في كمبوند بيفرلي هيلز، تشطيب كامل، حديقة خاصة وحمام سباحة.',
    },
    {
      userId: seedUser2.id,
      title: 'فيلا للإيجار في التجمع الخامس',
      description: 'فيلا توين هاوس للإيجار في كمبوند ماونتن فيو.',
      price: 45000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.VILLA,
      bedrooms: 4,
      bathrooms: 3,
      areaM2: 300,
      governorate: 'القاهرة',
      city: 'التجمع الخامس',
      district: 'ماونتن فيو',
      finishingType: 'سوبر لوكس',
      isFurnished: true,
      rentRateType: 'شهري',
      isNegotiable: true,
      adTitle: 'فيلا توين هاوس مفروشة — ماونتن فيو',
      adDescription: 'فيلا توين هاوس 4 غرف نوم، مفروشة بالكامل مع حديقة خاصة. إيجار شهري.',
    },
    // ── SHOPS ──
    {
      userId: seedUser.id,
      title: 'محل تجاري للبيع في المقطم',
      description: 'محل تجاري بموقع مميز على الشارع الرئيسي.',
      price: 950000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.SHOP,
      areaM2: 60,
      governorate: 'القاهرة',
      city: 'المقطم',
      district: 'الشارع الرئيسي',
      finishingType: 'تشطيب كامل',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'محل 60م² على الشارع الرئيسي — المقطم',
      adDescription: 'محل تجاري جاهز للاستلام، واجهة زجاجية، موقع مميز على الشارع الرئيسي.',
    },
    // ── OFFICES ──
    {
      userId: seedUser2.id,
      title: 'مكتب للإيجار في مصر الجديدة',
      description: 'مكتب إداري مؤثث بالكامل في برج حديث.',
      price: 20000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.OFFICE,
      areaM2: 80,
      governorate: 'القاهرة',
      city: 'مصر الجديدة',
      district: 'شارع الثورة',
      finishingType: 'سوبر لوكس',
      isFurnished: true,
      rentRateType: 'شهري',
      isNegotiable: false,
      adTitle: 'مكتب مؤثث 80م² — مصر الجديدة',
      adDescription: 'مكتب إداري مؤثث بالكامل، تكييف مركزي، في برج حديث على شارع الثورة.',
    },
    // ── SUMMER RESORT — RENT ──
    {
      userId: seedUser.id,
      title: 'شاليه للإيجار في الساحل الشمالي',
      description: 'شاليه مصيفي مطل على البحر مباشرة.',
      price: 8000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.SUMMER_RESORT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 90,
      governorate: 'الإسكندرية',
      city: 'الساحل الشمالي',
      location: 'الكيلو 120 — أمام البحر',
      rentalRate: 8000,
      rentalFees: 500,
      insurance: 2000,
      rentRateType: 'يومي',
      isFurnished: true,
      isNegotiable: true,
      adTitle: 'شاليه بحري — الساحل الشمالي 🏖️',
      adDescription: 'شاليه مفروش مطل على البحر مباشرة في الساحل الشمالي. مثالي للعائلات.',
    },
    // ── SUMMER RESORT — SALE ──
    {
      userId: seedUser2.id,
      title: 'شاليه للبيع في العين السخنة',
      description: 'شاليه فاخر في قرية لافيستا بالعين السخنة.',
      price: 4500000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.SUMMER_RESORT,
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 130,
      governorate: 'البحر الأحمر',
      city: 'العين السخنة',
      location: 'لافيستا — العين السخنة',
      deliveryTerms: 'استلام فوري',
      paymentType: 'تقسيط',
      paymentMethod: 'مقدم 30% وتقسيط على 5 سنوات',
      downPayment: 1350000,
      isNegotiable: true,
      adTitle: 'شاليه 130م² لافيستا — العين السخنة',
      adDescription: 'شاليه فاخر 3 غرف بإطلالة بحرية في لافيستا. مقدم 30% والباقي تقسيط على 5 سنوات.',
    },
    // ── LAND / BUILDING ──
    {
      userId: seedUser.id,
      title: 'أرض للبيع في 6 أكتوبر',
      description: 'قطعة أرض سكنية بمساحة 500م² في الحي المتميز.',
      price: 6000000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.LAND_BUILDING,
      areaM2: 500,
      governorate: 'الجيزة',
      city: '6 أكتوبر',
      district: 'الحي المتميز',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'أرض سكنية 500م² — 6 أكتوبر',
      adDescription: 'قطعة أرض في الحي المتميز بمدينة 6 أكتوبر. مناسبة لبناء فيلا أو عمارة.',
    },
    // ── More apartments for variety ──
    {
      userId: seedUser2.id,
      title: 'شقة للبيع في الهرم',
      description: 'شقة بالقرب من شارع الهرم الرئيسي.',
      price: 1100000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 95,
      governorate: 'الجيزة',
      city: 'الهرم',
      district: 'شارع الهرم',
      apartmentType: 'شقة',
      finishingType: 'لوكس',
      floorLevel: 'الدور الأول',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'شقة 95م² — الهرم',
      adDescription: 'شقة 2 غرفة نوم بتشطيب لوكس في شارع الهرم. سعر مميز.',
    },
    {
      userId: seedUser.id,
      title: 'شقة للإيجار في فيصل',
      description: 'شقة مناسبة للطلاب والموظفين في فيصل.',
      price: 5000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 80,
      governorate: 'الجيزة',
      city: 'فيصل',
      district: 'شارع فيصل',
      apartmentType: 'شقة',
      finishingType: 'لوكس',
      floorLevel: 'الدور الثالث',
      isFurnished: false,
      rentRateType: 'شهري',
      isNegotiable: true,
      adTitle: 'شقة 80م² — فيصل',
      adDescription: 'شقة 2 غرفة نوم بسعر مناسب في شارع فيصل الرئيسي. مناسبة للعائلات الصغيرة.',
    },
    {
      userId: seedUser2.id,
      title: 'شقة للبيع في شبرا',
      description: 'شقة في شبرا مصر بموقع قريب من المترو.',
      price: 900000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 3,
      bathrooms: 1,
      areaM2: 110,
      governorate: 'القاهرة',
      city: 'شبرا',
      district: 'شبرا مصر',
      apartmentType: 'شقة',
      finishingType: 'لوكس',
      floorLevel: 'الدور الرابع',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'شقة 110م² — شبرا',
      adDescription: 'شقة 3 غرف نوم في شبرا مصر بالقرب من محطة مترو شبرا الخيمة. فرصة ممتازة.',
    },
    // ── COMMERCIAL ──
    {
      userId: seedUser.id,
      title: 'مبنى تجاري للبيع في مدينة نصر',
      description: 'مبنى تجاري كامل مكون من 4 طوابق على شارع رئيسي.',
      price: 25000000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.COMMERCIAL,
      areaM2: 800,
      governorate: 'القاهرة',
      city: 'مدينة نصر',
      district: 'شارع عباس العقاد',
      finishingType: 'تشطيب كامل',
      paymentMethod: 'كاش',
      isNegotiable: true,
      adTitle: 'مبنى تجاري 800م² — عباس العقاد',
      adDescription: 'مبنى تجاري 4 طوابق على شارع عباس العقاد. مؤجر بالكامل بعائد ممتاز.',
    },
    // ── Alexandria apartments ──
    {
      userId: seedUser2.id,
      title: 'شقة للإيجار في سموحة',
      description: 'شقة حديثة في سموحة بالقرب من النوادي.',
      price: 9000,
      type: PropertyType.RENT,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 110,
      governorate: 'الإسكندرية',
      city: 'سموحة',
      district: 'شارع فوزي معاذ',
      apartmentType: 'شقة',
      finishingType: 'سوبر لوكس',
      floorLevel: 'الدور الخامس',
      isFurnished: false,
      rentRateType: 'شهري',
      isNegotiable: true,
      adTitle: 'شقة 110م² — سموحة',
      adDescription: 'شقة 2 غرفة نوم بتشطيب سوبر لوكس في سموحة. قريبة من جميع الخدمات.',
    },
    {
      userId: seedUser.id,
      title: 'شقة للبيع في سيدي بشر',
      description: 'شقة بإطلالة بحرية رائعة على كورنيش الإسكندرية.',
      price: 2800000,
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      bedrooms: 3,
      bathrooms: 2,
      areaM2: 170,
      governorate: 'الإسكندرية',
      city: 'سيدي بشر',
      district: 'الكورنيش',
      apartmentType: 'شقة',
      finishingType: 'سوبر لوكس',
      floorLevel: 'الدور الثامن',
      paymentMethod: 'كاش أو تقسيط',
      isNegotiable: true,
      adTitle: 'شقة بحرية 170م² — سيدي بشر',
      adDescription: 'شقة بإطلالة مباشرة على البحر في سيدي بشر. 3 غرف نوم، تشطيب سوبر لوكس.',
    },
  ];

  let created = 0;
  for (const prop of properties) {
    const { areaM2, price, rentalRate, rentalFees, insurance, downPayment, ...rest } = prop;
    await prisma.property.create({
      data: {
        ...rest,
        price: price ?? undefined,
        areaM2: areaM2 ?? undefined,
        rentalRate: rentalRate ?? undefined,
        rentalFees: rentalFees ?? undefined,
        insurance: insurance ?? undefined,
        downPayment: downPayment ?? undefined,
        propertyStatus: PropertyStatus.ACTIVE,
      },
    });
    created++;
  }

  console.log(`  ✅ ${created} properties created`);
  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
