# 3.3.10. Recurrence Rule

Value Name
----------

RECUR

Purpose
-------

This value type is used to identify properties that contain a recurrence rule
specification.

Format Definition
-----------------

This value type is defined by the following notation:

```
 recur           = recur-rule-part *( ";" recur-rule-part )
                 ;
                 ; The rule parts are not ordered in any
                 ; particular sequence.
                 ;
                 ; The FREQ rule part is REQUIRED,
                 ; but MUST NOT occur more than once.
                 ;
                 ; The UNTIL or COUNT rule parts are OPTIONAL,
                 ; but they MUST NOT occur in the same 'recur'.
                 ;
                 ; The other rule parts are OPTIONAL,
                 ; but MUST NOT occur more than once.
```

```
 recur-rule-part = ( "FREQ" "=" freq )
                 / ( "UNTIL" "=" enddate )
                 / ( "COUNT" "=" 1*DIGIT )
                 / ( "INTERVAL" "=" 1*DIGIT )
                 / ( "BYSECOND" "=" byseclist )
                 / ( "BYMINUTE" "=" byminlist )
                 / ( "BYHOUR" "=" byhrlist )
                 / ( "BYDAY" "=" bywdaylist )
                 / ( "BYMONTHDAY" "=" bymodaylist )
                 / ( "BYYEARDAY" "=" byyrdaylist )
                 / ( "BYWEEKNO" "=" bywknolist )
                 / ( "BYMONTH" "=" bymolist )
                 / ( "BYSETPOS" "=" bysplist )
                 / ( "WKST" "=" weekday )
```

```
 freq        = "SECONDLY" / "MINUTELY" / "HOURLY" / "DAILY"
             / "WEEKLY" / "MONTHLY" / "YEARLY"
```

```
 enddate     = date / date-time
```

```
 byseclist   = ( seconds *("," seconds) )
```

```
 seconds     = 1*2DIGIT       ;0 to 60
```

```
 byminlist   = ( minutes *("," minutes) )
```

```
 minutes     = 1*2DIGIT       ;0 to 59
```

```
 byhrlist    = ( hour *("," hour) )
```

```
 hour        = 1*2DIGIT       ;0 to 23
```

```
 bywdaylist  = ( weekdaynum *("," weekdaynum) )
```

```
 weekdaynum  = [[plus / minus] ordwk] weekday
```

```
 plus        = "+"
```

```
 minus       = "-"
```

```
 ordwk       = 1*2DIGIT       ;1 to 53
```

```
 weekday     = "SU" / "MO" / "TU" / "WE" / "TH" / "FR" / "SA"
 ;Corresponding to SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY,
 ;FRIDAY, and SATURDAY days of the week.
 bymodaylist = ( monthdaynum *("," monthdaynum) )
```

```
 monthdaynum = [plus / minus] ordmoday
```

```
 ordmoday    = 1*2DIGIT       ;1 to 31
```

```
 byyrdaylist = ( yeardaynum *("," yeardaynum) )
```

```
 yeardaynum  = [plus / minus] ordyrday
```

```
 ordyrday    = 1*3DIGIT      ;1 to 366
```

```
 bywknolist  = ( weeknum *("," weeknum) )
```

```
 weeknum     = [plus / minus] ordwk
```

```
 bymolist    = ( monthnum *("," monthnum) )
```

```
 monthnum    = 1*2DIGIT       ;1 to 12
```

```
 bysplist    = ( setposday *("," setposday) )
```

```
 setposday   = yeardaynum
```

Description
-----------

This value type is a structured value consisting of a list of one or more
recurrence grammar parts. Each rule part is defined by a NAME=VALUE pair. The
rule parts are separated from each other by the SEMICOLON character. The rule
parts are not ordered in any particular sequence. Individual rule parts MUST
only be specified once. Compliant applications MUST accept rule parts ordered in
any sequence, but to ensure backward compatibility with applications that
pre-date this revision of iCalendar the FREQ rule part MUST be the first rule
part specified in a RECUR value.

The FREQ rule part identifies the type of recurrence rule. This rule part MUST
be specified in the recurrence rule. Valid values include SECONDLY, to specify
repeating events based on an interval of a second or more; MINUTELY, to specify
repeating events based on an interval of a minute or more; HOURLY, to specify
repeating events based on an interval of an hour or more; DAILY, to specify
repeating events based on an interval of a day or more; WEEKLY, to specify
repeating events based on an interval of a week or more; MONTHLY, to specify
repeating events based on an interval of a month or more; and YEARLY, to specify
repeating events based on an interval of a year or more.

The INTERVAL rule part contains a positive integer representing at which
intervals the recurrence rule repeats. The default value is "1", meaning every
second for a SECONDLY rule, every minute for a MINUTELY rule, every hour for an
HOURLY rule, every day for a DAILY rule, every week for a WEEKLY rule, every
month for a MONTHLY rule, and every year for a YEARLY rule. For example, within
a DAILY rule, a value of "8" means every eight days.

The UNTIL rule part defines a DATE or DATE-TIME value that bounds the recurrence
rule in an inclusive manner. If the value specified by UNTIL is synchronized
with the specified recurrence, this DATE or DATE-TIME becomes the last instance
of the recurrence. The value of the UNTIL rule part MUST have the same value
type as the DTSTART property. Furthermore, if the DTSTART property is
specified as a date with local time, then the UNTIL rule part MUST also be
specified as a date with local time. If the DTSTART property is specified as
a date with UTC time or a date with local time and time zone reference, then the
UNTIL rule part MUST be specified as a date with UTC time. In the case of the "
STANDARD" and "DAYLIGHT" sub-components the UNTIL rule part MUST always be
specified as a date with UTC time. If specified as a DATE-TIME value, then it
MUST be specified in a UTC time format. If not present, and the COUNT rule part
is also not present, the RRULE is considered to repeat forever.

The COUNT rule part defines the number of occurrences at which to range-bound
the recurrence. The DTSTART property value always counts as the first
occurrence.

The BYSECOND rule part specifies a COMMA-separated list of seconds within a
minute. Valid values are 0 to 60. The BYMINUTE rule part specifies a
COMMA-separated list of minutes within an hour. Valid values are 0 to 59. The
BYHOUR rule part specifies a COMMA- separated list of hours of the day. Valid
values are 0 to 23. The BYSECOND, BYMINUTE and BYHOUR rule parts MUST NOT be
specified when the associated DTSTART property has a DATE value type. These
rule parts MUST be ignored in RECUR value that violate the above requirement (
e.g., generated by applications that pre-date this revision of iCalendar).

The BYDAY rule part specifies a COMMA-separated list of days of the week; SU
indicates Sunday; MO indicates Monday; TU indicates Tuesday; WE indicates
Wednesday; TH indicates Thursday; FR indicates Friday; and SA indicates
Saturday.

Each BYDAY value can also be preceded by a positive (+n) or negative (-n)
integer. If present, this indicates the nth occurrence of a specific day within
the MONTHLY or YEARLY RRULE. For example, within a MONTHLY rule, +1MO (or
simply 1MO) represents the first Monday within the month, whereas -1MO
represents the last Monday of the month. The numeric value in a BYDAY rule part
with the FREQ rule part set to YEARLY corresponds to an offset within the month
when the BYMONTH rule part is present, and corresponds to an offset within the
year when the BYWEEKNO or BYMONTH rule parts are present. If an integer modifier
is not present, it means all days of this type within the specified frequency.
For example, within a MONTHLY rule, MO represents all Mondays within the month.
The BYDAY rule part MUST NOT be specified with a numeric value when the FREQ
rule part is not set to MONTHLY or YEARLY. Furthermore, the BYDAY rule part MUST
NOT be specified with a numeric value with the FREQ rule part set to YEARLY when
the BYWEEKNO rule part is specified.

The BYMONTHDAY rule part specifies a COMMA-separated list of days of the month.
Valid values are 1 to 31 or -31 to -1. For example, -10 represents the tenth to
the last day of the month. The BYMONTHDAY rule part MUST NOT be specified when
the FREQ rule part is set to WEEKLY.

The BYYEARDAY rule part specifies a COMMA-separated list of days of the year.
Valid values are 1 to 366 or -366 to -1. For example, -1 represents the last day
of the year (December 31st) and -306 represents the 306th to the last day of the
year (March 1st). The BYYEARDAY rule part MUST NOT be specified when the FREQ
rule part is set to DAILY, WEEKLY, or MONTHLY.

The BYWEEKNO rule part specifies a COMMA-separated list of ordinals specifying
weeks of the year. Valid values are 1 to 53 or -53 to -1. This corresponds to
weeks according to week numbering as defined in \[ISO.8601.2004\]. A week is
defined as a seven day period, starting on the day of the week defined to be the
week start (see WKST). Week number one of the calendar year is the first week
that contains at least four (4) days in that calendar year. This rule part MUST
NOT be used when the FREQ rule part is set to anything other than YEARLY. For
example, 3 represents the third week of the year.

> Note: Assuming a Monday week start, week 53 can only occur when Thursday is
> January 1 or if it is a leap year and Wednesday is January 1.

The BYMONTH rule part specifies a COMMA-separated list of months of the year.
Valid values are 1 to 12.

The WKST rule part specifies the day on which the workweek starts. Valid values
are MO, TU, WE, TH, FR, SA, and SU. This is significant when a WEEKLY RRULE
has an interval greater than 1, and a BYDAY rule part is specified. This is also
significant when in a YEARLY RRULE when a BYWEEKNO rule part is specified.
The default value is MO.

The BYSETPOS rule part specifies a COMMA-separated list of values that
corresponds to the nth occurrence within the set of recurrence instances
specified by the rule. BYSETPOS operates on a set of recurrence instances in one
interval of the recurrence rule. For example, in a WEEKLY rule, the interval
would be one week A set of recurrence instances starts at the beginning of the
interval defined by the FREQ rule part. Valid values are 1 to 366 or -366 to -1.
It MUST only be used in conjunction with another BYxxx rule part. For example "
the last work day of the month" could be represented as:

```
 FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1
```

Each BYSETPOS value can include a positive (+n) or negative (-n) integer. If
present, this indicates the nth occurrence of the specific occurrence within the
set of occurrences specified by the rule.

Recurrence rules may generate recurrence instances with an invalid date (e.g.,
February 30) or nonexistent local time (e.g., 1:30 AM on a day where the local
time is moved forward by an hour at 1:00 AM). Such recurrence instances MUST be
ignored and MUST NOT be counted as part of the recurrence set.

Information, not contained in the rule, necessary to determine the various
recurrence instance start time and dates are derived from the Start
Time (DTSTART) component attribute. For example, "FREQ=YEARLY;BYMONTH=1"
doesn't specify a specific day within the month or a time. This information
would be the same as what is specified for DTSTART.

BYxxx rule parts modify the recurrence in some manner. BYxxx rule parts for a
period of time that is the same or greater than the frequency generally reduce
or limit the number of occurrences of the recurrence generated. For example, "
FREQ=DAILY;BYMONTH=1" reduces the number of recurrence instances from all days (
if BYMONTH rule part is not present) to all days in January. BYxxx rule parts
for a period of time less than the frequency generally increase or expand the
number of occurrences of the recurrence. For example, "FREQ=YEARLY;BYMONTH=1,2"
increases the number of days within the yearly recurrence set from 1 (if BYMONTH
rule part is not present) to 2.

If multiple BYxxx rule parts are specified, then after evaluating the specified
FREQ and INTERVAL rule parts, the BYxxx rule parts are applied to the current
set of evaluated occurrences in the following order: BYMONTH, BYWEEKNO,
BYYEARDAY, BYMONTHDAY, BYDAY, BYHOUR, BYMINUTE, BYSECOND and BYSETPOS; then
COUNT and UNTIL are evaluated.

The table below summarizes the dependency of BYxxx rule part expand or limit
behavior on the FREQ rule part value.

The term "N/A" means that the corresponding BYxxx rule part MUST NOT be used
with the corresponding FREQ value.

BYDAY has some special behavior depending on the FREQ value and this is
described in separate notes below the table.

```
+----------+--------+--------+-------+-------+------+-------+------+
|          |SECONDLY|MINUTELY|HOURLY |DAILY  |WEEKLY|MONTHLY|YEARLY|
+----------+--------+--------+-------+-------+------+-------+------+
|BYMONTH   |Limit   |Limit   |Limit  |Limit  |Limit |Limit  |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYWEEKNO  |N/A     |N/A     |N/A    |N/A    |N/A   |N/A    |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYYEARDAY |Limit   |Limit   |Limit  |N/A    |N/A   |N/A    |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYMONTHDAY|Limit   |Limit   |Limit  |Limit  |N/A   |Expand |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYDAY     |Limit   |Limit   |Limit  |Limit  |Expand|Note 1 |Note 2|
+----------+--------+--------+-------+-------+------+-------+------+
|BYHOUR    |Limit   |Limit   |Limit  |Expand |Expand|Expand |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYMINUTE  |Limit   |Limit   |Expand |Expand |Expand|Expand |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYSECOND  |Limit   |Expand  |Expand |Expand |Expand|Expand |Expand|
+----------+--------+--------+-------+-------+------+-------+------+
|BYSETPOS  |Limit   |Limit   |Limit  |Limit  |Limit |Limit  |Limit |
+----------+--------+--------+-------+-------+------+-------+------+
```

Note 1
------

Limit if BYMONTHDAY is present; otherwise, special expand for MONTHLY.

Note 2
------

Limit if BYYEARDAY or BYMONTHDAY is present; otherwise, special expand for
WEEKLY if BYWEEKNO present; otherwise, special expand for MONTHLY if BYMONTH
present; otherwise, special expand for YEARLY.

Here is an example of evaluating multiple BYxxx rule parts.

```
 DTSTART;TZID=America/New_York:19970105T083000
 RRULE:FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYDAY=SU;BYHOUR=8,9;
  BYMINUTE=30
```

First, the "INTERVAL=2" would be applied to "FREQ=YEARLY" to arrive at "every
other year". Then, "BYMONTH=1" would be applied to arrive at "every January,
every other year". Then, "BYDAY=SU" would be applied to arrive at "every Sunday
in January, every other year". Then, "BYHOUR=8,9" would be applied to arrive
at "every Sunday in January at 8 AM and 9 AM, every other year". Then, "
BYMINUTE=30" would be applied to arrive at "every Sunday in January at 8:30 AM
and 9:30 AM, every other year". Then, lacking information from RRULE, the
second is derived from DTSTART, to end up in "every Sunday in January at 8:
30:00 AM and 9:30:00 AM, every other year". Similarly, if the BYMINUTE, BYHOUR,
BYDAY, BYMONTHDAY, or BYMONTH rule part were missing, the appropriate minute,
hour, day, or month would have been retrieved from the DTSTART property.

If the computed local start time of a recurrence instance does not exist, or
occurs more than once, for the specified time zone, the time of the recurrence
instance is interpreted in the same manner as an explicit DATE-TIME value
describing that date and time, as specified in Section 3.3.5.

No additional content value encoding (i.e., BACKSLASH character encoding, see
Section 3.3.11) is defined for this value type.

Example
-------

The following is a rule that specifies 10 occurrences that occur every other
day:

```
 FREQ=DAILY;COUNT=10;INTERVAL=2
```
