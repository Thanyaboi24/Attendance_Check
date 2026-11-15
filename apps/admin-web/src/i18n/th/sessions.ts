import type en from '../en/sessions';
import type { Messages } from '../types';

export default {
  title: 'รอบการลงเวลา',
  subtitle: 'เวลาทั้งหมดเป็นเวลากรุงเทพฯ (Asia/Bangkok)',
  rangeInvalid: 'วันที่ “ตั้งแต่” ต้องไม่อยู่หลังวันที่ “ถึง”',
  empty: 'ไม่พบรอบการลงเวลาที่ตรงกับตัวกรอง',
  col: {
    staff: 'บุคลากร',
    department: 'หน่วยงาน',
    date: 'วันที่',
    checkIn: 'ลงเวลาเข้า',
    checkOut: 'ลงเวลาออก',
    status: 'สถานะ',
  },
  corrected: 'แก้ไขแล้ว',
  edit: {
    title: 'แก้ไขรอบการลงเวลา — {{name}}',
    save: 'บันทึกการแก้ไข',
    intro: 'กรอกเวลาตามเวลากรุงเทพฯ (UTC+7) ระบบจะทำเครื่องหมายว่าแก้ไขแล้วและบันทึกไว้ในบันทึกการตรวจสอบ',
    checkIn: 'ลงเวลาเข้า',
    checkOut: 'ลงเวลาออก',
    keepOpen: '(เว้นว่างไว้หากยังไม่ลงเวลาออก)',
    date: 'วันที่',
    time: 'เวลา',
    checkInDate: 'วันที่ลงเวลาเข้า',
    checkInTime: 'เวลาลงเวลาเข้า',
    checkOutDate: 'วันที่ลงเวลาออก',
    checkOutTime: 'เวลาลงเวลาออก',
    reasonLabel: 'เหตุผล (จำเป็น)',
    reasonAria: 'เหตุผล',
  },
  validation: {
    required: 'จำเป็นต้องกรอก',
    reasonRequired: 'โปรดระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)',
    enterCheckIn: 'โปรดกรอกวันที่และเวลาลงเวลาเข้า',
    enterBoth: 'โปรดกรอกทั้งวันที่และเวลา',
    needsCheckOut: 'รอบการลงเวลาที่ครบถ้วนแล้วต้องมีเวลาลงเวลาออก',
    outBeforeIn: 'เวลาลงเวลาออกต้องไม่ก่อนเวลาลงเวลาเข้า',
    nothingToChange: 'ไม่มีข้อมูลที่เปลี่ยนแปลง',
  },
} satisfies Messages<typeof en>;
