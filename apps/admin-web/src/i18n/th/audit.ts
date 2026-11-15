import type en from '../en/audit';
import type { Messages } from '../types';

export default {
  title: 'บันทึกการตรวจสอบ',
  subtitle: 'การเปลี่ยนแปลงทั้งหมดโดยผู้ดูแล พร้อมค่าก่อนและหลังการเปลี่ยนแปลง',
  filters: {
    entityType: 'ประเภทข้อมูล',
    action: 'การดำเนินการ',
    entityId: 'รหัสข้อมูล',
  },
  empty: 'ไม่พบบันทึกที่ตรงกับตัวกรอง',
  col: {
    time: 'เวลา',
    actor: 'ผู้ดำเนินการ',
    action: 'การดำเนินการ',
    entity: 'ข้อมูล',
    reason: 'เหตุผล',
  },
  showValues: 'แสดงค่า',
  hideValues: 'ซ่อนค่า',
  previousValues: 'ค่าก่อนเปลี่ยนแปลง',
  newValues: 'ค่าใหม่',
} satisfies Messages<typeof en>;
