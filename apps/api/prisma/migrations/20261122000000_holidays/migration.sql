-- Holiday calendar: check-in is closed on these Bangkok dates (check-out stays open).
CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'SUBSTITUTE', 'GOVERNMENT', 'SPECIAL', 'UNIVERSITY');

CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- Thai public holidays 2026 (timeanddate.com and officeholidays.com agree; government holidays are included
-- because SIIT is part of a public university) and 2027 (one source only, marked preliminary). Regional and
-- Bangkok-only days are not included. Administrators edit the calendar on the admin website (Holidays page).
INSERT INTO "Holiday" ("id", "date", "nameEn", "nameTh", "type", "note", "updatedAt") VALUES
  (gen_random_uuid()::text, DATE '2026-01-01', 'New Year''s Day', 'วันขึ้นปีใหม่', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-01-02', 'New Year special holiday', 'วันหยุดพิเศษ (ปีใหม่)', 'SPECIAL', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-03-03', 'Makha Bucha Day', 'วันมาฆบูชา', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-04-06', 'Chakri Memorial Day', 'วันจักรี', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-04-13', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-04-14', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-04-15', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-05-01', 'National Labour Day', 'วันแรงงานแห่งชาติ', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-05-04', 'Coronation Day', 'วันฉัตรมงคล', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-05-13', 'Royal Ploughing Ceremony Day', 'วันพืชมงคล', 'GOVERNMENT', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-05-31', 'Visakha Bucha Day', 'วันวิสาขบูชา', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-06-01', 'Substitution day for Visakha Bucha Day', 'วันหยุดชดเชยวันวิสาขบูชา', 'SUBSTITUTE', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-06-03', 'H.M. Queen Suthida''s Birthday', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-07-28', 'H.M. King Vajiralongkorn''s Birthday', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-07-29', 'Asarnha Bucha Day', 'วันอาสาฬหบูชา', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-07-30', 'Buddhist Lent Day (Khao Phansa)', 'วันเข้าพรรษา', 'GOVERNMENT', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-08-12', 'The Queen Mother''s Birthday and National Mother''s Day', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง และวันแม่แห่งชาติ', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-10-13', 'King Bhumibol Adulyadej Memorial Day', 'วันนวมินทรมหาราช', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-10-23', 'King Chulalongkorn Memorial Day', 'วันปิยมหาราช', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-12-05', 'King Bhumibol''s Birthday, National Day and National Father''s Day', 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-12-07', 'Substitution day for National Father''s Day', 'วันหยุดชดเชยวันพ่อแห่งชาติ', 'SUBSTITUTE', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-12-10', 'Constitution Day', 'วันรัฐธรรมนูญ', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-12-16', 'Royal Cremation Ceremony of Queen Sirikit', 'วันพระราชพิธีถวายพระเพลิงพระบรมศพ สมเด็จพระนางเจ้าสิริกิติ์ พระบรมราชินีนาถ พระบรมราชชนนีพันปีหลวง', 'SPECIAL', NULL, now()),
  (gen_random_uuid()::text, DATE '2026-12-31', 'New Year''s Eve', 'วันสิ้นปี', 'PUBLIC', NULL, now()),
  (gen_random_uuid()::text, DATE '2027-01-01', 'New Year''s Day', 'วันขึ้นปีใหม่', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-02-21', 'Makha Bucha Day', 'วันมาฆบูชา', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-02-22', 'Substitution day for Makha Bucha Day', 'วันหยุดชดเชยวันมาฆบูชา', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-04-06', 'Chakri Memorial Day', 'วันจักรี', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-04-13', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-04-14', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-04-15', 'Songkran Festival', 'วันสงกรานต์', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-05-01', 'National Labour Day', 'วันแรงงานแห่งชาติ', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-05-03', 'Substitution day for National Labour Day', 'วันหยุดชดเชยวันแรงงานแห่งชาติ', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-05-04', 'Coronation Day', 'วันฉัตรมงคล', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-05-20', 'Visakha Bucha Day', 'วันวิสาขบูชา', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-06-03', 'H.M. Queen Suthida''s Birthday', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-07-18', 'Asarnha Bucha Day', 'วันอาสาฬหบูชา', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-07-19', 'Substitution day for Asarnha Bucha Day', 'วันหยุดชดเชยวันอาสาฬหบูชา', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-07-28', 'H.M. King Vajiralongkorn''s Birthday', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-08-12', 'The Queen Mother''s Birthday and National Mother''s Day', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง และวันแม่แห่งชาติ', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-10-13', 'King Bhumibol Adulyadej Memorial Day', 'วันนวมินทรมหาราช', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-10-23', 'King Chulalongkorn Memorial Day', 'วันปิยมหาราช', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-10-25', 'Substitution day for King Chulalongkorn Memorial Day', 'วันหยุดชดเชยวันปิยมหาราช', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-12-05', 'King Bhumibol''s Birthday, National Day and National Father''s Day', 'วันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-12-06', 'Substitution day for National Father''s Day', 'วันหยุดชดเชยวันพ่อแห่งชาติ', 'SUBSTITUTE', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-12-10', 'Constitution Day', 'วันรัฐธรรมนูญ', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now()),
  (gen_random_uuid()::text, DATE '2027-12-31', 'New Year''s Eve', 'วันสิ้นปี', 'PUBLIC', 'Preliminary: check the Cabinet announcement / Royal Gazette for 2027', now())
ON CONFLICT ("date") DO NOTHING;
