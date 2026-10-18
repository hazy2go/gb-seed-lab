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
const EXTRA = { 'milky way': 'the milky way overhead', 'shooting star': 'a shooting star', comet: 'a comet', birds: 'birds in flight', lighthouse: 'a lighthouse', sailboat: 'a sailboat', cabin: 'a lit cabin', 'LCD ghost': 'a ghost image on the screen' };

// The ten 1/1s: one hand-written sentence each (ids as in src/oneofone.mjs). Checked against the art 2026-10-18, ok'd by Hazy.
export const SCENES = {
  1: 'Mount Fuji at first light, its snowy cone mirrored in a still lake, with a lit house on the shore, birds in flight and a cherry branch hanging in from above.',
  2: 'The great torii standing in the sea at dusk, with the low sun setting right behind it and its light trailing across the water.',
  3: 'Thatched gassho farmhouses in a snowy mountain valley at night, with warm windows, cedars under snow and snow falling.',
  4: 'The milky way rising over dark ridges at night and doubled in a lake, with a glowing tent on the shore, someone pointing up and a shooting star.',
  5: 'The golden pavilion under fresh snow, mirrored in its pond, with snowy pines on the hill behind and snow falling.',
  6: 'Paper sky lanterns rising over a lake at night, doubled in the water, with a small boat letting one more go.',
  7: 'A bamboo grove at dusk, with a fenced path running to a glow between the stems and fireflies drifting.',
  8: 'A humpback whale breaching in front of a full moon over the open sea, with spray where it leaves the water.',
  9: 'A ramen stall glowing on a rainy night street, with steam rising, two customers on stools, a red lantern and someone hurrying past under an umbrella.',
  10: 'A lighthouse on its crag in a storm at night, its beam cutting the rain while a wave explodes against the rock and lightning strikes out at sea.',
};

// special: the piece's 1/1 id (0 = normal piece, described from its traits)
export function describe(t, special = 0) {
  if (special && SCENES[special]) return SCENES[special];
  const snowy = t.snowcaps && ['peaks', 'fjord', 'volcano'].includes(t.terrain);
  const terrain = snowy ? TERRAIN[t.terrain].replace(/^(a )?/, (m) => m + 'snowy ') : TERRAIN[t.terrain];   // 'a snowy fjord', not 'snowy a fjord'
  const main = `${SKY[t.sky] || 'A sky'} over ${terrain} ${TIME[t.time] || ''}`.replace(/\s+/g, ' ').trim();
  const rest = [];
  if (t.terrain !== 'islands' && t.terrain !== 'fjord') rest.push(`${GROUND[t.ground]} below`);
  if (WEATHER[t.weather]) rest.push(WEATHER[t.weather]);
  for (const e of t.extras || []) rest.push(e === 'cabin' && !['night', 'aurora', 'dusk', 'eclipse'].includes(t.time) ? 'a cabin' : EXTRA[e] || e);
  const list = rest.length > 1 ? rest.slice(0, -1).join(', ') + ' and ' + rest[rest.length - 1] : rest[0];
  const s = list ? `${main}, with ${list}` : main;
  return s.replace(/^./, c => c.toUpperCase()) + '.';
}
