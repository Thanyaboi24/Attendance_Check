import { csvField, toCsv } from '../src/admin/csv';

describe('CSV helpers', () => {
  it('quotes separators and quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe('');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+1')).toBe("'+1");
  });

  it('writes a UTF-8 BOM and CRLF rows (Thai names open correctly in Excel)', () => {
    const out = toCsv(['name'], [['สมชาย']]);
    expect(out.startsWith('﻿name\r\nสมชาย\r\n')).toBe(true);
  });
});
