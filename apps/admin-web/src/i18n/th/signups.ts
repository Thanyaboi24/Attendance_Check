import type en from '../en/signups';
import type { Messages } from '../types';

export default {
  title: 'คำขอลงทะเบียน',
  subtitle: 'บุคลากรที่ลงทะเบียนจากแอปมือถือ จะเข้าสู่ระบบได้เมื่อผู้ดูแลอนุมัติคำขอแล้ว',
  tabs: {
    label: 'สถานะคำขอ',
    PENDING_APPROVAL: 'รออนุมัติ',
    ACTIVE: 'อนุมัติแล้ว',
    REJECTED: 'ไม่อนุมัติ',
  },
  searchPlaceholder: 'ชื่อ รหัสบุคลากร อีเมล หรือหน่วยงาน',
  emptyPending: 'ไม่มีคำขอลงทะเบียนที่รออนุมัติ',
  emptyPendingHint: 'คำขอใหม่จากแอปมือถือจะแสดงที่นี่',
  empty: 'ไม่พบคำขอลงทะเบียน',
  col: {
    name: 'ชื่อ',
    staffId: 'รหัสบุคลากร',
    email: 'อีเมล',
    department: 'หน่วยงาน',
    submitted: 'ส่งเมื่อ',
    reviewedBy: 'ผู้พิจารณา',
    reviewedAt: 'พิจารณาเมื่อ',
    note: 'หมายเหตุ',
    reason: 'เหตุผล',
  },
  actions: {
    approve: 'อนุมัติ',
    reject: 'ไม่อนุมัติ',
    approveAria: 'อนุมัติ {{name}}',
    rejectAria: 'ไม่อนุมัติ {{name}}',
  },
  approve: {
    title: 'อนุมัติคำขอลงทะเบียนหรือไม่?',
    body: '{{name}} ({{email}}) จะสามารถเข้าสู่ระบบในแอปมือถือและลงเวลาได้',
    noteLabel: 'หมายเหตุถึงบุคลากร (ไม่บังคับ)',
  },
  reject: {
    title: 'ไม่อนุมัติคำขอลงทะเบียน',
    body: '{{name}} ({{email}}) จะไม่สามารถเข้าสู่ระบบได้ และสามารถลงทะเบียนใหม่ภายหลังได้',
    reasonLabel: 'เหตุผล (จำเป็น และจะส่งถึงบุคลากร)',
  },
  flash: {
    approved: 'อนุมัติคำขอลงทะเบียนของ {{name}} แล้ว',
    rejected: 'ไม่อนุมัติคำขอลงทะเบียนของ {{name}} แล้ว',
    alreadyReviewed: 'คำขอลงทะเบียนของ {{name}} ได้รับการพิจารณาโดยผู้ดูแลคนอื่นแล้ว และรีเฟรชรายการแล้ว',
  },
  validation: {
    reasonRequired: 'โปรดระบุเหตุผล',
  },
} satisfies Messages<typeof en>;
