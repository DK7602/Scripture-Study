#!/usr/bin/env python3
"""Hand-drawn historical territories and ancient roads for the atlas maps.

Writes public/data/geo/territories.json.

Borders are approximate, in the manner of a printed Bible atlas, drawn from the boundary lists in
Numbers 34 and Joshua 13-19, the usual reconstructions of the divided kingdom, Herodian Palestine and
the Roman provinces of the mid-first century.  Neighbouring territories are built from the same named
points so that shared borders coincide exactly; the app clips every territory to the coastline, so
points out at sea only need to be "somewhere in the water".

Usage: python3 scripts/build_territories.py
"""
from __future__ import annotations

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "geo", "territories.json")

# ---------------------------------------------------------------- named points (lon, lat)
P: dict[str, tuple[float, float]] = {
    # Jordan valley, Sea of Galilee and Dead Sea (river / lake midlines), north to south
    "jHula": (35.62, 33.08), "jGalN": (35.61, 32.89), "jGalM": (35.59, 32.80), "jGalS": (35.575, 32.71),
    "jYarmuk": (35.575, 32.645), "jIss": (35.56, 32.47), "jJabesh": (35.56, 32.33), "jAdam": (35.55, 32.10),
    "jSJ": (35.54, 32.05), "jEph": (35.53, 31.95), "jJericho": (35.53, 31.87), "jDSn": (35.55, 31.76),
    "jdI": (35.47, 31.48), "jDSm": (35.48, 31.45), "jDSs": (35.45, 31.07),
    # Arabah and the Gulf of Aqaba
    "arabah2": (35.15, 30.20), "aqaba": (34.97, 29.47), "gA1": (34.75, 28.80), "gA2": (34.50, 28.00),
    # out at sea off the coast of Canaan
    "cSidon": (35.05, 33.62), "cCarmel": (34.70, 32.76), "cKanah": (34.55, 32.17), "cYarkon": (34.55, 32.08),
    "cJabneel": (34.50, 31.92), "cAshk": (34.30, 31.66), "cGaza2": (34.15, 31.40), "cRaphia": (34.05, 31.32),
    "cEgypt": (33.70, 31.25), "cNorth": (35.30, 34.45),
    # tribes (Joshua 13-19)
    "jokneam": (35.11, 32.67), "z1": (35.17, 32.78), "kabul": (35.22, 32.88), "zN": (35.30, 32.89),
    "zNE": (35.39, 32.85), "zE": (35.41, 32.77), "tabor": (35.39, 32.69), "zS1": (35.25, 32.655),
    "iN": (35.48, 32.71), "mW": (35.23, 32.56), "jenin": (35.30, 32.45), "gilboa": (35.40, 32.45),
    "a2": (35.31, 33.05), "a3": (35.37, 33.22), "a4": (35.43, 33.40), "nN": (35.52, 33.42),
    "d0": (35.57, 33.18), "d1": (35.58, 33.33), "d2": (35.71, 33.36), "d3": (35.77, 33.22), "d4": (35.63, 33.13),
    "hermon": (35.86, 33.42), "mE1": (36.30, 33.30), "mE2": (36.75, 32.80), "mE3": (36.55, 32.35),
    "gadNE": (36.05, 32.25), "mahanaim": (35.68, 32.20), "gv1": (35.64, 32.40), "gv2": (35.62, 32.62),
    "ammonW": (35.86, 32.05), "rgE": (35.88, 31.85), "arnonE": (35.95, 31.45), "reubenE": (36.05, 31.68),
    "tappuah": (35.25, 32.12), "mich": (35.33, 32.17), "mich2": (35.45, 32.12), "kanahW": (34.95, 32.15),
    "aphek": (34.95, 32.08), "bethHoronL": (35.10, 31.88), "bethel": (35.22, 31.93), "eb2": (35.36, 31.93),
    "bj1": (35.38, 31.79), "enrogel": (35.235, 31.77), "nephtoah": (35.19, 31.80), "kiriathJ": (35.10, 31.81),
    "bethShemesh": (34.98, 31.75), "timnah": (34.91, 31.78), "ekron": (34.85, 31.78), "jabneel": (34.74, 31.88),
    "akrabbim": (35.12, 30.95), "zin": (34.85, 30.80), "kadesh": (34.42, 30.65), "azmon": (34.15, 30.85),
    "brookEgypt": (33.80, 31.10),
    "s1": (34.42, 31.32), "s2": (34.72, 31.42), "s3": (35.03, 31.33), "s4": (35.10, 31.17), "s5": (34.90, 30.99), "s6": (34.45, 31.08),
    # nations of Moses' day
    "cnN": (36.05, 34.45), "cnNE": (36.45, 34.20), "cnE": (35.95, 33.40),
    "bsN": (36.35, 33.40), "bsE": (36.85, 32.80), "bsSE": (36.50, 32.30), "ammonNE": (36.20, 32.15),
    "jabbok1": (35.70, 32.18), "jabbok2": (35.90, 32.20), "jabbok3": (36.05, 32.10), "rabbahW": (35.86, 32.00),
    "sihE": (35.97, 31.70), "ammonE": (36.45, 31.95), "ammonS": (36.25, 31.65), "moabNE": (36.25, 31.45),
    "moabE": (36.20, 31.05), "zeredE": (35.95, 30.95), "edomE": (36.05, 30.10), "edomS": (35.60, 29.30),
    "mdE": (36.90, 28.60), "mdS": (36.80, 26.50), "mdW": (35.60, 26.80),
    "eg1": (25.0, 31.9), "eg2": (32.30, 31.80), "eg3": (32.35, 30.60), "eg4": (32.55, 29.90), "eg5": (32.70, 29.50),
    "eg6": (33.70, 27.50), "eg7": (36.00, 23.00), "eg8": (36.00, 22.00), "eg9": (25.0, 22.0),
    # divided kingdom
    "ph1": (35.10, 32.75), "ph2": (35.25, 33.00), "ph3": (35.40, 33.25), "ph4": (35.55, 33.55),
    "dk1": (35.70, 33.38), "dk2": (35.66, 33.10), "dk3": (35.80, 32.70), "dk4": (36.05, 32.70),
    "dk5": (36.10, 32.35), "dk6": (35.98, 32.12), "dk7": (35.85, 31.95), "dk8": (35.78, 31.83),
    "ij0": (35.42, 31.82), "ij1": (35.30, 31.88), "ij2": (35.21, 31.90), "gezer": (34.93, 31.86),
    "pj1": (34.90, 31.75), "pj2": (34.88, 31.62), "pj3": (34.80, 31.50), "pj4": (34.62, 31.38), "pj5": (34.40, 31.25),
    "juS1": (35.25, 30.75), "juS2": (34.70, 30.45), "juS3": (34.30, 30.80),
    "ar1": (35.85, 33.75), "ar2": (36.60, 34.30), "ar3": (37.20, 33.50), "ar4": (37.00, 32.40), "aramAmmon": (36.40, 32.20),
    "ammonS2": (36.30, 31.85), "moabNE2": (36.10, 31.80), "moabE2": (36.15, 31.20), "phN": (35.80, 34.20), "phOff": (35.20, 34.30),
    # Palestine in Jesus' day
    "gS0": (35.10, 32.66), "gS1": (35.30, 32.60), "gS2": (35.45, 32.63), "gN": (35.62, 33.05),
    "phNT1": (35.08, 32.80), "phNT2": (35.20, 32.98), "phNT3": (35.35, 33.10), "phNT4": (35.55, 33.40), "phNTn": (35.85, 34.40),
    "sc1": (35.40, 32.45), "sc2": (35.56, 32.38), "acrabeta": (35.35, 32.10), "anuathu": (35.22, 32.07), "antipatris": (34.93, 32.10),
    "id1": (35.15, 31.55), "id2": (34.95, 31.58), "id3": (34.75, 31.62), "idS1": (35.10, 30.95), "idS2": (34.60, 31.00),
    "peS": (35.80, 31.50), "peE1": (35.85, 31.85), "peE2": (35.78, 32.10), "peN": (35.75, 32.30),
    "hippN": (35.68, 32.82), "deN": (36.05, 32.80), "deE": (36.40, 32.45), "deE2": (36.10, 32.00), "phila": (36.00, 31.88),
    "itSE": (36.80, 32.85), "itE": (36.75, 33.30), "itN2": (36.00, 33.55), "itN1": (35.70, 33.40),
    "nabE1": (37.60, 32.60), "nabE2": (38.50, 29.50), "nabS": (36.50, 27.00), "syE": (38.50, 33.50), "syN": (37.00, 35.20),
    # Roman provinces
    "it1": (9.0, 46.5), "it2": (13.6, 46.5), "it3": (13.9, 45.6), "it4": (13.3, 44.0), "it5": (16.0, 42.0), "it6": (18.8, 40.3),
    "it7": (17.5, 38.9), "it8": (16.0, 37.7), "messS": (15.62, 38.15), "messN": (15.40, 38.60), "it9": (12.0, 41.0), "it10": (10.3, 42.6),
    "it11": (9.8, 43.9), "it12": (9.0, 44.2), "si1": (11.9, 38.5), "si2": (15.4, 36.4), "si3": (12.0, 36.4),
    "af1": (9.0, 37.6), "af2": (11.6, 37.6), "af3": (11.6, 34.5), "af4": (15.5, 32.8), "afE1": (19.0, 31.2), "afE2": (19.0, 29.5),
    "af5": (15.0, 30.0), "af6": (9.0, 31.0), "cy1": (20.0, 33.5), "cy2": (24.0, 33.3), "ce1": (25.15, 32.3), "ce2": (25.0, 29.0),
    "ce3": (25.0, 22.0), "egN1": (31.0, 31.9), "egN2": (34.0, 31.6), "egNab1": (34.25, 31.25), "egNab2": (34.45, 30.40),
    "egNab3": (34.60, 29.40), "egNab4": (34.40, 27.90), "egS": (36.5, 22.0), "nabArab": (35.80, 26.50), "nabS2": (37.0, 26.0),
    "cr1": (23.2, 35.85), "cr2": (26.6, 35.85), "cr3": (26.6, 34.7), "cr4": (23.2, 34.7),
    "kp1": (32.1, 35.8), "kp2": (34.7, 35.8), "kp3": (34.7, 34.4), "kp4": (32.1, 34.4),
    "syOff1": (34.6, 33.5), "syOff2": (35.4, 35.0), "ci1": (36.00, 36.45), "ci2": (36.35, 36.90), "ci3": (36.80, 37.20),
    "zeugma": (37.90, 37.08), "eu1": (38.30, 36.00), "eu2": (39.00, 35.95), "eu3": (40.15, 35.30), "eu4": (40.70, 34.75), "sy1": (39.00, 33.00),
    "cN1": (36.60, 37.70), "cN2": (35.00, 37.40), "gc3": (34.10, 37.35), "cW": (32.20, 36.70), "lpS1": (32.20, 36.00), "cOff2": (34.80, 36.05),
    "lpA": (28.30, 36.60), "lpB": (29.30, 37.00), "lpC": (30.30, 37.30), "lpD": (31.50, 37.35), "lpE": (32.60, 37.10), "lpS2": (28.30, 35.90),
    "asW1": (25.8, 36.5), "asW2": (25.6, 39.0), "asW3": (25.6, 39.9), "hel1": (26.15, 40.05), "hel2": (26.60, 40.35),
    "prop1": (27.60, 40.60), "bi1": (28.40, 40.62), "prop2": (28.95, 40.85), "bos2": (29.05, 41.10), "bos1": (29.20, 41.30),
    "bi2": (28.50, 40.10), "bi3": (29.80, 39.60), "ag1": (30.60, 39.20), "ag2": (30.80, 38.40), "ag3": (30.60, 37.70),
    "bpN1": (31.5, 41.7), "bpN2": (34.0, 42.3), "bpE1": (36.3, 41.6), "bpE2": (36.0, 40.9), "bg1": (34.0, 41.2), "bg2": (32.2, 40.9), "bg3": (30.9, 40.1),
    "gE1": (37.6, 40.7), "gc1": (35.0, 39.8), "gc2": (34.0, 38.6), "cpE1": (39.0, 40.2), "cpE2": (38.8, 38.6), "cpSE": (37.5, 37.8),
    "nes1": (24.70, 40.75), "nes2": (24.75, 41.40), "th1": (23.60, 42.30), "th2": (26.00, 42.70), "th3": (27.90, 42.70), "thS": (25.30, 40.20),
    "mo1": (28.70, 43.00), "mo2": (29.50, 43.60),
    "mk1": (22.5, 42.2), "mk2": (21.0, 42.25), "mk3": (20.2, 42.0), "mk4": (19.0, 41.85), "mk5": (19.1, 40.3),
    "ma1": (20.0, 40.1), "ma2": (21.2, 39.9), "ma3": (22.0, 39.2), "ma4": (22.75, 38.85), "ma5": (23.4, 39.15), "ma6": (24.3, 39.5), "mkSea": (24.5, 40.3),
    "acS": (25.0, 36.1), "acSW": (21.0, 36.3), "acW": (19.5, 39.0), "il1": (21.0, 43.5), "il2": (16.0, 43.5), "il3": (16.0, 42.5),
    "pa1": (40.5, 41.0), "pa2": (45.0, 43.0), "pa3": (56.0, 43.0), "pa4": (56.0, 25.5), "pa5": (50.5, 27.5), "pa6": (48.0, 29.8), "pa7": (42.5, 32.5),
}


def T(name, color, label, *rings, small=False, hide=()):
    """A territory: name, colour, label point and one or more rings of point names.  `hide` lists general region labels
    (from the app's map labels) that this territory's own name replaces."""
    return {"n": name, "c": color, "l": label, "rings": [list(r) for r in rings], "small": small, "hide": list(hide)}


# ---------------------------------------------------------------- layers
LAYERS = []

LAYERS.append({
    "id": "nations", "title": "Nations in Moses' day", "date": "c. 1400 BC", "era": "ot", "regions": "hide", "keep": ["GOSHEN", "NEGEV"],
    "items": [
        T("Egypt", "#d4a85a", (31.0, 26.8), ["eg1", "eg2", "eg3", "eg4", "eg5", "eg6", "eg7", "eg8", "eg9"]),
        T("Canaan", "#6fa35e", (35.05, 32.25), ["cRaphia", "cEgypt", "brookEgypt", "azmon", "kadesh", "zin", "akrabbim", "jDSs", "jDSm", "jDSn",
                                                 "jJericho", "jEph", "jSJ", "jAdam", "jJabesh", "jIss", "jYarmuk", "jGalS", "jGalM", "jGalN", "cnE",
                                                 "cnNE", "cnN", "cNorth"]),
        T("Bashan (Og)", "#9bbf7a", (36.25, 32.85), ["cnE", "jGalN", "jGalM", "jGalS", "jYarmuk", "jIss", "jJabesh", "jAdam", "jabbok1", "jabbok2",
                                                     "jabbok3", "ammonNE", "bsSE", "bsE", "bsN"]),
        T("Amorites (Sihon)", "#7d9cc4", (35.74, 31.82), ["jAdam", "jSJ", "jEph", "jJericho", "jDSn", "jDSm", "arnonE", "moabNE", "ammonS", "sihE",
                                                         "rabbahW", "jabbok2", "jabbok1"]),
        T("Ammon", "#d98b4f", (36.18, 31.92), ["jabbok2", "rabbahW", "sihE", "ammonS", "ammonE", "ammonNE", "jabbok3"], small=True),
        T("Moab", "#b07fb3", (35.85, 31.22), ["jDSm", "jDSs", "zeredE", "moabE", "moabNE", "arnonE"]),
        T("Edom", "#c0653d", (35.55, 30.45), ["jDSs", "akrabbim", "arabah2", "aqaba", "edomS", "edomE", "zeredE"]),
        T("Midian", "#c9b25a", (35.95, 28.20), ["aqaba", "gA1", "gA2", "mdW", "mdS", "mdE", "edomS"]),
    ],
})

TRIBE_COLORS = {"Reuben": "#c0392b", "Gad": "#8e44ad", "Manasseh (east)": "#1e8449", "Manasseh (west)": "#58b36d", "Ephraim": "#2471a3",
                "Benjamin": "#e67e22", "Judah": "#c9a227", "Simeon": "#935116", "Dan": "#e84393", "Zebulun": "#17a2b8",
                "Issachar": "#5c6bc0", "Asher": "#d98880", "Naphtali": "#7d8c3c"}
SIMEON = ["s1", "s2", "s3", "s4", "s5", "s6"]
LAYERS.append({
    "id": "tribes", "title": "The twelve tribes", "date": "Joshua 13–19", "era": "ot", "regions": "hide", "keep": ["NEGEV"],
    "items": [
        T("Asher", TRIBE_COLORS["Asher"], (35.22, 33.15), ["cCarmel", "jokneam", "z1", "kabul", "zN", "a2", "a3", "a4", "nN", "cSidon"]),
        T("Zebulun", TRIBE_COLORS["Zebulun"], (35.30, 32.76), ["jokneam", "zS1", "tabor", "zE", "zNE", "zN", "kabul", "z1"], small=True),
        T("Issachar", TRIBE_COLORS["Issachar"], (35.43, 32.58), ["zS1", "mW", "jenin", "gilboa", "jIss", "jYarmuk", "jGalS", "iN", "tabor"], small=True),
        T("Naphtali", TRIBE_COLORS["Naphtali"], (35.47, 33.03), ["tabor", "iN", "jGalS", "jGalM", "jGalN", "jHula", "d4", "d0", "d1", "nN", "a4", "a3",
                                                             "a2", "zN", "zNE", "zE"]),
        T("Dan", TRIBE_COLORS["Dan"], (34.88, 31.93), ["cYarkon", "aphek", "bethHoronL", "kiriathJ", "bethShemesh", "timnah", "ekron", "jabneel", "cJabneel"],
          ["d0", "d4", "d3", "d2", "d1"]),
        T("Manasseh", TRIBE_COLORS["Manasseh (west)"], (35.14, 32.38), ["cCarmel", "cKanah", "kanahW", "tappuah", "mich", "mich2", "jAdam", "jJabesh", "jIss",
                                                                        "gilboa", "jenin", "mW", "zS1", "jokneam"]),
        T("Manasseh", TRIBE_COLORS["Manasseh (east)"], (36.05, 32.80), ["d2", "d3", "d4", "jHula", "jGalN", "jGalM", "jGalS", "gv2", "gv1", "mahanaim",
                                                                        "gadNE", "mE3", "mE2", "mE1", "hermon"]),
        T("Gad", TRIBE_COLORS["Gad"], (35.76, 32.08), ["gadNE", "mahanaim", "gv1", "gv2", "jGalS", "jYarmuk", "jIss", "jJabesh", "jAdam", "jSJ", "jEph",
                                                       "jJericho", "rgE", "ammonW"]),
        T("Reuben", TRIBE_COLORS["Reuben"], (35.78, 31.64), ["jJericho", "jDSn", "jDSm", "arnonE", "reubenE", "rgE"]),
        T("Ephraim", TRIBE_COLORS["Ephraim"], (35.22, 32.04), ["cKanah", "cYarkon", "aphek", "bethHoronL", "bethel", "eb2", "jEph", "jSJ", "jAdam", "mich2",
                                                               "mich", "tappuah", "kanahW"]),
        T("Benjamin", TRIBE_COLORS["Benjamin"], (35.30, 31.85), ["bethHoronL", "kiriathJ", "nephtoah", "enrogel", "bj1", "jDSn", "jJericho", "jEph", "eb2",
                                                                 "bethel"], small=True),
        T("Judah", TRIBE_COLORS["Judah"], (35.05, 31.55), ["cJabneel", "jabneel", "ekron", "timnah", "bethShemesh", "kiriathJ", "nephtoah", "enrogel", "bj1",
                                                           "jDSn", "jDSm", "jDSs", "akrabbim", "zin", "kadesh", "azmon", "brookEgypt", "cEgypt",
                                                           "cRaphia", "cAshk"], list(reversed(SIMEON))),
        T("Simeon", TRIBE_COLORS["Simeon"], (34.75, 31.20), SIMEON, small=True),
    ],
})

LAYERS.append({
    "id": "kingdoms", "title": "Israel and Judah", "date": "divided kingdom, c. 850 BC", "era": "ot", "regions": "hide", "keep": ["GILEAD", "NEGEV"],
    "items": [
        T("Israel", "#5f88c4", (35.30, 32.42), ["cCarmel", "ph1", "ph2", "ph3", "ph4", "dk1", "dk2", "jGalN", "jGalM", "jGalS", "jYarmuk", "dk3", "dk4",
                                                "dk5", "dk6", "dk7", "dk8", "jDSn", "ij0", "ij1", "ij2", "bethHoronL", "gezer", "aphek", "cYarkon"]),
        T("Judah", "#d6a640", (35.08, 31.40), ["jDSn", "jDSm", "jDSs", "juS1", "juS2", "juS3", "pj5", "pj4", "pj3", "pj2", "pj1", "gezer", "bethHoronL",
                                                "ij2", "ij1", "ij0"]),
        T("Philistia", "#c86b5a", (34.62, 31.62), ["cYarkon", "aphek", "gezer", "pj1", "pj2", "pj3", "pj4", "pj5", "cRaphia"]),
        T("Phoenicia", "#8f7bb8", (35.35, 33.62), ["cCarmel", "ph1", "ph2", "ph3", "ph4", "dk1", "ar1", "phN", "phOff"]),
        T("Aram", "#6fa35e", (36.45, 33.40), ["dk1", "ar1", "phN", "ar2", "ar3", "ar4", "aramAmmon", "dk5", "dk4", "dk3", "jYarmuk", "jGalS", "jGalM",
                                              "jGalN", "dk2"]),
        T("Ammon", "#d98b4f", (36.12, 32.02), ["dk7", "dk6", "dk5", "aramAmmon", "ammonS2", "moabNE2", "dk8"], small=True),
        T("Moab", "#b07fb3", (35.85, 31.40), ["jDSn", "dk8", "moabNE2", "moabE2", "zeredE", "jDSs", "jDSm"]),
        T("Edom", "#c0653d", (35.55, 30.45), ["jDSs", "zeredE", "edomE", "edomS", "aqaba", "arabah2", "juS1"]),
    ],
})

LAYERS.append({
    "id": "nt", "title": "Palestine in Jesus' day", "date": "c. AD 30", "era": "nt", "regions": "hide",
    "items": [
        T("Galilee", "#5f9e5f", (35.34, 32.84), ["gS0", "phNT1", "phNT2", "phNT3", "gN", "jGalN", "jGalM", "jGalS", "gS2", "gS1"]),
        T("Samaria", "#d8a548", (35.20, 32.30), ["cCarmel", "gS0", "gS1", "gS2", "sc1", "sc2", "jJabesh", "jAdam", "jSJ", "acrabeta", "anuathu", "antipatris",
                                                 "cYarkon"]),
        T("Judea", "#c86b5a", (35.06, 31.78), ["cYarkon", "antipatris", "anuathu", "acrabeta", "jSJ", "jEph", "jJericho", "jDSn", "jdI", "id1", "id2",
                                               "id3", "cAshk"]),
        T("Idumea", "#b88a5c", (34.88, 31.28), ["cAshk", "id3", "id2", "id1", "jdI", "jDSs", "idS1", "idS2", "cGaza2"]),
        T("Perea", "#6f93c4", (35.66, 31.98), ["jJabesh", "peN", "peE2", "peE1", "peS", "jdI", "jDSn", "jJericho", "jEph", "jSJ", "jAdam"]),
        T("Decapolis", "#9b7bb8", (35.98, 32.50), ["sc1", "gS2", "jGalS", "jGalM", "hippN", "deN", "deE", "deE2", "phila", "peE1", "peE2", "peN", "jJabesh",
                                                   "sc2"]),
        T("Iturea & Trachonitis", "#4f9e9a", (36.25, 33.12), ["gN", "itN1", "itN2", "itE", "itSE", "deE", "deN", "hippN", "jGalM", "jGalN"]),
        T("Phoenicia", "#a88fc4", (35.33, 33.50), ["cCarmel", "gS0", "phNT1", "phNT2", "phNT3", "phNT4", "phNTn", "phOff"]),
        T("Syria", "#9aae78", (36.90, 34.20), ["phNT4", "phNT3", "gN", "itN1", "itN2", "itE", "nabE1", "syE", "syN", "phNTn"]),
        T("Nabatea", "#d4a85a", (36.60, 30.70), ["jDSs", "jdI", "peS", "peE1", "phila", "deE2", "deE", "itSE", "nabE1", "nabE2", "nabS", "gA2", "gA1", "aqaba",
                                                 "arabah2", "idS1"]),
    ],
})

LAYERS.append({
    "id": "provinces", "title": "Roman provinces", "date": "Paul's day, c. AD 50", "era": "nt", "regions": "dedupe",
    "items": [
        T("Italia", "#c9a35a", (14.6, 41.6), ["it1", "it2", "it3", "it4", "it5", "it6", "it7", "it8", "messS", "messN", "it9", "it10", "it11", "it12"]),
        T("Sicilia", "#d98b4f", (14.1, 37.55), ["si1", "messN", "messS", "si2", "si3"], small=True, hide=["SICILY"]),
        T("Africa", "#b5a46a", (10.1, 35.2), ["af1", "af2", "af3", "af4", "afE1", "afE2", "af5", "af6"]),
        T("Creta & Cyrene", "#8fa8c9", (21.8, 32.2), ["afE1", "cy1", "cy2", "ce1", "ce2", "afE2"], ["cr1", "cr2", "cr3", "cr4"], hide=["CRETE"]),
        T("Aegyptus", "#d4a85a", (30.5, 27.0), ["ce1", "egN1", "egN2", "egNab1", "egNab2", "egNab3", "egNab4", "egS", "ce3", "ce2"], hide=["EGYPT"]),
        T("Judaea", "#c86b5a", (35.10, 31.60), ["egN2", "egNab1", "idS2", "idS1", "jDSs", "jdI", "peS", "peE1", "peE2", "peN", "jJabesh", "sc2", "sc1", "gS2",
                                                "jGalS", "jGalM", "jGalN", "gN", "phNT3", "phNT2", "phNT1", "gS0", "cCarmel"], hide=["JUDEA"]),
        T("Arabia (Nabatea)", "#d9b77a", (37.0, 30.2), ["egNab1", "egNab2", "egNab3", "egNab4", "nabArab", "nabS2", "nabE2", "sy1", "nabE1", "itSE", "deE",
                                                         "deE2", "phila", "peE1", "peS", "jdI", "jDSs", "idS1", "idS2"], hide=["ARABIA"]),
        T("Syria", "#8fae6a", (37.6, 34.6), ["cCarmel", "syOff1", "syOff2", "ci1", "ci2", "ci3", "zeugma", "eu1", "eu2", "eu3", "eu4", "sy1", "nabE1", "itSE",
                                             "deE", "deE2", "phila", "peE1", "peE2", "peN", "jJabesh", "sc2", "sc1", "gS2", "jGalS", "jGalM", "jGalN", "gN",
                                             "phNT3", "phNT2", "phNT1", "gS0"], hide=["SYRIA (ARAM)"]),
        T("Cyprus", "#7fb0b0", (33.3, 35.12), ["kp1", "kp2", "kp3", "kp4"], small=True),
        T("Cilicia", "#c27a9a", (34.6, 37.05), ["lpS1", "cW", "lpE", "gc3", "cN2", "cN1", "ci3", "ci2", "ci1", "cOff2"]),
        T("Lycia & Pamphylia", "#d6a640", (30.6, 36.75), ["lpA", "lpB", "lpC", "lpD", "lpE", "cW", "lpS1", "lpS2"], hide=["LYCIA", "PAMPHYLIA"]),
        T("Asia", "#6f93c4", (28.3, 38.6), ["asW3", "hel1", "hel2", "prop1", "bi1", "bi2", "bi3", "ag1", "ag2", "ag3", "lpC", "lpB", "lpA", "lpS2", "asW1",
                                            "asW2"]),
        T("Bithynia & Pontus", "#9b7bb8", (32.0, 41.25), ["bi1", "prop2", "bos2", "bos1", "bpN1", "bpN2", "bpE1", "bpE2", "bg1", "bg2", "bg3", "bi3", "bi2"], hide=["BITHYNIA", "PONTUS"]),
        T("Galatia", "#5f9e5f", (33.0, 39.3), ["bi3", "bg3", "bg2", "bg1", "bpE2", "gE1", "gc1", "gc2", "gc3", "lpE", "lpD", "lpC", "ag3", "ag2", "ag1"]),
        T("Cappadocia", "#c0653d", (36.6, 38.9), ["gc3", "gc2", "gc1", "gE1", "cpE1", "cpE2", "cpSE", "cN1", "cN2"]),
        T("Thracia", "#b07fb3", (26.0, 41.6), ["nes1", "nes2", "th1", "th2", "th3", "bos1", "bos2", "prop2", "bi1", "prop1", "hel2", "hel1", "thS"], hide=["THRACE"]),
        T("Moesia", "#8fa8c9", (25.0, 42.85), ["th1", "mk1", "mk2", "il1", "mo2", "mo1", "th3", "th2"], small=True),
        T("Macedonia", "#d98b4f", (22.3, 40.9), ["nes1", "mkSea", "ma6", "ma5", "ma4", "ma3", "ma2", "ma1", "mk5", "mk4", "mk3", "mk2", "mk1", "th1", "nes2"]),
        T("Achaia", "#4f9e9a", (22.2, 38.0), ["mk5", "ma1", "ma2", "ma3", "ma4", "ma5", "ma6", "asW2", "asW1", "acS", "acSW", "acW"]),
        T("Illyricum", "#9aae78", (19.4, 42.55), ["mk4", "mk3", "mk2", "il1", "il2", "il3"], small=True),
        T("Parthian Empire", "#a99a8a", (46.5, 34.0), ["eu4", "eu3", "eu2", "eu1", "zeugma", "cpE2", "cpE1", "pa1", "pa2", "pa3", "pa4", "pa5", "pa6", "pa7"]),
    ],
})

# ---------------------------------------------------------------- ancient roads
ROADS = [
    {"n": "Way of the Sea", "era": "all", "ref": "ISA.9.1",
     "pts": [(32.55, 31.04), (33.30, 31.10), (33.80, 31.12), (34.25, 31.29), (34.46, 31.50), (34.65, 31.75), (34.74, 31.87), (34.93, 32.10),
             (34.97, 32.35), (35.18, 32.58), (35.40, 32.72), (35.53, 32.87), (35.57, 33.02), (35.64, 33.00), (35.90, 33.20), (36.30, 33.51)]},
    {"n": "King's Highway", "era": "all", "ref": "NUM.20.17",
     "pts": [(35.00, 29.55), (35.30, 29.95), (35.44, 30.33), (35.61, 30.73), (35.68, 30.98), (35.70, 31.18), (35.78, 31.50), (35.80, 31.72),
             (35.81, 31.80), (35.93, 31.95), (35.89, 32.28), (35.98, 32.47), (36.10, 32.62), (36.02, 32.80), (36.20, 33.15), (36.30, 33.51)]},
    {"n": "Ridge Route", "era": "ot", "ref": "GEN.12.6",
     "pts": [(34.80, 31.25), (34.98, 31.40), (35.10, 31.53), (35.20, 31.70), (35.23, 31.78), (35.22, 31.93), (35.29, 32.06), (35.28, 32.21),
             (35.24, 32.41), (35.33, 32.56)]},
    {"n": "Way of Shur", "era": "ot", "ref": "GEN.16.7",
     "pts": [(34.80, 31.25), (34.55, 30.95), (34.10, 30.75), (33.40, 30.65), (32.55, 30.55)]},
    {"n": "Royal Road", "era": "ot", "ref": "EST.8.10",
     "pts": [(28.04, 38.49), (29.4, 38.7), (30.8, 39.2), (32.85, 39.93), (34.5, 39.6), (36.0, 39.0), (38.3, 38.35), (39.6, 37.6), (41.2, 37.07),
             (42.6, 36.6), (44.0, 36.19), (45.3, 35.0), (46.6, 33.6), (48.25, 32.19)]},
    {"n": "Via Egnatia", "era": "nt", "ref": "ACT.16.11-12",
     "pts": [(19.45, 41.32), (20.10, 41.10), (20.80, 41.12), (21.33, 41.01), (22.05, 40.80), (22.52, 40.76), (22.94, 40.64), (23.43, 40.65),
             (23.85, 40.82), (24.28, 41.01), (24.40, 40.94), (24.95, 40.97), (26.00, 40.95), (26.40, 40.92), (27.95, 40.97), (28.97, 41.01)]},
    {"n": "Common Highway", "era": "nt", "ref": "ACT.19.1",
     "pts": [(27.35, 37.94), (27.85, 37.86), (29.11, 37.84), (29.26, 37.79), (30.17, 38.07), (31.19, 38.31), (32.49, 37.87), (33.22, 37.18),
             (34.78, 37.28), (34.90, 36.92), (35.32, 37.00), (35.62, 36.96), (36.17, 36.84), (36.25, 36.48), (36.16, 36.20)]},
    {"n": "Via Appia", "era": "nt", "ref": "ACT.28.15",
     "pts": [(12.48, 41.89), (12.86, 41.62), (13.08, 41.47), (13.25, 41.29), (14.25, 41.08), (14.78, 41.13), (16.30, 40.95), (17.94, 40.64)]},
    {"n": "", "era": "nt", "ref": "ACT.28.13-14", "pts": [(14.12, 40.82), (14.25, 41.08)]},
]


# ---------------------------------------------------------------- geometry helpers
def resolve(ring):
    return [(v, P[v]) if isinstance(v, str) else (None, tuple(v)) for v in ring]


def anchors_for(layer):
    """Named points where neighbouring territories part ways stay fixed when the borders are smoothed."""
    pairs: dict[str, set] = {}
    for item in layer["items"]:
        for ring in item["rings"]:
            n = len(ring)
            for i, v in enumerate(ring):
                if not isinstance(v, str):
                    continue
                a, c = ring[i - 1], ring[(i + 1) % n]
                key = frozenset([a if isinstance(a, str) else repr(a), c if isinstance(c, str) else repr(c)])
                pairs.setdefault(v, set()).add(key)
    return {v for v, s in pairs.items() if len(s) > 1}


def chaikin(ring, fixed, rounds=2):
    """Corner-cutting that leaves fixed points in place.  Because every interior point of a shared border has the same
    neighbours in both territories, both sides of the border are smoothed identically."""
    pts = [(xy, name in fixed) for name, xy in ring]
    for _ in range(rounds):
        out = []
        n = len(pts)
        for i, (p, fx) in enumerate(pts):
            if fx:
                out.append((p, True))
                continue
            a, c = pts[i - 1][0], pts[(i + 1) % n][0]
            out.append(((0.75 * p[0] + 0.25 * a[0], 0.75 * p[1] + 0.25 * a[1]), False))
            out.append(((0.75 * p[0] + 0.25 * c[0], 0.75 * p[1] + 0.25 * c[1]), False))
        pts = out
    return [p for p, _ in pts]


def catmull(pts, steps=5):
    """Smooth road through its waypoints."""
    if len(pts) < 3:
        return pts
    ext = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(pts[-1])
    return out


def r3(p):
    return [round(p[0], 3), round(p[1], 3)]


def main():
    layers = []
    for layer in LAYERS:
        fixed = anchors_for(layer)
        items = []
        for it in layer["items"]:
            rings = [[r3(p) for p in chaikin(resolve(r), fixed)] for r in it["rings"]]
            items.append({"n": it["n"], "c": it["c"], "l": [it["l"][0], it["l"][1]], "r": rings, **({"s": 1} if it["small"] else {}), **({"hide": it["hide"]} if it["hide"] else {})})
        layers.append({k: layer[k] for k in ("id", "title", "date", "era", "regions", "keep") if k in layer} | {"items": items})
    roads = [{"n": r["n"], "era": r["era"], "ref": r["ref"], "p": [r3(p) for p in catmull(r["pts"])]} for r in ROADS]
    with open(OUT, "w") as f:
        json.dump({"layers": layers, "roads": roads}, f, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB, {sum(len(l['items']) for l in layers)} territories, {len(roads)} roads)")


if __name__ == "__main__":
    main()
