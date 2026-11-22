import type en from '../en/holidays';
import type { Messages } from '../types';

export default {
  title: 'วันหยุด',
  subtitle: 'วันหยุดนักขัตฤกษ์และวันหยุดของมหาวิทยาลัย',
  add: 'เพิ่มวันหยุด',
  info: {
    title: 'ไม่มีการลงเวลาเข้าในวันเหล่านี้',
    body: 'ในวันเหล่านี้บุคลากรไม่ต้องมาปฏิบัติงาน แอปจะปิดการลงเวลาเข้า ส่วนการลงเวลาออกยังทำได้ตามปกติ',
  },
  year: {
    label: 'ปี',
    previous: 'ปีก่อนหน้า',
    next: 'ปีถัดไป',
    thisYear: 'ปีนี้',
    count_one: 'วันหยุด {{count}} วันในปี {{year}}',
    count_other: 'วันหยุด {{count}} วันในปี {{year}}',
  },
  month: {
    count_one: '{{count}} วัน',
    count_other: '{{count}} วัน',
  },
  empty: 'ยังไม่มีวันหยุดในปี {{year}}',
  emptyHint: 'ใช้ “เพิ่มวันหยุด” เพื่อบันทึกวันหยุดตามประกาศคณะรัฐมนตรีหรือวันหยุดของมหาวิทยาลัย',
  status: {
    today: 'วันนี้',
    next: 'วันหยุดถัดไป',
    past: 'ผ่านไปแล้ว',
  },
  actions: {
    edit: 'แก้ไข',
    editAria: 'แก้ไข {{name}}',
    delete: 'ลบ',
    deleteAria: 'ลบ {{name}}',
  },
  form: {
    addTitle: 'เพิ่มวันหยุด',
    editTitle: 'แก้ไขวันหยุด',
    date: 'วันที่',
    type: 'ประเภท',
    nameEn: 'ชื่อภาษาอังกฤษ',
    nameTh: 'ชื่อภาษาไทย',
    note: 'หมายเหตุ (ไม่บังคับ)',
    notePlaceholder: 'เช่น แหล่งที่มาของประกาศ',
    add: 'เพิ่มวันหยุด',
    save: 'บันทึกการแก้ไข',
  },
  validation: {
    date: 'โปรดเลือกวันที่',
    nameEn: 'โปรดกรอกชื่อภาษาอังกฤษ',
    nameTh: 'โปรดกรอกชื่อภาษาไทย',
    dateTaken: 'วันที่นี้มีวันหยุดอยู่แล้ว: {{name}} โปรดแก้ไขรายการเดิมหรือเลือกวันอื่น',
  },
  confirm: {
    deleteTitle: 'ลบวันหยุดนี้หรือไม่',
    deleteBody: 'ลบ “{{name}}” วันที่ {{date}} หรือไม่ เมื่อลบแล้วจะลงเวลาเข้าในวันนั้นได้ตามปกติ',
  },
  flash: {
    added: 'เพิ่ม “{{name}}” วันที่ {{date}} แล้ว',
    saved: 'บันทึก “{{name}}” แล้ว',
    deleted: 'ลบ “{{name}}” แล้ว',
  },
} satisfies Messages<typeof en>;
