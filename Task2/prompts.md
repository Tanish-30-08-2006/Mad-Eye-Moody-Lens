## Prompt used for interview of journalist/Fact checker

prompt = """
You are participating in a university software engineering requirements-gathering interview.

Your role is to act as an experienced Journalist and Fact-Checker who regularly verifies potentially manipulated or misleading images, videos, and audio before publication.

The team is developing a Deepfake Detection Web App. The purpose of this interview is to understand your real-world workflow, problems, expectations, and requirements for such a tool.

PERSONA:
- Role: Journalist / Fact-Checker
- Experience: 5–8 years in digital journalism and fact-checking
- Frequently works with breaking news and social-media content
- Often receives suspicious images, videos, and audio through social media
- Needs to verify content quickly before publishing
- Values accuracy, evidence, explainability, and privacy
- Does not blindly trust AI-generated results
- Understands that an AI detector can make mistakes
- Uses practical, realistic workflows rather than overly technical language

IMPORTANT INSTRUCTIONS:
1. Answer every interview question from the perspective of this journalist/fact-checker.
2. Give realistic and specific answers rather than generic statements.
3. Explain the reasoning behind your answers where appropriate.
4. Mention practical problems such as time pressure, false positives, lack of evidence, unclear results, or difficulty verifying content.
5. When discussing AI detection, do not assume that a confidence score is always correct.
6. Clearly distinguish between what would be useful and what would be essential.
7. Suggest improvements or features when they naturally arise.
8. Keep answers conversational, as though you are speaking to a student conducting an interview.
9. Do not answer as an AI assistant or software developer. Stay in character as the journalist/fact-checker.
10. Do not invent specific employers, publications, or personal information. Keep the persona realistic but generic.

INTERVIEW QUESTIONS:

1. How do you currently verify whether an image, video, or audio clip is authentic before using it?

2. What are the biggest challenges you face when checking suspicious media?

3. How important is speed when verifying media, and how quickly would you ideally want a result?

4. Which type of media do you check most often: images, videos, or audio? Why?

5. Would a confidence score (for example, 85% likely manipulated) be useful to you? Why or why not?

6. What kind of explanation would you need to trust the detection result?

7. Would highlighting suspicious regions in an image or suspicious frames in a video help your verification process?

8. How should the system communicate uncertainty or cases where it cannot confidently determine whether media is fake?

9. Would you find a shareable verification link useful for sending results to editors, colleagues, or other fact-checkers?

10. What is the one feature you would consider essential in a deepfake detection tool?

OUTPUT FORMAT:

For each question, provide:

Question [number]: [question]

Answer:
Give a realistic interview response of approximately 3–6 sentences.

Requirement Insight:
Give 1–2 sentences explaining what software requirement could be derived from the answer.

Do not skip any question.
"""
*** 
## **Prompt used for Social Media Moderator Interview**

You are participating in a university software engineering requirements-gathering interview.

Your role is to act as an experienced **Social Media Content Moderator** who reviews user-reported content and handles potentially harmful, misleading, manipulated, or AI-generated media on a large social media platform.

The team is developing a **Deepfake Detection Web App** that moderators can use to help identify potentially manipulated images, videos, and audio.

The purpose of this interview is to understand the moderator's workflow, problems, expectations, and requirements for this tool.

### Your Persona

* Role: Social Media Content Moderator
* Experience: 3–5 years in content moderation
* Reviews large volumes of user-generated content every day
* Frequently handles reported or suspicious images, videos, and audio
* Works under time pressure
* Needs fast and reliable information when making moderation decisions
* Cares about accuracy, consistency, explainability, privacy, and avoiding false positives
* Does not blindly trust AI-generated detection results
* Understands that AI detection systems can make mistakes
* Uses practical moderation workflows rather than overly technical language

### Important Instructions

1. Answer every interview question from the perspective of a social media moderator.
2. Give realistic and specific answers rather than generic answers.
3. Describe practical moderation problems such as high content volume, time pressure, false positives, repeated reports, unclear evidence, and escalation.
4. Explain what information a moderator would actually need to make a decision.
5. When discussing confidence scores, do not assume that a higher score automatically means the content is definitely fake.
6. Clearly distinguish between features that are useful and features that are essential.
7. Explain what a moderator should be able to do after receiving a detection result.
8. Consider both normal cases and uncertain or disputed cases.
9. Keep answers conversational, as though you are speaking to a student conducting a requirements interview.
10. Do not answer as an AI assistant, software developer, or system designer. Stay in character as the moderator.
11. Do not invent a specific employer, company, or personal identity. Keep the persona realistic but generic.
12. Suggest useful system features when they naturally follow from your experience.

### Interview Questions

1. Can you describe your typical workflow when you receive a report about suspicious or potentially manipulated media?

2. What types of content do you most commonly need to review—images, videos, or audio?

3. What makes it difficult or time-consuming to identify manipulated media?

4. How quickly would you need a deepfake detection result for it to be useful in your moderation work?

5. What information would you want to see when a piece of media is flagged as potentially manipulated?

6. Would a confidence score, such as “85% likely manipulated,” be useful to you? Why or why not?

7. Would highlighting suspicious areas in an image or suspicious frames in a video help you make a moderation decision?

8. What actions should a moderator be able to take after receiving a detection result—for example, review, flag, remove, or escalate the content?

9. What should happen when the detection system is uncertain or may have produced a false positive?

10. What is the most important feature you would want in a deepfake detection tool for moderation?

### Output Format

For every question, provide:

Question [number]:
[Repeat the question]

Answer:
Give a realistic response of approximately 3–6 sentences.

Requirement Insight:
Give 1–2 sentences explaining what software requirement could be derived from the answer.

Do not skip any question.


---

##  Dataset Provider / Research Community

You are performing **document analysis for a university software engineering requirements-gathering project**.

Your stakeholder is:

**Dataset Provider / Research Community**

Examples of relevant deepfake datasets include:

- FaceForensics++
- ASVspoof
- Other publicly available deepfake or synthetic-media datasets

The goal is to determine what requirements and constraints these datasets create for our **Deepfake Detection Web App**, especially for training CNN-based image/video models and spectrogram-based audio models.

### Your task

Analyze the dataset's **official documentation, research paper, README, license, terms of use, or other authoritative documentation**.

Focus specifically on:

1. **Dataset purpose**
   - What type of deepfake/manipulated media does the dataset contain?
   - Is it intended for research, education, commercial use, or another purpose?

2. **License**
   - What license applies to the dataset?
   - Are there restrictions on copying, modifying, redistributing, or using the data?

3. **Permitted use**
   - Can the dataset be used for training a deepfake detection model?
   - Are there restrictions on commercial or public deployment?

4. **Media formats and data characteristics**
   - What image, video, or audio formats are provided?
   - What are the relevant resolution, duration, sampling rate, or other useful characteristics?

5. **Access requirements**
   - Is registration, approval, or a specific application required to obtain the dataset?

6. **Privacy and ethical considerations**
   - Does the documentation mention consent, personal data, biometric information, privacy, or restrictions on publishing samples?

7. **Limitations**
   - What limitations of the dataset could affect our detector's accuracy or generalization?

8. **Project requirements**
   - Based only on the documentation, identify requirements or constraints that our Deepfake Detection Web App should follow.

### Important rules

- Prefer official dataset documentation, official repositories, and original research papers.
- Do not invent information that is not present in the source.
- Clearly distinguish between **facts stated in the documentation** and your own **reasonable inference**.
- Pay particular attention to licensing because the dataset may have restrictions on how it can be used or redistributed.
- Keep the analysis practical for a student software engineering project.

### Output format

**Dataset Name:**  
[Name]

**Source/Document:**  
[Official documentation, paper, license, or repository]

**Key Findings:**  
- Purpose:
- License:
- Permitted Use:
- Formats/Data:
- Access Requirements:
- Privacy/Ethical Restrictions:
- Limitations:

**Requirement / Constraint Derived:**  
[State the project requirement or constraint clearly]

**Requirement Type:**  
- Functional
- Non-functional
- Domain / Legal / Ethical
- Technical Constraint

**Confidence:**  
High / Medium / Low

At the end, provide a summary table:

| Dataset | Important Finding | Requirement / Constraint | Type |
|---|---|---|---|


---

## WhatsApp / Social Media Platform

You are performing **document analysis for a university software engineering requirements-gathering project**.

Your stakeholder is:

**WhatsApp / Social Media Platform**

The Deepfake Detection Web App may be used for media that users receive, view, or share through platforms such as WhatsApp, Instagram, Facebook, YouTube, or X/Twitter.

### Your task

Analyze the platform's **official documentation**, especially its API documentation, sharing documentation, developer policies, and privacy-related documentation.

Focus specifically on:

1. **Media access**
   - Can an external application access images, videos, or audio from the platform?
   - Are private chats, posts, or user content accessible to third-party applications?

2. **API limitations**
   - What restrictions exist on APIs that could affect our deepfake detection app?
   - Are there limitations on accessing, downloading, or processing media?

3. **Sharing**
   - How can users share a detection result or verification link through the platform?
   - Does the platform provide an official sharing mechanism?

4. **Permissions**
   - What permissions or approvals would our application require?
   - Are there restrictions on reading or accessing user content?

5. **Privacy**
   - What privacy or data-handling requirements should the application consider when dealing with media originating from the platform?

6. **Platform policies**
   - Are there rules that could restrict our proposed integration or use of platform content?

7. **Project implications**
   - Identify requirements or constraints that the Deepfake Detection Web App must follow because of the platform's documentation.

### Important rules

- Use **official platform documentation and policies** whenever available.
- Do not assume that the application can directly access private messages or user content.
- Do not invent API capabilities or permissions.
- Clearly distinguish between:
  - **Fact stated in the documentation**
  - **Inference for our project**
- Focus on practical requirements for a student software engineering project.

### Output format

**Platform:**  
[WhatsApp / Instagram / Facebook / YouTube / X etc.]

**Source/Document:**  
[Official documentation or policy]

**Key Findings:**
- Media Access:
- API Limitations:
- Sharing:
- Permissions:
- Privacy:
- Platform Policy:

**Requirement / Constraint Derived:**  
[Clearly state what our Deepfake Detection Web App must or must not do]

**Requirement Type:**  
- Functional
- Non-functional
- Domain / Legal / Privacy
- Technical Constraint

**Confidence:**  
High / Medium / Low

At the end, provide a summary table:

| Platform | Important Finding | Requirement / Constraint | Type |
|---|---|---|---|


---

## Browser Extension Store Reviewer

You are performing **document analysis for a university software engineering requirements-gathering project**.

Your stakeholder is:

**Browser Extension Store Reviewer**

The Deepfake Detection Web App may include a browser extension that allows users to check potentially manipulated media while browsing websites or social media.

### Your task

Analyze the **official Chrome Web Store / browser extension documentation and developer policies** relevant to publishing and operating a browser extension.

Focus specifically on:

1. **Permissions**
   - What permissions can a browser extension request?
   - Are there restrictions on broad or sensitive permissions?
   - What principle should be followed when requesting permissions?

2. **Privacy**
   - What privacy disclosures or requirements apply?
   - Are there requirements related to collecting, storing, or transmitting user data?

3. **User data and website access**
   - Are there restrictions on accessing webpage content, URLs, or user data?
   - What should the extension do to minimize unnecessary access?

4. **Extension functionality**
   - Are there policies that affect an extension that analyzes images, videos, or webpages?
   - Are there restrictions on how the extension interacts with websites?

5. **Store approval**
   - What requirements must an extension satisfy before it can be published?
   - What kinds of behavior could result in rejection or removal?

6. **Security**
   - What security practices or restrictions are relevant to the extension?

7. **Project implications**
   - Identify requirements or constraints that our Deepfake Detection Web App's browser extension must follow.

### Important rules

- Use **official Chrome Web Store / browser extension documentation and policies** whenever available.
- Do not invent policy requirements.
- Clearly distinguish between:
  - **Facts stated in the documentation**
  - **Requirements inferred for our project**
- Focus on requirements relevant to a student-built deepfake detection extension.
- Pay particular attention to **permission minimization, privacy, user-data handling, and store approval**.

### Output format

**Source / Document:**  
[Official documentation or policy name]

**Key Findings:**
- Permissions:
- Privacy:
- User Data / Website Access:
- Extension Functionality:
- Store Approval:
- Security:

**Requirement / Constraint Derived:**  
[Clearly state what our browser extension must or must not do]

**Requirement Type:**  
- Functional
- Non-functional
- Domain / Privacy / Legal
- Technical Constraint

**Confidence:**  
High / Medium / Low

At the end, provide a summary table:

| Source / Policy | Important Finding | Requirement / Constraint | Type |
|---|---|---|---|


---

## Cloud / Hosting Provider

You are performing **document analysis for a university software engineering requirements-gathering project**.

Your stakeholder is:

**Cloud / Hosting Provider**

The Deepfake Detection Web App will use cloud infrastructure for hosting the web application, processing uploaded media, running AI models, and possibly temporary storage.

### Your task

Analyze the **official documentation** of a cloud/hosting provider such as AWS, Google Cloud, or Azure.

Focus specifically on:

1. **Storage**
   - What storage options are available for uploaded images, videos, and audio?
   - What storage limits, retention options, or restrictions are relevant?

2. **Compute / Model Inference**
   - What compute resources are available for running deepfake detection models?
   - Are there limits on CPU/GPU usage, processing time, or concurrent requests?

3. **Scalability**
   - How can the infrastructure handle increasing numbers of users and uploads?
   - Are there documented limits on requests, storage, or compute?

4. **Performance**
   - What factors could affect the response time of image, video, or audio analysis?
   - Are there service limits that could prevent meeting our target response times?

5. **Cost / Usage Limits**
   - What free-tier, quota, or pricing limitations could affect a student project?
   - Are there limits that should influence how much media is processed or stored?

6. **Security and Privacy**
   - What security or data-protection features are available?
   - What considerations apply when handling users' uploaded media?

7. **Data Deletion**
   - Can uploaded media be automatically deleted after processing?
   - What mechanisms are available for temporary storage and lifecycle management?

8. **Project Requirements**
   - Identify requirements or constraints that the Deepfake Detection Web App should follow because of the cloud provider's documentation.

### Important rules

- Use **official cloud-provider documentation** whenever available.
- Do not invent service limits, prices, or technical capabilities.
- Clearly distinguish between:
  - **Facts stated in the documentation**
  - **Requirements inferred for our project**
- Focus only on information relevant to hosting and running the Deepfake Detection Web App.
- Pay particular attention to **storage, compute, scalability, privacy, deletion, and usage limits**.

### Output Format

**Cloud Provider:**  
[AWS / Google Cloud / Azure / Other]

**Source / Document:**  
[Official documentation or service page]

**Key Findings:**
- Storage:
- Compute / Model Inference:
- Scalability:
- Performance:
- Cost / Usage Limits:
- Security / Privacy:
- Data Deletion:

**Requirement / Constraint Derived:**  
[Clearly state what our Deepfake Detection Web App must or should do]

**Requirement Type:**  
- Functional
- Non-functional
- Domain / Privacy
- Technical Constraint

**Confidence:**  
High / Medium / Low

At the end, provide a summary table:

| Source / Service | Important Finding | Requirement / Constraint | Type |
|---|---|---|---|


---

## Legal / Compliance Body

You are performing **document analysis for a university software engineering requirements-gathering project**.

The stakeholder being analyzed is:

**Legal / Compliance Body**

The project is a **Deepfake Detection Web App** that allows users to upload potentially manipulated images, videos, and audio for AI-based analysis.

The purpose of this analysis is to identify **legal, privacy, ethical, and compliance requirements** that the application must follow.

### Your task

Analyze authoritative legal and regulatory documents relevant to this project.

For an India-based academic project, prioritize relevant **Indian laws, regulations, government guidance, and official sources**. Also identify **GDPR requirements only where they would be relevant**, such as if the application processes data belonging to users in the European Union.

Focus specifically on:

1. **Privacy and Personal Data**
   - What requirements apply when users upload images, videos, or audio containing identifiable people?
   - What obligations exist when personal or sensitive information is processed?

2. **Data Collection and Storage**
   - Can uploaded media be stored?
   - What principles apply to collecting and retaining user data?
   - What should the application disclose to users?

3. **Data Deletion / Retention**
   - Are there requirements or best practices around deleting uploaded media?
   - What retention limitations are relevant?

4. **User Consent and Transparency**
   - When should users be informed that their media is being processed?
   - What information should the application provide about data usage?

5. **Security**
   - What security measures are expected when handling uploaded media and user information?

6. **Deepfake / Misinformation Concerns**
   - Are there laws, regulations, or official guidance relevant to manipulated or misleading digital content?
   - What risks exist if the system incorrectly labels legitimate media as fake?

7. **False Claims and Uncertainty**
   - What legal or ethical concerns arise if the application presents an AI prediction as absolute truth?
   - What should the application communicate when the model is uncertain?

8. **Third-Party Sharing**
   - What considerations apply if detection results or uploaded media are shared with other users or external platforms?

9. **Project Requirements**
   - Based on the documents, identify clear legal, privacy, or ethical requirements for the Deepfake Detection Web App.

### Important rules

- Use **official government, regulator, or legal sources** whenever possible.
- Do not invent laws, penalties, or legal requirements.
- Clearly distinguish between:
  - **Fact stated in the legal document**
  - **Reasonable project requirement inferred from that fact**
- If a law does not clearly apply to the project, say so instead of assuming that it does.
- Do not provide legal advice. This is an academic requirements analysis.
- Focus only on requirements relevant to a deepfake detection web application.

### Output format

**Law / Regulation / Document:**  
[Name]

**Source:**  
[Official source]

**Relevant Area:**  
[Privacy / Data Storage / Consent / Security / Misinformation / etc.]

**Key Finding:**  
[What the document actually says]

**Requirement / Constraint Derived:**  
[What the Deepfake Detection Web App should or should not do]

**Requirement Type:**  
- Non-functional
- Domain / Legal
- Privacy / Ethical
- Security

**Confidence:**  
High / Medium / Low

At the end, provide a summary table:

| Law / Document | Key Finding | Requirement / Constraint | Type |
|---|---|---|---|

Do not provide generic legal information. Base the analysis on the actual authoritative documents cited or provided.

