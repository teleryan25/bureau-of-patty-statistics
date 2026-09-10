/* =============================================================
   Bureau of Patty Statistics — taxonomy.js

   The controlled vocabularies shared by every layer: establishment
   categories and the preset location register, plus the single
   normalisation function used to decide whether two typed names are
   the same name.

   No DOM, no I/O. Loaded as a plain <script> (window.BPS.taxonomy)
   and require()-able from Node.
   ============================================================= */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.BPS = root.BPS || {};
  root.BPS.taxonomy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- NAME NORMALISATION ----------
     THE single definition of "same name". Used for establishments and
     locations alike, in the browser and in Postgres (the migration
     installs a SQL function with identical behaviour).

       "St. Louis Park"  "st louis park"  "ST LOUIS PARK"
     all collapse to      "st louis park"

     Apostrophes are dropped rather than spaced so "Lion's Den" and
     "Lions Den" agree; every other punctuation run becomes a space. */
  function normalizeName(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[‘’ʼ']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Display-side tidy: collapse whitespace, keep the auditor's casing. */
  function cleanDisplayName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function sameName(a, b) {
    var na = normalizeName(a);
    return na !== '' && na === normalizeName(b);
  }

  /* ---------- ESTABLISHMENT CATEGORIES ----------
     Controlled, never freeform. One primary category per establishment.
     `key` is the durable value stored in the database. */
  var ESTABLISHMENT_CATEGORIES = [
    { key: 'fast-food',     label: 'Fast Food',           note: 'Counter service, drive-through, tray liners.' },
    { key: 'fast-casual',   label: 'Fast Casual',         note: 'Order at the counter, food brought to the table.' },
    { key: 'casual-dining', label: 'Casual Dining',       note: 'Table service, laminated menu, no dress code.' },
    { key: 'bar-pub',       label: 'Bar / Pub',           note: 'The burger is a supporting instrument.' },
    { key: 'brewery',       label: 'Brewery / Taproom',   note: 'On-site fermentation, communal seating.' },
    { key: 'diner-cafe',    label: 'Diner / Cafe',        note: 'Booths, counter stools, breakfast served late.' },
    { key: 'fine-dining',   label: 'Fine Dining / Upscale', note: 'Cloth napkins, uncomfortable silence.' },
    { key: 'food-truck',    label: 'Food Truck / Stand',  note: 'Mobile, seasonal or open-air service.' },
    { key: 'other',         label: 'Other',               note: 'Uncategorised by the Bureau.' }
  ];

  var CATEGORY_KEYS = ESTABLISHMENT_CATEGORIES.map(function (c) { return c.key; });
  var DEFAULT_CATEGORY = 'other';

  function isCategory(key) {
    return CATEGORY_KEYS.indexOf(String(key)) !== -1;
  }

  function coerceCategory(key) {
    return isCategory(key) ? String(key) : DEFAULT_CATEGORY;
  }

  function categoryLabel(key) {
    for (var i = 0; i < ESTABLISHMENT_CATEGORIES.length; i++) {
      if (ESTABLISHMENT_CATEGORIES[i].key === key) return ESTABLISHMENT_CATEGORIES[i].label;
    }
    return 'Other';
  }

  /* ---------- PRESET LOCATIONS ----------
     A working Minneapolis–St. Paul metro list: enough that the two
     auditors rarely have to type, small enough to scan on a phone.
     Anything missing is added at filing time and becomes permanent
     shared data, indistinguishable from a preset thereafter. */
  var LOCATION_GROUPS = [
    { key: 'minneapolis', label: 'Minneapolis', names: [
      'Downtown Minneapolis', 'North Loop', 'Northeast Minneapolis', 'Uptown',
      'Lyn-Lake', 'Whittier', 'Dinkytown', 'Seward', 'Longfellow', 'Nokomis',
      'Linden Hills', 'Cedar-Riverside', 'North Minneapolis'
    ] },
    { key: 'saint-paul', label: 'St. Paul', names: [
      'Downtown St. Paul', 'Grand Avenue', 'Cathedral Hill', 'Highland Park',
      'Macalester-Groveland', 'West Seventh', 'Como', 'St. Anthony Park'
    ] },
    { key: 'inner-ring', label: 'Inner-Ring Suburbs', names: [
      'St. Louis Park', 'Richfield', 'Edina', 'Golden Valley', 'Hopkins',
      'Roseville', 'Falcon Heights', 'Columbia Heights', 'Fridley',
      'Brooklyn Center', 'Maplewood', 'West St. Paul', 'South St. Paul',
      'Mendota Heights'
    ] },
    { key: 'greater-metro', label: 'Greater Metro', names: [
      'Bloomington', 'Eden Prairie', 'Minnetonka', 'Plymouth', 'Maple Grove',
      'Brooklyn Park', 'Eagan', 'Burnsville', 'Apple Valley', 'Lakeville',
      'Savage', 'Prior Lake', 'Shakopee', 'Chanhassen', 'Wayzata',
      'Woodbury', 'Cottage Grove', 'Inver Grove Heights'
    ] },
    { key: 'north-metro', label: 'North & East Metro', names: [
      'Blaine', 'Coon Rapids', 'Anoka', 'White Bear Lake', 'Stillwater'
    ] }
  ];

  var PRESET_LOCATIONS = [];
  LOCATION_GROUPS.forEach(function (group) {
    group.names.forEach(function (name) {
      PRESET_LOCATIONS.push({ name: name, nameKey: normalizeName(name), group: group.key });
    });
  });

  function presetGroupOf(name) {
    var key = normalizeName(name);
    for (var i = 0; i < PRESET_LOCATIONS.length; i++) {
      if (PRESET_LOCATIONS[i].nameKey === key) return PRESET_LOCATIONS[i].group;
    }
    return null;
  }

  function isPresetLocation(name) {
    return presetGroupOf(name) !== null;
  }

  /* Locations added by an auditor sit in their own group so the picker
     can label them without treating them differently. */
  var CUSTOM_GROUP = { key: 'added', label: 'Added by the Bureau' };

  function groupLabel(key) {
    if (key === CUSTOM_GROUP.key) return CUSTOM_GROUP.label;
    for (var i = 0; i < LOCATION_GROUPS.length; i++) {
      if (LOCATION_GROUPS[i].key === key) return LOCATION_GROUPS[i].label;
    }
    return CUSTOM_GROUP.label;
  }

  return {
    normalizeName: normalizeName,
    cleanDisplayName: cleanDisplayName,
    sameName: sameName,

    ESTABLISHMENT_CATEGORIES: ESTABLISHMENT_CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    DEFAULT_CATEGORY: DEFAULT_CATEGORY,
    isCategory: isCategory,
    coerceCategory: coerceCategory,
    categoryLabel: categoryLabel,

    LOCATION_GROUPS: LOCATION_GROUPS,
    PRESET_LOCATIONS: PRESET_LOCATIONS,
    CUSTOM_GROUP: CUSTOM_GROUP,
    groupLabel: groupLabel,
    presetGroupOf: presetGroupOf,
    isPresetLocation: isPresetLocation
  };
});
