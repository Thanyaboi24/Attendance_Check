import type en from '../en/calendar';
import type { Messages } from '../types';

export default {
  title: 'ปฏิทินวันหยุด',
  subtitle: 'วันหยุดนักขัตฤกษ์และวันหยุดของมหาวิทยาลัย ในวันดังกล่าวจะปิดการลงเวลาเข้า',
  previous: 'เดือนก่อนหน้า',
  next: 'เดือนถัดไป',
  today: 'วันนี้',
  legend: {
    holiday: 'วันหยุด',
    weekend: 'เสาร์-อาทิตย์',
    today: 'วันนี้',
  },
  type: {
    PUBLIC: 'วันหยุดนักขัตฤกษ์',
    SUBSTITUTE: 'วันหยุดชดเชย',
    GOVERNMENT: 'วันหยุดราชการ',
    SPECIAL: 'วันหยุดพิเศษ',
    UNIVERSITY: 'วันหยุดของมหาวิทยาลัย',
  },
  kind: {
    HOLIDAY: 'วันหยุด',
    WEEKEND: 'วันหยุดสุดสัปดาห์',
    WORKING: 'วันทำงาน',
  },
  checkInClosed: 'ปิดการลงเวลาเข้า',
  checkInOpen: 'ลงเวลาเข้าได้',
  holidayDetail: 'ไม่ต้องมาปฏิบัติงาน ปิดการลงเวลาเข้าทั้งแบบอัตโนมัติและแบบยืนยันเองตลอดวัน',
  weekendDetail: 'วันนี้ไม่ใช่วันหยุดในปฏิทิน หากมาปฏิบัติงานสามารถลงเวลาเข้าได้ตามปกติ',
  workingDetail: 'วันทำงานปกติ ลงเวลาเข้าได้ตามปกติ',
  monthHolidays: 'วันหยุดในเดือนนี้',
  noHolidays: 'เดือนนี้ไม่มีวันหยุด',
  upcoming: 'วันหยุดถัดไป',
  noUpcoming: 'ยังไม่มีวันหยุดที่จะมาถึงในปฏิทิน',
  isToday: 'วันนี้',
  tomorrow: 'พรุ่งนี้',
  inDays_one: 'อีก {{count}} วัน',
  inDays_other: 'อีก {{count}} วัน',
  offline: 'ออฟไลน์: แสดงปฏิทินที่บันทึกไว้ (ดาวน์โหลดเมื่อ {{time}})',
  offlineNever: 'ออฟไลน์: ยังไม่ได้ดาวน์โหลดปฏิทินวันหยุด',
  loading: 'กำลังโหลดวันหยุด…',
  dayA11y: '{{date}}, {{status}}',
} satisfies Messages<typeof en>;
