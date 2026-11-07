### Document Analysis: Chrome Web Store Developer Policies & Manifest V3 Guidelines

---

### Source / Document:
**Chrome Web Store Developer Program Policies (User Data Privacy, Quality, and Enforcement Policies)**

#### Key Findings:

*   **Permissions:**
    *   **Principle of Least Privilege:** Developers must only request the minimum permissions necessary to implement the extension's core functionality.
    *   **Broad Permissions Restrictions:** Requesting broad host permissions (e.g., `<all_urls>` or access to entire domains) is highly restricted. If requested, developers must provide a detailed, public justification during submission, and the extension willundergo a more rigorous manual review.
*   **Privacy:**
    *   **Privacy Policy Requirement:** Any extension that collects, transmits, or handles personal or sensitive user data (including web browsing activity, user-generated content, or media files) must post a comprehensive Privacy Policy in the Developer Console and provide a link to it on the store listing.
    *   **Data Minimization & Encryption:** Developers must minimize the collection of user data. Any sensitive data transmitted over the network must be encrypted using modern cryptographic protocols (HTTPS).
*   **User Data / Website Access:**
    *   **Access Limitations:** Extensions must not access webpage content or URLs unless directly related to the user-facing feature.
    *   **Consent & Disclosure:** If the extension sends images, videos, or URLs to an external server for analysis (e.g., a deepfake detection backend), this must be explicitly disclosed to the user, and the data must not be used for any secondary purposes (such as marketing or profiling).
*   **Extension Functionality:**
    *   **Single Purpose Policy:** The extension must have a single, narrow, and easy-to-understand purpose. It cannot bundle unrelated features (e.g., combining deepfake detection with an ad-blocker or a general media downloader).
*   **Store Approval:**
    *   **Review Process:** Extensions handling sensitive data or requesting broad host permissions are subject to deep manual reviews, which can delay publishing.
    *   **Rejection/Removal Triggers:** Extensions will be rejected or summarily removed if they engage in "surreptitious data collection," fail to declare data usage accurately in the developer console, or contain misleading metadata.
*   **Security:**
    *   **No Remotely Hosted Code:** Under Manifest V3, extensions are strictly prohibited from executing remotely hosted code (e.g., loading external JavaScript files or executing dynamic `eval()` statements). All code, including any machine learning librariesor utility scripts used for media analysis, must be packaged locally within the extension.

#### Requirement / Constraint Derived:
1.  **On-Demand Analysis via Context Menus:** To comply with the *Principle of Least Privilege*, the extension must not request permanent access to all webpage content (`<all_urls>`). Instead, it must use the `activeTab` permission combined with the `contextMenus` API. This allows the user to right-click a specific image or video to trigger the deepfake analysis, granting temporary access to only that specific active tab and media element.
2.  **Mandatory Privacy Policy & Data Disclosure:** The project must draft and host a public Privacy Policy. This policy must explicitly state that selected images/videos are securely transmitted to the Deepfake Detection Web App backend via HTTPS solely for analysis, and that no media files or user identifiers are stored permanently or shared with third parties.
3.  **Local Packaging of Libraries:** If the extension performs any client-side pre-processing (e.g., image resizing or local facedetection using TensorFlow.js), all library files must be bundled locally within the extension package. The extension cannot load these libraries from an external CDN.

#### Requirement Type:
*   Domain / Privacy / Legal (Privacy Policy, Data Disclosure)
*   Technical Constraint (Manifest V3, No Remotely Hosted Code, `activeTab` usage)

#### Confidence:
High

---

### Source / Document:
**Chrome Extensions API Reference & Manifest V3 Security Guidelines**

#### Key Findings:

*   **Permissions:**
    *   **`activeTab` Permission:** Recommended as an alternative to broad host permissions. It grants temporary host permission to the active tab in response to an explicit user gesture (e.g., clicking the extension's action icon or selecting a context menu option).
    *   **`declarativeNetRequest` vs. `fetch`:** If the extension needs to intercept or modify network requests to scan media on the fly, it must use the `declarativeNetRequest` API. However, for simple on-demand scanning, standard secure `fetch` requests to a declared backend API are permitted.
*   **Privacy:**
    *   **Data Declaration:** Developers must complete the "User Data Safety" section in the Chrome Web Store developer console, declaring exactly what data is collected (e.g., "Web history" if URLs are sent, or "User content" if images/videos are sent).
*   **User Data / Website Access:**
    *   **Content Scripts Isolation:** Content scripts run in an isolated world, meaning they can access the DOM of the webpage but cannot access the page's JavaScript variables or functions directly. This protects user data from being leaked to the host website's scripts.
*   **Extension Functionality:**
    *   **Interaction with Media Elements:** To analyze images or videos, the extension's content script must be able to read the `src` attribute of `<img>` and `<video>` tags, or capture canvas data. If cross-origin restrictions (CORS) prevent reading the media data directly from the DOM, the extension must handle these requests securely via the background service worker.
*   **Store Approval:**
    *   **Manifest Validation:** The extension's `manifest.json` must strictly adhere to Manifest V3 schema rules. Use of deprecated Manifest V2 features will result in immediate automated rejection.
*   **Security:**
    *   **Content Security Policy (CSP):** Manifest V3 enforces a strict default CSP. Developers cannot relax the CSP to allow external script execution. The `connect-src` directive must be configured to explicitly allow network connections only to the designated Deepfake Detection backend API URL.

#### Requirement / Constraint Derived:
1.  **Manifest V3 Compliance:** The extension must be built strictly on Manifest V3. The background logic must be implemented as aService Worker (`service-worker.js`), as persistent background pages are no longer supported.
2.  **Explicit CSP Declaration:** The `manifest.json` file must include a Content Security Policy that explicitly restricts network connections (`connect-src`) to the official domain of our Deepfake Detection Web App backend (e.g., `https://api.deepfakedetectionproject.edu`), ensuring no data can be leaked to unauthorized third-party endpoints.
3.  **CORS Handling for Media:** The extension's background service worker must handle fetching media files that are blocked by Cross-Origin Resource Sharing (CORS) on the host webpage, downloading the media securely before sending it to the detection backend.

#### Requirement Type:
*   Technical Constraint (Manifest V3 Architecture, CSP Configuration)
*   Functional (CORS Media Fetching, Service Worker implementation)

#### Confidence:
High

---

### Summary Table

| Source / Policy | Important Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **Chrome Web Store Developer Program Policies** | Principle of Least Privilege restricts broad host permissions (e.g., `<all_urls>`). | The extension must use `activeTab` and `contextMenus` to analyze media on-demand, rather than requesting permanent access to all websites. | Technical Constraint |
| **Chrome Web Store Developer Program Policies** | Mandatory Privacy Policy and secure transmission for sensitive user data (images/videos). | Must publish a Privacy Policy disclosing that media is sent via HTTPS to our backend solely for analysis, with no permanent storage. | Domain / Privacy / Legal |
| **Chrome Web Store Developer Program Policies** | Strict prohibition of remotely hosted code (Manifest V3). | All JavaScript libraries (e.g., for image processing or local ML) must be packaged locally within the extension; no CDN loading. | Technical Constraint |
| **Chrome Extensions Manifest V3 Guidelines** | Strict default Content Security Policy (CSP) and Service Worker architecture. | The extension must use a background Service Worker and explicitly declare the backend API domain in the `connect-src` CSP directive.| Technical Constraint |
| **Chrome Extensions API Reference** | Content scripts run in isolated worlds; CORS may block direct DOM media reading. | The background service worker must securely fetch cross-origin media elements when direct DOM access is blocked by host site CORS. | Functional |
