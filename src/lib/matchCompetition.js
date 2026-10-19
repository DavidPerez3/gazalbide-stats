export function filterMatchCompetition(matches, matchType = "league") {
  return matches.filter((match) => matchType === "all" ||
    (matchType === "friendly" ? match.is_friendly === true : match.is_friendly !== true));
}
