/**
 * Maps species names (as stored in our data) to PokeAPI sprite IDs for alternate forms.
 * Base forms use their national dex number and don't need an entry here.
 * IDs sourced from https://pokeapi.co/api/v2/pokemon?limit=500&offset=1000
 */
export const FORM_SPRITE_IDS: Record<string, number> = {
  // --- Gen 3: Deoxys ---
  'Deoxys (Attack)': 10001,
  'Deoxys (Defense)': 10002,
  'Deoxys (Speed)': 10003,

  // --- Gen 4: Wormadam ---
  'Wormadam (Sandy)': 10004,
  'Wormadam (Sandy Cloak)': 10004,
  'Wormadam (Trash)': 10005,
  'Wormadam (Trash Cloak)': 10005,

  // --- Gen 4: Rotom ---
  'Rotom (Heat)': 10008,
  'Rotom (Wash)': 10009,
  'Rotom (Frost)': 10010,
  'Rotom (Fan)': 10011,
  'Rotom (Mow)': 10012,

  // --- Gen 4: Shaymin ---
  'Shaymin (Sky)': 10006,

  // --- Gen 4: Giratina ---
  'Giratina (Origin)': 10007,

  // --- Gen 5: Forces of Nature (Therian) ---
  'Tornadus (Therian)': 10019,
  'Thundurus (Therian)': 10020,
  'Landorus (Therian)': 10021,

  // --- Gen 5: Kyurem fusions ---
  'Kyurem (Black)': 10022,
  'Kyurem (White)': 10023,

  // --- Gen 5: Keldeo ---
  'Keldeo (Resolute)': 10024,

  // --- Gen 5: Meowstic ---
  'Meowstic (Female)': 10025,

  // --- Gen 5: Darmanitan ---
  'Darmanitan (Zen)': 10017,

  // --- Gen 5: Meloetta ---
  'Meloetta (Pirouette)': 10018,

  // --- Gen 5: Basculin ---
  'Basculin (Blue Striped)': 10016,
  'Basculin (Blue)': 10016,

  // --- Gen 6: Mega Evolutions (canonical) ---
  'Mega Venusaur': 10033,
  'Mega Charizard X': 10034,
  'Mega Charizard Y': 10035,
  'Mega Blastoise': 10036,
  'Mega Alakazam': 10037,
  'Mega Gengar': 10038,
  'Mega Kangaskhan': 10039,
  'Mega Pinsir': 10040,
  'Mega Gyarados': 10041,
  'Mega Aerodactyl': 10042,
  'Mega Mewtwo X': 10043,
  'Mega Mewtwo Y': 10044,
  'Mega Ampharos': 10045,
  'Mega Scizor': 10046,
  'Mega Heracross': 10047,
  'Mega Houndoom': 10048,
  'Mega Tyranitar': 10049,
  'Mega Blaziken': 10050,
  'Mega Gardevoir': 10051,
  'Mega Mawile': 10052,
  'Mega Aggron': 10053,
  'Mega Medicham': 10054,
  'Mega Manectric': 10055,
  'Mega Banette': 10056,
  'Mega Absol': 10057,
  'Mega Garchomp': 10058,
  'Mega Lucario': 10059,
  'Mega Abomasnow': 10060,
  'Mega Latias': 10062,
  'Mega Latios': 10063,
  'Mega Swampert': 10064,
  'Mega Sceptile': 10065,
  'Mega Sableye': 10066,
  'Mega Altaria': 10067,
  'Mega Gallade': 10068,
  'Mega Audino': 10069,
  'Mega Sharpedo': 10070,
  'Mega Slowbro': 10071,
  'Mega Steelix': 10072,
  'Mega Pidgeot': 10073,
  'Mega Glalie': 10074,
  'Mega Diancie': 10075,
  'Mega Metagross': 10076,
  'Mega Rayquaza': 10079,
  'Mega Camerupt': 10087,
  'Mega Lopunny': 10088,
  'Mega Salamence': 10089,
  'Mega Beedrill': 10090,
  'Mega Hoopa': 10086, // Hoopa Unbound
  'Hoopa (Unbound)': 10086,

  // --- Gen 6: Primal Reversions ---
  'Primal Kyogre': 10077,
  'Primal Groudon': 10078,

  // --- Gen 6: Zygarde ---
  'Zygarde (10)': 10181,
  'Zygarde (10 Power Construct)': 10118,
  'Zygarde (50 Power Construct)': 10119,
  'Zygarde (Complete)': 10120,

  // --- Gen 7: Alolan forms ---
  'Alolan Rattata': 10091,
  'Alolan Raticate': 10092,
  'Alolan Raichu': 10100,
  'Alolan Sandshrew': 10101,
  'Alolan Sandslash': 10102,
  'Alolan Vulpix': 10103,
  'Alolan Ninetales': 10104,
  'Alolan Diglett': 10105,
  'Alolan Dugtrio': 10106,
  'Alolan Meowth': 10107,
  'Alolan Persian': 10108,
  'Alolan Geodude': 10109,
  'Alolan Graveler': 10110,
  'Alolan Golem': 10111,
  'Alolan Grimer': 10112,
  'Alolan Muk': 10113,
  'Alolan Exeggutor': 10114,
  'Alolan Marowak': 10115,

  // --- Gen 7: Oricorio ---
  'Oricorio (Pom Pom)': 10123,
  'Oricorio (Pau)': 10124,
  'Oricorio (Sensu)': 10125,

  // --- Gen 7: Lycanroc ---
  'Lycanroc (Midnight)': 10126,
  'Lycanroc (Dusk)': 10152,

  // --- Gen 7: Basculin (White Striped — added in PLA) ---
  'Basculin (White Striped)': 10247,

  // --- Gen 7: Necrozma fusions ---
  'Necrozma (Dusk)': 10155,
  'Necrozma (Dawn)': 10156,
  'Necrozma (Ultra)': 10157,

  // --- Gen 8: Galarian forms ---
  'Galarian Meowth': 10161,
  'Galarian Ponyta': 10162,
  'Galarian Rapidash': 10163,
  'Galarian Slowpoke': 10164,
  'Galarian Slowbro': 10165,
  "Galarian Farfetch'd": 10166,
  'Galarian Weezing': 10167,
  'Galarian Mr. Mime': 10168,
  'Galarian Articuno': 10169,
  'Galarian Zapdos': 10170,
  'Galarian Moltres': 10171,
  'Galarian Slowking': 10172,
  'Galarian Corsola': 10173,
  'Galarian Zigzagoon': 10174,
  'Galarian Linoone': 10175,
  'Galarian Darumaka': 10176,
  'Galarian Darmanitan': 10177,
  'Darmanitan (Galar Zen)': 10178,
  'Galarian Yamask': 10179,
  'Galarian Stunfisk': 10180,

  // --- Gen 8: Other SwSh forms ---
  'Toxtricity (Low Key)': 10184,
  'Indeedee (Female)': 10186,
  'Zacian (Crowned)': 10188,
  'Zamazenta (Crowned)': 10189,
  'Urshifu (Rapid Strike)': 10191,
  'Calyrex (Ice)': 10193,
  'Calyrex (Shadow)': 10194,

  // --- Gen 8: Hisuian forms ---
  'Hisuian Growlithe': 10229,
  'Hisuian Arcanine': 10230,
  'Hisuian Voltorb': 10231,
  'Hisuian Electrode': 10232,
  'Hisuian Typhlosion': 10233,
  'Hisuian Qwilfish': 10234,
  'Hisuian Sneasel': 10235,
  'Hisuian Samurott': 10236,
  'Hisuian Lilligant': 10237,
  'Hisuian Zorua': 10238,
  'Hisuian Zoroark': 10239,
  'Hisuian Braviary': 10240,
  'Hisuian Sliggoo': 10241,
  'Hisuian Goodra': 10242,
  'Hisuian Avalugg': 10243,
  'Hisuian Decidueye': 10244,
  'Basculegion (Female)': 10248,
  'Enamorus (Therian)': 10249,

  // --- Gen 9: Paldean forms ---
  'Paldean Wooper': 10253,
  'Oinkologne (Female)': 10254,
  'Ursaluna (Bloodmoon)': 10272,

  // --- Custom Mega forms (present in this dataset and in PokeAPI) ---
  'Mega Clefable': 10278,
  'Mega Victreebel': 10279,
  'Mega Starmie': 10280,
  'Mega Dragonite': 10281,
  'Mega Meganium': 10282,
  'Mega Feraligatr': 10283,
  'Mega Skarmory': 10284,
  'Mega Froslass': 10285,
  'Mega Emboar': 10286,
  'Mega Excadrill': 10287,
  'Mega Scolipede': 10288,
  'Mega Scrafty': 10289,
  'Mega Eelektross': 10290,
  'Mega Chandelure': 10291,
  'Mega Chesnaught': 10292,
  'Mega Delphox': 10293,
  'Mega Greninja': 10294,
  'Mega Pyroar': 10295,
  'Mega Floette': 10296,
  'Mega Malamar': 10297,
  'Mega Barbaracle': 10298,
  'Mega Dragalge': 10299,
  'Mega Hawlucha': 10300,
  'Mega Zygarde': 10301,
  'Mega Drampa': 10302,
  'Mega Raichu X': 10304,
  'Mega Raichu Y': 10305,
  'Mega Chimecho': 10306,
  'Mega Staraptor': 10308,
  'Mega Heatran': 10311,
  'Mega Darkrai': 10312,
  'Mega Golurk': 10313,
  'Mega Meowstic': 10314,
  'Mega Crabominable': 10315,
  'Mega Golisopod': 10316,
  'Mega Magearna': 10317,
  'Mega Zeraora': 10319,

  // --- Mega Z forms ---
  'Mega Absol Z': 10307,
  'Garchomp (Mega Z)': 10058,
  'Lucario (Mega Z)': 10310,
}
