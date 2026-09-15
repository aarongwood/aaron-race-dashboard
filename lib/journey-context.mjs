const value = (input) => String(input ?? "").trim();
const numeric = (input) => Number.isFinite(Number(input)) ? Number(input) : 0;

function seconds(input) {
  const parts = value(input).split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function duration(input) {
  if (!Number.isFinite(input)) return "";
  const rounded = Math.round(Math.abs(input) * 10) / 10;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secondValue = rounded % 60;
  const precision = Number.isInteger(secondValue) ? 0 : 1;
  const secondText = secondValue.toFixed(precision).padStart(precision ? 4 : 2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secondText}` : `${minutes}:${secondText}`;
}

function daysBetween(left, right) {
  const start = Date.parse(`${left}T00:00:00Z`);
  const end = Date.parse(`${right}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : null;
}

function isPersonalRecord(record) {
  return Boolean(value(record.postRace?.prImprovement)) || /\bPR\b|best/i.test(value(record.postRace?.recordLabel));
}

function resultSummary(record) {
  return {
    slug: record.slug,
    name: record.race.name,
    date: record.race.date,
    distance: record.race.distance,
    courseType: record.race.courseType,
    time: value(record.postRace?.officialTime),
    pace: value(record.postRace?.officialPace),
    ageGroupPlace: numeric(record.postRace?.ageGroupPlace) || null,
    ageGroupSize: numeric(record.postRace?.ageGroupSize) || null,
    overallPlace: numeric(record.postRace?.overallPlace) || null,
    overallSize: numeric(record.postRace?.overallSize) || null,
    recordLabel: value(record.postRace?.recordLabel),
  };
}

function comparison(current, reference) {
  if (!reference) return null;
  const currentSeconds = seconds(current.postRace?.officialTime);
  const referenceSeconds = seconds(reference.postRace?.officialTime);
  if (currentSeconds === null || referenceSeconds === null) return null;
  const delta = referenceSeconds - currentSeconds;
  return {
    reference: resultSummary(reference),
    deltaSeconds: delta,
    delta: duration(delta),
    percent: referenceSeconds > 0 ? Math.abs(delta / referenceSeconds) * 100 : null,
    direction: delta > 0 ? "faster" : delta < 0 ? "slower" : "equal",
  };
}

function firstMilestone(records, predicate, current) {
  const first = records.find(predicate);
  return first?.slug === current.slug;
}

export function buildJourneyContexts(records) {
  const completed = records
    .filter((record) => record.postRace?.status === "final" && value(record.race?.date))
    .sort((left, right) => left.race.date.localeCompare(right.race.date));
  const contexts = new Map();

  for (let index = 0; index < completed.length; index++) {
    const current = completed[index];
    const throughCurrent = completed.slice(0, index + 1);
    const prior = completed.slice(0, index);
    const sameDistancePrior = prior.filter((record) => value(record.race.distance) === value(current.race.distance));
    const previousSameDistance = sameDistancePrior.at(-1) || null;
    const priorBestSameDistance = sameDistancePrior
      .filter((record) => seconds(record.postRace?.officialTime) !== null)
      .sort((left, right) => seconds(left.postRace.officialTime) - seconds(right.postRace.officialTime))[0] || null;
    const firstSameDistance = sameDistancePrior[0] || null;
    const next = completed[index + 1] || null;
    const winsToDate = throughCurrent.filter((record) => numeric(record.postRace?.ageGroupPlace) === 1).length;
    const podiumsToDate = throughCurrent.filter((record) => {
      const place = numeric(record.postRace?.ageGroupPlace);
      return place > 0 && place <= 3;
    }).length;
    const personalRecordsToDate = throughCurrent.filter(isPersonalRecord).length;
    const agePlace = numeric(current.postRace?.ageGroupPlace);
    const milestones = {
      firstRecordedRace: index === 0,
      firstRecordedPodium: firstMilestone(completed, (record) => {
        const place = numeric(record.postRace?.ageGroupPlace);
        return place > 0 && place <= 3;
      }, current),
      firstRecordedWin: firstMilestone(completed, (record) => numeric(record.postRace?.ageGroupPlace) === 1, current),
      firstAtDistance: sameDistancePrior.length === 0,
      newRecordedDistanceBest: Boolean(priorBestSameDistance && seconds(current.postRace?.officialTime) < seconds(priorBestSameDistance.postRace?.officialTime)),
      personalRecord: isPersonalRecord(current),
      ageGroupWin: agePlace === 1,
      ageGroupPodium: agePlace > 0 && agePlace <= 3,
    };

    contexts.set(current.slug, {
      raceNumber: index + 1,
      racesToDate: throughCurrent.length,
      racesBefore: prior.length,
      winsToDate,
      podiumsToDate,
      personalRecordsToDate,
      firstRecorded: resultSummary(completed[0]),
      current: resultSummary(current),
      previousRace: prior.length ? resultSummary(prior.at(-1)) : null,
      nextRace: next ? { ...resultSummary(next), daysLater: daysBetween(current.race.date, next.race.date) } : null,
      recentResults: throughCurrent.slice(-5).map(resultSummary),
      firstSameDistance: firstSameDistance ? resultSummary(firstSameDistance) : null,
      previousSameDistance: comparison(current, previousSameDistance),
      priorBestSameDistance: comparison(current, priorBestSameDistance),
      milestones,
    });
  }

  return contexts;
}

export function journeyNarrative(context) {
  if (!context) return null;
  const milestone = context.milestones;
  let headline = "Another chapter in the build";
  let change = "The result added another verified benchmark to the permanent record.";

  if (milestone.firstRecordedRace) {
    headline = "The starting point";
    change = "This is the first race in the preserved ledger—the baseline from which every later improvement can be measured.";
  } else if (milestone.firstRecordedWin) {
    headline = "The first recorded victory";
    change = "Aaron crossed from regular podium contender to recorded age-group winner. The competitive ceiling moved immediately.";
  } else if (milestone.ageGroupWin) {
    headline = "Winning becomes repeatable";
    change = `This was recorded age-group win number ${context.winsToDate}; victory was becoming a pattern rather than an isolated result.`;
  } else if (milestone.newRecordedDistanceBest || milestone.personalRecord) {
    headline = "A new performance level";
    change = "The clock established a faster recorded benchmark and tightened the definition of Aaron’s current ability.";
  } else if (milestone.ageGroupPodium) {
    headline = "The podium becomes familiar";
    change = `This brought the preserved podium count to ${context.podiumsToDate}, strengthening the evidence that Aaron could compete consistently inside his division.`;
  } else if (milestone.firstAtDistance) {
    headline = "The range expands";
    change = `This was the first preserved ${context.current.distance} result and established a new distance-specific baseline.`;
  }

  return { headline, change };
}
