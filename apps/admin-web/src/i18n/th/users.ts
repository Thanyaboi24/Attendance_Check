import type en from '../en/users';
import type { Messages } from '../types';

export default {
  title: 'ผู้ใช้งาน',
  subtitle: 'บัญชีของบุคลากรและผู้ดูแล',
  newUser: 'เพิ่มผู้ใช้งาน',
  empty: 'ไม่พบผู้ใช้งานที่ตรงกับตัวกรอง',
  col: {
    name: 'ชื่อ',
    email: 'อีเมล',
    department: 'หน่วยงาน',
    role: 'บทบาท',
    status: 'สถานะ',
    lastSignIn: 'เข้าสู่ระบบล่าสุด',
  },
  actions: {
    resendActivation: 'ส่งอีเมลเปิดใช้งานอีกครั้ง',
    activate: 'เปิดใช้งาน',
    deactivate: 'ปิดใช้งาน',
    resend: 'ส่งอีกครั้ง',
    cannotDeactivateSelf: 'คุณไม่สามารถปิดใช้งานบัญชีของตนเองได้',
    reviewSignup: 'คำขอลงทะเบียน',
  },
  flash: {
    statusChanged: 'สถานะของ {{name}} เปลี่ยนเป็น “{{status}}” แล้ว',
    activationResent: 'ส่งอีเมลเปิดใช้งานไปยัง {{email}} อีกครั้งแล้ว',
    created: 'สร้างบัญชีสำหรับ {{name}} แล้ว และส่งอีเมลเปิดใช้งานไปยัง {{email}} แล้ว',
    saved: 'บันทึกการเปลี่ยนแปลงของ {{name}} แล้ว',
  },
  confirm: {
    deactivateTitle: 'ปิดใช้งานบัญชีหรือไม่?',
    activateTitle: 'เปิดใช้งานบัญชีหรือไม่?',
    deactivateBody: '{{name}} จะถูกออกจากระบบในทุกอุปกรณ์ และจะไม่สามารถเข้าสู่ระบบหรือลงเวลาได้อีก',
    activateBody: '{{name}} จะสามารถเข้าสู่ระบบได้อีกครั้ง',
    resendTitle: 'ส่งอีเมลเปิดใช้งานอีกครั้งหรือไม่?',
    resendBody: 'ระบบจะส่งลิงก์เปิดใช้งานใหม่ (ใช้ได้ 24 ชั่วโมง) ไปยัง {{email}}',
  },
  form: {
    newTitle: 'เพิ่มผู้ใช้งาน',
    editTitle: 'แก้ไข {{name}}',
    create: 'สร้างและส่งอีเมลเปิดใช้งาน',
    staffId: 'รหัสบุคลากร',
    email: 'อีเมลของสถาบัน',
    fullName: 'ชื่อ-นามสกุล',
    department: 'หน่วยงาน',
    role: 'บทบาท',
    emailAndStaffId: 'อีเมล / รหัสบุคลากร',
    cannotChangeOwnRole: 'คุณไม่สามารถเปลี่ยนบทบาทของตนเองได้',
  },
  validation: {
    staffId: 'โปรดกรอกรหัสบุคลากร',
    fullName: 'โปรดกรอกชื่อ-นามสกุล',
    department: 'โปรดกรอกหน่วยงาน',
  },
} satisfies Messages<typeof en>;
