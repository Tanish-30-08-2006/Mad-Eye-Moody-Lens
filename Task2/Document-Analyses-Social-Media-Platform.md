**Platform:**
WhatsApp (Meta Developer Ecosystem)

**Source/Document:**
*   *Meta for Developers: WhatsApp Business Platform Cloud API Reference (Media Endpoint)*
*   *Meta Developer Policies (Platform Terms and Developer Policies)*
*   *WhatsApp Business Terms of Service & WhatsApp Encryption Overview*
*   *WhatsApp "Click to Chat" Developer Documentation*

---

### Key Findings

#### Media Access
*   **Fact:** Standard personal WhatsApp accounts do not have an open API for reading messages, chats, or media. All personal messages are end-to-end encrypted, meaning third-party applications cannot access private chats, posts, or user content directly from auser's personal app.
*   **Fact:** Through the *WhatsApp Business Platform (Cloud API)*, an external application can receive media (images, audio, video) *only* if a user explicitly sends that media to the application's registered WhatsApp Business phone number. The media is delivered to the application via a Webhook payload containing a temporary `media_id`.
*   **Inference for our project:** Our Deepfake Detection Web App cannot run as a background listener on a user's personal WhatsApp account to scan incoming media. Instead, it must operate either as a standalone web app where users manually upload media, or as a "chatbot" where users voluntarily forward suspicious media to our app's official WhatsApp Business number.

#### API Limitations
*   **Fact:** When a user sends media to the WhatsApp Business API, the webhook provides a `media_id`. To download the actual file, the app must query the `/v1/media/<MEDIA_ID>` endpoint to get a download URL. This retrieved download URL is highly temporary andexpires within a short window (typically 5 minutes).
*   **Fact:** The WhatsApp Business API enforces strict rate limits on concurrent media downloads and message sends, which vary based on the phone number's quality rating and messaging tier.
*   **Inference for our project:** Our backend must process or download the media immediately upon receiving the webhook. We cannot queue media downloads for later processing if the queue delay exceeds the 5-minute URL expiration window.

#### Sharing
*   **Fact:** WhatsApp does not provide an API that allows a third-party app to programmatically post directly to a user's personal status (Stories) or automatically send messages to their contacts without user intervention.
*   **Fact:** WhatsApp provides an official "Click to Chat" feature using custom URL schemes: `https://wa.me/?text=<URL_ENCODED_TEXT>` or `whatsapp://send?text=<URL_ENCODED_TEXT>`.
*   **Inference for our project:** To allow users to share deepfake detection results, our web app must generate a "Click to Chat"link. When clicked, this link will open the user's native WhatsApp app with a pre-filled message (e.g., *"I verified this video using the Deepfake Detector. Check the results here: [Link]"*), allowing the user to manually select which contacts or groups to share it with.

#### Permissions
*   **Fact:** To access the WhatsApp Business API, the project must be registered under a Meta Developer Account, associated with a verified Meta Business Manager, and pass Meta's App Review.
*   **Fact:** The application requires the `whatsapp_business_messaging` permission to receive webhooks and reply to users.
*   **Inference for our project:** For a student project, obtaining a fully verified Meta Business Manager and passing App Review may be a significant administrative bottleneck. Therefore, the project should utilize Meta's "Sandbox" environment (which allows testing with up to 5 registered developer phone numbers without full verification) for prototyping and grading.

#### Privacy
*   **Fact:** Meta Developer Policies (Section 4.a) require that developers must not sell, license, or purchase data obtained fromMeta APIs. Section 5 requires explicit, affirmative user consent before collecting or processing their data.
*   **Fact:** WhatsApp's Business Terms state that businesses are the data controllers for the messages they receive, meaning the business is legally responsible for complying with privacy regulations (like GDPR or CCPA) regarding the storage of user-submitted media.
*   **Inference for our project:** Our app must display a clear privacy policy and terms of service to the user before they uploador forward media. The app must not store the user's media permanently; it should be deleted immediately after the deepfake analysis is complete.

#### Platform Policies
*   **Fact:** Meta's Developer Policies strictly prohibit scraping, automated data collection, or using user data to build profiles or train machine learning models without explicit consent.
*   **Fact:** Meta prohibits using its APIs to facilitate spam, deceptive behavior, or misinformation.
*   **Inference for our project:** We must ensure our deepfake detection tool is framed as a utility for verification and truth, and we must not use the submitted user media to train our own deepfake detection models unless we implement an explicit, opt-in consent mechanism that complies with Meta's policies.

---

### Requirement / Constraint Derived

1.  **No Direct Chat Interception (Technical Constraint):** The Deepfake Detection Web App *must not* attempt to intercept, read, or scan private user-to-user WhatsApp chats, as this is technically blocked by end-to-end encryption and prohibited by Meta's policies.
2.  **Immediate Media Download (Technical Constraint):** The system *must* download the media file from the WhatsApp API endpoint within 5 minutes of receiving the webhook payload, before the temporary download URL expires.
3.  **Manual Sharing Mechanism (Functional Requirement):** The web app *must* generate a pre-formatted `https://wa.me/` URL containing the verification report link, enabling users to manually share the results with their WhatsApp contacts.
4.  **Sandbox Environment for Testing (Technical Constraint):** Due to Meta Business verification restrictions, the project's WhatsApp integration *must* be designed to run within the Meta Developer Sandbox environment for testing and demonstration purposes.
5.  **Data Minimization & Deletion (Domain / Legal / Privacy Requirement):** The application *must* delete all downloaded user media (images, audio, video) from its servers immediately after the deepfake analysis is completed and the result is generated.

---

### Requirement Type

*   **No Direct Chat Interception:** Technical Constraint
*   **Immediate Media Download:** Technical Constraint
*   **Manual Sharing Mechanism:** Functional
*   **Sandbox Environment for Testing:** Technical Constraint
*   **Data Minimization & Deletion:** Domain / Legal / Privacy

---

### Confidence
**High** (Based directly on Meta's official Cloud API documentation, WhatsApp Business Terms, and Meta Developer Policies).

---

### Summary Table

| Platform | Important Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **WhatsApp** | Private chats are end-to-end encrypted; no direct API access to personal messages. | The app **must not** attemptto intercept or read private user-to-user chats. | Technical Constraint |
| **WhatsApp** | Media download URLs retrieved via the Business API expire after 5 minutes. | The backend **must** download the media immediately upon receiving the webhook. | Technical Constraint |
| **WhatsApp** | No API exists to programmatically post to a user's personal contacts or status. | The app **must** use "Click to Chat" (`wa.me`) links to let users manually share results. | Functional |
| **WhatsApp** | Meta requires Business Verification and App Review for production API access. | The project **must** utilize the Meta Developer Sandbox for testing and grading. | Technical Constraint |
| **WhatsApp** | Meta policies and privacy laws require strict data handling and user consent. | The app **must** delete user media immediately after the deepfake analysis is complete. | Domain / Legal / Privacy |

