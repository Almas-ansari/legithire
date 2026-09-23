/**
 * Phrase lists. Contributors: add phrases in plain lowercase. Matching ignores
 * case, punctuation, quotes and hashtags, and works on whole words, so
 * `comment "interested"`, `Comment INTERESTED!` and `#comment interested` all
 * match "comment interested". Phrases go through the same normalization, so
 * writing "we're hiring" works too. Add a test in tests/phrases.test.ts.
 */

/** Stage 1: a post with none of these is "Not a Hiring Post" with no model call. */
export const HIRING_KEYWORDS = [
  'hiring',
  'we re hiring',
  'we are hiring',
  'now hiring',
  'looking for',
  'open position',
  'open positions',
  'open role',
  'open roles',
  'opening',
  'openings',
  'vacancy',
  'vacancies',
  'join our team',
  'join us',
  'apply',
  'apply now',
  'applications open',
  'jd',
  'job description',
  'ctc',
  'lpa',
  'walk in',
  'walkin',
  'immediate joiner',
  'immediate joiners',
  'notice period',
  'referral',
  'send your resume',
  'share your resume',
  'share your cv',
  'send your cv',
];

/** Stage 1: job-seeker posts. */
export const SEEKER_PHRASES = [
  'opentowork',
  'open to work',
  'i am looking for a job',
  'i m looking for a job',
  'i am looking for a new role',
  'i m looking for a new role',
  'i am looking for new opportunities',
  'i m looking for new opportunities',
  'i am actively looking',
  'i m actively looking',
  'actively seeking',
  'open to opportunities',
  'open to new opportunities',
  'seeking new opportunities',
  'looking for my next role',
  'looking for my next opportunity',
  'i was laid off',
  'i have been laid off',
  'i ve been laid off',
];

/** Stage 1: clear "I got hired / new job" announcements. */
export const NOT_HIRING_PHRASES = [
  'starting a new position',
  'started a new position',
  'i got hired',
  'i have been hired',
  'i ve been hired',
  'i got placed',
  'i have joined',
  'i ve joined',
  'excited to announce that i',
  'happy to share that i',
  'thrilled to share that i',
  'i got an offer',
  'i received an offer',
];

/** Engagement bait: asks for comments/likes/follows instead of applications. */
export const BAIT_PHRASES = [
  'comment interested',
  'comment yes',
  'comment done',
  'comment below',
  'comment link',
  'comment for the link',
  'comment to get the link',
  'comment below for referral',
  'comment for referral',
  'drop your email in the comments',
  'drop your email in comments',
  'drop your mail id',
  'drop your email id',
  'drop your email',
  'like and repost',
  'like and share',
  'like share',
  'repost for reach',
  'repost for better reach',
  'repost for maximum reach',
  'follow me',
  'must follow',
  'follow me for more',
  'tag 3 friends',
  'tag three friends',
  'tag your friends',
  'tag someone who',
  'inbox you',
  'i ll dm you',
  'i will dm you',
  'to get the link',
  'to receive the link',
];

/**
 * Weaker hints of bait. They do not decide anything alone; when a post has
 * one of these but no genuine apply channel, the bait model is consulted.
 */
export const WEAK_BAIT_WORDS = ['comment', 'comments', 'dm', 'inbox', 'repost', 'tag', 'follow'];

/** "DM me" style channels. */
export const DM_PHRASES = [
  'dm me',
  'dm us',
  'send me a dm',
  'send a dm',
  'drop a dm',
  'message me',
  'inbox me',
  'ping me',
  'reach out to me',
];

/**
 * Job-ish words. A scam phrase next to one of these makes a post count as a
 * (fake) job offer even without a hiring keyword ("earn from home, task based
 * earning...").
 */
export const JOB_CONTEXT_WORDS = [
  'job',
  'jobs',
  'work from home',
  'wfh',
  'part time',
  'earn',
  'earning',
  'earnings',
  'income',
  'opportunity',
  'payout',
];

/** Strong scam signals: any one of these means Scam Risk. */
export const SCAM_PHRASES = [
  'registration fee',
  'registration charges',
  'security deposit',
  'training fee',
  'training fees',
  'refundable fee',
  'refundable deposit',
  'processing fee',
  'joining fee',
  'pay to join',
  'aadhaar',
  'aadhar',
  'pan card',
  'bank details',
  'bank account details',
  'no interview',
  'without interview',
  'part time typing job',
  'typing job',
  'data entry work from home',
  'task based earning',
  'task based job',
  'guaranteed job',
  'job guarantee',
  '100 job guarantee',
];

/** Pay claims that are too good to be true. `reason` is shown to the user. */
export const PAY_CLAIM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\bearn(?:ing)?\s+(?:up\s*to\s+)?(?:₹|rs\.?|inr|\$|usd)\s?[\d,.]+\s*k?\s*(?:\/|per|a|daily|every)\s*(?:day|hour|hr|week)/i,
    reason: 'Promises daily/hourly earnings',
  },
  {
    pattern: /(?:[₹$]|\b(?:rs\.?|inr))\s?[\d,.]+\s*k?\s*(?:\/|per)\s*day\b/i,
    reason: 'Promises pay per day',
  },
  { pattern: /\bdaily\s+payout\b/i, reason: 'Promises daily payout' },
  { pattern: /\bearn\s+from\s+home\b/i, reason: 'Promises work-from-home earnings' },
];

/** Tech terms counted for specificity. */
export const TECH_TERMS = [
  'javascript', 'typescript', 'react', 'angular', 'vue', 'node', 'nodejs', 'next js', 'nextjs',
  'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot', 'kotlin', 'swift',
  'golang', 'rust', 'c++', 'csharp', 'dotnet', 'php', 'laravel', 'ruby', 'rails',
  'sql', 'mysql', 'postgres', 'postgresql', 'mongodb', 'redis', 'kafka', 'spark', 'hadoop',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'linux', 'devops',
  'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'llm', 'nlp', 'data science',
  'flutter', 'react native', 'android', 'ios', 'figma', 'salesforce', 'sap', 'tableau', 'power bi',
  'excel', 'selenium', 'graphql', 'microservices',
];

/** Role nouns counted for specificity. */
export const ROLE_TERMS = [
  'engineer', 'developer', 'programmer', 'architect', 'manager', 'analyst', 'designer',
  'scientist', 'intern', 'internship', 'consultant', 'executive', 'specialist', 'associate',
  'lead', 'director', 'sde', 'sde1', 'sde2', 'sde 1', 'sde 2', 'qa', 'tester', 'recruiter',
  'accountant', 'administrator', 'coordinator', 'officer', 'representative', 'technician',
  'writer', 'marketer', 'product owner', 'scrum master', 'full stack', 'fullstack', 'backend',
  'frontend', 'devops engineer', 'sre',
];

export const LOCATION_TERMS = [
  'remote', 'hybrid', 'onsite', 'on site', 'work from office', 'wfo', 'wfh', 'location',
  'bangalore', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi', 'new delhi', 'ncr',
  'gurgaon', 'gurugram', 'noida', 'chennai', 'kolkata', 'ahmedabad', 'kochi', 'jaipur',
  'indore', 'chandigarh', 'coimbatore', 'london', 'berlin', 'dublin', 'amsterdam', 'paris',
  'new york', 'san francisco', 'seattle', 'austin', 'boston', 'toronto', 'singapore', 'dubai',
  'sydney', 'usa', 'india', 'uk', 'europe',
];

export const SALARY_PATTERNS: RegExp[] = [
  /\bctc\b/i,
  /\blpa\b/i,
  /\bsalary\b/i,
  /\bstipend\b/i,
  /\bcompensation\b/i,
  /\bper\s+annum\b/i,
  /(?:[₹$€£]|\b(?:rs\.?|inr|usd))\s?\d[\d,.]*/i,
];

export const EXPERIENCE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s*(?:\+|-|–|to)?\s*(?:\d{1,2}\s*)?(?:years?|yrs?|yoe)\b/i,
  /\bfreshers?\b/i,
  /\bexperience\s*[:\-]/i,
  /\bentry[\s-]level\b/i,
];
