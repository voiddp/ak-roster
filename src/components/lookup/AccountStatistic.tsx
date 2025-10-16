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

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
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

    // Loop through operators.json entries
    for (const [opId, opData] of Object.entries(operatorJson)) {
      if (!isOperatorVisible(opData, isCn)) continue;
      const rarityIndex = Math.max(0, Math.min(5, (opData.rarity ?? 1) - 1)); // 1-6 -> 0-5

      // Operators (counts by rarity)
      s.operators.entries[0].total![rarityIndex] += 1;
      s.rarity.entries[0].total![rarityIndex] += 1; // keep separate as requested

      const owned = !!roster[opId];
      if (owned) {
        s.operators.entries[0].have[rarityIndex] += 1;
        s.rarity.entries[0].have[rarityIndex] += 1;
      }

      // Potential (sum of potential slots vs owned potential levels)
      const totalPotentialSlots = opData.potentials?.length ?? 0;
      s.potential.entries[0].total![rarityIndex] += totalPotentialSlots;
      if (owned) s.potential.entries[0].have[rarityIndex] += roster[opId]!.potential ?? 0;

      // Elite1 & Elite2 availability vs owned state
      const hasE1 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 1);
      const hasE2 = !!opData.eliteLevels?.some((e) => e.eliteLevel >= 2);
      if (hasE1) s.elite1.entries[0].total![rarityIndex] += 1;
      if (hasE2) s.elite2.entries[0].total![rarityIndex] += 1;
      if (owned) {
        const elite = roster[opId]!.elite ?? 0;
        if (elite >= 1) s.elite1.entries[0].have[rarityIndex] += 1;
        if (elite >= 2) s.elite2.entries[0].have[rarityIndex] += 1;
      }

      // Skill Levels (total upgrades available vs owned upgrades)
      // JSON lists levels 2..7; we count how many upgrade steps exist (length), and how many the user has (skill_level - 1)
      const totalSkillUpgrades = opData.skillLevels?.length ?? 0;
      s.level.entries[0].total![rarityIndex] += totalSkillUpgrades;
      if (owned) s.level.entries[0].have[rarityIndex] += Math.max(0, (roster[opId]!.skill_level ?? 1) - 1);

      // Masteries totals (how many mastery steps exist on this operator)
      const masteryGoals = (opData.skillData ?? []).flatMap((sd) => sd.masteries ?? []);
      s.masteries.entries[0].total![rarityIndex] += masteryGoals.length;

      // Modules totals (how many module stages exist on this operator)
      const moduleStages = (opData.moduleData ?? []).reduce((acc, m) => {
        if (!m) return acc;
        if (!isCn && m.isCnOnly) return acc;
        return acc + (m.stages?.length ?? 0);
      }, 0);
      s.modules.entries[0].total![rarityIndex] += moduleStages;

      // Owned-only breakdowns
      if (owned) {
        const op = roster[opId]!;

        // Masteries owned: Count of skills at >=1 / >=2 / >=3
        const masteryLevels = Array.isArray(op.masteries) ? op.masteries : [];
        const m1Count = masteryLevels.filter((lvl) => lvl >= 1).length;
        const m2Count = masteryLevels.filter((lvl) => lvl >= 2).length;
        const m3Count = masteryLevels.filter((lvl) => lvl >= 3).length;

        // main spread (by rarity 1..6)
        s.masteries.entries[0].have[rarityIndex] += m1Count + m2Count + m3Count - (m2Count + m3Count) + (m2Count) + (m3Count);
        // Above line simplifies to m1Count + m2Count + m3Count but keeps intent clear
        s.masteries.entries[0].have[rarityIndex] += 0; // clarity

        // additional breakdown for rarities 4..6 only
        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4; // 4->0, 5->1, 6->2
          if (m1Count > 0) s.masteries.entries[1].have[ri] += m1Count;
          if (m2Count > 0) s.masteries.entries[2].have[ri] += m2Count;
          if (m3Count > 0) s.masteries.entries[3].have[ri] += m3Count;

          // masteryOperators: by operator flags
          if (m1Count > 0) s.masteryOperators.entries[1].have[ri] += 1;
          if (m2Count > 0) s.masteryOperators.entries[2].have[ri] += 1;
          if (m3Count > 0) s.masteryOperators.entries[3].have[ri] += 1;
          if (m3Count >= 2) s.masteryOperators.entries[6].have[ri] += 1;
          if (m3Count >= 3) s.masteryOperators.entries[9].have[ri] += 1;
        }

        // Modules owned: Count of module stages achieved across all modules
        const moduleLevels = Object.values(op.modules ?? {});
        const mod1Count = moduleLevels.filter((lvl) => lvl >= 1).length;
        const mod2Count = moduleLevels.filter((lvl) => lvl >= 2).length;
        const mod3Count = moduleLevels.filter((lvl) => lvl >= 3).length;

        s.modules.entries[0].have[rarityIndex] += mod1Count + mod2Count + mod3Count - (mod2Count + mod3Count) + mod2Count + mod3Count;
        s.modules.entries[0].have[rarityIndex] += 0; // clarity

        if (opData.rarity >= 4) {
          const ri = opData.rarity - 4;
          if (mod1Count > 0) s.modules.entries[1].have[ri] += mod1Count;
          if (mod2Count > 0) s.modules.entries[2].have[ri] += mod2Count;
          if (mod3Count > 0) s.modules.entries[3].have[ri] += mod3Count;

          if (mod1Count > 0) s.moduleOperators.entries[1].have[ri] += 1;
          if (mod2Count > 0) s.moduleOperators.entries[2].have[ri] += 1;
          if (mod3Count > 0) s.moduleOperators.entries[3].have[ri] += 1;
          if (mod3Count >= 2) s.moduleOperators.entries[6].have[ri] += 1;
          if (mod3Count >= 3) s.moduleOperators.entries[9].have[ri] += 1;
        }
      }
    }

    // Aggregate sums into the top-level have/total fields per key from their main (0) entry arrays
    const finalizeKey = (key: keyof StatsData) => {
      const e = s[key].entries[0];
      if (!e) return;
      const haveSum = sum(e.have);
      const totalSum = sum(e.total ?? []);
      s[key].have = haveSum;
      s[key].total = totalSum;
    };

    finalizeKey("operators");
    finalizeKey("rarity");
    finalizeKey("elite1");
    finalizeKey("elite2");
    finalizeKey("level");
    finalizeKey("masteries");
    finalizeKey("modules");
    finalizeKey("potential");

    // For operator-based breakdowns without a 0 entry, sum all entries arrays
    const finalizeOperatorKey = (key: "masteryOperators" | "moduleOperators") => {
      const entries = s[key].entries;
      const arrays = Object.values(entries).map((x) => x.have);
      const haveSum = arrays.reduce((acc, arr) => acc + sum(arr), 0);
      s[key].have = haveSum;
      s[key].total = 0; // totals not defined for these buckets
    };

    finalizeOperatorKey("masteryOperators");
    finalizeOperatorKey("moduleOperators");

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
