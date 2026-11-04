from typing import Any, Dict, Tuple

EXERCISE_WHITELIST: Dict[str, str] = {
    "squat": "Squat",
    "bicepCurl": "Bicep Curl",
}

RULE_WHITELIST: Dict[str, str] = {
    "depth": "squat depth below parallel (hip below knee)",
    "back": "upright torso posture (avoiding excessive forward lean)",
    "tempo": "controlled descent tempo (steady descent phase)",
    "range": "full range of motion contraction at the top",
    "extension": "full elbow extension at the bottom",
    "elbowDrift": "elbow position pinned to side (avoiding drift)",
    "swing": "torso stability (avoiding body sway and momentum)",
    "other": "other technique deviations",
}


def get_rule_description(rule_id: str) -> Tuple[str, str]:
    """
    Returns (safe_rule_id, description). Unknown rule IDs map to ('other', 'other technique deviations').
    """
    if rule_id in RULE_WHITELIST and rule_id != "other":
        return rule_id, RULE_WHITELIST[rule_id]
    return "other", RULE_WHITELIST["other"]


def build_system_instruction(language: str) -> str:
    lang_names = {
        "en": "English",
        "fr": "French",
        "ar": "Arabic",
    }
    lang_label = lang_names.get(language, "English")

    return (
        f"You are a strength training form coach. Write your entire response in {lang_label}.\n"
        "Guidelines:\n"
        "- Use ONLY the numbers and metrics provided in the prompt. Never invent numbers.\n"
        "- Give training form and movement technique advice only.\n"
        "- No medical advice, no injury diagnosis, and no clinical claims.\n"
        "- Be supportive, constructive, and concrete.\n"
        "- You must respond with JSON only matching the schema below without markdown code fences or HTML tags.\n\n"
        "JSON Schema:\n"
        "{\n"
        '  "summary": "string (max 400 chars)",\n'
        '  "strengths": ["string (max 200 chars, 1 to 2 items)"],\n'
        '  "issues": [\n'
        '    {\n'
        '      "rule": "exact rule id from top_issues (or empty list if no issues)",\n'
        '      "explanation": "string (max 250 chars)",\n'
        '      "tip": "string (max 250 chars)"\n'
        "    }\n"
        "  ],\n"
        '  "next_session": ["string (max 200 chars, 2 to 3 items)"],\n'
        '  "fatigue_note": "string (max 250 chars)"\n'
        "}\n"
    )


def build_user_prompt(stats: Dict[str, Any], language: str) -> str:
    """
    Builds the user prompt strictly from the computed stats dict.
    Contains NO session id, NO dates or timestamps, and NO free text from the DB.
    Replaces unknown rule IDs with 'other'.
    """
    lines = [
        "Workout Performance Analysis Data:",
        f"- Total Repetitions: {stats.get('total_reps', 0)}",
        f"- Overall Average Score: {stats.get('average_score', 0.0)}/100",
        f"- Workout Duration: {stats.get('duration_minutes', 0.0)} minutes",
    ]

    exercises = [
        EXERCISE_WHITELIST.get(ex, "Exercise")
        for ex in stats.get("exercises", [])
    ]
    lines.append(f"- Exercises Trained: {', '.join(exercises) if exercises else 'None'}")

    top_issues = stats.get("top_issues", [])
    if top_issues:
        lines.append("\nTop Form Issues Across Session:")
        for issue in top_issues:
            rule_key, desc = get_rule_description(issue.get("rule", ""))
            lines.append(
                f"  * {rule_key} ({desc}): {issue.get('count', 0)} reps ({issue.get('share', 0.0)}% of session volume)"
            )
    else:
        lines.append("\nTop Form Issues Across Session: None (clean execution across all reps)")

    sets = stats.get("sets", [])
    if sets:
        lines.append("\nSet-by-Set Performance:")
        for idx, s in enumerate(sets, 1):
            ex_name = EXERCISE_WHITELIST.get(s.get("exercise", ""), "Exercise")
            lines.append(f"\nSet #{idx} ({ex_name}):")
            lines.append(f"  - Reps: {s.get('reps', 0)}")
            lines.append(f"  - Average Score: {s.get('average_score', 0.0)}/100")
            lines.append(f"  - Best Rep Score: {s.get('best', 0)}/100")
            lines.append(f"  - Lowest Rep Score: {s.get('worst', 0)}/100")
            lines.append(f"  - Form Drop: {s.get('form_drop') if s.get('form_drop') is not None else 'N/A'}")
            lines.append(f"  - Fatigue Trend: {s.get('trend', 'insufficient')}")

            ranking = s.get("violation_ranking", [])
            if ranking:
                lines.append("  - Form Deviations in this Set:")
                for r in ranking:
                    rule_key, desc = get_rule_description(r.get("rule", ""))
                    lines.append(f"    * {rule_key} ({desc}): {r.get('count', 0)} count")
            else:
                lines.append("  - Form Deviations in this Set: None")

    lines.append(
        f"\nPlease provide a personalized coaching report in language code '{language}' following the JSON schema."
    )
    return "\n".join(lines)
