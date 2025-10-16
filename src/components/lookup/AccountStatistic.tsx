import React from "react";
import operatorJson from "data/operators";
import { LookupData } from "util/hooks/useLookup";
import { OperatorData } from "types/operators/operator";

// Types requested
export type StatsEntry = {
  [key: number]: {
    have: number[];
    total?: number[];
  };
};

export type StatsData = {
  [key: string]: {
    entries: StatsEntry;
    have: number;
    total: number;
  };
};

function createArray(length: number, fill = 0): number[] {
  return Array.from({ length }, () => fill);
}

// no array-wide summations; we aggregate during increments

function isOperatorVisible(opData: OperatorData, isCn: boolean): boolean {
  // Exclude CN-only operators when server isn't CN
  return isCn || !opData.isCnOnly;
}

const AccountStatistic: React.FC<{ data: NonNullable<LookupData> }> = ({ data }) => {
  const { roster, account } = data;
  const isCn = (account.server ?? "").toLowerCase() === "cn";

  const stats = React.useMemo<StatsData>(() => {
    // Initialize stats structure with zeroes
    const s: StatsData = {
      operators: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      rarity: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      elite1: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      elite2: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      level: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      masteries: {
        entries: {
          0: { have: createArray(6), total: createArray(6) },
          1: { have: createArray(3) },
          2: { have: createArray(3) },
          3: { have: createArray(3) },
        },
        have: 0,
        total: 0,
      },
      modules: {
        entries: {
          0: { have: createArray(6), total: createArray(6) },
          1: { have: createArray(3) },
          2: { have: createArray(3) },
          3: { have: createArray(3) },
        },
        have: 0,
        total: 0,
      },
      potential: { entries: { 0: { have: createArray(6), total: createArray(6) } }, have: 0, total: 0 },
      masteryOperators: {
        entries: {
          1: { have: createArray(3) },
          2: { have: createArray(3) },
          3: { have: createArray(3) },
          6: { have: createArray(3) },
          9: { have: createArray(3) },
        },
        have: 0,
        total: 0,
      },
      moduleOperators: {
        entries: {
          1: { have: createArray(3) },
          2: { have: createArray(3) },
          3: { have: createArray(3) },
          6: { have: createArray(3) },
          9: { have: createArray(3) },
        },
        have: 0,
        total: 0,
      },
    };

    // increment helper
    const inc = (
      key: keyof StatsData,
      entryId: number,
      rarityIndex: number,
      opts: { have?: number; total?: number; updateTopLevelForAnyEntry?: boolean } = {}
    ) => {
      const bucket = s[key as string];
      const entry = bucket.entries[entryId];
      const haveDelta = opts.have ?? 0;
      const totalDelta = opts.total ?? 0;
      const updateTop = opts.updateTopLevelForAnyEntry === true || entryId === 0;

      if (haveDelta) {
        entry.have[rarityIndex] += haveDelta;
        if (updateTop) bucket.have += haveDelta;
      }
      if (entry.total && totalDelta) {
        entry.total[rarityIndex] += totalDelta;
        if (updateTop) bucket.total += totalDelta;
      }
    };

    // Loop through operators.json entries
    for (const [opId, opData] of Object.entries(operatorJson)) {
      if (!isOperatorVisible(opData, isCn)) continue;
      const rarityIndex = Math.max(0, Math.min(5, (opData.rarity ?? 1) - 1)); // 1-6 -> 0-5

      // Operators (counts by rarity)
      inc("operators", 0, rarityIndex, { total: 1 });
      inc("rarity", 0, rarityIndex, { total: 1 });

      const owned = !!roster[opId];
      if (owned) {
        inc("operators", 0, rarityIndex, { have: 1 });
        inc("rarity", 0, rarityIndex, { have: 1 });
      }

      // Potential (sum of potential slots vs owned potential levels)
      const totalPotentialSlots = opData.potentials?.length ?? 0;
      inc("potential", 0, rarityIndex, { total: totalPotentialSlots });
      if (owned) inc("potential", 0, rarityIndex, { have: roster[opId]!.potential ?? 0 });

      // Elite1 & Elite2 availability vs owned state
      const hasE1 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 1);
      const hasE2 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 2);
      if (hasE1) inc("elite1", 0, rarityIndex, { total: 1 });
      if (hasE2) inc("elite2", 0, rarityIndex, { total: 1 });
      if (owned) {
        const elite = roster[opId]!.elite ?? 0;
        if (elite >= 1) inc("elite1", 0, rarityIndex, { have: 1 });
        if (elite >= 2) inc("elite2", 0, rarityIndex, { have: 1 });
      }

      // Skill Levels (total upgrades available vs owned upgrades)
      // JSON lists levels 2..7; we count how many upgrade steps exist (length), and how many the user has (skill_level - 1)
      const totalSkillUpgrades = opData.skillLevels?.length ?? 0;
      inc("level", 0, rarityIndex, { total: totalSkillUpgrades });
      if (owned) inc("level", 0, rarityIndex, { have: Math.max(0, (roster[opId]!.skill_level ?? 1) - 1) });

      // Masteries totals (how many mastery steps exist on this operator)
      const masteryGoals = (opData.skillData ?? []).flatMap((sd) => sd.masteries ?? []);
      inc("masteries", 0, rarityIndex, { total: masteryGoals.length });

      // Modules totals (how many module stages exist on this operator)
      const moduleStages = (opData.moduleData ?? []).reduce((acc, m) => {
        if (!m) return acc;
        if (!isCn && m.isCnOnly) return acc;
        return acc + (m.stages?.length ?? 0);
      }, 0);
      inc("modules", 0, rarityIndex, { total: moduleStages });

      // Owned-only breakdowns
      if (owned) {
        const op = roster[opId]!;

        // Masteries owned: Exact counts for ==1 / ==2 / ==3
        const masteryLevels = Array.isArray(op.masteries) ? op.masteries : [];
        const m1Exact = masteryLevels.filter((lvl) => lvl === 1).length;
        const m2Exact = masteryLevels.filter((lvl) => lvl === 2).length;
        const m3Exact = masteryLevels.filter((lvl) => lvl === 3).length;
        const masterySteps = masteryLevels.reduce((acc, lvl) => acc + lvl, 0);

        // main spread (by rarity 1..6): total steps achieved across all skills
        inc("masteries", 0, rarityIndex, { have: masterySteps });

        // additional breakdown for rarities 4..6 only
        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4; // 4->0, 5->1, 6->2
          if (m1Exact > 0) inc("masteries", 1, ri, { have: m1Exact });
          if (m2Exact > 0) inc("masteries", 2, ri, { have: m2Exact });
          if (m3Exact > 0) inc("masteries", 3, ri, { have: m3Exact });

          // masteryOperators: by operator flags (exact categories; 6/9 for counts of exactly lvl3 skills)
          if (m1Exact > 0) inc("masteryOperators", 1, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (m2Exact > 0) inc("masteryOperators", 2, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (m3Exact > 0) inc("masteryOperators", 3, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (m3Exact >= 2) inc("masteryOperators", 6, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (m3Exact >= 3) inc("masteryOperators", 9, ri, { have: 1, updateTopLevelForAnyEntry: true });
        }

        // Modules owned: Exact counts for ==1 / ==2 / ==3
        const moduleLevels = Object.values(op.modules ?? {});
        const mod1Exact = moduleLevels.filter((lvl) => lvl === 1).length;
        const mod2Exact = moduleLevels.filter((lvl) => lvl === 2).length;
        const mod3Exact = moduleLevels.filter((lvl) => lvl === 3).length;
        const moduleSteps = moduleLevels.reduce((acc, lvl) => acc + lvl, 0);

        // main spread (by rarity 1..6): total module stages achieved across all modules
        inc("modules", 0, rarityIndex, { have: moduleSteps });

        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4;
          if (mod1Exact > 0) inc("modules", 1, ri, { have: mod1Exact });
          if (mod2Exact > 0) inc("modules", 2, ri, { have: mod2Exact });
          if (mod3Exact > 0) inc("modules", 3, ri, { have: mod3Exact });

          if (mod1Exact > 0) inc("moduleOperators", 1, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (mod2Exact > 0) inc("moduleOperators", 2, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (mod3Exact > 0) inc("moduleOperators", 3, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (mod3Exact >= 2) inc("moduleOperators", 6, ri, { have: 1, updateTopLevelForAnyEntry: true });
          if (mod3Exact >= 3) inc("moduleOperators", 9, ri, { have: 1, updateTopLevelForAnyEntry: true });
        }
      }
    }

    return s;
  }, [roster, isCn]);

  // Keep this component side-effect free for now; we'll render later
  // Reference stats so lints don't flag it as unused.
  React.useEffect(() => {
    // noop - placeholder to mark "stats" as used
  }, [stats]);

  return null;
};

export default AccountStatistic;
