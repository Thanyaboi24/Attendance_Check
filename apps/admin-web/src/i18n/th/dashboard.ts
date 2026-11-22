import type en from '../en/dashboard';
import type { Messages } from '../types';

export default {
  title: 'ภาพรวม',
  today: 'วันนี้ (เวลากรุงเทพฯ): {{date}}',
  greeting: {
    morning: 'อรุณสวัสดิ์ คุณ{{name}}',
    afternoon: 'สวัสดีตอนบ่าย คุณ{{name}}',
    evening: 'สวัสดีตอนเย็น คุณ{{name}}',
  },
  bangkokTime: 'เวลากรุงเทพฯ',
  live: 'อัปเดตอัตโนมัติ',
  updated: 'ล่าสุด {{time}} น.',
  refresh: 'รีเฟรช',
  holiday: {
    today: 'วันนี้เป็นวันหยุด: {{name}} — ปิดการลงเวลาเข้า',
    next_one: 'วันหยุดถัดไป: {{name}} {{date}} (อีก {{count}} วัน)',
    next_other: 'วันหยุดถัดไป: {{name}} {{date}} (อีก {{count}} วัน)',
    link: 'ปฏิทินวันหยุด',
  },
  presence: {
    title: 'อยู่ในพื้นที่ขณะนี้',
    ring: 'ลงเวลาเข้าแล้ว {{now}} จาก {{total}} คน',
    share: '{{percent}}% ของบุคลากรที่ใช้งานอยู่',
    nobody: 'ขณะนี้ยังไม่มีผู้ลงเวลาเข้า',
  },
  todayProgress: 'วันนี้ลงเวลาเข้าแล้ว {{percent}}% ของบุคลากรที่ใช้งานอยู่',
  activity: {
    title: 'การลงเวลาวันนี้',
    subtitle: 'การลงเวลาเข้าและออกที่อนุมัติแล้ว',
    total_one: 'รายการ',
    total_other: 'รายการ',
    automatic: 'อัตโนมัติ',
    manual: 'ยืนยันเอง',
    empty: 'วันนี้ยังไม่มีการลงเวลาเข้าหรือออกที่อนุมัติ',
    split: 'อัตโนมัติ {{auto}} รายการ ยืนยันเอง {{manual}} รายการ',
  },
  attention: {
    title: 'ต้องดำเนินการ',
    allClear: 'ไม่มีรายการค้าง',
    allClearHint: 'ไม่มีรายการที่รอการตรวจสอบ',
    open: 'เปิด',
  },
  cards: {
    activeStaff: { label: 'บุคลากรที่ใช้งานอยู่', hint: 'บัญชีที่มีสถานะใช้งานอยู่' },
    checkedInNow: { label: 'ลงเวลาเข้าแล้วขณะนี้', hint: 'รอบการลงเวลาที่ยังไม่ลงเวลาออก' },
    checkedInToday: { label: 'ลงเวลาเข้าวันนี้', hint: 'บุคลากรที่มีรอบการลงเวลาวันนี้' },
    automaticActionsToday: { label: 'ลงเวลาอัตโนมัติวันนี้', hint: 'อนุมัติหลังสิ้นสุดระยะเวลาผ่อนผัน' },
    manualActionsToday: { label: 'ยืนยันเองวันนี้', hint: 'ยืนยันจากการแจ้งเตือน' },
    unresolvedRequests: { label: 'คำขอที่สรุปผลไม่ได้', hint: 'ต้องตรวจสอบ' },
    pendingCorrections: { label: 'คำขอแก้ไขเวลาที่รอการตรวจสอบ', hint: 'รอการตัดสินใจ' },
    longOpenSessions: { label: 'รอบที่ไม่ลงเวลาออกนานผิดปกติ', hint: 'รอบการลงเวลาที่เปิดค้างนานผิดปกติ' },
    pendingSignups: { label: 'คำขอลงทะเบียน', hint: 'บัญชีบุคลากรใหม่ที่รออนุมัติ' },
  },
} satisfies Messages<typeof en>;
