-- Semsar AI — Location Seed Data
-- 7 governorates, ~50 cities, ~60 districts
-- Hierarchy: GOVERNORATE → CITY → DISTRICT (self-referencing via parent_id)

-- ============================================================
-- GOVERNORATES (parent_id = NULL)
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('القاهرة',       'Cairo',       'GOVERNORATE', NULL, 1, TRUE),
('الجيزة',        'Giza',        'GOVERNORATE', NULL, 2, TRUE),
('الإسكندرية',    'Alexandria',  'GOVERNORATE', NULL, 3, TRUE),
('القليوبية',     'Qalyubia',    'GOVERNORATE', NULL, 4, TRUE),
('الشرقية',       'Sharqia',     'GOVERNORATE', NULL, 5, TRUE),
('الدقهلية',      'Dakahlia',    'GOVERNORATE', NULL, 6, TRUE),
('البحر الأحمر',  'Red Sea',     'GOVERNORATE', NULL, 7, TRUE);

-- ============================================================
-- CITIES — القاهرة (Cairo) — parent_id = 1
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('مدينة نصر',       'Nasr City',        'CITY', 1, 1,  TRUE),
('المعادي',         'Maadi',             'CITY', 1, 2,  TRUE),
('مصر الجديدة',     'Heliopolis',        'CITY', 1, 3,  TRUE),
('التجمع الخامس',   'Fifth Settlement',  'CITY', 1, 4,  TRUE),
('المقطم',          'Mokattam',          'CITY', 1, 5,  TRUE),
('شبرا',            'Shubra',            'CITY', 1, 6,  TRUE),
('حلوان',           'Helwan',            'CITY', 1, 7,  TRUE),
('15 مايو',         '15th of May',       'CITY', 1, 8,  TRUE),
('عين شمس',         'Ain Shams',         'CITY', 1, 9,  TRUE),
('الزيتون',         'Zeitoun',           'CITY', 1, 10, TRUE);

-- ============================================================
-- CITIES — الجيزة (Giza) — parent_id = 2
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('6 أكتوبر',        '6th of October',    'CITY', 2, 1,  TRUE),
('الشيخ زايد',      'Sheikh Zayed',      'CITY', 2, 2,  TRUE),
('الهرم',           'Haram',             'CITY', 2, 3,  TRUE),
('فيصل',            'Faisal',            'CITY', 2, 4,  TRUE),
('الدقي',           'Dokki',             'CITY', 2, 5,  TRUE),
('العجوزة',         'Agouza',            'CITY', 2, 6,  TRUE),
('إمبابة',          'Imbaba',            'CITY', 2, 7,  TRUE),
('حدائق الأهرام',   'Hadayek El Ahram',  'CITY', 2, 8,  TRUE),
('أبو رواش',        'Abu Rawash',        'CITY', 2, 9,  TRUE);

-- ============================================================
-- CITIES — الإسكندرية (Alexandria) — parent_id = 3
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('سيدي جابر',       'Sidi Gaber',        'CITY', 3, 1,  TRUE),
('المنتزه',         'Montaza',           'CITY', 3, 2,  TRUE),
('سموحة',           'Smouha',            'CITY', 3, 3,  TRUE),
('ستانلي',          'Stanley',           'CITY', 3, 4,  TRUE),
('جليم',            'Gleem',             'CITY', 3, 5,  TRUE),
('كليوباترا',       'Cleopatra',         'CITY', 3, 6,  TRUE),
('العصافرة',        'Asafra',            'CITY', 3, 7,  TRUE),
('محرم بك',         'Moharam Bek',       'CITY', 3, 8,  TRUE),
('بحري',            'Bahary',            'CITY', 3, 9,  TRUE);

-- ============================================================
-- CITIES — القليوبية (Qalyubia) — parent_id = 4
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('بنها',            'Benha',             'CITY', 4, 1,  TRUE),
('شبرا الخيمة',     'Shubra El Kheima',  'CITY', 4, 2,  TRUE),
('العبور',          'Obour',             'CITY', 4, 3,  TRUE),
('الخصوص',          'El Khosous',        'CITY', 4, 4,  TRUE),
('قليوب',           'Qalyoub',           'CITY', 4, 5,  TRUE);

-- ============================================================
-- CITIES — الشرقية (Sharqia) — parent_id = 5
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الزقازيق',        'Zagazig',           'CITY', 5, 1,  TRUE),
('العاشر من رمضان', '10th of Ramadan',   'CITY', 5, 2,  TRUE),
('بلبيس',           'Bilbeis',           'CITY', 5, 3,  TRUE),
('أبو حماد',        'Abu Hammad',        'CITY', 5, 4,  TRUE),
('فاقوس',           'Faqous',            'CITY', 5, 5,  TRUE);

-- ============================================================
-- CITIES — الدقهلية (Dakahlia) — parent_id = 6
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('المنصورة',        'Mansoura',          'CITY', 6, 1,  TRUE),
('طلخا',            'Talkha',            'CITY', 6, 2,  TRUE),
('ميت غمر',         'Mit Ghamr',         'CITY', 6, 3,  TRUE),
('دكرنس',           'Dikirnis',          'CITY', 6, 4,  TRUE),
('أجا',             'Aga',               'CITY', 6, 5,  TRUE);

-- ============================================================
-- CITIES — البحر الأحمر (Red Sea) — parent_id = 7
-- ============================================================
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الغردقة',         'Hurghada',          'CITY', 7, 1,  TRUE),
('سفاجا',           'Safaga',            'CITY', 7, 2,  TRUE),
('مرسى علم',        'Marsa Alam',        'CITY', 7, 3,  TRUE),
('القصير',          'El Quseir',         'CITY', 7, 4,  TRUE);

-- ============================================================
-- DISTRICTS — مدينة نصر (Nasr City)
-- ============================================================
-- First, let's verify the city IDs by querying after inserts.
-- IDs are autoincrement starting from 8 (after 7 governorates):
-- Cairo cities: 8-17, Giza cities: 18-26, Alex cities: 27-35
-- Qalyubia: 36-40, Sharqia: 41-45, Dakahlia: 46-50, Red Sea: 51-54

-- مدينة نصر = 8
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الحي الأول',       '1st District',       'DISTRICT', 8, 1, TRUE),
('الحي السابع',      '7th District',       'DISTRICT', 8, 2, TRUE),
('الحي الثامن',      '8th District',       'DISTRICT', 8, 3, TRUE),
('الحي العاشر',      '10th District',      'DISTRICT', 8, 4, TRUE),
('المنطقة التاسعة',  '9th Zone',           'DISTRICT', 8, 5, TRUE);

-- المعادي = 9
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('المعادي الجديدة',  'New Maadi',          'DISTRICT', 9, 1, TRUE),
('دجلة',            'Degla',              'DISTRICT', 9, 2, TRUE),
('زهراء المعادي',    'Zahraa El Maadi',    'DISTRICT', 9, 3, TRUE),
('المعادي القديمة',  'Old Maadi',          'DISTRICT', 9, 4, TRUE);

-- مصر الجديدة = 10
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('ألماظة',          'Almaza',             'DISTRICT', 10, 1, TRUE),
('روكسي',           'Roxy',               'DISTRICT', 10, 2, TRUE),
('النزهة',          'El Nozha',           'DISTRICT', 10, 3, TRUE),
('ميدان الحجاز',    'Hegaz Square',       'DISTRICT', 10, 4, TRUE);

-- التجمع الخامس = 11
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('النرجس',          'Narges',             'DISTRICT', 11, 1, TRUE),
('اللوتس',          'Lotus',              'DISTRICT', 11, 2, TRUE),
('الياسمين',        'Yasmin',             'DISTRICT', 11, 3, TRUE),
('البنفسج',         'Banafseg',           'DISTRICT', 11, 4, TRUE),
('الأندلس',         'Andalus',            'DISTRICT', 11, 5, TRUE);

-- 6 أكتوبر = 18
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الحي الأول',       '1st District',       'DISTRICT', 18, 1, TRUE),
('الحي الثاني',      '2nd District',       'DISTRICT', 18, 2, TRUE),
('الحي السادس',      '6th District',       'DISTRICT', 18, 3, TRUE),
('الحي الحادي عشر',  '11th District',      'DISTRICT', 18, 4, TRUE),
('المحور المركزي',   'Central Axis',       'DISTRICT', 18, 5, TRUE);

-- الشيخ زايد = 19
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الحي الأول',       '1st District',       'DISTRICT', 19, 1, TRUE),
('الحي الثاني',      '2nd District',       'DISTRICT', 19, 2, TRUE),
('الحي الرابع',      '4th District',       'DISTRICT', 19, 3, TRUE),
('الحي الثامن',      '8th District',       'DISTRICT', 19, 4, TRUE);

-- سموحة = 29
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('سموحة الرئيسية',  'Smouha Main',        'DISTRICT', 29, 1, TRUE),
('فيكتوريا',        'Victoria',           'DISTRICT', 29, 2, TRUE),
('جناكليس',         'Gianaclis',          'DISTRICT', 29, 3, TRUE);

-- الغردقة = 51
INSERT INTO `locations` (`name_ar`, `name_en`, `type`, `parent_id`, `sort_order`, `is_active`) VALUES
('الدهار',          'Dahar',              'DISTRICT', 51, 1, TRUE),
('سهل حشيش',        'Sahl Hasheesh',      'DISTRICT', 51, 2, TRUE),
('الجونة',          'El Gouna',           'DISTRICT', 51, 3, TRUE);
