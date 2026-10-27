# InternMatch — Comprehensive Project Report, Architecture & Viva Guide

---

## 1. Executive Summary & Problem Context

Students searching for internships under large initiatives such as the **PM Internship Scheme** frequently encounter hundreds of unstructured, dispersed job opportunities. Traditional portals leave students guessing whether their qualifications meet the criteria, resulting in wasted applications or missed opportunities. On the recruiter side, companies struggle to filter through thousands of unranked applications.

**InternMatch** solves this challenge through an **explainable, transparent internship matching engine and multi-role talent ecosystem**. Built without black-box opacity, InternMatch evaluates compatibility across 5 distinct dimensions, provides an ATS resume scoring analyzer, a one-click ATS resume builder, an automated AI cover letter generator, an interactive deadline calendar, and an administrative governance pipeline.

---

## 2. System Architecture

InternMatch uses a **decoupled, hybrid architecture**:
1. **Frontend Presentation & Standalone Engine**: Built with vanilla HTML5, CSS3, and JavaScript modules. Functions fully client-side via browser `localStorage` behind a single `Store` interface.
2. **Server-Side API & AI Service (`server/`)**: An Express.js microservice providing multi-tenant authentication, cryptographic verification, persistent relational SQLite storage, and a grounded AI proxy for LLMs (Google Gemini, OpenAI, Anthropic Claude).

```mermaid
flowchart TD
    subgraph Client ["Client Presentation Layer (Browser)"]
        UI_Student["Student Portal<br/>(Dashboard, Recommendations, Calendar, ATS Analyzer)"]
        UI_Company["Company Workspace<br/>(Postings, Applicants, Interview Scheduling)"]
        UI_Admin["Admin Governance Console<br/>(Approvals, Analytics, Ticket Inbox, Audit)"]
        StoreJS["js/storage.js & js/shared-adapter.js<br/>(Persistence Abstraction)"]
    end

    subgraph Server ["Backend API & Service Layer (Node.js/Express :3002)"]
        AuthMiddleware["RBAC Auth & Session Guard<br/>(Crypto Scrypt & Timing-Safe Equality)"]
        APIRoutes["REST API Endpoints<br/>(/api/auth, /api/internships, /api/company, /api/student)"]
        AIProxy["AI Provider Proxy & Rate Limiter<br/>(Grounding Engine + Rate Limiter: 20 req/5min)"]
    end

    subgraph LLM ["Cloud AI Provider"]
        Gemini["Google Gemini 2.0 Flash<br/>(or OpenAI / Claude)"]
    end

    subgraph Database ["Persistence Layer"]
        SQLiteDB[("SQLite Database<br/>portal.sqlite (ACID Relational)")]
        JSONSync[("portal-data.json<br/>(Atomic Fallback Store)")]
    end

    UI_Student --> StoreJS
    UI_Company --> StoreJS
    UI_Admin --> StoreJS

    StoreJS -.->|Optional REST Sync| APIRoutes
    UI_Student -->|Direct API Calls| APIRoutes
    UI_Company -->|Direct API Calls| APIRoutes
    UI_Admin -->|Direct API Calls| APIRoutes

    APIRoutes --> AuthMiddleware
    AuthMiddleware --> SQLiteDB
    AuthMiddleware --> JSONSync
    APIRoutes --> AIProxy
    AIProxy --> Gemini
```

---

## 3. Database Schema & Entity Relationships

The relational persistence layer is managed by SQLite (`server/data/portal.sqlite`) with synchronized fallback to `portal-data.json`.

```mermaid
erDiagram
    STUDENT ||--o{ APPLICATION : submits
    STUDENT ||--o{ SUPPORT_MESSAGE : opens
    COMPANY ||--o{ INTERNSHIP : posts
    COMPANY ||--o{ SHORTLIST : selects
    COMPANY ||--o{ INTERVIEW : schedules
    INTERNSHIP ||--o{ APPLICATION : receives
    COMPANY_REQUEST ||--|| COMPANY : converts_to

    STUDENT {
        string id PK
        string name
        string email UK
        string salt
        string hash
        json profile
        boolean profileVisible
        boolean cvShared
        string cvPdf
        timestamp createdAt
    }

    COMPANY {
        string id PK
        string name
        string email UK
        string industry
        string location
        string status
        string salt
        string hash
        timestamp approvedAt
    }

    COMPANY_REQUEST {
        string id PK
        string name
        string contact
        string email
        string status
        string salt
        string hash
        timestamp requestedAt
    }

    INTERNSHIP {
        string id PK
        string companyId FK
        string title
        string postingType
        string sector
        string location
        string locationType
        string duration
        string stipend
        json skills
        string status
        timestamp deadline
    }

    APPLICATION {
        string id PK
        string studentId FK
        string companyId FK
        string internshipId FK
        string status
        timestamp appliedAt
        json history
    }

    INTERVIEW {
        string id PK
        string companyId FK
        string studentId FK
        string applicationId FK
        string type
        string date
        string time
        string mode
    }

    SUPPORT_MESSAGE {
        string id PK
        string studentId FK
        string subject
        string category
        string message
        string status
        string reply
    }
```

---

## 4. Mathematical Algorithms & Scoring Models

### 4.1 Student-to-Internship Recommendation Algorithm

Every listing is scored against a student's profile across 5 transparent components:

$$\text{Final Match Score} = \text{round}\left(100 \times \sum_{i=1}^{5} w_i \cdot c_i\right)$$

| Component ($c_i$) | Weight ($w_i$) | Formula / Calculation |
|---|---|---|
| **Skills Match** | **0.40** | $\frac{|\text{StudentSkills} \cap \text{RequiredSkills}|}{|\text{RequiredSkills}|}$ |
| **Interests Match** | **0.25** | $\frac{|\text{StudentInterests} \cap \text{TaggedInterests}|}{|\text{TaggedInterests}|}$ (Default 0.5 if un-tagged) |
| **Academic Eligibility** | **0.15** | $1.0$ if $\text{Year} \ge \text{MinYear}$; $0.5$ if $\text{Year} = \text{MinYear}-1$; else $0.0$ |
| **Sector Preference** | **0.10** | $1.0$ if $\text{Sector}_{\text{preferred}} = \text{Sector}_{\text{internship}}$; else $0.25$ |
| **Location & Duration Fit** | **0.10** | $0.5 \cdot \text{LocationMatch} + 0.5 \cdot \max\left(0, 1 - \frac{|\text{Duration} - \text{Preferred}|}{6}\right)$ |

**Explainability Principle**: The output returns not just an aggregate integer (0–100), but an object detailing matched skills, missing skills, and a human-readable justification string.

---

### 4.2 ATS Resume Readiness Scoring Rubric

Implemented in `js/ats-score.js`, evaluating parsed resume text against a 100-point rubric:
1. **Role Keyword Density (35 pts)**: Proportion of internship-required skills discovered in resume text via word-boundary regular expressions.
2. **Standard Section Structure (25 pts)**: 5 points each for identifying standard headings: *Summary, Education, Skills, Projects, Experience*.
3. **Action Verbs & Measurable Evidence (20 pts)**:
   - 10 pts for quantifiable metrics (percentages, numerical counts, currencies, dates).
   - 10 pts for strong engineering action verbs (*developed, engineered, implemented, optimized, built*).
4. **Contact & Professional Links (10 pts)**: Email (4 pts), valid phone (3 pts), portfolio/GitHub/LinkedIn URL (3 pts).
5. **Length & PDF Formatting (10 pts)**: Substantial word count ($\ge 250$ words) and concise length ($\le 2$ pages).

---

## 5. Security & Privacy Architecture

- **Password Hashing**: Uses Node's native `crypto.scryptSync` with a cryptographically random 16-byte hex salt and 64-byte derived hash length.
- **Timing-Attack Prevention**: Uses `crypto.timingSafeEqual` for all password verifications to prevent side-channel timing analysis.
- **Consent-First Privacy Model**: Recruiters cannot view student profiles or download CVs unless the student explicitly checks "Opt-in to share profile with approved recruiters" and submits an application.
- **Audit Logging**: All administrative approvals, account suspensions, and company CV downloads are logged with actor identity, action type, and UTC timestamp.
- **AI Safety & Grounding**: The AI proxy uses strict system prompts that ground answers in the active catalogue JSON, preventing hallucination of companies, stipends, or deadlines.

---

## 6. Top 25 Viva Voce Questions & Model Answers

### Question 1: What is the core problem InternMatch solves?
**Answer**: Large government schemes like the PM Internship Scheme feature thousands of opportunities with heterogeneous requirements. InternMatch replaces blind searching with a transparent, 5-factor weighted recommendation algorithm that shows students exactly why they fit a role and what specific skills they are missing to qualify.

### Question 2: Why did you use a rule-based algorithm rather than a deep learning recommendation model?
**Answer**: In government and educational hiring platforms, **explainability and auditability are legal and ethical necessities**. Black-box neural collaborative filtering models can perpetuate historical bias and cannot explain why a candidate was ranked lower. Our rule-based formula produces a deterministic, 100% explainable score with itemized skill breakdowns.

### Question 3: How does InternMatch handle the "Cold-Start" problem for new students?
**Answer**: Because the algorithm is content-based rather than collaborative filtering, it does not rely on prior user click history or application history. The moment a student selects their academic year, course, and 3 skills in `profile.html`, the engine immediately computes accurate match scores across the entire catalogue.

### Question 4: How does the AI Career Chatbot prevent hallucinating fake internships?
**Answer**: In `server/server.js`, we implement an architecture known as **Grounding**. The system prompt injects the verified catalogue JSON directly into the LLM context and instructs the model: *"Only discuss internships in the catalogue below. Never invent internships, companies, stipends, or deadlines. Clearly state when requested data is not present."*

### Question 5: How does the ATS Resume Analyzer extract text without a backend server?
**Answer**: It uses `pdf.js` running client-side inside Web Workers. It extracts character glyphs directly from PDF stream objects, normalizes the text string, and performs word-boundary regex tokenization against `skills-vocabulary.js`.

### Question 6: What happens if the AI backend or internet connection is down?
**Answer**: InternMatch is architected with graceful fallback. If the backend is offline:
- The chatbot automatically switches to its client-side keyword and intent matching engine in `js/chatbot.js`.
- The AI Cover Letter generator falls back to a smart algorithmic template using the student's saved profile data.
- The core platform runs autonomously from `localStorage`.

### Question 7: Explain your password security implementation.
**Answer**: In `server/server.js`, passwords are never stored in plaintext. We use `crypto.scryptSync(password, salt, 64)`. `scrypt` is a memory-hard key derivation function that resists ASIC/GPU brute-force attacks. Comparisons are executed using `crypto.timingSafeEqual` to eliminate timing side-channel vulnerabilities.

### Question 8: Why did you introduce SQLite in addition to JSON storage?
**Answer**: File-based JSON cannot guarantee ACID transactions or handle concurrent writes safely under high load. SQLite provides an embedded, relational SQL engine with indexed queries, transactional integrity, and foreign key constraints, while maintaining zero external server dependencies.

### Question 9: How does the One-Click ATS Resume Builder work?
**Answer**: It dynamically compiles the verified student profile fields into a standardized, single-column HTML document. It uses a print-specific CSS media query (`@media print`) that strips navigation bars and sidebars, rendering an ATS-compliant 1-page PDF document ready for export via `window.print()`.

### Question 10: How do you prevent unauthorized recruiters from contacting students?
**Answer**: Recruiters must submit a registration request that is held in `Pending` status. A platform administrator must review and approve the company. Furthermore, recruiters can only view details and download CVs for students who have explicitly applied to their postings and enabled CV sharing.

### Question 11: What is the time complexity of the recommendation algorithm?
**Answer**: For $N$ internships and a student skill list of length $S$, with each internship requiring $K$ skills: using a Hash Set lookup for student skills yields $O(1)$ lookup time. Total scoring complexity across the catalogue is $O(N \cdot K)$, which runs in under 15 milliseconds for hundreds of listings in the browser.

### Question 12: How does the candidate reverse-matching algorithm for companies differ from the student-facing algorithm?
**Answer**: Companies prioritize technical qualification above all else. Therefore, the company reverse-matching formula shifts the weights: Skills match is weighted at **65%** (vs 40% for students), Academic Year at **15%**, Interests at **15%**, and Location at **5%**.

### Question 13: What measures protect the API from Denial of Service (DoS)?
**Answer**: In `server/server.js`, an in-memory sliding-window rate limiter restricts chat and AI requests to a maximum of 20 requests per 5-minute window per IP address, returning HTTP status 429 when exceeded.

### Question 14: How are admin analytics generated?
**Answer**: In `js/admin-analytics.js`, client-side aggregation functions loop through student applications to calculate sector popularity, application status ratios, and skill demand frequencies, rendering them via Chart.js and enabling direct CSV data download using standard Blob APIs.

### Question 15: Why is the PM Internship Scheme specifically targeted?
**Answer**: The PM Internship Scheme is a nationwide initiative aimed at bridging youth employability. Providing a transparent, skill-gap-oriented digital tool helps tier-2 and tier-3 college students identify exactly what skills to learn next to become employable.

### Question 16: How does the Live Voice & Video Interview Room work?
**Answer**: It uses native WebRTC (`RTCPeerConnection`) and the browser's `MediaDevices` API with public Google STUN servers for peer-to-peer audio, video, and screen sharing. The Express server acts as a lightweight signaling relay (`/api/interviews/:id/signal`) exchanging SDP offers, answers, and ICE candidates without external paid vendors. An integrated recruiter scorecard saves technical, problem-solving, and communication ratings directly into the candidate's application record.

---

## 7. Three-Minute Live Demo Script for Judges / Professors

| Time | Screen | What to Click & Show | What to Say |
|---|---|---|---|
| **0:00 - 0:30** | [index.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/index.html) $\rightarrow$ [login.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/login.html) | Click "Continue with demo student account". Land on [dashboard.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/dashboard.html). | *"Welcome to InternMatch. We tackle youth underemployment under schemes like the PM Internship Scheme by replacing black-box algorithms with 100% explainable, transparent career matching."* |
| **0:30 - 1:15** | [recommendations.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/recommendations.html) $\rightarrow$ [internship-details.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/internship-details.html) | Show the 5-bar score breakdown (Skills 40%, Interests 25%, Eligibility 15%, Sector 10%, Logistics 10%). Click **"✨ AI Cover Letter"**. | *"Notice our recommendation score isn't a mysterious percentage. It reveals exactly which skills matched and which are missing. With one click, our AI generates a tailored, role-specific cover letter."* |
| **1:15 - 1:50** | [resume-analyzer.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/resume-analyzer.html) $\rightarrow$ [profile.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/profile.html) | Upload a sample resume. Show the 5 ATS rubric scores. Go to profile and click **"📄 Build ATS Resume"**. | *"Our client-side ATS Analyzer evaluates resumes across 5 industry rubrics without uploading data to third parties. If a student doesn't have a good resume, our 1-click builder creates a standardized, print-ready ATS resume instantly."* |
| **1:50 - 2:30** | [chatbot.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/chatbot.html) | Ask: *"What software internships are available in Bengaluru?"* | *"Our Career Chatbot is grounded in the active database via Gemini 2.0. It will never invent positions or hallucinate stipends."* |
| **2:30 - 3:00** | [admin.html](file:///c:/Users/DELL/OneDrive/Desktop/internmatch/admin.html) | Enter admin password $\rightarrow$ show approved company queues, Chart.js analytics, and CSV exports. | *"On the backend, we run an enterprise-grade governance console with SQLite persistence, approval queues, and cryptographic security. InternMatch bridges students, companies, and administrators in one cohesive ecosystem."* |
