import type en from '../en/settings';
import type { Messages } from '../types';

export default {
  language: {
    title: 'ภาษา / Language',
    a11y: 'ภาษาของแอป',
  },
  account: {
    signedIn: 'เข้าสู่ระบบแล้ว',
  },
  permissions: {
    title: 'สิทธิ์การเข้าถึงและการติดตามตำแหน่ง',
    active: 'การติดตามตำแหน่งทำงานอยู่',
    limited: 'การติดตามตำแหน่งทำงานได้ไม่ครบ — แตะเพื่อตรวจสอบ',
  },
  sync: {
    title: 'ซิงก์ข้อมูลตอนนี้',
    summary: 'รอส่ง {{pending}} รายการ · ไม่สำเร็จ {{failed}} รายการ',
  },
  evaluation: {
    title: 'บันทึกสำหรับการประเมินผล',
    subtitle: 'เวลาของทุกการตรวจจับ การแจ้งเตือน การอ่านตำแหน่ง และการตัดสินใจ',
    requestsCsv: 'คำขอ (CSV)',
    eventsCsv: 'เหตุการณ์ (CSV)',
    json: 'JSON',
  },
  about: {
    title: 'เกี่ยวกับแอป',
    version: 'เวอร์ชัน {{version}} ({{build}}) · {{variant}}',
    api: 'API: {{url}}',
    area: 'พื้นที่: {{text}}',
    areaSummary: '{{name}} v{{version}}, ระยะเวลาผ่อนผัน {{grace}} วินาที',
    zone: '· {{name}}: รัศมี {{radius}} ม.',
    notLoaded: 'ยังไม่ได้โหลด',
    lastSync: 'ซิงก์กับเซิร์ฟเวอร์ล่าสุด: {{time}}',
    scheduler: 'ตัวจัดตารางงานเบื้องหลัง: {{value}}',
    schedulerAvailable: 'พร้อมใช้งาน',
    schedulerMissing: 'ไม่มีในแอปรุ่นนี้',
    maps: 'Google Maps: {{value}}',
    mapsConfigured: 'ตั้งค่าแล้ว',
    mapsMissing: 'ยังไม่ได้ตั้งค่า (แสดงเป็นข้อความแทน)',
  },
  signOut: {
    button: 'ออกจากระบบ',
    title: 'ออกจากระบบหรือไม่?',
    stopsMonitoring: 'การออกจากระบบจะหยุดการติดตามตำแหน่งบนโทรศัพท์เครื่องนี้',
    openSession: 'คุณลงเวลาเข้าตั้งแต่ {{time}} รอบการลงเวลาจะยังค้างอยู่ และระบบจะไม่ลงเวลาออกให้อัตโนมัติ',
    pendingRequest: 'คำขอลงเวลาเข้า/ลงเวลาออกที่รอยืนยันอยู่จะไม่ถูกดำเนินการให้อัตโนมัติ',
    unsynced_one: 'มี {{count}} รายการที่ยังไม่ได้ซิงก์ข้อมูล แอปจะพยายามส่งตอนนี้ รายการที่ส่งไม่ได้จะถูกลบทิ้ง',
    unsynced_other: 'มี {{count}} รายการที่ยังไม่ได้ซิงก์ข้อมูล แอปจะพยายามส่งตอนนี้ รายการที่ส่งไม่ได้จะถูกลบทิ้ง',
    stay: 'อยู่ในระบบต่อ',
    confirm: 'ออกจากระบบ',
  },
} satisfies Messages<typeof en>;
