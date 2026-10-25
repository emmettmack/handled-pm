// How a unit reads in messages and screens. A single home uses the unit name "Main", which reads as "Main house".
export const unitName = (number) => (/^main( house)?$/i.test(String(number ?? '').trim()) ? 'Main house' : `Unit ${number}`);
