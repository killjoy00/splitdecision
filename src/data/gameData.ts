import type { GameData } from '../engine/types.js';

export const GAME_DATA: GameData = {
  "schemaVersion": "0.2",
  "title": "Split Decision",
  "issues": [
    {
      "id": "witnesses",
      "name": "Witnesses",
      "abbr": "WIT",
      "description": "Preparation, credibility, examination, and impeachment."
    },
    {
      "id": "evidence",
      "name": "Evidence",
      "abbr": "EVI",
      "description": "Documents, exhibits, discovery, and admissibility."
    },
    {
      "id": "experts",
      "name": "Experts",
      "abbr": "EXP",
      "description": "Technical testimony, forensic analysis, and competing interpretations."
    },
    {
      "id": "judge",
      "name": "Judge",
      "abbr": "JUD",
      "description": "Motions, procedure, courtroom standing, and judicial persuasion."
    },
    {
      "id": "jury",
      "name": "Jury",
      "abbr": "JUR",
      "description": "Narrative, clarity, sympathy, and closing persuasion."
    },
    {
      "id": "case_law",
      "name": "Case Law",
      "abbr": "LAW",
      "description": "Precedent, statutory interpretation, briefing, and legal research."
    }
  ],
  "caseCards": [
    {
      "id": "C01",
      "title": "Corroboration",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "witnesses",
        "evidence"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C02",
      "title": "Corroboration",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "witnesses",
        "evidence"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C03",
      "title": "Specialist Testimony",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "witnesses",
        "experts"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C04",
      "title": "Specialist Testimony",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "witnesses",
        "experts"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C05",
      "title": "Witness Ruling",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "witnesses",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C06",
      "title": "Witness Ruling",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "witnesses",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C07",
      "title": "Compelling Testimony",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "witnesses",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C08",
      "title": "Compelling Testimony",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "witnesses",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C09",
      "title": "Impeachment Rule",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "witnesses",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C10",
      "title": "Impeachment Rule",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "witnesses",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C11",
      "title": "Forensic Analysis",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "evidence",
        "experts"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C12",
      "title": "Forensic Analysis",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "evidence",
        "experts"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C13",
      "title": "Motion in Limine",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "evidence",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C14",
      "title": "Motion in Limine",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "evidence",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C15",
      "title": "Demonstrative Exhibit",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "evidence",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C16",
      "title": "Demonstrative Exhibit",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "evidence",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C17",
      "title": "Evidentiary Precedent",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "evidence",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C18",
      "title": "Evidentiary Precedent",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "evidence",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C19",
      "title": "Expert Qualification",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "experts",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C20",
      "title": "Expert Qualification",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "experts",
        "judge"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C21",
      "title": "Explain the Science",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "experts",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C22",
      "title": "Explain the Science",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "experts",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C23",
      "title": "Expert Standard",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "experts",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C24",
      "title": "Expert Standard",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "experts",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C25",
      "title": "Jury Instructions",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "judge",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C26",
      "title": "Jury Instructions",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "judge",
        "jury"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C27",
      "title": "Dispositive Motion",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "judge",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C28",
      "title": "Dispositive Motion",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "judge",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C29",
      "title": "Theory of the Case",
      "form": "dual_issue",
      "action": "lead",
      "issues": [
        "jury",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 3 of your Firm markers there."
    },
    {
      "id": "C30",
      "title": "Theory of the Case",
      "form": "dual_issue",
      "action": "co_counsel",
      "issues": [
        "jury",
        "case_law"
      ],
      "rulesText": "Choose one printed Issue. Place 2 of your Firm markers, 1 of your partner's Firm markers, and 1 Joint Work marker there."
    },
    {
      "id": "C31",
      "title": "Key Witness",
      "form": "focus",
      "action": "choose",
      "issues": [
        "witnesses"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    },
    {
      "id": "C32",
      "title": "Critical Exhibit",
      "form": "focus",
      "action": "choose",
      "issues": [
        "evidence"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    },
    {
      "id": "C33",
      "title": "Decisive Expert",
      "form": "focus",
      "action": "choose",
      "issues": [
        "experts"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    },
    {
      "id": "C34",
      "title": "Pivotal Ruling",
      "form": "focus",
      "action": "choose",
      "issues": [
        "judge"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    },
    {
      "id": "C35",
      "title": "Persuasive Narrative",
      "form": "focus",
      "action": "choose",
      "issues": [
        "jury"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    },
    {
      "id": "C36",
      "title": "Controlling Precedent",
      "form": "focus",
      "action": "choose",
      "issues": [
        "case_law"
      ],
      "rulesText": "In the printed Issue, choose and resolve either Lead or Co-Counsel."
    }
  ],
  "specialties": [
    {
      "id": "cross_examiner",
      "name": "Cross-Examiner",
      "powerTiming": "before_issue_scores",
      "powerIssue": "witnesses",
      "power": "Before Witnesses scores, place 1 of your Firm markers in Witnesses.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Witnesses Lead Credits."
    },
    {
      "id": "evidence_specialist",
      "name": "Evidence Specialist",
      "powerTiming": "before_issue_scores",
      "powerIssue": "evidence",
      "power": "Before Evidence scores, place 1 of your Firm markers in Evidence.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Evidence Lead Credits."
    },
    {
      "id": "expert_coordinator",
      "name": "Expert Coordinator",
      "powerTiming": "before_issue_scores",
      "powerIssue": "experts",
      "power": "Before Experts scores, place 1 of your Firm markers in Experts.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Experts Lead Credits."
    },
    {
      "id": "bench_advocate",
      "name": "Bench Advocate",
      "powerTiming": "before_issue_scores",
      "powerIssue": "judge",
      "power": "Before Judge scores, place 1 of your Firm markers in Judge.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Judge Lead Credits."
    },
    {
      "id": "jury_advocate",
      "name": "Jury Advocate",
      "powerTiming": "before_issue_scores",
      "powerIssue": "jury",
      "power": "Before Jury scores, place 1 of your Firm markers in Jury.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Jury Lead Credits."
    },
    {
      "id": "appellate_scholar",
      "name": "Appellate Scholar",
      "powerTiming": "before_issue_scores",
      "powerIssue": "case_law",
      "power": "Before Case Law scores, place 1 of your Firm markers in Case Law.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Case Law Lead Credits."
    },
    {
      "id": "trial_lawyer",
      "name": "Trial Lawyer",
      "powerTiming": "when_resolving_case_card",
      "powerIssues": [
        "witnesses",
        "jury"
      ],
      "power": "When you resolve a Case card in Witnesses or Jury, place 1 additional Firm marker of your color in the chosen Issue.",
      "bonusPoints": 3,
      "bonus": "Hold at least 1 Witnesses and 1 Jury Lead Credit."
    },
    {
      "id": "technical_litigator",
      "name": "Technical Litigator",
      "powerTiming": "when_resolving_case_card",
      "powerIssues": [
        "evidence",
        "experts"
      ],
      "power": "When you resolve a Case card in Evidence or Experts, place 1 additional Firm marker of your color in the chosen Issue.",
      "bonusPoints": 3,
      "bonus": "Hold at least 1 Evidence and 1 Experts Lead Credit."
    },
    {
      "id": "motion_counsel",
      "name": "Motion Counsel",
      "powerTiming": "when_resolving_case_card",
      "powerIssues": [
        "judge",
        "case_law"
      ],
      "power": "When you resolve a Case card in Judge or Case Law, place 1 additional Firm marker of your color in the chosen Issue.",
      "bonusPoints": 3,
      "bonus": "Hold at least 1 Judge and 1 Case Law Lead Credit."
    },
    {
      "id": "generalist",
      "name": "Generalist",
      "powerTiming": "when_resolving_case_card",
      "power": "When you resolve a Case card, choose any Issue instead of an eligible printed Issue. Resolve the same action type. On a Focus card, first choose Lead or Co-Counsel, then choose any Issue.",
      "bonusPoints": 2,
      "bonus": "Your Lead Credits show at least 3 different Issues."
    },
    {
      "id": "team_builder",
      "name": "Team Builder",
      "powerTiming": "when_resolving_co_counsel",
      "power": "When you resolve Co-Counsel, place 1 additional Joint Work marker in that Issue.",
      "bonusPoints": 2,
      "bonus": "Both firms on your side have at least 17 Reputation before Specialty bonuses."
    },
    {
      "id": "closer",
      "name": "Closer",
      "powerTiming": "after_closing_reveal",
      "power": "After Closing Argument cards are revealed, move up to 2 of your Firm markers from unrevealed Issues to one revealed Issue.",
      "bonusPoints": 3,
      "bonus": "Hold at least 2 Closing Argument Lead Credits."
    }
  ],
  "issueOrder": [
    "witnesses",
    "evidence",
    "experts",
    "judge",
    "jury",
    "case_law"
  ]
};
