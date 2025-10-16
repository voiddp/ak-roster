import React from "react";
import operatorJson from "data/operators";
import { LookupData } from "util/hooks/useLookup";
import { OperatorData } from "types/operators/operator";
import { MAX_PROMOTION_BY_RARITY, MAX_LEVEL_BY_RARITY } from "util/changeOperator";

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

// Helper function to increment values in stats entries and top-level totals
function incrementStats(
  stats: StatsData,
  key: keyof StatsData,
  entryKey: number,
  index: number,
  value: number
) {
  const entry = stats[key].entries[entryKey];
  entry.have[index] += value;
  if (entry.total) {
    entry.total[index] += value;
  }
  
  // If this is the main entry (key 0), also increment top-level totals
  if (entryKey === 0) {
    stats[key].have += value;
    stats[key].total += value;
  }
}

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

    // Loop through operators.json entries
    for (const [opId, opData] of Object.entries(operatorJson)) {
      if (!isOperatorVisible(opData, isCn)) continue;
      const rarityIndex = Math.max(0, Math.min(5, (opData.rarity ?? 1) - 1)); // 1-6 -> 0-5

      // Operators (counts by rarity)
      incrementStats(s, "rarity", 0, rarityIndex, 1);

      const owned = !!roster[opId];
      if (owned) {
        incrementStats(s, "rarity", 0, rarityIndex, 1);
      }

      // Potential (sum of potential slots vs owned potential levels)
      const totalPotentialSlots = opData.potentials?.length ?? 0;
      incrementStats(s, "potential", 0, rarityIndex, totalPotentialSlots);
      if (owned) incrementStats(s, "potential", 0, rarityIndex, roster[opId]!.potential ?? 0);

      // Elite1 & Elite2 availability vs owned state
      const hasE1 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 1);
      const hasE2 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 2);
      if (hasE1) incrementStats(s, "elite1", 0, rarityIndex, 1);
      if (hasE2) incrementStats(s, "elite2", 0, rarityIndex, 1);
      if (owned) {
        const elite = roster[opId]!.elite ?? 0;
        if (elite >= 1) incrementStats(s, "elite1", 0, rarityIndex, 1);
        if (elite >= 2) incrementStats(s, "elite2", 0, rarityIndex, 1);
      }

      // Level count: count operators with max levels
      const maxPromotion = MAX_PROMOTION_BY_RARITY[opData.rarity];
      const maxLevel = MAX_LEVEL_BY_RARITY[opData.rarity][maxPromotion];
      incrementStats(s, "level", 0, rarityIndex, 1); // Total operators that can reach max level
      if (owned) {
        const op = roster[opId]!;
        const isMaxLevel = op.elite === maxPromotion && op.level === maxLevel;
        if (isMaxLevel) {
          incrementStats(s, "level", 0, rarityIndex, 1);
        }
      }

      // Masteries totals (how many mastery steps exist on this operator)
      const masteryGoals = (opData.skillData ?? []).flatMap((sd) => sd.masteries ?? []);
      incrementStats(s, "masteries", 0, rarityIndex, masteryGoals.length);

      // Modules totals (how many module stages exist on this operator)
      const moduleStages = (opData.moduleData ?? []).reduce((acc, m) => {
        if (!m) return acc;
        if (!isCn && m.isCnOnly) return acc;
        return acc + (m.stages?.length ?? 0);
      }, 0);
      incrementStats(s, "modules", 0, rarityIndex, moduleStages);

      // Owned-only breakdowns
      if (owned) {
        const op = roster[opId]!;

        // Masteries owned: Count unique skills at exactly 1, 2, 3
        const masteryLevels = Array.isArray(op.masteries) ? op.masteries : [];
        const m1Count = masteryLevels.filter((lvl) => lvl === 1).length;
        const m2Count = masteryLevels.filter((lvl) => lvl === 2).length;
        const m3Count = masteryLevels.filter((lvl) => lvl === 3).length;

        // main spread (by rarity 1..6) - total count of all mastery levels
        incrementStats(s, "masteries", 0, rarityIndex, m1Count + m2Count + m3Count);

        // additional breakdown for rarities 4..6 only
        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4; // 4->0, 5->1, 6->2
          if (m1Count > 0) incrementStats(s, "masteries", 1, ri, m1Count);
          if (m2Count > 0) incrementStats(s, "masteries", 2, ri, m2Count);
          if (m3Count > 0) incrementStats(s, "masteries", 3, ri, m3Count);

          // masteryOperators: by operator flags
          if (m1Count > 0) incrementStats(s, "masteryOperators", 1, ri, 1);
          if (m2Count > 0) incrementStats(s, "masteryOperators", 2, ri, 1);
          if (m3Count > 0) incrementStats(s, "masteryOperators", 3, ri, 1);
          if (m3Count >= 2) incrementStats(s, "masteryOperators", 6, ri, 1);
          if (m3Count >= 3) incrementStats(s, "masteryOperators", 9, ri, 1);
        }

        // Modules owned: Count unique module stages at exactly 1, 2, 3
        const moduleLevels = Object.values(op.modules ?? {});
        const mod1Count = moduleLevels.filter((lvl) => lvl === 1).length;
        const mod2Count = moduleLevels.filter((lvl) => lvl === 2).length;
        const mod3Count = moduleLevels.filter((lvl) => lvl === 3).length;

        // main spread (by rarity 1..6) - total count of all module levels
        incrementStats(s, "modules", 0, rarityIndex, mod1Count + mod2Count + mod3Count);

        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4;
          if (mod1Count > 0) incrementStats(s, "modules", 1, ri, mod1Count);
          if (mod2Count > 0) incrementStats(s, "modules", 2, ri, mod2Count);
          if (mod3Count > 0) incrementStats(s, "modules", 3, ri, mod3Count);

          if (mod1Count > 0) incrementStats(s, "moduleOperators", 1, ri, 1);
          if (mod2Count > 0) incrementStats(s, "moduleOperators", 2, ri, 1);
          if (mod3Count > 0) incrementStats(s, "moduleOperators", 3, ri, 1);
          if (mod3Count >= 2) incrementStats(s, "moduleOperators", 6, ri, 1);
          if (mod3Count >= 3) incrementStats(s, "moduleOperators", 9, ri, 1);
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
