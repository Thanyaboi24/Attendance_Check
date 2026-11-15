import type en from '../en/reports';
import type { Messages } from '../types';

export default {
  title: 'รายงาน',
  subtitle: 'ส่งออกเป็นไฟล์ CSV วันที่และเวลาเป็นเวลากรุงเทพฯ',
  departmentOptional: 'หน่วยงาน (รายงานการลงเวลา ไม่บังคับ)',
  invalidRange: 'โปรดเลือกช่วงวันที่ที่ถูกต้อง (วันที่ “ตั้งแต่” ต้องไม่อยู่หลังวันที่ “ถึง”)',
  preparing: 'กำลังเตรียมไฟล์…',
  csvNote: 'หัวคอลัมน์และค่าในไฟล์ CSV เป็นภาษาอังกฤษ',
  attendance: {
    title: 'รายงานการลงเวลา',
    description: 'หนึ่งแถวต่อหนึ่งรอบการลงเวลา: บุคลากร เวลาและวิธีลงเวลาเข้า/ออก และการแก้ไข',
    download: 'ดาวน์โหลด attendance.csv',
  },
  evaluation: {
    title: 'รายงานการประเมินผล',
    description:
      'หนึ่งแถวต่อหนึ่งคำขอลงเวลา พร้อมเวลาทุกขั้นตอน อุปกรณ์ เวอร์ชันการตั้งค่า ระยะห่าง และผลการจำแนกตำแหน่ง (ตัวชี้วัดตาม DS2 บทที่ 3)',
    download: 'ดาวน์โหลด evaluation.csv',
  },
} satisfies Messages<typeof en>;
