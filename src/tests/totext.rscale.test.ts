import {RRuleTemporal} from '../index';
import {toText} from '../totext';

describe('toText: RSCALE/SKIP mention', () => {
  test('includes RSCALE and SKIP when present', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=UTC:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=MONTHLY;COUNT=2`,
    });
    const txt = toText(rule, 'en');
    expect(txt).toContain('RSCALE=GREGORIAN');
    expect(txt).toContain('SKIP=BACKWARD');
  });
});

