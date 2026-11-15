import type en from '../en/dashboard';
import type { Messages } from '../types';

export default {
  title: 'ภาพรวม',
  today: 'วันนี้ (เวลากรุงเทพฯ): {{date}}',
  cards: {
    activeStaff: { label: 'บุคลากรที่ใช้งานอยู่', hint: 'บัญชีที่มีสถานะใช้งานอยู่' },
    checkedInNow: { label: 'ลงเวลาเข้าแล้วขณะนี้', hint: 'รอบการลงเวลาที่ยังไม่ลงเวลาออก' },
    checkedInToday: { label: 'ลงเวลาเข้าวันนี้', hint: 'บุคลากรที่มีรอบการลงเวลาวันนี้' },
    automaticActionsToday: { label: 'ลงเวลาอัตโนมัติวันนี้', hint: 'อนุมัติหลังสิ้นสุดระยะเวลาผ่อนผัน' },
    manualActionsToday: { label: 'ยืนยันเองวันนี้', hint: 'ยืนยันจากการแจ้งเตือน' },
    unresolvedRequests: { label: 'คำขอที่สรุปผลไม่ได้', hint: 'ต้องตรวจสอบ' },
    pendingCorrections: { label: 'คำขอแก้ไขเวลาที่รอการตรวจสอบ', hint: 'รอการตัดสินใจ' },
    longOpenSessions: { label: 'รอบที่ไม่ลงเวลาออกนานผิดปกติ', hint: 'รอบการลงเวลาที่เปิดค้างนานผิดปกติ' },
  },
} satisfies Messages<typeof en>;
