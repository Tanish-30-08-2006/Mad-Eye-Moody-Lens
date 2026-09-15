Question 1: How do you currently verify whether an image, video, or audio clip is authentic before using it?

Answer:
Well, right now, it's a pretty manual and fragmented process. I start with reverse image searches using tools like TinEye or Yandex to see if the image has appeared online before, which helps track down the original context. If I have the raw file, I'll check the EXIF metadata, though social media platforms usually strip that out. For videos, I use tools like InVID to break them down into keyframes and search those individually. Finally, I just use my eyes—looking for physical inconsistencies like weird shadows, unnatural blinking, or warped backgrounds.

Requirement Insight:
The system should integrate automated keyframe extraction for videos and basic metadata analysis to streamline the initial stages of the journalist's verification workflow.

***

Question 2: What are the biggest challenges you face when checking suspicious media?

Answer:
The absolute biggest challenge is time pressure; during breaking news, editors want to publish immediately, but thorough verification takes time. Another massive headache is compression. When a video gets shared on WhatsApp or Telegram, the quality drops so much that it's hard to tell if a visual glitch is a deepfake artifact or just compression noise. Plus, deepfakes are getting incredibly sophisticated, to the point where manual visual inspection just isn't enough anymore, and we currently lack reliable, accessible tools to analyze audio manipulation.

Requirement Insight:
The tool must be optimized to analyze highly compressed, low-resolution media files from social media platforms without generatingexcessive false positives.

***

Question 3: How important is speed when verifying media, and how quickly would you ideally want a result?

Answer:
Speed is incredibly important because news moves fast, but I will always choose accuracy over speed. If a tool gives me a wrong answer quickly, it's worse than useless because our publication's reputation is on the line. Ideally, I'd love an initial "triage" scan within 30 seconds to a minute to tell me if something warrants a deeper look. If a full, detailed analysis takes five minutes, I'm okay with that, as long as the wait yields actual, reliable evidence I can use.

Requirement Insight:
The system should implement a two-tiered processing model: a rapid initial screening (under 60 seconds) followed by an optional, in-depth forensic analysis.

***

Question 4: Which type of media do you check most often: images, videos, or audio? Why?

Answer:
Currently, I check images the most because they are the easiest to manipulate and spread rapidly on social media. However, manipulated videos—especially cheapfakes and deepfakes of politicians—are catching up fast and take much longer to debunk. Audio is the newest nightmare; we are seeing a massive rise in cloned voices used for political disinformation, and we have almost no reliable tools to verify them. So, while images are the most frequent, videos and audio are our biggest pain points right now.

Requirement Insight:
The web app must support multi-modal input (images, video, and audio formats) with specialized detection models for each media type.

***

Question 5: Would a confidence score (for example, 85% likely manipulated) be useful to you? Why or why not?

Answer:
Honestly, a bare confidence score is not very useful on its own, and it can actually be dangerous. If a tool tells me an image is "85% likely manipulated," my immediate question is: *why*? What triggered that 85%? Is it because of compression, or is there an actual GAN-generated pattern in the face? Without knowing the "why," I can't defend that percentage to my editor or our readers, so I'd never publish a story based solely on a score.

Requirement Insight:
The user interface must not present confidence scores in isolation; they must be accompanied by qualitative explanations of the contributing factors.

***

Question 6: What kind of explanation would you need to trust the detection result?

Answer:
I need concrete, forensic evidence that I can explain to a non-technical audience. For example, tell me if there are blending boundaries around a face, inconsistent lighting angles, or if the audio frequencies show signs of splicing. If the tool can say, "We detected a mismatch between the facial movement and the audio track at second 14," that is something I can actually work with. It bridges the gap between AI detection and traditional investigative journalism.

Requirement Insight:
The system must provide an "Explainable AI" (XAI) report detailing the specific forensic anomalies detected (e.g., lighting inconsistencies, audio-visual desync).

***

Question 7: Would highlighting suspicious regions in an image or suspicious frames in a video help your verification process?

Answer:
Yes, absolutely, that would be a game-changer for my workflow. If I'm looking at a five-minute video, I don't have time to analyzeevery single frame manually. If the tool can highlight, say, frames 120 to 150 and circle the area around the mouth where the deepfake model glitched, that saves me hours of work. It also gives me visual proof that I can include in our published fact-check to show our readers exactly how we reached our conclusion.

Requirement Insight:
The application must feature a visual overlay (like a heatmap or bounding box) on images and a timeline marker on videos to pinpoint detected anomalies.

***

Question 8: How should the system communicate uncertainty or cases where it cannot confidently determine whether media is fake?

Answer:
The system needs to be brutally honest and just say "Inconclusive" when it doesn't know. I would much rather the tool admit it can't tell than give me a false sense of security or a wild guess. It should also explain *why* it's uncertain—for instance, "Resolution too low to analyze" or "Too many compression artifacts." That way, I know I need to go back to traditional reporting methods to verify the piece, rather than relying on the software.

Requirement Insight:
The system must include an "Inconclusive" status state, accompanied by diagnostic feedback explaining the technical limitations preventing a confident analysis.

***

Question 9: Would you find a shareable verification link useful for sending results to editors, colleagues, or other fact-checkers?

Answer:
Yes, a shareable link would be incredibly useful, especially when I need to quickly show my editor or a fellow fact-checker what the tool found. However, this comes with a massive caveat regarding privacy and security. The media we analyze is often highly sensitive, embargoed, or exclusive, so these shareable links must be secure, password-protected, or restricted to our organization. We absolutely cannot have our uploaded files or the analysis results leaked to the public or indexed by search engines.

Requirement Insight:
The system must support secure, access-controlled sharing of analysis reports (e.g., via password protection or expiring links) while ensuring strict data privacy.

***

Question 10: What is the one feature you would consider essential in a deepfake detection tool?

Answer:
For me, the absolute essential feature is an exportable, plain-language "Evidence Report." It needs to be a PDF or a clean webpagethat summarizes the findings, shows the highlighted anomalies, and explains the technical terms in a way that my editors, lawyers,and readers can easily understand. If I can't defend the tool's findings in court or to our audience, the tool is useless to me. Having that clear, structured evidence trail is what turns a black-box AI tool into a reliable journalistic instrument.

Requirement Insight:
The system must generate a downloadable, user-friendly PDF report summarizing the forensic findings, visual evidence, and technical explanations.