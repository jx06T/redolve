export interface PracticeSelectionCandidate { id: string | null }
export interface LatestPractice { question_id: string; result: string | null; answered_at: string | null }
const day = 86400000;
const randomUnit = () => (crypto.getRandomValues(new Uint32Array(1))[0] + 0.5) / 4294967296;

/** Weights belong to each question, so a one-question group cannot dominate a large pool. */
export function selectPracticeCandidates<T extends PracticeSelectionCandidate>(pool: T[], count: number,
  latest: LatestPractice[], recentQuestionIds: string[], now = Date.now(), random = randomUnit): T[] {
  const history = new Map(latest.map(attempt => [attempt.question_id, attempt]));
  const recent = new Map(recentQuestionIds.map((id, index) => [id, index]));
  const fresh: T[] = [], cooling: T[] = [];
  const age = (question: T) => {
    const date = history.get(question.id!)?.answered_at;
    return date ? Math.max(0, now - Date.parse(date)) : Infinity;
  };
  const weight = (question: T) => {
    const attempt = history.get(question.id!);
    if (attempt?.result === 'incorrect' && age(question) <= 30 * day) return 4;
    if (!attempt?.answered_at) return 2;
    return age(question) >= 7 * day ? 3 : 1;
  };
  for (const question of pool) (recent.has(question.id!) || age(question) < day ? cooling : fresh).push(question);
  // Exponential keys implement weighted sampling without replacement.
  const ranked = fresh.map(question => ({ question, key: -Math.log(random()) / weight(question) }))
    .sort((a, b) => a.key - b.key).map(entry => entry.question);
  if (ranked.length >= count) return ranked.slice(0, count);
  const fallback = cooling.map(question => ({ question, tie: random() })).sort((a, b) => {
    const aRecent = recent.get(a.question.id!), bRecent = recent.get(b.question.id!);
    if (aRecent !== undefined || bRecent !== undefined) {
      if (aRecent === undefined) return -1;
      if (bRecent === undefined) return 1;
      if (aRecent !== bRecent) return bRecent - aRecent;
    }
    return age(b.question) - age(a.question) || a.tie - b.tie;
  }).map(entry => entry.question);
  return [...ranked, ...fallback].slice(0, count);
}
