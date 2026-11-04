import json
from typing import Any, Dict, Optional
from app.reports.providers.base import BaseLLMProvider


class MockLLMProvider(BaseLLMProvider):
    def generate(
        self,
        system: str,
        prompt: str,
        language: str,
        stats: Optional[Dict[str, Any]] = None,
    ) -> str:
        # Build issues strictly from top_issues if present
        issues = []
        if stats and "top_issues" in stats:
            for item in stats["top_issues"][:2]:
                rule = item["rule"]
                issues.append({
                    "rule": rule,
                    "explanation": f"Observed minor technique deviations related to {rule}.",
                    "tip": f"Focus on maintaining proper alignment to avoid {rule} faults.",
                })

        avg_score = stats.get("average_score", 85.0) if stats else 85.0

        if language == "fr":
            payload = {
                "summary": f"Excellente séance d'entraînement complétée avec un score moyen de {avg_score}/100.",
                "strengths": [
                    "Excellente régularité et engagement musculaire sur les premières répétitions.",
                    "Contrôle constant de la trajectoire et rythme de travail maîtrisé.",
                ],
                "issues": issues,
                "next_session": [
                    "Intégrez un échauffement articulaire complet avant vos séries de travail.",
                    "Conservez une vitesse contrôlée sur l'ensemble des mouvements.",
                ],
                "fatigue_note": "Bonne endurance générale avec une légère baisse d'énergie en fin de séance.",
            }
        elif language == "ar":
            payload = {
                "summary": f"جلسة تمرين ممتازة بمتوسط أداء {avg_score}/100 وتحكم فني رائع.",
                "strengths": [
                    "أداء ثابت ومجهود ممتاز في التكرارات الأولى من كل مجموعة.",
                    "التحكم الجيد في مسار الحركة مع سرعة أداء متوازنة.",
                ],
                "issues": issues,
                "next_session": [
                    "احرص على الإحماء الحركي الجيد قبل بدء المجموعات الأساسية.",
                    "حافظ على التركيز والتحكم في الحركة عند الشعور بالإجهاد.",
                ],
                "fatigue_note": "مستوى لياقة وتحمل بدني جيد مع استقرار الأداء العام.",
            }
        else:
            payload = {
                "summary": f"Solid workout session completed with an average form score of {avg_score}/100.",
                "strengths": [
                    "Consistent movement control and solid pacing during opening repetitions.",
                    "Maintained proper form discipline and deliberate muscle engagement.",
                ],
                "issues": issues,
                "next_session": [
                    "Prioritize dynamic mobility warm-ups before lifting working weights.",
                    "Keep full focus on movement depth and joint alignment throughout every set.",
                ],
                "fatigue_note": "Good muscular endurance observed throughout the sets.",
            }

        return json.dumps(payload, ensure_ascii=False)
