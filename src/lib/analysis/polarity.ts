// Issue identification, step 1: separate problems/requests from praise.
// Uses rating and sentiment when present; falls back to comment language.

const POSITIVE = /\b(easy|easier|helped|helpful|clear|clearer|useful|excellent|great|love|save[sd]?|saves|renewed|click(ed)?|hub|shorter|replaced|solved|quickly|understood|followed up|works well|fantastic|smooth)\b/i;
const REQUEST_OR_NEGATIVE = /\b(needs?|wish|want|please|can we|would like|would be|not enough|cannot|can't|could not|couldn't|fail\w*|broken|slow\w*|confus\w*|problem|harder|too (much|long|basic|rigid)|lost|wrong|stopped|blocking|missing|lack|almost gave up|surprised|charged|time out|freez\w*|expired|loop|drops?)\b/i;

export function classifyPolarity(text: string, rating5?: number, sentiment?: string): { polarity: "problem" | "praise"; reason: string } {
  const s = (sentiment ?? "").toLowerCase();
  if (s) {
    if (/pos/.test(s)) return { polarity: "praise", reason: `Sentiment column: ${sentiment}` };
    if (/neg/.test(s)) return { polarity: "problem", reason: `Sentiment column: ${sentiment}` };
  }
  const pos = POSITIVE.test(text);
  const neg = REQUEST_OR_NEGATIVE.test(text);
  if (rating5 != null) {
    if (rating5 <= 3) return { polarity: "problem", reason: `Rating ${fmt(rating5)}/5` };
    if (rating5 >= 4.5 && !(neg && !pos)) return { polarity: "praise", reason: `Rating ${fmt(rating5)}/5` };
    if (pos && !neg) return { polarity: "praise", reason: `Rating ${fmt(rating5)}/5 with positive language` };
    return { polarity: "problem", reason: `Rating ${fmt(rating5)}/5 but the comment asks for a change` };
  }
  if (pos && !neg) return { polarity: "praise", reason: "Positive language, no request" };
  return { polarity: "problem", reason: neg ? "Request or complaint language" : "No clear praise; treated as a request" };
}
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
