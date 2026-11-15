import type en from '../en/errors';
import type { Messages } from '../types';

export default {
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  networkUnavailable: 'ไม่มีการเชื่อมต่อเครือข่าย',
  signInAgain: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  generic: 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง',
  validation: {
    email: 'กรุณากรอกอีเมลให้ถูกต้อง',
    passwordRequired: 'กรุณากรอกรหัสผ่าน',
    passwordMin: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
    passwordLetter: 'รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษอย่างน้อยหนึ่งตัว',
    passwordDigit: 'รหัสผ่านต้องมีตัวเลขอย่างน้อยหนึ่งตัว',
    staffIdRequired: 'กรุณากรอกรหัสบุคลากร',
    fullNameRequired: 'กรุณากรอกชื่อ-นามสกุล',
    departmentRequired: 'กรุณากรอกหน่วยงาน',
    invalidInput: 'ข้อมูลไม่ถูกต้อง',
  },
} satisfies Messages<typeof en>;
