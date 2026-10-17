// One plain sentence per piece, from its traits. Used as the "Description" trait and at the start of the metadata
// description. Deterministic: the same traits always give the same sentence.
const TIME = { dawn: 'at dawn', day: 'by day', 'golden hour': 'in the golden hour', dusk: 'at dusk', night: 'at night', aurora: 'under an aurora', eclipse: 'during an eclipse' };
const SKY = {
  sun: 'A high sun', 'haloed sun': 'A haloed sun', 'day moon': 'A pale day moon', 'low sun': 'A low sun', 'striped sun': 'A striped setting sun',
  'double sun': 'Two suns', 'full moon': 'A full moon', 'gibbous moon': 'A gibbous moon', 'half moon': 'A half moon', 'crescent moon': 'A crescent moon',
  'new moon': 'A new moon', 'twin moons': 'Twin moons', 'ringed planet': 'A ringed planet', eclipse: 'A black sun', overcast: 'A heavy grey sky',
};
const TERRAIN = { peaks: 'peaks', hills: 'rolling hills', mesas: 'mesas', dunes: 'dunes', volcano: 'a smoking volcano', islands: 'islands', fjord: 'a fjord' };
const GROUND = { lake: 'a still lake', forest: 'a pine forest', meadow: 'a meadow', snowfield: 'a snowfield', sea: 'the open sea', desert: 'desert sand', oasis: 'an oasis with palms' };
const WEATHER = { clear: '', clouds: 'clouds drifting', fog: 'fog in the valleys', rain: 'rain falling', snowfall: 'snow falling', storm: 'a storm with lightning' };
const EXTRA = { 'milky way': 'the milky way overhead', 'shooting star': 'a shooting star', comet: 'a comet', birds: 'birds in flight', lighthouse: 'a lighthouse', sailboat: 'a sailboat', cabin: 'a lit cabin', glitch: 'a glitch in the signal' };

export function describe(t) {
  const terrain = (t.snowcaps && ['peaks', 'fjord', 'volcano'].includes(t.terrain) ? 'snowy ' : '') + TERRAIN[t.terrain];
  const main = `${SKY[t.sky] || 'A sky'} over ${terrain} ${TIME[t.time] || ''}`.replace(/\s+/g, ' ').trim();
  const rest = [];
  if (t.terrain !== 'islands' && t.terrain !== 'fjord') rest.push(`${GROUND[t.ground]} below`);
  if (WEATHER[t.weather]) rest.push(WEATHER[t.weather]);
  for (const e of t.extras || []) rest.push(e === 'cabin' && !['night', 'aurora', 'dusk', 'eclipse'].includes(t.time) ? 'a cabin' : EXTRA[e] || e);
  const list = rest.length > 1 ? rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1] : rest[0];
  const s = list ? `${main}, with ${list}` : main;
  return s.replace(/^./, c => c.toUpperCase()) + '.';
}
