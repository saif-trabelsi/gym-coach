from typing import Any, Dict, List
from app.reports.narrative import Narrative, NarrativeIssue

RULE_TIPS: Dict[str, Dict[str, Dict[str, str]]] = {
    "depth": {
        "en": {
            "explanation": "Squat depth remained above parallel on fatigued reps.",
            "tip": "Initiate the movement by sending hips back and down to reach below parallel.",
        },
        "fr": {
            "explanation": "La profondeur du squat est restée au-dessus de la parallèle.",
            "tip": "Descendez les hanches sous le niveau des genoux de façon fluide.",
        },
        "ar": {
            "explanation": "كان عمق القرفصاء أعلى من المستوى المتوازي في التكرارات المتعبة.",
            "tip": "ادفع الوركين للخلف والأسفل لتجاوز مستوى الركبتين.",
        },
    },
    "back": {
        "en": {
            "explanation": "Torso leaned forward excessively, putting extra strain on the lower back.",
            "tip": "Brace your core and keep your chest lifted throughout the lift.",
        },
        "fr": {
            "explanation": "Le buste penchait excessivement vers l'avant.",
            "tip": "Gainez la sangle abdominale et gardez la poitrine fière.",
        },
        "ar": {
            "explanation": "انحناء زائد في الجذع إلى الأمام أثناء الحركة.",
            "tip": "قم بشد عضلات البطن وارفع الصدر للأعلى دائماً.",
        },
    },
    "tempo": {
        "en": {
            "explanation": "Descent was rushed on several repetitions.",
            "tip": "Control the descent over at least 1.5 to 2 seconds.",
        },
        "fr": {
            "explanation": "Descente trop rapide observée sur plusieurs répétitions.",
            "tip": "Contrôlez la phase excentrique sur au moins 2 secondes.",
        },
        "ar": {
            "explanation": "نزول سريع وغير متحكم به في بعض التكرارات.",
            "tip": "تحكم في حركة النزول لمدة ثانيتين على الأقل.",
        },
    },
    "range": {
        "en": {
            "explanation": "Bicep curl did not reach full peak contraction at the top.",
            "tip": "Squeeze at the top of the curl to achieve full elbow flexion.",
        },
        "fr": {
            "explanation": "Flexion incomplète observée au sommet de la répétition.",
            "tip": "Contractez fermement les biceps en haut du mouvement.",
        },
        "ar": {
            "explanation": "عدم الوصول إلى أقصى انقباض في قمة حركة العضلة.",
            "tip": "اضغط بقوة في أعلى الحركة لتحقيق أقصى انقباض.",
        },
    },
    "extension": {
        "en": {
            "explanation": "Elbows did not fully extend at the bottom of the movement.",
            "tip": "Lower the weight all the way down before initiating the next rep.",
        },
        "fr": {
            "explanation": "Les coudes ne se sont pas complètement dépliés en bas.",
            "tip": "Étendez complètement les bras avant de remonter.",
        },
        "ar": {
            "explanation": "عدم فرد الذراعين بالكامل في أسفل الحركة.",
            "tip": "افرد الذراعين تماماً قبل بدء التكرار التالي.",
        },
    },
    "elbowDrift": {
        "en": {
            "explanation": "Elbows drifted forward away from your ribcage.",
            "tip": "Keep elbows pinned tightly against your sides.",
        },
        "fr": {
            "explanation": "Les coudes ont dérivé vers l'avant pendant le mouvement.",
            "tip": "Gardez les coudes collés aux côtes sans bouger.",
        },
        "ar": {
            "explanation": "تحرك الكوعين للأمام أو الابتعاد عن جانبي الجسم.",
            "tip": "ثبّت الكوعين بجانب الأضلاع بإحكام دون تأرجح.",
        },
    },
    "swing": {
        "en": {
            "explanation": "Torso swayed using momentum to move the weight.",
            "tip": "Stand tall, plant feet firmly, and isolate the arms without swinging.",
        },
        "fr": {
            "explanation": "Balancement du corps pour soulever la charge.",
            "tip": "Restez stable et immobile, utilisez uniquement les bras.",
        },
        "ar": {
            "explanation": "تأرجح الجذع واستخدام قوة الدفع لرفع الوزن.",
            "tip": "قف بثبات تام واستخدم قوة الذراعين فقط دون تأرجح.",
        },
    },
    "other": {
        "en": {
            "explanation": "Minor movement inconsistency noted.",
            "tip": "Maintain consistent cadence and joint tracking.",
        },
        "fr": {
            "explanation": "Légère irrégularité technique observée.",
            "tip": "Maintenez une cadence régulière.",
        },
        "ar": {
            "explanation": "ملاحظات بسيطة في اتساق الحركة.",
            "tip": "حافظ على إيقاع متوازن في جميع التكرارات.",
        },
    },
}


def build_fallback_narrative(stats: Dict[str, Any], language: str = "en") -> Narrative:
    """
    Builds a valid Narrative using static templates and dictionary tips in en, fr, or ar.
    Requires zero network calls.
    """
    lang = language if language in ("en", "fr", "ar") else "en"

    top_issues = stats.get("top_issues", [])
    has_issues = bool(top_issues)

    sets = stats.get("sets", [])
    has_declining = any(s.get("trend") == "declining" for s in sets)
    is_insufficient = bool(sets) and all(s.get("trend") == "insufficient" for s in sets)

    # 1. Summary
    if not has_issues:
        summaries = {
            "en": "Excellent workout session! Your form was consistent throughout with no major issues identified.",
            "fr": "Remarquable séance d'entraînement ! Votre technique était constante sans aucun défaut majeur.",
            "ar": "جلسة تمرين ممتازة! كان أداؤك ثابتاً طوال الجلسة دون أي أخطاء ملحوظة.",
        }
    elif has_declining:
        summaries = {
            "en": "Good workout completed, though form fatigued towards the end of your sets.",
            "fr": "Bon entraînement terminé, bien que la technique ait diminué vers la fin des séries.",
            "ar": "تم إكمال تمرين جيد، مع ملاحظة تراجع في الأداء نحو نهاية المجموعات.",
        }
    elif is_insufficient:
        summaries = {
            "en": "Short session recorded with solid form on completed repetitions.",
            "fr": "Courte séance enregistrée avec une technique solide sur les répétitions effectuées.",
            "ar": "جلسة قصيرة مسجلة بأداء قوي في التكرارات المكتملة.",
        }
    else:
        summaries = {
            "en": "Workout completed with solid effort. Review the technical feedback to refine your form.",
            "fr": "Entraînement terminé avec un bon effort. Consultez les conseils pour parfaire votre technique.",
            "ar": "تم إكمال التمرين بجهد جيد. راجع الملاحظات لتحسين الأداء الفني.",
        }
    summary = summaries[lang]

    # 2. Strengths (1 to 2 strings, each <= 200 chars)
    strengths_map = {
        "en": [
            "Maintained strong movement discipline and baseline control on early reps.",
            "Showed consistent pacing and dedicated effort throughout the workout.",
        ],
        "fr": [
            "Bonne régularité et engagement musculaire sur les premières répétitions.",
            "Contrôle constant de la trajectoire et rythme de travail maîtrisé.",
        ],
        "ar": [
            "أداء ثابت ومجهود ممتاز في التكرارات الأولى من كل مجموعة.",
            "التحكم الجيد في مسار الحركة مع سرعة أداء متوازنة.",
        ],
    }
    strengths = strengths_map[lang]

    # 3. Issues (0 to 2 items, only rules from top_issues)
    issues: List[NarrativeIssue] = []
    if has_issues:
        for item in top_issues[:2]:
            rule = item.get("rule", "other")
            rule_entry = RULE_TIPS.get(rule, RULE_TIPS["other"])[lang]
            issues.append(
                NarrativeIssue(
                    rule=rule,
                    explanation=rule_entry["explanation"],
                    tip=rule_entry["tip"],
                )
            )

    # 4. Next session (2 to 3 strings, each <= 200 chars)
    next_session_map = {
        "en": [
            "Perform a thorough dynamic warm-up targeting active joint mobility.",
            "Focus on controlled eccentric lowering on each repetition.",
        ],
        "fr": [
            "Effectuez un échauffement dynamique axé sur la mobilité articulaire.",
            "Concentrez-vous sur la phase excentrique contrôlée de chaque répétition.",
        ],
        "ar": [
            "احرص على الإحماء الحركي الجيد لمرونة المفاصل قبل التمرين.",
            "ركز على التحكم في حركة النزول في كل تكرار.",
        ],
    }
    next_session = next_session_map[lang]

    # 5. Fatigue note (<= 250 chars)
    if has_declining:
        fatigue_notes = {
            "en": "Form degradation occurred on later reps due to fatigue. Consider extending inter-set rest.",
            "fr": "La fatigue a dégradé la technique sur les dernières répétitions. Prévoyez plus de repos.",
            "ar": "ظهر أثر التعب في التكرارات الأخيرة. ننصح بزيادة وقت الراحة بين المجموعات.",
        }
    elif is_insufficient:
        fatigue_notes = {
            "en": "Fewer than 4 reps per set; not enough volume to calculate a reliable fatigue trend.",
            "fr": "Moins de 4 répétitions par série ; volume insuffisant pour calculer une tendance.",
            "ar": "أقل من 4 تكرارات في المجموعة؛ الحجم غير كافٍ لتحديد منحنى التعب بدقة.",
        }
    else:
        fatigue_notes = {
            "en": "Pacing and movement control remained stable and balanced across your sets.",
            "fr": "Le rythme et le contrôle du mouvement sont restés stables et équilibrés.",
            "ar": "كان الإيقاع والتحكم في الحركة متزناً ومستقراً عبر جميع المجموعات.",
        }
    fatigue_note = fatigue_notes[lang]

    return Narrative(
        summary=summary,
        strengths=strengths,
        issues=issues,
        next_session=next_session,
        fatigue_note=fatigue_note,
    )
