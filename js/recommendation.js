/* js/recommendation.js
   Transparent, rule-based weighted match engine. No machine learning model
   is used — every score can be traced back to the formula below. See
   README.md section 9 for the full explanation of the weights. */

const Recommendation = (function () {
  const WEIGHTS = {
    skills: 0.40,
    interest: 0.25,
    eligibility: 0.15,
    sector: 0.10,
    logistics: 0.10
  };

  function norm(str) {
    return (str || "").toString().trim().toLowerCase();
  }

  function skillsComponent(profileSkills, internshipSkills) {
    const required = (internshipSkills || []).map(norm);
    if (!required.length) return { fraction: 1, matched: [], missing: [] };
    const have = new Set((profileSkills || []).map(norm));
    const matched = [];
    const missing = [];
    (internshipSkills || []).forEach((s) => {
      if (have.has(norm(s))) matched.push(s);
      else missing.push(s);
    });
    return { fraction: matched.length / required.length, matched, missing };
  }

  function interestComponent(profileInterests, internshipInterests) {
    const tagged = (internshipInterests || []).map(norm);
    if (!tagged.length) return 1;
    const have = new Set((profileInterests || []).map(norm));
    const overlap = tagged.filter((t) => have.has(t)).length;
    return overlap / tagged.length;
  }

  function eligibilityComponent(profile, internship) {
    const minYear = parseInt(internship.minAcademicYear, 10);
    const studentYear = parseInt(profile.academicYear, 10);
    if (!minYear || isNaN(minYear)) return 1;
    if (!studentYear || isNaN(studentYear)) return 0.5; // unknown — neutral credit
    if (studentYear >= minYear) return 1;
    if (studentYear === minYear - 1) return 0.5;
    return 0;
  }

  function sectorComponent(profile, internship) {
    if (!profile.preferredSector) return 0.5; // no stated preference — neutral
    return norm(profile.preferredSector) === norm(internship.sector) ? 1 : 0;
  }

  function logisticsComponent(profile, internship) {
    let locationScore;
    if (!profile.preferredLocation) {
      locationScore = 0.7;
    } else if (norm(internship.locationType) === "remote") {
      locationScore = 1;
    } else if (norm(internship.location).indexOf(norm(profile.preferredLocation)) !== -1 ||
               norm(profile.preferredLocation).indexOf(norm(internship.location)) !== -1) {
      locationScore = 1;
    } else {
      locationScore = 0.15;
    }

    let durationScore;
    const pref = parseInt(profile.preferredDuration, 10);
    const actual = parseInt(internship.durationMonths, 10);
    if (!pref || isNaN(pref) || !actual || isNaN(actual)) {
      durationScore = 0.7;
    } else {
      const diff = Math.abs(pref - actual);
      if (diff === 0) durationScore = 1;
      else if (diff <= 1) durationScore = 0.7;
      else if (diff <= 2) durationScore = 0.4;
      else durationScore = 0.15;
    }

    return (locationScore + durationScore) / 2;
  }

  function buildExplanation(profile, internship, parts) {
    const bits = [];
    if (parts.matchedSkills.length) {
      bits.push(`your profile lists ${parts.matchedSkills.slice(0, 4).join(", ")}`);
    }
    if (profile.preferredSector && norm(profile.preferredSector) === norm(internship.sector)) {
      bits.push(`it's in your preferred ${internship.sector} sector`);
    }
    if (!bits.length) {
      return `This internship shares some overlap with your profile, but few of its listed skills currently match — consider it a stretch opportunity or a skill-building target.`;
    }
    return `Recommended because ${bits.join(" and ")}. ` +
      (parts.missingSkills.length
        ? `Skills to strengthen before applying: ${parts.missingSkills.slice(0, 4).join(", ")}.`
        : `Your listed skills cover everything this listing asks for.`);
  }

  function score(profile, internship) {
    const skillsResult = skillsComponent(profile.skills, internship.skills);
    const interestFrac = interestComponent(profile.interests, internship.interests);
    const eligibilityFrac = eligibilityComponent(profile, internship);
    const sectorFrac = sectorComponent(profile, internship);
    const logisticsFrac = logisticsComponent(profile, internship);

    const total =
      WEIGHTS.skills * skillsResult.fraction +
      WEIGHTS.interest * interestFrac +
      WEIGHTS.eligibility * eligibilityFrac +
      WEIGHTS.sector * sectorFrac +
      WEIGHTS.logistics * logisticsFrac;

    const parts = {
      matchedSkills: skillsResult.matched,
      missingSkills: skillsResult.missing
    };

    return {
      internshipId: internship.id,
      score: Math.round(total * 100),
      breakdown: {
        skills: Math.round(skillsResult.fraction * 100),
        interest: Math.round(interestFrac * 100),
        eligibility: Math.round(eligibilityFrac * 100),
        sector: Math.round(sectorFrac * 100),
        logistics: Math.round(logisticsFrac * 100)
      },
      matchedSkills: skillsResult.matched,
      missingSkills: skillsResult.missing,
      explanation: buildExplanation(profile, internship, parts)
    };
  }

  function rankAll(profile, internships) {
    return internships
      .map((internship) => Object.assign({}, internship, { match: score(profile, internship) }))
      .sort((a, b) => b.match.score - a.match.score);
  }

  return { WEIGHTS, score, rankAll };
})();
