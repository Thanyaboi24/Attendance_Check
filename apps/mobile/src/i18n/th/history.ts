import type en from '../en/history';
import type { Messages } from '../types';

export default {
  status: { COMPLETED: 'ครบถ้วน', OPEN: 'ยังไม่ลงเวลาออก', NEEDS_REVIEW: 'ต้องตรวจสอบ', CORRECTED: 'แก้ไขแล้ว' },
  method: { MANUAL: 'ยืนยันเอง', AUTOMATIC: 'อัตโนมัติ', ADMIN_CORRECTED: 'แก้ไขโดยผู้ดูแล' },
  allMethods: 'ทุกวิธี',
  range: { THIS_WEEK: 'สัปดาห์นี้', LAST_7: '7 วันที่ผ่านมา', LAST_30: '30 วันที่ผ่านมา' },
  cell: { notYet: 'ยังไม่มี', unresolved: 'ไม่สามารถสรุปผลได้', missing: 'ไม่มีข้อมูล' },
  title: 'ประวัติการลงเวลา',
  offline: 'ออฟไลน์: ประวัติโหลดจากเซิร์ฟเวอร์เท่านั้น',
  loadFailed: 'ไม่สามารถโหลดประวัติได้',
  loading: 'กำลังโหลด…',
  empty: 'ไม่มีการลงเวลาในช่วงนี้',
  in: 'เข้า',
  out: 'ออก',
  requestCorrection: 'ขอแก้ไขเวลา',
  worked: 'ทำงาน {{duration}}',
} satisfies Messages<typeof en>;
