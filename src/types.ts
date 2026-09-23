export type Label =
  | 'apply_early'
  | 'real_opening'
  | 'crowded'
  | 'engagement_bait'
  | 'scam_risk'
  | 'unverified'
  | 'not_hiring';

export interface LinkInfo {
  href: string;
  text: string;
}

/** Raw data read from one rendered feed post. Lives only in memory. */
export interface PostData {
  /** `urn:li:activity:...` when available, otherwise a DOM-derived fallback. */
  id: string;
  text: string;
  /** Author headline, used only for company matching. Never stored. */
  authorHeadline: string;
  ageText: string | null;
  ageHours: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  links: LinkInfo[];
  /** Full addresses stay in memory; only derived domain types are ever stored. */
  emails: string[];
}

export interface Specificity {
  roleTitle: boolean;
  experience: boolean;
  techStack: boolean;
  location: boolean;
  salary: boolean;
  score: number;
}

export interface Exposure {
  ageHours: number | null;
  comments: number | null;
  reactions: number | null;
  reposts: number | null;
  commentsPerHour: number | null;
}

/**
 * Derived signals. Safe to store: no post text, names, profile URLs or
 * email addresses. Only hits from our own phrase lists and booleans.
 */
export interface Features {
  hiringKeywordHits: string[];
  jobContextHits: string[];
  seekerHits: string[];
  notHiringHits: string[];

  atsNames: string[];
  careersPage: boolean;
  googleForm: boolean;
  /** Links whose destination is hidden (lnkd.in). */
  opaqueLinks: number;
  shortenerLinks: number;
  whatsapp: boolean;
  telegram: boolean;
  corporateEmail: boolean;
  corporateEmailMatchesCompany: boolean;
  /** e.g. "gmail.com". A provider name, not an address. */
  freeEmailProvider: string | null;
  dmOnly: boolean;

  baitHits: string[];
  weakBaitHits: string[];
  scamHits: string[];
  payClaimHits: string[];

  posterAtCompany: boolean;
  specificity: Specificity;
  exposure: Exposure;
  ageText: string | null;
}

export type ModelQuestion = 'hiring' | 'bait' | 'scam';

/** Probability of the "positive" hypothesis for each question. */
export type ModelScores = Partial<Record<ModelQuestion, number>>;

export interface Decision {
  label: Label;
  reasons: string[];
}
