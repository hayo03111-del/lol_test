# ARAM (Howling Abyss) rules research: patch 26.x (as of 2026-10-22)

## How this was researched (read first)
- I could not open any page directly. WebFetch and curl to wiki.leagueoflegends.com, leagueoflegends.fandom.com, leagueoflegends.com and web.archive.org were all refused (DNS failure / proxy 403).
- Every value below therefore comes from **web-search result summaries** (snippets of the cited pages). None of it was read from the full live page.
- Confidence labels:
  - **A** = wiki or official patch-note snippet quoted with the number, and consistent across sources.
  - **B** = wiki snippet, but sources conflict or the page may be stale.
  - **C** = third-party source or inference only.
- Before hard-coding a number, open the URL in a browser.
- Note: since 25.13 / Oct 2025, ARAM rotates between three maps: Howling Abyss, Butcher's Bridge and Koeshin's Crossing. ARAM: Mayhem is a separate mode with its own economy, so none of its values are used here.

---

## 1. Champion kill gold (ARAM)

| Rule | ARAM value | SR value (for contrast) | Source | Patch | Conf. |
|---|---|---|---|---|---|
| Base kill bounty | **180 g** | 300 g base, scaling 300→420 with level (third-party: 300 until lv6, then +10/lv up to 420) | wiki ARAM page; ARAM/Patch history ("base champion bounty increased to 180 from 160") | 180 set in V10.23 (it had been 160; before that 140→160). No later change found. | A (ARAM 180) / B (SR level scaling) |
| Bounty accrual (replaces kill streaks) | **+1 bounty gold per 2 gold earned from kills+assists**, up to **+600 above base (900 total)**. Any excess carries over to the following death(s). | SR: bounty is based on total gold from all sources (since 14.21). 26.3 changed the rates to devalue 1 per 3.5 g given (was 2.5) and revalue 1 per 7 g farmed (was 5). | wiki ARAM; V14.24 wiki page; Patch 14.24 notes | V14.24 (Dec 2024); no 2025–26 ARAM change found | A |
| Bounty decay | **−1 bounty gold per 4 gold distributed** to the killer and assisters | SR uses a different rate (1:3.5 family) | wiki ARAM; V14.24 | V14.24 | A/B |
| Tiered kill/death streaks | **Removed** in ARAM. Bounty no longer depends on kill or death streaks, and an assist no longer raises the assister's tier. | SR 14.21: no positive streaks. Negative bounty is a flat devaluation that also lowers assist gold. 26.1 doubled SR rates (devalue 0.2→0.4 per gold given, revalue 0.1→0.2 per gold earned). | ARAM/Patch history; Patch 26.1 notes | 14.24 (ARAM), 26.1 (SR) | A |
| Death-streak reduction | No separate death-streak table in ARAM. Decay (above) is the only mechanism. | SR: dynamic devaluation (see above) | same | — | B |
| Shutdown | ARAM: the accrued bounty (max +600) is the shutdown. Howling Abyss rule: bounties can rise in the same moment kills/assists are earned, and are paid out even if the champion dies right after a multikill. | SR: after 6:00, shutdown is cut by 30/60/90/100% when the team isn't convincingly ahead | wiki Champion gold bounties | — | B |
| First blood | No ARAM-specific value found. SR 26.1 restored **+100 g to the killer** (it had been removed in 25.S1 when Feats of Strength launched). Whether +100 applies in ARAM is unverified. | +100 g (26.1, Jan 7 2026) | Patch 26.1 notes; wiki V26.01 | 26.1 | A (SR) / C (ARAM) |
| Assist gold | **A flat extra 90 g, split equally among all assisters** (assists are generated on top of the killer's full bounty) | SR: assist pool = 50% of the dispensed bounty, capped at 50% of base (≈150), split equally. Before 3:30 it is reduced to 50–100% (scaling from 1:30 to 3:30). | wiki ARAM page snippet ("Assists always generate an additional 90 gold"); wiki Assist / Champion gold bounties | Not stated | B (ARAM 90 seen in two summaries but not quoted as a patch line) |
| Early-game bounty reduction | A summary claimed "all bounties reduced to 50%–100% (based on game time) early" on the ARAM page, but another search could not confirm it | SR assist-gold ramp as above | wiki ARAM (unconfirmed) | — | C |
| Assist / kill-credit window | **20 s** on Howling Abyss (vs 15 s on SR). It is measured back from the death, and every new contribution resets it. Execution (no champion damage in the window) is also 20 s. | 15 s | wiki Assist; wiki Kill | Not stated (the old "10 s" figure on fandom is outdated) | A |

URLs:
- https://wiki.leagueoflegends.com/en-us/ARAM
- https://wiki.leagueoflegends.com/en-us/ARAM/Patch_history
- https://wiki.leagueoflegends.com/en-us/V14.24 , https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-24-notes/
- https://wiki.leagueoflegends.com/en-us/Champion_gold_bounties
- https://wiki.leagueoflegends.com/en-us/Assist , https://wiki.leagueoflegends.com/en-us/Kill
- https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/ , https://wiki.leagueoflegends.com/en-us/V26.01
- https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-3-notes/ (SR bounty rates)

Suggested sim model (ARAM):
- killer gets `180 + bounty`;
- assisters split 90 g equally;
- the victim's `bounty += 0.5 × (kill+assist gold earned)`, capped at 600;
- on payout, `bounty -= paid/4`.

---

## 2. Champion kill experience

| Rule | Value | Source | Conf. |
|---|---|---|---|
| Solo kill XP (one eligible recipient) | **42 – 990 XP, based on the slain champion's level.** Use the wiki's per-level table. Older guides say 40–990. | wiki Experience (champion) | A (endpoints) |
| Shared XP (more than one eligible) | Total pool **27.97 – 891 XP** (by victim level), split equally among eligible allies. Patch history also mentions per-recipient shared-XP multipliers of 66.6 / 82 / 90% by recipient level. | wiki Experience (champion); fandom patch history | A (pool) / B (multipliers) |
| Victim higher level than recipient | **+20% per full level of difference beyond the first** (0% at 1.0 level diff). Patch history: the modifier went 16% → 20%. | wiki Experience (champion) | A/B |
| Victim lower level than recipient | XP is reduced. The penalty is **capped at −60%** (minimum 40% of base). Fandom gives steps of 24 / 48 / 60% by level gap. | wiki; fandom | A (cap) / B (steps) |
| Sharing range | **1600 units** from the death location. The killer and assisters always get their share regardless of range or alive state. Allies who died in the last 10 s (non-participants) still earn it if in range. | wiki Experience (champion) | A |
| ARAM-specific | No ARAM-specific kill-XP formula found. ARAM differs only through the Howling Abyss aura (**+5 XP/s passive**) and starting at **level 3** (patch 8.11: start with 662 XP, the normal level-3 amount). 25.23 (Mayhem) tuned "passive XP/gold" without published numbers. | wiki ARAM; Howling abyss aura template | A (5 XP/s), B (lv3) |

URLs:
- https://wiki.leagueoflegends.com/en-us/Experience_(champion)
- https://leagueoflegends.fandom.com/wiki/Experience_(champion)
- https://wiki.leagueoflegends.com/en-us/Template:Tip_data/Howling_abyss_aura

---

## 3. ARAM minion gold / XP, passive gold, start

### Minion gold

| Minion | ARAM gold | Growth | SR (contrast) | Source | Conf. |
|---|---|---|---|---|---|
| Melee | **20** | +0.125 per 90 s | SR melee 21→20 in V26.01 | wiki Melee minion | A |
| Caster | **17** | +0.125 per 90 s | SR 14 | wiki Caster minion | A |
| Siege | **45** (Siege minion page) vs **52** (ARAM page); conflict | +0.35 per 90 s | SR 60→90 | wiki Siege minion; wiki ARAM | B |
| Super | Not found | — | — | — | — |

- History: the ARAM patch history shows melee 28→20 and caster 20→17. The version is not shown in the snippets (pre-2025 as far as I could tell).
- Siege waves: siege minions spawn every 2nd wave, starting with wave 3 (wiki Siege minion).
- 25.23 (ARAM: Mayhem only) removed double super minions.

### Minion XP

| Item | Value | Source | Conf. |
|---|---|---|---|
| Base XP | Melee **64**, Caster **32** (Caster page: 31), Siege **94** | wiki ARAM | B |
| Sharing | Total XP is split among champions in range. Multipliers: solo **100%** (from 95%); shared **130%** (from 124%, earlier 116%). These come from the general Experience page and probably apply on all maps. Shared-XP examples from the Minion page: melee 76.8, caster 38.4, siege/super 120. | wiki Experience (champion); wiki Minion | B |
| XP range | **1500** units (raised from 1400) | wiki Minion | B |

### Aura gold, passive gold and start

| Item | Value | Source | Conf. |
|---|---|---|---|
| Aura minion gold | If alive and within **1250** units of a dying enemy minion you did not last-hit: **+6 gold** | Howling abyss aura template | A |
| Passive gold | **60 g / 10 s, starting at 1:00** (current wiki Gold page and ARAM page). The older figure is 55 (fandom). The patch of the 55→60 change was not found. | wiki Gold | A |
| Starting gold / level | **1400 g, level 3** | wiki Gold; ARAM guides | A |
| Other aura effects (for completeness) | **+70** summoner spell haste; **0.1%** max mana regen/s; outgoing heals on others **−50%**; lifesteal/omnivamp vs minions **−40%**; damage from champions **>1000 units away × 85→70%** (by distance) | aura template | A/B |

URLs:
- https://wiki.leagueoflegends.com/en-us/Melee_minion
- https://wiki.leagueoflegends.com/en-us/Caster_minion
- https://wiki.leagueoflegends.com/en-us/Siege_minion
- https://wiki.leagueoflegends.com/en-us/Minion
- https://wiki.leagueoflegends.com/en-us/Gold
- https://wiki.leagueoflegends.com/en-us/ARAM/Patch_history

---

## 4. Structures and backdoor protection

| Item | Value | Source | Patch | Conf. |
|---|---|---|---|---|
| Turret backdoor ("Reinforced Armor") | **80% damage reduction, including true damage**, while **no enemy minions** (or Summoned Rift Herald) are nearby. Pets, stealthed traps and neutral monsters do not count. The range was not shown in the snippets (historically ~1000 units; unverified). | wiki Turret | 14.1: 66.67% → 80% | A (80%), C (range) |
| Inhibitor / Nexus | **No backdoor protection.** Inhibitors and the Nexus take full champion damage. | wiki Turret | — | A |
| ARAM inhibitor turret | **3900 HP** (+250 per enemy champion per the Turret page), armor **75–96** (scales with minutes), AD **195–375** | ARAM/Patch history V25.21; wiki Turret | V25.21: HP 3500 → 3900 | B (Turret page also shows 4750 HP / 60 armor, probably another variant) |
| ARAM inhibitor respawn | **250 s** (was 300 s) | ARAM/Patch history V25.21 | V25.21 (Oct/Nov 2025) | B |
| Map layout | Per side: outer turret, inhibitor turret, inhibitor, 2 Nexus turrets, Nexus | wiki Classic / ARAM | — | A |
| Not found | ARAM outer and Nexus turret HP, inhibitor HP/armor, Nexus HP | — | — | — |

URLs:
- https://wiki.leagueoflegends.com/en-us/Turret
- https://wiki.leagueoflegends.com/en-us/Backdoor
- https://wiki.leagueoflegends.com/en-us/ARAM/Patch_history
- https://wiki.leagueoflegends.com/en-us/Howling_Abyss

---

## 5. Ashe Q: Ranger's Focus (current, after 26.10)

| Field | Current value | History | Source | Conf. |
|---|---|---|---|---|
| Bonus attack speed | **20 / 30 / 40 / 50 / 60%** | 25.S1.1: 25/32.5/40/47.5/55 → 25/35/45/55/65. 25.09: → 25/37.5/50/62.5/75. **25.23 (Nov 18 2025): → 20/30/40/50/60.** | wiki Ashe/Patch history; V25.23; u.gg / Leaguepedia / Dotesports 25.23 | A |
| Flurry total damage | **110 / 115 / 120 / 125 / 130% AD**, i.e. **22 / 23 / 24 / 25 / 26% AD per arrow × 5 arrows** | 25.04: 110–130 → 111/117/123/129/135. 25.09: → 110/117.5/125/132.5/140 (22/23.5/25/26.5/28 per arrow). **26.10: → 110/115/120/125/130.** | wiki Ashe/Patch history; Sportskeeda/Dexerto 25.04 | A/B (sequence assembled from summaries) |
| Arrows | 5 per flurry. The first flurry after a cast has **6 arrows** (+20%): 132/138/144/150/156% AD. | wiki Ashe | A |
| Duration | **6 s** | wiki Ashe | A |
| Focus stacks | **4 needed** (max reduced 5 → 4). Stacks fall off one per second after 4 s without gaining. | wiki Ashe | A |
| Cost | **30 mana** (+ all Focus), cooldown 0 | wiki Ashe; metabot 26.20 | A |
| Unrelated | 26.10 also lowered W (Volley) bonus-AD ratio 110 → 100%. 26.1 cut her late-game AS/AD growth. | — | B |

- Check for ARAM-specific Ashe damage modifiers (ARAM balance changes per champion). The tracker https://www.aramnerfs.com/ lists them; not checked for Ashe.

URLs:
- https://wiki.leagueoflegends.com/en-us/Ashe
- https://wiki.leagueoflegends.com/en-us/Ashe/Patch_history
- https://wiki.leagueoflegends.com/en-us/Template:Data_Ashe/Ranger's_Focus
- https://wiki.leagueoflegends.com/en-us/V25.23

---

## 6. ARAM respawn timer

| Source | Formula | Conf. |
|---|---|---|
| wiki Death (current) | **Level-only; game time has no effect.** Per level 3→18: **11 / 13 / 15 / 17 / 19 / 21 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 s.** The 16 values map to levels 3–18; the level mapping is my inference. | B |
| fandom Death (older) | `2 × level + 4` (10 s at lv3, 40 s at lv18) | C (superseded) |

- SR, for contrast: base respawn by level plus a game-time multiplier after 15:00. Not researched in detail.

URLs:
- https://wiki.leagueoflegends.com/en-us/Death
- https://leagueoflegends.fandom.com/wiki/Death

---

## Biggest open items (check directly in a browser)

1. ARAM assist gold: confirm the flat 90 g, and whether first blood +100 applies in ARAM.
2. ARAM siege minion gold (45 vs 52), plus super minion gold.
3. The respawn per-level mapping.
4. ARAM outer and Nexus turret / inhibitor / Nexus HP.
5. Backdoor range.
