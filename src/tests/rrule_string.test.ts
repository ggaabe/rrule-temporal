import {RRuleTemporal} from '../index';
import {assertDates, parse, zdt} from './helpers';

describe('String parsing tests', () => {
  it('testStr', () => {
    const rruleString = 'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=3';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T09:00:00.000Z',
      '1998-09-02T09:00:00.000Z',
      '1999-09-02T09:00:00.000Z',
    ]);
  });

  it('testStrWithTZID', () => {
    const rruleString = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=3';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T13:00:00.000Z',
      '1998-09-02T13:00:00.000Z',
      '1999-09-02T13:00:00.000Z',
    ]);
  });

  it('testStrType', () => {
    const rruleString = 'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=3';
    expect(parse(rruleString)).toBeInstanceOf(RRuleTemporal);
  });

  it('testStrCase', () => {
    const rruleString = 'dtstart:19970902T090000\nrrule:freq=yearly;count=3';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T09:00:00.000Z',
      '1998-09-02T09:00:00.000Z',
      '1999-09-02T09:00:00.000Z',
    ]);
  });

  it('testStrSpaces', () => {
    const rruleString = ' DTSTART:19970902T090000  RRULE:FREQ=YEARLY;COUNT=3 ';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T09:00:00.000Z',
      '1998-09-02T09:00:00.000Z',
      '1999-09-02T09:00:00.000Z',
    ]);
  });

  it('testStrSpacesAndLines', () => {
    const rruleString = ' DTSTART:19970902T090000 \n \n RRULE:FREQ=YEARLY;COUNT=3 \n';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T09:00:00.000Z',
      '1998-09-02T09:00:00.000Z',
      '1999-09-02T09:00:00.000Z',
    ]);
  });

  it('testStrKeywords', () => {
    const rruleString =
      'DTSTART:19970902T090000\n' +
      'RRULE:FREQ=YEARLY;COUNT=3;INTERVAL=3;' +
      'BYMONTH=3;BYWEEKDAY=TH;BYMONTHDAY=3;' +
      'BYHOUR=3;BYMINUTE=3;BYSECOND=3\n';
    const rule = parse(rruleString);
    assertDates({rule}, ['2000-03-03T03:03:03.000Z', '2003-03-03T03:03:03.000Z', '2006-03-03T03:03:03.000Z']);
  });

  it('testStrNWeekDay', () => {
    const rruleString = 'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=3;BYDAY=1TU,-1TH';
    assertDates({rule: parse(rruleString)}, [
      '1997-12-25T09:00:00.000Z',
      '1998-01-06T09:00:00.000Z',
      '1998-12-31T09:00:00.000Z',
    ]);
  });

  it('testStrUntil', () => {
    const rruleString = 'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;UNTIL=19990101T000000;BYDAY=1TU,-1TH';
    assertDates({rule: parse(rruleString)}, [
      '1997-12-25T09:00:00.000Z',
      '1998-01-06T09:00:00.000Z',
      '1998-12-31T09:00:00.000Z',
    ]);
  });

  it('testStrValueDatetime', () => {
    const rruleString = 'DTSTART;VALUE=DATE-TIME:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=2';
    assertDates({rule: parse(rruleString)}, ['1997-09-02T09:00:00.000Z', '1998-09-02T09:00:00.000Z']);
  });

  it('testStrValueDate', () => {
    const rruleString = 'DTSTART;VALUE=DATE:19970902\nRRULE:FREQ=YEARLY;COUNT=2';
    assertDates({rule: parse(rruleString)}, ['1997-09-02T00:00:00.000Z', '1998-09-02T00:00:00.000Z']);
  });

  it('testStrUntilWithDateValue', () => {
    const rruleString = 'DTSTART;VALUE=DATE:19970902\nRRULE:FREQ=DAILY;UNTIL=19970904';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T00:00:00.000Z',
      '1997-09-03T00:00:00.000Z',
      '1997-09-04T00:00:00.000Z',
    ]);
  });

  it('testStrMultipleDTStartComma', () => {
    expect(() => {
      parse('DTSTART:19970101T000000,19970202T000000\nRRULE:FREQ=YEARLY;COUNT=1');
    }).toThrow();
  });

  it('testStrInvalidUntil', () => {
    expect(() => {
      const rule = parse('DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;UNTIL=TheCowsComeHome;BYDAY=1TU,-1TH');
      rule.all();
    }).toThrow();
  });

  it('testStrUntilMustBeUTC', () => {
    expect(() => {
      const rule = parse(
        'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=YEARLY;UNTIL=19990101T000000;BYDAY=1TU,-1TH',
      );
      rule.all();
    }).toThrow();
  });

  it('testStrUntilWithTZ', () => {
    const rruleString = 'DTSTART;TZID=America/New_York:19970101T000000\nRRULE:FREQ=YEARLY;UNTIL=19990101T000000Z';
    const rule = parse(rruleString);
    assertDates({rule}, ['1997-01-01T05:00:00.000Z', '1998-01-01T05:00:00.000Z']);
  });

  it('testStrEmptyByDay', () => {
    expect(() => {
      const rule = parse('DTSTART:19970902T090000\nFREQ=WEEKLY;BYDAY=;WKST=SU');
      rule.all();
    }).toThrow();
  });

  it('testStrInvalidByDay', () => {
    expect(() => {
      const rule = parse('DTSTART:19970902T090000\nFREQ=WEEKLY;BYDAY=-1OK;WKST=SU');
      rule.all();
    }).toThrow();
  });
});

describe('RRule validation tests', () => {
  it('testBadBySetPos', () => {
    expect(() => {
      new RRuleTemporal({
        freq: 'MONTHLY',
        count: 1,
        bySetPos: [0],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
    }).toThrow();
  });

  it('testBadBySetPosMany', () => {
    expect(() => {
      new RRuleTemporal({
        freq: 'MONTHLY',
        count: 1,
        bySetPos: [-1, 0, 1],
        dtstart: zdt(1997, 9, 2, 9, 'UTC'),
      });
    }).toThrow();
  });
});

describe('String parsing edge cases', () => {
  it('testStrSetExDateMultiple', () => {
    const rruleString =
      'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\nEXDATE:19970904T090000,19970911T090000,19970918T090000';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T09:00:00.000Z',
      '1997-09-09T09:00:00.000Z',
      '1997-09-16T09:00:00.000Z',
    ]);
  });

  it('testStrSetExDateWithTZID', () => {
    const rruleString =
      'DTSTART;TZID=Europe/Brussels:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\nEXDATE;TZID=Europe/Brussels:19970904T090000\nEXDATE;TZID=Europe/Brussels:19970911T090000\nEXDATE;TZID=Europe/Brussels:19970918T090000';
    assertDates({rule: parse(rruleString)}, [
      '1997-09-02T07:00:00.000Z',
      '1997-09-09T07:00:00.000Z',
      '1997-09-16T07:00:00.000Z',
    ]);
  });

  it('testStrSetExDateValueDateTimeNoTZID', () => {
    const rruleString =
      'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH\nEXDATE;VALUE=DATE-TIME:19970902T090000\nEXDATE;VALUE=DATE-TIME:19970909T090000';
    assertDates({rule: parse(rruleString)}, ['1997-09-04T09:00:00.000Z', '1997-09-11T09:00:00.000Z']);
  });

  it('testStrSetExDateValueMixDateTimeNoTZID', () => {
    const rruleString =
      'DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH\nEXDATE;VALUE=DATE-TIME:19970902T090000\nEXDATE:19970909T090000';
    assertDates({rule: parse(rruleString)}, ['1997-09-04T09:00:00.000Z', '1997-09-11T09:00:00.000Z']);
  });

  it('testStrSetExDateValueDateTimeWithTZID', () => {
    const rruleString =
      'DTSTART;VALUE=DATE-TIME;TZID=Europe/Brussels:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH\nEXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:19970902T090000\nEXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:19970909T090000';
    assertDates({rule: parse(rruleString)}, ['1997-09-04T07:00:00.000Z', '1997-09-11T07:00:00.000Z']);
  });

  it('testStrSetExDateValueDate', () => {
    const rruleString =
      'DTSTART;VALUE=DATE:19970902\nRRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH\nEXDATE;VALUE=DATE:19970902\nEXDATE;VALUE=DATE:19970909';
    assertDates({rule: parse(rruleString)}, ['1997-09-04T00:00:00.000Z', '1997-09-11T00:00:00.000Z']);
  });
});
